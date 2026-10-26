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

  it("labels tabs with page names and real glyphs", () => {
    const today = plans.find((plan) => plan.pageId === "today")!;
    const tabbar = today.root.children?.find((node) => node.name === "TabBar")!;
    expect(tabbar.borderTop).toBe("color/border/subtle");
    expect(tabbar.stroke).toBeUndefined();
    expect((tabbar.children ?? []).map((tab) => tab.children?.[0]?.glyph)).toEqual([
      "home",
      "calendar_month",
    ]);
    expect((tabbar.children ?? []).map((tab) => tab.children?.[1]?.characters)).toEqual([
      "今日",
      "预约列表",
    ]);
  });

  it("uses chip ghost buttons in filter rows and text ghost elsewhere", () => {
    const detail = plans.find((plan) => plan.pageId === "customer-detail")!;
    const detailInstances: FigmaPlanNode[] = [];
    walk(detail.root, (node) => {
      if (node.type === "INSTANCE") detailInstances.push(node);
    });
    expect(detailInstances.map((node) => node.variant)).toEqual([
      "ghost-chip",
      "ghost-chip",
      "ghost-chip",
      "primary",
    ]);

    const form = plans.find((plan) => plan.pageId === "appointment-form")!;
    const formInstances: FigmaPlanNode[] = [];
    walk(form.root, (node) => {
      if (node.type === "INSTANCE") formInstances.push(node);
    });
    const picker = formInstances.find((node) => node.label === "选择")!;
    expect(picker.variant).toBe("ghost");
    expect(picker.height).toBeUndefined();
    expect(formInstances.find((node) => node.label === "保存")?.height).toBe(44);
  });

  it("styles button variants from the HTML button classes", () => {
    const variants = plans[0]!.components.Button.variants;
    expect(variants.primary).toMatchObject({
      fill: "color/action/primary",
      height: 36,
      radius: 6,
      paddingX: 16,
    });
    expect(variants.secondary?.stroke).toBe("color/border/control");
    expect(variants.ghost?.fill).toBeUndefined();
    expect(variants["ghost-chip"]).toMatchObject({
      fill: "color/surface/default",
      stroke: "color/border/strong",
      height: 32,
      radius: 8,
      paddingX: 12,
    });
    expect(variants.danger?.strokeAlpha).toBe(0.4);
  });

  it("draws row dividers and 13px labels", () => {
    const today = plans.find((plan) => plan.pageId === "today")!;
    const listRows: FigmaPlanNode[] = [];
    walk(today.root, (node) => {
      if (node.name === "ListRow") listRows.push(node);
    });
    expect(listRows.length).toBeGreaterThan(0);
    expect(listRows.every((node) => node.borderBottom === "color/border/subtle")).toBe(true);

    const detail = plans.find((plan) => plan.pageId === "customer-detail")!;
    const detailRows: FigmaPlanNode[] = [];
    walk(detail.root, (node) => {
      if (node.name === "Row" && node.specId.includes(".row.")) detailRows.push(node);
    });
    expect(detailRows).toHaveLength(9);
    expect(detailRows.every((node) => node.borderBottom !== undefined)).toBe(true);
    expect(detailRows[0]?.children?.[0]?.children?.[0]?.textStyle).toBe("b-mobile/body.sm");
  });

  it("shows the first select option with 14px control text", () => {
    const form = plans.find((plan) => plan.pageId === "appointment-form")!;
    let select: FigmaPlanNode | undefined;
    walk(form.root, (node) => {
      if (node.name === "Select") select = node;
    });
    expect(select?.children?.[0]?.characters).toBe("到店");
    expect(select?.children?.[0]?.textStyle).toBe("b-mobile/input.md");
    expect(select?.radius).toBe(8);
    expect(select?.stroke).toBe("color/border/control");
  });

  it("omits an empty-state icon when the spec has none", () => {
    const search = plans.find((plan) => plan.pageId === "customer-search")!;
    let empty: FigmaPlanNode | undefined;
    walk(search.root, (node) => {
      if (node.name === "EmptyState") empty = node;
    });
    expect(empty?.children?.some((child) => child.type === "GLYPH")).toBe(false);
  });

  it("marks the selected day and tints its column", () => {
    const list = plans.find((plan) => plan.pageId === "appointment-list")!;
    const nodes: FigmaPlanNode[] = [];
    walk(list.root, (node) => nodes.push(node));

    const day = nodes.find(
      (node) => node.specId === "appointment-list.calendar.grid.day.2.frame"
    )!;
    expect(day.borderBottom).toBe("color/status/info");
    expect(day.borderBottomWidth).toBe(2);
    expect(day.children?.[0]?.textStyle).toBe("b-mobile/label.bold");

    const block = nodes.find(
      (node) => node.specId === "appointment-list.calendar.grid.block.0.frame"
    )!;
    expect(block.borderLeft).toBe("color/status/warning");
    expect(block.borderLeftWidth).toBe(2);
    expect(block.children?.[0]?.textStyle).toBe("b-mobile/label.bold");

    const cell = nodes.find(
      (node) => node.specId === "appointment-list.calendar.grid.cell.0.2.frame"
    )!;
    expect(cell.fill).toBe("color/status/info");
    expect(cell.fillAlpha).toBe(0.04);
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
