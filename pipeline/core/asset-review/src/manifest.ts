import type { AssetManifest } from "@prd-ui/contracts";
import type { AssetReviewRecord } from "./contracts.js";

export interface ToAssetManifestInput {
  project: string;
  profile: string;
  records: AssetReviewRecord[];
}

/**
 * Frozen records become the renderer-facing manifest. Unresolved assets stay
 * as placeholders and force `complete: false`; nothing is silently dropped.
 */
export function toAssetManifest(input: ToAssetManifestInput): AssetManifest {
  const assets = input.records.flatMap((record) => {
    if (record.status !== "passed" || record.frozen === undefined || record.license === undefined) {
      return [];
    }
    return [
      {
        id: record.assetId,
        kind: record.brief.kind === "poster" ? ("image" as const) : record.brief.kind,
        library: record.source,
        style: record.brief.styleRef,
        files: (record.files ?? [{ path: record.frozen.path, format: record.frozen.format }]).map(
          (file) => ({ path: file.path, format: file.format })
        ),
        license: record.license,
        hash: record.frozen.hash,
      },
    ];
  });

  return {
    project: input.project,
    profile: input.profile,
    assets,
    placeholders: input.records
      .filter((record) => record.status !== "passed")
      .map((record) => record.assetId),
    complete: input.records.length > 0 && input.records.every((record) => record.status === "passed"),
  };
}
