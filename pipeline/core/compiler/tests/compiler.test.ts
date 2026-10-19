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
        nodesOf(spec, "Button").map((node) => node.props?.label),
        page.id
      ).toEqual(page.actions);
    }
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
