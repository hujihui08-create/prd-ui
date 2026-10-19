import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AssetBriefSchema,
  checkIconSet,
  runGate,
  type AssetBrief,
} from "@prd-ui/asset-review";
import { loadLibraryIndex } from "../src/asset/library-source.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

async function loadBriefs(assetsDir: string): Promise<AssetBrief[]> {
  const briefsDir = path.join(assetsDir, "briefs");
  const files = ["icons.json", "illustrations.json"];
  const briefs: AssetBrief[] = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(briefsDir, file), "utf8")) as unknown;
    const parsed = Array.isArray(raw) ? raw : [raw];
    for (const item of parsed) briefs.push(AssetBriefSchema.parse(item));
  }
  return briefs;
}

async function loadSvg(assetsDir: string, file: string): Promise<string> {
  return readFile(path.join(assetsDir, file), "utf8");
}

async function checkFixture(assetsDir: string): Promise<{ briefs: AssetBrief[]; passing: number }> {
  const briefs = await loadBriefs(assetsDir);
  const libraryDir = path.join(assetsDir, "library");
  const index = await loadLibraryIndex(libraryDir);
  let passing = 0;
  for (const brief of briefs) {
    const entry = index.assets.find((asset) => asset.id === brief.id);
    expect(entry, `missing library entry for ${brief.id}`).toBeDefined();
    const svg = await loadSvg(libraryDir, entry!.file);
    const gate = runGate(brief, svg);
    expect(gate.passed, `${brief.id}: ${JSON.stringify(gate.issues)}`).toBe(true);
    passing += 1;
  }
  return { briefs, passing };
}

describe("m0 fixtures", () => {
  it("all 13 m0 assets pass their hard gates", async () => {
    const assetsDir = path.join(pipelineRoot, "samples", "assets", "m0");
    const { briefs, passing } = await checkFixture(assetsDir);
    expect(briefs).toHaveLength(13);
    expect(passing).toBe(13);
  });

  it("the 10 icons are consistent as a set", async () => {
    const assetsDir = path.join(pipelineRoot, "samples", "assets", "m0");
    const briefs = await loadBriefs(assetsDir);
    const libraryDir = path.join(assetsDir, "library");
    const index = await loadLibraryIndex(libraryDir);
    const icons = briefs
      .filter((brief) => brief.kind === "icon")
      .map((brief) => {
        const entry = index.assets.find((asset) => asset.id === brief.id)!;
        return { id: brief.id, svg: "" };
      });
    for (const icon of icons) {
      const entry = index.assets.find((asset) => asset.id === icon.id)!;
      icon.svg = await loadSvg(libraryDir, entry.file);
    }
    const result = checkIconSet(icons);
    expect(result.passed, JSON.stringify(result.issues)).toBe(true);
  });

  it("scenario fixtures pass their hard gates", async () => {
    const assetsDir = path.join(pipelineRoot, "samples", "assets", "m0-scenarios");
    const { briefs } = await checkFixture(assetsDir);
    expect(briefs).toHaveLength(2);
  });
});
