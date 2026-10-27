import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FigmaPlanSchema,
  UiBriefSchema,
  type FigmaPlanNode,
  type PageSpec,
  type SpecNode,
} from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { compileFigmaPlan, compileFigmaPlans } from "../src/index.js";

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
    expect(
      detailRows.every(
        (node, index) =>
          index === detailRows.length - 1
            ? node.borderBottom === undefined
            : node.borderBottom !== undefined
      )
    ).toBe(true);
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

  it("models card rhythm with gap 0 because the CSS uses a body margin", () => {
    for (const pageId of ["today", "customer-detail", "appointment-detail", "treatment-notice"]) {
      const page = plans.find((entry) => entry.pageId === pageId)!;
      const cards: FigmaPlanNode[] = [];
      walk(page.root, (node) => {
        if (node.name === "Card") cards.push(node);
      });
      expect(cards.length, pageId).toBeGreaterThan(0);
      expect(cards.every((card) => card.gap === 0), pageId).toBe(true);
    }
  });

  it("keeps the 8px head→body rhythm on the derived card body frame", () => {
    const today = plans.find((plan) => plan.pageId === "today")!;
    let body: FigmaPlanNode | undefined;
    walk(today.root, (node) => {
      if (node.specId === "today.card.quick-actions.body") body = node;
    });
    // `.card-body` supplies the rhythm with margin-top:8px; the card itself has
    // no flex gap. The body frame is derived and non-material, so conformance
    // does not compare it, but Figma must still render the 8px offset.
    expect(body?.origin).toBe("derived");
    expect(body?.paddingTop).toBe(8);
    expect(body?.paddingLeft).toBeUndefined();
  });

  it("pads quick actions with the UA button padding from the CSS", () => {
    const today = plans.find((plan) => plan.pageId === "today")!;
    const quick: FigmaPlanNode[] = [];
    walk(today.root, (node) => {
      if (node.name === "QuickAction") quick.push(node);
    });
    expect(quick).toHaveLength(3);
    for (const node of quick) {
      expect(node.paddingX).toBe(6);
      expect(node.paddingY).toBe(1);
    }
  });

  it("pads a visible empty state like the inline 24/16 CSS box", () => {
    const search = plans.find((plan) => plan.pageId === "customer-search")!;
    let empty: FigmaPlanNode | undefined;
    walk(search.root, (node) => {
      if (node.specId === "customer-search.state.idle") empty = node;
    });
    expect(empty?.paddingY).toBe(24);
    expect(empty?.paddingX).toBe(16);
  });

  it("models the calendar day and cell borders from the CSS grid", () => {
    const list = plans.find((plan) => plan.pageId === "appointment-list")!;
    const nodes: FigmaPlanNode[] = [];
    walk(list.root, (node) => nodes.push(node));
    const byId = (id: string): FigmaPlanNode | undefined =>
      nodes.find((node) => node.specId === id);

    const plainDay = byId("appointment-list.calendar.grid.day.0.frame")!;
    expect(plainDay.borderLeft).toBe("color/border/subtle");
    expect(plainDay.borderLeftWidth).toBe(1);
    expect(plainDay.borderBottom).toBe("color/border/subtle");
    expect(plainDay.borderBottomWidth).toBe(1);

    const selectedDay = byId("appointment-list.calendar.grid.day.2.frame")!;
    expect(selectedDay.borderLeft).toBe("color/border/subtle");
    expect(selectedDay.borderBottom).toBe("color/status/info");
    expect(selectedDay.borderBottomWidth).toBe(2);

    const plainCell = byId("appointment-list.calendar.grid.cell.0.0.frame")!;
    expect(plainCell.fill).toBeUndefined();
    expect(plainCell.borderTop).toBe("color/border/subtle");
    expect(plainCell.borderTopWidth).toBe(1);
    expect(plainCell.borderLeft).toBe("color/border/subtle");
    expect(plainCell.borderLeftWidth).toBe(1);
    expect(plainCell.borderBottom).toBeUndefined();
    expect(plainCell.stroke).toBeUndefined();

    const selectedCell = byId("appointment-list.calendar.grid.cell.0.2.frame")!;
    expect(selectedCell.fill).toBe("color/status/info");
    expect(selectedCell.fillAlpha).toBe(0.04);
  });

  it("uses the exact hour padding and block column geometry from the CSS", () => {
    const list = plans.find((plan) => plan.pageId === "appointment-list")!;
    const nodes: FigmaPlanNode[] = [];
    walk(list.root, (node) => nodes.push(node));
    const hour = nodes.find(
      (node) => node.specId === "appointment-list.calendar.grid.hour.0.frame"
    )!;
    expect(hour.paddingTop).toBe(2);
    expect(hour.paddingRight).toBe(4);
    expect(hour.paddingBottom).toBeUndefined();
    expect(hour.paddingLeft).toBeUndefined();

    const block = nodes.find(
      (node) => node.specId === "appointment-list.calendar.grid.block.0"
    )!;
    expect(block.x).toBe(36 + 2 * 46);
    expect(block.width).toBe(46);
    expect(block.child?.width).toBe(46);
  });

  it("omits the bottom divider on the last list row and pads the list box", () => {
    const detail = plans.find((plan) => plan.pageId === "appointment-detail")!;
    const nodes: FigmaPlanNode[] = [];
    walk(detail.root, (node) => nodes.push(node));
    const list = nodes.find(
      (node) => node.specId === "appointment-detail.root.summary.0.children.0"
    )!;
    expect(list.paddingY).toBe(4);
    expect(list.gap).toBe(0);
    const row = (index: number): FigmaPlanNode | undefined =>
      nodes.find(
        (node) =>
          node.specId === `appointment-detail.root.summary.0.children.0.row.${index}`
      );
    expect(row(0)?.borderBottom).toBe("color/border/subtle");
    expect(row(10)?.borderBottom).toBeUndefined();
    expect(row(10)?.borderBottomWidth).toBeUndefined();
  });

  it("renders string list rows as padded .list-text-row frames", () => {
    const notice = plans.find((plan) => plan.pageId === "treatment-notice")!;
    let list: FigmaPlanNode | undefined;
    walk(notice.root, (node) => {
      if (node.specId === "treatment-notice.root.summary.2.children.0") list = node;
    });
    expect(list?.paddingY).toBe(4);
    const rows = list?.children ?? [];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.type).toBe("FRAME");
      expect(row.name).toBe("Row");
      // `.list-text-row{padding:10px 0}` plus the 1px bottom divider: 39/38px.
      expect(row.paddingY).toBe(10);
      expect(row.paddingX).toBeUndefined();
      expect(row.children).toHaveLength(1);
      expect(row.children?.[0]?.type).toBe("TEXT");
      expect(row.children?.[0]?.textStyle).toBe("b-mobile/body.regular");
      expect(notice.textStyles[row.children![0]!.textStyle!]?.fontWeight).toBe(400);
    }
    // `.list-text-row:last-child{border-bottom:0}`.
    expect(rows[0]?.borderBottom).toBe("color/border/subtle");
    expect(rows[0]?.borderBottomWidth).toBe(1);
    expect(rows[1]?.borderBottom).toBeUndefined();
    expect(rows[1]?.borderBottomWidth).toBeUndefined();
  });

  it("pads direct app-scroll rows but not rows nested in a section or field", () => {
    const notice = plans.find((plan) => plan.pageId === "treatment-notice")!;
    const detail = plans.find((plan) => plan.pageId === "appointment-detail")!;
    const form = plans.find((plan) => plan.pageId === "appointment-form")!;
    const find = (page: typeof notice, id: string): FigmaPlanNode | undefined => {
      let found: FigmaPlanNode | undefined;
      walk(page.root, (node) => {
        if (node.specId === id) found = node;
      });
      return found;
    };
    expect(find(notice, "treatment-notice.root.summary.1")?.paddingX).toBe(16);
    expect(find(detail, "appointment-detail.root.fields.0")?.paddingX).toBe(16);
    expect(
      find(form, "appointment-form.root.content.0.children.0.children.0")?.paddingX
    ).toBeUndefined();
  });

  it("insets summary cards by the .app-scroll > .card margin", () => {
    const findWithParent = (
      page: FigmaPlanNode
    ): ((id: string) => { node: FigmaPlanNode; parent: FigmaPlanNode | undefined }) => {
      const parents = new Map<FigmaPlanNode, FigmaPlanNode>();
      const record = (node: FigmaPlanNode): void => {
        if (node.child) {
          parents.set(node.child, node);
          record(node.child);
        }
        for (const child of node.children ?? []) {
          parents.set(child, node);
          record(child);
        }
      };
      record(page);
      return (id: string) => {
        let found: FigmaPlanNode | undefined;
        walk(page, (node) => {
          if (node.specId === id) found = node;
        });
        return { node: found!, parent: found === undefined ? undefined : parents.get(found) };
      };
    };

    for (const pageId of ["customer-detail", "appointment-detail", "treatment-notice"]) {
      const plan = plans.find((entry) => entry.pageId === pageId)!;
      const content = plan.root.children?.find((node) => node.name === "Content")!;
      // `.app-scroll` has `padding-bottom:16px` and no horizontal padding; the
      // card margin is modelled on a derived wrapper so the card (and every
      // descendant row) is 358/326px wide, not 390/358.
      expect(content.paddingX, pageId).toBeUndefined();
      expect(content.paddingBottom, pageId).toBe(16);
      expect(content.gap ?? 0, pageId).toBe(0);
    }

    const detail = plans.find((entry) => entry.pageId === "customer-detail")!;
    const detailLookup = findWithParent(detail.root);
    const card = detailLookup("customer-detail.root.summary.0");
    expect(card.parent?.name).toBe("SlotBlock");
    // First child: `.card{margin:16px}` collapses to a 16px top inset.
    expect(card.parent?.paddingTop).toBe(16);
    expect(card.parent?.paddingX).toBe(16);

    const detailRow = detailLookup("customer-detail.card-actions");
    // Direct `.app-scroll > .row` keeps its own 16px horizontal padding; the
    // preceding card's bottom margin becomes a 16px top gap.
    expect(detailRow.node.paddingX).toBe(16);
    expect(detailRow.parent?.name).toBe("SlotBlock");
    expect(detailRow.parent?.paddingTop).toBe(16);
    expect(detailRow.parent?.paddingX).toBeUndefined();

    const notice = plans.find((entry) => entry.pageId === "treatment-notice")!;
    const noticeLookup = findWithParent(notice.root);
    const between = noticeLookup("treatment-notice.root.summary.1");
    expect(between.node.paddingX).toBe(16);
    expect(between.parent?.paddingTop).toBe(16);
  });

  it("grows text inputs inside horizontal form rows", () => {
    const form = plans.find((plan) => plan.pageId === "appointment-form")!;
    const find = (id: string): FigmaPlanNode | undefined => {
      let found: FigmaPlanNode | undefined;
      walk(form.root, (node) => {
        if (node.specId === id) found = node;
      });
      return found;
    };
    const customerRow = find("appointment-form.root.content.0.children.0.children.0")!;
    expect(customerRow.layoutMode).toBe("HORIZONTAL");
    const input = customerRow.children?.[0];
    const picker = customerRow.children?.[1];
    expect(input?.name).toBe("Input");
    // `.form-field .row .input{flex:1;min-width:0}`: 358 - 8 - 58 = 292px.
    expect(input?.layoutGrow).toBe(1);
    expect(picker?.type).toBe("INSTANCE");
    expect(picker?.layoutGrow).toBeUndefined();

    // A vertical FormField child is filled by the plugin, not by a plan grow.
    expect(find("appointment-form.root.content.0.children.1.children.0")?.layoutGrow).toBeUndefined();
    // The select hugs its content and does not grow inside a row.
    expect(find("appointment-form.root.content.0.children.5.children.0")?.layoutGrow).toBeUndefined();

    const callback = plans.find((plan) => plan.pageId === "callback-register")!;
    let callbackInput: FigmaPlanNode | undefined;
    walk(callback.root, (node) => {
      if (node.specId === "callback-register.root.content.0.children.0.children.0.children.0") {
        callbackInput = node;
      }
    });
    expect(callbackInput?.layoutGrow).toBe(1);
  });

  it("keeps the CSS calendar block height rule (22px minimum, 44px per hour)", () => {
    const listSpec = specs.find((page) => page.meta.pageId === "appointment-list")!;
    const findCalendar = (node: SpecNode): SpecNode | undefined => {
      if (node.type === "CalendarGrid") return node;
      for (const child of node.children ?? []) {
        const found = findCalendar(child);
        if (found !== undefined) return found;
      }
      for (const slot of Object.values(node.slots ?? {})) {
        for (const child of slot) {
          const found = findCalendar(child);
          if (found !== undefined) return found;
        }
      }
      return undefined;
    };
    const compileWithDuration = (duration: number): FigmaPlanNode => {
      const clone = structuredClone(listSpec) as PageSpec;
      const calendar = findCalendar(clone.layout);
      expect(calendar, "calendar node").toBeDefined();
      const blocks = calendar!.props?.blocks as Array<Record<string, unknown>>;
      blocks[0]!.duration = duration;
      const plan = compileFigmaPlan(
        clone,
        getProfile(clone.meta.profile),
        getCatalog(clone.meta.profile)
      );
      let block: FigmaPlanNode | undefined;
      walk(plan.root, (node) => {
        if (node.specId === "appointment-list.calendar.grid.block.0") block = node;
      });
      expect(block, "block node").toBeDefined();
      return block!;
    };

    // `.calendar-block` height is inline `max(22, duration * 44)`; the same
    // height is on both the ABSOLUTE wrapper and its child frame.
    const short = compileWithDuration(0.25);
    expect(short.height).toBe(22);
    expect(short.child?.height).toBe(22);
    const hourly = compileWithDuration(1);
    expect(hourly.height).toBe(44);
    expect(hourly.child?.height).toBe(44);

    // The 16:30 block keeps its 22px intra-hour offset on the 16:00 row.
    const list = plans.find((plan) => plan.pageId === "appointment-list")!;
    let offsetBlock: FigmaPlanNode | undefined;
    walk(list.root, (node) => {
      if (node.specId === "appointment-list.calendar.grid.block.2") offsetBlock = node;
    });
    expect(offsetBlock?.y).toBe(36 + 7 * 44 + 22);
    expect(offsetBlock?.height).toBe(44);
  });

  it("models the action footer as a 1px divider plus a 12/16 inset row", () => {
    for (const pageId of [
      "appointment-list",
      "appointment-form",
      "callback-register",
      "customer-detail",
      "appointment-detail",
      "treatment-notice",
    ]) {
      const plan = plans.find((entry) => entry.pageId === pageId)!;
      const actions = plan.root.children?.find((node) => node.name === "Actions")!;
      // `.app-actions{border-top:1px solid}` is a separate 1px divider frame, so
      // the Figma stroke inset cannot shrink the button row.
      expect(actions.layoutMode, pageId).toBe("VERTICAL");
      expect(actions.borderTop, pageId).toBeUndefined();
      expect(actions.padding, pageId).toBeUndefined();
      const [divider, row] = actions.children ?? [];
      expect(divider?.name, pageId).toBe("ActionsDivider");
      expect(divider?.height, pageId).toBe(1);
      expect(divider?.fill, pageId).toBe("color/border/subtle");
      expect(row?.name, pageId).toBe("ActionsRow");
      // `.app-actions{padding:12px 16px}`: 390 - 32 = 358px buttons.
      expect(row?.paddingY, pageId).toBe(12);
      expect(row?.paddingX, pageId).toBe(16);
      expect(row?.gap, pageId).toBe(8);
      for (const child of row?.children ?? []) {
        if (child.name === "ActionMenu") {
          expect(child.type, pageId).toBe("FRAME");
          continue;
        }
        expect(child.type, pageId).toBe("INSTANCE");
        expect(child.height, pageId).toBe(44);
        expect(child.layoutGrow, pageId).toBe(1);
      }
    }
  });
});

describe("inventory component mapping", () => {
  const employeeBrief = UiBriefSchema.parse(
    JSON.parse(readFileSync("samples/projects/employee-app/ui-brief.json", "utf8"))
  );
  const employeeSpecs = compileProject(employeeBrief, {
    getProfile,
    getCatalog,
    getArchetype,
  });
  const employeePlans = compileFigmaPlans(
    employeeSpecs,
    (page) => getProfile(page.meta.profile),
    (page) => getCatalog(page.meta.profile)
  );
  const plan = employeePlans.find((p) => p.pageId === "inventory-query")!;

  function find(specId: string): FigmaPlanNode | undefined {
    let hit: FigmaPlanNode | undefined;
    walk(plan.root, (node) => {
      if (node.specId === specId) hit = node;
    });
    return hit;
  }

  it("builds a HORIZONTAL Switch with a track", () => {
    const sw = find("inventory-query.root.content.0.children.1.children.1");
    expect(sw?.name).toBe("Switch");
    expect(sw?.layoutMode).toBe("HORIZONTAL");
    expect(sw?.children?.some((child) => child.name === "Track")).toBe(true);
  });

  it("builds a structured InventoryCard", () => {
    const card = find("inventory-query.root.content.0.children.3");
    expect(card?.name).toBe("InventoryCard");
    expect(card?.layoutMode).toBe("VERTICAL");
    expect(card?.padding).toBe(16);
    expect(card?.gap).toBe(8);
    expect(card?.children?.length).toBeGreaterThan(0);
  });
});

describe("action menu plan", () => {
  it("builds a closed trigger with a hidden sheet", () => {
    const spec = specs.find((entry) => entry.meta.pageId === "appointment-detail")!;
    const plan = compileFigmaPlan(
      spec,
      getProfile("b-mobile"),
      getCatalog("b-mobile")
    );
    let menu: FigmaPlanNode | undefined;
    let sheet: FigmaPlanNode | undefined;
    walk(plan.root, (node) => {
      if (node.name === "ActionMenu") menu = node;
      if (node.name === "ActionSheet") sheet = node;
    });
    expect(menu?.type).toBe("FRAME");
    expect(sheet?.visible).toBe(false);
  });
});
