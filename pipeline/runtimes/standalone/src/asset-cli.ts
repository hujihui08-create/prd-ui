import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AssetBriefSchema,
  AssetReviewRunSchema,
  DEFAULT_SOURCE_POLICY,
  SourcePolicySchema,
  VisualStyleSchema,
  parsePricingConfig,
  preflightAssetBriefs,
  redactValue,
  resolvePricing,
  runAssetReview,
  toAssetManifest,
  toManifestReview,
  validateProviderEnv,
  type AssetBrief,
  type ArtifactStorePort,
  type AssetReviewerPort,
  type ReviewPricing,
  type SourcePolicy,
  type VisualStyle,
} from "@prd-ui/asset-review";
import { AssetManifestSchema } from "@prd-ui/contracts";
import { createRunId, loadProjectConfig } from "@prd-ui/orchestrator";
import { FileArtifactStore } from "./asset/artifact-store.js";
import { LibrarySourceAdapter, loadLibraryIndex } from "./asset/library-source.js";
import { modelReviewerFromEnv } from "./asset/model-reviewer.js";
import { RenderingReviewer } from "./asset/rendering-reviewer.js";
import { ScriptedReviewer, loadScriptedReviews } from "./asset/scripted-reviewer.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export const USAGE = `Usage: pnpm asset:review [options]

Options:
  --project <path>           Project YAML (default: samples/projects/employee-app/project.yaml)
  --assets <dir>             Asset briefs + library (default: samples/assets/m0)
  --profile <name>           Design profile (default: the project's only manifest profile)
  --runtime standalone|dsh   Execution adapter (default: standalone)
  --reviewer scripted|model  Standalone reviewer (default: scripted)
  --runs <dir>               Directory that receives run artifacts
  --only <assetId>           Run only one asset (repeatable)
  --dry-run                  Resolve brief/source/gate only; no reviewer, no freeze
  --fail-fast                Stop the batch on the first reviewer error
  --budget-usd <n>           Per-asset producer cost cap (not the review budget)
  --budget-minutes <n>       Per-asset time cap
  --max-review-cost-cny <n>  Global review cost cap in CNY (default: 10 for dsh)
  --allow-unknown-cost       Continue when review usage is incomplete
  --pricing <path>           Pricing file (default: <assets>/pricing.json or pipeline/pricing.json)
  -h, --help                 Print this help and exit`;

export interface AssetCliOptions {
  projectPath: string;
  assetsDir: string;
  runsDir: string;
  runtime: "standalone" | "dsh";
  reviewer: "scripted" | "model";
  profile?: string;
  only: string[];
  dryRun: boolean;
  failFast: boolean;
  maxCostUsd?: number;
  maxMinutes?: number;
  maxReviewCostCny?: number;
  allowUnknownCost: boolean;
  pricingPath?: string;
  help: boolean;
}

export class AssetCliUsageError extends Error {}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new AssetCliUsageError(`missing value for ${flag}`);
  }
  return value;
}

function parseNumber(flag: string, value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new AssetCliUsageError(`invalid value for ${flag}: ${value}`);
  }
  return number;
}

export function parseArgs(argv: string[]): AssetCliOptions {
  const options: AssetCliOptions = {
    projectPath: path.join(pipelineRoot, "samples", "projects", "employee-app", "project.yaml"),
    assetsDir: path.join(pipelineRoot, "samples", "assets", "m0"),
    runsDir: path.join(pipelineRoot, "runs"),
    runtime: "standalone",
    reviewer: "scripted",
    only: [],
    dryRun: false,
    failFast: false,
    allowUnknownCost: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    const equals = argument.indexOf("=");
    const flag = argument.startsWith("--") && equals > 0 ? argument.slice(0, equals) : argument;
    const inlineValue =
      argument.startsWith("--") && equals > 0 ? argument.slice(equals + 1) : undefined;
    const value = (): string => inlineValue ?? readValue(argv, ++index, flag);

    switch (flag) {
      case "--project":
        options.projectPath = path.resolve(value());
        break;
      case "--assets":
        options.assetsDir = path.resolve(value());
        break;
      case "--runs":
        options.runsDir = path.resolve(value());
        break;
      case "--profile":
        options.profile = value();
        break;
      case "--runtime": {
        const runtime = value();
        if (runtime !== "standalone" && runtime !== "dsh") {
          throw new AssetCliUsageError(`--runtime must be standalone or dsh, got ${runtime}`);
        }
        options.runtime = runtime;
        break;
      }
      case "--reviewer": {
        const reviewer = value();
        if (reviewer !== "scripted" && reviewer !== "model") {
          throw new AssetCliUsageError(`--reviewer must be scripted or model, got ${reviewer}`);
        }
        options.reviewer = reviewer;
        break;
      }
      case "--only":
        options.only.push(value());
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--fail-fast":
        options.failFast = true;
        break;
      case "--budget-usd":
        options.maxCostUsd = parseNumber(flag, value());
        break;
      case "--budget-minutes":
        options.maxMinutes = parseNumber(flag, value());
        break;
      case "--max-review-cost-cny":
        options.maxReviewCostCny = parseNumber(flag, value());
        break;
      case "--allow-unknown-cost":
        options.allowUnknownCost = true;
        break;
      case "--pricing":
        options.pricingPath = path.resolve(value());
        break;
      default:
        throw new AssetCliUsageError(`unknown argument: ${argument}`);
    }
  }

  if (options.maxReviewCostCny === undefined && options.runtime === "dsh") {
    options.maxReviewCostCny = 10;
  }

  return options;
}

async function loadBriefs(assetsDir: string): Promise<AssetBrief[]> {
  const briefsDir = path.join(assetsDir, "briefs");
  const files = (await readdir(briefsDir)).filter((file) => file.endsWith(".json")).sort();
  const briefs: AssetBrief[] = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(briefsDir, file), "utf8")) as unknown;
    const items = Array.isArray(raw) ? raw : [raw];
    for (const item of items) briefs.push(AssetBriefSchema.parse(item));
  }
  return briefs;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readOptionalJson(file: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`INVALID_JSON: ${file}: ${errorMessage(error)}`);
  }
}

async function loadStyle(assetsDir: string): Promise<VisualStyle> {
  const file = path.join(assetsDir, "style.json");
  try {
    const raw = await readOptionalJson(file);
    if (raw === undefined) return { id: "b-mobile" };
    return VisualStyleSchema.parse(raw);
  } catch (error) {
    throw new Error(`INVALID_STYLE: ${file}: ${errorMessage(error)}`);
  }
}

async function loadPolicy(assetsDir: string): Promise<SourcePolicy> {
  const file = path.join(assetsDir, "source-policy.json");
  try {
    const raw = await readOptionalJson(file);
    if (raw === undefined) return DEFAULT_SOURCE_POLICY;
    return SourcePolicySchema.parse(raw);
  } catch (error) {
    throw new Error(`INVALID_SOURCE_POLICY: ${file}: ${errorMessage(error)}`);
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function loadPricing(
  assetsDir: string,
  explicitPath?: string
): Promise<ReviewPricing> {
  const override = path.join(assetsDir, "pricing.json");
  const file =
    explicitPath ??
    ((await fileExists(override)) ? override : path.join(pipelineRoot, "pricing.json"));

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`INVALID_PRICING: ${file}: ${errorMessage(error)}`);
  }
  const config = parsePricingConfig(raw, file);
  return resolvePricing(config, process.env.PRD_UI_VISION_MODEL);
}

async function createReviewer(assetsDir: string, options: AssetCliOptions): Promise<AssetReviewerPort> {
  if (options.runtime === "dsh" || options.reviewer === "model") {
    validateProviderEnv();
  }
  if (options.runtime === "dsh") {
    const { createDshAssetReviewer } = await import("@prd-ui/runtime-dsh/adapter");
    return createDshAssetReviewer();
  }
  if (options.reviewer === "model") {
    return modelReviewerFromEnv();
  }
  const file = path.join(assetsDir, "scripted-reviews.json");
  try {
    return new ScriptedReviewer(await loadScriptedReviews(file));
  } catch (error) {
    throw new Error(
      `SCRIPTED_REVIEWS_MISSING: ${file} (${error instanceof Error ? error.message : String(error)})`
    );
  }
}

interface SafeParser<T> {
  safeParse(
    value: unknown
  ): { success: true; data: T } | { success: false; error: { message: string } };
}

/** Reject a contract violation at the CLI boundary instead of writing bad JSON. */
export function assertContract<T>(
  schema: SafeParser<T>,
  value: unknown,
  label: string
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`CONTRACT_VIOLATION: ${label}: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function createLogger(store: ArtifactStorePort) {
  return {
    async log(event: Record<string, unknown>): Promise<void> {
      const line = JSON.stringify(
        redactValue({ ...event, timestamp: new Date().toISOString() })
      );
      await store.appendText("log.ndjson", `${line}\n`);
    },
  };
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  let options: AssetCliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof AssetCliUsageError) {
      io.stderr(error.message);
      io.stderr(USAGE);
      return 2;
    }
    throw error;
  }

  if (options.help) {
    io.stdout(USAGE);
    return 0;
  }

  try {
    const { config } = loadProjectConfig(options.projectPath);
    const profile =
      options.profile ??
      (Object.keys(config.manifests).length === 1 ? Object.keys(config.manifests)[0]! : "b-mobile");
    const briefs = await loadBriefs(options.assetsDir);
    const selected = options.only.length
      ? briefs.filter((brief) => options.only.includes(brief.id))
      : briefs;
    if (selected.length === 0) {
      throw new Error(`NO_ASSETS: no briefs selected in ${options.assetsDir}`);
    }

    const runId = createRunId();
    const runDir = path.join(options.runsDir, runId);
    const store = new FileArtifactStore(runDir);
    const libraryDir = path.join(options.assetsDir, "library");
    const producer = new LibrarySourceAdapter({
      libraryDir,
      index: await loadLibraryIndex(libraryDir),
      store,
    });
    const style = await loadStyle(options.assetsDir);
    const policy = await loadPolicy(options.assetsDir);
    const pricing = await loadPricing(options.assetsDir, options.pricingPath);

    if (options.dryRun) {
      const result = await preflightAssetBriefs({
        briefs: selected,
        producer,
        store,
        runDir,
      });
      await store.writeJson("preflight.json", result);
      io.stdout(
        `Asset preflight ${result.passed ? "OK" : "FAILED"}: ${result.items.length} assets, ${
          result.items.filter((item) => item.passed).length
        } passed`
      );
      for (const item of result.items.filter((entry) => !entry.passed).slice(0, 10)) {
        io.stdout(`- ${item.assetId}: ${item.error ?? item.gate?.issues.map((issue) => issue.code).join(", ")}`);
      }
      io.stdout(`Run: ${runDir}`);
      return result.passed ? 0 : 1;
    }

    const reviewer = new RenderingReviewer(await createReviewer(options.assetsDir, options));
    // `asset-review.json` is validated by core before it is written; validate
    // the returned run again so a runtime drift cannot reach the sidecar.
    const result = assertContract(
      AssetReviewRunSchema,
      await runAssetReview({
        runId,
        project: config.project,
        profile,
        runDir,
        briefs: selected,
        style,
        policy,
        ports: {
          producer,
          reviewer,
          store,
          clock: { now: () => new Date() },
          log: createLogger(store),
        },
        only: options.only,
        continueOnReviewerError: !options.failFast,
        pricing,
        ...(options.maxCostUsd === undefined ? {} : { maxCostUsd: options.maxCostUsd }),
        ...(options.maxMinutes === undefined ? {} : { maxMinutes: options.maxMinutes }),
        ...(options.maxReviewCostCny === undefined
          ? {}
          : { maxReviewCostCny: options.maxReviewCostCny }),
        allowUnknownCost: options.allowUnknownCost,
      }),
      "asset-review.json"
    );
    const manifest = toAssetManifest({ project: config.project, profile, records: result.assets });
    const manifestReview = toManifestReview({
      project: config.project,
      profile,
      records: result.assets,
      ...(result.batchGates === undefined ? {} : { batchGates: result.batchGates }),
      ...(result.usageSource === undefined ? {} : { usageSource: result.usageSource }),
      ...(result.usageComplete === undefined ? {} : { usageComplete: result.usageComplete }),
    });
    const validatedManifest = assertContract(
      AssetManifestSchema,
      { ...manifest, complete: manifestReview.complete },
      "manifest.json"
    );
    await store.writeJson("manifest.json", validatedManifest);
    await store.writeJson("manifest.review.json", manifestReview);

    io.stdout(
      `Asset review ${result.passed ? "OK" : "FAILED"}: ${result.summary.total} assets, ${
        result.summary.passed
      } passed, ${result.summary.retried} retried, ${result.summary.unresolved} unresolved, ${
        result.summary.degraded
      } degraded`
    );
    if (result.summary.renderWarnings !== undefined) {
      io.stdout(`Render warnings: ${result.summary.renderWarnings}`);
    }
    const reviewCostCny =
      result.summary.reviewCostCny === undefined
        ? "unavailable"
        : result.summary.reviewCostCny.toFixed(4);
    io.stdout(
      `Review cost: reviewCostCny=${reviewCostCny} usageSource=${
        result.usageSource ?? "unavailable"
      } usageComplete=${result.usageComplete ?? false}`
    );
    for (const record of result.assets.filter((asset) => asset.status !== "passed").slice(0, 10)) {
      const reasons = record.attempts
        .flatMap((attempt) => attempt.issues)
        .slice(0, 3)
        .join("; ");
      io.stdout(`- ${record.assetId}: ${reasons || "unresolved"}`);
    }
    io.stdout(`Run: ${runDir}`);
    if (result.error) io.stderr(result.error);
    return result.passed ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`Asset review FAILED: ${message}`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain = invokedPath === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
