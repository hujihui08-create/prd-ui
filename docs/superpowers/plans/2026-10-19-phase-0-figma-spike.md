# Phase 0 · Figma 可行性 Spike 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用同一份 Page Spec fixture，分别渲染成 React HTML 和原生 Figma 图层，验证 Figma 写回、中文字体、嵌套 Auto Layout、变量、文本样式、组件变体、图标和图片填充是否可行，给出 go/no-go 结论。

**Architecture:** 纯 TypeScript 的 plan compiler 把 Page Spec + Profile 编译成 `FigmaPlan`；Figma 插件消费 `FigmaPlan` 构建原生节点；React/Vite 消费同一份 Page Spec 渲染 HTML；Playwright 检查 HTML 布局；Figma 由人工清单验收。两者截图对比，写入 spike report。

**Tech Stack:** TypeScript、Node 24、pnpm、Vite、React、Vitest、Playwright、Figma Plugin API、esbuild、tsx。

## Global Constraints

- Spike 代码是一次性的，不进入正式实现；验证结论才是交付物。
- 不引入外网依赖；资产本地化；Figma 插件不联网。
- TypeScript strict；所有 fixture 使用 mock 数据。
- Figma 桌面版必须打开；字体使用 Noto Sans SC，PingFang SC 作为回退。
- 每个任务以测试、构建或人工清单项结束。
- 不实现 PRD 解析、LLM Agent、设计系统全量组件；这些属于 Phase 1/2。
- 工作目录：`/Users/jihui/Desktop/产品、ui/spike`。

## 文件结构

```
spike/
  package.json
  tsconfig.json
  vitest.config.ts
  playwright.config.ts
  spec/
    page-spec.b-end.json
    page-spec.c-end.json
    profile.b-dense.json
    profile.c-expressive.json
    figma-plan.b-end.json        # 由 pnpm plan 生成
    figma-plan.c-end.json
  plan/
    types.ts
    compile-plan.ts
    compile-plan.test.ts
    build-plans.ts
  html/
    index.html
    vite.config.ts
    src/
      main.tsx
      App.tsx
      tokens.css
      components.tsx
    tests/
      smoke.spec.ts
  figma-plugin/
    manifest.json
    package.json
    tsconfig.json
    esbuild.config.mjs
    src/
      code.ts
    dist/                        # 构建产物
  artifacts/                     # 截图与报告证据
  report.md
```

---

### Task 1: 搭建 spike 工作区

**Files:**
- Create: `spike/package.json`
- Create: `spike/tsconfig.json`
- Create: `spike/vitest.config.ts`
- Test: `spike/tests/smoke.test.ts`

**Interfaces:**
- Produces: 可运行的 `pnpm test`、`pnpm plan`、`pnpm build:html`、`pnpm build:figma`。

- [ ] **Step 1: 初始化项目并安装依赖**

```bash
cd /Users/jihui/Desktop/产品、ui
# 如果目录还不是 git 仓库
git init
mkdir -p spike
cd spike
pnpm init
pnpm add react react-dom
pnpm add -D typescript tsx vitest vite @vitejs/plugin-react @playwright/test zod @types/react @types/react-dom
```

- [ ] **Step 2: 写入 `spike/package.json` 的 scripts**

```json
{
  "name": "prd-ui-spike",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "plan": "tsx plan/build-plans.ts",
    "dev:html": "vite --config html/vite.config.ts",
    "build:html": "vite build --config html/vite.config.ts",
    "preview:html": "vite preview --config html/vite.config.ts --port 4173",
    "test:e2e": "playwright test",
    "build:figma": "pnpm plan && pnpm --dir figma-plugin build"
  }
}
```

- [ ] **Step 3: 写入 `spike/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["plan", "spec", "html/src", "tests"]
}
```

- [ ] **Step 4: 写入 `spike/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 5: 写入冒烟测试**

```ts
import { describe, expect, it } from "vitest";

describe("spike", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: 运行测试**

Run: `pnpm test`
Expected: 1 passed.

- [ ] **Step 7: 提交**

```bash
git add spike
git commit -m "chore: scaffold phase 0 spike workspace"
```

---

### Task 2: 定义 Page Spec / Profile fixture 与类型

**Files:**
- Create: `spike/plan/types.ts`
- Create: `spike/spec/page-spec.b-end.json`
- Create: `spike/spec/page-spec.c-end.json`
- Create: `spike/spec/profile.b-dense.json`
- Create: `spike/spec/profile.c-expressive.json`
- Test: `spike/spec/fixtures.test.ts`

**Interfaces:**
- Produces: `PageSpec`、`SpecNode`、`Profile`、`PlanNode`、`FigmaPlan` 类型；两份可被 HTML 与 plan compiler 共用的 fixture。

- [ ] **Step 1: 写类型**

```ts
// spike/plan/types.ts
export type Target = "web" | "mobile";

export interface SpecNode {
  type: string;
  props?: Record<string, unknown>;
  children?: SpecNode[];
}

export interface PageSpec {
  meta: {
    pageId: string;
    name: string;
    target: Target;
    profile: string;
    archetype: string;
  };
  layout: SpecNode;
}

export interface TextStyleDef {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
}

export interface Profile {
  name: string;
  color: Record<string, string>;
  space: Record<string, string>;
  radius: Record<string, string>;
  typography: Record<string, TextStyleDef>;
  components: Record<string, { variants: Record<string, { fill: string; text: string }> }>;
}

export type PlanNode =
  | {
      type: "FRAME";
      name: string;
      layout: "VERTICAL" | "HORIZONTAL";
      children: PlanNode[];
      width?: number;
      height?: number;
      padding?: number;
      gap?: number;
      fill?: string;
    }
  | {
      type: "TEXT";
      name: string;
      characters: string;
      textStyle: string;
    }
  | {
      type: "INSTANCE";
      name: string;
      component: string;
      variant?: string;
      props?: Record<string, string>;
    }
  | {
      type: "ICON";
      name: string;
      svg: string;
      size: number;
    }
  | {
      type: "IMAGE";
      name: string;
      src: string;
      width: number;
      height: number;
    };

export interface FigmaPlan {
  page: string;
  width: number;
  height: number;
  tokens: Record<string, string>;
  textStyles: Record<string, TextStyleDef>;
  components: Profile["components"];
  root: PlanNode;
}
```

- [ ] **Step 2: 写 B 端 fixture**

```json
{
  "meta": {
    "pageId": "orders-list",
    "name": "订单列表",
    "target": "web",
    "profile": "b-dense",
    "archetype": "list"
  },
  "layout": {
    "type": "PageShell",
    "props": {
      "title": "订单管理",
      "nav": ["概览", "订单", "客户", "设置"]
    },
    "children": [
      {
        "type": "Section",
        "props": { "padding": "space.6", "gap": "space.4" },
        "children": [
          {
            "type": "FilterBar",
            "props": { "placeholder": "搜索订单号 / 客户", "action": "新建订单" }
          },
          {
            "type": "DataTable",
            "props": {
              "columns": ["订单号", "客户", "金额", "状态", "创建时间"],
              "rows": 5
            }
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: 写 C 端 fixture**

```json
{
  "meta": {
    "pageId": "home-feed",
    "name": "首页",
    "target": "mobile",
    "profile": "c-expressive",
    "archetype": "feed"
  },
  "layout": {
    "type": "MobileShell",
    "props": {
      "title": "发现",
      "tabs": ["推荐", "关注", "附近", "我的"]
    },
    "children": [
      {
        "type": "ICON",
        "props": { "name": "bookmark", "size": 24 }
      },
      {
        "type": "FeedCard",
        "props": {
          "title": "周末去哪儿",
          "body": "城市周边 5 个小众目的地",
          "image": "assets/feed-1.png"
        }
      },
      {
        "type": "FeedCard",
        "props": {
          "title": "新店开业",
          "body": "手冲咖啡买一送一",
          "image": "assets/feed-2.png"
        }
      }
    ]
  }
}
```

- [ ] **Step 4: 写 B 端 profile**

```json
{
  "name": "b-dense",
  "color": {
    "surface.default": "#FFFFFF",
    "surface.subtle": "#F3F4F6",
    "text.primary": "#111827",
    "text.secondary": "#6B7280",
    "action.primary": "#030213",
    "onAction": "#FFFFFF",
    "border.subtle": "#E5E7EB"
  },
  "space": {
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "6": "24px",
    "8": "32px"
  },
  "radius": {
    "sm": "4px",
    "md": "8px",
    "lg": "12px"
  },
  "typography": {
    "heading.1": {
      "fontFamily": "Noto Sans SC",
      "fontSize": 32,
      "fontWeight": 700,
      "lineHeight": 40
    },
    "heading.2": {
      "fontFamily": "Noto Sans SC",
      "fontSize": 24,
      "fontWeight": 600,
      "lineHeight": 32
    },
    "heading.3": {
      "fontFamily": "Noto Sans SC",
      "fontSize": 18,
      "fontWeight": 600,
      "lineHeight": 26
    },
    "body.md": {
      "fontFamily": "Noto Sans SC",
      "fontSize": 14,
      "fontWeight": 400,
      "lineHeight": 20
    },
    "label.sm": {
      "fontFamily": "Noto Sans SC",
      "fontSize": 12,
      "fontWeight": 500,
      "lineHeight": 16
    }
  },
  "components": {
    "Button": {
      "variants": {
        "primary": {
          "fill": "color.action.primary",
          "text": "color.onAction"
        },
        "secondary": {
          "fill": "color.surface.default",
          "text": "color.text.primary"
        }
      }
    }
  }
}
```

- [ ] **Step 5: 写 C 端 profile**

```json
{
  "name": "c-expressive",
  "color": {
    "surface.default": "#FFFFFF",
    "surface.subtle": "#FFF1E6",
    "text.primary": "#1F2937",
    "text.secondary": "#6B7280",
    "action.primary": "#FF5A5F",
    "onAction": "#FFFFFF",
    "border.subtle": "#FDE2D2"
  },
  "space": {
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "6": "24px",
    "8": "32px"
  },
  "radius": {
    "sm": "8px",
    "md": "16px",
    "lg": "24px"
  },
  "typography": {
    "heading.1": {
      "fontFamily": "Noto Sans SC",
      "fontSize": 28,
      "fontWeight": 700,
      "lineHeight": 36
    },
    "heading.2": {
      "fontFamily": "Noto Sans SC",
      "fontSize": 22,
      "fontWeight": 600,
      "lineHeight": 30
    },
    "heading.3": {
      "fontFamily": "Noto Sans SC",
      "fontSize": 18,
      "fontWeight": 600,
      "lineHeight": 26
    },
    "body.md": {
      "fontFamily": "Noto Sans SC",
      "fontSize": 15,
      "fontWeight": 400,
      "lineHeight": 24
    },
    "label.sm": {
      "fontFamily": "Noto Sans SC",
      "fontSize": 12,
      "fontWeight": 500,
      "lineHeight": 16
    }
  },
  "components": {
    "Button": {
      "variants": {
        "primary": {
          "fill": "color.action.primary",
          "text": "color.onAction"
        },
        "secondary": {
          "fill": "color.surface.default",
          "text": "color.text.primary"
        }
      }
    }
  }
}
```

- [ ] **Step 6: 写 fixture 校验测试**

```ts
// spike/spec/fixtures.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import bSpec from "./page-spec.b-end.json";
import cSpec from "./page-spec.c-end.json";
import bProfile from "./profile.b-dense.json";
import cProfile from "./profile.c-expressive.json";
import type { SpecNode } from "../plan/types";

const SpecNodeSchema: z.ZodType<SpecNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    props: z.record(z.unknown()).optional(),
    children: z.array(SpecNodeSchema).optional(),
  })
);

const PageSpecSchema = z.object({
  meta: z.object({
    pageId: z.string(),
    name: z.string(),
    target: z.enum(["web", "mobile"]),
    profile: z.string(),
    archetype: z.string(),
  }),
  layout: SpecNodeSchema,
});

const ProfileSchema = z.object({
  name: z.string(),
  color: z.record(z.string()),
  space: z.record(z.string()),
  radius: z.record(z.string()),
  typography: z.record(
    z.object({
      fontFamily: z.string(),
      fontSize: z.number(),
      fontWeight: z.number(),
      lineHeight: z.number(),
    })
  ),
  components: z.record(
    z.object({
      variants: z.record(
        z.object({ fill: z.string(), text: z.string() })
      ),
    })
  ),
});

describe("fixtures", () => {
  it("b-end spec is valid", () => {
    expect(PageSpecSchema.parse(bSpec).meta.target).toBe("web");
  });
  it("c-end spec is valid", () => {
    expect(PageSpecSchema.parse(cSpec).meta.target).toBe("mobile");
  });
  it("profiles are valid", () => {
    expect(ProfileSchema.parse(bProfile).name).toBe("b-dense");
    expect(ProfileSchema.parse(cProfile).name).toBe("c-expressive");
  });
});
```

- [ ] **Step 7: 运行测试**

Run: `pnpm test`
Expected: 4 passed（含 Task 1 的冒烟测试）。

- [ ] **Step 8: 提交**

```bash
git add spike/plan/types.ts spike/spec
git commit -m "feat: add page spec and profile fixtures for spike"
```

---

### Task 3: 实现 plan compiler 并验证结构

**Files:**
- Create: `spike/plan/compile-plan.ts`
- Test: `spike/plan/compile-plan.test.ts`
- Create: `spike/plan/build-plans.ts`

**Interfaces:**
- Consumes: `PageSpec`、`Profile`、`PlanNode`、`FigmaPlan`。
- Produces: `compilePlan(spec: PageSpec, profile: Profile): FigmaPlan`；`pnpm plan` 生成两份 `spec/figma-plan.*.json`。

- [ ] **Step 1: 写失败测试**

```ts
// spike/plan/compile-plan.test.ts
import { describe, expect, it } from "vitest";
import bSpec from "../spec/page-spec.b-end.json";
import cSpec from "../spec/page-spec.c-end.json";
import bProfile from "../spec/profile.b-dense.json";
import cProfile from "../spec/profile.c-expressive.json";
import { compilePlan } from "./compile-plan";
import type { PageSpec, PlanNode, Profile } from "./types";

function findNode(node: PlanNode, name: string): PlanNode | undefined {
  if (node.type !== "FRAME") return undefined;
  if (node.name === name) return node;
  for (const child of node.children) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return undefined;
}

describe("compilePlan", () => {
  it("compiles the B-end page into a nested plan", () => {
    const plan = compilePlan(bSpec as PageSpec, bProfile as Profile);
    expect(plan.root.type).toBe("FRAME");
    if (plan.root.type !== "FRAME") throw new Error("root must be frame");
    expect(plan.root.layout).toBe("HORIZONTAL");

    const sidebar = findNode(plan.root, "Sidebar");
    expect(sidebar).toMatchObject({ type: "FRAME", width: 240 });

    const table = findNode(plan.root, "DataTable");
    expect(table).toBeDefined();
    if (table?.type === "FRAME") {
      expect(table.children).toHaveLength(6); // header + 5 rows
    }

    expect(plan.tokens["color.surface.default"]).toBe("#FFFFFF");
    expect(plan.tokens["space.6"]).toBe("24px");
    expect(plan.textStyles["body.md"].fontSize).toBe(14);
  });

  it("compiles the C-end page with feed cards and bottom nav", () => {
    const plan = compilePlan(cSpec as PageSpec, cProfile as Profile);
    expect(plan.root.type).toBe("FRAME");
    if (plan.root.type !== "FRAME") throw new Error("root must be frame");
    expect(plan.root.layout).toBe("VERTICAL");
    expect(plan.root.width).toBe(390);
    expect(
      plan.root.children.filter(
        (node) => node.type === "FRAME" && node.name === "FeedCard"
      )
    ).toHaveLength(2);
    expect(findNode(plan.root, "BottomNav")).toBeDefined();
    expect(findNode(plan.root, "bookmark")).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test -- plan/compile-plan.test.ts`
Expected: FAIL，提示找不到 `./compile-plan` 或 `compilePlan`。

- [ ] **Step 3: 实现 plan compiler**

```ts
// spike/plan/compile-plan.ts
import type {
  FigmaPlan,
  PageSpec,
  PlanNode,
  Profile,
  SpecNode,
} from "./types";

interface FrameOptions {
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  fill?: string;
}

interface CompileContext {
  profile: Profile;
  space: (value: unknown, fallback: string) => number;
  text: (name: string, characters: string, textStyle: string) => PlanNode;
  frame: (
    name: string,
    layout: "VERTICAL" | "HORIZONTAL",
    children: PlanNode[],
    options?: FrameOptions
  ) => PlanNode;
}

export function compilePlan(spec: PageSpec, profile: Profile): FigmaPlan {
  const ctx: CompileContext = {
    profile,
    space: (value, fallback) => {
      const key =
        typeof value === "string" && value.startsWith("space.")
          ? value.slice("space.".length)
          : fallback;
      return Number.parseInt(profile.space[key] ?? "0", 10);
    },
    text: (name, characters, textStyle) => ({
      type: "TEXT",
      name,
      characters,
      textStyle,
    }),
    frame: (name, layout, children, options = {}) => ({
      type: "FRAME",
      name,
      layout,
      children,
      ...options,
    }),
  };

  return {
    page: spec.meta.pageId,
    width: spec.meta.target === "web" ? 1440 : 390,
    height: spec.meta.target === "web" ? 900 : 844,
    tokens: {
      ...Object.fromEntries(
        Object.entries(profile.color).map(([key, value]) => [`color.${key}`, value])
      ),
      ...Object.fromEntries(
        Object.entries(profile.space).map(([key, value]) => [`space.${key}`, value])
      ),
      ...Object.fromEntries(
        Object.entries(profile.radius).map(([key, value]) => [`radius.${key}`, value])
      ),
    },
    textStyles: profile.typography,
    components: profile.components,
    root: compileNode(spec.layout, ctx),
  };
}

function compileNode(node: SpecNode, ctx: CompileContext): PlanNode {
  switch (node.type) {
    case "PageShell": {
      const nav = (node.props?.nav as string[] | undefined) ?? [
        "概览",
        "订单",
        "客户",
        "设置",
      ];
      return ctx.frame(
        "PageShell",
        "HORIZONTAL",
        [
          ctx.frame(
            "Sidebar",
            "VERTICAL",
            [
              ctx.text("Brand", "ACME", "heading.2"),
              ...nav.map((label, index) =>
                ctx.text(`Nav-${index + 1}`, label, "body.md")
              ),
            ],
            {
              width: 240,
              padding: ctx.space("space.4", "4"),
              gap: ctx.space("space.2", "2"),
              fill: "color.surface.subtle",
            }
          ),
          ctx.frame(
            "Content",
            "VERTICAL",
            [
              ctx.frame(
                "Header",
                "HORIZONTAL",
                [
                  ctx.text(
                    "PageTitle",
                    String(node.props?.title ?? "页面"),
                    "heading.2"
                  ),
                ],
                {
                  height: 64,
                  padding: ctx.space("space.6", "6"),
                  gap: ctx.space("space.2", "2"),
                  fill: "color.surface.default",
                }
              ),
              ...(node.children ?? []).map((child) => compileNode(child, ctx)),
            ],
            { fill: "color.surface.default", gap: 0 }
          ),
        ],
        {
          width: 1440,
          height: 900,
          padding: 0,
          gap: 0,
          fill: "color.surface.default",
        }
      );
    }

    case "Section":
      return ctx.frame(
        "Section",
        "VERTICAL",
        (node.children ?? []).map((child) => compileNode(child, ctx)),
        {
          padding: ctx.space(node.props?.padding, "6"),
          gap: ctx.space(node.props?.gap, "4"),
          fill: "color.surface.default",
        }
      );

    case "FilterBar":
      return ctx.frame(
        "FilterBar",
        "HORIZONTAL",
        [
          ctx.frame(
            "Search",
            "HORIZONTAL",
            [
              ctx.text(
                "SearchLabel",
                String(node.props?.placeholder ?? "搜索"),
                "body.md"
              ),
            ],
            {
              width: 320,
              height: 36,
              padding: ctx.space("space.3", "3"),
              gap: ctx.space("space.2", "2"),
              fill: "color.surface.subtle",
            }
          ),
          {
            type: "INSTANCE",
            name: "CreateButton",
            component: "Button",
            variant: "primary",
            props: { label: String(node.props?.action ?? "新建") },
          },
        ],
        {
          height: 56,
          padding: 0,
          gap: ctx.space("space.3", "3"),
          fill: "color.surface.default",
        }
      );

    case "DataTable": {
      const columns =
        (node.props?.columns as string[] | undefined) ?? ["列 1", "列 2", "列 3"];
      const rows = Number(node.props?.rows ?? 3);
      const header = ctx.frame(
        "HeaderRow",
        "HORIZONTAL",
        columns.map((column, index) =>
          ctx.text(`Header-${index + 1}`, column, "label.sm")
        ),
        {
          height: 40,
          padding: ctx.space("space.3", "3"),
          gap: ctx.space("space.2", "2"),
          fill: "color.surface.subtle",
        }
      );
      const body = Array.from({ length: rows }, (_, rowIndex) =>
        ctx.frame(
          `Row-${rowIndex + 1}`,
          "HORIZONTAL",
          columns.map((_, columnIndex) =>
            ctx.text(
              `Cell-${rowIndex + 1}-${columnIndex + 1}`,
              `示例 ${rowIndex + 1}-${columnIndex + 1}`,
              "body.md"
            )
          ),
          {
            height: 44,
            padding: ctx.space("space.3", "3"),
            gap: ctx.space("space.2", "2"),
            fill: "color.surface.default",
          }
        )
      );
      return ctx.frame("DataTable", "VERTICAL", [header, ...body], {
        gap: 0,
        fill: "color.surface.default",
      });
    }

    case "MobileShell": {
      const tabs = (node.props?.tabs as string[] | undefined) ?? [
        "推荐",
        "关注",
        "我的",
      ];
      return ctx.frame(
        "MobileShell",
        "VERTICAL",
        [
          ctx.frame(
            "TopBar",
            "HORIZONTAL",
            [
              ctx.text(
                "PageTitle",
                String(node.props?.title ?? "首页"),
                "heading.1"
              ),
            ],
            {
              height: 56,
              padding: ctx.space("space.4", "4"),
              gap: ctx.space("space.2", "2"),
              fill: "color.surface.default",
            }
          ),
          ...(node.children ?? []).map((child) => compileNode(child, ctx)),
          ctx.frame(
            "BottomNav",
            "HORIZONTAL",
            tabs.map((tab, index) =>
              ctx.text(`Tab-${index + 1}`, tab, "label.sm")
            ),
            {
              height: 64,
              padding: ctx.space("space.3", "3"),
              gap: ctx.space("space.2", "2"),
              fill: "color.surface.default",
            }
          ),
        ],
        {
          width: 390,
          height: 844,
          padding: 0,
          gap: 0,
          fill: "color.surface.subtle",
        }
      );
    }

    case "ICON":
      return {
        type: "ICON",
        name: String(node.props?.name ?? "icon"),
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4h12v16l-6-4-6 4V4z"/></svg>',
        size: Number(node.props?.size ?? 24),
      };

    case "FeedCard":
      return ctx.frame(
        "FeedCard",
        "VERTICAL",
        [
          {
            type: "IMAGE",
            name: "Cover",
            src: String(node.props?.image ?? "assets/placeholder.png"),
            width: 358,
            height: 180,
          },
          ctx.text(
            "FeedTitle",
            String(node.props?.title ?? "标题"),
            "heading.3"
          ),
          ctx.text(
            "FeedBody",
            String(node.props?.body ?? "正文"),
            "body.md"
          ),
        ],
        {
          padding: ctx.space("space.4", "4"),
          gap: ctx.space("space.3", "3"),
          fill: "color.surface.default",
        }
      );

    default:
      return ctx.frame(`Unknown-${node.type}`, "VERTICAL", []);
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm test -- plan/compile-plan.test.ts`
Expected: 2 passed.

- [ ] **Step 5: 写 plan 生成脚本**

```ts
// spike/plan/build-plans.ts
import { writeFileSync } from "node:fs";
import bSpec from "../spec/page-spec.b-end.json";
import cSpec from "../spec/page-spec.c-end.json";
import bProfile from "../spec/profile.b-dense.json";
import cProfile from "../spec/profile.c-expressive.json";
import { compilePlan } from "./compile-plan";
import type { PageSpec, Profile } from "./types";

writeFileSync(
  "spec/figma-plan.b-end.json",
  JSON.stringify(
    compilePlan(bSpec as PageSpec, bProfile as Profile),
    null,
    2
  )
);
writeFileSync(
  "spec/figma-plan.c-end.json",
  JSON.stringify(
    compilePlan(cSpec as PageSpec, cProfile as Profile),
    null,
    2
  )
);

console.log("Wrote spec/figma-plan.b-end.json and spec/figma-plan.c-end.json");
```

- [ ] **Step 6: 运行生成脚本**

Run: `pnpm plan`
Expected: 输出两份 JSON 文件。

- [ ] **Step 7: 提交**

```bash
git add spike/plan spike/spec/figma-plan.*.json
git commit -m "feat: compile page specs into figma plans"
```

---

### Task 4: 用同一份 fixture 渲染 HTML

**Files:**
- Create: `spike/html/index.html`
- Create: `spike/html/vite.config.ts`
- Create: `spike/html/src/main.tsx`
- Create: `spike/html/src/App.tsx`
- Create: `spike/html/src/tokens.css`
- Create: `spike/html/src/components.tsx`

**Interfaces:**
- Consumes: `spec/page-spec.*.json`、`spec/profile.*.json`。
- Produces: `http://127.0.0.1:5173/?page=b` 和 `?page=c` 两个可打开的页面。

- [ ] **Step 1: 写 Vite 配置和入口**

```ts
// spike/html/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "html",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist-html",
    emptyOutDir: true,
  },
});
```

```html
<!-- spike/html/index.html -->
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PRD UI Spike</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// spike/html/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./tokens.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 2: 写 App 与组件**

```tsx
// spike/html/src/App.tsx
import bSpec from "../../spec/page-spec.b-end.json";
import cSpec from "../../spec/page-spec.c-end.json";
import bProfile from "../../spec/profile.b-dense.json";
import cProfile from "../../spec/profile.c-expressive.json";
import { renderSpec } from "./components";

const pages = {
  b: { spec: bSpec, profile: bProfile },
  c: { spec: cSpec, profile: cProfile },
};

export default function App() {
  const key = new URLSearchParams(window.location.search).get("page") === "c" ? "c" : "b";
  const { spec, profile } = pages[key];
  return <div data-profile={profile.name}>{renderSpec(spec.layout)}</div>;
}
```

```tsx
// spike/html/src/components.tsx
import { Fragment, type ReactNode } from "react";
import type { SpecNode } from "../../plan/types";

function PageShell({ title, nav = [], children }: any) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">ACME</div>
        {nav.map((item: string) => (
          <div className="nav-item" key={item}>
            {item}
          </div>
        ))}
      </aside>
      <main className="content">
        <header className="header">
          <h1>{title}</h1>
        </header>
        {children}
      </main>
    </div>
  );
}

function Section({ children }: any) {
  return <section className="section">{children}</section>;
}

function FilterBar({ placeholder, action }: any) {
  return (
    <div className="filter-bar">
      <div className="search">{placeholder}</div>
      <button className="primary-button">{action}</button>
    </div>
  );
}

function DataTable({ columns, rows = 3 }: any) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((column: string) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, rowIndex) => (
          <tr key={rowIndex}>
            {columns.map((column: string) => (
              <td key={column}>
                示例 {rowIndex + 1}-{column}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MobileShell({ title, tabs = [], children }: any) {
  return (
    <div className="mobile-shell">
      <header className="mobile-header">
        <h1>{title}</h1>
      </header>
      <main className="mobile-content">{children}</main>
      <nav className="bottom-nav">
        {tabs.map((tab: string) => (
          <div key={tab}>{tab}</div>
        ))}
      </nav>
    </div>
  );
}

function FeedCard({ title, body }: any) {
  return (
    <article className="feed-card">
      <div className="cover" />
      <h2>{title}</h2>
      <p>{body}</p>
    </article>
  );
}

function Icon({ name }: any) {
  return (
    <svg
      className="icon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-label={name}
    >
      <path d="M6 4h12v16l-6-4-6 4V4z" />
    </svg>
  );
}

const registry: Record<string, (props: any) => ReactNode> = {
  PageShell,
  Section,
  FilterBar,
  DataTable,
  MobileShell,
  FeedCard,
  ICON: Icon,
};

export function renderSpec(node: SpecNode): ReactNode {
  const Component = registry[node.type];
  if (!Component) return null;
  const children = node.children?.map((child, index) => (
    <Fragment key={index}>{renderSpec(child)}</Fragment>
  ));
  return <Component {...(node.props ?? {})}>{children}</Component>;
}
```

- [ ] **Step 3: 写 token 与样式**

```css
/* spike/html/src/tokens.css */
:root {
  font-family: "Noto Sans SC", "PingFang SC", system-ui, sans-serif;
  color: var(--fg);
  background: var(--bg);
}

[data-profile="b-dense"] {
  --bg: #ffffff;
  --fg: #111827;
  --muted: #f3f4f6;
  --primary: #030213;
  --border: #e5e7eb;
  --radius: 8px;
}

[data-profile="c-expressive"] {
  --bg: #fff1e6;
  --fg: #1f2937;
  --muted: #fff7f0;
  --primary: #ff5a5f;
  --border: #fde2d2;
  --radius: 20px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.shell {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  padding: 16px;
  background: var(--muted);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.brand {
  font-weight: 700;
  margin-bottom: 8px;
}

.icon {
  display: block;
}

.nav-item {
  padding: 8px 12px;
  border-radius: 8px;
}

.content {
  flex: 1;
}

.header {
  height: 64px;
  padding: 0 24px;
  display: flex;
  align-items: center;
}

.section {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search {
  width: 320px;
  height: 36px;
  padding: 8px 12px;
  border-radius: var(--radius);
  background: var(--muted);
}

.primary-button {
  height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--radius);
  background: var(--primary);
  color: #fff;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
}

.data-table th,
.data-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.mobile-shell {
  width: 390px;
  min-height: 844px;
  margin: 0 auto;
  padding-bottom: 64px;
  position: relative;
  background: var(--bg);
}

.mobile-header {
  height: 56px;
  padding: 0 16px;
  display: flex;
  align-items: center;
}

.mobile-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.feed-card {
  background: #fff;
  border-radius: var(--radius);
  overflow: hidden;
}

.cover {
  height: 180px;
  background: #ddd;
}

.feed-card h2,
.feed-card p {
  margin: 12px 16px;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  width: 390px;
  height: 64px;
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: #fff;
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 4: 构建并预览**

Run: `pnpm build:html && pnpm preview:html`
Expected: 构建成功；浏览器打开 `http://127.0.0.1:4173/?page=b` 和 `?page=c` 均有内容。

- [ ] **Step 5: 提交**

```bash
git add spike/html
git commit -m "feat: render both page specs as html"
```

---

### Task 5: 用 Playwright 验证 HTML 布局

**Files:**
- Create: `spike/playwright.config.ts`
- Test: `spike/html/tests/smoke.spec.ts`

**Interfaces:**
- Consumes: HTML build。
- Produces: `artifacts/b-end.png`、`artifacts/c-end.png`；无控制台错误、无横向溢出。

- [ ] **Step 1: 写 Playwright 配置**

```ts
// spike/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./html/tests",
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command: "pnpm preview:html",
    port: 4173,
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 2: 写测试**

```ts
// spike/html/tests/smoke.spec.ts
import { expect, test } from "@playwright/test";

test("b-end page has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?page=b");
  await expect(page.getByText("订单管理")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: "artifacts/b-end.png", fullPage: true });
});

test("c-end page keeps bottom nav visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?page=c");
  await expect(page.getByText("发现")).toBeVisible();
  await expect(page.locator(".bottom-nav")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: "artifacts/c-end.png", fullPage: true });
});
```

- [ ] **Step 3: 安装 Chromium 并运行**

Run:

```bash
mkdir -p artifacts
pnpm exec playwright install chromium && pnpm test:e2e
```

Expected: 2 passed；`artifacts/` 下生成两张截图。

- [ ] **Step 4: 提交**

```bash
git add spike/playwright.config.ts spike/html/tests spike/artifacts
git commit -m "test: add playwright layout checks for spike pages"
```

---

### Task 6: 搭建并构建 Figma 插件

**Files:**
- Create: `spike/figma-plugin/manifest.json`
- Create: `spike/figma-plugin/package.json`
- Create: `spike/figma-plugin/tsconfig.json`
- Create: `spike/figma-plugin/esbuild.config.mjs`
- Create: `spike/figma-plugin/src/code.ts`
- Create: `spike/figma-plugin/README.md`

**Interfaces:**
- Consumes: `spec/figma-plan.b-end.json`、`spec/figma-plan.c-end.json`。
- Produces: `figma-plugin/dist/code.js`，可在 Figma 桌面版中作为开发插件导入。

- [ ] **Step 1: 写插件 manifest 与包配置**

```json
{
  "name": "PRD UI Spike",
  "api": "1.0.0",
  "main": "dist/code.js",
  "editorType": ["figma"],
  "documentAccess": "dynamic-page"
}
```

```json
{
  "name": "prd-ui-spike-figma",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node esbuild.config.mjs"
  },
  "devDependencies": {
    "@figma/plugin-typings": "^1.100.0",
    "esbuild": "^0.28.0",
    "typescript": "^5.7.0"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "types": ["@figma/plugin-typings"],
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

```js
// spike/figma-plugin/esbuild.config.mjs
import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/code.ts"],
  bundle: true,
  outfile: "dist/code.js",
  target: "es2017",
  format: "iife",
  loader: { ".json": "json" },
});
```

- [ ] **Step 2: 写插件入口**

```ts
// spike/figma-plugin/src/code.ts
import bPlan from "../../spec/figma-plan.b-end.json";
import cPlan from "../../spec/figma-plan.c-end.json";

type Plan = typeof bPlan;
type PlanNode = Plan["root"];

interface BuildContext {
  variables: Record<string, Variable>;
  textStyles: Record<string, TextStyle>;
  buttons: ComponentNode[];
}

const SAMPLE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3l5QAAAABJRU5ErkJggg==";

function hexToRgb(hex: string): RGB {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16) / 255,
    g: Number.parseInt(value.slice(2, 4), 16) / 255,
    b: Number.parseInt(value.slice(4, 6), 16) / 255,
  };
}

function paint(token: string, variables: Record<string, Variable>): Paint {
  const variable = variables[token];
  const color = variable ? "#D1D5DB" : token.startsWith("#") ? token : "#D1D5DB";
  const solid: SolidPaint = { type: "SOLID", color: hexToRgb(color) };
  if (!variable) return solid;
  return figma.variables.setBoundVariableForPaint(solid, "color", variable);
}

async function loadFont(family: string, style: string): Promise<FontName> {
  try {
    await figma.loadFontAsync({ family, style });
    return { family, style };
  } catch {
    const fallback: FontName = { family: "PingFang SC", style: "Regular" };
    await figma.loadFontAsync(fallback);
    return fallback;
  }
}

async function buildPlan(plan: Plan, pageName: string) {
  const page = figma.createPage();
  page.name = pageName;
  await figma.setCurrentPageAsync(page);

  const collection = figma.variables.createVariableCollection(`${pageName} Tokens`);
  const modeId = collection.modes[0].modeId;
  const variables: Record<string, Variable> = {};
  for (const [name, value] of Object.entries(plan.tokens)) {
    if (!name.startsWith("color.")) continue;
    const variable = figma.variables.createVariable(name, collection, "COLOR");
    variable.setValueForMode(modeId, { ...hexToRgb(value as string), a: 1 });
    variables[name] = variable;
  }

  const textStyles: Record<string, TextStyle> = {};
  for (const [name, style] of Object.entries(plan.textStyles)) {
    const weight = style.fontWeight >= 600 ? "SemiBold" : "Regular";
    const font = await loadFont(style.fontFamily, weight);
    const textStyle = figma.createTextStyle();
    textStyle.name = name;
    textStyle.fontName = font;
    textStyle.fontSize = style.fontSize;
    textStyle.lineHeight = { unit: "PIXELS", value: style.lineHeight };
    textStyles[name] = textStyle;
  }

  const buttons: ComponentNode[] = [];
  const variants = plan.components.Button?.variants ?? {};
  for (const [variant, style] of Object.entries(variants)) {
    const component = figma.createComponent();
    component.name = `Variant=${variant}`;
    component.layoutMode = "HORIZONTAL";
    component.primaryAxisSizingMode = "AUTO";
    component.counterAxisSizingMode = "AUTO";
    component.paddingLeft = 16;
    component.paddingRight = 16;
    component.paddingTop = 8;
    component.paddingBottom = 8;
    component.cornerRadius = 8;
    component.fills = [paint(style.fill, variables)];

    const label = figma.createText();
    label.fontName = await loadFont("Noto Sans SC", "Regular");
    label.characters = "按钮";
    label.fills = [paint(style.text, variables)];
    component.appendChild(label);
    buttons.push(component);
  }
  if (buttons.length > 0) {
    const set = figma.combineAsVariants(buttons, page);
    set.name = "Button";
  }

  const context: BuildContext = { variables, textStyles, buttons };
  const root = await buildNode(plan.root, context);
  page.appendChild(root);
  figma.viewport.scrollAndZoomIntoView([root]);
  return root;
}

async function buildNode(node: PlanNode, context: BuildContext): Promise<SceneNode> {
  switch (node.type) {
    case "FRAME": {
      const frame = figma.createFrame();
      frame.name = node.name;
      frame.layoutMode = node.layout;
      frame.itemSpacing = node.gap ?? 0;
      const padding = node.padding ?? 0;
      frame.paddingTop = padding;
      frame.paddingBottom = padding;
      frame.paddingLeft = padding;
      frame.paddingRight = padding;
      if (node.width) frame.resize(node.width, node.height ?? 100);
      if (node.height && !node.width) frame.resize(frame.width, node.height);
      if (node.fill) frame.fills = [paint(node.fill, context.variables)];
      for (const child of node.children) {
        frame.appendChild(await buildNode(child, context));
      }
      return frame;
    }

    case "TEXT": {
      const text = figma.createText();
      text.name = node.name;
      const style = context.textStyles[node.textStyle];
      if (style) text.fontName = style.fontName;
      text.characters = node.characters;
      if (style) text.textStyleId = style.id;
      return text;
    }

    case "INSTANCE": {
      const variant = node.variant ?? "primary";
      const component =
        context.buttons.find((item) => item.name === `Variant=${variant}`) ??
        context.buttons[0];
      if (!component) throw new Error("Button component not found");
      const instance = component.createInstance();
      instance.name = node.name;
      return instance;
    }

    case "ICON": {
      const icon = figma.createNodeFromSvg(node.svg);
      icon.name = node.name;
      return icon;
    }

    case "IMAGE": {
      const rectangle = figma.createRectangle();
      rectangle.name = node.name;
      rectangle.resize(node.width, node.height);
      const image = figma.createImage(figma.base64Decode(SAMPLE_PNG));
      rectangle.fills = [
        { type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" },
      ];
      return rectangle;
    }
  }
}

async function main() {
  await buildPlan(bPlan, "Spike B");
  await buildPlan(cPlan, "Spike C");
  figma.closePlugin("Spike pages built");
}

main().catch((error: unknown) => {
  console.error(error);
  figma.closePlugin(`Spike failed: ${(error as Error).message}`);
});
```

- [ ] **Step 3: 写插件使用说明**

```md
<!-- spike/figma-plugin/README.md -->
# PRD UI Spike Figma Plugin

1. 在 `spike` 目录运行 `pnpm build:figma`。
2. 打开 Figma 桌面版，新建一个文件。
3. 菜单：Plugins → Development → Import plugin from manifest…
4. 选择 `spike/figma-plugin/manifest.json`。
5. 运行插件，检查是否生成 `Spike B` 和 `Spike C` 两个页面。
```

- [ ] **Step 4: 安装依赖并构建**

Run:

```bash
cd spike/figma-plugin
pnpm install
cd ..
pnpm build:figma
```

Expected: `figma-plugin/dist/code.js` 存在；无构建错误。

- [ ] **Step 5: 提交**

```bash
git add spike/figma-plugin
git commit -m "feat: add figma spike plugin that builds both plans"
```

---

### Task 7: 人工验收 Figma 产物并记录证据

**Files:**
- Create: `spike/artifacts/figma/notes.md`

**Interfaces:**
- Consumes: Figma 插件构建结果。
- Produces: 每项检查的证据（截图/说明）；go/no-go 判断依据。

- [ ] **Step 1: 在 Figma 中导入并运行插件**

按 `spike/figma-plugin/README.md` 操作。

- [ ] **Step 2: 逐项检查并截图**

| # | 检查项 | 通过标准 | 证据 |
|---|---|---|---|
| 1 | 页面创建 | 出现 `Spike B`、`Spike C` 两个页面 | 页面列表截图 |
| 2 | 嵌套 Auto Layout | PageShell 横向；Sidebar 240；Content 填充；Section/DataTable 嵌套纵向 | 图层面板 + 画布截图 |
| 3 | 中文字体 | `订单管理`、`发现` 等中文正常显示，无豆腐块 | 画布截图 |
| 4 | 变量 | 每个页面有颜色变量集合；填充绑定变量 | 变量面板截图 |
| 5 | 文本样式 | `heading.1/2/3`、`body.md`、`label.sm` 已创建并被文本使用 | 文本样式面板 + 文本属性截图 |
| 6 | 组件变体 | `Button` 组件集含 `primary`/`secondary`；CreateButton 是实例 | 组件面板 + 实例截图 |
| 7 | 图标 | 若 fixture 含 ICON，节点为矢量且可编辑 | 图层截图 |
| 8 | 图片填充 | FeedCard 封面为 IMAGE 填充 | 填充面板截图 |
| 9 | HTML/Figma 一致性 | 两边的布局、字号层级、间距节奏肉眼接近 | 并排截图 |

- [ ] **Step 3: 记录失败项**

任何一项失败，记录到 `spike/artifacts/figma/notes.md`：节点路径、错误信息、Figma 截图、复现步骤。不要口头描述「大概不行」。

- [ ] **Step 4: 提交证据**

```bash
mkdir -p spike/artifacts/figma
# 将截图放入 spike/artifacts/figma/
git add spike/artifacts/figma
git commit -m "docs: add figma spike acceptance evidence"
```

---

### Task 8: 写 spike report 并给出 go/no-go

**Files:**
- Create: `spike/report.md`

**Interfaces:**
- Consumes: Task 3 的 plan、Task 5 的 HTML 截图、Task 7 的 Figma 截图与 `notes.md`。
- Produces: 明确的 go/no-go 结论和下一步建议。

- [ ] **Step 1: 写报告**

```md
# Phase 0 Figma Spike Report

## 环境
- macOS / Node 24 / pnpm / Figma Desktop
- 字体：Noto Sans SC，PingFang SC 回退

## 验证范围
- 同一份 Page Spec fixture → HTML 与 Figma
- 嵌套 Auto Layout、变量、文本样式、组件变体、中文、图片填充

## 结果

| 检查项 | 结果 | 证据 | 备注 |
|---|---|---|---|
| 页面创建 | pass/fail | artifacts/figma/pages.png | |
| 嵌套 Auto Layout | pass/fail | artifacts/figma/layout.png | |
| 中文字体 | pass/fail | artifacts/figma/font.png | |
| 变量 | pass/fail | artifacts/figma/variables.png | |
| 文本样式 | pass/fail | artifacts/figma/text-styles.png | |
| 组件变体 | pass/fail | artifacts/figma/button.png | |
| 图标 | pass/fail | artifacts/figma/icon.png | |
| 图片填充 | pass/fail | artifacts/figma/image.png | |
| HTML/Figma 一致性 | pass/fail | artifacts/b-end.png vs artifacts/figma/b-end.png | |

## 偏差
- （逐条记录：布局差异、字体回退、变量未绑定、实例属性丢失等）

## 结论
- Go：全部关键项 pass → 进入 Phase 1，按 A 路线继续。
- Conditional Go：仅非关键项失败（如图片占位）→ 进入 Phase 1，但把对应项列入风险。
- No-Go：嵌套 Auto Layout、中文字体或组件变体任一失败 → 退回 B（Plumb）或 C（HTML-first）。

## 下一步
- 若 Go/Conditional Go：编写 Phase 1 基础计划（契约、校验器、状态机、样本 PRD）。
- 若 No-Go：记录失败原因，评估 Plumb / mcp-figma 作为 Figma 渲染器替代。
```

- [ ] **Step 2: 填写实际结果与结论**

不能留空；每项必须有 pass/fail 和证据路径。

- [ ] **Step 3: 运行全量测试**

Run: `pnpm test && pnpm test:e2e`
Expected: 全部通过。

- [ ] **Step 4: 提交**

```bash
git add spike/report.md
git commit -m "docs: add phase 0 spike report and go-no-go"
```

---

## 后续计划（不在本计划内）

Phase 0 通过后，按以下顺序单独出计划：

1. **Phase 1 · 基础**：`@prd-ui/contracts`（Zod 契约）、现有设计系统接入（code/figma/docs/screenshots adapter + 事实源对账 + Snapshot）、缺口基线、8 个 Archetype、Validators、状态机、样本 PRD。出口：样本 PRD → Page Spec 通过全部校验。
2. **Phase 2 · 垂直切片**：PRD Review Gate、UI Brief、Spec Engineer（LLM）、HTML Renderer、Asset Compiler、Studio。出口：真实 PRD 生成 6–8 页 HTML。
3. **Phase 3 · Figma + 沙箱**：正式 Figma Renderer（插件、scratch 回读、结构 diff）、测试 Subagent、Handoff。出口：交付包完整。
4. **Phase 4 · 验收**：真实项目走查、修复、文档、用户签核。

## Self-Review

- **Spec coverage**：Phase 0 覆盖设计文档中的 Figma 写回、中文、嵌套 Auto Layout、变量、文本样式、组件变体、图标、图片填充、HTML 同源渲染、沙箱基础（Playwright）和 go/no-go。PRD Review、UI Brief、两套库全量组件、Studio 属于 Phase 1/2/3，不在本计划。
- **Placeholder scan**：无 TBD/TODO；所有代码步骤包含可执行代码；人工检查项有明确通过标准和证据路径。
- **Type consistency**：`PageSpec`、`Profile`、`PlanNode`、`FigmaPlan` 在 Task 2 定义；Task 3 的 `compilePlan`、Task 4 的 `renderSpec`、Task 6 的 `Plan`/`PlanNode` 使用同一字段名；`textStyles`、`components`、`tokens` 命名一致。
