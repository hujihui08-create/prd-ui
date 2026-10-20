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
});
