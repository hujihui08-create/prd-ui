import { describe, expect, it } from "vitest";
import type { AssetBrief, AssetReviewRecord } from "../src/contracts.js";
import { toAssetManifest } from "../src/manifest.js";

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
});
