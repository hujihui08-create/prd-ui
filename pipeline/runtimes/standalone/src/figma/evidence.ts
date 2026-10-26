import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  FigmaDiffSchema,
  FigmaPlanSchema,
  FigmaReadbackSchema,
  type FigmaDiff,
  type FigmaPlan,
  type FigmaReadback,
} from "@prd-ui/contracts";
import { diffFigma } from "@prd-ui/figma";
import { hashFile } from "../visual/manifest.js";

export interface BaselineCaseFile {
  pageId: string;
  state: string;
  file: string;
  sha256: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

export async function loadPlanEvidence(file: string): Promise<FigmaPlan> {
  const parsed = FigmaPlanSchema.safeParse(await readJson(file));
  if (!parsed.success) {
    throw new Error(`EVIDENCE_INVALID: ${file}: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function loadReadbackEvidence(file: string): Promise<FigmaReadback> {
  const parsed = FigmaReadbackSchema.safeParse(await readJson(file));
  if (!parsed.success) {
    throw new Error(`EVIDENCE_INVALID: ${file}: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function loadDiffEvidence(file: string): Promise<FigmaDiff> {
  const parsed = FigmaDiffSchema.safeParse(await readJson(file));
  if (!parsed.success) {
    throw new Error(`EVIDENCE_INVALID: ${file}: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Re-derive a page diff from the current plan + readback. This is the only
 * trusted verdict: stored `figma-diff.*.json` files can be stale while still
 * claiming `passed: true`.
 */
export function recomputeFigmaDiff(plan: FigmaPlan, readback: FigmaReadback): FigmaDiff {
  return diffFigma(plan, readback);
}

export interface ParityHashPage {
  pageId: string;
  figmaHash?: string;
  baselineHash?: string;
}

export interface ParityHashContext {
  figmaDir: string;
  pages: ParityHashPage[];
  baselineCases: BaselineCaseFile[];
  /** Absolute path of a baseline case file, when it can be resolved. */
  resolveBaselineFile: (entry: BaselineCaseFile) => Promise<string | undefined>;
}

/**
 * Re-hash the parity inputs recorded in `parity.json`:
 * `<figma>/parity/figma.<pageId>.png` and the signed baseline case PNG.
 * A mismatch means the comparison report no longer describes these pixels.
 */
export async function verifyParityEvidence(context: ParityHashContext): Promise<string[]> {
  const issues: string[] = [];
  for (const page of [...context.pages].sort((left, right) =>
    left.pageId < right.pageId ? -1 : left.pageId > right.pageId ? 1 : 0
  )) {
    const figmaFile = path.join(context.figmaDir, "parity", `figma.${page.pageId}.png`);
    let figmaHash: string;
    try {
      figmaHash = await hashFile(figmaFile);
    } catch {
      issues.push(`${page.pageId}: missing parity PNG (figma/parity/figma.${page.pageId}.png)`);
      continue;
    }
    if (page.figmaHash === undefined) {
      issues.push(`${page.pageId}: parity.json has no figmaHash`);
    } else if (page.figmaHash !== figmaHash) {
      issues.push(`${page.pageId}: parity PNG hash does not match parity.json`);
    }

    const baselineCase = context.baselineCases.find(
      (entry) => entry.pageId === page.pageId && entry.state === "default"
    );
    if (baselineCase === undefined) {
      issues.push(`${page.pageId}: baseline manifest has no default case`);
      continue;
    }
    const baselineFile = await context.resolveBaselineFile(baselineCase);
    if (baselineFile === undefined) {
      issues.push(`${page.pageId}: baseline PNG is missing (${baselineCase.file})`);
      continue;
    }
    const baselineHash = await hashFile(baselineFile);
    if (page.baselineHash === undefined) {
      issues.push(`${page.pageId}: parity.json has no baselineHash`);
    } else if (page.baselineHash !== baselineHash) {
      issues.push(`${page.pageId}: baseline PNG hash does not match parity.json`);
    }
    if (baselineCase.sha256 !== baselineHash) {
      issues.push(`${page.pageId}: baseline PNG hash does not match manifest sha256`);
    }
  }
  return issues;
}
