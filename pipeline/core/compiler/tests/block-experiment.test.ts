import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UiBriefSchema } from "@prd-ui/contracts";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { compileProject } from "../src/index.js";
import { splitBlocks } from "../src/blocks.js";
import { countRawStyleValues, countSeams, evaluateBlockExperiment } from "../src/block-experiment.js";

const brief = UiBriefSchema.parse(
  JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
const today = specs.find((spec) => spec.meta.pageId === "today")!;
const manifest = splitBlocks(today, getArchetype(today.meta.archetype));

describe("block experiment metrics", () => {
  it("counts raw style values", () => {
    expect(countRawStyleValues({ type: "Card", id: "x", props: { padding: "16px", title: "x" } })).toBe(1);
    expect(countRawStyleValues({ type: "Card", id: "y", props: { padding: "space.4" } })).toBe(0);
  });

  it("counts raw style values inside children and slots", () => {
    expect(
      countRawStyleValues({
        type: "Card",
        id: "root",
        children: [{ type: "Text", id: "child", props: { color: "#111827" } }],
        slots: { extra: [{ type: "Badge", id: "slot", props: { height: "20px" } }] },
      })
    ).toBe(2);
  });

  it("counts seams at block boundaries", () => {
    const blocks = structuredClone(manifest.blocks);
    blocks[0]!.root.props = { ...blocks[0]!.root.props, padding: "space.4" };
    blocks[1]!.root.props = { ...blocks[1]!.root.props, padding: "space.4" };
    expect(countSeams(blocks, getProfile(today.meta.profile))).toBeGreaterThan(0);
  });

  it("counts consecutive duplicate block titles as seams", () => {
    const blocks = structuredClone(manifest.blocks);
    blocks[0]!.root.props = { ...blocks[0]!.root.props, title: "重复标题" };
    blocks[1]!.root.props = { ...blocks[1]!.root.props, title: "重复标题" };
    const before = countSeams(manifest.blocks, getProfile(today.meta.profile));
    expect(countSeams(blocks, getProfile(today.meta.profile))).toBe(before + 1);
  });

  it("returns insufficient evidence when parity was not evaluated", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [
        {
          pageId: "today",
          pageRetries: 0,
          costCny: 0,
          durationMs: 10,
          metrics: manifest.blocks.map((block) => ({
            blockId: block.blockId,
            retries: 0,
            seams: 0,
            tokenDrift: 0,
          })),
          conformancePassed: true,
        },
      ],
    });
    expect(report.conclusion).toBe("insufficient_evidence");
    expect(report.reasons).toContain("parity not evaluated");
  });

  it("promotes only when conformance and parity both pass", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [
        {
          pageId: "today",
          pageRetries: 0,
          costCny: 0,
          durationMs: 10,
          metrics: [
            {
              blockId: manifest.blocks[0]!.blockId,
              retries: 0,
              seams: 0,
              tokenDrift: 0,
              heightDeltaPct: 0,
            },
          ],
          conformancePassed: true,
          parityPassed: true,
        },
      ],
    });
    expect(report.conclusion).toBe("promote");
    expect(report.reasons).toEqual([]);
  });

  it("treats unevaluated conformance as insufficient evidence, not as a failure", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [
        {
          pageId: "today",
          pageRetries: 0,
          costCny: 0,
          durationMs: 10,
          metrics: [
            {
              blockId: manifest.blocks[0]!.blockId,
              retries: 0,
              seams: 0,
              tokenDrift: 0,
            },
          ],
          parityPassed: true,
        },
      ],
    });
    expect(report.conclusion).toBe("insufficient_evidence");
    expect(report.reasons).toContain("conformance not evaluated");
  });

  it("rolls back on a hard conformance failure", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [
        {
          pageId: "today",
          pageRetries: 0,
          costCny: 0,
          durationMs: 10,
          metrics: [],
          conformancePassed: false,
        },
      ],
    });
    expect(report.conclusion).toBe("rollback");
    expect(report.reasons).toContain("conformance failed");
  });

  it("rolls back on seams, retries, cost, page height, and parity failures", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [
        {
          pageId: "today",
          pageRetries: 0,
          costCny: 4,
          durationMs: 10,
          metrics: [
            {
              blockId: "today.content.0",
              retries: 3,
              seams: 1,
              tokenDrift: 0,
              heightDeltaPct: 6,
            },
            {
              blockId: "today.content.1",
              retries: 4,
              seams: 0,
              tokenDrift: 0,
            },
          ],
          conformancePassed: true,
          parityPassed: false,
        },
      ],
    });
    expect(report.conclusion).toBe("rollback");
    expect(report.reasons).toEqual(
      expect.arrayContaining([
        "seams=1",
        "retries=7",
        "cost=4",
        "heightDelta>5%",
        "parity failed",
      ])
    );
  });
});
