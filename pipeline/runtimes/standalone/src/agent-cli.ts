import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentRoleSchema,
  runM1,
  type AgentRole,
  type AgentRunnerPort,
  type M1RunResult,
} from "@prd-ui/agents";
import {
  UiBriefSchema,
  parsePricingConfig,
  redactValue,
  resolvePricing,
  type ReviewPricing,
  type UiBrief,
} from "@prd-ui/contracts";
import { getCatalog, getProfile } from "@prd-ui/design-system";
import { createRunId, loadProjectConfig } from "@prd-ui/orchestrator";
import { FileArtifactStore } from "./asset/artifact-store.js";
import { ScriptedAgentRunner, loadScriptedAgentFixtures } from "./agent/scripted-runner.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export const USAGE = `Usage: pnpm agent:run [options]

Options:
  --project <path>            Project YAML (default: samples/projects/employee-app/project.yaml)
  --brief <path>              Brief override (default: project.yaml brief path)
  --prd <path>                PRD text/summary (default: project.yaml prd path)
  --runs <dir>                Directory that receives run artifacts
  --runtime standalone|dsh    Execution adapter (default: standalone)
  --profile <name>            dsh profile override (default: prd-ui-agents)
  --fixtures <dir>            Standalone scripted fixtures (default: samples/agents/m1)
  --pricing <path>            Pricing file (default: pipeline/pricing.json)
  --only-role <role>          Run only a design role (ia|interaction|visual-style; repeatable)
  --max-cost-cny <n>          Whole-run cost cap in CNY (default: 10)
  --allow-unknown-cost        Continue when usage is incomplete
  --allow-unreviewed          Run design without IA signoff; status stays awaiting_signoff
  --signoff-ia <path>         Copy an IA signoff markdown into the run
  --signoff-visual-style <path> Copy a visual-style signoff markdown into the run
  --json                      Print one JSON summary to stdout; suppress the human summary
  -h, --help                  Print this help and exit`;

export interface AgentCliOptions {
  projectPath: string;
  briefPath?: string;
  prdPath?: string;
  runsDir: string;
  runtime: "standalone" | "dsh";
  profile: string;
  fixturesDir: string;
  pricingPath?: string;
  onlyRoles: AgentRole[];
  maxCostCny: number;
  allowUnknownCost: boolean;
  allowUnreviewed: boolean;
  signoffIaPath?: string;
  signoffVisualStylePath?: string;
  json: boolean;
  help: boolean;
}

export class AgentCliUsageError extends Error {}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new AgentCliUsageError(`missing value for ${flag}`);
  }
  return value;
}

function parseNumber(flag: string, value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new AgentCliUsageError(`invalid value for ${flag}: ${value}`);
  }
  return number;
}

function parseRole(value: string): AgentRole {
  const parsed = AgentRoleSchema.safeParse(value);
  if (!parsed.success) {
    throw new AgentCliUsageError(
      `--only-role must be ia, interaction, or visual-style, got ${value}`
    );
  }
  return parsed.data;
}

export function parseArgs(argv: string[]): AgentCliOptions {
  const options: AgentCliOptions = {
    projectPath: path.join(pipelineRoot, "samples", "projects", "employee-app", "project.yaml"),
    runsDir: path.join(pipelineRoot, "runs"),
    runtime: "standalone",
    profile: "prd-ui-agents",
    fixturesDir: path.join(pipelineRoot, "samples", "agents", "m1"),
    onlyRoles: [],
    maxCostCny: 10,
    allowUnknownCost: false,
    allowUnreviewed: false,
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
      case "--brief":
        options.briefPath = path.resolve(value());
        break;
      case "--prd":
        options.prdPath = path.resolve(value());
        break;
      case "--profile":
        options.profile = value();
        break;
      case "--runs":
        options.runsDir = path.resolve(value());
        break;
      case "--runtime": {
        const runtime = value();
        if (runtime !== "standalone" && runtime !== "dsh") {
          throw new AgentCliUsageError(
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
      case "--only-role":
        options.onlyRoles.push(parseRole(value()));
        break;
      case "--max-cost-cny":
        options.maxCostCny = parseNumber(flag, value());
        break;
      case "--allow-unknown-cost":
        options.allowUnknownCost = true;
        break;
      case "--allow-unreviewed":
        options.allowUnreviewed = true;
        break;
      case "--signoff-ia":
        options.signoffIaPath = path.resolve(value());
        break;
      case "--signoff-visual-style":
        options.signoffVisualStylePath = path.resolve(value());
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new AgentCliUsageError(`unknown argument: ${argument}`);
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
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`INVALID_BRIEF: ${file}: ${errorMessage(error)}`);
  }
  const parsed = UiBriefSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`CONTRACT_VIOLATION: ${file}: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function createRunners(
  options: AgentCliOptions
): Promise<Record<AgentRole, AgentRunnerPort>> {
  if (options.runtime === "dsh") {
    const { createDshAgentRunner } = await import("@prd-ui/runtime-dsh/agent-runner");
    const runner = createDshAgentRunner({ profile: options.profile });
    return { ia: runner, interaction: runner, "visual-style": runner };
  }
  const fixtures = await loadScriptedAgentFixtures(options.fixturesDir);
  const runner = new ScriptedAgentRunner(fixtures);
  return { ia: runner, interaction: runner, "visual-style": runner };
}

function createAgentLogger(store: FileArtifactStore) {
  return {
    async log(event: Record<string, unknown>): Promise<void> {
      const line = JSON.stringify(
        redactValue({ ...event, timestamp: new Date().toISOString() })
      );
      await store.appendText("logs/agent.ndjson", `${line}\n`);
    },
  };
}

function summary(result: M1RunResult | undefined, runDir: string | null, error?: string | null) {
  return redactValue({
    runDir,
    runId: result?.runId ?? null,
    project: result?.project ?? null,
    status: result?.state.status ?? "failed",
    gates: result?.state.gates ?? null,
    agents: result?.state.agents ?? null,
    signoff: result?.state.signoff ?? null,
    costCny: result?.state.costCny ?? null,
    usageComplete: result?.state.usageComplete ?? null,
    error: result?.error ?? error ?? null,
  }) as Record<string, unknown>;
}

function printHuman(
  io: { stdout: (line: string) => void; stderr: (line: string) => void },
  result: M1RunResult,
  runDir: string
): void {
  const ok = result.state.status === "success";
  io.stdout(`Agent run ${ok ? "OK" : result.state.status.toUpperCase()}: ${result.state.status}`);
  io.stdout(`IA gate: ${result.state.gates.ia}`);
  io.stdout(`Interaction gate: ${result.state.gates.interaction}`);
  io.stdout(`Visual style gate: ${result.state.gates.visualStyle}`);
  io.stdout(
    `Signoff: ia=${result.state.signoff.ia} visual-style=${result.state.signoff.visualStyle}`
  );
  io.stdout(
    `Cost: costCny=${result.state.costCny.toFixed(4)} usageComplete=${result.state.usageComplete}`
  );
  if (result.state.degraded) {
    io.stdout(`Degraded: ${result.state.degradedReason ?? "yes"}`);
  }
  for (const [role, state] of Object.entries(result.state.agents)) {
    if (state.status === "failed" || state.status.includes("budget") || state.status.includes("usage")) {
      io.stdout(`- ${role}: ${state.status}${state.error === undefined ? "" : ` (${state.error})`}`);
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
  let options: AgentCliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof AgentCliUsageError) {
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
    const briefPath =
      options.briefPath ?? path.resolve(baseDir, config.brief);
    const brief = await loadBrief(briefPath);

    const prdPath = options.prdPath ?? (config.prd ? path.resolve(baseDir, config.prd) : undefined);
    if (prdPath === undefined) {
      throw new AgentCliUsageError(
        "missing PRD: pass --prd <path> or set prd in project.yaml"
      );
    }
    const prdText = await readFile(prdPath, "utf8");

    const pricing = await loadPricing(options.pricingPath);
    const runId = createRunId();
    runDir = path.join(options.runsDir, runId);
    const store = new FileArtifactStore(runDir);

    if (options.signoffIaPath !== undefined) {
      await store.writeText("signoff/ia.md", await readFile(options.signoffIaPath, "utf8"));
    }
    if (options.signoffVisualStylePath !== undefined) {
      await store.writeText(
        "signoff/visual-style.md",
        await readFile(options.signoffVisualStylePath, "utf8")
      );
    }

    const profile = getProfile(brief.meta.profile);
    const catalog = getCatalog(brief.meta.profile);

    const result = await runM1({
      runId,
      project: config.project,
      runDir,
      brief,
      prdText,
      runners: await createRunners(options),
      ports: {
        store,
        clock: { now: () => new Date() },
        log: createAgentLogger(store),
      },
      pricing,
      maxCostCny: options.maxCostCny,
      allowUnknownCost: options.allowUnknownCost,
      allowUnreviewed: options.allowUnreviewed,
      ...(options.onlyRoles.length === 0 ? {} : { onlyRoles: options.onlyRoles }),
      catalog,
      motionTokens: {
        duration: profile.motion,
        easing: {
          standard: "ease-out",
          emphasized: "cubic-bezier(0.2, 0, 0, 1)",
        },
      },
    });

    await store.writeJson("agent-run.json", summary(result, runDir));

    if (options.json) {
      io.stdout(JSON.stringify(summary(result, runDir)));
    } else {
      printHuman(io, result, runDir);
    }
    return result.state.status === "success" ? 0 : 1;
  } catch (error) {
    if (error instanceof AgentCliUsageError) {
      io.stderr(error.message);
      io.stderr(USAGE);
      return 2;
    }
    const message = redactValue(errorMessage(error)) as string;
    if (options.json) {
      io.stdout(JSON.stringify(summary(undefined, runDir, message)));
    } else {
      io.stderr(`Agent run FAILED: ${message}`);
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
