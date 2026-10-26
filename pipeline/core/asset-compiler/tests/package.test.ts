import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AssetManifest } from "@prd-ui/contracts";
import {
  compileAssetPackage,
  libraryManifest,
  type AssetSource,
} from "../src/index.js";

const libraryRoot = "samples/assets/m0/library";
const libraryIndex = JSON.parse(
  readFileSync(path.join(libraryRoot, "index.json"), "utf8")
) as {
  assets: Array<{ id: string; kind: "icon" | "illustration" | "image"; file: string; license: string; library: string }>;
};
const manifest = libraryManifest({
  project: "m0",
  profile: "b-mobile",
  library: libraryIndex,
});
const sources: AssetSource[] = libraryIndex.assets.map((asset) => ({
  path: asset.file,
  data: readFileSync(path.join(libraryRoot, asset.file)),
}));
const licenseTexts = {
  ISC: readFileSync("samples/assets/m0/LICENSE-lucide.txt", "utf8"),
};

describe("compileAssetPackage", () => {
  it("packages the M0 library with licenses and stable hashes", () => {
    const first = compileAssetPackage({
      project: "m0",
      profile: "b-mobile",
      manifest,
      sources,
      licenseTexts,
    });
    expect(first.blockers).toEqual([]);
    expect(first.files).toHaveLength(13);
    expect(first.manifest.complete).toBe(true);
    expect(first.licenses).toContain("ISC License");
    expect(first.licenses).toContain("test-fixture");
    expect(first.files.every((file) => file.sha256.startsWith("sha256:"))).toBe(true);

    const second = compileAssetPackage({
      project: "m0",
      profile: "b-mobile",
      manifest,
      sources,
      licenseTexts,
    });
    expect(second.files.map((file) => file.sha256)).toEqual(
      first.files.map((file) => file.sha256)
    );
  });

  it("blocks missing files and unknown licenses", () => {
    const broken: AssetManifest = {
      ...manifest,
      assets: [
        ...manifest.assets,
        {
          id: "missing",
          kind: "icon",
          files: [{ path: "icons/missing.svg", format: "svg" }],
          license: "unknown",
        },
      ],
    };
    const result = compileAssetPackage({
      project: "m0",
      profile: "b-mobile",
      manifest: broken,
      sources,
      licenseTexts,
    });
    expect(result.manifest.complete).toBe(false);
    expect(result.blockers).toContain("ASSET_FILE_MISSING: missing (icons/missing.svg)");
    expect(result.blockers).toContain("ASSET_LICENSE_MISSING: missing (unknown)");
  });

  it("blocks a manifest with placeholders", () => {
    const result = compileAssetPackage({
      project: "m0",
      profile: "b-mobile",
      manifest: { ...manifest, placeholders: ["icon-x"] },
      sources,
      licenseTexts,
    });
    expect(result.manifest.complete).toBe(false);
    expect(result.blockers.some((blocker) => blocker.startsWith("ASSET_PLACEHOLDERS"))).toBe(
      true
    );
  });

  it("packages the phase2 frozen icons", () => {
    const reviewRoot = "artifacts/employee-app-phase2/asset-review";
    const review = JSON.parse(
      readFileSync(path.join(reviewRoot, "manifest.review.json"), "utf8")
    ) as { assets: Array<{ id: string; status: string }> };
    const ids = review.assets.filter((asset) => asset.status === "passed").map((asset) => asset.id);
    const reviewManifest: AssetManifest = {
      project: "employee-app-phase2",
      profile: "b-mobile",
      assets: ids.map((id) => ({
        id,
        kind: "icon",
        files: [{ path: `frozen/${id}/asset.svg`, format: "svg" }],
        license: "ISC",
      })),
      placeholders: [],
      complete: true,
    };
    const reviewSources = ids.map((id) => ({
      path: `frozen/${id}/asset.svg`,
      data: readFileSync(path.join(reviewRoot, "assets", "frozen", id, "asset.svg")),
    }));
    const result = compileAssetPackage({
      project: "employee-app-phase2",
      profile: "b-mobile",
      manifest: reviewManifest,
      sources: reviewSources,
      licenseTexts,
    });
    expect(result.blockers).toEqual([]);
    expect(result.files).toHaveLength(4);
    expect(result.manifest.complete).toBe(true);
  });
});
