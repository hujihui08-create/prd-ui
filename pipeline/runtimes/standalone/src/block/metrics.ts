import { createHash } from "node:crypto";
import type { BlockSpec, Profile, SpecNode } from "@prd-ui/contracts";
import { countSeams } from "@prd-ui/compiler";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${key}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Same canonical hash that `splitBlocks` writes into a BlockSpec. */
export function blockRootHash(node: SpecNode): string {
  return `sha256:${createHash("sha256").update(canonical(node)).digest("hex")}`;
}

/** Percentage change from a baseline, rounded to 2 decimals. */
export function percentDelta(baseline: number, value: number): number | undefined {
  if (!Number.isFinite(baseline) || baseline <= 0 || !Number.isFinite(value)) return undefined;
  return Math.round(((value - baseline) / baseline) * 10000) / 100;
}

/**
 * Whether the boundary in front of block `index` is a seam.
 *
 * `countSeams` only returns a total, so prefix counts attribute a seam to the
 * block that its leading boundary belongs to.
 */
export function seamBoundaries(blocks: BlockSpec[], profile: Profile): boolean[] {
  return blocks.map((_, index) => {
    if (index === 0) return false;
    const withPrevious = countSeams(blocks.slice(0, index + 1), profile);
    const withoutPrevious = countSeams(blocks.slice(0, index), profile);
    return withPrevious > withoutPrevious;
  });
}

/**
 * Seams introduced by the experiment, attributed to the block after the
 * boundary. A seam that already existed in the baseline is not counted: the
 * experiment only answers whether block generation made the page worse.
 */
export function newSeamsByBlock(
  baseline: BlockSpec[],
  experiment: BlockSpec[],
  profile: Profile
): number[] {
  const baselineSeams = seamBoundaries(baseline, profile);
  const experimentSeams = seamBoundaries(experiment, profile);
  return experimentSeams.map((seam, index) =>
    seam && baselineSeams[index] !== true ? 1 : 0
  );
}
