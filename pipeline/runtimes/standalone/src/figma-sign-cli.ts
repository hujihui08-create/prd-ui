import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FigmaSignoffBlockSchema } from "@prd-ui/contracts";

export const USAGE = `Usage:
  pnpm figma:sign --figma <dir> --baseline <dir> --signoff-figma <file> [--json]

Options:
  --figma <dir>           Figma evidence directory (plans/, readback/, diff/, conformance/, parity/)
  --baseline <dir>        Signed visual baseline directory (manifest.json)
  --signoff-figma <file>  Human signoff markdown with a <!-- signoff { ... } --> block
  --json                  Print one JSON summary
  -h, --help              Print this help and exit

The signoff block must carry the five evidence hashes (planHash,
readbackHash, conformanceHash, parityHash, baselineHash). They are
printed on every run that can read the evidence, including a refused
signoff, so the signer can fill in or refresh the block. Hashes are
canonical JSON (keys sorted) with the time-only fields generatedAt/
builtAt dropped, so regenerating semantically identical evidence does
not stale a signature.

Exit codes: 0 signed, 1 refused (gate failure, missing page evidence,
stale signoff), 2 usage or infrastructure error.`;

export class FigmaSignUsageError extends Error {}

/** A gate decision: the evidence was readable but must not be signed. */
export class FigmaSignRefusal extends Error {}

export interface FigmaHashes {
  planHash: string;
  readbackHash: string;
  conformanceHash: string;
  parityHash: string;
  baselineHash: string;
}

export interface FigmaSignOptions {
  figma?: string;
  baseline?: string;
  signoffPath?: string;
  json: boolean;
  help: boolean;
}

const HASH_KEYS = [
  "planHash",
  "readbackHash",
  "conformanceHash",
  "parityHash",
  "baselineHash",
] as const;

/** Time-only fields are dropped so a regeneration does not invalidate a signature. */
const TIMESTAMP_FIELDS = new Set(["generatedAt", "builtAt"]);

const PLAN_FILE = /^figma-plan\.(.+)\.json$/;
const READBACK_FILE = /^figma-readback\.(.+)\.json$/;
const DIFF_FILE = /^figma-diff\.(.+)\.json$/;
const SIGNOFF_BLOCK = /<!--\s*signoff\s*([\s\S]*?)-->/i;

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new FigmaSignUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): FigmaSignOptions {
  const options: FigmaSignOptions = { json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    switch (flag) {
      case "--figma":
        options.figma = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--baseline":
        options.baseline = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--signoff-figma":
        options.signoffPath = path.resolve(readValue(argv, ++index, flag));
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new FigmaSignUsageError(`unknown argument: ${flag}`);
    }
  }
  return options;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function readJson(file: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    throw new Error(`EVIDENCE_READ_FAILED: ${file}: ${errorMessage(error)}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`EVIDENCE_JSON_INVALID: ${file}: ${errorMessage(error)}`);
  }
}

function stripTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripTimestamps(item));
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (TIMESTAMP_FIELDS.has(key)) continue;
      out[key] = stripTimestamps(value[key]);
    }
    return out;
  }
  return value;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function hashJson(value: unknown): string {
  const canonicalValue = canonical(stripTimestamps(value));
  return `sha256:${createHash("sha256").update(canonicalValue).digest("hex")}`;
}

interface PageFile {
  pageId: string;
  file: string;
}

async function listPageFiles(
  dir: string,
  pattern: RegExp,
  kind: string,
  accept: (pageId: string) => boolean = () => true
): Promise<PageFile[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    throw new Error(`EVIDENCE_DIR_MISSING: ${kind} ${dir}: ${errorMessage(error)}`);
  }
  const files: PageFile[] = [];
  for (const file of entries.sort()) {
    const pageId = pattern.exec(file)?.[1];
    if (pageId === undefined || !accept(pageId)) continue;
    files.push({ pageId, file: path.join(dir, file) });
  }
  if (files.length === 0) throw new Error(`EVIDENCE_EMPTY: ${kind} ${dir}`);
  return files;
}

/**
 * Page plans only. `figma-plan.index.json` and `plan-coverage.json` are derived
 * indexes that repeat the plans (and an absolute specRun path), so hashing them
 * would make the signature location-dependent without adding coverage.
 */
async function listPlanFiles(figmaDir: string): Promise<PageFile[]> {
  return listPageFiles(
    path.join(figmaDir, "plans"),
    PLAN_FILE,
    "plans",
    (pageId) => pageId !== "index"
  );
}

function listReadbackFiles(figmaDir: string): Promise<PageFile[]> {
  return listPageFiles(path.join(figmaDir, "readback"), READBACK_FILE, "readback");
}

function listDiffFiles(figmaDir: string): Promise<PageFile[]> {
  return listPageFiles(path.join(figmaDir, "diff"), DIFF_FILE, "diff");
}

/** Hash files by basename so a directory move cannot change the signature. */
async function hashEvidenceFiles(files: string[]): Promise<string> {
  // Code-unit order, not localeCompare: hashes must be identical on every host.
  const ordered = [...files].sort((left, right) => {
    const byName = compareStrings(path.basename(left), path.basename(right));
    return byName !== 0 ? byName : compareStrings(left, right);
  });
  const parts: unknown[] = [];
  for (const file of ordered) {
    parts.push({ file: path.basename(file), body: await readJson(file) });
  }
  return hashJson(parts);
}

export async function computeFigmaHashes(input: {
  figmaDir: string;
  baselineDir: string;
}): Promise<FigmaHashes> {
  const plans = await listPlanFiles(input.figmaDir);
  const readbacks = await listReadbackFiles(input.figmaDir);
  return {
    planHash: await hashEvidenceFiles(plans.map((entry) => entry.file)),
    readbackHash: await hashEvidenceFiles(readbacks.map((entry) => entry.file)),
    conformanceHash: hashJson(
      await readJson(path.join(input.figmaDir, "conformance", "conformance.json"))
    ),
    parityHash: hashJson(await readJson(path.join(input.figmaDir, "parity", "parity.json"))),
    baselineHash: hashJson(await readJson(path.join(input.baselineDir, "manifest.json"))),
  };
}

function comparePages(expected: string[], actual: string[], kind: string): void {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((pageId) => !actualSet.has(pageId));
  if (missing.length > 0) {
    throw new FigmaSignRefusal(`${kind.toUpperCase()}_PAGE_MISSING: ${missing.join(", ")}`);
  }
  const extra = actual.filter((pageId) => !expectedSet.has(pageId));
  if (extra.length > 0) {
    throw new FigmaSignRefusal(`${kind.toUpperCase()}_PAGE_UNEXPECTED: ${extra.join(", ")}`);
  }
}

function requirePageId(body: unknown, pageId: string, file: string): void {
  if (!isRecord(body)) throw new Error(`EVIDENCE_INVALID: ${file} is not an object`);
  if (body.schemaVersion !== "1.0") {
    throw new Error(`EVIDENCE_INVALID: ${file} schemaVersion ${String(body.schemaVersion)}`);
  }
  if (body.pageId !== pageId) {
    throw new Error(`EVIDENCE_PAGE_MISMATCH: ${file} declares ${String(body.pageId)}`);
  }
}

interface LoadedConformance {
  project: string;
  pages: Array<{ pageId: string; passed: boolean }>;
  blockers: number;
}

async function loadConformance(file: string): Promise<LoadedConformance> {
  const body = await readJson(file);
  if (!isRecord(body)) throw new Error(`EVIDENCE_INVALID: ${file} is not an object`);
  if (body.schemaVersion !== "1.0") {
    throw new Error(`EVIDENCE_INVALID: ${file} schemaVersion ${String(body.schemaVersion)}`);
  }
  if (typeof body.project !== "string" || body.project.length === 0) {
    throw new Error(`EVIDENCE_INVALID: ${file} project`);
  }
  const summary = body.summary;
  if (
    !isRecord(summary) ||
    typeof summary.blockers !== "number" ||
    !Number.isInteger(summary.blockers) ||
    summary.blockers < 0
  ) {
    throw new Error(`EVIDENCE_INVALID: ${file} summary.blockers`);
  }
  if (!Array.isArray(body.pages)) throw new Error(`EVIDENCE_INVALID: ${file} pages`);
  const pages = body.pages.map((page) => {
    if (
      !isRecord(page) ||
      typeof page.pageId !== "string" ||
      typeof page.passed !== "boolean"
    ) {
      throw new Error(`EVIDENCE_INVALID: ${file} page entry`);
    }
    return { pageId: page.pageId, passed: page.passed };
  });
  return { project: body.project, pages, blockers: summary.blockers };
}

interface LoadedParity {
  project: string;
  pages: Array<{ pageId: string; passed: boolean }>;
  passed: boolean;
}

async function loadParity(file: string): Promise<LoadedParity> {
  const body = await readJson(file);
  if (!isRecord(body)) throw new Error(`EVIDENCE_INVALID: ${file} is not an object`);
  if (body.schemaVersion !== "1.0") {
    throw new Error(`EVIDENCE_INVALID: ${file} schemaVersion ${String(body.schemaVersion)}`);
  }
  if (typeof body.project !== "string" || body.project.length === 0) {
    throw new Error(`EVIDENCE_INVALID: ${file} project`);
  }
  const summary = body.summary;
  if (!isRecord(summary) || typeof summary.passed !== "boolean") {
    throw new Error(`EVIDENCE_INVALID: ${file} summary.passed`);
  }
  if (!Array.isArray(body.pages)) throw new Error(`EVIDENCE_INVALID: ${file} pages`);
  const pages = body.pages.map((page) => {
    if (
      !isRecord(page) ||
      typeof page.pageId !== "string" ||
      typeof page.passed !== "boolean"
    ) {
      throw new Error(`EVIDENCE_INVALID: ${file} page entry`);
    }
    return { pageId: page.pageId, passed: page.passed };
  });
  return { project: body.project, pages, passed: summary.passed };
}

export interface FigmaEvidenceSummary {
  project: string;
  pageIds: string[];
}

/**
 * Fail-closed gate checks. Throws `FigmaSignRefusal` when readable evidence
 * fails a gate, and a plain `Error` when evidence is missing or malformed.
 */
export async function checkEvidence(input: {
  figmaDir: string;
  baselineDir: string;
}): Promise<FigmaEvidenceSummary> {
  const plans = await listPlanFiles(input.figmaDir);
  const pageIds = plans.map((entry) => entry.pageId);
  for (const plan of plans) {
    requirePageId(await readJson(plan.file), plan.pageId, plan.file);
  }

  const readbacks = await listReadbackFiles(input.figmaDir);
  comparePages(pageIds, readbacks.map((entry) => entry.pageId), "readback");
  for (const readback of readbacks) {
    const body = await readJson(readback.file);
    requirePageId(body, readback.pageId, readback.file);
    const errors = (body as Record<string, unknown>).errors;
    if (!Array.isArray(errors)) {
      throw new Error(`EVIDENCE_INVALID: ${readback.file} errors`);
    }
    if (errors.length > 0) {
      throw new FigmaSignRefusal(
        `READBACK_ERRORS: ${readback.pageId}: ${String(errors[0])}`
      );
    }
  }

  const diffs = await listDiffFiles(input.figmaDir);
  comparePages(pageIds, diffs.map((entry) => entry.pageId), "diff");
  for (const diff of diffs) {
    const body = await readJson(diff.file);
    requirePageId(body, diff.pageId, diff.file);
    if ((body as Record<string, unknown>).passed !== true) {
      throw new FigmaSignRefusal(`FIGMA_VERIFY_FAILED: ${diff.pageId}`);
    }
  }

  const conformance = await loadConformance(
    path.join(input.figmaDir, "conformance", "conformance.json")
  );
  if (conformance.blockers > 0) {
    throw new FigmaSignRefusal(`CONFORMANCE_BLOCKERS: ${conformance.blockers}`);
  }
  const failedConformance = conformance.pages.filter((page) => !page.passed);
  if (failedConformance.length > 0) {
    throw new FigmaSignRefusal(
      `CONFORMANCE_PAGE_FAILED: ${failedConformance.map((page) => page.pageId).join(", ")}`
    );
  }
  comparePages(pageIds, conformance.pages.map((page) => page.pageId), "conformance");

  const parity = await loadParity(path.join(input.figmaDir, "parity", "parity.json"));
  const failedParity = parity.pages.filter((page) => !page.passed);
  if (!parity.passed || failedParity.length > 0) {
    const pages =
      failedParity.length > 0
        ? failedParity.map((page) => page.pageId).join(", ")
        : "summary";
    throw new FigmaSignRefusal(`PARITY_FAILED: ${pages}`);
  }
  comparePages(pageIds, parity.pages.map((page) => page.pageId), "parity");

  if (parity.project !== conformance.project) {
    throw new FigmaSignRefusal(
      `PROJECT_MISMATCH: parity ${parity.project} != conformance ${conformance.project}`
    );
  }
  const baselineFile = path.join(input.baselineDir, "manifest.json");
  const baseline = await readJson(baselineFile);
  if (!isRecord(baseline) || !Array.isArray(baseline.cases) || baseline.cases.length === 0) {
    throw new Error(`BASELINE_MANIFEST_INVALID: ${baselineFile}`);
  }
  if (typeof baseline.project === "string" && baseline.project !== conformance.project) {
    throw new FigmaSignRefusal(
      `PROJECT_MISMATCH: baseline ${baseline.project} != conformance ${conformance.project}`
    );
  }

  return { project: conformance.project, pageIds };
}

export async function signEvidence(input: {
  figmaDir: string;
  signoffPath: string;
  hashes: FigmaHashes;
  project?: string;
}): Promise<{ ok: true; signoff: Record<string, unknown> } | { ok: false; error: string }> {
  let text: string;
  try {
    text = await readFile(input.signoffPath, "utf8");
  } catch (error) {
    return { ok: false, error: `SIGNOFF_READ_FAILED: ${errorMessage(error)}` };
  }
  const match = SIGNOFF_BLOCK.exec(text);
  const blockText = match?.[1];
  if (blockText === undefined) return { ok: false, error: "SIGNOFF_BLOCK_MISSING" };
  let raw: unknown;
  try {
    raw = JSON.parse(blockText.trim()) as unknown;
  } catch {
    return { ok: false, error: "SIGNOFF_BLOCK_INVALID_JSON" };
  }
  const parsed = FigmaSignoffBlockSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `SIGNOFF_BLOCK_INVALID: ${parsed.error.message}` };
  }
  const block = parsed.data;
  for (const key of HASH_KEYS) {
    if (block[key] !== input.hashes[key]) {
      return { ok: false, error: `SIGNOFF_HASH_MISMATCH: ${key}` };
    }
  }
  const signoff: Record<string, unknown> = {
    schemaVersion: "1.0",
    ...(input.project === undefined ? {} : { project: input.project }),
    signer: block.signer,
    date: block.date,
    ...input.hashes,
  };
  await mkdir(path.join(input.figmaDir, "signoff"), { recursive: true });
  await writeFile(
    path.join(input.figmaDir, "signoff", "figma-sign.json"),
    `${JSON.stringify(signoff, null, 2)}\n`,
    "utf8"
  );
  return { ok: true, signoff };
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  let options: FigmaSignOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    io.stderr(errorMessage(error));
    io.stderr(USAGE);
    return 2;
  }
  if (options.help) {
    io.stdout(USAGE);
    return 0;
  }
  if (!options.figma || !options.baseline || !options.signoffPath) {
    io.stderr("missing required --figma/--baseline/--signoff-figma");
    io.stderr(USAGE);
    return 2;
  }

  const printHashes = (hashes: FigmaHashes): void => {
    io.stdout(`Plan: ${hashes.planHash}`);
    io.stdout(`Readback: ${hashes.readbackHash}`);
    io.stdout(`Conformance: ${hashes.conformanceHash}`);
    io.stdout(`Parity: ${hashes.parityHash}`);
    io.stdout(`Baseline: ${hashes.baselineHash}`);
  };

  // The hashes are printed again on refusal so the signer can fill in (or
  // refresh) the signoff block without a separate inspection command.
  const fail = (message: string, hashes?: FigmaHashes): number => {
    if (options.json) {
      io.stdout(
        JSON.stringify({ ok: false, error: message, ...(hashes ?? {}) })
      );
    } else {
      io.stderr(`Figma sign FAILED: ${message}`);
      if (hashes !== undefined) printHashes(hashes);
    }
    return 1;
  };

  let hashes: FigmaHashes | undefined;
  try {
    hashes = await computeFigmaHashes({
      figmaDir: options.figma,
      baselineDir: options.baseline,
    });
    const evidence = await checkEvidence({
      figmaDir: options.figma,
      baselineDir: options.baseline,
    });
    const result = await signEvidence({
      figmaDir: options.figma,
      signoffPath: options.signoffPath,
      hashes,
      project: evidence.project,
    });
    if (!result.ok) return fail(result.error, hashes);

    if (options.json) {
      io.stdout(
        JSON.stringify({
          ok: true,
          project: evidence.project,
          signer: result.signoff.signer,
          date: result.signoff.date,
          pages: evidence.pageIds.length,
          ...hashes,
        })
      );
    } else {
      io.stdout("Figma sign OK: success");
      io.stdout(`Project: ${evidence.project}`);
      io.stdout(
        `Signer: ${String(result.signoff.signer)} (${String(result.signoff.date)})`
      );
      printHashes(hashes);
      io.stdout(`Pages: ${evidence.pageIds.length}`);
      io.stdout(
        `Signoff: ${path.join(options.figma, "signoff", "figma-sign.json")}`
      );
    }
    return 0;
  } catch (error) {
    const message = errorMessage(error);
    if (error instanceof FigmaSignRefusal) return fail(message, hashes);
    io.stderr(message);
    return 2;
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
      process.exitCode = 2;
    });
}
