import { describe, expect, it } from "vitest";
import { UiBriefSchema } from "@prd-ui/contracts";
import type { PageSpec, SpecNode } from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import briefJson from "../../../samples/projects/employee-app/ui-brief.json";
import demoBriefJson from "../../../samples/projects/demo-orders-intake/ui-brief.json";
import appointmentsBriefJson from "../../../samples/projects/employee-app-appointments-03/ui-brief.json";
import phase2BriefJson from "../../../samples/projects/employee-app-phase2/ui-brief.json";
import {
  createMotionContext,
  motionAttrs,
  renderDocument,
  renderIndex,
} from "../src/index.js";

const brief = UiBriefSchema.parse(briefJson);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
const byId = new Map(specs.map((spec) => [spec.meta.pageId, spec]));

const demoBrief = UiBriefSchema.parse(demoBriefJson);
const demoSpecs = compileProject(demoBrief, {
  getProfile,
  getCatalog,
  getArchetype,
});
const demoById = new Map(
  demoSpecs.map((spec) => [spec.meta.pageId, spec])
);
const demoPageNames = Object.fromEntries(
  demoSpecs.map((spec) => [spec.meta.pageId, spec.meta.name])
);

const appointmentsBrief = UiBriefSchema.parse(appointmentsBriefJson);
const appointmentSpecs = compileProject(appointmentsBrief, {
  getProfile,
  getCatalog,
  getArchetype,
});
const appointmentById = new Map(
  appointmentSpecs.map((spec) => [spec.meta.pageId, spec])
);
const appointmentRoutes = Object.fromEntries(
  appointmentSpecs.map((spec) => [spec.meta.pageId, spec.meta.route])
);

const phase2Brief = UiBriefSchema.parse(phase2BriefJson);
const phase2Specs = compileProject(phase2Brief, {
  getProfile,
  getCatalog,
  getArchetype,
});
const phase2ById = new Map(phase2Specs.map((spec) => [spec.meta.pageId, spec]));

type PageMotion = NonNullable<PageSpec["motion"]>;

const motionPresets: PageMotion["presets"] = {
  "enter-fade": { durationMs: 120, easing: "ease-out" },
  "press-feedback": { durationMs: 120, easing: "ease-out" },
  "list-stagger": { durationMs: 200, easing: "ease-out", staggerMs: 24 },
  "sheet-up": { durationMs: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  "state-swap": { durationMs: 120, easing: "ease-out" },
  "toast-in": { durationMs: 200, easing: "ease-out" },
  "page-push": { durationMs: 200, easing: "ease-out" },
};

function appointmentMotion(bindings?: PageMotion["bindings"]): PageMotion {
  return {
    presets: motionPresets,
    bindings: bindings ?? [
      { preset: "enter-fade" },
      { nodeId: "appointment-list.action.toggle-view", preset: "press-feedback" },
      { nodeId: "appointment-list.row.appointment", preset: "list-stagger" },
    ],
    reducedMotion: { fallback: "fade" },
  };
}

/** Compiled specs do not carry motion; attach it in memory for renderer tests. */
function appointmentListWithMotion(motion?: PageMotion): PageSpec {
  const spec = structuredClone(appointmentById.get("appointment-list")!);
  return { ...spec, motion: motion ?? appointmentMotion() };
}

function rootTag(html: string): string {
  return html.match(/<div class="app [^"]*"[^>]*>/)?.[0] ?? "";
}

describe("employee-app HTML renderer", () => {
  it("renders the today page with content and empty-state copy", () => {
    const spec = byId.get("today");
    expect(spec).toBeDefined();
    const html = renderDocument(spec!, getProfile("b-mobile"));

    expect(html).toContain("星光店");
    expect(html).toContain("快捷操作");
    expect(html).toContain("张女士");
    expect(html).toContain("小气泡");
    expect(html).toContain("待到店");
    expect(html).toContain("今天没有预约");
    expect(html).toContain("当场开单");
    expect(html).toContain('data-state="default"');
  });

  it("renders the inventory page with product cards and empty-state action", () => {
    const spec = byId.get("inventory-query");
    expect(spec).toBeDefined();
    const html = renderDocument(spec!, getProfile("b-mobile"));

    expect(html).toContain("库存查询");
    expect(html).toContain("搜索产品名称 / 规格");
    expect(html).toContain("医用面膜");
    expect(html).toContain("当前库存");
    expect(html).toContain("可用库存");
    expect(html).toContain("低库存");
    expect(html).toContain("没有匹配的产品");
    expect(html).toContain("清空筛选");
  });
});

describe("generic web/mobile renderer", () => {
  it("renders PageShell pages with nav, table rows, and project title", () => {
    const spec = demoById.get("orders-list")!;
    const html = renderDocument(spec, getProfile("b-dense"), {
      pageNames: demoPageNames,
    });
    expect(html).toContain('class="page-shell"');
    expect(html).toContain("订单列表");
    expect(html).toContain("ORD-20261021-0001");
    expect(html).toContain("张三");
    expect(html).toContain("订单概览");
    expect(html).toContain("订单列表 · demo-orders");
    expect(html).not.toContain("员工端");
  });

  it("renders PageShell overview stats and recent rows", () => {
    const html = renderDocument(demoById.get("orders-overview")!, getProfile("b-dense"), {
      pageNames: demoPageNames,
    });
    expect(html).toContain("今日订单");
    expect(html).toContain("128");
    expect(html).toContain("ORD-20261021-0002");
  });

  it("renders MobileShell feed and form slots", () => {
    const feed = renderDocument(demoById.get("home-feed")!, getProfile("c-expressive"), {
      pageNames: demoPageNames,
    });
    expect(feed).toContain("秋季修护专题");
    expect(feed).toContain("会员日提醒");
    expect(feed).toContain("tab-label");
    expect(feed).not.toContain("请配置 feedItems");

    const auth = renderDocument(demoById.get("auth")!, getProfile("c-expressive"), {
      pageNames: demoPageNames,
    });
    expect(auth).toContain("邮箱");
    expect(auth).toContain("密码");
    expect(auth).toContain('class="input"');
    expect(auth).toContain("登录");
  });

  it("renders detail values from brief mock data", () => {
    const detail = renderDocument(
      demoById.get("order-detail")!,
      getProfile("b-dense"),
      { pageNames: demoPageNames }
    );
    expect(detail).toContain("ORD-20261021-0001");
    expect(detail).toContain("¥268.00");
    expect(detail).toContain("张三");
    expect(detail).toContain("编辑订单");
  });

  it("renders the appointment calendar and a fixed primary action", () => {
    const html = renderDocument(
      appointmentById.get("appointment-list")!,
      getProfile("b-mobile")
    );
    expect(html).toContain('class="calendar-grid"');
    expect(html).toContain("周");
    expect(html).toContain("张女士");
    expect(html).toContain("小气泡");
    expect(html).toContain('class="app-actions"');
    expect(html).toContain("新增预约");
  });

  it("renders one primary form action plus the alternate mode note", () => {
    const html = renderDocument(
      appointmentById.get("appointment-form")!,
      getProfile("b-mobile")
    );
    expect(html).toContain('class="app-actions"');
    expect(html).toContain("保存改期");
    const footer = html.split('class="app-actions"')[1]?.split("</div>")[0] ?? "";
    expect(footer).toContain("保存");
    expect(footer).not.toContain("保存改期");
  });

  it("emits interaction config and action hooks for the appointment detail", () => {
    const brief = structuredClone(appointmentsBrief);
    const page = brief.ia.pages.find((entry) => entry.id === "appointment-detail")!;
    page.businessStates = [
      { name: "已登记", actions: ["已到店确认", "开单"] },
      { name: "已到店", actions: ["开单"] },
    ];
    const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
    const spec = specs.find((entry) => entry.meta.pageId === "appointment-detail")!;
    const html = renderDocument(spec, getProfile("b-mobile"), {
      pageRoutes: Object.fromEntries(
        specs.map((entry) => [entry.meta.pageId, entry.meta.route])
      ),
    });
    expect(html).toContain('data-page-archetype="detail"');
    expect(html).toContain('id="interaction-config"');
    expect(html).toContain('data-action="已到店确认"');
    expect(html).toContain("data-business-states");
    expect(html).toContain("data-current-status");
    expect(html).toContain('[data-field="status"] .form-value');
    expect(html).toContain("bar.contains(button)");
    expect(html).toContain('"状态: " + status');
    expect(html).toContain('action === "确认已当面告知"');
    expect(html).toContain('[data-field="confirmedBy"] .form-value');
    expect(html).toContain('"当前员工"');
    expect(html).toContain('"确认人: " + byValue');
  });

  it("emits search, view, and form hooks", () => {
    const search = renderDocument(
      phase2ById.get("customer-search")!,
      getProfile("b-mobile")
    );
    expect(search).toContain("data-search-input");
    expect(search).toContain('data-empty-kind="idle"');
    expect(search).toContain('data-empty-kind="empty"');
    expect(search).toContain("data-search-text");
    expect(search).toContain('data-action="清空关键词"');
    expect(search).toContain(".list-row[data-row-link]{cursor:pointer;}");
    expect(search).toContain('row.dataset.rowLink = "true"');
    expect(search).toContain('config.pageId === "customer-search"');

    const list = renderDocument(
      appointmentById.get("appointment-list")!,
      getProfile("b-mobile"),
      { pageRoutes: appointmentRoutes }
    );
    expect(list).toContain('data-view-panel="calendar"');
    expect(list).toContain('data-view-panel="list"');
    expect(list).toContain("data-view-toggle");
    expect(list).toContain("data-slot-date");
    expect(list).toContain("data-slot-time");
    expect(list).toContain("data-block");

    const form = renderDocument(
      appointmentById.get("appointment-form")!,
      getProfile("b-mobile"),
      { pageRoutes: appointmentRoutes }
    );
    expect(form).toContain("data-form-modes");
    expect(form).toContain('data-field="customer"');
    expect(form).toContain('<label class="form-field" data-field="customer"');
  });

  it("binds the calendar drawer and list detail action to the linked detail route", () => {
    const html = renderDocument(
      phase2ById.get("appointment-list")!,
      getProfile("b-mobile"),
      {
        pageRoutes: Object.fromEntries(
          phase2Specs.map((entry) => [entry.meta.pageId, entry.meta.route])
        ),
      }
    );
    expect(html).toContain('data-action="查看完整详情"');
    expect(html).toContain("appointment-detail.html");
    expect(html).toContain("detail.textContent = \"查看完整详情\"");
    expect(html).toContain(
      "if (config.linkedRoutes.detail) location.href = config.linkedRoutes.detail;"
    );
  });

  it("renders an index with project title and styled links", () => {
    const index = renderIndex(demoSpecs);
    expect(index).toContain("demo-orders · 页面索引");
    expect(index).toContain("8 个页面");
    expect(index).toContain('href="orders-list.html"');
    expect(index).toContain("color:#111827;text-decoration:none;");
  });
});

describe("renderer motion", () => {
  it("renders node and group motion attributes plus reduced-motion fallback", () => {
    const html = renderDocument(
      appointmentListWithMotion(),
      getProfile("b-mobile"),
      { pageRoutes: appointmentRoutes }
    );
    expect(html).toContain('data-node-id="appointment-list.action.toggle-view"');
    expect(html).toContain('data-motion-preset="press-feedback"');
    expect(html).toMatch(/data-motion-group="appointment-list\.row\.appointment"/);
    expect(html).toContain('data-motion-index="0"');
    expect(html).toContain('data-motion-index="1"');
    expect(html).toContain("--motion-stagger:24ms");
    expect(html).toContain("@keyframes motion-enter-fade");
    expect(html).toContain("prefers-reduced-motion");
    expect(html).toContain('document.documentElement.dataset.motionFallback = "fade";');
  });

  it("applies the page-level preset to the root shell", () => {
    const html = renderDocument(
      appointmentListWithMotion(),
      getProfile("b-mobile"),
      { pageRoutes: appointmentRoutes }
    );
    const root = rootTag(html);
    expect(root).toContain('data-node-id="appointment-list.page.root"');
    expect(root).toContain('data-motion-preset="enter-fade"');
    expect(root).toContain('style="--motion-duration:120ms;--motion-ease:ease-out"');
  });

  it("merges motion custom properties into the existing Section style attribute", () => {
    const html = renderDocument(
      appointmentListWithMotion(
        appointmentMotion([
          { nodeId: "appointment-list.view.list", preset: "sheet-up" },
        ])
      ),
      getProfile("b-mobile"),
      { pageRoutes: appointmentRoutes }
    );
    const tag =
      html.match(/<section class="section" data-view-panel="list"[^>]*>/)?.[0] ?? "";
    expect(tag).toContain('data-node-id="appointment-list.view.list"');
    expect(tag).toContain('data-motion-preset="sheet-up"');
    expect(tag.match(/style=/g)?.length).toBe(1);
    expect(tag).toContain(
      'style="padding:var(--space-1);gap:var(--space-2);--motion-duration:200ms;--motion-ease:cubic-bezier(0.2, 0, 0, 1)"'
    );
  });

  it("lets the first duplicate binding win for node, group, and page targets", () => {
    const spec = appointmentListWithMotion(
      appointmentMotion([
        { nodeId: "appointment-list.action.toggle-view", preset: "press-feedback" },
        { nodeId: "appointment-list.action.toggle-view", preset: "state-swap" },
        { nodeId: "appointment-list.row.appointment", preset: "list-stagger" },
        { nodeId: "appointment-list.row.appointment", preset: "toast-in" },
        { nodeId: "appointment-list.page.root", preset: "state-swap" },
        { nodeId: "appointment-list.page.root", preset: "toast-in" },
        { preset: "enter-fade" },
        { preset: "page-push" },
      ])
    );
    const ctx = createMotionContext(spec);

    const toggle: SpecNode = { type: "Button", id: "appointment-list.action.toggle-view" };
    const toggleAttrs = motionAttrs(toggle, ctx);
    expect(toggleAttrs.attrs).toContain(
      'data-node-id="appointment-list.action.toggle-view"'
    );
    expect(toggleAttrs.attrs).toContain('data-motion-preset="press-feedback"');
    expect(toggleAttrs.attrs).not.toContain("state-swap");
    expect(toggleAttrs.style).toBe("--motion-duration:120ms;--motion-ease:ease-out");

    const row: SpecNode = {
      type: "ListRow",
      id: "appointment-list.row.appointment.0",
      motionGroup: "appointment-list.row.appointment",
    };
    const rowAttrs = motionAttrs(row, ctx);
    expect(rowAttrs.attrs).toContain('data-motion-preset="list-stagger"');
    expect(rowAttrs.attrs).not.toContain("toast-in");
    expect(rowAttrs.style).toContain("--motion-stagger:24ms");
    expect(rowAttrs.attrs).toContain('data-motion-index="0"');

    const root: SpecNode = { type: "MobileShell", id: "appointment-list.page.root" };
    const pageAttrs = motionAttrs(root, ctx, true);
    expect(pageAttrs.attrs).toContain('data-motion-preset="enter-fade"');
    expect(pageAttrs.attrs).not.toContain("page-push");

    // Two legacy aliases can resolve to the page root: the first node-level
    // binding still wins when the root is addressed as a node.
    const rootNodeAttrs = motionAttrs(root, ctx, false);
    expect(rootNodeAttrs.attrs).toContain('data-motion-preset="state-swap"');
    expect(rootNodeAttrs.attrs).not.toContain("toast-in");

    expect(motionAttrs(toggle, undefined)).toEqual({ attrs: "", style: "" });
  });

  it("defaults the reduced-motion fallback to none without a motion spec", () => {
    const html = renderDocument(
      appointmentById.get("appointment-list")!,
      getProfile("b-mobile"),
      { pageRoutes: appointmentRoutes }
    );
    expect(html).toContain('document.documentElement.dataset.motionFallback = "none";');
    const root = rootTag(html);
    expect(root).toContain('data-node-id="appointment-list.page.root"');
    expect(root).not.toContain("data-motion-preset");
  });
});
