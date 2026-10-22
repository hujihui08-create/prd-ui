import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import {
  UiBriefSchema,
  type AssetBrief,
  type PageSpec,
  type UiBrief,
} from "@prd-ui/contracts";
import type { InteractionSpec, MotionSpec } from "@prd-ui/agents";
import type { SpecEngineerInput } from "../src/index.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export const employeeBrief: UiBrief = UiBriefSchema.parse(
  JSON.parse(
    readFileSync(
      path.join(
        pipelineRoot,
        "samples",
        "projects",
        "employee-app",
        "ui-brief.json"
      ),
      "utf8"
    )
  )
);

export const baseSpecs: PageSpec[] = compileProject(employeeBrief, {
  getProfile,
  getCatalog,
  getArchetype,
});

export const interactionSpec: InteractionSpec = {
  pages: [
    {
      id: "today",
      transitions: [
        {
          from: "today",
          to: "inventory-query",
          trigger: "点击库存查询",
        },
      ],
      triggers: [
        {
          nodeId: "quick-inventory",
          action: "库存查询",
          reaction: "打开库存查询页",
        },
      ],
      states: {
        default: ["门店顶栏", "库存快捷操作", "预约列表"],
        loading: ["骨架屏"],
        empty: ["今天没有预约"],
        error: ["错误说明", "重试按钮"],
      },
      focusOrder: ["quick-inventory", "appointments"],
      keyboard: [],
      destructiveActions: [],
    },
    {
      id: "inventory-query",
      transitions: [
        {
          from: "inventory-query",
          to: "today",
          trigger: "返回今日",
        },
      ],
      triggers: [],
      states: {
        default: ["搜索栏", "产品列表"],
        loading: ["列表骨架"],
        empty: ["没有匹配的产品"],
        error: ["错误说明", "重试按钮"],
      },
      focusOrder: ["search", "product-list"],
      keyboard: [],
      destructiveActions: [],
    },
  ],
};

export const motionSpec: MotionSpec = {
  presets: {
    "page-enter": { durationMs: 200, easing: "standard" },
    "list-stagger": { durationMs: 120, easing: "standard", staggerMs: 24 },
    "empty-fade": { durationMs: 320, easing: "emphasized" },
  },
  bindings: [
    { pageId: "today", nodeId: "quick-inventory", preset: "page-enter" },
    { pageId: "today", nodeId: "appointments", preset: "list-stagger" },
    { pageId: "inventory-query", nodeId: "empty-state", preset: "empty-fade" },
  ],
  tokens: {
    duration: { fast: "120ms", normal: "200ms", slow: "320ms" },
    easing: {
      standard: "ease-out",
      emphasized: "cubic-bezier(0.2, 0, 0, 1)",
    },
  },
  reducedMotion: { fallback: "fade" },
};

function iconBrief(id: string): AssetBrief {
  return {
    id,
    kind: "icon",
    scene: `${id} scene`,
    styleRef: "employee-app/b-mobile-neutral",
    size: { width: 24, height: 24 },
    format: "svg",
    constraints: { grid: 24, currentColor: true, noText: true },
    sourceChain: ["library"],
  };
}

export const assetBriefs: AssetBrief[] = [
  iconBrief("icon-package"),
  iconBrief("icon-plus"),
];

export function makeInput(
  overrides: Partial<SpecEngineerInput> = {}
): SpecEngineerInput {
  return {
    runId: "spec-run-test",
    project: employeeBrief.meta.project,
    agentRunId: "m1-run-test",
    brief: employeeBrief,
    baseSpecs,
    interactionSpec,
    motionSpec,
    assetBriefs,
    generatedAt: "2026-10-20T00:00:00.000Z",
    ...overrides,
  };
}
