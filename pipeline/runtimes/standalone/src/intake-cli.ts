import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileProject } from "@prd-ui/compiler";
import {
  PageSpecSchema,
  UiBriefSchema,
  parsePricingConfig,
  redactValue,
  resolvePricing,
  type ReviewPricing,
  type UiBrief,
} from "@prd-ui/contracts";
import { archetypes, getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { createRunId, loadProjectConfig } from "@prd-ui/orchestrator";
import type { AgentRunnerPort } from "@prd-ui/agents";
import {
  canonicalJson,
  runIntake,
  summarizeIntake,
  type BriefValidation,
  type IntakeRunResult,
  type IntakeStatus,
} from "@prd-ui/intake";
import { ScriptedAgentRunner, loadScriptedRoleFixtures } from "./agent/scripted-runner.js";
import { FileArtifactStore } from "./asset/artifact-store.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export const USAGE = `Usage: pnpm intake:run [options]

Options:
  --project <path>            Project YAML (default: samples/projects/employee-app/project.yaml)
  --prd <path>                PRD markdown (default: project.yaml prd path)
  --runs <dir>                Directory that receives a new run
  --resume <dir>              Continue an existing run
  --runtime standalone|dsh    Execution adapter (default: standalone)
  --fixtures <dir>            Scripted fixtures for ia/prd-review/ui-briefer
  --pricing <path>            Pricing file (default: pipeline/pricing.json)
  --max-cost-cny <n>          Whole-run cost cap in CNY (default: 10)
  --allow-unknown-cost        Continue when usage is incomplete
  --signoff-prd-ia <path>     PRD/IA signoff markdown
  --signoff-brief <path>      Brief signoff markdown
  --publish-brief <path>      Publish the signed brief atomically
  --brief-version <semver>    Brief version (default: 0.1.0)
  --existing-brief <path>     Compare against an existing brief (not a source of truth)
  --force                     Allow overwriting a different published brief
  --json                      Print one JSON summary to stdout
  -h, --help                  Print this help and exit`;

export interface IntakeCliOptions {
  projectPath: string;
  prdPath?: string;
  runsDir: string;
  resumeDir?: string;
  runtime: "standalone" | "dsh";
  fixturesDir: string;
  pricingPath?: string;
  maxCostCny: number;
  allowUnknownCost: boolean;
  signoffPrdIaPath?: string;
  signoffBriefPath?: string;
  publishBriefPath?: string;
  briefVersion?: string;
  existingBriefPath?: string;
  force: boolean;
  json: boolean;
  help: boolean;
}

export class IntakeCliUsageError extends Error {}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new IntakeCliUsageError(`missing value for ${flag}`);
  }
  return value;
}

function parseNumber(flag: string, value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new IntakeCliUsageError(`invalid value for ${flag}: ${value}`);
  }
  return number;
}

export function parseArgs(argv: string[]): IntakeCliOptions {
  const options: IntakeCliOptions = {
    projectPath: path.join(
      pipelineRoot,
      "samples",
      "projects",
      "employee-app",
      "project.yaml"
    ),
    runsDir: path.join(pipelineRoot, "runs"),
    runtime: "standalone",
    fixturesDir: path.join(pipelineRoot, "samples", "agents", "intake"),
    maxCostCny: 10,
    allowUnknownCost: false,
    force: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    const equals = argument.indexOf("=");
    const flag =
      argument.startsWith("--") && equals > 0 ? argument.slice(0, equals) : argument;
    const inlineValue =
      argument.startsWith("--") && equals > 0 ? argument.slice(equals + 1) : undefined;
    const value = (): string => inlineValue ?? readValue(argv, ++index, flag);

    switch (flag) {
      case "--project":
        options.projectPath = path.resolve(value());
        break;
      case "--prd":
        options.prdPath = path.resolve(value());
        break;
      case "--runs":
        options.runsDir = path.resolve(value());
        break;
      case "--resume":
        options.resumeDir = path.resolve(value());
        break;
      case "--runtime": {
        const runtime = value();
        if (runtime !== "standalone" && runtime !== "dsh") {
          throw new IntakeCliUsageError(
            `--runtime must be standalone or dsh, got ${runtime}`
          );
        }
        options.runtime = runtime;
        break;
      }
      case "--fixtures":
        options.fixturesDir = path.resolve(value());
        break;
      case "--pricing":
        options.pricingPath = path.resolve(value());
        break;
      case "--max-cost-cny":
        options.maxCostCny = parseNumber(flag, value());
        break;
      case "--allow-unknown-cost":
        options.allowUnknownCost = true;
        break;
      case "--signoff-prd-ia":
        options.signoffPrdIaPath = path.resolve(value());
        break;
      case "--signoff-brief":
        options.signoffBriefPath = path.resolve(value());
        break;
      case "--publish-brief":
        options.publishBriefPath = path.resolve(value());
        break;
      case "--brief-version":
        options.briefVersion = value();
        break;
      case "--existing-brief":
        options.existingBriefPath = path.resolve(value());
        break;
      case "--force":
        options.force = true;
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new IntakeCliUsageError(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadPricing(explicitPath?: string): Promise<ReviewPricing> {
  const file = explicitPath ?? path.join(pipelineRoot, "pricing.json");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`INVALID_PRICING: ${file}: ${errorMessage(error)}`);
  }
  const config = parsePricingConfig(raw, file);
  return resolvePricing(config, process.env.PRD_UI_VISION_MODEL);
}

async function loadBrief(file: string): Promise<UiBrief> {
  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  const parsed = UiBriefSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`CONTRACT_VIOLATION: ${file}: ${parsed.error.message}`);
  }
  return parsed.data;
}

function hashText(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function validateBrief(brief: UiBrief): BriefValidation {
  try {
    const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
    const errors: string[] = [];
    for (const spec of specs) {
      const parsed = PageSpecSchema.safeParse(spec);
      if (!parsed.success) {
        errors.push(`${spec.meta.pageId}: ${parsed.error.message}`);
      }
    }
    return { ok: errors.length === 0, errors };
  } catch (error) {
    return { ok: false, errors: [errorMessage(error)] };
  }
}

async function createRunners(options: IntakeCliOptions): Promise<{
  ia: AgentRunnerPort;
  "prd-review": AgentRunnerPort;
  "ui-briefer": AgentRunnerPort;
}> {
  if (options.runtime === "dsh") {
    // Resume from a completed brief can re-gate without a model call; defer
    // provider validation until a runner is actually used.
    let runner: AgentRunnerPort | undefined;
    const lazy: AgentRunnerPort = {
      name: "dsh",
      model: process.env.PRD_UI_VISION_MODEL ?? "unknown",
      async run(task) {
        if (runner === undefined) {
          const { createDshAgentRunner } = await import("@prd-ui/runtime-dsh/agent-runner");
          runner = createDshAgentRunner({ profile: "prd-ui-intake" });
        }
        return runner.run(task);
      },
    };
    return { ia: lazy, "prd-review": lazy, "ui-briefer": lazy };
  }
  const fixtures = await loadScriptedRoleFixtures(options.fixturesDir, [
    "ia",
    "prd-review",
    "ui-briefer",
  ] as const);
  const runner = new ScriptedAgentRunner(fixtures);
  return { ia: runner, "prd-review": runner, "ui-briefer": runner };
}

function createLogger(store: FileArtifactStore) {
  return {
    async log(event: Record<string, unknown>): Promise<void> {
      const line = JSON.stringify(
        redactValue({ ...event, timestamp: new Date().toISOString() })
      );
      await store.appendText("logs/intake.ndjson", `${line}\n`);
    },
  };
}

async function publishBrief(
  target: string,
  brief: UiBrief,
  briefHash: string,
  store: FileArtifactStore,
  force: boolean
): Promise<{ path: string; overwritten: boolean }> {
  const content = `${JSON.stringify(brief, null, 2)}\n`;
  let existing: string | undefined;
  try {
    existing = await readFile(target, "utf8");
  } catch {
    existing = undefined;
  }
  let overwritten = false;
  if (existing !== undefined) {
    let same = false;
    try {
      same = canonicalJson(JSON.parse(existing)) === canonicalJson(brief);
    } catch {
      same = false;
    }
    if (same) {
      return { path: target, overwritten: false };
    }
    if (!force) {
      throw new Error(`PUBLISH_CONFLICT: ${target}`);
    }
    overwritten = true;
  }
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, target);
  await store.writeJson("artifacts/brief-published.json", {
    path: target,
    briefHash,
    publishedAt: new Date().toISOString(),
    overwritten,
  });
  return { path: target, overwritten };
}

function failureSummary(runDir: string | null, message: string): Record<string, unknown> {
  return redactValue({
    runDir,
    runId: runDir === null ? null : path.basename(runDir),
    project: null,
    status: "failed",
    prd: {
      sourceHash: null,
      readiness: "unknown",
      blockers: 0,
      questions: 0,
    },
    ia: { passed: false, blockers: 0 },
    brief: {
      passed: false,
      version: null,
      pages: 0,
      hash: null,
      path: null,
    },
    signoff: { prdIa: false, brief: false },
    cost: { cny: 0, usageComplete: false },
    error: message,
  }) as Record<string, unknown>;
}

function printHuman(
  io: { stdout: (line: string) => void; stderr: (line: string) => void },
  result: IntakeRunResult,
  runDir: string
): void {
  io.stdout(`Intake ${result.status.toUpperCase()}: ${result.status}`);
  if (result.review !== undefined) {
    io.stdout(
      `PRD: ${result.review.readiness.status} (${result.review.readiness.blockers} blockers, ${result.review.readiness.questions} questions)`
    );
  }
  io.stdout(`PRD gate: ${result.state.gates.prd}`);
  io.stdout(`IA gate: ${result.state.gates.ia}`);
  io.stdout(`Brief gate: ${result.state.gates.brief}`);
  io.stdout(
    `Signoff: prd-ia=${result.state.signoff.prdIa} brief=${result.state.signoff.brief}`
  );
  if (result.brief !== undefined) {
    io.stdout(
      `Brief: ${result.brief.ia.pages.length} pages, version ${result.brief.meta.version}, hash ${result.briefHash ?? "unknown"}`
    );
  }
  io.stdout(
    `Cost: costCny=${result.state.costCny.toFixed(4)} usageComplete=${result.state.usageComplete}`
  );
  if (result.gate !== undefined) {
    for (const issue of result.gate.issues.filter(
      (entry) => entry.severity === "blocker"
    )) {
      io.stdout(`- ${issue.code}: ${issue.message}`);
    }
  }
  if (result.error !== undefined) io.stderr(result.error);
  io.stdout(`Run: ${runDir}`);
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  let options: IntakeCliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof IntakeCliUsageError) {
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

  let runDir: string | null = null;

  try {
    const { config, baseDir } = loadProjectConfig(options.projectPath);
    const prdPath =
      options.prdPath ??
      (config.prd === undefined ? undefined : path.resolve(baseDir, config.prd));
    if (prdPath === undefined) {
      throw new IntakeCliUsageError(
        "missing PRD: pass --prd <path> or set prd in project.yaml"
      );
    }
    const prdText = await readFile(prdPath, "utf8");
    const prdHash = hashText(prdText);

    const existingBrief =
      options.existingBriefPath === undefined
        ? undefined
        : await loadBrief(options.existingBriefPath);
    const signoffPrdIa =
      options.signoffPrdIaPath === undefined
        ? undefined
        : await readFile(options.signoffPrdIaPath, "utf8");
    const signoffBrief =
      options.signoffBriefPath === undefined
        ? undefined
        : await readFile(options.signoffBriefPath, "utf8");

    const pricing = await loadPricing(options.pricingPath);
    const runId = options.resumeDir === undefined ? createRunId() : path.basename(options.resumeDir);
    runDir = options.resumeDir ?? path.join(options.runsDir, runId);
    const store = new FileArtifactStore(runDir);

    const result = await runIntake({
      runId,
      project: config.project,
      runDir,
      prdText,
      prdPath,
      prdHash,
      projectConfig: config,
      runners: await createRunners(options),
      ports: {
        store,
        clock: { now: () => new Date() },
        log: createLogger(store),
        validateBrief,
        hashText,
        supportedProfiles: ["b-dense", "b-mobile", "c-expressive"],
        supportedArchetypes: archetypes.map((archetype) => archetype.id),
      },
      pricing,
      maxCostCny: options.maxCostCny,
      allowUnknownCost: options.allowUnknownCost,
      ...(signoffPrdIa === undefined ? {} : { signoffPrdIa }),
      ...(signoffBrief === undefined ? {} : { signoffBrief }),
      ...(existingBrief === undefined ? {} : { existingBrief }),
      ...(options.briefVersion === undefined ? {} : { briefVersion: options.briefVersion }),
      ...(options.resumeDir === undefined ? {} : { resume: true }),
    });

    const summary = summarizeIntake(result);
    let published: { path: string; overwritten: boolean } | undefined;
    if (options.publishBriefPath !== undefined) {
      if (result.status !== "success" || result.brief === undefined) {
        throw new Error("PUBLISH_REQUIRES_SIGNED_BRIEF");
      }
      published = await publishBrief(
        options.publishBriefPath,
        result.brief,
        result.briefHash ?? "",
        store,
        options.force
      );
    }
    const payload = published === undefined ? summary : { ...summary, published };
    await store.writeJson("intake.json", payload);

    if (options.json) {
      io.stdout(JSON.stringify(payload));
    } else {
      printHuman(io, result, runDir);
      if (published !== undefined) {
        io.stdout(
          `Published: ${published.path}${published.overwritten ? " (overwritten)" : ""}`
        );
      }
    }
    return result.status === "success" ? 0 : 1;
  } catch (error) {
    if (error instanceof IntakeCliUsageError) {
      io.stderr(error.message);
      io.stderr(USAGE);
      return 2;
    }
    const message = redactValue(errorMessage(error)) as string;
    if (options.json) {
      io.stdout(JSON.stringify(failureSummary(runDir, message)));
    } else {
      io.stderr(`Intake FAILED: ${message}`);
    }
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

export type { IntakeStatus };
