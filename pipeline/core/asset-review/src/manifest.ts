import type { AssetManifest } from "@prd-ui/contracts";
import type {
  AssetReviewRecord,
  BatchGateResult,
  SourceTier,
} from "./contracts.js";

export interface ToAssetManifestInput {
  project: string;
  profile: string;
  records: AssetReviewRecord[];
}

export interface ManifestReviewAsset {
  id: string;
  status: "passed" | "unresolved";
  sourceTier?: SourceTier;
  degraded: boolean;
  degradedReason?: string;
  fallbackFrom?: SourceTier;
  fallbackReason?: string;
  review?: AssetReviewRecord["review"];
}

export interface ManifestReviewBatchGates {
  iconSetPassed?: boolean;
  illustrationSetPassed?: boolean;
  skipped?: boolean;
  reason?: "PARTIAL_REVIEW";
}

export interface ManifestReview {
  project: string;
  profile: string;
  assets: ManifestReviewAsset[];
  batchGates?: ManifestReviewBatchGates;
  usageSource?: "json-events" | "unavailable";
  usageComplete?: boolean;
  complete: boolean;
}

export interface ToManifestReviewInput {
  project: string;
  profile: string;
  records: AssetReviewRecord[];
  batchGates?: BatchGateResult;
  usageSource?: "json-events" | "unavailable";
  usageComplete?: boolean;
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

/**
 * Sidecar for downstream visual gates/renderers. `manifest.json` stays a pure
 * frozen-asset manifest; review provenance, degradation and set-gate outcomes
 * live here so they never leak into `AssetManifestSchema`.
 */
export function toManifestReview(input: ToManifestReviewInput): ManifestReview {
  const assets = input.records.map((record): ManifestReviewAsset => ({
    id: record.assetId,
    status: record.status,
    ...(record.sourceTier === undefined ? {} : { sourceTier: record.sourceTier }),
    degraded: record.degraded,
    ...(record.degradedReason === undefined ? {} : { degradedReason: record.degradedReason }),
    ...(record.fallbackFrom === undefined ? {} : { fallbackFrom: record.fallbackFrom }),
    ...(record.fallbackReason === undefined ? {} : { fallbackReason: record.fallbackReason }),
    ...(record.review === undefined ? {} : { review: record.review }),
  }));

  const gates = input.batchGates;
  const batchGates: ManifestReviewBatchGates | undefined =
    gates === undefined
      ? undefined
      : {
          ...(gates.iconSet === undefined ? {} : { iconSetPassed: gates.iconSet.passed }),
          ...(gates.illustrationSet === undefined
            ? {}
            : { illustrationSetPassed: gates.illustrationSet.passed }),
          ...(gates.skipped === undefined ? {} : { skipped: gates.skipped }),
          ...(gates.reason === undefined ? {} : { reason: gates.reason }),
        };

  const complete =
    assets.length > 0 &&
    assets.every((asset) => asset.status === "passed") &&
    gates?.iconSet?.passed !== false &&
    gates?.illustrationSet?.passed !== false;

  return {
    project: input.project,
    profile: input.profile,
    assets,
    ...(batchGates === undefined ? {} : { batchGates }),
    ...(input.usageSource === undefined ? {} : { usageSource: input.usageSource }),
    ...(input.usageComplete === undefined ? {} : { usageComplete: input.usageComplete }),
    complete,
  };
}
