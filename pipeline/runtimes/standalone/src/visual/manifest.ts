import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  PageSpecSchema,
  UiBriefSchema,
  type PageSpec,
  type UiBrief,
} from "@prd-ui/contracts";
import { loadProjectConfig } from "@prd-ui/orchestrator";
import type { VisualCase, VisualFinding } from "@prd-ui/visual-review";

export interface VisualProject {
  project: string;
  brief: UiBrief;
  specs: PageSpec[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Recursively sort object keys so manifest and findings hashes are stable. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortValue(entry)])
    );
  }
  return value;
}

export function hashText(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

export function hashValue(value: unknown): string {
  return hashText(canonicalJson(value));
}

export async function hashFile(file: string): Promise<string> {
  const buffer = await readFile(file);
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

/** Per-page hash of `<htmlDir>/<pageId>.html`; missing files are an error. */
export async function hashHtmlInputs(
  htmlDir: string,
  pageIds: readonly string[]
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const pageId of [...pageIds].sort()) {
    hashes[pageId] = await hashFile(path.join(htmlDir, `${pageId}.html`));
  }
  return hashes;
}

/**
 * Re-hash every manifest file and return `<case>: <detail>` entries for
 * missing files or bytes that no longer match the manifest.
 */
export async function verifyManifestFiles(
  rootDir: string,
  manifest: Pick<VisualManifest, "cases">
): Promise<string[]> {
  const mismatches: string[] = [];
  for (const entry of manifest.cases) {
    try {
      const actual = await hashFile(path.join(rootDir, entry.file));
      if (actual !== entry.sha256) {
        mismatches.push(`${entry.id}: ${actual} != ${entry.sha256}`);
      }
    } catch (error) {
      mismatches.push(`${entry.id}: ${errorMessage(error)}`);
    }
  }
  return mismatches;
}

/**
 * Load the project brief and the Page Specs written by `spec:engineer`. Specs
 * are ordered by the signed brief's page order, not by file name, so the
 * visual matrix matches the IA order.
 */
export async function loadVisualProject(input: {
  projectPath: string;
  specRunDir: string;
}): Promise<VisualProject> {
  const { config, baseDir } = loadProjectConfig(input.projectPath);
  const briefPath = path.resolve(baseDir, config.brief);

  let briefRaw: unknown;
  try {
    briefRaw = JSON.parse(await readFile(briefPath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`BRIEF_INVALID: ${briefPath}: ${errorMessage(error)}`);
  }
  const briefParsed = UiBriefSchema.safeParse(briefRaw);
  if (!briefParsed.success) {
    throw new Error(`BRIEF_INVALID: ${briefPath}: ${briefParsed.error.message}`);
  }
  const brief = briefParsed.data;
  if (brief.meta.project !== config.project) {
    throw new Error(
      `PROJECT_MISMATCH: brief ${brief.meta.project} vs project ${config.project}`
    );
  }

  const specsDir = path.join(input.specRunDir, "artifacts", "page-spec");
  let files: string[];
  try {
    files = (await readdir(specsDir)).filter((file) => file.endsWith(".json")).sort();
  } catch (error) {
    throw new Error(`SPEC_RUN_INVALID: ${specsDir}: ${errorMessage(error)}`);
  }
  if (files.length === 0) {
    throw new Error(`SPEC_RUN_EMPTY: ${specsDir}`);
  }

  const specs: PageSpec[] = [];
  for (const file of files) {
    const source = path.join(specsDir, file);
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(source, "utf8")) as unknown;
    } catch (error) {
      throw new Error(`SPEC_INVALID: ${source}: ${errorMessage(error)}`);
    }
    const parsed = PageSpecSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`SPEC_INVALID: ${source}: ${parsed.error.message}`);
    }
    if (parsed.data.meta.project !== config.project) {
      throw new Error(
        `PROJECT_MISMATCH: spec ${parsed.data.meta.pageId} belongs to ${parsed.data.meta.project}`
      );
    }
    specs.push(parsed.data);
  }

  const order = new Map(
    brief.ia.pages.map((page, index) => [page.id, index] as const)
  );
  specs.sort((left, right) => {
    const a = order.get(left.meta.pageId) ?? Number.MAX_SAFE_INTEGER;
    const b = order.get(right.meta.pageId) ?? Number.MAX_SAFE_INTEGER;
    if (a !== b) return a - b;
    return left.meta.pageId.localeCompare(right.meta.pageId);
  });

  return { project: config.project, brief, specs };
}

export interface VisualManifestCase {
  id: string;
  pageId: string;
  state: string;
  query?: Record<string, string>;
  viewport: { width: number; height: number };
  file: string;
  sha256: string;
  visualHash?: string;
}

export interface VisualManifest {
  schemaVersion: "1.0";
  project: string;
  generatedAt: string;
  cases: VisualManifestCase[];
}

export function manifestCaseFor(
  visualCase: VisualCase,
  file: string,
  sha256: string,
  visualHash?: string
): VisualManifestCase {
  return {
    id: visualCase.id,
    pageId: visualCase.pageId,
    state: visualCase.state,
    ...(visualCase.query === undefined ? {} : { query: visualCase.query }),
    viewport: { ...visualCase.viewport },
    file,
    sha256,
    ...(visualHash === undefined ? {} : { visualHash }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Mirror the static-server guard: only relative paths inside the root. */
function isUnsafeManifestFile(file: string): boolean {
  if (file.length === 0 || file.includes("\0")) return true;
  if (file.startsWith("/") || file.startsWith("\\")) return true;
  if (/^[A-Za-z]:[\\/]/.test(file)) return true;
  const segments = file.split(/[\\/]/);
  if (segments.some((segment) => segment === "..")) return true;
  const normalized = path.posix.normalize(file.replace(/\\/g, "/"));
  return normalized === "." || normalized === ".." || normalized.startsWith("../");
}

function stringField(
  value: Record<string, unknown>,
  key: string,
  source: string
): string {
  const entry = value[key];
  if (typeof entry !== "string" || entry.length === 0) {
    throw new Error(`MANIFEST_INVALID: ${source}: ${key} must be a non-empty string`);
  }
  return entry;
}

function parseManifestCase(value: unknown, source: string): VisualManifestCase {
  if (!isRecord(value)) {
    throw new Error(`MANIFEST_INVALID: ${source}: case must be an object`);
  }
  const viewport = value.viewport;
  if (
    !isRecord(viewport) ||
    typeof viewport.width !== "number" ||
    typeof viewport.height !== "number" ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    throw new Error(`MANIFEST_INVALID: ${source}: invalid viewport`);
  }
  let query: Record<string, string> | undefined;
  if (value.query !== undefined) {
    if (!isRecord(value.query)) {
      throw new Error(`MANIFEST_INVALID: ${source}: query must be an object`);
    }
    query = {};
    for (const [key, entry] of Object.entries(value.query)) {
      if (typeof entry !== "string") {
        throw new Error(`MANIFEST_INVALID: ${source}: query.${key} must be a string`);
      }
      query[key] = entry;
    }
  }
  const sha256 = stringField(value, "sha256", source);
  if (!sha256.startsWith("sha256:")) {
    throw new Error(`MANIFEST_INVALID: ${source}: sha256 must be sha256:<hex>`);
  }
  const file = stringField(value, "file", source);
  if (isUnsafeManifestFile(file)) {
    throw new Error(`MANIFEST_INVALID: ${source}: unsafe file path ${file}`);
  }
  return {
    id: stringField(value, "id", source),
    pageId: stringField(value, "pageId", source),
    state: stringField(value, "state", source),
    ...(query === undefined ? {} : { query }),
    viewport: { width: viewport.width, height: viewport.height },
    file,
    sha256,
    ...(typeof value.visualHash === "string"
      ? { visualHash: value.visualHash }
      : {}),
  };
}

export function parseVisualManifest(
  value: unknown,
  source: string
): VisualManifest {
  if (!isRecord(value)) {
    throw new Error(`MANIFEST_INVALID: ${source}: manifest must be an object`);
  }
  if (value.schemaVersion !== "1.0") {
    throw new Error(`MANIFEST_INVALID: ${source}: unsupported schemaVersion`);
  }
  if (!Array.isArray(value.cases)) {
    throw new Error(`MANIFEST_INVALID: ${source}: cases must be an array`);
  }
  const cases = value.cases.map((entry) => parseManifestCase(entry, source));
  const ids = new Set<string>();
  for (const entry of cases) {
    if (ids.has(entry.id)) {
      throw new Error(`MANIFEST_INVALID: ${source}: duplicate case ${entry.id}`);
    }
    ids.add(entry.id);
  }
  return {
    schemaVersion: "1.0",
    project: stringField(value, "project", source),
    generatedAt: stringField(value, "generatedAt", source),
    cases,
  };
}

export async function readVisualManifest(
  file: string
): Promise<VisualManifest | undefined> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`MANIFEST_INVALID: ${file}: ${errorMessage(error)}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`MANIFEST_INVALID: ${file}: ${errorMessage(error)}`);
  }
  return parseVisualManifest(raw, file);
}

/**
 * Content hash for signoffs. `generatedAt` is intentionally excluded so an
 * identical capture on a later run keeps the same manifest hash.
 */
export function visualManifestHash(
  manifest: Pick<VisualManifest, "schemaVersion" | "project" | "cases">
): string {
  return hashValue({
    schemaVersion: manifest.schemaVersion,
    project: manifest.project,
    cases: manifest.cases.map(({ file: _file, sha256, visualHash, ...entry }) => ({
      ...entry,
      hash: visualHash ?? sha256,
    })),
  });
}

/**
 * Pixel-only manifest fingerprint for the signed-critique cache. Historically
 * this excluded only the storage path; the manifest now carries the stable
 * `visualHash`, so it is identical to `visualManifestHash`.
 */
export function visualManifestFingerprint(
  manifest: Pick<VisualManifest, "schemaVersion" | "project" | "cases">
): string {
  return visualManifestHash(manifest);
}

export interface VisualDiffSummary {
  passed: number;
  failed: number;
  missing: number;
}

export type VisualRunStatus =
  | "passed"
  | "awaiting_signoff"
  | "blocked"
  | "success";

export interface VisualRunState {
  schemaVersion: "1.0";
  runId: string;
  project: string;
  stage: "review" | "signoff" | "done";
  status: VisualRunStatus;
  cases: number;
  screenshots: number;
  diff: VisualDiffSummary;
  findings: VisualFinding[];
  costCny: number;
  usageComplete: boolean;
  manifestHash: string;
  findingsHash: string;
  /** sha256 of each page's HTML input, so handoff can bind the supplied bytes. */
  htmlHashes?: Record<string, string>;
  signoff: { visual: boolean };
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  signer?: string;
  error?: string;
}

function numberField(
  value: Record<string, unknown>,
  key: string,
  source: string
): number {
  const entry = value[key];
  if (typeof entry !== "number" || !Number.isFinite(entry)) {
    throw new Error(`STATE_INVALID: ${source}: ${key} must be a number`);
  }
  return entry;
}

function parseFindings(value: unknown, source: string): VisualFinding[] {
  if (!Array.isArray(value)) {
    throw new Error(`STATE_INVALID: ${source}: findings must be an array`);
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error(`STATE_INVALID: ${source}: finding must be an object`);
    }
    const severity = entry.severity;
    if (severity !== "blocker" && severity !== "major" && severity !== "minor") {
      throw new Error(`STATE_INVALID: ${source}: invalid finding severity`);
    }
    return {
      id: stringField(entry, "id", source),
      severity,
      code: stringField(entry, "code", source),
      message: stringField(entry, "message", source),
      ...(typeof entry.pageId === "string" ? { pageId: entry.pageId } : {}),
      ...(typeof entry.state === "string" ? { state: entry.state } : {}),
      ...(typeof entry.evidence === "string" ? { evidence: entry.evidence } : {}),
    };
  });
}

export function parseVisualRunState(
  value: unknown,
  source: string
): VisualRunState {
  if (!isRecord(value)) {
    throw new Error(`STATE_INVALID: ${source}: state must be an object`);
  }
  if (value.schemaVersion !== "1.0") {
    throw new Error(`STATE_INVALID: ${source}: unsupported schemaVersion`);
  }
  const status = value.status;
  if (
    status !== "passed" &&
    status !== "awaiting_signoff" &&
    status !== "blocked" &&
    status !== "success"
  ) {
    throw new Error(`STATE_INVALID: ${source}: invalid status`);
  }
  const stage = value.stage;
  if (stage !== "review" && stage !== "signoff" && stage !== "done") {
    throw new Error(`STATE_INVALID: ${source}: invalid stage`);
  }
  const diff = value.diff;
  if (!isRecord(diff)) {
    throw new Error(`STATE_INVALID: ${source}: diff must be an object`);
  }
  const signoff = value.signoff;
  if (!isRecord(signoff) || typeof signoff.visual !== "boolean") {
    throw new Error(`STATE_INVALID: ${source}: invalid signoff`);
  }
  let htmlHashes: Record<string, string> | undefined;
  if (value.htmlHashes !== undefined) {
    if (!isRecord(value.htmlHashes)) {
      throw new Error(`STATE_INVALID: ${source}: htmlHashes must be an object`);
    }
    htmlHashes = {};
    for (const [pageId, entry] of Object.entries(value.htmlHashes)) {
      if (typeof entry !== "string" || entry.length === 0) {
        throw new Error(`STATE_INVALID: ${source}: htmlHashes.${pageId}`);
      }
      htmlHashes[pageId] = entry;
    }
  }
  return {
    schemaVersion: "1.0",
    runId: stringField(value, "runId", source),
    project: stringField(value, "project", source),
    stage,
    status,
    cases: numberField(value, "cases", source),
    screenshots: numberField(value, "screenshots", source),
    diff: {
      passed: numberField(diff, "passed", source),
      failed: numberField(diff, "failed", source),
      missing: numberField(diff, "missing", source),
    },
    findings: parseFindings(value.findings, source),
    costCny: numberField(value, "costCny", source),
    usageComplete: Boolean(value.usageComplete),
    manifestHash: stringField(value, "manifestHash", source),
    findingsHash: stringField(value, "findingsHash", source),
    ...(htmlHashes === undefined ? {} : { htmlHashes }),
    signoff: { visual: signoff.visual },
    startedAt: stringField(value, "startedAt", source),
    updatedAt: stringField(value, "updatedAt", source),
    ...(typeof value.finishedAt === "string"
      ? { finishedAt: value.finishedAt }
      : {}),
    ...(typeof value.signer === "string" ? { signer: value.signer } : {}),
    ...(typeof value.error === "string" ? { error: value.error } : {}),
  };
}
