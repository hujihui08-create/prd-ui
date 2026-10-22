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
  formDraftKey,
  formOrigin,
  formOriginKey,
  motionAttrs,
  pickerReturnKey,
  pickerStorageKeys,
  readOnlyNote,
  renderDocument,
  renderIndex,
  renderMotionCss,
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
const phase2Routes = Object.fromEntries(
  phase2Specs.map((spec) => [spec.meta.pageId, spec.meta.route])
);
const phase2PageNames = Object.fromEntries(
  phase2Specs.map((spec) => [spec.meta.pageId, spec.meta.name])
);
const phase2Archetypes = Object.fromEntries(
  phase2Specs.map((spec) => [spec.meta.pageId, spec.meta.archetype])
);

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
    expect(html).not.toContain('data-action="查看完整详情"');
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

describe("v0.4 picker, dates, and fidelity fixes", () => {
  it("extracts only curated read-only notes", () => {
    expect(readOnlyNote("只读说明「爽约已记录入客户档案」；员工端不提供爽约入口")).toBe(
      "爽约已记录入客户档案"
    );
    expect(readOnlyNote("只读说明「本单已取消」；底部操作栏消失")).toBe("本单已取消");
    expect(readOnlyNote("底部保留开单；serviceCompleted=true 时显示术后告知")).toBeUndefined();
    expect(readOnlyNote("只读，显示确认人与确认时间；内容为快照")).toBeUndefined();
    expect(readOnlyNote(undefined)).toBeUndefined();
  });

  it("records only same-origin non-picker form origins and sweeps picker keys", () => {
    const formHref = "https://app.example.com/appointment-form.html";
    expect(formOrigin("https://app.example.com/appointment-list.html", formHref)).toBe(
      "https://app.example.com/appointment-list.html"
    );
    expect(
      formOrigin(
        "https://app.example.com/customer-search.html?mode=picker&returnTo=appointment-form",
        formHref
      )
    ).toBe("index.html");
    expect(formOrigin("https://other.example.com/list.html", formHref)).toBe("index.html");
    expect(formOrigin("", formHref)).toBe("index.html");
    expect(formOrigin(undefined, formHref)).toBe("index.html");
    expect(
      pickerStorageKeys([
        "prd-ui:picker:appointment-form",
        "prd-ui:picker:return",
        "prd-ui:form:origin:appointment-form",
        "other",
      ])
    ).toEqual(["prd-ui:picker:appointment-form", "prd-ui:picker:return"]);
    expect(formDraftKey("appointment-form")).toBe("prd-ui:picker:appointment-form");
    expect(pickerReturnKey()).toBe("prd-ui:picker:return");
    expect(formOriginKey("appointment-form")).toBe(
      "prd-ui:form:origin:appointment-form"
    );
  });

  it("renders picker hooks, full dates, and deduplicated detail fields", () => {
    const form = renderDocument(
      phase2ById.get("appointment-form")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes }
    );
    expect(form).toContain('data-picker-search="customer-search"');
    expect(form).toContain('type="datetime-local"');
    expect(form).toContain('data-action="选择客户"');

    const list = renderDocument(
      phase2ById.get("appointment-list")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes }
    );
    expect(list).toContain('data-slot-date="2025-11-03"');
    expect(list).toContain('data-slot-date="2025-11-09"');
    expect(list).toContain('data-calendar-week-start="2025-11-03"');
    expect(list).not.toContain("日期 时间段 客户");
    expect(list).toContain("日历");

    const detail = renderDocument(
      phase2ById.get("appointment-detail")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes }
    );
    expect(detail.match(/data-field="customer"/g)?.length ?? 0).toBe(0);
    expect(detail.match(/class="badge tone-warning">已登记<\/span>/g)?.length ?? 0).toBe(1);
    expect(detail).not.toContain('form-readonly">已登记');
  });

  it("stores and restores reschedule record context", () => {
    const detail = renderDocument(
      phase2ById.get("appointment-detail")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes, pageArchetypes: phase2Archetypes }
    );
    expect(detail).toContain('prd-ui:appointment:');
    expect(detail).toContain('summaryValue("客户")');
    expect(detail).toContain('summaryValue("时间段")');

    const form = renderDocument(
      phase2ById.get("appointment-form")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes, pageArchetypes: phase2Archetypes }
    );
    expect(form).toContain('"prd-ui:appointment:" + recordKey');
    expect(form).toContain('current.name === "reschedule" && recordKey');
    expect(form).toContain("record.project");
    expect(form).toContain("record.therapist");
    expect(form).toContain("startInput.value");
  });

  it("renders the search idle state without a page-level detail CTA", () => {
    const search = renderDocument(
      phase2ById.get("customer-search")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes, pageArchetypes: phase2Archetypes }
    );
    expect(search).not.toContain('class="app-actions"');
    expect(search).not.toContain('data-action="查看详情"');
    expect(search).toContain('placeholder="输入姓名或脱敏手机号搜索客户"');
    expect(search).toContain("row.dataset.rowLink = \"true\"");
    expect(search).toContain("chevron.className = \"row-chevron\"");
  });

  it("does not leak the page id as a reschedule reference", () => {
    const form = renderDocument(
      phase2ById.get("appointment-form")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes, pageArchetypes: phase2Archetypes }
    );
    expect(form).toContain('"referenceId":null');
    expect(form).toContain("current.name === \"reschedule\" && appointmentId");
    const detail = renderDocument(
      phase2ById.get("appointment-detail")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes, pageArchetypes: phase2Archetypes }
    );
    expect(detail).toContain('"referenceId":null');
  });

  it("renders disabled styling and hides the premature notice action", () => {
    const form = renderDocument(
      phase2ById.get("appointment-form")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes, pageArchetypes: phase2Archetypes }
    );
    expect(form).toContain('body[data-state="disabled"] .app-scroll input');
    expect(form).toContain(".readonly-banner");
    expect(form).toContain("当前为只读状态，无法编辑或保存");

    const detail = renderDocument(
      phase2ById.get("appointment-detail")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes, pageArchetypes: phase2Archetypes }
    );
    expect(detail).not.toContain('data-action="术后告知"');
    expect(detail).toContain('rowLabel(row) !== "服务完成"');
    expect(detail).toContain("action !== \"术后告知\"");
  });

  it("carries page archetypes and validates the runtime picker return target", () => {
    const search = renderDocument(
      phase2ById.get("customer-search")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes, pageArchetypes: phase2Archetypes }
    );
    expect(search).toContain('"pageArchetypes":{"today":"home"');
    expect(search).toContain('"appointment-form":"mobile-form"');
    expect(search).toContain('config.pageArchetypes?.[requestedReturn] === "mobile-form"');
    expect(search).toContain('const target = allowed ? requestedReturn : pickerReturn;');
    expect(search).toContain('const targetDraftKey = pickerPrefix + target');
    expect(search).toContain("draft.customer = selectedName");
    expect(search).not.toContain("sessionStorage.setItem(returnKey, target)");
  });

  it("renders today plus the brief tabs on the home tab bar", () => {
    const home = renderDocument(
      phase2ById.get("today")!,
      getProfile("b-mobile"),
      { pageNames: phase2PageNames, pageRoutes: phase2Routes }
    );
    expect(home).toContain('class="tab active"');
    expect(home).toContain("今日");
    expect(home).toContain("预约列表");
    expect(home).toContain("today");
  });

  it("drives business states and views from the query string", () => {
    const detail = renderDocument(
      phase2ById.get("appointment-detail")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes }
    );
    expect(detail).toContain(
      'new URLSearchParams(location.search).get("status")'
    );
    expect(detail).toContain("back-icon");
    expect(detail).toContain(
      'badge.className = "badge tone-" + toneFor(status)'
    );
    expect(detail).toContain(
      "visibleInBar === 0 ? config.stateNotes?.[status] : undefined"
    );
    expect(detail).toContain(
      '"stateNotes":{"爽约":"爽约已记录入客户档案","已取消":"本单已取消"}'
    );
    expect(detail).toContain('back.addEventListener("click"');
    expect(detail).toContain('key.indexOf(originPrefix) === 0');
    expect(detail).toContain("location.href = origin");
    expect(detail).toContain("history.length > 1");
    expect(detail).toContain('location.href = "index.html"');
    expect(detail).toContain(".back-icon{font-size:20px;cursor:pointer;}");
    expect(detail).not.toContain("prd-ui:picker:selected");

    const list = renderDocument(
      phase2ById.get("appointment-list")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes }
    );
    expect(list).toContain('new URLSearchParams(location.search).get("view")');
  });

  it("prefills datetime-local values and ships the picker state machine", () => {
    const form = renderDocument(
      phase2ById.get("appointment-form")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes }
    );
    expect(form).toContain('dateParam + "T" + timeParam');
    expect(form).toContain('"formModeLabels":{"new":"新增预约","reschedule":"改期"}');
    expect(form).toContain("config.formModeLabels?.[mode.name]");
    expect(form).toContain('sessionStorage.setItem(draftKey, JSON.stringify(draft))');
    expect(form).toContain('sessionStorage.setItem(returnKey, config.pageId)');
    expect(form).toContain('sessionStorage.getItem(returnKey) === config.pageId');
    expect(form).toContain("if (hasPrefill)");
    expect(form).toContain("document.referrer");
    expect(form).toContain('referrer.indexOf("mode=picker") < 0');
    expect(form).toContain('sessionStorage.getItem(originKey)');
    expect(form).toContain('sessionStorage.setItem(originKey, origin)');
    expect(form).toContain('const targetDraftKey = pickerPrefix + target');
    expect(form).toContain("draft.customer = selectedName");
    expect(form).toContain('sessionStorage.setItem(targetDraftKey, JSON.stringify(draft))');
    expect(form).toContain("sessionStorage.removeItem(draftKey)");
    expect(form).toContain("sessionStorage.removeItem(returnKey)");
    expect(form).toContain("sessionStorage.removeItem(originKey)");
    expect(form).toContain('document.body.dataset.pageKind === "form"');
    expect(form).not.toContain("prd-ui:picker:selected");
    expect(form).not.toContain("prd-ui:picker:callback-register");
    expect(form).toContain('const formDraftKey = "prd-ui:picker:appointment-form";');
    expect(form).toContain('const pickerReturnKey = "prd-ui:picker:return";');
    expect(form).toContain(
      'const formOriginKey = "prd-ui:form:origin:appointment-form";'
    );
    expect(form).toContain("location.href = origin");

    const search = renderDocument(
      phase2ById.get("customer-search")!,
      getProfile("b-mobile"),
      { pageRoutes: phase2Routes }
    );
    expect(search).toContain('data-picker-return="appointment-form"');
    expect(search).not.toContain("prd-ui:picker:selected");
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
    expect(html).toContain("--motion-index:0");
    expect(html).toContain("--motion-index:1");
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
    expect(rowAttrs.style).toContain("--motion-index:0");
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

  it("falls back to state-swap for preset names the renderer has no CSS for", () => {
    const html = renderDocument(
      appointmentListWithMotion({
        presets: {
          "page-enter": { durationMs: 200, easing: "ease-out" },
          "empty-fade": { durationMs: 320, easing: "ease-out" },
        },
        bindings: [
          { preset: "page-enter" },
          { nodeId: "appointment-list.action.toggle-view", preset: "empty-fade" },
        ],
        reducedMotion: { fallback: "fade" },
      }),
      getProfile("b-mobile"),
      { pageRoutes: appointmentRoutes }
    );
    expect(rootTag(html)).toContain('data-motion-preset="state-swap"');
    expect(rootTag(html)).toContain('style="--motion-duration:200ms;--motion-ease:ease-out"');
    expect(html).toContain(
      'data-node-id="appointment-list.action.toggle-view" data-motion-preset="state-swap" style="--motion-duration:320ms;--motion-ease:ease-out"'
    );
    expect(html).not.toContain('data-motion-preset="page-enter"');
    expect(html).not.toContain('data-motion-preset="empty-fade"');
  });

  it("disables motion and press feedback and limits fade fallbacks in CSS", () => {
    const css = renderMotionCss();
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(
      "[data-motion-preset]{animation:none!important;transition:none!important}"
    );
    expect(css).toContain(
      '[data-motion-preset="press-feedback"]:active{transform:none!important}'
    );
    expect(css).toContain(
      "animation-delay:calc(var(--motion-stagger,40ms) * var(--motion-index,0))"
    );
    for (const preset of [
      "enter-fade",
      "page-push",
      "sheet-up",
      "state-swap",
      "toast-in",
      "list-stagger",
    ]) {
      expect(css).toContain(`[data-motion-fallback="fade"] [data-motion-preset="${preset}"]`);
    }
    expect(css).not.toContain(
      '[data-motion-fallback="fade"] [data-motion-preset="press-feedback"]'
    );
    expect(css).not.toContain(
      '[data-motion-fallback="fade"] [data-motion-preset="confirm-collapse"]'
    );
  });

  it.each(["none", "fade", "instant"] as const)(
    "emits the %s reduced-motion fallback on the document element",
    (fallback) => {
      const html = renderDocument(
        appointmentListWithMotion({
          ...appointmentMotion(),
          reducedMotion: { fallback },
        }),
        getProfile("b-mobile"),
        { pageRoutes: appointmentRoutes }
      );
      expect(html).toContain(
        `document.documentElement.dataset.motionFallback = "${fallback}";`
      );
    }
  );

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
