import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UiBriefSchema, type PageSpec } from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { compileFigmaPlans } from "../src/index.js";

const brief = UiBriefSchema.parse(
  JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
const plans = compileFigmaPlans(
  specs,
  (page) => getProfile(page.meta.profile),
  (page) => getCatalog(page.meta.profile)
);

describe("figma coverage", () => {
  it("maps all eight phase2 pages with no unmapped or degraded nodes", () => {
    for (const plan of plans) {
      expect(plan.coverage, plan.pageId).toBeDefined();
      expect(plan.coverage!.summary.unmapped, plan.pageId).toBe(0);
      expect(plan.coverage!.summary.degraded, plan.pageId).toBe(0);
      expect(plan.coverage!.summary.skipped, plan.pageId).toBeGreaterThanOrEqual(0);
      expect(
        plan.coverage!.summary.spec + plan.coverage!.summary.derived
      ).toBe(
        plan.coverage!.summary.mapped +
          plan.coverage!.summary.degraded +
          plan.coverage!.summary.unmapped +
          plan.coverage!.summary.skipped
      );
    }
    // Only state-heavy pages carry skipped nodes; assert skips are exercised
    // somewhere in the project rather than inventing skips on every page.
    expect(
      plans.reduce((sum, plan) => sum + plan.coverage!.summary.skipped, 0)
    ).toBeGreaterThan(0);
  });

  it("marks an unknown component as unmapped", () => {
    const today = structuredClone(
      specs.find((spec) => spec.meta.pageId === "today")!
    );
    const section = today.layout.slots!.content![0]!;
    section.children = [
      ...(section.children ?? []),
      { id: "today.chart", type: "Chart", props: { title: "趋势" } },
    ];
    const plan = compileFigmaPlans(
      [today],
      (page) => getProfile(page.meta.profile),
      (page) => getCatalog(page.meta.profile)
    )[0]!;
    const node = plan.coverage!.nodes.find((entry) => entry.specId === "today.chart");
    expect(node?.status).toBe("unmapped");
    expect(node?.reason).toBe("UNMAPPED_COMPONENT:Chart");
  });

  it("marks an unknown prop as degraded", () => {
    const today = structuredClone(
      specs.find((spec) => spec.meta.pageId === "today")!
    );
    const card = today.layout.slots!.content![0]!.children![0]!;
    card.props = { ...card.props, mystery: true };
    const plan = compileFigmaPlans(
      [today],
      (page) => getProfile(page.meta.profile),
      (page) => getCatalog(page.meta.profile)
    )[0]!;
    const node = plan.coverage!.nodes.find((entry) => entry.specId === card.id);
    expect(node?.status).toBe("degraded");
    expect(node?.reason).toContain("UNMAPPED_PROP:mystery");
  });

  it("marks a missing node id as unmapped", () => {
    const today = structuredClone(
      specs.find((spec) => spec.meta.pageId === "today")!
    );
    const card = today.layout.slots!.content![0]!.children![0]!;
    delete card.id;
    const plan = compileFigmaPlans(
      [today],
      (page) => getProfile(page.meta.profile),
      (page) => getCatalog(page.meta.profile)
    )[0]!;
    expect(
      plan.coverage!.nodes.some((entry) => entry.reason === "SPEC_NODE_ID_MISSING")
    ).toBe(true);
  });
});
