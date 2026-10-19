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
});
