import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AssetManifestSchema,
  UiBriefSchema,
  type AssetManifest,
  type PageSpec,
  type RunState,
  type UiBrief,
} from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import {
  validateProject,
  type ValidationContext,
  type ValidationReport,
} from "@prd-ui/validators";
import { createRunState, failRun, transition } from "./state-machine.js";

export interface Phase1Options {
  /** Directory that receives `<runId>/...`. Defaults to `<cwd>/runs`. */
  runsDir?: string;
}

export interface Phase1Result {
  runId: string;
  pages: number;
  blockers: number;
  runDir: string;
  passed: boolean;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const pipelineRoot = path.resolve(moduleDir, "..", "..", "..");
const sampleBriefPath = path.join(pipelineRoot, "samples", "ui-brief.sample.json");
const sampleManifestPath = path.join(pipelineRoot, "samples", "asset-manifest.sample.json");

/** Timestamp run id: `run-2026-10-19T10-00-00-000Z` (no `:` or `.`). */
export function createRunId(now = new Date()): string {
  return `run-${now.toISOString().replace(/[:.]/g, "-")}`;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

interface RunLogger {
  log: (message: string) => Promise<void>;
}

async function createLogger(logPath: string): Promise<RunLogger> {
  await mkdir(path.dirname(logPath), { recursive: true });
  return {
    async log(message: string): Promise<void> {
      await writeFile(logPath, `${new Date().toISOString()} ${message}\n`, {
        encoding: "utf8",
        flag: "a",
      });
    },
  };
}

function buildContexts(
  specs: PageSpec[],
  manifest: AssetManifest
): Record<string, ValidationContext> {
  return Object.fromEntries(
    specs.map((spec) => [
      spec.meta.pageId,
      {
        profile: getProfile(spec.meta.profile),
        catalog: getCatalog(spec.meta.profile),
        archetype: getArchetype(spec.meta.archetype),
        manifest,
      },
    ])
  );
}

/**
 * Phase 1A exit check: intake the sample UI brief, compile all pages, validate
 * them against the sample asset manifest, and persist every run artifact.
 */
export async function runPhase1(options: Phase1Options = {}): Promise<Phase1Result> {
  const runsDir = options.runsDir
    ? path.resolve(options.runsDir)
    : path.resolve(process.cwd(), "runs");
  const runId = createRunId();
  const runDir = path.join(runsDir, runId);
  const artifactsDir = path.join(runDir, "artifacts");
  const pageSpecDir = path.join(artifactsDir, "page-spec");
  const reportsDir = path.join(runDir, "reports");
  const logsDir = path.join(runDir, "logs");
  const statePath = path.join(runDir, "state.json");

  await mkdir(pageSpecDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });
  await mkdir(logsDir, { recursive: true });

  const logger = await createLogger(path.join(logsDir, "run.log"));
  let state = createRunState(runId);
  const writeState = async (next: RunState): Promise<RunState> => {
    await writeJson(statePath, next);
    return next;
  };

  await logger.log(`run ${runId} started at stage ${state.stage}`);
  await writeState(state);

  // intake: parse and persist the UI brief.
  const brief = UiBriefSchema.parse(await readJson(sampleBriefPath)) as UiBrief;
  await writeJson(path.join(artifactsDir, "ui-brief.json"), brief);
  state = await writeState(transition(state, "brief"));
  await logger.log(`intake complete: brief ${brief.meta.project}@${brief.meta.version}`);

  // compile: one Page Spec per brief page.
  state = await writeState(transition(state, "compile"));
  const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
  for (const spec of specs) {
    await writeJson(path.join(pageSpecDir, `${spec.meta.pageId}.json`), spec);
  }
  await logger.log(`compile complete: ${specs.length} page specs`);

  // validate: build a context per page from the sample asset manifest.
  state = await writeState(transition(state, "validate"));
  const manifest = AssetManifestSchema.parse(await readJson(sampleManifestPath)) as AssetManifest;
  const contextsByPage = buildContexts(specs, manifest);
  const reports: ValidationReport[] = validateProject(specs, contextsByPage);
  const blockers = reports.reduce((total, report) => total + report.blockers, 0);
  await logger.log(`validate complete: ${blockers} blockers across ${reports.length} pages`);

  // report: persist validation results, then finish or fail the run.
  state = await writeState(transition(state, "report"));
  await writeJson(path.join(reportsDir, "validation.json"), reports);
  await logger.log(`report written: ${path.join(reportsDir, "validation.json")}`);

  if (blockers > 0) {
    state = await writeState(failRun(state));
    await logger.log(`run failed: ${blockers} blockers; stage ${state.stage}`);
    return { runId, pages: specs.length, blockers, runDir, passed: false };
  }

  state = await writeState(transition(state, "done"));
  await logger.log(`run succeeded: stage ${state.stage}`);
  return { runId, pages: specs.length, blockers, runDir, passed: true };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain = invokedPath === fileURLToPath(import.meta.url);

if (isMain) {
  runPhase1()
    .then((result) => {
      if (result.passed) {
        console.log(`Phase 1A OK: ${result.pages} pages, ${result.blockers} blockers`);
        return;
      }
      console.error(
        `Phase 1A FAILED: ${result.pages} pages, ${result.blockers} blockers (${result.runDir})`
      );
      process.exitCode = 1;
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
