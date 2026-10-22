import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactValue } from "@prd-ui/contracts";
import { createRunId } from "@prd-ui/orchestrator";
import {
  buildVisualMatrix,
  runVisualGate,
  visualReviewStatus,
  type ScreenshotEvidence,
  type VisualCase,
  type VisualFinding,
} from "@prd-ui/visual-review";
import { FileArtifactStore } from "./asset/artifact-store.js";
import { captureVisualCases, type CaptureVisualCasesInput } from "./visual/screenshot.js";
import { diffPng as defaultDiffPng } from "./visual/diff.js";
import {
  computeDiffs,
  loadBaseline,
  type DiffPng,
} from "./visual/baseline.js";
import {
  hashValue,
  loadVisualProject,
  manifestCaseFor,
  visualManifestHash,
  type VisualDiffSummary,
  type VisualManifest,
  type VisualManifestCase,
  type VisualRunState,
} from "./visual/manifest.js";
import {
  critiqueToVisualFindings,
  criticUnavailable,
  loadScriptedCriticFixture,
  type VisualCriticInput,
  type VisualCriticRun,
} from "./visual/critic.js";
import { findMatchingSignoff } from "./visual/signoff.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export const USAGE = `Usage: pnpm visual:review [options]

Capture the visual matrix, diff it against a baseline, run the Visual Critic,
and apply the deterministic visual gates. The baseline is never updated by
this command.

Options:
  --project <path>       Project YAML
  --spec-run <dir>       spec:engineer run directory (required)
  --html <dir>           Rendered HTML directory (required)
  --baseline <dir>       Baseline directory with manifest.json (required)
  --runs <dir>           Directory that receives review runs
  --runtime standalone|dsh  Critic runtime (default: standalone)
  --profile <name>       dsh profile; required for --runtime dsh
  --fixtures <dir>       Standalone critic fixture directory
  --max-cost-cny <n>     Visual Critic budget in CNY (default: 3)
  --json                 Print one JSON summary to stdout
  -h, --help             Print this help and exit`;

export interface VisualReviewOptions {
  projectPath: string;
  specRunPath?: string;
  htmlPath?: string;
  baselinePath?: string;
  runsDir: string;
  runtime: "standalone" | "dsh";
  profile?: string;
  fixturesDir: string;
  maxCostCny: number;
  json: boolean;
  help: boolean;
}

export interface VisualReviewDeps {
  captureVisualCases?: (
    input: CaptureVisualCasesInput
  ) => Promise<ScreenshotEvidence[]>;
  diffPng?: DiffPng;
}

export class VisualReviewUsageError extends Error {}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new VisualReviewUsageError(`missing value for ${flag}`);
  }
  return value;
}

function parseNumber(flag: string, value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new VisualReviewUsageError(`invalid value for ${flag}: ${value}`);
  }
  return number;
}

export function parseArgs(argv: string[]): VisualReviewOptions {
  const options: VisualReviewOptions = {
    projectPath: path.join(
      pipelineRoot,
      "samples",
      "projects",
      "employee-app-phase2",
      "project.yaml"
    ),
    runsDir: path.join(pipelineRoot, "runs"),
    runtime: "standalone",
    fixturesDir: path.join(pipelineRoot, "samples", "agents", "visual-critic"),
    maxCostCny: 3,
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
      case "--spec-run":
        options.specRunPath = path.resolve(value());
        break;
      case "--html":
        options.htmlPath = path.resolve(value());
        break;
      case "--baseline":
        options.baselinePath = path.resolve(value());
        break;
      case "--runs":
        options.runsDir = path.resolve(value());
        break;
      case "--runtime": {
        const runtime = value();
        if (runtime !== "standalone" && runtime !== "dsh") {
          throw new VisualReviewUsageError(
            `--runtime must be standalone or dsh, got ${runtime}`
          );
        }
        options.runtime = runtime;
        break;
      }
      case "--profile":
        options.profile = value();
        break;
      case "--fixtures":
        options.fixturesDir = path.resolve(value());
        break;
      case "--max-cost-cny":
        options.maxCostCny = parseNumber(flag, value());
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new VisualReviewUsageError(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function assertHtmlFiles(htmlDir: string, pageIds: string[]): Promise<void> {
  for (const pageId of pageIds) {
    const file = path.join(htmlDir, `${pageId}.html`);
    try {
      await access(file);
    } catch {
      throw new Error(`VISUAL_HTML_MISSING: ${file}`);
    }
  }
}

async function runCritic(input: {
  options: VisualReviewOptions;
  criticInput: VisualCriticInput;
}): Promise<VisualCriticRun> {
  if (input.options.runtime === "dsh") {
    // Task 8 owns the real prd-ui-visual runner. Until then the dsh path fails
    // closed instead of pretending a scripted fixture is a model review.
    return criticUnavailable(
      `VISUAL_CRITIC_DSH_NOT_WIRED: Task 8 owns the prd-ui-visual dsh runner ` +
        `(profile ${input.options.profile ?? "missing"}); deterministic results were kept.`,
      "dsh"
    );
  }

  let fixture;
  try {
    fixture = await loadScriptedCriticFixture(input.options.fixturesDir);
  } catch (error) {
    return criticUnavailable(errorMessage(error), "scripted");
  }

  const findings = critiqueToVisualFindings(fixture.output);
  const usageComplete = fixture.usageComplete ?? fixture.usage !== undefined;
  if (!usageComplete) {
    findings.push({
      id: "VISUAL_USAGE_INCOMPLETE",
      severity: "blocker",
      code: "VISUAL_USAGE_INCOMPLETE",
      message: "the Visual Critic fixture reported incomplete usage",
    });
  }
  const costCny = 0;
  if (costCny > input.options.maxCostCny) {
    findings.push({
      id: "VISUAL_BUDGET_EXCEEDED",
      severity: "blocker",
      code: "VISUAL_BUDGET_EXCEEDED",
      message: `cost ${costCny.toFixed(4)} CNY exceeds limit ${input.options.maxCostCny}`,
    });
  }
  return {
    findings,
    critique: fixture.output,
    ...(fixture.usage === undefined ? {} : { usage: fixture.usage }),
    costCny,
    usageComplete,
    model: "scripted",
  };
}

interface ReviewArtifacts {
  runDir: string;
  runId: string;
  project: string;
  status: "passed" | "awaiting_signoff" | "blocked";
  cases: number;
  screenshots: number;
  diff: VisualDiffSummary;
  findings: VisualFinding[];
  costCny: number;
  usageComplete: boolean;
  manifestHash: string;
  findingsHash: string;
  signoff: { valid: boolean; signer?: string; date?: string; waivedFindings?: string[] };
  critic: { runtime: string; profile?: string; model?: string };
  error?: string;
}

function failureSummary(input: {
  runDir: string | null;
  runId: string | null;
  project: string | null;
  cases: number;
  screenshots: number;
  diff: VisualDiffSummary;
  message: string;
}): Record<string, unknown> {
  const findings: VisualFinding[] = [
    {
      id: "VISUAL_REVIEW_FAILED",
      severity: "blocker",
      code: "VISUAL_REVIEW_FAILED",
      message: input.message,
    },
  ];
  return redactValue({
    runDir: input.runDir,
    runId: input.runId,
    project: input.project,
    status: "blocked",
    cases: input.cases,
    screenshots: input.screenshots,
    diff: input.diff,
    findings,
    costCny: 0,
    usageComplete: false,
    manifestHash: hashValue({}),
    findingsHash: hashValue(findings),
    signoff: { valid: false },
    critic: { runtime: "unavailable" },
    error: input.message,
  }) as Record<string, unknown>;
}

function buildState(input: {
  runId: string;
  project: string;
  status: ReviewArtifacts["status"];
  cases: number;
  screenshots: number;
  diff: VisualDiffSummary;
  findings: VisualFinding[];
  costCny: number;
  usageComplete: boolean;
  manifestHash: string;
  findingsHash: string;
  signoffValid: boolean;
  signer?: string;
  startedAt: string;
  finishedAt: string;
}): VisualRunState {
  const stage: VisualRunState["stage"] =
    input.status === "passed"
      ? "done"
      : input.status === "awaiting_signoff"
        ? "signoff"
        : "review";
  return {
    schemaVersion: "1.0",
    runId: input.runId,
    project: input.project,
    stage,
    status: input.status,
    cases: input.cases,
    screenshots: input.screenshots,
    diff: input.diff,
    findings: input.findings,
    costCny: input.costCny,
    usageComplete: input.usageComplete,
    manifestHash: input.manifestHash,
    findingsHash: input.findingsHash,
    signoff: { visual: input.signoffValid },
    startedAt: input.startedAt,
    updatedAt: input.finishedAt,
    finishedAt: input.finishedAt,
    ...(input.signer === undefined ? {} : { signer: input.signer }),
  };
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  },
  deps: VisualReviewDeps = {}
): Promise<number> {
  let options: VisualReviewOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof VisualReviewUsageError) {
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
  for (const [flag, value] of [
    ["--spec-run", options.specRunPath],
    ["--html", options.htmlPath],
    ["--baseline", options.baselinePath],
  ] as const) {
    if (value === undefined) {
      io.stderr(`missing required ${flag} <dir>`);
      io.stderr(USAGE);
      return 2;
    }
  }
  if (options.runtime === "dsh" && options.profile === undefined) {
    io.stderr("missing required --profile <name> for --runtime dsh");
    io.stderr(USAGE);
    return 2;
  }

  const capture = deps.captureVisualCases ?? captureVisualCases;
  const diffPng = deps.diffPng ?? defaultDiffPng;
  const startedAt = new Date().toISOString();

  let runDir: string | null = null;
  let runId: string | null = null;
  let project: string | null = null;
  let store: FileArtifactStore | undefined;
  let cases: VisualCase[] = [];
  let screenshots: ScreenshotEvidence[] = [];
  let diffSummary: VisualDiffSummary = { passed: 0, failed: 0, missing: 0 };

  const log = async (event: Record<string, unknown>): Promise<void> => {
    if (store === undefined) return;
    await store.appendText(
      "logs/visual.ndjson",
      `${JSON.stringify(
        redactValue({ ...event, timestamp: new Date().toISOString() })
      )}\n`
    );
  };

  try {
    const loaded = await loadVisualProject({
      projectPath: options.projectPath,
      specRunDir: options.specRunPath!,
    });
    project = loaded.project;
    cases = buildVisualMatrix(loaded.specs);
    await assertHtmlFiles(
      options.htmlPath!,
      [...new Set(cases.map((visualCase) => visualCase.pageId))]
    );

    const baseline = await loadBaseline(options.baselinePath!, project);
    const deterministicFindings: VisualFinding[] = [...baseline.findings];

    runId = createRunId();
    runDir = path.join(options.runsDir, runId);
    store = new FileArtifactStore(runDir);
    await log({
      type: "run_started",
      runId,
      project,
      cases: cases.length,
      runtime: options.runtime,
      profile: options.profile ?? null,
    });

    const caseErrors: string[] = [];
    const rawScreenshots = await capture({
      htmlDir: options.htmlPath!,
      cases,
      outDir: path.join(runDir, "screenshots"),
      onCaseError: (caseId, error) => {
        caseErrors.push(`${caseId}: ${errorMessage(error)}`);
      },
    });
    for (const entry of caseErrors) {
      await log({ type: "screenshot_failed", error: entry });
    }
    screenshots = rawScreenshots.map((entry) => {
      const relative = path.relative(runDir!, entry.path).split(path.sep).join("/");
      if (relative.startsWith("../") || path.isAbsolute(relative)) {
        throw new Error(`SCREENSHOT_PATH_ESCAPES_RUN: ${entry.caseId} -> ${entry.path}`);
      }
      return { ...entry, path: relative };
    });
    await log({
      type: "screenshots_captured",
      screenshots: screenshots.length,
      failed: caseErrors.length,
    });

    const shotByCase = new Map(
      screenshots.map((entry) => [entry.caseId, entry])
    );
    const manifestCases: VisualManifestCase[] = [];
    for (const visualCase of cases) {
      const shot = shotByCase.get(visualCase.id);
      if (shot === undefined) continue;
      manifestCases.push(
        manifestCaseFor(visualCase, shot.path, shot.sha256)
      );
    }
    const manifest: VisualManifest = {
      schemaVersion: "1.0",
      project,
      generatedAt: new Date().toISOString(),
      cases: manifestCases,
    };
    const manifestHash = visualManifestHash(manifest);
    await store.writeJson("screenshots/manifest.json", manifest);

    const diffContext = await computeDiffs({
      cases,
      screenshots,
      baselineDir: options.baselinePath!,
      baseline,
      runDir,
      diffPng,
    });
    diffSummary = diffContext.summary;
    deterministicFindings.push(...diffContext.findings);
    await log({ type: "diff_finished", ...diffContext.summary });

    const criticInput: VisualCriticInput = {
      project,
      profile: options.profile ?? loaded.brief.meta.profile,
      visualStyle: loaded.brief.designDirection,
      screenshots: screenshots.map((entry) => ({
        caseId: entry.caseId,
        path: entry.path,
      })),
      specs: loaded.specs,
      findings: deterministicFindings,
    };
    const critic = await runCritic({ options, criticInput });
    const criticFindings = critic.findings;
    await store.writeJson("findings/visual-critic.json", {
      schemaVersion: "1.0",
      project,
      generatedAt: new Date().toISOString(),
      runtime: options.runtime,
      profile: options.profile ?? null,
      model: critic.model ?? null,
      usageComplete: critic.usageComplete,
      usage: critic.usage ?? null,
      costCny: critic.costCny,
      critique: critic.critique ?? null,
      error: critic.error ?? null,
    });
    await log({
      type: "critic_finished",
      runtime: options.runtime,
      model: critic.model ?? null,
      findings: criticFindings.length,
      costCny: critic.costCny,
      usageComplete: critic.usageComplete,
    });

    const gate = runVisualGate({
      cases,
      screenshots,
      findings: [...deterministicFindings, ...criticFindings],
      diff: diffContext.entries,
      baselineCases: baseline.validIds,
    });
    const findings = gate.issues;
    const findingsHash = hashValue(findings);
    const hasBlockingFinding = findings.some(
      (finding) => finding.severity === "blocker"
    );

    const matchedSignoff = await findMatchingSignoff({
      runsDir: options.runsDir,
      currentRunDir: runDir,
      manifestHash,
      findingsHash,
      findings,
      now: new Date(),
    });
    if (matchedSignoff !== undefined) {
      await store.writeText("signoff/visual.md", matchedSignoff.text);
    }
    const signoffValid = matchedSignoff !== undefined;
    const status = visualReviewStatus({
      gatePassed: gate.passed,
      hasBlockingFinding,
      signoffValid,
    });
    const finishedAt = new Date().toISOString();

    await store.writeJson("findings/visual-gate.json", {
      schemaVersion: "1.0",
      project,
      generatedAt: finishedAt,
      gate,
    });

    const artifact: ReviewArtifacts = {
      runDir,
      runId,
      project,
      status,
      cases: cases.length,
      screenshots: screenshots.length,
      diff: diffSummary,
      findings,
      costCny: critic.costCny,
      usageComplete: critic.usageComplete,
      manifestHash,
      findingsHash,
      signoff: {
        valid: signoffValid,
        ...(matchedSignoff === undefined
          ? {}
          : {
              signer: matchedSignoff.signer,
              date: matchedSignoff.date,
              waivedFindings: matchedSignoff.waivedFindings,
            }),
      },
      critic: {
        runtime: options.runtime,
        ...(options.profile === undefined ? {} : { profile: options.profile }),
        ...(critic.model === undefined ? {} : { model: critic.model }),
      },
    };
    const state = buildState({
      runId,
      project,
      status,
      cases: cases.length,
      screenshots: screenshots.length,
      diff: diffSummary,
      findings,
      costCny: critic.costCny,
      usageComplete: critic.usageComplete,
      manifestHash,
      findingsHash,
      signoffValid,
      ...(matchedSignoff === undefined ? {} : { signer: matchedSignoff.signer }),
      startedAt,
      finishedAt,
    });
    await store.writeJson("visual-review.json", artifact);
    await store.writeJson("state.json", state);
    await log({
      type: "run_finished",
      status,
      findings: findings.length,
      blockers: findings.filter((finding) => finding.severity === "blocker")
        .length,
      signoffValid,
    });

    if (options.json) {
      io.stdout(JSON.stringify(redactValue(artifact)));
    } else {
      io.stdout(`Visual review ${status.toUpperCase()}: ${status}`);
      io.stdout(
        `Cases: ${cases.length}, screenshots: ${screenshots.length}, diff passed/failed/missing: ${diffSummary.passed}/${diffSummary.failed}/${diffSummary.missing}`
      );
      io.stdout(
        `Findings: ${findings.filter((finding) => finding.severity === "blocker").length} blockers, ${findings.filter((finding) => finding.severity !== "blocker").length} non-blocking`
      );
      io.stdout(
        `Cost: costCny=${critic.costCny.toFixed(4)} usageComplete=${critic.usageComplete}`
      );
      for (const finding of findings.slice(0, 10)) {
        io.stdout(`- ${finding.severity} ${finding.code}: ${finding.message}`);
      }
      io.stdout(`Manifest: ${manifestHash}`);
      io.stdout(`Findings: ${findingsHash}`);
      io.stdout(`Run: ${runDir}`);
    }
    return status === "passed" ? 0 : 1;
  } catch (error) {
    const message = redactValue(errorMessage(error)) as string;
    if (store !== undefined && runDir !== null && runId !== null && project !== null) {
      const summary = failureSummary({
        runDir,
        runId,
        project,
        cases: cases.length,
        screenshots: screenshots.length,
        diff: diffSummary,
        message,
      });
      try {
        await store.writeJson("visual-review.json", summary);
        await store.writeJson(
          "state.json",
          buildState({
            runId,
            project,
            status: "blocked",
            cases: cases.length,
            screenshots: screenshots.length,
            diff: diffSummary,
            findings: summary.findings as VisualFinding[],
            costCny: 0,
            usageComplete: false,
            manifestHash: summary.manifestHash as string,
            findingsHash: summary.findingsHash as string,
            signoffValid: false,
            startedAt,
            finishedAt: new Date().toISOString(),
          })
        );
        await store.writeJson("findings/visual-gate.json", {
          schemaVersion: "1.0",
          project,
          generatedAt: new Date().toISOString(),
          gate: { passed: false, issues: summary.findings },
        });
        await log({ type: "run_failed", error: message });
      } catch {
        // Preserve the original error; a failed artifact write must not mask it.
      }
    }
    const failure =
      store === undefined
        ? failureSummary({
            runDir,
            runId,
            project,
            cases: cases.length,
            screenshots: screenshots.length,
            diff: diffSummary,
            message,
          })
        : undefined;
    if (options.json) {
      if (failure !== undefined) io.stdout(JSON.stringify(failure));
      else io.stdout(JSON.stringify({ runDir, status: "blocked", error: message }));
    } else {
      io.stderr(`Visual review FAILED: ${message}`);
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
