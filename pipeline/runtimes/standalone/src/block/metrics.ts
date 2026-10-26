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
 * Number of seam types at the leading boundary of each block (0, 1, or 2).
 *
 * `countSeams` counts both a double-padding boundary and a duplicate-title
 * boundary, so prefix differences preserve the full count instead of
 * collapsing the boundary to a boolean.
 */
export function seamCountsByBoundary(blocks: BlockSpec[], profile: Profile): number[] {
  return blocks.map((_, index) => {
    if (index === 0) return 0;
    return countSeams(blocks.slice(0, index + 1), profile) - countSeams(blocks.slice(0, index), profile);
  });
}

/**
 * Seams introduced by the experiment, attributed to the block after the
 * boundary. Counts are per boundary, so gaining a second seam type is visible.
 * Removed seams are not credited back: the experiment only asks whether block
 * generation made the page worse.
 */
export function newSeamsByBlock(
  baseline: BlockSpec[],
  experiment: BlockSpec[],
  profile: Profile
): number[] {
  const baselineCounts = seamCountsByBoundary(baseline, profile);
  return seamCountsByBoundary(experiment, profile).map((count, index) =>
    Math.max(0, count - (baselineCounts[index] ?? 0))
  );
}
