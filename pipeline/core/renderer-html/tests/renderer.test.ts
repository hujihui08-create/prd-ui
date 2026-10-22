import { describe, expect, it } from "vitest";
import { UiBriefSchema } from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import briefJson from "../../../samples/projects/employee-app/ui-brief.json";
import demoBriefJson from "../../../samples/projects/demo-orders-intake/ui-brief.json";
import appointmentsBriefJson from "../../../samples/projects/employee-app-appointments-03/ui-brief.json";
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

  it("renders an index with project title and styled links", () => {
    const index = renderIndex(demoSpecs);
    expect(index).toContain("demo-orders · 页面索引");
    expect(index).toContain("8 个页面");
    expect(index).toContain('href="orders-list.html"');
    expect(index).toContain("color:#111827;text-decoration:none;");
  });
});
