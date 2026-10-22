import { describe, expect, it } from "vitest";
import { UiBriefSchema } from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import briefJson from "../../../samples/projects/employee-app/ui-brief.json";
import demoBriefJson from "../../../samples/projects/demo-orders-intake/ui-brief.json";
import appointmentsBriefJson from "../../../samples/projects/employee-app-appointments-03/ui-brief.json";
import phase2BriefJson from "../../../samples/projects/employee-app-phase2/ui-brief.json";
import { renderDocument, renderIndex } from "../src/index.js";

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
