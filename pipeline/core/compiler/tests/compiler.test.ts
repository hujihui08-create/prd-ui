import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PageSpecSchema,
  UiBriefSchema,
  type PageSpec,
  type SpecNode,
  type UiBrief,
  type UiBriefPage,
} from "@prd-ui/contracts";
import {
  getArchetype,
  getCatalog,
  getProfile,
  isLayoutPrimitive,
} from "@prd-ui/design-system";
import briefJson from "../../../samples/ui-brief.sample.json";
import phase2BriefJson from "../../../samples/projects/employee-app-phase2/ui-brief.json";
import { compilePageSpec, compileProject } from "../src/index.js";

const brief = UiBriefSchema.parse(briefJson);
const deps = { getProfile, getCatalog, getArchetype };
const specs = compileProject(brief, deps);
const specsByPageId = new Map(specs.map((spec) => [spec.meta.pageId, spec]));

const rawValuePattern = /(#[0-9a-fA-F]{3,8}\b)|\brgba?\(|\bhsla?\(|\b\d+(\.\d+)?(px|rem|em)\b/;
const rootShells = new Set(["PageShell", "MobileShell"]);

function collectNodes(node: SpecNode, nodes: SpecNode[] = []): SpecNode[] {
  nodes.push(node);
  for (const child of node.children ?? []) collectNodes(child, nodes);
  for (const slotNodes of Object.values(node.slots ?? {})) {
    for (const child of slotNodes) collectNodes(child, nodes);
  }
  return nodes;
}

describe("compileProject", () => {
  it("compiles exactly the eight sample pages", () => {
    expect(specs).toHaveLength(8);
    expect([...specsByPageId.keys()].sort()).toEqual(
      brief.ia.pages.map((page) => page.id).sort()
    );
  });

  it("preserves page metadata", () => {
    for (const page of brief.ia.pages) {
      const spec = specsByPageId.get(page.id);
      expect(spec, page.id).toBeDefined();
      expect(spec!.meta).toMatchObject({
        pageId: page.id,
        project: brief.meta.project,
        name: page.name,
        target: page.target,
        profile: page.profile,
        archetype: page.archetype,
        purpose: page.purpose,
        route: page.route,
        roles: page.roles,
      });
      expect(spec!.meta.reqRefs).toEqual(page.reqRefs);
    }
  });

  it("maps the phase2 quick-action icons to standard asset ids", () => {
    const phase2Brief = UiBriefSchema.parse(phase2BriefJson);
    const phase2Specs = compileProject(phase2Brief, deps);
    const today = phase2Specs.find((spec) => spec.meta.pageId === "today")!;
    const icons = collectNodes(today.layout)
      .filter((node) => node.type === "QuickAction")
      .map((node) => node.props?.icon);
    expect(icons).toEqual(["icon-plus", "icon-plus", "icon-search"]);
  });

  it("adds a clear-keyword action to the customer-search empty state", () => {
    const phase2Brief = UiBriefSchema.parse(phase2BriefJson);
    const phase2Specs = compileProject(phase2Brief, deps);
    const search = phase2Specs.find((spec) => spec.meta.pageId === "customer-search")!;
    const empty = collectNodes(search.layout).find(
      (node) => node.type === "EmptyState" && node.props?.emptyKind === "empty"
    );
    expect(empty).toBeDefined();
    const actions = (empty!.children ?? []).map((node) => node.props?.action);
    expect(actions).toEqual(["清空关键词"]);
  });

  it("defaults picker and calendar metadata for the signed phase2 brief", () => {
    const phase2 = UiBriefSchema.parse(
      JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
    );
    const compiled = compileProject(phase2, deps);
    const form = compiled.find((spec) => spec.meta.pageId === "appointment-form")!;
    const search = compiled.find((spec) => spec.meta.pageId === "customer-search")!;
    const list = compiled.find((spec) => spec.meta.pageId === "appointment-list")!;
    expect(form.customerPicker).toBe("customer-search");
    expect(search.pickerReturnTo).toBe("appointment-form");
    expect(list.calendarWeekStart).toBe("2026-11-02");
    expect(search.calendarWeekStart).toBeUndefined();
  });

  it("keeps explicit picker and calendar metadata over defaults", () => {
    const explicit = UiBriefSchema.parse(
      JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
    );
    const form = explicit.ia.pages.find((page) => page.id === "appointment-form")!;
    form.customerPicker = "customer-detail";
    const list = explicit.ia.pages.find((page) => page.id === "appointment-list")!;
    list.calendarWeekStart = "2026-12-07";
    const compiled = compileProject(explicit, deps);
    expect(
      compiled.find((spec) => spec.meta.pageId === "appointment-form")?.customerPicker
    ).toBe("customer-detail");
    expect(
      compiled.find((spec) => spec.meta.pageId === "appointment-list")?.calendarWeekStart
    ).toBe("2026-12-07");
  });

  it("defaults customerPicker only for forms with a customer field", () => {
    const noCustomer = UiBriefSchema.parse(
      JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
    );
    const callback = noCustomer.ia.pages.find((page) => page.id === "callback-register")!;
    callback.fields = (callback.fields ?? []).filter((field) => field !== "customer");
    const compiled = compileProject(noCustomer, deps);
    expect(
      compiled.find((spec) => spec.meta.pageId === "callback-register")?.customerPicker
    ).toBeUndefined();
    expect(
      compiled.find((spec) => spec.meta.pageId === "appointment-form")?.customerPicker
    ).toBe("customer-search");
  });

  it("derives calendarWeekStart from meta.date when a list has no row dates", () => {
    const fallback = UiBriefSchema.parse(
      JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
    );
    const list = fallback.ia.pages.find((page) => page.id === "appointment-list")!;
    list.mockData = { rows: [{ time: "10:00-11:00", customer: "示例客户" }] };
    const compiled = compileProject(fallback, deps);
    expect(
      compiled.find((spec) => spec.meta.pageId === "appointment-list")?.calendarWeekStart
    ).toBe("2026-10-19");
  });

  it("uses the target-appropriate shell as the root", () => {
    for (const page of brief.ia.pages) {
      const spec = specsByPageId.get(page.id)!;
      expect(spec.layout.type, page.id).toBe(
        page.target === "web" ? "PageShell" : "MobileShell"
      );
    }
  });

  it("emits every required slot with at least one node", () => {
    for (const page of brief.ia.pages) {
      const archetype = getArchetype(page.archetype);
      const spec = specsByPageId.get(page.id)!;
      for (const slot of archetype.requiredSlots) {
        expect(spec.layout.slots?.[slot], `${page.id}.${slot}`).toBeDefined();
        expect(spec.layout.slots?.[slot]?.length, `${page.id}.${slot}`).toBeGreaterThan(0);
      }
    }
  });

  it("only places node types allowed by the root shell slot contracts", () => {
    for (const page of brief.ia.pages) {
      const spec = specsByPageId.get(page.id)!;
      const catalog = getCatalog(page.profile);
      const shell = catalog.components.find((component) => component.id === spec.layout.type);
      expect(shell, `${page.id} root ${spec.layout.type}`).toBeDefined();

      for (const [slot, nodes] of Object.entries(spec.layout.slots ?? {})) {
        const allowed = shell?.slots?.[slot]?.allowed;
        expect(allowed, `${spec.layout.type}.${slot}`).toBeDefined();
        for (const node of nodes) {
          expect(allowed, `${page.id}.${slot} -> ${node.type}`).toContain(node.type);
        }
      }
    }
  });

  it("includes archetype and page required states", () => {
    for (const page of brief.ia.pages) {
      const archetype = getArchetype(page.archetype);
      const spec = specsByPageId.get(page.id)!;
      const expected = new Set([...archetype.requiredStates, ...page.requiredStates]);

      expect(new Set(Object.keys(spec.states))).toEqual(expected);
      for (const [name, state] of Object.entries(spec.states)) {
        expect(state.name).toBe(name);
      }
    }
  });

  it("only emits catalog components that are available", () => {
    for (const page of brief.ia.pages) {
      const spec = specsByPageId.get(page.id)!;
      const catalog = getCatalog(page.profile);
      const components = new Map(catalog.components.map((component) => [component.id, component]));

      for (const node of collectNodes(spec.layout)) {
        if (isLayoutPrimitive(node.type)) continue;
        const component = components.get(node.type);
        expect(component, `${page.id} uses unknown component ${node.type}`).toBeDefined();
        expect(component?.availability, `${page.id} ${node.type}`).toBe("available");
      }
    }
  });

  it("only emits archetype-approved components outside the root shell", () => {
    for (const page of brief.ia.pages) {
      const archetype = getArchetype(page.archetype);
      const spec = specsByPageId.get(page.id)!;

      for (const node of collectNodes(spec.layout)) {
        if (isLayoutPrimitive(node.type) || rootShells.has(node.type)) continue;
        expect(archetype.allowedComponents, `${page.id} uses ${node.type}`).toContain(node.type);
      }
    }
  });

  it("parses with PageSpecSchema", () => {
    for (const spec of specs) {
      expect(() => PageSpecSchema.parse(spec), spec.meta.pageId).not.toThrow();
    }
  });

  it("assigns deterministic semantic node ids and row groups", () => {
    const phase2 = UiBriefSchema.parse(
      JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
    );
    const compiled = compileProject(phase2, deps);
    const detail = compiled.find((spec) => spec.meta.pageId === "appointment-detail")!;
    const list = compiled.find((spec) => spec.meta.pageId === "appointment-list")!;
    const ids = (spec: PageSpec) =>
      collectNodes(spec.layout).flatMap((node) => (node.id ? [node.id] : []));
    expect(ids(detail)).toContain("appointment-detail.page.root");
    expect(ids(detail)).toContain("appointment-detail.action.checkin");
    expect(ids(list)).toContain("appointment-list.action.toggle-view");
    const rows = collectNodes(list.layout).filter((node) => node.type === "ListRow");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.motionGroup).toBe("appointment-list.row.appointment");
      expect(row.id).toMatch(/^appointment-list\.row\.appointment\.\d+$/);
    }
    expect(ids(list)).toEqual(
      ids(compileProject(phase2, deps).find((s) => s.meta.pageId === "appointment-list")!)
    );

    const today = compiled.find((spec) => spec.meta.pageId === "today")!;
    expect(
      collectNodes(today.layout)
        .filter((node) => node.type === "ListRow")
        .map((row) => row.motionGroup)
    ).toEqual([
      "today.row.appointment",
      "today.row.appointment",
      "today.row.appointment",
      "today.row.callback",
      "today.row.callback",
    ]);

    const recompiled = compileProject(phase2, deps);
    for (const spec of compiled) {
      const again = recompiled.find(
        (candidate) => candidate.meta.pageId === spec.meta.pageId
      )!;
      expect(ids(again), spec.meta.pageId).toEqual(ids(spec));

      const nodes = collectNodes(spec.layout);
      const pageIds = nodes.flatMap((node) => (node.id ? [node.id] : []));
      expect(pageIds, spec.meta.pageId).toHaveLength(nodes.length);
      expect(new Set(pageIds).size, spec.meta.pageId).toBe(pageIds.length);
    }
  });

  it("prefers actions-slot nodes for repeated semantic action ids", () => {
    const phase2 = UiBriefSchema.parse(
      JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
    );
    const detail = compileProject(phase2, deps).find(
      (spec) => spec.meta.pageId === "appointment-detail"
    )!;
    const nodes = collectNodes(detail.layout);
    const canonical = nodes.find(
      (node) => node.id === "appointment-detail.action.checkin"
    )!;
    expect(canonical.props?.label).toBe("已到店确认");
    expect(detail.layout.slots?.actions).toContain(canonical);

    const ghost = nodes.find(
      (node) => node.id === "appointment-detail.action.checkin.2"
    );
    expect(ghost).toBeDefined();
    expect(ghost!.props?.label).toBe("接单并确认到店");
    expect(detail.layout.slots?.actions).not.toContain(ghost);
  });

  it("has at least one requirement reference per spec", () => {
    for (const spec of specs) {
      expect(spec.meta.reqRefs.length, spec.meta.pageId).toBeGreaterThan(0);
      expect(spec.layout.reqRef, spec.meta.pageId).toBe(spec.meta.reqRefs[0]);
      expect(Object.keys(spec.traceability.reqMap).length, spec.meta.pageId).toBeGreaterThan(0);
    }
  });

  it("does not emit raw color or size values in props", () => {
    for (const spec of specs) {
      for (const node of collectNodes(spec.layout)) {
        expect(JSON.stringify(node.props ?? {}), `${spec.meta.pageId} ${node.type}`).not.toMatch(
          rawValuePattern
        );
      }
    }
  });

  it("references the profile-specific empty-state asset", () => {
    const bDenseEmpty = collectNodes(specsByPageId.get("orders-list")!.layout).find(
      (node) => node.type === "EmptyState"
    );
    expect(bDenseEmpty?.assetRef).toBe("empty-orders");

    const cExpressiveEmpty = collectNodes(specsByPageId.get("home-feed")!.layout).find(
      (node) => node.type === "EmptyState"
    );
    expect(cExpressiveEmpty?.assetRef).toBe("empty-feed");
  });

  it("rejects a mobile page whose catalog lacks MobileShell", () => {
    const page = brief.ia.pages.find((candidate) => candidate.id === "auth")!;
    expect(() =>
      compilePageSpec({
        brief,
        page: { ...page, profile: "b-dense" },
        profile: getProfile("b-dense"),
        catalog: getCatalog("b-dense"),
        archetype: getArchetype("auth"),
      })
    ).toThrow(/does not provide root shell "MobileShell"/);
  });

  it("rejects a web page whose catalog lacks PageShell", () => {
    const page = brief.ia.pages.find((candidate) => candidate.id === "orders-overview")!;
    expect(() =>
      compilePageSpec({
        brief,
        page: { ...page, profile: "c-expressive" },
        profile: getProfile("c-expressive"),
        catalog: getCatalog("c-expressive"),
        archetype: getArchetype("overview"),
      })
    ).toThrow(/does not provide root shell "PageShell"/);
  });
});

function nodesOf(spec: PageSpec, type: string): SpecNode[] {
  return collectNodes(spec.layout).filter((node) => node.type === type);
}

function expectNoOrderCopy(spec: PageSpec): void {
  const serialized = JSON.stringify(spec);
  for (const forbidden of [
    "新建订单",
    "暂无订单",
    "status",
    "date",
    "keyword",
    "订单摘要",
    "orderNo",
  ]) {
    expect(serialized, `${spec.meta.pageId} contains "${forbidden}"`).not.toContain(forbidden);
  }
}

describe("brief-driven page content", () => {
  it("renders all eight sample pages and parses each with PageSpecSchema", () => {
    expect(specs).toHaveLength(8);
    const schemaFailures = specs.filter((spec) => !PageSpecSchema.safeParse(spec).success);
    expect(schemaFailures).toEqual([]);
  });

  it("compiles a mobile-list page with filters, rows, and the primary action", () => {
    const page: UiBriefPage = {
      id: "appointments",
      name: "预约列表",
      purpose: "查看预约",
      archetype: "mobile-list",
      target: "mobile",
      profile: "b-mobile",
      route: "/appointments",
      roles: ["admin"],
      requiredStates: ["default", "empty", "loading", "error"],
      reqRefs: ["REQ-ORDER-001"],
      fields: ["customer", "project", "time", "status", "therapist"],
      fieldLabels: {
        customer: "客户",
        project: "项目",
        time: "时间段",
        status: "状态",
        therapist: "护理师",
      },
      filterFields: ["status"],
      actions: ["新增预约"],
      mockData: {
        rows: [
          {
            customer: "张女士",
            project: "小气泡",
            time: "10:00-11:00",
            status: "已登记",
            therapist: "王美容",
          },
        ],
      },
    };
    const custom = structuredClone(brief);
    custom.ia.pages.push(page);
    const spec = compilePageSpec({
      brief: custom,
      page,
      profile: getProfile("b-mobile"),
      catalog: getCatalog("b-mobile"),
      archetype: getArchetype("mobile-list"),
    });
    expect(spec.layout.type).toBe("MobileShell");
    expect(nodesOf(spec, "CollapsedFilter")[0]?.props?.label).toBe("状态");
    expect(nodesOf(spec, "Text").map((node) => node.props?.text)).toEqual(
      expect.arrayContaining(["客户", "项目", "时间段", "状态", "护理师"])
    );
    expect(nodesOf(spec, "CalendarGrid")[0]?.props).toMatchObject({
      days: expect.arrayContaining([
        expect.objectContaining({ label: "周一", date: "2026-10-19", today: true }),
      ]),
      blocks: [
        expect.objectContaining({
          title: "张女士",
          subtitle: "小气泡",
          start: 10,
          duration: 1,
          tone: "warning",
        }),
      ],
    });
    expect(nodesOf(spec, "ListRow")[0]?.props).toMatchObject({
      title: "客户：张女士",
      subtitle: "项目：小气泡",
      meta: "时间段：10:00-11:00",
      status: "已登记",
      statusTone: "warning",
      trailing: "护理师：王美容",
    });
    expect(nodesOf(spec, "Button")[0]?.props?.label).toBe("新增预约");
  });

  it("compiles a mobile-form page with inputs, selects, and actions", () => {
    const page: UiBriefPage = {
      id: "appointment-form",
      name: "新增预约",
      purpose: "新增或改期预约",
      archetype: "mobile-form",
      target: "mobile",
      profile: "b-mobile",
      route: "/appointments/new",
      roles: ["admin"],
      requiredStates: ["default", "loading", "error", "disabled"],
      reqRefs: ["REQ-ORDER-001"],
      fields: ["customer", "project", "source"],
      fieldLabels: { customer: "客户", project: "项目", source: "来源" },
      actions: ["保存", "保存改期"],
    };
    const custom = structuredClone(brief);
    custom.ia.pages.push(page);
    const spec = compilePageSpec({
      brief: custom,
      page,
      profile: getProfile("b-mobile"),
      catalog: getCatalog("b-mobile"),
      archetype: getArchetype("mobile-form"),
    });
    expect(spec.layout.type).toBe("MobileShell");
    expect(nodesOf(spec, "FormField").map((node) => node.props?.label)).toEqual([
      "客户",
      "项目",
      "来源",
    ]);
    expect(nodesOf(spec, "Select")[0]?.props?.options).toEqual([
      "到店",
      "电话",
      "微信",
      "企微",
    ]);
    expect(nodesOf(spec, "Button")).toHaveLength(2);
    expect(nodesOf(spec, "Button").map((node) => node.props?.label)).toEqual([
      "选择",
      "保存",
    ]);
    expect(nodesOf(spec, "Button")[0]?.props?.action).toBe("选择客户");
    expect(nodesOf(spec, "Text").map((node) => node.props?.text)).toContain("保存改期");
  });

  it("renders per-project notice blocks instead of one notices field", () => {
    const page: UiBriefPage = {
      id: "treatment-notice-test",
      name: "术后告知",
      purpose: "当面告知客户",
      archetype: "detail",
      target: "mobile",
      profile: "b-mobile",
      route: "/notices/:id",
      roles: ["admin"],
      requiredStates: ["default", "loading", "error"],
      reqRefs: ["REQ-ORDER-001"],
      fields: ["customer", "orderNo", "status", "notices"],
      fieldLabels: {
        customer: "客户",
        orderNo: "单号",
        status: "状态",
        notices: "告知内容",
      },
      emptyTitle: "暂无告知内容",
      noticeBlocks: [
        { title: "小气泡", items: ["24 小时内避免沾水", "注意防晒"] },
        { title: "补水", items: ["多饮水，做好保湿"] },
      ],
      mockData: {
        values: {
          customer: "张女士",
          orderNo: "SO20261102001",
          status: "未确认",
          notices: "旧版整段话术",
        },
      },
    };
    const custom = structuredClone(brief);
    custom.ia.pages.push(page);
    const spec = compilePageSpec({
      brief: custom,
      page,
      profile: getProfile("b-mobile"),
      catalog: getCatalog("b-mobile"),
      archetype: getArchetype("detail"),
    });
    const cards = nodesOf(spec, "Card").map((node) => node.props?.title);
    expect(cards).toEqual(expect.arrayContaining(["小气泡", "补水"]));
    const labels = nodesOf(spec, "FormField").map((node) => node.props?.label);
    expect(labels).not.toContain("告知内容");
    expect(nodesOf(spec, "Text").map((node) => node.props?.text)).toContain(
      "告知内容"
    );
    expect(nodesOf(spec, "EmptyState")[0]?.props?.title).toBe("暂无告知内容");
  });

  it("compiles a mobile-list search page", () => {
    const page: UiBriefPage = {
      id: "customer-search",
      name: "客户搜索",
      purpose: "搜索客户",
      archetype: "mobile-list",
      target: "mobile",
      profile: "b-mobile",
      route: "/customers/search",
      roles: ["admin"],
      requiredStates: ["default", "empty", "loading", "error"],
      reqRefs: ["REQ-ORDER-001"],
      fields: ["name", "phone", "store"],
      fieldLabels: { name: "姓名", phone: "手机号", store: "门店", keyword: "关键词" },
      filterFields: ["keyword"],
      actions: ["新建客户"],
      mockData: {
        rows: [{ name: "张女士", phone: "138****0000", store: "星光店" }],
      },
    };
    const custom = structuredClone(brief);
    custom.ia.pages.push(page);
    const spec = compilePageSpec({
      brief: custom,
      page,
      profile: getProfile("b-mobile"),
      catalog: getCatalog("b-mobile"),
      archetype: getArchetype("mobile-list"),
    });
    expect(nodesOf(spec, "SearchBar")[0]?.props?.placeholder).toContain("关键词");
    expect(nodesOf(spec, "Text").map((node) => node.props?.text)).toContain(
      "关键词"
    );
    expect(nodesOf(spec, "CollapsedFilter").map((node) => node.props?.label)).not.toContain(
      "关键词"
    );
    expect(nodesOf(spec, "ListRow")[0]?.props).toMatchObject({
      title: "姓名：张女士",
      subtitle: "手机号：138****0000 · 门店：星光店",
    });
  });

  it("takes web nav and mobile tabs from the brief", () => {
    for (const spec of specs) {
      if (spec.layout.type === "PageShell") {
        expect(spec.layout.props?.nav, spec.meta.pageId).toEqual(brief.ia.navigation.primary);
      }
    }

    const expectedTabs = brief.ia.navigation.tabs ?? brief.ia.navigation.primary;
    for (const pageId of ["home-feed", "item-detail"]) {
      expect(specsByPageId.get(pageId)!.layout.props?.tabs, pageId).toEqual(expectedTabs);
    }
  });

  it("renders sample list, overview, and feed content from the brief", () => {
    const listSpec = specsByPageId.get("orders-list")!;
    expect(nodesOf(listSpec, "DataTable")[0]?.props?.columns).toEqual([
      "orderNo",
      "customer",
      "amount",
      "status",
      "createdAt",
    ]);
    expect(nodesOf(listSpec, "FilterBar")[0]?.props).toMatchObject({
      fields: ["status", "date", "keyword"],
      action: "新建订单",
    });
    expect(nodesOf(listSpec, "EmptyState")[0]?.props?.title).toBe("暂无订单");
    expect(nodesOf(listSpec, "EmptyState")[0]?.assetRef).toBe("empty-orders");

    const overviewSpec = specsByPageId.get("orders-overview")!;
    expect(nodesOf(overviewSpec, "Stat").map((node) => node.props)).toEqual([
      { label: "今日订单", value: "128" },
      { label: "待处理", value: "12" },
      { label: "已完成", value: "96" },
      { label: "异常", value: "3" },
    ]);
    expect(nodesOf(overviewSpec, "Card")[0]?.props?.title).toBe("订单概览近期数据");

    const feedSpec = specsByPageId.get("home-feed")!;
    expect(nodesOf(feedSpec, "FeedCard").map((node) => node.props)).toEqual([
      { title: "周末去哪儿", body: "城市周边 5 个小众目的地" },
      { title: "新店开业", body: "手冲咖啡买一送一" },
    ]);
  });

  it("uses the brief emptyTitle for feed pages and defaults otherwise", () => {
    expect(nodesOf(specsByPageId.get("home-feed")!, "EmptyState")[0]?.props?.title).toBe(
      "暂无内容"
    );

    const briefWithFeedTitle = structuredClone(brief) as UiBrief;
    briefWithFeedTitle.ia.pages = briefWithFeedTitle.ia.pages.map((page) =>
      page.id === "home-feed" ? { ...page, emptyTitle: "暂无动态" } : page
    );
    const feedSpec = compileProject(briefWithFeedTitle, deps).find(
      (spec) => spec.meta.pageId === "home-feed"
    )!;
    expect(nodesOf(feedSpec, "EmptyState")[0]?.props?.title).toBe("暂无动态");
  });

  it("uses summary titles from the brief", () => {
    expect(nodesOf(specsByPageId.get("order-detail")!, "Card")[0]?.props?.title).toBe(
      "订单摘要"
    );
    expect(nodesOf(specsByPageId.get("item-detail")!, "Card")[0]?.props?.title).toBe(
      "商品摘要"
    );
  });

  it("prefers brief fieldLabels over built-in settings labels", () => {
    const custom = structuredClone(brief);
    const settingsPage = custom.ia.pages.find((page) => page.id === "settings")!;
    settingsPage.fieldLabels = {
      ...(settingsPage.fieldLabels ?? {}),
      notifications: "通知",
    };
    const spec = compileProject(custom, deps).find(
      (entry) => entry.meta.pageId === "settings"
    )!;
    const labels = nodesOf(spec, "FormField").map((node) => node.props?.label);
    expect(labels).toContain("通知");
    expect(labels).not.toContain("通知设置");
  });

  it("renders every action for detail, form, settings, auth, and onboarding", () => {
    const actionPages: UiBriefPage[] = [
      {
        id: "action-detail",
        name: "客户详情",
        purpose: "查看客户",
        archetype: "detail",
        target: "web",
        profile: "b-dense",
        route: "/action-detail",
        roles: ["admin"],
        requiredStates: ["default", "loading", "error"],
        reqRefs: ["REQ-ORDER-001"],
        fields: ["name"],
        actions: ["编辑客户", "导出客户"],
      },
      {
        id: "action-form",
        name: "客户表单",
        purpose: "创建客户",
        archetype: "form",
        target: "web",
        profile: "b-dense",
        route: "/action-form",
        roles: ["admin"],
        requiredStates: ["default", "loading", "error", "disabled"],
        reqRefs: ["REQ-ORDER-001"],
        fields: ["name"],
        actions: ["保存草稿", "提交"],
      },
      {
        id: "action-settings",
        name: "客户设置",
        purpose: "维护偏好",
        archetype: "settings",
        target: "web",
        profile: "b-dense",
        route: "/action-settings",
        roles: ["admin"],
        requiredStates: ["default", "loading", "error"],
        reqRefs: ["REQ-ORDER-001"],
        fields: ["notifications"],
        actions: ["保存", "重置"],
      },
      {
        id: "action-auth",
        name: "账号登录",
        purpose: "登录账号",
        archetype: "auth",
        target: "mobile",
        profile: "c-expressive",
        route: "/action-auth",
        roles: ["viewer"],
        requiredStates: ["default", "loading", "error", "disabled"],
        reqRefs: ["REQ-ORDER-001"],
        fields: ["email", "password"],
        actions: ["登录", "注册"],
      },
      {
        id: "action-onboarding",
        name: "引导页",
        purpose: "了解产品",
        archetype: "onboarding",
        target: "mobile",
        profile: "c-expressive",
        route: "/action-onboarding",
        roles: ["viewer"],
        requiredStates: ["default", "loading", "error"],
        reqRefs: ["REQ-ORDER-001"],
        actions: ["开始", "稍后"],
      },
    ];

    const actionBrief: UiBrief = structuredClone(brief);
    actionBrief.ia.pages.push(...actionPages);
    const compiled = compileProject(actionBrief, deps);
    const compiledById = new Map(compiled.map((spec) => [spec.meta.pageId, spec]));

    for (const page of actionPages) {
      const spec = compiledById.get(page.id)!;
      const serialized = JSON.stringify(spec.layout);
      for (const action of page.actions ?? []) {
        expect(serialized, `${page.id} layout`).toContain(action);
      }
      expect(
        nodesOf(spec, "Button")
          .map((node) => node.props?.label)
          .sort(),
        page.id
      ).toEqual([...(page.actions ?? [])].sort());
    }
  });

  function compileMobilePage(
    page: UiBriefPage,
    extraPages: UiBriefPage[] = []
  ): PageSpec {
    const custom = structuredClone(brief);
    custom.ia.pages.push(...extraPages, page);
    for (const req of page.reqRefs) {
      custom.traceability.reqMap[req] = [...(custom.traceability.reqMap[req] ?? []), page.id];
    }
    return compilePageSpec({
      brief: custom,
      page,
      profile: getProfile("b-mobile"),
      catalog: getCatalog("b-mobile"),
      archetype: getArchetype(page.archetype),
    });
  }

  const mobileBase = {
    target: "mobile" as const,
    profile: "b-mobile",
    roles: ["admin"],
    requiredStates: ["default", "loading", "error"],
    reqRefs: ["REQ-ORDER-001"],
  };

  it("carries business states, current status, reference id, and linked routes", () => {
    const formPage: UiBriefPage = {
      ...mobileBase,
      id: "appointment-form",
      name: "新增预约",
      purpose: "新增或改期预约",
      archetype: "mobile-form",
      route: "/appointments/form",
      fields: ["customer"],
      actions: ["保存", "保存改期"],
    };
    const customerPage: UiBriefPage = {
      ...mobileBase,
      id: "customer-detail",
      name: "客户详情",
      purpose: "查看客户",
      archetype: "detail",
      route: "/customers/:id",
      fields: ["name"],
      actions: ["查看预约"],
    };
    const noticePage: UiBriefPage = {
      ...mobileBase,
      id: "treatment-notice",
      name: "术后告知",
      purpose: "告知客户",
      archetype: "detail",
      route: "/appointments/detail/:id/notice",
      fields: ["customer"],
      actions: ["确认已当面告知"],
      noticeBlocks: [{ title: "小气泡", items: ["注意防晒"] }],
    };
    const detailPage: UiBriefPage = {
      ...mobileBase,
      id: "appointment-detail",
      name: "预约详情",
      purpose: "查看预约",
      archetype: "detail",
      route: "/appointments/detail/:id",
      fields: ["customer", "status"],
      fieldLabels: { customer: "客户", status: "状态" },
      actions: ["已到店确认", "接单并确认到店", "开单", "改期", "取消", "术后告知", "客户详情"],
      businessStates: [
        { name: "已登记", actions: ["已到店确认", "接单并确认到店", "开单", "改期", "取消"] },
        { name: "已到店", actions: ["开单", "术后告知", "客户详情"] },
        { name: "爽约", actions: [], note: "爽约已记录入客户档案" },
        { name: "已取消", actions: [], note: "本单已取消" },
      ],
      mockData: {
        values: { customer: "张女士", status: "已登记", appointmentId: "A-001" },
      },
    };

    const spec = compileMobilePage(detailPage, [formPage, customerPage, noticePage]);
    expect(spec.businessStates).toHaveLength(4);
    expect(spec.currentStatus).toBe("已登记");
    expect(spec.referenceId).toBe("A-001");
    expect(spec.linkedRoutes).toMatchObject({
      form: "/appointments/form",
      customer: "/customers/:id",
      notice: "/appointments/detail/:id/notice",
      detail: "/appointments/detail/:id",
    });
    expect(nodesOf(spec, "Button").map((node) => node.props?.action)).toEqual(
      expect.arrayContaining(["已到店确认", "开单", "取消"])
    );
    // customer and status arrive through the summary List, so the fields slot
    // keeps only the secondary actions.
    expect(nodesOf(spec, "FormField")).toEqual([]);
    expect(
      (nodesOf(spec, "List")[0]?.props?.items as Array<{ label: string }>).map(
        (item) => item.label
      )
    ).toEqual(expect.arrayContaining(["客户"]));
    expect(nodesOf(spec, "Text").map((node) => node.props?.text)).toContain("状态");
  });

  it("defaults form modes and calendar/list views", () => {
    const formPage: UiBriefPage = {
      ...mobileBase,
      id: "appointment-form",
      name: "新增/改期预约",
      purpose: "新增或改期预约",
      archetype: "mobile-form",
      route: "/appointments/new",
      fields: ["customer"],
      actions: ["保存", "保存改期"],
    };
    const formSpec = compileMobilePage(formPage);
    expect(formSpec.formModes?.map((mode) => mode.name)).toEqual(["new", "reschedule"]);
    expect(formSpec.formModes?.[1]?.customerLocked).toBe(true);

    const listPage: UiBriefPage = {
      ...mobileBase,
      id: "appointment-list",
      name: "预约列表",
      purpose: "查看预约",
      archetype: "mobile-list",
      route: "/appointments",
      fields: ["time", "customer"],
      fieldLabels: { time: "时间段", customer: "客户" },
      actions: ["新增预约", "切换日历/列表"],
      mockData: { rows: [{ time: "10:00-11:00", customer: "张女士" }] },
    };
    const listSpec = compileMobilePage(listPage);
    expect(listSpec.views).toEqual(["calendar", "list"]);
    expect(listSpec.defaultView).toBe("calendar");
    expect(nodesOf(listSpec, "CalendarGrid")[0]?.props?.viewPanel).toBe("calendar");
    expect(
      nodesOf(listSpec, "Section").find((node) => node.props?.viewPanel === "list")
    ).toBeDefined();
    const toggle = nodesOf(listSpec, "Button").find(
      (node) => node.props?.label === "切换日历/列表"
    );
    expect(toggle?.props?.viewToggle).toBe(true);
  });

  it("adds search idle, row search text, and empty-state hooks", () => {
    const page: UiBriefPage = {
      ...mobileBase,
      id: "customer-search",
      name: "客户搜索",
      purpose: "搜索客户",
      archetype: "mobile-list",
      route: "/customers/search",
      fields: ["name", "phone", "store"],
      fieldLabels: { name: "姓名", phone: "手机号", store: "门店" },
      filterFields: ["keyword"],
      searchIdleTitle: "输入姓名或脱敏手机号搜索客户",
      actions: ["清空关键词"],
      mockData: { rows: [{ name: "张女士", phone: "138****0000", store: "星光店" }] },
    };
    const spec = compileMobilePage(page);
    expect(spec.searchIdleTitle).toBe("输入姓名或脱敏手机号搜索客户");
    expect(nodesOf(spec, "ListRow")[0]?.props?.searchText).toContain("张女士");
    const emptyStates = nodesOf(spec, "EmptyState");
    expect(emptyStates.map((node) => node.props?.emptyKind)).toEqual(
      expect.arrayContaining(["idle", "empty"])
    );
    expect(
      emptyStates.find((node) => node.props?.emptyKind === "idle")?.props?.title
    ).toBe("输入姓名或脱敏手机号搜索客户");
    expect(nodesOf(spec, "Button")[0]?.props?.action).toBe("清空关键词");
  });

  it("compiles a custom customers-list page with its own content", () => {
    const customersPage: UiBriefPage = {
      id: "customers-list",
      name: "客户列表",
      purpose: "查看和管理客户",
      archetype: "list",
      target: "web",
      profile: "b-dense",
      route: "/customers",
      roles: ["admin", "operator"],
      requiredStates: ["default", "empty", "loading", "error"],
      reqRefs: ["REQ-ORDER-009"],
      fields: ["customerName", "phone", "email"],
      filterFields: ["name", "phone"],
      actions: ["新建客户", "导出客户"],
      emptyTitle: "暂无客户",
    };

    const customersBrief: UiBrief = structuredClone(brief);
    customersBrief.ia.pages.push(customersPage);
    customersBrief.traceability.reqMap["REQ-ORDER-009"] = ["customers-list"];

    const customersSpec = compileProject(customersBrief, deps).find(
      (spec) => spec.meta.pageId === "customers-list"
    )!;

    expect(PageSpecSchema.safeParse(customersSpec).success).toBe(true);
    expect(nodesOf(customersSpec, "DataTable")[0]?.props?.columns).toEqual([
      "customerName",
      "phone",
      "email",
    ]);
    expect(nodesOf(customersSpec, "FilterBar")[0]?.props).toMatchObject({
      fields: ["name", "phone"],
      action: "新建客户",
    });
    expect(nodesOf(customersSpec, "EmptyState")[0]?.props?.title).toBe("暂无客户");
    expect(nodesOf(customersSpec, "EmptyState")[0]?.assetRef).toBeUndefined();
    expect(customersSpec.layout.props?.nav).toEqual(brief.ia.navigation.primary);

    const serializedLayout = JSON.stringify(customersSpec.layout);
    expect(serializedLayout).toContain("新建客户");
    expect(serializedLayout).toContain("导出客户");
    expect(nodesOf(customersSpec, "Button").map((node) => node.props?.label)).toEqual([
      "导出客户",
    ]);

    expect(customersSpec.meta).toMatchObject({
      purpose: customersPage.purpose,
      route: customersPage.route,
      roles: customersPage.roles,
    });
    expectNoOrderCopy(customersSpec);
  });

  it("does not invent an empty illustration for a list page without emptyAssetRef", () => {
    const barePage: UiBriefPage = {
      id: "vendors-list",
      name: "供应商列表",
      purpose: "查看供应商",
      archetype: "list",
      target: "web",
      profile: "b-dense",
      route: "/vendors",
      roles: ["admin"],
      requiredStates: ["default", "empty", "loading", "error"],
      reqRefs: ["REQ-ORDER-009"],
      fields: ["vendorName"],
    };

    const bareBrief: UiBrief = structuredClone(brief);
    bareBrief.ia.pages.push(barePage);
    bareBrief.traceability.reqMap["REQ-ORDER-009"] = ["vendors-list"];

    const bareSpec = compileProject(bareBrief, deps).find(
      (spec) => spec.meta.pageId === "vendors-list"
    )!;
    const empty = nodesOf(bareSpec, "EmptyState")[0]!;

    expect(empty.assetRef).toBeUndefined();
    expect(JSON.stringify(bareSpec)).not.toContain("empty-orders");
    expect(JSON.stringify(bareSpec)).not.toContain("empty-feed");
    expect(nodesOf(bareSpec, "FilterBar")[0]?.props?.action).toBe("新建");
  });

describe("v0.4 picker, dates, and fidelity fixes", () => {
  const compilePhase2 = (): PageSpec[] =>
    compileProject(
      UiBriefSchema.parse(
        JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
      ),
      deps
    );
  const phase2Spec = (pageId: string): PageSpec =>
    compilePhase2().find((spec) => spec.meta.pageId === pageId)!;

  it("emits a full ISO calendar week, status legend, and row-date columns", () => {
    const list = phase2Spec("appointment-list");
    const grid = nodesOf(list, "CalendarGrid")[0]!;
    expect(grid.props?.days).toEqual([
      { label: "周一", date: "2026-11-02", today: false },
      { label: "周二", date: "2026-11-03", today: false },
      { label: "周三", date: "2026-11-04", today: false },
      { label: "周四", date: "2026-11-05", today: false },
      { label: "周五", date: "2026-11-06", today: false },
      { label: "周六", date: "2026-11-07", today: false },
      { label: "周日", date: "2026-11-08", today: false },
    ]);
    expect(
      (grid.props?.blocks as Array<{ day: number }>).map((block) => block.day)
    ).toEqual([2, 2, 2, 2]);
    expect(nodesOf(list, "Badge").map((badge) => badge.props?.label)).toEqual([
      "已登记",
      "已到店",
      "爽约",
      "已取消",
    ]);
    expect(list.calendarWeekStart).toBe("2026-11-02");
  });

  it("keeps list field labels out of the visible layout", () => {
    const list = phase2Spec("appointment-list");
    const captionRows = collectNodes(list.layout).filter(
      (node) => node.type === "Row" && node.props?.variant === "caption"
    );
    expect(captionRows).toEqual([]);
    const visibleLabels = collectNodes(list.layout)
      .filter((node) => node.type === "Text" && node.props?.text === "客户")
      .map((node) => node);
    expect(visibleLabels).toHaveLength(1);
    expect(visibleLabels[0]?.id).toBeDefined();
  });

  it("emits datetime-local inputs and an inline customer picker", () => {
    const form = phase2Spec("appointment-form");
    const inputs = nodesOf(form, "Input");
    expect(inputs.find((input) => input.props?.name === "startTime")?.props?.inputType).toBe(
      "datetime-local"
    );
    expect(inputs.find((input) => input.props?.name === "endTime")?.props?.inputType).toBe(
      "datetime-local"
    );
    const pick = nodesOf(form, "Button").find(
      (button) => button.props?.action === "选择客户"
    );
    expect(pick?.props?.label).toBe("选择");
    const customerField = nodesOf(form, "FormField").find(
      (field) => field.props?.field === "customer"
    );
    expect(customerField?.children?.map((child) => child.type)).toEqual(["Row"]);
    expect(
      nodesOf(form, "Text").map((node) => node.props?.text)
    ).not.toContain("另一模式");
    expect(form.customerPicker).toBe("customer-search");
  });

  it("deduplicates detail fields into the summary list and badge", () => {
    const detail = phase2Spec("appointment-detail");
    expect(nodesOf(detail, "FormField")).toEqual([]);
    expect(nodesOf(detail, "Badge")).toEqual([]);
    const summary = nodesOf(detail, "Card").find((card) =>
      String(card.props?.title ?? "").includes("摘要")
    )!;
    expect(summary.props).toMatchObject({ badge: "已登记", badgeTone: "warning" });
    const items = nodesOf(detail, "List")[0]?.props?.items as Array<{
      label: string;
      value: string;
    }>;
    expect(items.map((item) => item.label)).toEqual(
      expect.arrayContaining(["客户", "手机号", "项目", "时间段"])
    );
    expect(items.map((item) => item.label)).not.toContain("状态");
    expect(nodesOf(detail, "Text").map((node) => node.props?.text)).toContain("状态");
    const actionRow = collectNodes(detail.layout).find(
      (node) => node.type === "Row" && node.props?.variant === "filter"
    );
    expect(actionRow?.children?.length).toBeGreaterThan(1);
    expect(actionRow?.children?.every((child) => child.type === "Button")).toBe(true);
  });

  it("puts the page id into home tabs and activates it", () => {
    const home = phase2Spec("today");
    expect(home.layout.props?.tabs).toEqual(["today", "appointment-list"]);
    expect(home.layout.props?.activeTab).toBe("today");
    expect(home.layout.props?.showTabs).toBe(true);
  });

  it("omits the search action bar and keeps the detail action in content", () => {
    const search = phase2Spec("customer-search");
    expect(search.layout.slots?.actions).toBeUndefined();
    expect(nodesOf(search, "Button").map((button) => button.props?.action)).toEqual(
      expect.arrayContaining(["查看详情"])
    );
    expect(nodesOf(search, "EmptyState").map((node) => node.props?.emptyKind)).toEqual(
      expect.arrayContaining(["idle", "empty"])
    );
  });
});

  it("compiles a demo-crm contacts-list page without order copy", () => {
    const contactsPage: UiBriefPage = {
      id: "contacts-list",
      name: "联系人列表",
      purpose: "查看和管理联系人",
      archetype: "list",
      target: "web",
      profile: "b-dense",
      route: "/contacts",
      roles: ["admin", "operator"],
      requiredStates: ["default", "empty", "loading", "error"],
      reqRefs: ["REQ-CRM-001"],
      fields: ["name", "email", "phone"],
      filterFields: ["name", "email"],
      actions: ["新建联系人"],
      emptyTitle: "暂无联系人",
      emptyAssetRef: "empty-contacts",
    };

    const crmBrief: UiBrief = structuredClone(brief);
    crmBrief.meta.project = "demo-crm";
    crmBrief.ia.pages = [contactsPage];
    crmBrief.ia.navigation = { primary: ["联系人", "设置"] };
    crmBrief.ia.flows = [];
    crmBrief.traceability.reqMap = { "REQ-CRM-001": ["contacts-list"] };
    crmBrief.traceability.unmapped = [];

    const crmSpecs = compileProject(crmBrief, deps);
    expect(crmSpecs).toHaveLength(1);
    const contactsSpec = crmSpecs[0]!;

    expect(PageSpecSchema.safeParse(contactsSpec).success).toBe(true);
    expect(nodesOf(contactsSpec, "DataTable")[0]?.props?.columns).toEqual([
      "name",
      "email",
      "phone",
    ]);
    expect(nodesOf(contactsSpec, "FilterBar")[0]?.props).toMatchObject({
      fields: ["name", "email"],
      action: "新建联系人",
    });
    expect(nodesOf(contactsSpec, "EmptyState")[0]?.props?.title).toBe("暂无联系人");
    expect(nodesOf(contactsSpec, "EmptyState")[0]?.assetRef).toBe("empty-contacts");
    expect(contactsSpec.layout.props?.nav).toEqual(["联系人", "设置"]);
    expect(contactsSpec.meta).toMatchObject({
      project: "demo-crm",
      purpose: contactsPage.purpose,
      route: contactsPage.route,
      roles: contactsPage.roles,
    });
    expectNoOrderCopy(contactsSpec);
  });
});
