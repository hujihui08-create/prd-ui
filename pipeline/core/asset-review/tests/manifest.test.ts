import { describe, expect, it } from "vitest";
import { AssetManifestSchema } from "@prd-ui/contracts";
import type { AssetBrief, AssetReviewRecord } from "../src/contracts.js";
import { toAssetManifest, toManifestReview } from "../src/manifest.js";

const brief: AssetBrief = {
  id: "icon-home",
  kind: "icon",
  scene: "home",
  styleRef: "b-mobile",
  size: { width: 24, height: 24 },
  format: "svg",
  constraints: {},
  sourceChain: ["library"],
};

function passed(id: string): AssetReviewRecord {
  return {
    assetId: id,
    brief: { ...brief, id },
    status: "passed",
    sourceTier: "A",
    source: "library",
    attempts: [],
    degraded: false,
    frozen: { path: `assets/frozen/${id}/asset.svg`, format: "svg", hash: "sha256:x" },
    license: "ISC",
    files: [{ path: `assets/frozen/${id}/asset.svg`, format: "svg" }],
  };
}

function unresolved(id: string): AssetReviewRecord {
  return {
    assetId: id,
    brief: { ...brief, id },
    status: "unresolved",
    attempts: [],
    degraded: false,
  };
}

describe("toAssetManifest", () => {
  it("maps frozen assets and keeps unresolved ids as placeholders", () => {
    const manifest = toAssetManifest({
      project: "employee-app",
      profile: "b-mobile",
      records: [passed("icon-home"), unresolved("icon-search")],
    });
    expect(manifest.assets).toHaveLength(1);
    expect(manifest.assets[0]).toMatchObject({
      id: "icon-home",
      kind: "icon",
      library: "library",
      license: "ISC",
      hash: "sha256:x",
    });
    expect(manifest.placeholders).toEqual(["icon-search"]);
    expect(manifest.complete).toBe(false);
  });

  it("is complete only when every record passed", () => {
    const manifest = toAssetManifest({
      project: "employee-app",
      profile: "b-mobile",
      records: [passed("icon-home"), passed("icon-search")],
    });
    expect(manifest.complete).toBe(true);
    expect(manifest.placeholders).toEqual([]);
  });

  it("is incomplete for an empty run", () => {
    expect(toAssetManifest({ project: "p", profile: "b", records: [] }).complete).toBe(false);
  });

  it("stays compatible with AssetManifestSchema", () => {
    const manifest = toAssetManifest({
      project: "employee-app",
      profile: "b-mobile",
      records: [passed("icon-home"), unresolved("icon-search")],
    });
    const parsed = AssetManifestSchema.safeParse({ ...manifest, complete: false });
    expect(parsed.success).toBe(true);
  });
});

describe("toManifestReview", () => {
  it("surfaces degraded, unresolved, review, set gates and usage", () => {
    const degraded: AssetReviewRecord = {
      ...passed("icon-home"),
      degraded: true,
      degradedReason: "used source tier B instead of preferred A",
      fallbackFrom: "A",
      fallbackReason: "library missed",
      review: { agent: "asset-reviewer", status: "not-required" },
    };
    const review = toManifestReview({
      project: "employee-app",
      profile: "b-mobile",
      records: [degraded, unresolved("icon-search")],
      batchGates: {
        iconSet: {
          passed: false,
          issues: [
            {
              code: "ICON_SET_INCONSISTENT",
              severity: "blocker",
              message: "stroke widths differ",
            },
          ],
        },
        illustrationSet: { passed: true, issues: [] },
      },
      usageSource: "json-events",
      usageComplete: true,
    });

    expect(review).toEqual({
      project: "employee-app",
      profile: "b-mobile",
      assets: [
        {
          id: "icon-home",
          status: "passed",
          sourceTier: "A",
          degraded: true,
          degradedReason: "used source tier B instead of preferred A",
          fallbackFrom: "A",
          fallbackReason: "library missed",
          review: { agent: "asset-reviewer", status: "not-required" },
        },
        { id: "icon-search", status: "unresolved", degraded: false },
      ],
      batchGates: { iconSetPassed: false, illustrationSetPassed: true },
      usageSource: "json-events",
      usageComplete: true,
      complete: false,
    });
  });

  it("summarizes a partial review as skipped but keeps complete for passing records", () => {
    const review = toManifestReview({
      project: "employee-app",
      profile: "b-mobile",
      records: [passed("icon-home")],
      batchGates: { skipped: true, reason: "PARTIAL_REVIEW", scope: ["icon-home"] },
    });

    expect(review.batchGates).toEqual({ skipped: true, reason: "PARTIAL_REVIEW" });
    expect(review.complete).toBe(true);
    expect(review.usageSource).toBeUndefined();
    expect(review.usageComplete).toBeUndefined();
  });

  it("omits batch gates when the run has none and stays incomplete for an empty run", () => {
    const review = toManifestReview({ project: "p", profile: "b", records: [] });
    expect(review.batchGates).toBeUndefined();
    expect(review.complete).toBe(false);
  });
});
