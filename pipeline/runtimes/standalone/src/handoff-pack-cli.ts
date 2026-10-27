import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSignoffMarkdown } from "@prd-ui/agents";
import { verifyBlockManifest } from "@prd-ui/compiler";
import {
  FigmaReadbackSchema,
  PageSpecSchema,
  type BlockManifest,
  type FigmaDiff,
  type FigmaReadback,
  type HandoffAsset,
  type HandoffInput,
  type HandoffIssue,
  type HandoffSignoff,
  type PageSpec,
} from "@prd-ui/contracts";
import { buildHandoffManifest, validateHandoff } from "@prd-ui/handoff";
import { compareDiffEvidence } from "@prd-ui/figma";
import {
  loadDiffEvidence,
  loadPlanEvidence,
  recomputeFigmaDiff,
  verifyParityEvidence,
  type BaselineCaseFile,
} from "./figma/evidence.js";
import {
  computeFigmaHashes,
  figmaSignHash,
  hashJson,
  type FigmaHashes,
} from "./figma-sign-cli.js";
import {
  assertNoPlaceholders,
  generateHandoffMd,
  generateLicensesMd,
  type HandoffDocsInput,
  type HandoffDocsPage,
} from "./handoff/docs.js";
import {
  collectFiles,
  copyDirectory,
  copyFileInto,
  pathExists,
  writeHandoffZip,
} from "./handoff/files.js";
import {
  hashFile,
  hashValue,
  parseVisualRunState,
  readVisualManifest,
  verifyManifestFiles,
  visualManifestHash,
  type VisualRunState,
} from "./visual/manifest.js";
import { validateVisualSignoff } from "./visual/signoff.js";

export const USAGE = `Usage:
  pnpm handoff:pack --spec-run <dir> --html <dir> --figma <dir> --visual-run <dir> \\
    --out <dir> [--assets <dir>] [--baseline <dir>] [--metrics <file>] [--zip] [--json]

Options:
  --spec-run <dir>   Completed spec:engineer run (artifacts/page-spec, findings/)
  --html <dir>       Rendered HTML directory (one <pageId>.html per spec)
  --figma <dir>      Figma evidence directory (plans/, readback/, diff/,
                     conformance/, parity/, signoff/)
  --visual-run <dir> Signed visual review run (state.json, visual-sign.json,
                     screenshots/, signoff/visual.md, htmlHashes)
  --assets <dir>     Asset package directory with manifest.json license records
  --baseline <dir>   Signed visual baseline directory. Defaults to
                     <visual-run>/baseline, <visual-run>/baseline-manifest.json,
                     then pipeline/baselines/<project> when present
  --metrics <file>   render:measure output. Defaults to <html>/../render/metrics/
                     render-metrics.json, <html>/../render-metrics.json,
                     <html>/render-metrics.json, or <spec-run>/render-metrics.json
  --out <dir>        Output handoff directory
  --zip              Also write handoff.zip and record its hash in the manifest
  --json             Print one JSON summary
  -h, --help         Print this help and exit

The pack is fail-closed: every gate and signoff is checked before the output
directory is replaced, evidence is staged in a temporary directory that is
removed on failure, and handoff.manifest.json never lists itself. Figma diffs
are re-derived from the current plan + readback, parity PNG hashes are
re-checked, and the supplied HTML/spec bytes must match the inputs recorded by
figma:conformance and visual:review.

Exit codes: 0 packed, 1 gate/signoff failure, 2 usage or infrastructure error.`;

export const PIPELINE_VERSION = "0.7.0";

const KNOWN_GAPS = [
  "Figma loading/empty/error/business state frames are not included",
  "Figma files are referenced by fileKey; no .fig binary is bundled",
];

export class HandoffPackUsageError extends Error {}

export interface HandoffPackOptions {
  specRun?: string;
  html?: string;
  figma?: string;
  visualRun?: string;
  assets?: string;
  baseline?: string;
  metrics?: string;
  out?: string;
  zip: boolean;
  json: boolean;
  help: boolean;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new HandoffPackUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): HandoffPackOptions {
  const options: HandoffPackOptions = { zip: false, json: false, help: false };
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
      case "--spec-run":
        options.specRun = path.resolve(value());
        break;
      case "--html":
        options.html = path.resolve(value());
        break;
      case "--figma":
        options.figma = path.resolve(value());
        break;
      case "--visual-run":
        options.visualRun = path.resolve(value());
        break;
      case "--assets":
        options.assets = path.resolve(value());
        break;
      case "--baseline":
        options.baseline = path.resolve(value());
        break;
      case "--metrics":
        options.metrics = path.resolve(value());
        break;
      case "--out":
        options.out = path.resolve(value());
        break;
      case "--zip":
        options.zip = true;
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new HandoffPackUsageError(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isSafeRelative(relative: string): boolean {
  if (relative.length === 0 || path.isAbsolute(relative)) return false;
  const parts = relative.replace(/\\/g, "/").split("/");
  return !parts.includes("..");
}

function blocker(code: HandoffIssue["code"], message: string): HandoffIssue {
  return { code, severity: "blocker", message };
}

async function readText(file: string): Promise<string> {
  return readFile(file, "utf8");
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readText(file)) as unknown;
}

function stringField(value: Record<string, unknown>, key: string, source: string): string {
  const entry = value[key];
  if (typeof entry !== "string" || entry.trim().length === 0) {
    throw new Error(`HANDOFF_EVIDENCE_INVALID: ${source}: ${key} must be a non-empty string`);
  }
  return entry;
}

function numberField(value: Record<string, unknown>, key: string, source: string): number {
  const entry = value[key];
  if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 0) {
    throw new Error(`HANDOFF_EVIDENCE_INVALID: ${source}: ${key} must be a non-negative integer`);
  }
  return entry;
}

function booleanField(value: Record<string, unknown>, key: string, source: string): boolean {
  const entry = value[key];
  if (typeof entry !== "boolean") {
    throw new Error(`HANDOFF_EVIDENCE_INVALID: ${source}: ${key} must be a boolean`);
  }
  return entry;
}

interface LoadedSpec {
  spec: PageSpec;
  file: string;
}

async function loadSpecs(specRun: string): Promise<LoadedSpec[]> {
  const dir = path.join(specRun, "artifacts", "page-spec");
  let files: string[];
  try {
    files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort(compareStrings);
  } catch (error) {
    throw new Error(`SPEC_RUN_INVALID: ${dir}: ${errorMessage(error)}`);
  }
  if (files.length === 0) throw new Error(`SPEC_RUN_EMPTY: ${dir}`);
  const specs: LoadedSpec[] = [];
  const seen = new Map<string, string>();
  for (const file of files) {
    const absolute = path.join(dir, file);
    const raw = await readJson(absolute);
    const parsed = PageSpecSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`PAGE_SPEC_INVALID: ${file}: ${parsed.error.message}`);
    }
    const pageId = parsed.data.meta.pageId;
    const existing = seen.get(pageId);
    if (existing !== undefined) {
      throw new Error(`SPEC_PAGE_DUPLICATE: ${pageId} (${existing}, ${file})`);
    }
    seen.set(pageId, file);
    specs.push({ spec: parsed.data, file: absolute });
  }
  return specs.sort((left, right) =>
    compareStrings(left.spec.meta.pageId, right.spec.meta.pageId)
  );
}

interface LoadedReadback {
  pageId: string;
  fileKey?: string;
  errors: string[];
  readback: FigmaReadback;
}

async function loadReadback(
  figmaDir: string,
  pageId: string,
  source: "scratch" | "delivery"
): Promise<LoadedReadback | undefined> {
  const file =
    source === "scratch"
      ? path.join(figmaDir, "readback", `figma-readback.${pageId}.json`)
      : path.join(figmaDir, "readback", "delivery", `figma-readback.${pageId}.json`);
  let raw: unknown;
  try {
    raw = await readJson(file);
  } catch {
    return undefined;
  }
  const parsed = FigmaReadbackSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`HANDOFF_EVIDENCE_INVALID: ${file}: ${parsed.error.message}`);
  }
  if (parsed.data.pageId !== pageId) {
    throw new Error(`HANDOFF_EVIDENCE_INVALID: ${file}: pageId ${parsed.data.pageId}`);
  }
  return {
    pageId,
    ...(parsed.data.fileKey === undefined ? {} : { fileKey: parsed.data.fileKey }),
    errors: parsed.data.errors,
    readback: parsed.data,
  };
}

interface LoadedDiff {
  pageId: string;
  passed: boolean;
  diff: FigmaDiff;
}

async function loadDiff(figmaDir: string, pageId: string): Promise<LoadedDiff | undefined> {
  const file = path.join(figmaDir, "diff", `figma-diff.${pageId}.json`);
  let raw: unknown;
  try {
    raw = await readJson(file);
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) throw new Error(`HANDOFF_EVIDENCE_INVALID: ${file}: not an object`);
  if (raw.pageId !== pageId) {
    throw new Error(`HANDOFF_EVIDENCE_INVALID: ${file}: pageId ${String(raw.pageId)}`);
  }
  const diff = await loadDiffEvidence(file);
  return { pageId, passed: diff.passed, diff };
}

interface ConformanceEvidence {
  project: string;
  blockers: number;
  passed: boolean;
  pageIds: string[];
  failedPages: string[];
  pages: Array<{ pageId: string; passed: boolean; htmlSha256?: string; specSha256?: string }>;
}

async function loadConformance(figmaDir: string): Promise<ConformanceEvidence> {
  const file = path.join(figmaDir, "conformance", "conformance.json");
  const raw = await readJson(file);
  if (!isRecord(raw)) throw new Error(`HANDOFF_EVIDENCE_INVALID: ${file}: not an object`);
  if (raw.schemaVersion !== "1.0") {
    throw new Error(`HANDOFF_EVIDENCE_INVALID: ${file}: schemaVersion`);
  }
  const project = stringField(raw, "project", file);
  if (!isRecord(raw.summary)) {
    throw new Error(`HANDOFF_EVIDENCE_INVALID: ${file}: summary`);
  }
  const blockers = numberField(raw.summary, "blockers", `${file} summary`);
  if (!Array.isArray(raw.pages)) {
    throw new Error(`HANDOFF_EVIDENCE_INVALID: ${file}: pages`);
  }
  const pageIds: string[] = [];
  const failedPages: string[] = [];
  const pages: ConformanceEvidence["pages"] = [];
  for (const page of raw.pages) {
    if (!isRecord(page)) throw new Error(`HANDOFF_EVIDENCE_INVALID: ${file}: page entry`);
    const pageId = stringField(page, "pageId", file);
    pageIds.push(pageId);
    const passed = booleanField(page, "passed", `${file} ${pageId}`);
    if (!passed) failedPages.push(pageId);
    pages.push({
      pageId,
      passed,
      ...(typeof page.htmlSha256 === "string" ? { htmlSha256: page.htmlSha256 } : {}),
      ...(typeof page.specSha256 === "string" ? { specSha256: page.specSha256 } : {}),
    });
  }
  return { project, blockers, passed: blockers === 0, pageIds, failedPages, pages };
}

interface ParityEvidence {
  project: string;
  passed: boolean;
  pageIds: string[];
  failedPages: string[];
  pages: Array<{ pageId: string; passed: boolean; figmaHash?: string; baselineHash?: string }>;
}

async function loadParity(figmaDir: string): Promise<ParityEvidence> {
  const file = path.join(figmaDir, "parity", "parity.json");
  const raw = await readJson(file);
  if (!isRecord(raw)) throw new Error(`HANDOFF_EVIDENCE_INVALID: ${file}: not an object`);
  if (raw.schemaVersion !== "1.0") {
    throw new Error(`HANDOFF_EVIDENCE_INVALID: ${file}: schemaVersion`);
  }
  const project = stringField(raw, "project", file);
  if (!isRecord(raw.summary)) {
    throw new Error(`HANDOFF_EVIDENCE_INVALID: ${file}: summary`);
  }
  if (!Array.isArray(raw.pages)) {
    throw new Error(`HANDOFF_EVIDENCE_INVALID: ${file}: pages`);
  }
  const pageIds: string[] = [];
  const failedPages: string[] = [];
  const pages: ParityEvidence["pages"] = [];
  for (const page of raw.pages) {
    if (!isRecord(page)) throw new Error(`HANDOFF_EVIDENCE_INVALID: ${file}: page entry`);
    const pageId = stringField(page, "pageId", file);
    pageIds.push(pageId);
    const passed = booleanField(page, "passed", `${file} ${pageId}`);
    if (!passed) failedPages.push(pageId);
    pages.push({
      pageId,
      passed,
      ...(typeof page.figmaHash === "string" ? { figmaHash: page.figmaHash } : {}),
      ...(typeof page.baselineHash === "string" ? { baselineHash: page.baselineHash } : {}),
    });
  }
  return {
    project,
    passed: booleanField(raw.summary, "passed", `${file} summary`),
    pageIds,
    failedPages,
    pages,
  };
}

interface FigmaSignFile {
  signer: string;
  date: string;
  project?: string;
  hashes: FigmaHashes;
}

const FIGMA_HASH_KEYS = [
  "planHash",
  "readbackHash",
  "conformanceHash",
  "parityHash",
  "baselineHash",
] as const;

async function loadFigmaSign(figmaDir: string): Promise<FigmaSignFile | undefined> {
  const file = path.join(figmaDir, "signoff", "figma-sign.json");
  if (!(await pathExists(file))) return undefined;
  const raw = await readJson(file);
  if (!isRecord(raw)) throw new Error(`HANDOFF_SIGNOFF_INVALID: ${file}: not an object`);
  if (raw.schemaVersion !== "1.0") {
    throw new Error(`HANDOFF_SIGNOFF_INVALID: ${file}: schemaVersion`);
  }
  const signer = stringField(raw, "signer", file);
  const date = stringField(raw, "date", file);
  const hashes = Object.fromEntries(
    FIGMA_HASH_KEYS.map((key) => [key, stringField(raw, key, file)])
  ) as unknown as FigmaHashes;
  return {
    signer,
    date,
    ...(typeof raw.project === "string" && raw.project.length > 0
      ? { project: raw.project }
      : {}),
    hashes,
  };
}

interface VisualSignFile {
  signer: string;
  date: string;
  project?: string;
  status: string;
  manifestHash: string;
  findingsHash: string;
  waivedFindings: string[];
}

async function loadVisualSign(visualRun: string): Promise<VisualSignFile | undefined> {
  const file = path.join(visualRun, "visual-sign.json");
  if (!(await pathExists(file))) return undefined;
  const raw = await readJson(file);
  if (!isRecord(raw)) throw new Error(`HANDOFF_SIGNOFF_INVALID: ${file}: not an object`);
  if (raw.schemaVersion !== "1.0") {
    throw new Error(`HANDOFF_SIGNOFF_INVALID: ${file}: schemaVersion`);
  }
  const waived = raw.waivedFindings;
  return {
    signer: stringField(raw, "signer", file),
    date: stringField(raw, "date", file),
    ...(typeof raw.project === "string" && raw.project.length > 0
      ? { project: raw.project }
      : {}),
    status: stringField(raw, "status", file),
    manifestHash: stringField(raw, "manifestHash", file),
    findingsHash: stringField(raw, "findingsHash", file),
    waivedFindings:
      Array.isArray(waived) && waived.every((entry) => typeof entry === "string")
        ? (waived as string[])
        : [],
  };
}

const PIPELINE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

interface BaselineResolution {
  manifestFile: string;
  /** Directory to copy verbatim; undefined when only the manifest is available. */
  directory?: string;
  screenshotsDirectory?: string;
}

async function resolveBaseline(
  options: HandoffPackOptions,
  project: string
): Promise<BaselineResolution | undefined> {
  if (options.baseline !== undefined) {
    const manifestFile = path.join(options.baseline, "manifest.json");
    if (!(await pathExists(manifestFile))) {
      throw new Error(`BASELINE_MANIFEST_MISSING: ${manifestFile}`);
    }
    return {
      manifestFile,
      directory: options.baseline,
      ...((await pathExists(path.join(options.baseline, "screenshots")))
        ? { screenshotsDirectory: path.join(options.baseline, "screenshots") }
        : {}),
    };
  }
  const visualRun = options.visualRun!;
  const nested = path.join(visualRun, "baseline", "manifest.json");
  if (await pathExists(nested)) {
    return {
      manifestFile: nested,
      directory: path.join(visualRun, "baseline"),
      ...((await pathExists(path.join(visualRun, "baseline", "screenshots")))
        ? { screenshotsDirectory: path.join(visualRun, "baseline", "screenshots") }
        : {}),
    };
  }
  const copied = path.join(visualRun, "baseline-manifest.json");
  if (await pathExists(copied)) {
    for (const candidate of [
      path.join(visualRun, "baseline", "screenshots"),
      path.join(visualRun, "baseline-screenshots"),
      path.join(visualRun, "screenshots", "baseline"),
    ]) {
      if (await pathExists(candidate)) {
        return { manifestFile: copied, screenshotsDirectory: candidate };
      }
    }
    return { manifestFile: copied };
  }
  // The real visual-run layout does not copy the project baseline: a review
  // reads `pipeline/baselines/<project>` and never mutates it.
  const projectBaseline = path.join(PIPELINE_ROOT, "baselines", project);
  if (await pathExists(path.join(projectBaseline, "manifest.json"))) {
    return {
      manifestFile: path.join(projectBaseline, "manifest.json"),
      directory: projectBaseline,
      ...((await pathExists(path.join(projectBaseline, "screenshots")))
        ? { screenshotsDirectory: path.join(projectBaseline, "screenshots") }
        : {}),
    };
  }
  return undefined;
}

/** Resolve a signed baseline case file inside a resolved baseline. */
async function resolveBaselineCaseFile(
  baseline: BaselineResolution,
  entry: Pick<BaselineCaseFile, "file">
): Promise<string | undefined> {
  if (!isSafeRelative(entry.file)) return undefined;
  if (baseline.directory !== undefined) {
    const file = path.join(baseline.directory, entry.file);
    return (await pathExists(file)) ? file : undefined;
  }
  const fileName = path.posix.basename(entry.file);
  for (const candidate of [
    baseline.screenshotsDirectory,
    path.join(path.dirname(baseline.manifestFile), "screenshots"),
  ]) {
    if (candidate === undefined) continue;
    for (const tryRelative of [entry.file, fileName]) {
      const file = path.join(candidate, tryRelative);
      if (await pathExists(file)) return file;
    }
  }
  return undefined;
}

interface BaselineCase {
  id: string;
  pageId: string;
  state: string;
  file: string;
  sha256: string;
}

interface LoadedBaseline {
  project: string;
  cases: BaselineCase[];
}

async function loadBaselineManifest(manifestFile: string): Promise<LoadedBaseline> {
  const raw = await readJson(manifestFile);
  if (!isRecord(raw) || !Array.isArray(raw.cases)) {
    throw new Error(`BASELINE_MANIFEST_INVALID: ${manifestFile}`);
  }
  const project = stringField(raw, "project", manifestFile);
  const cases: BaselineCase[] = [];
  for (const entry of raw.cases) {
    if (!isRecord(entry)) {
      throw new Error(`BASELINE_MANIFEST_INVALID: ${manifestFile}: case`);
    }
    cases.push({
      id: stringField(entry, "id", manifestFile),
      pageId: stringField(entry, "pageId", manifestFile),
      state: stringField(entry, "state", manifestFile),
      file: stringField(entry, "file", manifestFile),
      sha256: stringField(entry, "sha256", manifestFile),
    });
  }
  return { project, cases };
}

interface AssetManifest {
  assetRefs: Map<string, string>;
  files: HandoffAsset[];
  licenses: Array<{ id: string; license: string }>;
}

async function loadAssetManifest(assetsDir: string): Promise<AssetManifest> {
  const file = path.join(assetsDir, "manifest.json");
  const raw = await readJson(file);
  if (!isRecord(raw) || !Array.isArray(raw.assets)) {
    throw new Error(`ASSET_MANIFEST_INVALID: ${file}`);
  }
  const assetRefs = new Map<string, string>();
  const files: HandoffAsset[] = [];
  const licenses: Array<{ id: string; license: string }> = [];
  for (const entry of raw.assets) {
    if (!isRecord(entry)) throw new Error(`ASSET_MANIFEST_INVALID: ${file}: entry`);
    const id = stringField(entry, "id", file);
    const license = typeof entry.license === "string" ? entry.license : "";
    licenses.push({ id, license });
    if (!Array.isArray(entry.files)) {
      throw new Error(`ASSET_MANIFEST_INVALID: ${file}: ${id}.files`);
    }
    for (const item of entry.files) {
      if (!isRecord(item)) throw new Error(`ASSET_MANIFEST_INVALID: ${file}: ${id} file`);
      const relative = stringField(item, "path", `${file} ${id}`);
      const target = `assets/${relative}`;
      files.push({ path: target, license });
      assetRefs.set(id, target);
      assetRefs.set(relative, target);
      assetRefs.set(target, target);
    }
  }
  return { assetRefs, files, licenses };
}

/** Collect every `assetRef` in a Page Spec layout tree. */
function collectAssetRefs(value: unknown, refs: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectAssetRefs(entry, refs);
    return;
  }
  if (!isRecord(value)) return;
  const assetRef = value.assetRef;
  if (typeof assetRef === "string" && assetRef.length > 0) refs.add(assetRef);
  for (const entry of Object.values(value)) collectAssetRefs(entry, refs);
}

function hasMaterialSymbols(html: string): boolean {
  return html.includes("Material Symbols");
}

interface BlockManifestGuard {
  project: string;
  pageId: string;
  shell: unknown;
  blocks: unknown;
  skipped: unknown;
}

function readBlockManifest(raw: unknown, source: string): BlockManifestGuard {
  if (!isRecord(raw)) throw new Error(`BLOCK_MANIFEST_INVALID: ${source}: not an object`);
  if (raw.schemaVersion !== "1.0") {
    throw new Error(`BLOCK_MANIFEST_INVALID: ${source}: schemaVersion`);
  }
  if (!isRecord(raw.shell) || !Array.isArray(raw.shell.wrappers)) {
    throw new Error(`BLOCK_MANIFEST_INVALID: ${source}: shell.wrappers`);
  }
  if (!Array.isArray(raw.blocks) || !Array.isArray(raw.skipped)) {
    throw new Error(`BLOCK_MANIFEST_INVALID: ${source}: blocks/skipped`);
  }
  return {
    project: stringField(raw, "project", source),
    pageId: stringField(raw, "pageId", source),
    shell: raw.shell,
    blocks: raw.blocks,
    skipped: raw.skipped,
  };
}

interface PackInput {
  input: HandoffInput;
  docs: HandoffDocsInput;
  copies: Array<{ source: string; target: string }>;
  directoryCopies: Array<{ source: string; target: string }>;
  issues: HandoffIssue[];
}

interface BuildOptions {
  options: HandoffPackOptions;
  specs: LoadedSpec[];
  pages: string[];
  project: string;
  profile: string;
  figmaFiles: Array<{ pageId: string; fileKey: string }>;
  hashes: FigmaHashes | undefined;
  baseline: BaselineResolution | undefined;
  htmlHashes: Map<string, string>;
  specHashes: Map<string, string>;
  gates: HandoffInput["gates"];
  signoffs: HandoffSignoff[];
  assets: HandoffAsset[];
  knownGaps: string[];
  copies: Array<{ source: string; target: string }>;
  directoryCopies: Array<{ source: string; target: string }>;
  issues: HandoffIssue[];
}

function docsPages(specs: LoadedSpec[]): HandoffDocsPage[] {
  return specs.map(({ spec }) => ({
    pageId: spec.meta.pageId,
    name: spec.meta.name,
    route: spec.meta.route,
    archetype: spec.meta.archetype,
    states: Object.values(spec.states)
      .map((state) => state.name)
      .sort(compareStrings),
  }));
}

async function listEvidencePageIds(dir: string, pattern: RegExp): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const entry of entries) {
    const pageId = pattern.exec(entry)?.[1];
    if (pageId !== undefined && pageId !== "index") ids.push(pageId);
  }
  return ids.sort(compareStrings);
}

function compareEvidencePages(
  kind: string,
  actual: readonly string[],
  expected: readonly string[],
  issues: HandoffIssue[]
): void {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((pageId) => !actualSet.has(pageId));
  const extra = actual.filter((pageId) => !expectedSet.has(pageId));
  if (missing.length > 0) {
    issues.push(
      blocker("HANDOFF_GATE_FAILED", `${kind} evidence is missing pages: ${missing.join(", ")}`)
    );
  }
  if (extra.length > 0) {
    issues.push(
      blocker("HANDOFF_GATE_FAILED", `${kind} evidence has unexpected pages: ${extra.join(", ")}`)
    );
  }
}

async function planFigmaEvidence(build: BuildOptions): Promise<void> {
  const { options, pages, issues, copies } = build;
  const figmaDir = options.figma!;
  const readbacks: Array<{ pageId: string; fileKey?: string; errors: string[] }> = [];
  const diffs: Array<{ pageId: string; passed: boolean }> = [];
  const recomputedDiffByPage = new Map<string, FigmaDiff>();
  let figmaFiles: Array<{ pageId: string; fileKey: string }> = [];

  const signFile = path.join(figmaDir, "signoff", "figma-sign.json");
  for (const pageId of pages) {
    const planFile = path.join(figmaDir, "plans", `figma-plan.${pageId}.json`);
    let plan: Awaited<ReturnType<typeof loadPlanEvidence>> | undefined;
    if (await pathExists(planFile)) {
      copies.push({ source: planFile, target: `figma/plans/figma-plan.${pageId}.json` });
      try {
        plan = await loadPlanEvidence(planFile);
      } catch (error) {
        issues.push(
          blocker(
            "HANDOFF_GATE_FAILED",
            `figma verify failed: plan is invalid for ${pageId}: ${errorMessage(error)}`
          )
        );
      }
      if (plan !== undefined && plan.pageId !== pageId) {
        issues.push(
          blocker(
            "HANDOFF_GATE_FAILED",
            `figma plan identity mismatch: figma/plans/figma-plan.${pageId}.json declares ${plan.pageId}`
          )
        );
        plan = undefined;
      }
    } else {
      issues.push(blocker("HANDOFF_GATE_FAILED", `figma verify failed: plan is missing for ${pageId} (figma/plans/figma-plan.${pageId}.json)`));
    }
    const readback = await loadReadback(figmaDir, pageId, "scratch");
    if (readback === undefined) {
      issues.push(blocker("HANDOFF_GATE_FAILED", `figma verify failed: readback is missing for ${pageId} (figma/readback/figma-readback.${pageId}.json)`));
    } else {
      readbacks.push(readback);
      copies.push({
        source: path.join(figmaDir, "readback", `figma-readback.${pageId}.json`),
        target: `figma/readback/figma-readback.${pageId}.json`,
      });
      if (readback.errors.length > 0) {
        issues.push(
          blocker(
            "HANDOFF_GATE_FAILED",
            `figma verify failed: readback for ${pageId} has errors: ${readback.errors.slice(0, 3).join("; ")}`
          )
        );
      }
    }

    // The stored diff is untrusted: re-derive it from the current plan and
    // readback, require the recomputed verdict, then require the stored file
    // to describe that same result. A stale `passed: true` cannot slip through.
    let recomputed: FigmaDiff | undefined;
    if (plan !== undefined && readback !== undefined) {
      recomputed = recomputeFigmaDiff(plan, readback.readback);
      recomputedDiffByPage.set(pageId, recomputed);
      if (!recomputed.passed) {
        issues.push(
          blocker(
            "HANDOFF_GATE_FAILED",
            `figma verify failed: diff did not pass for ${pageId} ` +
              `(${recomputed.blockerCount} blocker / ${recomputed.majorCount} major)`
          )
        );
      }
    }
    const diff = await loadDiff(figmaDir, pageId);
    if (diff === undefined) {
      issues.push(blocker("HANDOFF_GATE_FAILED", `figma verify failed: diff is missing for ${pageId} (figma/diff/figma-diff.${pageId}.json)`));
    } else {
      diffs.push(diff);
      copies.push({
        source: path.join(figmaDir, "diff", `figma-diff.${pageId}.json`),
        target: `figma/evidence/figma-diff.${pageId}.json`,
      });
      if (!diff.passed) {
        issues.push(blocker("HANDOFF_GATE_FAILED", `figma verify failed: diff did not pass for ${pageId}`));
      } else if (recomputed !== undefined) {
        const mismatches = compareDiffEvidence(diff.diff, recomputed);
        if (mismatches.length > 0) {
          issues.push(
            blocker(
              "HANDOFF_GATE_FAILED",
              `figma diff evidence is stale for ${pageId}: ${mismatches.join("; ")}`
            )
          );
        }
      }
    }

    // The parity PNG is current Figma evidence and is hash-bound to
    // parity.json. The v0.6 canvas crops are kept only as provenance.
    const parityPng = path.join(figmaDir, "parity", `figma.${pageId}.png`);
    if (await pathExists(parityPng)) {
      copies.push({ source: parityPng, target: `screenshots/figma/${pageId}.png` });
    } else {
      issues.push(
        blocker(
          "HANDOFF_GATE_FAILED",
          `Figma screenshot is missing for ${pageId} (figma/parity/figma.${pageId}.png)`
        )
      );
    }
    const manualScreenshots = [
      path.join(figmaDir, "screenshots", `delivery.${pageId}.png`),
      path.join(figmaDir, "screenshots", `figma.${pageId}.png`),
    ];
    for (const manual of manualScreenshots) {
      if (!(await pathExists(manual))) continue;
      if (await pathExists(parityPng)) {
        const [manualHash, parityHash] = await Promise.all([
          hashFile(manual),
          hashFile(parityPng),
        ]);
        if (manualHash === parityHash) break;
      }
      copies.push({
        source: manual,
        target: `screenshots/figma-manual/${pageId}.png`,
      });
      const gap =
        `screenshots/figma-manual/${pageId}.png is a manual v0.6 canvas crop; ` +
        "it is not current Figma parity evidence";
      if (!build.knownGaps.includes(gap)) build.knownGaps.push(gap);
      break;
    }

    const parityDiff = path.join(figmaDir, "parity", "diff", `${pageId}.png`);
    if (await pathExists(parityDiff)) {
      copies.push({ source: parityDiff, target: `screenshots/parity-diff/${pageId}.png` });
    } else {
      issues.push(
        blocker(
          "HANDOFF_GATE_FAILED",
          `parity diff screenshot is missing for ${pageId} (figma/parity/diff/${pageId}.png)`
        )
      );
    }
  }

  compareEvidencePages(
    "figma plan",
    await listEvidencePageIds(path.join(figmaDir, "plans"), /^figma-plan\.(.+)\.json$/),
    pages,
    issues
  );
  compareEvidencePages(
    "figma readback",
    await listEvidencePageIds(path.join(figmaDir, "readback"), /^figma-readback\.(.+)\.json$/),
    pages,
    issues
  );
  compareEvidencePages(
    "figma diff",
    await listEvidencePageIds(path.join(figmaDir, "diff"), /^figma-diff\.(.+)\.json$/),
    pages,
    issues
  );

  // Figma file keys come from readbacks (preferred), the delivery readbacks, or
  // an optional figma-files.json mapping.
  const fileKeys = new Map<string, string>();  for (const readback of readbacks) {
    if (readback.fileKey !== undefined) fileKeys.set(readback.pageId, readback.fileKey);
  }
  for (const pageId of pages) {
    if (fileKeys.has(pageId)) continue;
    const delivery = await loadReadback(figmaDir, pageId, "delivery");
    if (delivery?.fileKey !== undefined) fileKeys.set(pageId, delivery.fileKey);
  }
  const mappingFile = path.join(figmaDir, "figma-files.json");
  if (await pathExists(mappingFile)) {
    const raw = await readJson(mappingFile);
    if (isRecord(raw) && Array.isArray(raw.files)) {
      for (const entry of raw.files) {
        if (!isRecord(entry)) continue;
        const pageId = entry.pageId;
        const fileKey = entry.fileKey;
        if (typeof pageId === "string" && typeof fileKey === "string") {
          if (!fileKeys.has(pageId) && pages.includes(pageId)) fileKeys.set(pageId, fileKey);
        }
      }
    }
  }
  figmaFiles = pages.map((pageId) => {
    const fileKey = fileKeys.get(pageId);
    if (fileKey === undefined || fileKey.length === 0) {
      issues.push(
        blocker(
          "HANDOFF_GATE_FAILED",
          `figma fileKey is missing for ${pageId} (readback has no fileKey; add figma-files.json)`
        )
      );
      return { pageId, fileKey: "" };
    }
    return { pageId, fileKey };
  });

  const coverage = path.join(figmaDir, "plans", "plan-coverage.json");
  if (await pathExists(coverage)) {
    copies.push({ source: coverage, target: "figma/plans/plan-coverage.json" });
  }

  let conformance: ConformanceEvidence | undefined;
  try {
    conformance = await loadConformance(figmaDir);
    copies.push({
      source: path.join(figmaDir, "conformance", "conformance.json"),
      target: "figma/evidence/conformance.json",
    });
    if (conformance.blockers > 0) {
      issues.push(
        blocker(
          "HANDOFF_GATE_FAILED",
          `conformance gate failed: ${conformance.blockers} blocker(s)`
        )
      );
    }
    compareEvidencePages("conformance", conformance.pageIds, pages, issues);
    if (conformance.failedPages.length > 0) {
      issues.push(
        blocker(
          "HANDOFF_GATE_FAILED",
          `conformance failed pages: ${conformance.failedPages.join(", ")}`
        )
      );
    }
    if (conformance.project !== build.project) {
      issues.push(
        blocker(
          "HANDOFF_GATE_FAILED",
          `conformance project mismatch: ${conformance.project} != ${build.project}`
        )
      );
    }
    // Bind the supplied HTML/spec bytes to the bytes this gate actually saw.
    for (const page of conformance.pages) {
      const htmlHash = build.htmlHashes.get(page.pageId);
      if (page.htmlSha256 === undefined) {
        issues.push(
          blocker(
            "HANDOFF_GATE_FAILED",
            `conformance evidence has no HTML hash for ${page.pageId}; re-run figma:conformance`
          )
        );
      } else if (htmlHash === undefined) {
        issues.push(
          blocker(
            "HANDOFF_PAGE_MISSING",
            `cannot hash supplied HTML for ${page.pageId}`
          )
        );
      } else if (htmlHash !== page.htmlSha256) {
        issues.push(
          blocker(
            "HANDOFF_GATE_FAILED",
            `supplied HTML for ${page.pageId} does not match the conformance input (${htmlHash} != ${page.htmlSha256})`
          )
        );
      }
      const specHash = build.specHashes.get(page.pageId);
      if (page.specSha256 === undefined) {
        issues.push(
          blocker(
            "HANDOFF_GATE_FAILED",
            `conformance evidence has no Page Spec hash for ${page.pageId}; re-run figma:conformance`
          )
        );
      } else if (specHash !== undefined && specHash !== page.specSha256) {
        issues.push(
          blocker(
            "HANDOFF_GATE_FAILED",
            `supplied Page Spec for ${page.pageId} does not match the conformance input`
          )
        );
      }
    }
  } catch (error) {
    issues.push(
      blocker("HANDOFF_GATE_FAILED", `conformance gate failed: ${errorMessage(error)}`)
    );
  }

  let parity: ParityEvidence | undefined;
  try {
    parity = await loadParity(figmaDir);
    copies.push({
      source: path.join(figmaDir, "parity", "parity.json"),
      target: "figma/evidence/parity.json",
    });
    const config = path.join(figmaDir, "parity", "parity.config.json");
    if (await pathExists(config)) {
      copies.push({ source: config, target: "figma/evidence/parity.config.json" });
    }
    if (!parity.passed) {
      issues.push(blocker("HANDOFF_GATE_FAILED", "parity gate failed: summary.passed is false"));
    }
    compareEvidencePages("parity", parity.pageIds, pages, issues);
    if (parity.failedPages.length > 0) {
      issues.push(
        blocker(
          "HANDOFF_GATE_FAILED",
          `parity failed pages: ${parity.failedPages.join(", ")}`
        )
      );
    }
    if (parity.project !== build.project) {
      issues.push(
        blocker(
          "HANDOFF_GATE_FAILED",
          `parity project mismatch: ${parity.project} != ${build.project}`
        )
      );
    }
    if (build.baseline !== undefined) {
      const loaded = await loadBaselineManifest(build.baseline.manifestFile);
      const stale = await verifyParityEvidence({
        figmaDir,
        pages: parity.pages,
        baselineCases: loaded.cases,
        resolveBaselineFile: (entry) =>
          resolveBaselineCaseFile(build.baseline!, entry),
      });
      for (const message of stale) {
        issues.push(
          blocker("HANDOFF_GATE_FAILED", `parity evidence is stale: ${message}`)
        );
      }
    }
  } catch (error) {
    issues.push(blocker("HANDOFF_GATE_FAILED", `parity gate failed: ${errorMessage(error)}`));
  }

  if (
    conformance !== undefined &&
    parity !== undefined &&
    conformance.project !== parity.project
  ) {
    issues.push(
      blocker(
        "HANDOFF_GATE_FAILED",
        `Figma project mismatch: conformance ${conformance.project} != parity ${parity.project}`
      )
    );
  }

  if (await pathExists(signFile)) {
    copies.push({ source: signFile, target: "figma/evidence/figma-sign.json" });
    copies.push({ source: signFile, target: "signoffs/figma-sign.json" });
  }
  const signoffMd = path.join(figmaDir, "signoff", "figma.md");
  if (await pathExists(signoffMd)) {
    copies.push({ source: signoffMd, target: "signoffs/figma.md" });
  }

  const verifyPassed =
    readbacks.length === pages.length &&
    recomputedDiffByPage.size === pages.length &&
    readbacks.every((readback) => readback.errors.length === 0) &&
    [...recomputedDiffByPage.values()].every((diff) => diff.passed);
  const verifyHash = hashJson(
    pages
      .map((pageId) => {
        const diff = recomputedDiffByPage.get(pageId);
        return {
          pageId,
          passed: diff?.passed ?? false,
          blockerCount: diff?.blockerCount ?? -1,
          majorCount: diff?.majorCount ?? -1,
        };
      })
      .sort((left, right) => compareStrings(left.pageId, right.pageId))
  );

  build.figmaFiles = figmaFiles;
  build.gates.verify = { passed: verifyPassed, hash: verifyHash };
  build.gates.conformance = {
    passed: conformance?.passed === true,
    hash: build.hashes?.conformanceHash ?? "",
  };
  build.gates.parity = {
    passed: parity?.passed === true,
    hash: build.hashes?.parityHash ?? "",
  };
}

async function planVisualEvidence(
  build: BuildOptions,
  options: HandoffPackOptions,
  baseline: BaselineResolution | undefined
): Promise<void> {
  const visualRun = options.visualRun!;
  const pages = build.pages;
  const issues = build.issues;
  const copies = build.copies;

  let state: VisualRunState | undefined;
  try {
    state = parseVisualRunState(
      await readJson(path.join(visualRun, "state.json")),
      path.join(visualRun, "state.json")
    );
  } catch (error) {
    issues.push(
      blocker("HANDOFF_GATE_FAILED", `visual gate failed: ${errorMessage(error)}`)
    );
  }

  let manifestHash = "";
  let findingsHash = "";
  if (state !== undefined) {
    findingsHash = hashValue(state.findings);
    try {
      const manifest = await readVisualManifest(
        path.join(visualRun, "screenshots", "manifest.json")
      );
      if (manifest === undefined) {
        throw new Error("screenshots/manifest.json is missing");
      }
      const mismatches = await verifyManifestFiles(visualRun, manifest);
      if (mismatches.length > 0) {
        throw new Error(`screenshot files changed: ${mismatches.slice(0, 3).join("; ")}`);
      }
      manifestHash = visualManifestHash(manifest);
      if (manifestHash !== state.manifestHash) {
        issues.push(
          blocker(
            "HANDOFF_GATE_FAILED",
            `visual gate failed: screenshot manifest changed (${manifestHash} != ${state.manifestHash})`
          )
        );
      }
      if (findingsHash !== state.findingsHash) {
        issues.push(
          blocker(
            "HANDOFF_GATE_FAILED",
            `visual gate failed: findings changed (${findingsHash} != ${state.findingsHash})`
          )
        );
      }

      const byPage = new Map<string, Array<{ id: string; file: string; state: string }>>();
      for (const entry of manifest.cases) {
        const list = byPage.get(entry.pageId) ?? [];
        list.push({ id: entry.id, file: entry.file, state: entry.state });
        byPage.set(entry.pageId, list);
      }
      for (const pageId of pages) {
        const cases = byPage.get(pageId);
        if (cases === undefined || cases.length === 0) {
          issues.push(
            blocker(
              "HANDOFF_GATE_FAILED",
              `visual screenshot is missing for ${pageId} (screenshots/manifest.json)`
            )
          );
          continue;
        }
        const chosen =
          cases.find((entry) => entry.state === "default") ??
          [...cases].sort((left, right) => compareStrings(left.id, right.id))[0]!;
        if (!isSafeRelative(chosen.file)) {
          issues.push(
            blocker(
              "HANDOFF_GATE_FAILED",
              `visual manifest has an unsafe screenshot path (${chosen.file})`
            )
          );
          continue;
        }
        // Manifest paths are relative to the run directory (e.g.
        // "screenshots/<caseId>.png").
        const source = path.join(visualRun, chosen.file);
        if (!(await pathExists(source))) {
          issues.push(
            blocker(
              "HANDOFF_GATE_FAILED",
              `visual screenshot is missing for ${pageId} (${chosen.file})`
            )
          );
          continue;
        }
        copies.push({ source, target: `screenshots/html/${pageId}.png` });
      }
    } catch (error) {
      issues.push(
        blocker("HANDOFF_GATE_FAILED", `visual gate failed: ${errorMessage(error)}`)
      );
    }

    const statusFinal = state.status === "success" || state.status === "passed";
    if (!statusFinal) {
      issues.push(
        blocker(
          "HANDOFF_GATE_FAILED",
          `visual gate failed: run status is ${state.status} (requires success/passed)`
        )
      );
    }
    if (!state.signoff.visual) {
      issues.push(blocker("HANDOFF_GATE_FAILED", "visual gate failed: state.signoff.visual is false"));
    }
    if (state.project !== build.project) {
      issues.push(
        blocker(
          "HANDOFF_GATE_FAILED",
          `visual project mismatch: ${state.project} != ${build.project}`
        )
      );
    }
    // The visual review must have seen the same HTML bytes we are shipping.
    if (state.htmlHashes === undefined) {
      issues.push(
        blocker(
          "HANDOFF_GATE_FAILED",
          "visual state has no htmlHashes; re-run visual:review with this CLI version"
        )
      );
    } else {
      for (const pageId of pages) {
        const recorded = state.htmlHashes[pageId];
        const supplied = build.htmlHashes.get(pageId);
        if (recorded === undefined) {
          issues.push(
            blocker(
              "HANDOFF_GATE_FAILED",
              `visual state has no HTML hash for ${pageId}; re-run visual:review`
            )
          );
        } else if (supplied !== undefined && recorded !== supplied) {
          issues.push(
            blocker(
              "HANDOFF_GATE_FAILED",
              `supplied HTML for ${pageId} does not match the visual review input (${supplied} != ${recorded})`
            )
          );
        }
      }
      for (const pageId of Object.keys(state.htmlHashes)) {
        if (!pages.includes(pageId)) {
          issues.push(
            blocker(
              "HANDOFF_GATE_FAILED",
              `visual state has an HTML hash for an unexpected page: ${pageId}`
            )
          );
        }
      }
    }
  }

  let visualSign: VisualSignFile | undefined;
  try {
    visualSign = await loadVisualSign(visualRun);
    if (visualSign === undefined) {
      issues.push(
        blocker("HANDOFF_SIGNOFF_MISSING", "visual signoff is missing (visual-sign.json)")
      );
    }
  } catch (error) {
    issues.push(blocker("HANDOFF_SIGNOFF_STALE", errorMessage(error)));
  }

  const signoffMarkdown = path.join(visualRun, "signoff", "visual.md");
  let markdownValid = false;
  if (await pathExists(signoffMarkdown)) {
    try {
      const parsed = parseSignoffMarkdown(await readText(signoffMarkdown));
      const validation = validateVisualSignoff({
        parsed,
        findings: state?.findings ?? [],
        manifestHash,
        findingsHash,
        now: new Date(),
      });
      if (!validation.ok) {
        issues.push(
          blocker(
            "HANDOFF_SIGNOFF_STALE",
            `visual signoff is invalid: ${validation.error ?? "unknown"}`
          )
        );
      } else {
        markdownValid = true;
      }
    } catch (error) {
      issues.push(blocker("HANDOFF_SIGNOFF_STALE", `visual signoff is invalid: ${errorMessage(error)}`));
    }
  } else {
    issues.push(
      blocker("HANDOFF_SIGNOFF_MISSING", "visual signoff markdown is missing (signoff/visual.md)")
    );
  }

  const hashesMatch =
    visualSign !== undefined &&
    (visualSign.status === "success" || visualSign.status === "passed") &&
    visualSign.manifestHash === manifestHash &&
    visualSign.findingsHash === findingsHash;
  if (
    visualSign !== undefined &&
    visualSign.manifestHash !== manifestHash
  ) {
    issues.push(
      blocker(
        "HANDOFF_SIGNOFF_STALE",
        `visual signoff manifestHash is stale (${visualSign.manifestHash} != ${manifestHash})`
      )
    );
  }
  if (visualSign !== undefined && visualSign.findingsHash !== findingsHash) {
    issues.push(
      blocker(
        "HANDOFF_SIGNOFF_STALE",
        `visual signoff findingsHash is stale (${visualSign.findingsHash} != ${findingsHash})`
      )
    );
  }
  if (visualSign?.project !== undefined && visualSign.project !== build.project) {
    issues.push(
      blocker(
        "HANDOFF_SIGNOFF_STALE",
        `visual signoff project mismatch (${visualSign.project} != ${build.project})`
      )
    );
  }
  if (
    visualSign !== undefined &&
    visualSign.status !== "success" &&
    visualSign.status !== "passed"
  ) {
    issues.push(
      blocker(
        "HANDOFF_SIGNOFF_STALE",
        `visual signoff status is ${visualSign.status} (requires success/passed)`
      )
    );
  }

  const projectMatches =
    visualSign?.project === undefined || visualSign.project === build.project;
  const passed =
    state !== undefined &&
    (state.status === "success" || state.status === "passed") &&
    state.signoff.visual &&
    visualSign !== undefined &&
    hashesMatch &&
    projectMatches &&
    markdownValid &&
    manifestHash.length > 0;
  const gateHash =
    manifestHash.length > 0 && findingsHash.length > 0
      ? hashJson({ manifestHash, findingsHash })
      : "";
  build.gates.visualSign = { passed, hash: gateHash };

  if (visualSign !== undefined) {
    const recordedHash =
      visualSign.manifestHash.length > 0 && visualSign.findingsHash.length > 0
        ? hashJson({
            manifestHash: visualSign.manifestHash,
            findingsHash: visualSign.findingsHash,
          })
        : "";
    build.signoffs.push({
      type: "visual",
      signedBy: visualSign.signer,
      signedAt: visualSign.date,
      hash: recordedHash,
    });
    build.copies.push({
      source: path.join(visualRun, "visual-sign.json"),
      target: "signoffs/visual-sign.json",
    });
  }
  if (await pathExists(signoffMarkdown)) {
    build.copies.push({ source: signoffMarkdown, target: "signoffs/visual.md" });
  }

  if (baseline !== undefined) {
    const loaded = await loadBaselineManifest(baseline.manifestFile);
    if (loaded.cases.length === 0) {
      issues.push(
        blocker(
          "HANDOFF_GATE_FAILED",
          `baseline manifest has no cases (${baseline.manifestFile})`
        )
      );
    }
    if (loaded.project !== build.project) {
      issues.push(
        blocker(
          "HANDOFF_GATE_FAILED",
          `baseline project mismatch: ${loaded.project} != ${build.project}`
        )
      );
    }
    const cases = loaded.cases;
    if (baseline.directory !== undefined) {
      for (const entry of cases) {
        if (!isSafeRelative(entry.file)) {
          issues.push(
            blocker(
              "HANDOFF_GATE_FAILED",
              `baseline manifest has an unsafe path (${entry.file})`
            )
          );
          continue;
        }
        const source = path.join(baseline.directory, entry.file);
        if (!(await pathExists(source))) {
          issues.push(
            blocker(
              "HANDOFF_GATE_FAILED",
              `baseline screenshot is missing: baseline/${entry.file}`
            )
          );
        } else if ((await hashFile(source)) !== entry.sha256) {
          issues.push(
            blocker(
              "HANDOFF_GATE_FAILED",
              `baseline screenshot hash mismatch: baseline/${entry.file}`
            )
          );
        }
      }
      build.directoryCopies.push({ source: baseline.directory, target: "baseline" });
    } else {
      build.copies.push({ source: baseline.manifestFile, target: "baseline/manifest.json" });
      for (const entry of cases) {
        const fileName = path.posix.basename(entry.file);
        if (!isSafeRelative(entry.file)) {
          issues.push(
            blocker(
              "HANDOFF_GATE_FAILED",
              `baseline manifest has an unsafe path (${entry.file})`
            )
          );
          continue;
        }
        let source: string | undefined;
        for (const candidate of [
          baseline.screenshotsDirectory,
          path.join(visualRun, "baseline", "screenshots"),
          path.join(visualRun, "baseline-screenshots"),
        ]) {
          if (candidate === undefined) continue;
          for (const tryRelative of [entry.file, fileName]) {
            const tryFile = path.join(candidate, tryRelative);
            if (await pathExists(tryFile)) {
              source = tryFile;
              break;
            }
          }
          if (source !== undefined) break;
        }
        if (source === undefined) {
          issues.push(
            blocker(
              "HANDOFF_GATE_FAILED",
              `baseline screenshot is missing: baseline/${entry.file}`
            )
          );
          continue;
        }
        if ((await hashFile(source)) !== entry.sha256) {
          issues.push(
            blocker(
              "HANDOFF_GATE_FAILED",
              `baseline screenshot hash mismatch: baseline/${entry.file}`
            )
          );
          continue;
        }
        // Keep the signed manifest's paths resolvable inside baseline/.
        build.copies.push({
          source,
          target: `baseline/${entry.file}`,
        });
      }
    }
  } else {
    issues.push(
      blocker(
        "HANDOFF_GATE_FAILED",
        "baseline manifest is missing (pass --baseline or include baseline-manifest.json in the visual run)"
      )
    );
  }
}

async function planFigmaSignoff(build: BuildOptions): Promise<void> {
  if (build.hashes === undefined) {
    let sign: FigmaSignFile | undefined;
    try {
      sign = await loadFigmaSign(build.options.figma!);
    } catch (error) {
      build.issues.push(blocker("HANDOFF_SIGNOFF_STALE", errorMessage(error)));
    }
    if (sign === undefined) {
      build.issues.push(
        blocker(
          "HANDOFF_SIGNOFF_MISSING",
          "figma signoff is missing (figma/signoff/figma-sign.json)"
        )
      );
    } else {
      build.signoffs.push({
        type: "figma",
        signedBy: sign.signer,
        signedAt: sign.date,
        hash: figmaSignHash(sign.hashes),
      });
    }
    build.gates.figmaSign = { passed: false, hash: "" };
    return;
  }
  const current = figmaSignHash(build.hashes);
  let sign: FigmaSignFile | undefined;
  try {
    sign = await loadFigmaSign(build.options.figma!);
  } catch (error) {
    build.issues.push(blocker("HANDOFF_SIGNOFF_STALE", errorMessage(error)));
    build.gates.figmaSign = { passed: false, hash: current };
    return;
  }
  if (sign === undefined) {
    build.issues.push(
      blocker(
        "HANDOFF_SIGNOFF_MISSING",
        "figma signoff is missing (figma/signoff/figma-sign.json)"
      )
    );
    build.gates.figmaSign = { passed: false, hash: current };
    return;
  }
  const stale = FIGMA_HASH_KEYS.filter((key) => sign.hashes[key] !== build.hashes![key]);
  if (stale.length > 0) {
    build.issues.push(
      blocker(
        "HANDOFF_SIGNOFF_STALE",
        `figma signoff hash mismatch: ${stale.join(", ")}`
      )
    );
  }
  if (sign.project !== undefined && sign.project !== build.project) {
    build.issues.push(
      blocker(
        "HANDOFF_SIGNOFF_STALE",
        `figma signoff project mismatch (${sign.project} != ${build.project})`
      )
    );
  }
  const projectMatches = sign.project === undefined || sign.project === build.project;
  const recorded = figmaSignHash(sign.hashes);
  build.signoffs.push({
    type: "figma",
    signedBy: sign.signer,
    signedAt: sign.date,
    hash: recorded,
  });
  build.gates.figmaSign = {
    passed: stale.length === 0 && projectMatches,
    hash: current,
  };
}

async function planSpecEvidence(build: BuildOptions): Promise<void> {
  const { options, specs, issues, copies } = build;
  const specRun = options.specRun!;
  const htmlDir = options.html!;

  for (const { spec, file } of specs) {
    const pageId = spec.meta.pageId;
    if (/TBD|TODO|\{\{/.test(JSON.stringify(spec))) {
      issues.push(
        blocker(
          "HANDOFF_GATE_FAILED",
          `Page Spec contains a TBD/TODO/{{ placeholder: ${file}`
        )
      );
    }
    copies.push({
      source: file,
      target: `spec/page-spec/${pageId}.json`,
    });
    build.specHashes.set(pageId, await hashFile(file));
    const htmlFile = path.join(htmlDir, `${pageId}.html`);
    if (await pathExists(htmlFile)) {
      copies.push({ source: htmlFile, target: `html/${pageId}.html` });
      build.htmlHashes.set(pageId, await hashFile(htmlFile));
    } else {
      issues.push(
        blocker("HANDOFF_PAGE_MISSING", `${pageId} is missing html (${htmlFile})`)
      );
    }
  }
  if (await pathExists(path.join(htmlDir, "index.html"))) {
    copies.push({ source: path.join(htmlDir, "index.html"), target: "html/index.html" });
  }
  if (await pathExists(path.join(htmlDir, "assets"))) {
    build.directoryCopies.push({
      source: path.join(htmlDir, "assets"),
      target: "html/assets",
    });
  }

  const blockDir = path.join(specRun, "artifacts", "block-manifest");
  if (await pathExists(blockDir)) {
    for (const { spec } of specs) {
      const pageId = spec.meta.pageId;
      const file = path.join(blockDir, `${pageId}.json`);
      if (!(await pathExists(file))) {
        issues.push(
          blocker("HANDOFF_PAGE_MISSING", `block manifest is missing for ${pageId} (${file})`)
        );
        continue;
      }
      const raw = readBlockManifest(await readJson(file), file);
      if (raw.project !== spec.meta.project || raw.pageId !== pageId) {
        issues.push(
          blocker(
            "HANDOFF_GATE_FAILED",
            `block manifest identity mismatch for ${pageId} (${raw.project}/${raw.pageId})`
          )
        );
      }
      try {
        const findings = verifyBlockManifest(spec, raw as unknown as BlockManifest);
        const blockers = findings.filter((finding) => finding.severity === "blocker");
        if (blockers.length > 0) {
          issues.push(
            blocker(
              "HANDOFF_GATE_FAILED",
              `block verify failed for ${pageId}: ${blockers
                .slice(0, 3)
                .map((finding) => finding.ruleId)
                .join(", ")}`
            )
          );
        }
      } catch (error) {
        issues.push(
          blocker(
            "HANDOFF_GATE_FAILED",
            `block verify failed for ${pageId}: ${errorMessage(error)}`
          )
        );
      }
      copies.push({
        source: file,
        target: `spec/block-manifest/${pageId}.json`,
      });
    }
  }

  const gateFile = path.join(specRun, "findings", "spec-engineer-gate.json");
  if (await pathExists(gateFile)) {
    const raw = await readJson(gateFile);
    if (!isRecord(raw) || !isRecord(raw.gate) || typeof raw.gate.passed !== "boolean") {
      throw new Error(`SPEC_GATE_INVALID: ${gateFile}`);
    }
    if (!raw.gate.passed) {
      issues.push(
        blocker("HANDOFF_GATE_FAILED", `spec-engineer gate did not pass (${gateFile})`)
      );
    }
    copies.push({ source: gateFile, target: "evidence/spec-engineer-gate.json" });
  } else {
    issues.push(
      blocker(
        "HANDOFF_GATE_FAILED",
        `spec-engineer gate evidence is missing (${gateFile})`
      )
    );
  }

  const lintFile = path.join(specRun, "findings", "structure-lint.json");
  if (await pathExists(lintFile)) {
    copies.push({ source: lintFile, target: "evidence/structure-lint.json" });
  }

  const metricsCandidates = options.metrics === undefined ? [] : [options.metrics];
  const htmlParent = path.dirname(htmlDir);
  metricsCandidates.push(
    path.join(specRun, "render-metrics.json"),
    path.join(htmlDir, "render-metrics.json"),
    path.join(htmlParent, "render-metrics.json"),
    path.join(htmlParent, "render", "metrics", "render-metrics.json"),
    path.join(htmlDir, "render", "metrics", "render-metrics.json"),
    path.join(path.dirname(specRun), "render", "metrics", "render-metrics.json")
  );
  let metricsCopied = false;
  for (const candidate of metricsCandidates) {
    if (await pathExists(candidate)) {
      copies.push({ source: candidate, target: "evidence/render-metrics.json" });
      metricsCopied = true;
      break;
    }
  }
  if (!metricsCopied) {
    issues.push(
      blocker(
        "HANDOFF_GATE_FAILED",
        "render metrics evidence is missing (pass --metrics or place render/metrics/render-metrics.json next to the HTML)"
      )
    );
  }
}

async function planAssets(build: BuildOptions): Promise<void> {
  const { options, specs, issues } = build;
  const references = new Set<string>();
  for (const { spec } of specs) {
    const refs = new Set<string>();
    collectAssetRefs(spec.layout, refs);
    for (const ref of refs) references.add(ref);
  }

  if (options.assets === undefined) {
    if (references.size > 0) {
      for (const ref of [...references].sort(compareStrings)) {
        issues.push(
          blocker(
            "HANDOFF_LICENSE_MISSING",
            `spec references asset ${ref} but no --assets package was provided`
          )
        );
      }
    }
    return;
  }

  const manifest = await loadAssetManifest(options.assets);
  build.assets = manifest.files;
  for (const record of manifest.licenses) {
    if (record.license.trim().length === 0) {
      issues.push(
        blocker("HANDOFF_LICENSE_MISSING", `asset ${record.id} has no license record`)
      );
    }
  }
  for (const ref of [...references].sort(compareStrings)) {
    const target = manifest.assetRefs.get(ref);
    if (target === undefined) {
      issues.push(
        blocker(
          "HANDOFF_LICENSE_MISSING",
          `spec references asset ${ref} but the asset manifest has no license record`
        )
      );
      continue;
    }
    const relative = target.startsWith("assets/") ? target.slice("assets/".length) : target;
    if (!isSafeRelative(relative)) {
      issues.push(
        blocker(
          "HANDOFF_LICENSE_MISSING",
          `asset ${ref} has an unsafe manifest path (${relative})`
        )
      );
      continue;
    }
    if (!(await pathExists(path.join(options.assets, relative)))) {
      issues.push(
        blocker(
          "HANDOFF_LICENSE_MISSING",
          `spec references asset ${ref} but the file is missing (${relative})`
        )
      );
    }
  }
  build.directoryCopies.push({ source: options.assets, target: "assets" });
}

async function buildPackInput(options: HandoffPackOptions): Promise<PackInput> {
  if (
    options.specRun === undefined ||
    options.html === undefined ||
    options.figma === undefined ||
    options.visualRun === undefined ||
    options.out === undefined
  ) {
    throw new HandoffPackUsageError(
      "missing required --spec-run/--html/--figma/--visual-run/--out"
    );
  }

  const specs = await loadSpecs(options.specRun);
  const projects = new Set(specs.map(({ spec }) => spec.meta.project));
  if (projects.size !== 1) {
    throw new Error(`SPEC_PROJECT_MISMATCH: ${[...projects].join(", ")}`);
  }
  const profiles = new Set(specs.map(({ spec }) => spec.meta.profile));
  if (profiles.size !== 1) {
    throw new Error(`SPEC_PROFILE_MISMATCH: ${[...profiles].join(", ")}`);
  }
  const project = [...projects][0]!;
  const profile = [...profiles][0]!;
  const pages = specs.map(({ spec }) => spec.meta.pageId);

  const issues: HandoffIssue[] = [];
  const copies: Array<{ source: string; target: string }> = [];
  const directoryCopies: Array<{ source: string; target: string }> = [];

  const baseline = await resolveBaseline(options, project);
  if (baseline === undefined) {
    issues.push(
      blocker(
        "HANDOFF_GATE_FAILED",
        "baseline manifest is missing (pass --baseline or include baseline-manifest.json in the visual run)"
      )
    );
  }

  let hashes: FigmaHashes | undefined;
  if (baseline !== undefined) {
    try {
      hashes = await computeFigmaHashes({
        figmaDir: options.figma,
        baselineFile: baseline.manifestFile,
      });
    } catch (error) {
      issues.push(
        blocker("HANDOFF_GATE_FAILED", `figma evidence hashing failed: ${errorMessage(error)}`)
      );
    }
  }

  const build: BuildOptions = {
    options,
    specs,
    pages,
    project,
    profile,
    figmaFiles: [],
    hashes,
    baseline,
    htmlHashes: new Map(),
    specHashes: new Map(),
    gates: {
      verify: { passed: false, hash: "" },
      conformance: { passed: false, hash: "" },
      parity: { passed: false, hash: "" },
      figmaSign: { passed: false, hash: "" },
      visualSign: { passed: false, hash: "" },
    },
    signoffs: [],
    assets: [],
    knownGaps: [...KNOWN_GAPS],
    copies,
    directoryCopies,
    issues,
  };

  await planSpecEvidence(build);
  await planFigmaEvidence(build);
  await planFigmaSignoff(build);
  await planVisualEvidence(build, options, baseline);
  await planAssets(build);

  let materialSymbols = false;
  for (const { spec } of specs) {
    const htmlFile = path.join(options.html!, `${spec.meta.pageId}.html`);
    if (await pathExists(htmlFile)) {
      const html = await readText(htmlFile);
      if (/TBD|TODO|\{\{/.test(html)) {
        issues.push(
          blocker(
            "HANDOFF_GATE_FAILED",
            `html/${spec.meta.pageId}.html contains a TBD/TODO/{{ placeholder`
          )
        );
      }
      if (hasMaterialSymbols(html)) materialSymbols = true;
    }
  }
  if (materialSymbols) {
    build.knownGaps.push("Material Symbols glyphs depend on the locally installed font");
  }
  if (!(await pathExists(path.join(options.specRun!, "artifacts", "block-manifest")))) {
    build.knownGaps.push(
      "Block manifests are not included for this run; Page Specs are the source of truth."
    );
  }
  if (!copies.some((copy) => copy.target === "evidence/render-metrics.json")) {
    build.knownGaps.push("Render metrics evidence is not included.");
  }
  build.knownGaps.push("Figma delivery-page readbacks and diffs are not included.");

  const docsInput: HandoffDocsInput = {
    project,
    pages: docsPages(specs),
    figma: { files: build.figmaFiles, pages },
    gates: build.gates,
    knownGaps: build.knownGaps,
    assets: build.assets,
    profile,
    catalog: profile,
    pipelineVersion: PIPELINE_VERSION,
    signoffs: build.signoffs,
  };

  // Generate docs before staging so a placeholder can never reach the output.
  try {
    assertNoPlaceholders(generateHandoffMd(docsInput), "HANDOFF.md");
    assertNoPlaceholders(generateLicensesMd(docsInput), "LICENSES.md");
  } catch (error) {
    issues.push(blocker("HANDOFF_GATE_FAILED", errorMessage(error)));
  }

  const plannedFiles = new Set<string>([
    ...copies.map((entry) => entry.target),
    "HANDOFF.md",
    "LICENSES.md",
  ]);
  for (const pageId of pages) {
    plannedFiles.add(`html/${pageId}.html`);
    plannedFiles.add(`spec/page-spec/${pageId}.json`);
  }

  const provisionalInput: HandoffInput = {
    project,
    generatedAt: new Date().toISOString(),
    pipelineVersion: PIPELINE_VERSION,
    profile,
    catalog: profile,
    pages,
    files: [...plannedFiles]
      .sort(compareStrings)
      .map((file) => ({ path: file, sha256: "", bytes: 0 })),
    inputHashes: {
      html: Object.fromEntries(
        [...build.htmlHashes.entries()].sort(([left], [right]) =>
          compareStrings(left, right)
        )
      ),
      specs: Object.fromEntries(
        [...build.specHashes.entries()].sort(([left], [right]) =>
          compareStrings(left, right)
        )
      ),
    },
    gates: build.gates,
    signoffs: build.signoffs,
    figma: { files: build.figmaFiles, pages },
    assets: build.assets,
    knownGaps: build.knownGaps,
  };

  for (const issue of validateHandoff(provisionalInput)) issues.push(issue);

  const seen = new Set<string>();
  const uniqueIssues = issues.filter((issue) => {
    const key = `${issue.code}\u0000${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    input: provisionalInput,
    docs: docsInput,
    copies,
    directoryCopies,
    issues: uniqueIssues,
  };
}

async function assertCleanOutput(out: string): Promise<void> {
  if (!(await pathExists(out))) return;
  if (!(await pathExists(path.join(out, "handoff.manifest.json")))) {
    throw new Error(`OUTPUT_NOT_EMPTY: ${out} exists and is not a handoff package`);
  }
}

export interface HandoffPackDeps {
  now?: () => Date;
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  },
  deps: HandoffPackDeps = {}
): Promise<number> {
  let options: HandoffPackOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof HandoffPackUsageError) {
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

  const printIssues = (issues: HandoffIssue[]): void => {
    const blockers = issues.filter((issue) => issue.severity === "blocker");
    if (options.json) {
      io.stdout(JSON.stringify({ ok: false, issues }));
      return;
    }
    io.stderr(`Handoff pack FAILED: ${blockers.length} blocker(s)`);
    for (const issue of issues) {
      io.stderr(`- ${issue.code}: ${issue.message}`);
    }
  };

  try {
    if (
      options.specRun === undefined ||
      options.html === undefined ||
      options.figma === undefined ||
      options.visualRun === undefined ||
      options.out === undefined
    ) {
      io.stderr("missing required --spec-run/--html/--figma/--visual-run/--out");
      io.stderr(USAGE);
      return 2;
    }
    await assertCleanOutput(options.out);

    const built = await buildPackInput(options);
    if (built.issues.some((issue) => issue.severity === "blocker")) {
      printIssues(built.issues);
      return 1;
    }

    const outDir = options.out;
    const parent = path.dirname(outDir);
    await mkdir(parent, { recursive: true });
    const nonce = `${process.pid}-${Date.now()}`;
    const staging = path.join(parent, `.${path.basename(outDir)}.tmp-${nonce}`);
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });

    let archive: HandoffInput["archive"] | undefined;
    let packedFiles = 0;
    try {
      for (const copy of built.copies) {
        await copyFileInto(copy.source, path.join(staging, ...copy.target.split("/")));
      }
      for (const copy of built.directoryCopies) {
        await copyDirectory(copy.source, path.join(staging, ...copy.target.split("/")));
      }
      await writeFile(
        path.join(staging, "HANDOFF.md"),
        generateHandoffMd(built.docs),
        "utf8"
      );
      await writeFile(
        path.join(staging, "LICENSES.md"),
        generateLicensesMd(built.docs),
        "utf8"
      );

      const files = await collectFiles(staging, new Set(["handoff.manifest.json"]));
      packedFiles = files.length;
      if (files.some((file) => file.path === "handoff.manifest.json" || file.path === "handoff.zip")) {
        throw new Error("HANDOFF_MANIFEST_SELF_REFERENCE: reserved file present in the pack");
      }
      const generatedAt = (deps.now?.() ?? new Date()).toISOString();
      const input: HandoffInput = {
        ...built.input,
        generatedAt,
        files,
      };
      const finalIssues = validateHandoff(input);
      if (finalIssues.some((issue) => issue.severity === "blocker")) {
        await rm(staging, { recursive: true, force: true });
        printIssues(finalIssues);
        return 1;
      }

      const manifest = buildHandoffManifest(input);
      await writeFile(
        path.join(staging, "handoff.manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8"
      );

      if (options.zip) {
        archive = await writeHandoffZip(staging, path.join(staging, "handoff.zip"));
        const withArchive = buildHandoffManifest({ ...input, files, archive });
        await writeFile(
          path.join(staging, "handoff.manifest.json"),
          `${JSON.stringify(withArchive, null, 2)}\n`,
          "utf8"
        );
      }

      if (await pathExists(outDir)) {
        await rm(outDir, { recursive: true, force: true });
      }
      await rename(staging, outDir);
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }

    if (options.json) {
      io.stdout(
        JSON.stringify({
          ok: true,
          project: built.input.project,
          pages: built.input.pages.length,
          files: packedFiles,
          out: outDir,
          archive: archive ?? null,
          knownGaps: built.docs.knownGaps,
        })
      );
    } else {
      io.stdout("Handoff pack OK: success");
      io.stdout(`Project: ${built.input.project}`);
      io.stdout(`Pages: ${built.input.pages.length}`);
      io.stdout(`Out: ${outDir}`);
      if (archive !== undefined) {
        io.stdout(`Archive: ${path.join(outDir, archive.path)} (${archive.sha256}, ${archive.bytes} bytes)`);
      }
    }
    return 0;
  } catch (error) {
    if (options.json) {
      io.stdout(JSON.stringify({ ok: false, error: errorMessage(error) }));
    } else {
      io.stderr(`Handoff pack FAILED: ${errorMessage(error)}`);
    }
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
