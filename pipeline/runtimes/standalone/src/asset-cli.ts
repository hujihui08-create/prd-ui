import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AssetBriefSchema,
  DEFAULT_SOURCE_POLICY,
  SourcePolicySchema,
  preflightAssetBriefs,
  runAssetReview,
  toAssetManifest,
  type AssetBrief,
  type AssetReviewerPort,
  type SourcePolicy,
  type VisualStyle,
} from "@prd-ui/asset-review";
import { createRunId, loadProjectConfig } from "@prd-ui/orchestrator";
import { FileArtifactStore } from "./asset/artifact-store.js";
import { LibrarySourceAdapter, loadLibraryIndex } from "./asset/library-source.js";
import { modelReviewerFromEnv } from "./asset/model-reviewer.js";
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
  --budget-usd <n>           Per-asset cost cap
  --budget-minutes <n>       Per-asset time cap
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
  maxCostUsd?: number;
  maxMinutes?: number;
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
      case "--budget-usd":
        options.maxCostUsd = parseNumber(flag, value());
        break;
      case "--budget-minutes":
        options.maxMinutes = parseNumber(flag, value());
        break;
      default:
        throw new AssetCliUsageError(`unknown argument: ${argument}`);
    }
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

async function loadStyle(assetsDir: string): Promise<VisualStyle> {
  try {
    const raw = JSON.parse(await readFile(path.join(assetsDir, "style.json"), "utf8")) as Partial<VisualStyle>;
    return { id: raw.id ?? "b-mobile", ...raw };
  } catch {
    return { id: "b-mobile" };
  }
}

async function loadPolicy(assetsDir: string): Promise<SourcePolicy> {
  try {
    const raw = JSON.parse(await readFile(path.join(assetsDir, "source-policy.json"), "utf8")) as unknown;
    return SourcePolicySchema.parse(raw);
  } catch {
    return DEFAULT_SOURCE_POLICY;
  }
}

async function createReviewer(assetsDir: string, options: AssetCliOptions): Promise<AssetReviewerPort> {
  if (options.runtime === "dsh") {
    throw new Error("RUNTIME_UNAVAILABLE: dsh runtime is wired in Task 9");
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

function redact(line: string): string {
  return line.replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***");
}

function createLogger(store: FileArtifactStore) {
  const lines: string[] = [];
  return {
    async log(event: Record<string, unknown>): Promise<void> {
      lines.push(redact(JSON.stringify({ ...event, timestamp: new Date().toISOString() })));
      await store.writeText("log.ndjson", `${lines.join("\n")}\n`);
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

    const reviewer = await createReviewer(options.assetsDir, options);
    const policy = await loadPolicy(options.assetsDir);
    const result = await runAssetReview({
      runId,
      project: config.project,
      profile,
      runDir,
      briefs: selected,
      style,
      policy,
      ports: { producer, reviewer, store, clock: { now: () => new Date() }, log: createLogger(store) },
      only: options.only,
      ...(options.maxCostUsd === undefined ? {} : { maxCostUsd: options.maxCostUsd }),
      ...(options.maxMinutes === undefined ? {} : { maxMinutes: options.maxMinutes }),
    });
    const manifest = toAssetManifest({ project: config.project, profile, records: result.assets });
    await store.writeJson("manifest.json", manifest);

    io.stdout(
      `Asset review ${result.passed ? "OK" : "FAILED"}: ${result.summary.total} assets, ${
        result.summary.passed
      } passed, ${result.summary.retried} retried, ${result.summary.unresolved} unresolved, ${
        result.summary.degraded
      } degraded`
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
