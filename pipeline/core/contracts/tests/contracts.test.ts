import { describe, expect, it } from "vitest";
import {
  PageSpecSchema,
  PageIdSchema,
  ProfileSchema,
  CatalogSchema,
  UiBriefSchema,
  AssetManifestSchema,
  FindingSchema,
  RunStateSchema,
  ProjectConfigSchema,
  AgentUsageSchema,
  AssetBriefSchema,
  parsePricingConfig,
  reqId,
  type PageSpec,
  type UiBrief,
} from "../src/index.js";

const minimalPageSpec: PageSpec = {
  meta: {
    pageId: "orders-list",
    project: "demo-orders",
    name: "订单列表",
    target: "web",
    profile: "b-dense",
    archetype: "list",
    purpose: "查看并筛选订单",
    route: "/orders",
    roles: ["admin", "operator"],
    reqRefs: [reqId("order", 1)],
    version: "0.1.0",
  },
  layout: { type: "PageShell", props: { title: "订单管理" } },
  states: { default: { name: "default" } },
  interactions: [],
  traceability: { reqMap: { "REQ-ORDER-001": ["orders-list"] }, designDefaults: [], unmapped: [] },
};

const minimalBrief: UiBrief = {
  meta: {
    project: "demo-orders",
    version: "0.1.0",
    sourcePrdHash: "sha256:demo",
    date: "2026-10-19",
    profile: "b-dense",
    platforms: ["web"],
  },
  product: {
    name: "订单管理",
    type: "b-end",
    goals: ["管理订单"],
    users: ["运营"],
    roles: ["admin"],
    scope: ["订单列表"],
    nonGoals: [],
    successMetrics: ["可完成订单查看"],
  },
  ia: {
    pages: [
      {
        id: "orders-list",
        name: "订单列表",
        purpose: "查看订单",
        archetype: "list",
        target: "web",
        profile: "b-dense",
        route: "/orders",
        roles: ["admin"],
        requiredStates: ["default", "empty"],
        reqRefs: [reqId("order", 1)],
      },
    ],
    navigation: { primary: ["订单"] },
    flows: [],
  },
  data: { entities: [{ name: "Order", fields: [{ name: "orderNo", type: "string", required: true }] }] },
  assets: { icons: ["search"], illustrations: [], images: [] },
  designDirection: { profile: "b-dense", density: "dense", tone: "neutral", motionLevel: "low" },
  openQuestions: [],
  assumptions: [],
  traceability: { reqMap: { "REQ-ORDER-001": ["orders-list"] }, unmapped: [] },
};

describe("contracts", () => {
  it("parses a minimal page spec", () => {
    expect(PageSpecSchema.parse(minimalPageSpec).meta.pageId).toBe("orders-list");
  });

  it("types parsed output as a page spec", () => {
    const parsed: PageSpec = PageSpecSchema.parse(minimalPageSpec);
    expect(parsed.meta.reqRefs[0]).toBe("REQ-ORDER-001");
  });

  it("rejects raw colors in spec props", () => {
    const bad = {
      ...minimalPageSpec,
      layout: { type: "Section", props: { fill: "#ffffff" } },
    };
    expect(() => PageSpecSchema.parse(bad)).toThrow();
  });

  it("requires purpose, route, and roles in page spec meta", () => {
    for (const field of ["purpose", "route", "roles"] as const) {
      const meta: Record<string, unknown> = { ...minimalPageSpec.meta };
      delete meta[field];
      expect(() =>
        PageSpecSchema.parse({ ...minimalPageSpec, meta })
      ).toThrow();
    }
    expect(() =>
      PageSpecSchema.parse({
        ...minimalPageSpec,
        meta: { ...minimalPageSpec.meta, roles: [] },
      })
    ).toThrow();
  });

  it("carries page purpose, route, and roles through the schema", () => {
    const parsed = PageSpecSchema.parse(minimalPageSpec);
    expect(parsed.meta.purpose).toBe("查看并筛选订单");
    expect(parsed.meta.route).toBe("/orders");
    expect(parsed.meta.roles).toEqual(["admin", "operator"]);
  });

  it("parses a profile", () => {
    const profile = {
      meta: { name: "b-dense", library: "b-dense", version: "0.1.0", origin: "baseline" },
      color: { "surface.default": "#FFFFFF", "text.primary": "#111827" },
      space: { "4": "16px", "6": "24px" },
      radius: { md: "8px" },
      motion: { normal: "200ms" },
      breakpoints: { md: "768px" },
      typography: {
        "body.md": { fontFamily: "Noto Sans SC", fontSize: 14, fontWeight: 400, lineHeight: 20 },
      },
    };
    expect(ProfileSchema.parse(profile).meta.name).toBe("b-dense");
  });

  it("parses a catalog", () => {
    const catalog = {
      meta: { library: "b-dense", version: "0.1.0" },
      components: [
        {
          id: "Button",
          library: "b-dense",
          source: "baseline",
          availability: "available",
          category: "action",
          props: { label: { type: "string", required: true } },
          variants: ["primary", "secondary"],
          states: ["default", "hover", "disabled"],
          version: "0.1.0",
        },
      ],
    };
    expect(CatalogSchema.parse(catalog).components).toHaveLength(1);
  });

  it("parses a UI brief", () => {
    expect(UiBriefSchema.parse(minimalBrief).ia.pages[0]?.id).toBe("orders-list");
  });

  it("accepts optional page presentation fields and navigation tabs", () => {
    const page = {
      ...minimalBrief.ia.pages[0]!,
      filterFields: ["status", "date"],
      emptyTitle: "暂无订单",
      emptyAssetRef: "empty-orders",
      summaryTitle: "订单摘要",
      feedItems: [{ title: "推荐", body: "今日精选" }],
      stats: [{ label: "今日订单", value: "128" }],
    };
    const parsed = UiBriefSchema.parse({
      ...minimalBrief,
      ia: {
        ...minimalBrief.ia,
        pages: [page],
        navigation: { ...minimalBrief.ia.navigation, tabs: ["推荐", "关注"] },
      },
    });

    const parsedPage = parsed.ia.pages[0]!;
    expect(parsedPage.filterFields).toEqual(["status", "date"]);
    expect(parsedPage.emptyTitle).toBe("暂无订单");
    expect(parsedPage.emptyAssetRef).toBe("empty-orders");
    expect(parsedPage.summaryTitle).toBe("订单摘要");
    expect(parsedPage.feedItems).toEqual([{ title: "推荐", body: "今日精选" }]);
    expect(parsedPage.stats).toEqual([{ label: "今日订单", value: "128" }]);
    expect(parsed.ia.navigation.tabs).toEqual(["推荐", "关注"]);
  });

  it("parses interaction metadata on a brief page", () => {
    const page = {
      ...minimalBrief.ia.pages[0]!,
      fields: ["status"],
      actions: [
        { id: "appointment.check-in", label: "已到店确认" },
        { id: "order.create", label: "开单" },
        { id: "appointment.cancel", label: "取消" },
      ],
      businessStates: [
        {
          name: "已登记",
          actions: ["appointment.check-in", "order.create", "appointment.cancel"],
        },
        { name: "已到店", actions: ["order.create"] },
        { name: "已取消", actions: [], note: "本单已取消" },
      ],
      formModes: [
        { name: "new" as const, label: "新增预约", actions: ["form.submit"] },
        {
          name: "reschedule" as const,
          label: "改期",
          actions: ["form.reschedule"],
          customerLocked: true,
        },
      ],
      views: ["calendar", "list"] as const,
      defaultView: "calendar" as const,
      searchIdleTitle: "输入姓名或脱敏手机号搜索客户",
    };
    const parsed = UiBriefSchema.parse({
      ...minimalBrief,
      ia: { ...minimalBrief.ia, pages: [page] },
    });
    const parsedPage = parsed.ia.pages[0]!;
    expect(parsedPage.businessStates).toHaveLength(3);
    expect(parsedPage.businessStates?.[2]?.note).toBe("本单已取消");
    expect(parsedPage.formModes?.[1]?.customerLocked).toBe(true);
    expect(parsedPage.views).toEqual(["calendar", "list"]);
    expect(parsedPage.defaultView).toBe("calendar");
    expect(parsedPage.searchIdleTitle).toContain("脱敏手机号");
  });

  it("parses picker and calendar metadata on a brief page", () => {
    const page = {
      ...minimalBrief.ia.pages[0]!,
      pickerReturnTo: "orders-list",
      customerPicker: "customer-search",
      calendarWeekStart: "2026-11-02",
    };
    const parsed = UiBriefSchema.parse({
      ...minimalBrief,
      ia: { ...minimalBrief.ia, pages: [page] },
    });
    expect(parsed.ia.pages[0]?.pickerReturnTo).toBe("orders-list");
    expect(parsed.ia.pages[0]?.customerPicker).toBe("customer-search");
    expect(parsed.ia.pages[0]?.calendarWeekStart).toBe("2026-11-02");

    const spec = PageSpecSchema.parse({
      ...minimalPageSpec,
      pickerReturnTo: "orders-list",
      customerPicker: "customer-search",
      calendarWeekStart: "2026-11-02",
    });
    expect(spec.pickerReturnTo).toBe("orders-list");
    expect(spec.customerPicker).toBe("customer-search");
    expect(spec.calendarWeekStart).toBe("2026-11-02");
  });

  it("rejects malformed picker and calendar metadata", () => {
    const page = minimalBrief.ia.pages[0]!;
    for (const patch of [
      { pickerReturnTo: "../orders" },
      { customerPicker: "" },
      { calendarWeekStart: "11-05" },
      { calendarWeekStart: "2026-11-05T00:00:00" },
    ]) {
      expect(() =>
        UiBriefSchema.parse({
          ...minimalBrief,
          ia: { ...minimalBrief.ia, pages: [{ ...page, ...patch }] },
        })
      ).toThrow();
      expect(() => PageSpecSchema.parse({ ...minimalPageSpec, ...patch })).toThrow();
    }
  });

  it("rejects malformed interaction metadata", () => {
    const page = minimalBrief.ia.pages[0]!;
    for (const patch of [
      { businessStates: [{ name: "已登记", actions: [""] }] },
      { businessStates: [{ name: "", actions: ["开单"] }] },
      { formModes: [{ name: "edit", label: "编辑", actions: ["保存"] }] },
      { views: ["grid"] },
      { defaultView: "grid" },
    ]) {
      expect(() =>
        UiBriefSchema.parse({
          ...minimalBrief,
          ia: { ...minimalBrief.ia, pages: [{ ...page, ...patch }] },
        })
      ).toThrow();
    }
  });

  it("carries interaction metadata on a page spec", () => {
    const spec = {
      ...minimalPageSpec,
      businessStates: [{ name: "已登记", actions: ["order.create"] }],
      formModes: [
        {
          name: "reschedule",
          label: "改期",
          actions: ["form.reschedule"],
          customerLocked: true,
        },
      ],
      views: ["calendar", "list"],
      defaultView: "calendar",
      searchIdleTitle: "输入姓名搜索客户",
      currentStatus: "已登记",
      referenceId: "A-001",
      linkedRoutes: {
        create: "/appointments/form",
        detail: "/appointments/detail/:id",
        customer: "/customers/:id",
        notice: "/appointments/detail/:id/notice",
        form: "/appointments/form",
      },
    };
    const parsed = PageSpecSchema.parse(spec);
    expect(parsed.businessStates?.[0]?.actions).toEqual(["order.create"]);
    expect(parsed.currentStatus).toBe("已登记");
    expect(parsed.linkedRoutes?.form).toBe("/appointments/form");
  });

  it("rejects malformed optional page presentation fields", () => {
    const page = {
      ...minimalBrief.ia.pages[0]!,
      feedItems: [{ title: "推荐" }],
    };
    expect(() =>
      UiBriefSchema.parse({
        ...minimalBrief,
        ia: { ...minimalBrief.ia, pages: [page] },
      })
    ).toThrow();
  });

  it("rejects empty content entries in a brief", () => {
    const page = minimalBrief.ia.pages[0]!;
    for (const patch of [
      { roles: [""] },
      { requiredStates: [""] },
      { fields: [""] },
      { actions: [""] },
      { filterFields: [""] },
    ]) {
      expect(() =>
        UiBriefSchema.parse({
          ...minimalBrief,
          ia: { ...minimalBrief.ia, pages: [{ ...page, ...patch }] },
        })
      ).toThrow();
    }

    expect(() =>
      UiBriefSchema.parse({
        ...minimalBrief,
        ia: {
          ...minimalBrief.ia,
          navigation: { primary: [""] },
        },
      })
    ).toThrow();
  });

  it("parses a strict project config", () => {
    const config = {
      project: "demo-orders",
      brief: "ui-brief.sample.json",
      manifests: {
        "b-dense": "asset-manifest.b-dense.json",
        "c-expressive": "asset-manifest.c-expressive.json",
      },
      runsDir: "runs",
    };
    expect(ProjectConfigSchema.parse(config).manifests["b-dense"]).toBe(
      "asset-manifest.b-dense.json"
    );
    expect(() => ProjectConfigSchema.parse({ ...config, extra: true })).toThrow();
    expect(() =>
      ProjectConfigSchema.parse({ ...config, manifests: "not-a-record" })
    ).toThrow();
    expect(() =>
      ProjectConfigSchema.parse({ project: "x", manifests: {} })
    ).toThrow();
  });

  it("accepts valid kebab-case page ids", () => {
    expect(PageIdSchema.parse("orders-list-2")).toBe("orders-list-2");
    expect(() => PageSpecSchema.parse(minimalPageSpec)).not.toThrow();
  });

  it("rejects path-like page ids in specs and briefs", () => {
    expect(() => PageIdSchema.parse("../orders")).toThrow();
    expect(() =>
      PageSpecSchema.parse({
        ...minimalPageSpec,
        meta: { ...minimalPageSpec.meta, pageId: "../orders" },
      })
    ).toThrow();
    expect(() =>
      UiBriefSchema.parse({
        ...minimalBrief,
        ia: {
          ...minimalBrief.ia,
          pages: [{ ...minimalBrief.ia.pages[0]!, id: "../orders" }],
        },
      })
    ).toThrow();
  });

  it("rejects duplicate page ids in a brief", () => {
    const duplicated = {
      ...minimalBrief,
      ia: {
        ...minimalBrief.ia,
        pages: [minimalBrief.ia.pages[0]!, { ...minimalBrief.ia.pages[0]! }],
      },
    };
    expect(() => UiBriefSchema.parse(duplicated)).toThrow(/duplicate page id/i);
  });

  it("parses an asset manifest", () => {
    const manifest = {
      project: "demo-orders",
      profile: "b-dense",
      assets: [
        {
          id: "search",
          kind: "icon",
          library: "lucide",
          files: [{ path: "assets/icons/search.svg", format: "svg" }],
          license: "ISC",
          hash: "sha256:demo",
        },
      ],
      placeholders: [],
      complete: true,
    };
    expect(AssetManifestSchema.parse(manifest).complete).toBe(true);
  });

  it("parses findings and run state", () => {
    expect(
      FindingSchema.parse({
        id: "F-001",
        ruleId: "STATE-DEFAULT",
        severity: "blocker",
        category: "state",
        location: "states",
        evidence: "missing default",
        issue: "default state is required",
      }).severity,
    ).toBe("blocker");

    expect(
      RunStateSchema.parse({
        runId: "run-1",
        stage: "validate",
        status: "running",
        attempts: {},
        degraded: false,
        gates: { brief: "passed" },
        startedAt: "2026-10-19T00:00:00Z",
        updatedAt: "2026-10-19T00:00:00Z",
      }).stage,
    ).toBe("validate");
  });

  it("builds requirement ids", () => {
    expect(reqId("order", 7)).toBe("REQ-ORDER-007");
  });

  it("accepts shared asset briefs with M1 visual hints", () => {
    const brief = {
      id: "icon-receipt",
      kind: "icon",
      scene: "开单快捷操作",
      styleRef: "b-mobile-neutral",
      size: { width: 24, height: 24 },
      format: "svg",
      constraints: { grid: 24, currentColor: true },
      sourceChain: ["library", "ai-vector"],
      visualRef: "filled line icon, rounded 2px stroke",
      sourceHint: "lucide receipt",
    };
    expect(AssetBriefSchema.parse(brief).visualRef).toContain("filled");
    expect(() =>
      AssetBriefSchema.parse({ ...brief, unexpected: true })
    ).toThrow();
  });

  it("rejects negative token usage and invalid pricing defaults", () => {
    expect(() =>
      AgentUsageSchema.parse({
        inputTokens: -1,
        outputTokens: 1,
        cacheReadTokens: 0,
      })
    ).toThrow();
    expect(() =>
      parsePricingConfig({
        default: "missing",
        providers: {
          deepseek: {
            inputMissUsdPerMillion: 1,
            inputCacheUsdPerMillion: 0.1,
            outputUsdPerMillion: 2,
            usdToCny: 7,
          },
        },
      })
    ).toThrow(/default provider/);
  });

  it("accepts an optional prd path in project config", () => {
    const config = {
      project: "employee-app",
      brief: "ui-brief.json",
      prd: "prd.md",
      manifests: { "b-mobile": "asset-manifest.b-mobile.json" },
    };
    expect(ProjectConfigSchema.parse(config).prd).toBe("prd.md");
  });

  it("accepts role landing rules in a brief", () => {
    const brief = {
      ...minimalBrief,
      ia: {
        ...minimalBrief.ia,
        landingByRole: { admin: "orders-list" },
      },
    };
    expect(UiBriefSchema.parse(brief).ia.landingByRole).toEqual({
      admin: "orders-list",
    });
  });

  it("accepts interaction node ids and page motion", () => {
    const spec = {
      ...minimalPageSpec,
      interactions: [
        {
          trigger: "库存查询",
          action: "打开库存查询页",
          target: "/inventory",
          nodeId: "quick-inventory",
        },
      ],
      motion: {
        presets: { "page-enter": { durationMs: 200, easing: "ease-out" } },
        bindings: [{ nodeId: "quick-inventory", preset: "page-enter" }],
        reducedMotion: { fallback: "fade" },
      },
    };
    const parsed = PageSpecSchema.parse(spec);
    expect(parsed.interactions[0]?.nodeId).toBe("quick-inventory");
    expect(parsed.motion?.bindings[0]?.preset).toBe("page-enter");
    expect(PageSpecSchema.parse(minimalPageSpec)).not.toHaveProperty("motion");
  });
});

describe("action refs", () => {
  it("accepts namespaced ids with labels", async () => {
    const { ActionRefSchema } = await import("../src/index.js");
    expect(
      ActionRefSchema.safeParse({ id: "appointment.reschedule", label: "改期" }).success
    ).toBe(true);
    expect(
      ActionRefSchema.safeParse({
        id: "appointment.reschedule",
        label: "调整时间",
        placement: "footer",
      }).success
    ).toBe(true);
  });

  it("rejects non-namespaced or non-ascii ids", async () => {
    const { ActionRefSchema } = await import("../src/index.js");
    expect(ActionRefSchema.safeParse({ id: "改期", label: "改期" }).success).toBe(false);
    expect(ActionRefSchema.safeParse({ id: "Reschedule", label: "改期" }).success).toBe(false);
    expect(ActionRefSchema.safeParse({ id: "appointment", label: "改期" }).success).toBe(false);
  });

  it("rejects legacy string actions in a brief", () => {
    const page = {
      ...minimalBrief.ia.pages[0]!,
      actions: ["保存"],
    };
    const result = UiBriefSchema.safeParse({
      ...minimalBrief,
      ia: { ...minimalBrief.ia, pages: [page] },
    });
    expect(result.success).toBe(false);
  });
});
