import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AssetBriefSchema,
  DEFAULT_STRUCTURE_CONFIG,
  UiBriefSchema,
  redactValue,
  type AssetBrief,
  type PageSpec,
  type StructureLintReport,
  type UiBrief,
} from "@prd-ui/contracts";
import { compileProject, splitBlocks } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import {
  IaMapArtifactSchema,
  InteractionSpecArtifactSchema,
  M1RunStateSchema,
  MotionSpecArtifactSchema,
  type IaMap,
  type InteractionSpec,
  type MotionSpec,
} from "@prd-ui/agents";
import {
  runSpecEngineer,
  type SpecEngineerGate,
  type SpecEngineerSummary,
} from "@prd-ui/spec-engineer";
import { createRunId, loadProjectConfig } from "@prd-ui/orchestrator";
import { estimatePageHeight, validateStructure } from "@prd-ui/validators";
import { FileArtifactStore } from "./asset/artifact-store.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export const USAGE = `Usage: pnpm spec:engineer [options]

Options:
  --project <path>      Project YAML (default: samples/projects/employee-app/project.yaml)
  --agent-run <dir>     M1 agent run directory (required)
  --runs <dir>          Directory that receives run artifacts
  --strict-motion       Treat unresolved motion bindings as blockers for every brief page
  --json                Print one JSON summary to stdout; suppress the human summary
  -h, --help            Print this help and exit`;

export interface SpecCliOptions {
  projectPath: string;
  agentRunPath?: string;
  runsDir: string;
  strictMotion: boolean;
  json: boolean;
  help: boolean;
}

export class SpecCliUsageError extends Error {}
class SpecInputError extends Error {}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new SpecCliUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): SpecCliOptions {
  const options: SpecCliOptions = {
    projectPath: path.join(pipelineRoot, "samples", "projects", "employee-app", "project.yaml"),
    runsDir: path.join(pipelineRoot, "runs"),
    strictMotion: false,
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
    const flag = argument.startsWith("--") && equals > 0 ? argument.slice(0, equals) : argument;
    const inlineValue =
      argument.startsWith("--") && equals > 0 ? argument.slice(equals + 1) : undefined;
    const value = (): string => inlineValue ?? readValue(argv, ++index, flag);

    switch (flag) {
      case "--project":
        options.projectPath = path.resolve(value());
        break;
      case "--agent-run":
        options.agentRunPath = path.resolve(value());
        break;
      case "--runs":
        options.runsDir = path.resolve(value());
        break;
      case "--strict-motion":
        options.strictMotion = true;
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new SpecCliUsageError(`unknown argument: ${argument}`);
    }
  }

  return options;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readJsonFile(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (error) {
    throw new SpecInputError(`${file}: ${errorMessage(error)}`);
  }
}

async function readArtifact<T>(
  file: string,
  schema: { parse(value: unknown): T }
): Promise<T> {
  const raw = await readJsonFile(file);
  try {
    return schema.parse(raw);
  } catch (error) {
    throw new SpecInputError(`${file}: ${errorMessage(error)}`);
  }
}

async function loadBrief(file: string): Promise<UiBrief> {
  const raw = await readJsonFile(file);
  const parsed = UiBriefSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SpecInputError(`${file}: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function loadAssetBriefs(dir: string): Promise<AssetBrief[] | undefined> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new SpecInputError(`${dir}: ${errorMessage(error)}`);
  }
  const files = entries.filter((entry) => entry.endsWith(".json")).sort();
  if (files.length === 0) return [];
  const briefs: AssetBrief[] = [];
  for (const file of files) {
    const raw = await readJsonFile(path.join(dir, file));
    const parsed = AssetBriefSchema.safeParse(raw);
    if (!parsed.success) {
      throw new SpecInputError(`${path.join(dir, file)}: ${parsed.error.message}`);
    }
    briefs.push(parsed.data);
  }
  return briefs;
}

interface M1Inputs {
  interactionSpec: InteractionSpec;
  motionSpec: MotionSpec;
  iaMap?: IaMap;
  assetBriefs?: AssetBrief[];
}

async function loadM1Inputs(agentRunPath: string, project: string): Promise<M1Inputs> {
  let state: unknown;
  try {
    state = JSON.parse(await readFile(path.join(agentRunPath, "state.json"), "utf8")) as unknown;
  } catch (error) {
    throw new SpecInputError(`M1 state.json: ${errorMessage(error)}`);
  }
  const parsedState = M1RunStateSchema.safeParse(state);
  if (!parsedState.success) {
    throw new SpecInputError(`M1 state.json: ${parsedState.error.message}`);
  }
  if (parsedState.data.project !== project) {
    throw new SpecInputError(
      `M1 state.json project ${parsedState.data.project} does not match ${project}`
    );
  }
  if (!["success", "awaiting_signoff", "partial"].includes(parsedState.data.status)) {
    throw new SpecInputError(
      `M1 run status ${parsedState.data.status} cannot be consumed (expected success, awaiting_signoff, or partial)`
    );
  }

  const interactionArtifact = await readArtifact(
    path.join(agentRunPath, "artifacts", "interaction-spec.json"),
    InteractionSpecArtifactSchema
  );
  if (interactionArtifact.project !== project) {
    throw new SpecInputError(
      `interaction-spec project ${interactionArtifact.project} does not match ${project}`
    );
  }

  const motionArtifact = await readArtifact(
    path.join(agentRunPath, "artifacts", "motion-spec.json"),
    MotionSpecArtifactSchema
  );
  if (motionArtifact.project !== project) {
    throw new SpecInputError(
      `motion-spec project ${motionArtifact.project} does not match ${project}`
    );
  }

  let iaMap: IaMap | undefined;
  try {
    const iaArtifact = await readArtifact(
      path.join(agentRunPath, "artifacts", "ia-map.json"),
      IaMapArtifactSchema
    );
    if (iaArtifact.project !== project) {
      throw new SpecInputError(
        `ia-map project ${iaArtifact.project} does not match ${project}`
      );
    }
    iaMap = {
      pages: iaArtifact.pages,
      navigation: iaArtifact.navigation,
      flows: iaArtifact.flows,
      crossLinks: iaArtifact.crossLinks,
    };
  } catch (error) {
    if (error instanceof SpecInputError && !error.message.includes("ENOENT")) {
      throw error;
    }
  }

  const assetBriefs = await loadAssetBriefs(
    path.join(agentRunPath, "artifacts", "asset-briefs")
  );

  return {
    interactionSpec: { pages: interactionArtifact.pages },
    motionSpec: {
      presets: motionArtifact.presets,
      bindings: motionArtifact.bindings,
      tokens: motionArtifact.tokens,
      reducedMotion: motionArtifact.reducedMotion,
    },
    ...(iaMap === undefined ? {} : { iaMap }),
    ...(assetBriefs === undefined ? {} : { assetBriefs }),
  };
}

function createLogger(store: FileArtifactStore) {
  return {
    async log(event: Record<string, unknown>): Promise<void> {
      const line = JSON.stringify(
        redactValue({ ...event, timestamp: new Date().toISOString() })
      );
      await store.appendText("logs/spec-engineer.ndjson", `${line}\n`);
    },
  };
}

function failureSummary(
  runDir: string | null,
  message: string
): Record<string, unknown> {
  const gate: SpecEngineerGate = {
    passed: false,
    issues: [
      {
        code: "SPEC_INPUT_INVALID",
        severity: "blocker",
        message,
      },
    ],
  };
  return redactValue({
    runDir,
    status: "failed",
    gate,
    pages: [],
    motionPages: [],
    assets: { referenced: [], unusedBriefs: [], missing: [] },
    error: message,
  }) as Record<string, unknown>;
}

function jsonSummary(
  runDir: string,
  summary: SpecEngineerSummary
): Record<string, unknown> {
  return redactValue({
    runDir,
    status: summary.passed ? "passed" : "failed",
    gate: summary.gate,
    pages: summary.pages,
    motionPages: summary.motionPages,
    assets: summary.assets,
    error: summary.error ?? null,
  }) as Record<string, unknown>;
}

function printHuman(
  io: { stdout: (line: string) => void; stderr: (line: string) => void },
  summary: SpecEngineerSummary,
  runDir: string
): void {
  const blockers = summary.gate.issues.filter((issue) => issue.severity === "blocker").length;
  const warnings = summary.gate.issues.length - blockers;
  io.stdout(
    `Spec Engineer ${summary.passed ? "OK" : "FAILED"}: ${summary.pages.length} pages, ${summary.motionPages.length} motion pages`
  );
  io.stdout(`Gate: ${summary.passed ? "passed" : "failed"} (${blockers} blockers, ${warnings} warnings)`);
  io.stdout(
    `Assets: referenced=${summary.assets.referenced.length} unused=${summary.assets.unusedBriefs.length} missing=${summary.assets.missing.length}`
  );
  for (const issue of summary.gate.issues.filter((entry) => entry.severity === "blocker").slice(0, 10)) {
    io.stdout(`- ${issue.code}: ${issue.message}`);
  }
  io.stdout(`Run: ${runDir}`);
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  let options: SpecCliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof SpecCliUsageError) {
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
  if (options.agentRunPath === undefined) {
    io.stderr("missing required --agent-run <dir>");
    io.stderr(USAGE);
    return 2;
  }

  let runDir: string | undefined;
  let project: string | undefined;
  let store: FileArtifactStore | undefined;

  try {
    const { config, baseDir } = loadProjectConfig(options.projectPath);
    project = config.project;
    const brief = await loadBrief(path.resolve(baseDir, config.brief));
    const baseSpecs: PageSpec[] = compileProject(brief, {
      getProfile,
      getCatalog,
      getArchetype,
    });

    const runId = createRunId();
    runDir = path.join(options.runsDir, runId);
    store = new FileArtifactStore(runDir);
    const logger = createLogger(store);

    const inputs = await loadM1Inputs(options.agentRunPath, project);
    const result = await runSpecEngineer({
      runId,
      project,
      agentRunId: path.basename(options.agentRunPath),
      brief,
      baseSpecs,
      interactionSpec: inputs.interactionSpec,
      motionSpec: inputs.motionSpec,
      ...(inputs.iaMap === undefined ? {} : { iaMap: inputs.iaMap }),
      ...(inputs.assetBriefs === undefined ? {} : { assetBriefs: inputs.assetBriefs }),
      ...(options.strictMotion
        ? { strictMotionPages: brief.ia.pages.map((page) => page.id) }
        : {}),
      generatedAt: new Date().toISOString(),
    });

    const gateArtifact = {
      schemaVersion: "1.0",
      project,
      generatedAt: new Date().toISOString(),
      gate: result.gate,
    };
    await store.writeJson("findings/spec-engineer-gate.json", gateArtifact);
    await store.writeJson("spec-engineer.json", result.summary);
    if (result.gate.passed) {
      for (const spec of result.specs) {
        await store.writeJson(`artifacts/page-spec/${spec.meta.pageId}.json`, spec);
        const manifest = splitBlocks(spec, getArchetype(spec.meta.archetype));
        await store.writeJson(`artifacts/block-manifest/${spec.meta.pageId}.json`, manifest);
      }
    }

    // Structure lint is advisory in v0.7: warnings never change the gate.
    const structureConfig = {
      maxRepeatedSections:
        config.structure?.maxRepeatedSections ??
        DEFAULT_STRUCTURE_CONFIG.maxRepeatedSections,
      pageHeightBudget: {
        mobile:
          config.structure?.pageHeightBudget?.mobile ??
          DEFAULT_STRUCTURE_CONFIG.pageHeightBudget.mobile,
        web:
          config.structure?.pageHeightBudget?.web ??
          DEFAULT_STRUCTURE_CONFIG.pageHeightBudget.web,
      },
    };
    const structurePages = result.specs.map((spec) => {
      const context = {
        profile: getProfile(spec.meta.profile),
        catalog: getCatalog(spec.meta.profile),
        archetype: getArchetype(spec.meta.archetype),
        structure: structureConfig,
      };
      return {
        pageId: spec.meta.pageId,
        estimatedHeight: estimatePageHeight(spec, context),
        budget: structureConfig.pageHeightBudget[spec.meta.target],
        findings: validateStructure(spec, context),
      };
    });
    const structureReport: StructureLintReport = {
      schemaVersion: "1.0",
      project,
      generatedAt: new Date().toISOString(),
      config: structureConfig,
      pages: structurePages,
      summary: {
        warnings: structurePages.reduce((sum, page) => sum + page.findings.length, 0),
        blockers: 0,
      },
    };
    await store.writeJson("findings/structure-lint.json", structureReport);
    await logger.log({
      type: "run_finished",
      passed: result.gate.passed,
      pages: result.summary.pages,
      blockers: result.gate.issues.filter((issue) => issue.severity === "blocker").length,
      warnings: result.gate.issues.filter((issue) => issue.severity === "warning").length,
    });

    if (options.json) {
      io.stdout(JSON.stringify(jsonSummary(runDir, result.summary)));
    } else {
      printHuman(io, result.summary, runDir);
    }
    return result.gate.passed ? 0 : 1;
  } catch (error) {
    const message = redactValue(errorMessage(error)) as string;
    if (store !== undefined && runDir !== undefined && project !== undefined) {
      await store.writeJson(
        "findings/spec-engineer-gate.json",
        {
          schemaVersion: "1.0",
          project,
          generatedAt: new Date().toISOString(),
          gate: failureSummary(runDir, message).gate,
        }
      );
      await store.writeJson("spec-engineer.json", failureSummary(runDir, message));
    }
    if (options.json) {
      io.stdout(JSON.stringify(failureSummary(runDir ?? null, message)));
    } else {
      io.stderr(`Spec Engineer FAILED: ${message}`);
    }
    return error instanceof SpecCliUsageError ? 2 : 1;
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
