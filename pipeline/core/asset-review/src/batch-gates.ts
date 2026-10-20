import type { AssetReviewRecord, BatchGateResult } from "./contracts.js";
import { checkIconSet } from "./gates/icon.js";
import { checkIllustrationSet } from "./gates/illustration-set.js";
import type { ArtifactStorePort } from "./ports.js";

export type { BatchGateResult } from "./contracts.js";

export interface RunBatchGatesInput {
  records: AssetReviewRecord[];
  store: ArtifactStorePort;
  only?: string[];
}

/**
 * Run the set-level gates after every asset has been processed. Only frozen,
 * passed assets participate; a failed asset is already reported on its own
 * record and must not sink the whole set twice.
 *
 * `--only` is a partial review: the frozen set is incomplete, so claiming
 * whole-set consistency would be wrong. Record the skip instead.
 */
export async function runBatchGates(input: RunBatchGatesInput): Promise<BatchGateResult> {
  if (input.only !== undefined && input.only.length > 0) {
    const skipped: BatchGateResult = {
      skipped: true,
      reason: "PARTIAL_REVIEW",
      scope: [...input.only],
    };
    await input.store.writeJson("assets/batch-gates.json", skipped);
    return skipped;
  }

  const passed = input.records.flatMap((record) =>
    record.status === "passed" && record.frozen !== undefined
      ? [{ record, path: record.frozen.path }]
      : []
  );

  const icons = await Promise.all(
    passed
      .filter((entry) => entry.record.brief.kind === "icon")
      .map(async (entry) => ({
        id: entry.record.assetId,
        svg: await input.store.readText(entry.path),
      }))
  );
  const illustrations = await Promise.all(
    passed
      .filter((entry) => entry.record.brief.kind === "illustration")
      .map(async (entry) => ({
        id: entry.record.assetId,
        svg: await input.store.readText(entry.path),
        brief: entry.record.brief,
      }))
  );

  const iconSet = checkIconSet(icons);
  const illustrationSet = checkIllustrationSet(illustrations);
  await input.store.writeJson("assets/icon-set.json", iconSet);
  await input.store.writeJson("assets/illustration-set.json", illustrationSet);

  return { iconSet, illustrationSet };
}
