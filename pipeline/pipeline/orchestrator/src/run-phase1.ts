import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AssetManifestSchema,
  UiBriefSchema,
  type AssetManifest,
  type PageSpec,
  type ProjectConfig,
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
import { loadProjectConfig } from "./project-config.js";
import { createRunState, failRun, transition } from "./state-machine.js";

export interface Phase1Options {
  /** Project YAML file. Defaults to `samples/project.demo-orders.yaml` when no custom input is given. */
  projectPath?: string;
  /** UI brief JSON. Overrides the project config's `brief` when both are provided. */
  briefPath?: string;
  /**
   * Asset manifests keyed by profile. These are merged over the project
   * config's manifests; relative paths are resolved against the working
   * directory (project config paths resolve against the project file).
   */
  manifests?: Record<string, string>;
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

interface BriefGateFailure {
  ruleId: "BRIEF-BLOCKING-QUESTION" | "BRIEF-UNMAPPED" | "BRIEF-REQ-UNMAPPED";
  location: string;
  evidence: string;
  issue: string;
}

interface RunLevelFailure {
  ruleId: string;
  location: string;
  evidence: string;
  issue: string;
}

interface ResolvedPhase1Inputs {
  briefPath: string;
  manifestPaths: Record<string, string>;
  runsDir: string;
  project?: ProjectConfig;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const pipelineRoot = path.resolve(moduleDir, "..", "..", "..");
const defaultProjectPath = path.join(pipelineRoot, "samples", "project.demo-orders.yaml");

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/**
 * Resolve the brief, manifests, and runs directory before a run starts.
 * A project config supplies paths relative to its own directory; explicit CLI
 * overrides use the working directory. A custom brief without any manifests
 * is rejected rather than falling back to the sample project.
 */
function resolveInputs(options: Phase1Options): ResolvedPhase1Inputs {
  const hasManifestOverrides = Object.keys(options.manifests ?? {}).length > 0;
  const useDefaultProject =
    !options.projectPath && !options.briefPath && !hasManifestOverrides;
  const projectPath = options.projectPath
    ? path.resolve(options.projectPath)
    : useDefaultProject
      ? defaultProjectPath
      : undefined;

  if (!projectPath && !options.briefPath) {
    throw new Error("missing brief: pass --brief <path> or --project <path>");
  }
  if (!projectPath && !hasManifestOverrides) {
    throw new Error(
      "missing manifests: pass --manifest <profile>=<path> or --project"
    );
  }

  let project: ProjectConfig | undefined;
  let baseDir = process.cwd();
  if (projectPath) {
    const loaded = loadProjectConfig(projectPath);
    project = loaded.config;
    baseDir = loaded.baseDir;
  }

  const briefPath = options.briefPath
    ? path.resolve(options.briefPath)
    : path.resolve(baseDir, project!.brief);

  const manifestPaths: Record<string, string> = {};
  if (project) {
    for (const [profile, manifestPath] of Object.entries(project.manifests)) {
      manifestPaths[profile] = path.resolve(baseDir, manifestPath);
    }
  }
  for (const [profile, manifestPath] of Object.entries(options.manifests ?? {})) {
    manifestPaths[profile] = path.resolve(manifestPath);
  }

  const runsDir = options.runsDir
    ? path.resolve(options.runsDir)
    : project?.runsDir
      ? path.resolve(baseDir, project.runsDir)
      : path.resolve(process.cwd(), "runs");

  return { briefPath, manifestPaths, runsDir, project };
}

/**
 * Gate the brief before any page is compiled: blocking questions, unmapped
 * requirements, and page requirement refs that do not appear in the reqMap all
 * block the run.
 */
function checkBriefGate(brief: UiBrief): BriefGateFailure[] {
  const failures: BriefGateFailure[] = [];

  brief.openQuestions.forEach((question, index) => {
    if (!question.blocking) return;
    failures.push({
      ruleId: "BRIEF-BLOCKING-QUESTION",
      location: `openQuestions[${index}]`,
      evidence: question.id,
      issue: `Blocking open question "${question.id}": ${question.question}`,
    });
  });

  brief.traceability.unmapped.forEach((requirement, index) => {
    failures.push({
      ruleId: "BRIEF-UNMAPPED",
      location: `traceability.unmapped[${index}]`,
      evidence: requirement,
      issue: `Requirement "${requirement}" is not mapped to a page.`,
    });
  });

  const reqMap = brief.traceability.reqMap;
  brief.ia.pages.forEach((page) => {
    page.reqRefs.forEach((requirement) => {
      if (Object.prototype.hasOwnProperty.call(reqMap, requirement)) return;
      failures.push({
        ruleId: "BRIEF-REQ-UNMAPPED",
        location: `ia.pages[id=${page.id}].reqRefs`,
        evidence: requirement,
        issue: `Page "${page.id}" references "${requirement}", which is missing from traceability.reqMap.`,
      });
    });
  });

  return failures;
}

/** Defensive duplicate check; `UiBriefSchema` also rejects duplicate ids. */
function assertUniquePageIds(brief: UiBrief): void {
  const seen = new Set<string>();
  for (const page of brief.ia.pages) {
    if (seen.has(page.id)) {
      throw new Error(`Duplicate page id "${page.id}" in UI brief.`);
    }
    seen.add(page.id);
  }
}

async function readManifests(
  manifestPaths: Record<string, string>
): Promise<Record<string, AssetManifest>> {
  const entries = await Promise.all(
    Object.entries(manifestPaths).map(async ([profile, filePath]) => {
      try {
        const manifest = AssetManifestSchema.parse(
          await readJson(filePath)
        ) as AssetManifest;
        return [profile, manifest] as const;
      } catch (error) {
        throw new Error(
          `Invalid asset manifest for profile "${profile}" at ${filePath}: ${errorMessage(error)}`,
          { cause: error }
        );
      }
    })
  );
  return Object.fromEntries(entries);
}

/**
 * Check that every page profile has a manifest and that each manifest declares
 * the profile key it is filed under and the project from the brief/config.
 */
function checkManifests(
  brief: UiBrief,
  manifestsByProfile: Record<string, AssetManifest>,
  expectedProject: string
): RunLevelFailure[] {
  const failures: RunLevelFailure[] = [];

  for (const [profile, manifest] of Object.entries(manifestsByProfile)) {
    if (manifest.profile !== profile) {
      failures.push({
        ruleId: "PROJECT-MANIFEST-PROFILE",
        location: `manifests[${profile}]`,
        evidence: manifest.profile,
        issue: `Manifest filed under profile "${profile}" declares profile "${manifest.profile}".`,
      });
    }
    if (manifest.project !== expectedProject) {
      failures.push({
        ruleId: "PROJECT-MANIFEST-PROJECT",
        location: `manifests[${profile}]`,
        evidence: manifest.project,
        issue: `Manifest for profile "${profile}" belongs to project "${manifest.project}", expected "${expectedProject}".`,
      });
    }
  }

  const missingByProfile = new Map<string, string[]>();
  for (const page of brief.ia.pages) {
    if (manifestsByProfile[page.profile]) continue;
    const pages = missingByProfile.get(page.profile) ?? [];
    pages.push(page.id);
    missingByProfile.set(page.profile, pages);
  }

  for (const [profile, pageIds] of missingByProfile) {
    failures.push({
      ruleId: "PROJECT-MANIFEST-MISSING",
      location: `manifests[${profile}]`,
      evidence: profile,
      issue: `No asset manifest for profile "${profile}" required by page(s): ${pageIds.join(", ")}.`,
    });
  }

  return failures;
}

function buildContexts(
  specs: PageSpec[],
  brief: UiBrief,
  manifestsByProfile: Record<string, AssetManifest>
): Record<string, ValidationContext> {
  const pagesById = new Map(brief.ia.pages.map((page) => [page.id, page]));
  return Object.fromEntries(
    specs.map((spec) => {
      const manifest = manifestsByProfile[spec.meta.profile];
      if (!manifest) {
        throw new Error(
          `No asset manifest for profile "${spec.meta.profile}" (page "${spec.meta.pageId}").`
        );
      }
      const page = pagesById.get(spec.meta.pageId);
      return [
        spec.meta.pageId,
        {
          profile: getProfile(spec.meta.profile),
          catalog: getCatalog(spec.meta.profile),
          archetype: getArchetype(spec.meta.archetype),
          manifest,
          requiredStates: page?.requiredStates,
          briefPage: page,
          navigation: brief.ia.navigation,
        },
      ];
    })
  );
}

/**
 * Phase 1A exit check: intake the UI brief, gate it, compile all pages,
 * validate them against the per-profile asset manifests, and persist every run
 * artifact. Parse/compile/validation infrastructure errors write a failed
 * state and log line before propagating to the caller.
 *
 * Project-level problems (project/brief mismatch, manifest selection) are
 * recorded as failed runs and returned as `passed: false`, so the CLI can
 * print the run directory and exit 1.
 */
export async function runPhase1(options: Phase1Options = {}): Promise<Phase1Result> {
  const inputs = resolveInputs(options);
  const runId = createRunId();
  const runDir = path.join(inputs.runsDir, runId);
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

  const failRunWith = async (
    failures: RunLevelFailure[],
    pages: number
  ): Promise<Phase1Result> => {
    for (const failure of failures) {
      await logger.log(
        `run failed: ${failure.ruleId} at ${failure.location}: ${failure.issue}`
      );
    }
    const gates = { ...state.gates };
    if (gates.brief !== "passed") gates.brief = "failed";
    state = await writeState({ ...failRun(state), gates });
    await logger.log(
      `run failed: ${failures.length} project blockers; stage ${state.stage}`
    );
    return {
      runId,
      pages,
      blockers: failures.length,
      runDir,
      passed: false,
    };
  };

  try {
    await logger.log(`run ${runId} started at stage ${state.stage}`);
    await writeState(state);

    // intake: parse and persist the UI brief.
    let brief: UiBrief;
    try {
      brief = UiBriefSchema.parse(await readJson(inputs.briefPath)) as UiBrief;
    } catch (error) {
      throw new Error(`Invalid UI brief at ${inputs.briefPath}: ${errorMessage(error)}`, {
        cause: error,
      });
    }
    assertUniquePageIds(brief);
    await writeJson(path.join(artifactsDir, "ui-brief.json"), brief);

    // project config: the config project and brief project must agree.
    if (inputs.project && inputs.project.project !== brief.meta.project) {
      return await failRunWith(
        [
          {
            ruleId: "PROJECT-MISMATCH",
            location: inputs.project.project,
            evidence: brief.meta.project,
            issue: `Project config declares "${inputs.project.project}" but brief "${inputs.briefPath}" declares "${brief.meta.project}".`,
          },
        ],
        0
      );
    }
    const expectedProject = inputs.project?.project ?? brief.meta.project;

    // brief gate: only pass after blocking questions, unmapped requirements,
    // and page reqRefs have all been checked.
    const gateFailures = checkBriefGate(brief);
    if (gateFailures.length > 0) {
      for (const failure of gateFailures) {
        await logger.log(
          `brief gate failed: ${failure.ruleId} at ${failure.location}: ${failure.issue}`
        );
      }
      state = await writeState({
        ...failRun(state),
        gates: { ...state.gates, brief: "failed" },
      });
      await logger.log(
        `run failed: ${gateFailures.length} brief blockers; stage ${state.stage}`
      );
      return { runId, pages: 0, blockers: gateFailures.length, runDir, passed: false };
    }

    state = await writeState(
      transition({ ...state, gates: { ...state.gates, brief: "passed" } }, "brief")
    );
    await logger.log(`intake complete: brief ${brief.meta.project}@${brief.meta.version}`);

    // project manifests: read every configured manifest, then require one for
    // each profile the brief's pages use.
    const manifestsByProfile = await readManifests(inputs.manifestPaths);
    const manifestFailures = checkManifests(brief, manifestsByProfile, expectedProject);
    if (manifestFailures.length > 0) {
      return await failRunWith(manifestFailures, 0);
    }

    // compile: one Page Spec per brief page.
    state = await writeState(transition(state, "compile"));
    const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
    for (const spec of specs) {
      await writeJson(path.join(pageSpecDir, `${spec.meta.pageId}.json`), spec);
    }
    await logger.log(`compile complete: ${specs.length} page specs`);

    // validate: build a context per page from its profile's asset manifest.
    state = await writeState(transition(state, "validate"));
    const contextsByPage = buildContexts(specs, brief, manifestsByProfile);
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
  } catch (error) {
    const gates = { ...state.gates };
    if (gates.brief !== "passed") gates.brief = "failed";
    state = await writeState({ ...failRun(state), gates });
    await logger.log(`run failed: ${errorMessage(error).replace(/\s+/g, " ").trim()}`);
    throw error;
  }
}
