import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BlockSpec, Profile } from "@prd-ui/contracts";
import { FixtureBlockGenerator } from "../src/block/generator.js";
import { newSeamsByBlock, percentDelta, seamBoundaries } from "../src/block/metrics.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const profile: Profile = {
  meta: { name: "test", library: "test", version: "0.0.0", origin: "baseline" },
  color: {},
  space: { "1": "4px", "2": "8px", "4": "16px" },
  radius: {},
  motion: {},
  breakpoints: {},
  typography: {},
};

function block(id: string, padding?: string, title?: string): BlockSpec {
  return {
    schemaVersion: "1.0",
    blockId: `page.content.${id}`,
    pageId: "page",
    slot: "content",
    index: Number(id),
    role: "role",
    allowedComponents: [],
    tokenProfile: "test",
    requiredStates: [],
    root: {
      id: `page.block.${id}`,
      type: "Card",
      props: { ...(padding === undefined ? {} : { padding }), ...(title === undefined ? {} : { title }) },
      children: [],
    },
    hash: "sha256:0",
  };
}

describe("FixtureBlockGenerator", () => {
  it("loads a block fixture by page and block id", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "block-fixture-"));
    dirs.push(dir);
    await mkdir(path.join(dir, "today"), { recursive: true });
    await writeFile(
      path.join(dir, "today", "today.content.0.json"),
      JSON.stringify({ schemaVersion: "1.0", blockId: "today.content.0", root: { id: "today.content.0", type: "Card", props: { title: "x" }, children: [] } }),
      "utf8"
    );
    const generator = new FixtureBlockGenerator(dir);
    const draft = await generator.generate({ pageId: "today", blockId: "today.content.0", prompt: "" });
    expect(draft.blockId).toBe("today.content.0");
    expect(draft.root.type).toBe("Card");
  });

  it("rejects a fixture whose block id does not match its path", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "block-fixture-"));
    dirs.push(dir);
    await mkdir(path.join(dir, "today"), { recursive: true });
    await writeFile(
      path.join(dir, "today", "today.content.0.json"),
      JSON.stringify({ schemaVersion: "1.0", blockId: "today.content.1", root: { type: "Card", children: [] } }),
      "utf8"
    );
    const generator = new FixtureBlockGenerator(dir);
    await expect(
      generator.generate({ pageId: "today", blockId: "today.content.0", prompt: "" })
    ).rejects.toThrow(/BLOCK_FIXTURE_ID_MISMATCH/);
  });
});

describe("block metrics", () => {
  it("computes percent delta from the baseline height", () => {
    expect(percentDelta(100, 105)).toBe(5);
    expect(percentDelta(100, 106)).toBe(6);
    expect(percentDelta(100, 94)).toBe(-6);
    expect(percentDelta(0, 10)).toBeUndefined();
    expect(percentDelta(100, Number.NaN)).toBeUndefined();
  });

  it("maps seams to the leading block boundary", () => {
    const blocks = [block("0"), block("1", "space.4"), block("2", "space.4"), block("3")];
    expect(seamBoundaries(blocks, profile)).toEqual([false, false, true, false]);
  });

  it("reports only seams that are new relative to the baseline", () => {
    const baseline = [block("0"), block("1"), block("2")];
    const unchanged = structuredClone(baseline);
    expect(newSeamsByBlock(baseline, unchanged, profile)).toEqual([0, 0, 0]);

    const regressed = [block("0"), block("1", "space.4"), block("2", "space.4")];
    expect(newSeamsByBlock(baseline, regressed, profile)).toEqual([0, 0, 1]);
  });

  it("ignores seams that the baseline already had", () => {
    const baseline = [block("0", "space.4", "同"), block("1", "space.4", "同")];
    const experiment = structuredClone(baseline);
    expect(newSeamsByBlock(baseline, experiment, profile)).toEqual([0, 0]);
  });
});
