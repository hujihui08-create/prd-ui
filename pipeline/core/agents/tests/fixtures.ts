import type { UiBrief } from "@prd-ui/contracts";

/** Two-page employee-app slice used by core/agents tests. */
export const employeeBrief: UiBrief = {
  meta: {
    project: "employee-app",
    version: "0.1.0",
    sourcePrdHash: "sha256:employee-app-slice",
    date: "2026-10-20",
    profile: "b-mobile",
    platforms: ["mobile"],
  },
  product: {
    name: "员工端",
    type: "b-end-mobile",
    goals: ["完成今日接待"],
    users: ["美容师"],
    roles: ["beautician"],
    scope: ["今日", "库存查询"],
    nonGoals: [],
    successMetrics: ["看清预约"],
  },
  ia: {
    pages: [
      {
        id: "today",
        name: "今日",
        purpose: "查看当天预约",
        archetype: "home",
        target: "mobile",
        profile: "b-mobile",
        route: "/today",
        roles: ["beautician"],
        requiredStates: ["default", "empty", "loading", "error"],
        reqRefs: ["REQ-EMP-001"],
        actions: ["开单", "预约"],
      },
      {
        id: "inventory-query",
        name: "库存查询",
        purpose: "查看库存",
        archetype: "inventory-list",
        target: "mobile",
        profile: "b-mobile",
        route: "/inventory",
        roles: ["beautician"],
        requiredStates: ["default", "empty", "loading", "error"],
        reqRefs: ["REQ-EMP-002"],
      },
    ],
    navigation: { primary: ["今日", "库存查询"], tabs: ["今日", "库存查询"] },
    flows: [{ id: "daily", steps: ["today", "inventory-query"] }],
  },
  data: { entities: [] },
  assets: { icons: ["receipt", "calendar"], illustrations: [], images: [] },
  designDirection: { profile: "b-mobile", density: "dense", tone: "neutral", motionLevel: "low" },
  openQuestions: [],
  assumptions: [],
  traceability: {
    reqMap: { "REQ-EMP-001": ["today"], "REQ-EMP-002": ["inventory-query"] },
    unmapped: [],
  },
};

export const iaOutput = {
  map: {
    pages: [
      {
        id: "today",
        name: "今日",
        route: "/today",
        level: 1,
        roles: ["beautician"],
        entryPoints: ["tab"],
      },
      {
        id: "inventory-query",
        name: "库存查询",
        route: "/inventory",
        level: 1,
        roles: ["beautician"],
        entryPoints: ["tab"],
      },
    ],
    navigation: { primary: ["今日", "库存查询"], tabs: ["今日", "库存查询"] },
    flows: [{ id: "daily", steps: ["today", "inventory-query"], status: "ok" }],
    crossLinks: [{ from: "today", to: "inventory-query", kind: "quick-action" }],
  },
  findings: { findings: [] },
  proposed: {},
  reviewMarkdown: "# IA review\n\nNo blockers.",
};

export const interactionOutput = {
  interactionSpec: {
    pages: [
      {
        id: "today",
        transitions: [],
        triggers: [
          { action: "开单", reaction: "打开开单流程" },
          { action: "预约", reaction: "打开预约表单" },
        ],
        states: {
          default: ["预约列表"],
          loading: ["骨架屏"],
          empty: ["今天没有预约"],
          error: ["重试入口"],
        },
        focusOrder: ["quick-actions", "appointments"],
        keyboard: [],
        destructiveActions: [],
      },
      {
        id: "inventory-query",
        transitions: [],
        triggers: [],
        states: {
          default: ["产品列表"],
          loading: ["骨架屏"],
          empty: ["没有匹配的产品"],
          error: ["重试入口"],
        },
        focusOrder: ["search", "list"],
        keyboard: [],
        destructiveActions: [],
      },
    ],
  },
  motionSpec: {
    presets: {
      "page-enter": { durationMs: 200, easing: "standard" },
    },
    bindings: [{ pageId: "today", preset: "page-enter" }],
    tokens: {
      duration: { normal: "200ms" },
      easing: { standard: "ease-out" },
    },
    reducedMotion: { fallback: "fade" },
  },
  reviewMarkdown: "# Interaction review\n\nAll actions covered.",
};

export function iconBrief(id: string, kind: "icon" | "illustration" = "icon") {
  return {
    id,
    kind,
    scene: `${id} scene`,
    styleRef: "employee-app/b-mobile-neutral",
    size: { width: 24, height: 24 },
    format: "svg" as const,
    constraints: { grid: 24 as const, currentColor: true, noText: true },
    sourceChain: ["library", "ai-vector"] as const,
  };
}

export const visualOutput = {
  visualStyle: {
    direction: {
      tone: "neutral",
      density: "dense",
      palette: ["#111827", "#FFFFFF", "#F5F6F8"],
      typography: { heading: "Noto Sans SC 16/24 600", body: "Noto Sans SC 13/18 400" },
      radius: "12px cards, 6px controls",
      motionLevel: "low",
    },
    references: [],
    constraints: ["neutral baseline until brand palette is supplied"],
    assetStrategy: {
      icons: "library",
      illustrations: "library",
      images: "placeholder",
    },
  },
  assetBriefs: [iconBrief("receipt"), iconBrief("calendar")],
};
