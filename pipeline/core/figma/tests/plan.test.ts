import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FigmaPlanSchema, UiBriefSchema, type FigmaPlanNode } from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { compileFigmaPlans } from "../src/index.js";

const brief = UiBriefSchema.parse(
  JSON.parse(
    readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8")
  )
);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });

function walk(node: FigmaPlanNode, visit: (node: FigmaPlanNode) => void): void {
  visit(node);
  if (node.child) walk(node.child, visit);
  for (const child of node.children ?? []) walk(child, visit);
}

describe("compileFigmaPlans", () => {
  const plans = compileFigmaPlans(
    specs,
    (page) => getProfile(page.meta.profile),
    (page) => getCatalog(page.meta.profile)
  );

  it("compiles eight valid 390x844 plans", () => {
    expect(plans).toHaveLength(8);
    for (const plan of plans) {
      expect(FigmaPlanSchema.safeParse(plan).success, plan.pageId).toBe(true);
      expect(plan.root.type).toBe("FRAME");
      expect(plan.root.width).toBe(390);
      expect(plan.root.height).toBe(844);
      expect(plan.textStyles["b-mobile/heading.2"]).toBeDefined();
    }
  });

  it("filters non-default view panels and state-only nodes", () => {
    const list = plans.find((plan) => plan.pageId === "appointment-list")!;
    const specIds: string[] = [];
    const names: string[] = [];
    walk(list.root, (node) => {
      specIds.push(node.specId);
      names.push(node.name);
    });
    expect(specIds.some((id) => id.includes(".view.list"))).toBe(false);
    expect(names).not.toContain("Skeleton");
    expect(
      specIds.some((id) => id.includes("calendar")) &&
        specIds.some((id) => id.includes("block"))
    ).toBe(true);
  });

  it("uses Button instances and stable text styles", () => {
    const form = plans.find((plan) => plan.pageId === "appointment-form")!;
    const instances: FigmaPlanNode[] = [];
    const texts: FigmaPlanNode[] = [];
    walk(form.root, (node) => {
      if (node.type === "INSTANCE") instances.push(node);
      if (node.type === "TEXT") texts.push(node);
    });
    expect(instances.length).toBeGreaterThan(0);
    expect(instances.every((node) => node.component === "Button")).toBe(true);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((node) => node.textStyle?.startsWith("b-mobile/"))).toBe(true);
  });

  it("keeps summary/fields slots inside Content for detail and notice pages", () => {
    for (const pageId of ["customer-detail", "appointment-detail", "treatment-notice"]) {
      const plan = plans.find((entry) => entry.pageId === pageId)!;
      const content = plan.root.children?.find((node) => node.name === "Content");
      expect(content, pageId).toBeDefined();
      expect((content?.children ?? []).length, pageId).toBeGreaterThan(0);
    }
  });

  it("drops search-result rows and keeps the idle empty state", () => {
    const search = plans.find((plan) => plan.pageId === "customer-search")!;
    const specIds: string[] = [];
    walk(search.root, (node) => specIds.push(node.specId));
    expect(specIds.some((id) => id.includes("row.result"))).toBe(false);
    expect(specIds).toContain("customer-search.state.idle");
  });

  it("keeps vertical padding on view panels and drops horizontal padding", () => {
    const list = plans.find((plan) => plan.pageId === "appointment-list")!;
    let calendar: FigmaPlanNode | undefined;
    walk(list.root, (node) => {
      if (node.specId === "appointment-list.view.calendar") calendar = node;
    });
    expect(calendar?.padding).toBeUndefined();
    expect(calendar?.paddingX).toBe(0);
    expect(calendar?.paddingY).toBe(4);
  });

  it("positions 16:30 calendar blocks after the 16:00 row", () => {
    const list = plans.find((plan) => plan.pageId === "appointment-list")!;
    const blocks: FigmaPlanNode[] = [];
    walk(list.root, (node) => {
      if (node.type === "ABSOLUTE" && node.name.includes("王女士")) blocks.push(node);
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.y).toBe(36 + 7 * 44 + 22);
    expect(blocks[0]?.child?.children?.some((child) => child.characters === "16:30")).toBe(
      true
    );
  });
});
