import path from "node:path";
import {
  VISUAL_DIFF_MAX_RATIO,
  type ScreenshotEvidence,
  type VisualCase,
  type VisualDiffEntry,
  type VisualFinding,
} from "@prd-ui/visual-review";
import {
  hashFile,
  readVisualManifest,
  type VisualDiffSummary,
  type VisualManifest,
  type VisualManifestCase,
} from "./manifest.js";

export type DiffPng = (
  aPath: string,
  bPath: string,
  outPath: string
) => Promise<{ diffPixels: number; totalPixels: number }>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Baseline manifest plus the cases whose PNGs actually exist. */
export interface BaselineContext {
  manifest: VisualManifest | undefined;
  byId: Map<string, VisualManifestCase>;
  validIds: string[];
  findings: VisualFinding[];
}

/**
 * Load a baseline without trusting it: an unreadable manifest, a project
 * mismatch, or a manifest entry without its PNG is a blocker. Only cases with
 * both a manifest entry and a file are offered to the gate as baseline cases.
 */
export async function loadBaseline(
  baselineDir: string,
  project: string
): Promise<BaselineContext> {
  const findings: VisualFinding[] = [];
  let manifest: VisualManifest | undefined;
  try {
    manifest = await readVisualManifest(path.join(baselineDir, "manifest.json"));
  } catch (error) {
    findings.push({
      id: "VISUAL_BASELINE_MANIFEST_INVALID",
      severity: "blocker",
      code: "VISUAL_BASELINE_MANIFEST_INVALID",
      message: errorMessage(error),
    });
    return { manifest: undefined, byId: new Map(), validIds: [], findings };
  }
  if (manifest === undefined) {
    findings.push({
      id: "VISUAL_BASELINE_MANIFEST_MISSING",
      severity: "blocker",
      code: "VISUAL_BASELINE_MANIFEST_MISSING",
      message: `no baseline manifest at ${path.join(baselineDir, "manifest.json")}`,
    });
    return { manifest: undefined, byId: new Map(), validIds: [], findings };
  }
  if (manifest.project !== project) {
    findings.push({
      id: "VISUAL_BASELINE_MANIFEST_INVALID",
      severity: "blocker",
      code: "VISUAL_BASELINE_MANIFEST_INVALID",
      message: `baseline project ${manifest.project} does not match ${project}`,
    });
    return { manifest: undefined, byId: new Map(), validIds: [], findings };
  }

  const byId = new Map<string, VisualManifestCase>();
  const validIds: string[] = [];
  for (const entry of manifest.cases) {
    let actual: string;
    try {
      actual = await hashFile(path.join(baselineDir, entry.file));
    } catch {
      // A manifest entry without its PNG is a missing baseline, not a diff.
      continue;
    }
    if (actual !== entry.sha256) {
      findings.push({
        id: `VISUAL_BASELINE_HASH_MISMATCH:${entry.id}`,
        severity: "blocker",
        code: "VISUAL_BASELINE_HASH_MISMATCH",
        pageId: entry.pageId,
        state: entry.state,
        message: `baseline ${entry.id} sha256 ${actual} != manifest ${entry.sha256}`,
        evidence: entry.file,
      });
      continue;
    }
    byId.set(entry.id, entry);
    validIds.push(entry.id);
  }
  return { manifest, byId, validIds, findings };
}

export interface DiffContext {
  entries: VisualDiffEntry[];
  summary: VisualDiffSummary;
  findings: VisualFinding[];
}

/** Pixel-diff every captured case that has a usable baseline. */
export async function computeDiffs(input: {
  cases: VisualCase[];
  screenshots: ScreenshotEvidence[];
  baselineDir: string;
  baseline: BaselineContext;
  runDir: string;
  diffPng: DiffPng;
}): Promise<DiffContext> {
  const byCase = new Map(input.screenshots.map((entry) => [entry.caseId, entry]));
  const entries: VisualDiffEntry[] = [];
  const findings: VisualFinding[] = [];
  let passed = 0;
  let failed = 0;
  let missing = 0;

  for (const visualCase of input.cases) {
    const baseline = input.baseline.byId.get(visualCase.id);
    if (baseline === undefined) {
      missing += 1;
      continue;
    }
    const screenshot = byCase.get(visualCase.id);
    if (screenshot === undefined) continue;

    const outRelative = `diff/${visualCase.id}.png`;
    try {
      const result = await input.diffPng(
        path.join(input.baselineDir, baseline.file),
        path.join(input.runDir, screenshot.path),
        path.join(input.runDir, outRelative)
      );
      entries.push({
        caseId: visualCase.id,
        diffPixels: result.diffPixels,
        totalPixels: result.totalPixels,
      });
      const exceeded =
        result.totalPixels === 0
          ? result.diffPixels > 0
          : result.diffPixels / result.totalPixels > VISUAL_DIFF_MAX_RATIO;
      if (exceeded) failed += 1;
      else passed += 1;
    } catch (error) {
      failed += 1;
      findings.push({
        id: `VISUAL_DIFF_ERROR:${visualCase.id}`,
        severity: "blocker",
        code: "VISUAL_DIFF_ERROR",
        pageId: visualCase.pageId,
        state: visualCase.state,
        message: errorMessage(error),
        evidence: outRelative,
      });
    }
  }

  return { entries, summary: { passed, failed, missing }, findings };
}
