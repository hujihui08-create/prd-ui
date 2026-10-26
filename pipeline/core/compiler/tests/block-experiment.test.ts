import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UiBriefSchema, type BlockExperimentPage } from "@prd-ui/contracts";
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

function page(overrides: {
  conformance?: "passed" | "failed" | "not_evaluated";
  blockVerifyPassed?: boolean;
  parityPassed?: boolean;
  heightDeltaPct?: number;
  conformanceComparable?: boolean;
  metrics?: Array<{
    blockId: string;
    retries: number;
    seams: number;
    tokenDrift: number;
    heightDeltaPct?: number;
  }>;
  costCny?: number;
}): BlockExperimentPage {
  return {
    pageId: "today",
    pageRetries: 0,
    costCny: overrides.costCny ?? 0,
    durationMs: 10,
    metrics:
      overrides.metrics ??
      manifest.blocks.map((block) => ({
        blockId: block.blockId,
        retries: 0,
        seams: 0,
        tokenDrift: 0,
      })),
    conformance: overrides.conformance ?? "passed",
    ...(overrides.heightDeltaPct === undefined
      ? { heightDeltaPct: 0 }
      : { heightDeltaPct: overrides.heightDeltaPct }),
    ...(overrides.blockVerifyPassed === undefined
      ? {}
      : { blockVerifyPassed: overrides.blockVerifyPassed }),
    ...(overrides.parityPassed === undefined ? {} : { parityPassed: overrides.parityPassed }),
    ...(overrides.conformanceComparable === undefined
      ? {}
      : { conformanceComparable: overrides.conformanceComparable }),
  };
}

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
      pages: [page({ conformance: "passed" })],
    });
    expect(report.conclusion).toBe("insufficient_evidence");
    expect(report.reasons).toContain("parity not evaluated");
  });

  it("promotes only when conformance and parity both pass", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [page({ conformance: "passed", parityPassed: true })],
    });
    expect(report.conclusion).toBe("promote");
    expect(report.reasons).toEqual([]);
  });

  it("does not treat not_evaluated conformance as either pass or failure", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [page({ conformance: "not_evaluated", parityPassed: true })],
    });
    expect(report.conclusion).toBe("insufficient_evidence");
    expect(report.reasons).toContain("conformance not evaluated");
    expect(report.reasons).not.toContain("conformance failed");
  });

  it("rolls back on a hard conformance failure", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [page({ conformance: "failed" })],
    });
    expect(report.conclusion).toBe("rollback");
    expect(report.reasons).toContain("conformance failed");
  });

  it("lets a hard failure override not_evaluated conformance", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [
        page({
          conformance: "not_evaluated",
          metrics: [
            {
              blockId: manifest.blocks[0]!.blockId,
              retries: 0,
              seams: 1,
              tokenDrift: 0,
            },
          ],
        }),
      ],
    });
    expect(report.conclusion).toBe("rollback");
    expect(report.reasons).toEqual(
      expect.arrayContaining(["seams=1", "conformance not evaluated"])
    );
  });

  it("rolls back on seams, retries, cost, page height, and parity failures", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [
        page({
          conformance: "passed",
          parityPassed: false,
          costCny: 4,
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
        }),
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

  it("uses the evaluator budget passed by the CLI", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      maxCostCny: 5,
      pages: [page({ conformance: "passed", parityPassed: true, costCny: 4 })],
    });
    expect(report.conclusion).toBe("promote");
    expect(report.reasons).toEqual([]);

    const overBudget = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      maxCostCny: 3,
      pages: [page({ conformance: "passed", parityPassed: true, costCny: 4 })],
    });
    expect(overBudget.conclusion).toBe("rollback");
    expect(overBudget.reasons).toContain("cost=4");
  });

  it("rolls back when parity fails even if conformance was not evaluated", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [page({ conformance: "not_evaluated", parityPassed: false })],
    });
    expect(report.conclusion).toBe("rollback");
    expect(report.reasons).toEqual(
      expect.arrayContaining(["conformance not evaluated", "parity failed"])
    );
  });

  it("rolls back when block verification failed", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [
        page({
          conformance: "passed",
          blockVerifyPassed: false,
          parityPassed: true,
        }),
      ],
    });
    expect(report.conclusion).toBe("rollback");
    expect(report.reasons).toContain("block verification failed");
  });

  it("gates on page-level height even when every block height is missing", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [
        page({
          conformance: "passed",
          parityPassed: true,
          heightDeltaPct: 99.88,
          metrics: manifest.blocks.map((block) => ({
            blockId: block.blockId,
            retries: 0,
            seams: 0,
            tokenDrift: 0,
          })),
        }),
      ],
    });
    expect(report.conclusion).toBe("rollback");
    expect(report.reasons).toContain("heightDelta>5%");
  });

  it("passes the height gate at exactly 5%", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [page({ conformance: "passed", parityPassed: true, heightDeltaPct: 5 })],
    });
    expect(report.conclusion).toBe("promote");
    expect(report.reasons).not.toContain("heightDelta>5%");
  });

  it("withholds promotion when page height was not measured", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [
        {
          ...page({ conformance: "passed", parityPassed: true }),
          heightDeltaPct: undefined,
        },
      ],
    });
    expect(report.conclusion).toBe("insufficient_evidence");
    expect(report.reasons).toContain("height not evaluated");
  });

  it("withholds promotion when conformance ids are not comparable", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [
        page({
          conformance: "passed",
          parityPassed: true,
          conformanceComparable: false,
        }),
      ],
    });
    expect(report.conclusion).toBe("insufficient_evidence");
    expect(report.reasons).toContain("conformance not comparable");
  });
});
