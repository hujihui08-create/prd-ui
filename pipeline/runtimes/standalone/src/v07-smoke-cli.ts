import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main as conformanceMain } from "./figma-conformance-cli.js";
import { main as parityMain } from "./figma-parity-cli.js";
import { main as measureMain } from "./render-measure-cli.js";
import { main as structureMain } from "./structure-check-cli.js";

export const USAGE = `Usage:
  pnpm v07:smoke --spec-run <dir> --html <dir> --project <yaml> --out <dir> \\
    [--plans <dir>] [--figma <dir>] [--baseline <dir>] [--json]

Runs the v0.7 automated gates in order and stops at the first failure:

  1. figma:conformance  plan styles vs rendered HTML (plans: --plans, default <figma>/plans)
  2. render:measure     per-page height/fold/footer metrics -> <out>/render/metrics
  3. structure:check    measured-structure rules     -> <out>/render/structure
  4. figma:parity       Figma PNGs vs signed baseline (only when both --figma and
                        --baseline are supplied and every figma.<pageId>.png exists)

Conformance evidence is written to <figma>/conformance when --figma is supplied,
otherwise to <out>/conformance. The summary is written to <out>/v07-smoke.json and
printed as one JSON line.

Parity inputs that are not available make the parity step \`skipped\` with an explicit
reason; a skipped parity does not fail the smoke, but the summary then reports
\`paritySkipped: true\` and \`complete: false\` (executed gates passed is not a full pass).

Exit codes: 0 all executed gates passed, 1 gate failure, 2 usage/infrastructure error.`;

export class SmokeUsageError extends Error {}

export interface SmokeOptions {
  specRun?: string;
  html?: string;
  project?: string;
  out?: string;
  plans?: string;
  figma?: string;
  baseline?: string;
  json: boolean;
  help: boolean;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new SmokeUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): SmokeOptions {
  const options: SmokeOptions = { json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    switch (flag) {
      case "--spec-run":
        options.specRun = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--html":
        options.html = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--project":
        options.project = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--out":
        options.out = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--plans":
        options.plans = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--figma":
        options.figma = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--baseline":
        options.baseline = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new SmokeUsageError(`unknown argument: ${flag}`);
    }
  }
  return options;
}

export interface ConformanceStepOptions {
  specRun: string;
  html: string;
  plans: string;
  out: string;
}

export interface MeasureStepOptions {
  specRun: string;
  html: string;
  out: string;
}

export interface StructureStepOptions {
  specRun: string;
  metrics: string;
  project: string;
  out: string;
}

export interface ParityStepOptions {
  figma: string;
  baseline: string;
  specRun: string;
  out: string;
}

/** What a step reports back: its CLI exit code plus a compact summary. */
export interface SmokeStepResult {
  code: number;
  summary: Record<string, unknown>;
  stdout?: string[];
  stderr?: string[];
}

export type SmokeStepStatus = "passed" | "failed" | "error" | "skipped";

export interface SmokeStepSummary {
  status: SmokeStepStatus;
  [key: string]: unknown;
}

export interface SmokeSummary {
  schemaVersion: "1.0";
  generatedAt: string;
  /** True when every gate that actually ran passed. Parity may still be skipped. */
  executedGatesPassed: boolean;
  /** True only when every gate ran and passed (parity included); a skip is not a pass. */
  complete: boolean;
  paritySkipped?: boolean;
  conformance?: SmokeStepSummary;
  measure?: SmokeStepSummary;
  structure?: SmokeStepSummary;
  parity?: SmokeStepSummary;
  stoppedAt?: string;
}

export interface SmokeDeps {
  runConformance?: (options: ConformanceStepOptions) => Promise<SmokeStepResult>;
  runMeasure?: (options: MeasureStepOptions) => Promise<SmokeStepResult>;
  runStructure?: (options: StructureStepOptions) => Promise<SmokeStepResult>;
  runParity?: (options: ParityStepOptions) => Promise<SmokeStepResult>;
  /** Page ids used to decide whether parity has every Figma PNG. */
  pageIds?: (specRun: string) => Promise<string[]>;
  now?: () => Date;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberField(record: Record<string, unknown>, key: string, source: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`V07_SMOKE_EVIDENCE_INVALID: ${source}: ${key} must be a number`);
  }
  return value;
}

function booleanField(record: Record<string, unknown>, key: string, source: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`V07_SMOKE_EVIDENCE_INVALID: ${source}: ${key} must be a boolean`);
  }
  return value;
}

async function readReport(file: string): Promise<Record<string, unknown>> {
  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  if (!isRecord(raw)) {
    throw new Error(`V07_SMOKE_EVIDENCE_INVALID: ${file}: not an object`);
  }
  return raw;
}

function reportSummary(report: Record<string, unknown>, file: string): Record<string, unknown> {
  if (!isRecord(report.summary)) {
    throw new Error(`V07_SMOKE_EVIDENCE_INVALID: ${file}: summary`);
  }
  return report.summary;
}

function captureIo(): {
  io: { stdout: (line: string) => void; stderr: (line: string) => void };
  stdout: string[];
  stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: (line) => {
        stdout.push(line);
      },
      stderr: (line) => {
        stderr.push(line);
      },
    },
    stdout,
    stderr,
  };
}

async function defaultRunConformance(options: ConformanceStepOptions): Promise<SmokeStepResult> {
  const captured = captureIo();
  const code = await conformanceMain(
    ["--spec-run", options.specRun, "--html", options.html, "--plans", options.plans, "--out", options.out],
    captured.io
  );
  const result: SmokeStepResult = {
    code,
    summary: {},
    stdout: captured.stdout,
    stderr: captured.stderr,
  };
  if (code === 2) return result;
  const file = path.join(options.out, "conformance.json");
  const report = await readReport(file);
  const summary = reportSummary(report, file);
  return {
    ...result,
    summary: {
      passed: numberField(summary, "blockers", `${file} summary`) === 0,
      blockers: numberField(summary, "blockers", `${file} summary`),
      majors: numberField(summary, "majors", `${file} summary`),
      pages: numberField(summary, "pages", `${file} summary`),
    },
  };
}

async function defaultRunMeasure(options: MeasureStepOptions): Promise<SmokeStepResult> {
  const captured = captureIo();
  const code = await measureMain(
    ["--spec-run", options.specRun, "--html", options.html, "--out", options.out],
    captured.io
  );
  const result: SmokeStepResult = {
    code,
    summary: {},
    stdout: captured.stdout,
    stderr: captured.stderr,
  };
  if (code === 2) return result;
  const file = path.join(options.out, "render-metrics.json");
  const report = await readReport(file);
  if (!Array.isArray(report.pages)) {
    throw new Error(`V07_SMOKE_EVIDENCE_INVALID: ${file}: pages`);
  }
  return { ...result, summary: { pages: report.pages.length } };
}

export async function defaultRunStructure(options: StructureStepOptions): Promise<SmokeStepResult> {
  const captured = captureIo();
  const code = await structureMain(
    [
      "--spec-run",
      options.specRun,
      "--metrics",
      options.metrics,
      "--project",
      options.project,
      "--out",
      options.out,
    ],
    captured.io
  );
  const result: SmokeStepResult = {
    code,
    summary: {},
    stdout: captured.stdout,
    stderr: captured.stderr,
  };
  if (code === 2) return result;
  const file = path.join(options.out, "structure-measured.json");
  const report = await readReport(file);
  const summary = reportSummary(report, file);
  return {
    ...result,
    summary: {
      warnings: numberField(summary, "warnings", `${file} summary`),
      blockers: numberField(summary, "blockers", `${file} summary`),
    },
  };
}

async function defaultRunParity(options: ParityStepOptions): Promise<SmokeStepResult> {
  const captured = captureIo();
  const code = await parityMain(
    [
      "--figma",
      options.figma,
      "--baseline",
      options.baseline,
      "--spec-run",
      options.specRun,
      "--out",
      options.out,
    ],
    captured.io
  );
  const result: SmokeStepResult = {
    code,
    summary: {},
    stdout: captured.stdout,
    stderr: captured.stderr,
  };
  if (code === 2) return result;
  const file = path.join(options.out, "parity.json");
  const report = await readReport(file);
  const summary = reportSummary(report, file);
  return {
    ...result,
    summary: {
      passed: booleanField(summary, "passed", `${file} summary`),
      failed: numberField(summary, "failed", `${file} summary`),
      pages: numberField(summary, "pages", `${file} summary`),
    },
  };
}

export async function defaultPageIds(specRun: string): Promise<string[]> {
  const dir = path.join(specRun, "artifacts", "page-spec");
  let files: string[];
  try {
    files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  } catch (error) {
    throw new Error(`SPEC_RUN_INVALID: ${dir}: ${errorMessage(error)}`);
  }
  if (files.length === 0) throw new Error(`SPEC_RUN_EMPTY: ${dir}`);
  return files.map((file) => path.basename(file, ".json"));
}

/** Repository root, derived from this file so evidence never leaks a host path. */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * Repo-relative path for summaries and skip reasons. Targets outside the repo
 * are shown as `<external>/<basename>` so committed evidence stays portable.
 */
export function displayPath(target: string): string {
  const relative = path.relative(REPO_ROOT, target).split(path.sep).join("/");
  if (relative.length === 0) return ".";
  if (relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
    return `<external>/${path.basename(target)}`;
  }
  return relative;
}

/**
 * Input-side parity preconditions. These do not need page ids, so a missing
 * `--figma`/`--baseline`/baseline manifest is reported before the spec run is
 * read (a missing page-spec must not turn a skippable parity into an error).
 */
async function parityInputSkipReason(options: SmokeOptions): Promise<string | undefined> {
  if (options.figma === undefined && options.baseline === undefined) {
    return "missing --figma and --baseline (parity inputs not supplied)";
  }
  if (options.figma === undefined) return "missing --figma";
  if (options.baseline === undefined) return "missing --baseline";
  const manifest = path.join(options.baseline, "manifest.json");
  if (!(await pathExists(manifest))) {
    return `missing baseline manifest: ${displayPath(manifest)}`;
  }
  return undefined;
}

/**
 * Parity is attempted only when both inputs are supplied and every page has a
 * Figma PNG. A missing input is an explicit skip, not a silent pass and not a
 * gate failure; handoff:pack remains the fail-closed check for the full package.
 */
export async function paritySkipReason(
  options: SmokeOptions,
  pageIds: string[]
): Promise<string | undefined> {
  const inputReason = await parityInputSkipReason(options);
  if (inputReason !== undefined) return inputReason;
  const dir = path.join(options.figma!, "parity");
  const missing: string[] = [];
  for (const pageId of pageIds) {
    if (!(await pathExists(path.join(dir, `figma.${pageId}.png`)))) missing.push(pageId);
  }
  if (missing.length > 0) {
    return `missing Figma PNGs in ${displayPath(dir)}: ${missing.join(", ")}`;
  }
  return undefined;
}

interface StepRun {
  summary: SmokeStepSummary;
  lines: string[];
}

async function runStep(
  run: () => Promise<SmokeStepResult>,
  label: string
): Promise<StepRun> {
  try {
    const result = await run();
    const status: SmokeStepStatus =
      result.code === 0 ? "passed" : result.code === 1 ? "failed" : "error";
    return {
      summary: { status, ...result.summary },
      lines: [...(result.stdout ?? []), ...(result.stderr ?? [])],
    };
  } catch (error) {
    return {
      summary: { status: "error", error: `${label}: ${errorMessage(error)}` },
      lines: [`${label}: ${errorMessage(error)}`],
    };
  }
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  },
  deps: SmokeDeps = {}
): Promise<number> {
  let options: SmokeOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof SmokeUsageError) {
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
  if (!options.specRun || !options.html || !options.project || !options.out) {
    io.stderr("missing required --spec-run/--html/--project/--out");
    io.stderr(USAGE);
    return 2;
  }
  const plansDir = options.plans ?? (options.figma === undefined ? undefined : path.join(options.figma, "plans"));
  if (plansDir === undefined) {
    io.stderr("missing --plans or --figma (figma:conformance needs a plan directory)");
    io.stderr(USAGE);
    return 2;
  }

  const runConformance = deps.runConformance ?? defaultRunConformance;
  const runMeasure = deps.runMeasure ?? defaultRunMeasure;
  const runStructure = deps.runStructure ?? defaultRunStructure;
  const runParity = deps.runParity ?? defaultRunParity;
  const loadPageIds = deps.pageIds ?? defaultPageIds;
  const now = deps.now ?? (() => new Date());

  const summary: SmokeSummary = {
    schemaVersion: "1.0",
    generatedAt: now().toISOString(),
    executedGatesPassed: false,
    complete: false,
  };
  const printed: string[] = [];
  let exitCode = 0;

  const record = (
    name: "conformance" | "measure" | "structure" | "parity",
    step: StepRun
  ): boolean => {
    summary[name] = step.summary;
    printed.push(...step.lines);
    const status = step.summary.status;
    if (status === "error") {
      exitCode = 2;
      summary.stoppedAt = name;
      return false;
    }
    if (status === "failed") {
      exitCode = Math.max(exitCode, 1);
      summary.stoppedAt = name;
      return false;
    }
    return true;
  };

  const conformance = await runStep(
    () =>
      runConformance({
        specRun: options.specRun!,
        html: options.html!,
        plans: plansDir,
        out: options.figma === undefined ? path.join(options.out!, "conformance") : path.join(options.figma, "conformance"),
      }),
    "figma:conformance"
  );
  if (!record("conformance", conformance)) return finish(summary, printed, exitCode, options, io);

  const measure = await runStep(
    () =>
      runMeasure({
        specRun: options.specRun!,
        html: options.html!,
        out: path.join(options.out!, "render", "metrics"),
      }),
    "render:measure"
  );
  if (!record("measure", measure)) return finish(summary, printed, exitCode, options, io);

  const structure = await runStep(
    () =>
      runStructure({
        specRun: options.specRun!,
        metrics: path.join(options.out!, "render", "metrics", "render-metrics.json"),
        project: options.project!,
        out: path.join(options.out!, "render", "structure"),
      }),
    "structure:check"
  );
  if (!record("structure", structure)) return finish(summary, printed, exitCode, options, io);

  // Resolve input-side skips first; a missing spec run only matters when parity
  // actually has both inputs and therefore must be attempted.
  let skipReason = await parityInputSkipReason(options);
  if (skipReason === undefined) {
    let pageIds: string[];
    try {
      pageIds = await loadPageIds(options.specRun);
    } catch (error) {
      summary.parity = { status: "error", error: errorMessage(error) };
      summary.stoppedAt = "parity";
      return finish(summary, printed, 2, options, io);
    }
    skipReason = await paritySkipReason(options, pageIds);
  }
  if (skipReason !== undefined) {
    summary.parity = { status: "skipped", reason: skipReason };
  } else {
    const parity = await runStep(
      () =>
        runParity({
          figma: path.join(options.figma!, "parity"),
          baseline: options.baseline!,
          specRun: options.specRun!,
          out: path.join(options.figma!, "parity"),
        }),
      "figma:parity"
    );
    if (!record("parity", parity)) return finish(summary, printed, exitCode, options, io);
  }

  return finish(summary, printed, exitCode, options, io);
}

async function finish(
  summary: SmokeSummary,
  printed: string[],
  exitCode: number,
  options: SmokeOptions,
  io: { stdout: (line: string) => void; stderr: (line: string) => void }
): Promise<number> {
  summary.executedGatesPassed = exitCode === 0;
  summary.complete =
    summary.executedGatesPassed &&
    summary.conformance?.status === "passed" &&
    summary.measure?.status === "passed" &&
    summary.structure?.status === "passed" &&
    summary.parity?.status === "passed";
  if (summary.parity?.status === "skipped") {
    summary.paritySkipped = true;
  } else {
    delete summary.paritySkipped;
  }
  const file = path.join(options.out!, "v07-smoke.json");
  try {
    await mkdir(options.out!, { recursive: true });
    await writeFile(file, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  } catch (error) {
    io.stderr(`V07_SMOKE_SUMMARY_WRITE_FAILED: ${errorMessage(error)}`);
    return 2;
  }
  if (!options.json) {
    for (const line of printed) io.stdout(line);
    const label = summary.complete
      ? "complete (all gates passed)"
      : summary.executedGatesPassed
        ? "executed gates passed (parity skipped)"
        : exitCode === 2
          ? "error"
          : "failed";
    io.stdout(`v07:smoke ${label} -> ${file}`);
  }
  io.stdout(JSON.stringify(summary));
  return exitCode;
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
      process.exitCode = 2;
    });
}
