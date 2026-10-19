# Phase 1A · Contracts & Validators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立正式管线的第一批基础设施：版本化数据契约、两套基线设计系统、8 个页面原型、样本 PRD/UI Brief、确定性 Page Spec 编译器、7 类 Validator，以及一个可运行的 Phase 1 出口校验命令。

**Architecture:** 在 `pipeline/` 下建立独立 pnpm workspace，与 Phase 0 的 `spike/` 隔离。`packages/contracts` 提供 Zod schema 和类型；`packages/design-system` 提供 `b-dense` / `c-expressive` 两套基线；`packages/compiler` 用确定性模板把 UI Brief 编译成 Page Spec；`packages/validators` 做纯函数校验；`pipeline/orchestrator` 负责状态机、run 产物和出口校验。所有产物写入 `runs/<runId>/`，不写最终交付目录。

**Tech Stack:** TypeScript strict、Node 24、pnpm 11、Zod 4、Vitest 5、tsx。

## Global Constraints

- 工作目录：`/Users/jihui/Desktop/产品、ui/pipeline`
- 与 `spike/` 完全隔离；不要修改或复用 spike 的运行时产物。
- TypeScript strict；所有 schema 用 Zod 4；所有公共类型从 `packages/contracts` 导出。
- Page Spec 只允许语义字段：组件 ID、props、slots、token 引用、textRole、assetRef、states、reqRef、designDefault。
- 禁止原始颜色（`#hex`、`rgb()`、`hsl()`）、原始尺寸（`16px`、`1rem`）、`style`、`className`、`position: absolute`、任意 `top/left`。
- 一个产品面只用一个设计系统；同一页面禁止混用 `b-dense` 和 `c-expressive`。
- 所有 validator 是纯函数，不生成内容、不写文件。
- 所有任务以测试或构建命令结束；每个任务独立 commit。
- 不引入外网依赖；不写密钥、token、个人信息。

---

### Task 1: Workspace + `@prd-ui/contracts`

**Files:**
- Create: `pipeline/package.json`
- Create: `pipeline/pnpm-workspace.yaml`
- Create: `pipeline/tsconfig.base.json`
- Create: `pipeline/vitest.config.ts`
- Create: `pipeline/packages/contracts/package.json`
- Create: `pipeline/packages/contracts/tsconfig.json`
- Create: `pipeline/packages/contracts/src/ids.ts`
- Create: `pipeline/packages/contracts/src/page-spec.ts`
- Create: `pipeline/packages/contracts/src/profile.ts`
- Create: `pipeline/packages/contracts/src/catalog.ts`
- Create: `pipeline/packages/contracts/src/ui-brief.ts`
- Create: `pipeline/packages/contracts/src/asset-manifest.ts`
- Create: `pipeline/packages/contracts/src/findings.ts`
- Create: `pipeline/packages/contracts/src/run.ts`
- Create: `pipeline/packages/contracts/src/index.ts`
- Test: `pipeline/packages/contracts/tests/contracts.test.ts`

**Interfaces:**
- Produces: `PageSpec`, `SpecNode`, `Profile`, `Catalog`, `ComponentContract`, `UiBrief`, `UiBriefPage`, `AssetManifest`, `Finding`, `RunState` 类型和同名 Zod schema（`PageSpecSchema` 等）。
- Produces: `reqId(domain, n)`，返回 `REQ-<DOMAIN>-<NNN>`。

- [ ] **Step 1: 初始化 workspace**

```bash
cd "/Users/jihui/Desktop/产品、ui/pipeline"
pnpm init
pnpm add zod
pnpm add -D typescript tsx vitest @types/node
```

`pipeline/package.json` scripts：

```json
{
  "name": "prd-ui-pipeline",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "phase1:verify": "tsx pipeline/orchestrator/src/run-phase1.ts"
  }
}
```

`pipeline/pnpm-workspace.yaml`：

```yaml
packages:
  - "packages/*"
  - "pipeline/orchestrator"
```

`pipeline/tsconfig.base.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  }
}
```

`pipeline/vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "pipeline/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 2: 写失败测试**

`pipeline/packages/contracts/tests/contracts.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
  PageSpecSchema,
  ProfileSchema,
  CatalogSchema,
  UiBriefSchema,
  AssetManifestSchema,
  FindingSchema,
  RunStateSchema,
  reqId,
  type PageSpec,
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

describe("contracts", () => {
  it("parses a minimal page spec", () => {
    expect(PageSpecSchema.parse(minimalPageSpec).meta.pageId).toBe("orders-list");
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
    const brief = {
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
    expect(UiBriefSchema.parse(brief).ia.pages[0]?.id).toBe("orders-list");
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
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd pipeline && pnpm test`
Expected: FAIL，提示找不到 `../src/index.js`。

- [ ] **Step 4: 实现 contracts**

`src/ids.ts`：

```ts
export type ReqId = `REQ-${string}-${string}`;

export function reqId(domain: string, n: number): ReqId {
  return `REQ-${domain.toUpperCase()}-${String(n).padStart(3, "0")}`;
}
```

`src/page-spec.ts`：

```ts
import { z } from "zod";
import type { ReqId } from "./ids.js";

export type Target = "web" | "mobile";

export interface SpecNode {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  slots?: Record<string, SpecNode[]>;
  states?: string[];
  textRole?: string;
  assetRef?: string;
  reqRef?: ReqId;
  designDefault?: string;
  children?: SpecNode[];
}

const rawValuePattern = /(#[0-9a-fA-F]{3,8}\b)|\brgba?\(|\bhsla?\(|\b\d+(\.\d+)?(px|rem|em)\b/;

const SpecNodeSchema: z.ZodType<SpecNode> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1).optional(),
      type: z.string().min(1),
      props: z.record(z.string(), z.unknown()).optional(),
      slots: z.record(z.string(), z.array(SpecNodeSchema)).optional(),
      states: z.array(z.string().min(1)).optional(),
      textRole: z.string().min(1).optional(),
      assetRef: z.string().min(1).optional(),
      reqRef: z.string().regex(/^REQ-[A-Z0-9]+-\d+$/).optional(),
      designDefault: z.string().min(1).optional(),
      children: z.array(SpecNodeSchema).optional(),
    })
    .strict()
    .superRefine((node, ctx) => {
      if (JSON.stringify(node.props ?? {}).match(rawValuePattern)) {
        ctx.addIssue({ code: "custom", message: "raw color/size value is not allowed" });
      }
      if (node.props && ("style" in node.props || "className" in node.props)) {
        ctx.addIssue({ code: "custom", message: "style/className is not allowed" });
      }
      if (node.props && ("position" in node.props || "top" in node.props || "left" in node.props)) {
        ctx.addIssue({ code: "custom", message: "absolute positioning is not allowed" });
      }
    })
);

export interface PageState {
  name: string;
  description?: string;
  overrides?: Array<{ nodeId?: string; component?: string; state: string }>;
}

export interface Interaction {
  trigger: string;
  action: string;
  target?: string;
  reqRef?: ReqId;
}

export interface PageTraceability {
  reqMap: Record<string, string[]>;
  designDefaults: string[];
  unmapped: string[];
}

export interface PageSpec {
  meta: {
    pageId: string;
    project: string;
    name: string;
    target: Target;
    profile: string;
    archetype: string;
    reqRefs: ReqId[];
    version: string;
  };
  layout: SpecNode;
  states: Record<string, PageState>;
  interactions: Interaction[];
  traceability: PageTraceability;
}

export const PageSpecSchema = z
  .object({
    meta: z
      .object({
        pageId: z.string().min(1),
        project: z.string().min(1),
        name: z.string().min(1),
        target: z.enum(["web", "mobile"]),
        profile: z.string().min(1),
        archetype: z.string().min(1),
        reqRefs: z.array(z.string().regex(/^REQ-[A-Z0-9]+-\d+$/)).min(1),
        version: z.string().min(1),
      })
      .strict(),
    layout: SpecNodeSchema,
    states: z
      .record(
        z.string(),
        z
          .object({
            name: z.string().min(1),
            description: z.string().optional(),
            overrides: z
              .array(
                z
                  .object({
                    nodeId: z.string().optional(),
                    component: z.string().optional(),
                    state: z.string().min(1),
                  })
                  .strict()
              )
              .optional(),
          })
          .strict()
      )
      .refine((states) => "default" in states, { message: "default state is required" }),
    interactions: z.array(
      z
        .object({
          trigger: z.string().min(1),
          action: z.string().min(1),
          target: z.string().optional(),
          reqRef: z.string().regex(/^REQ-[A-Z0-9]+-\d+$/).optional(),
        })
        .strict()
    ),
    traceability: z
      .object({
        reqMap: z.record(z.string(), z.array(z.string())),
        designDefaults: z.array(z.string()),
        unmapped: z.array(z.string()),
      })
      .strict(),
  })
  .strict();
```

`src/profile.ts`：

```ts
import { z } from "zod";

export interface TextStyleDef {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
}

export interface Profile {
  meta: { name: string; library: string; version: string; origin: "baseline" | "imported" | "hybrid" };
  color: Record<string, string>;
  space: Record<string, string>;
  radius: Record<string, string>;
  motion: Record<string, string>;
  breakpoints: Record<string, string>;
  typography: Record<string, TextStyleDef>;
}

export const ProfileSchema = z
  .object({
    meta: z
      .object({
        name: z.string().min(1),
        library: z.string().min(1),
        version: z.string().min(1),
        origin: z.enum(["baseline", "imported", "hybrid"]),
      })
      .strict(),
    color: z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/)),
    space: z.record(z.string(), z.string().regex(/^\d+px$/)),
    radius: z.record(z.string(), z.string().regex(/^\d+px$/)),
    motion: z.record(z.string(), z.string().min(1)),
    breakpoints: z.record(z.string(), z.string().regex(/^\d+px$/)),
    typography: z.record(
      z.string(),
      z
        .object({
          fontFamily: z.string().min(1),
          fontSize: z.number().int().positive(),
          fontWeight: z.number().int().min(100).max(900),
          lineHeight: z.number().int().positive(),
        })
        .strict()
    ),
  })
  .strict();
```

`src/catalog.ts`：

```ts
import { z } from "zod";

export type Availability = "available" | "code-only" | "figma-only" | "generated" | "missing";

export interface ComponentContract {
  id: string;
  library: string;
  source: "code" | "figma" | "baseline" | "generated";
  availability: Availability;
  category: string;
  props: Record<string, { type: string; required?: boolean; enum?: string[] }>;
  variants: string[];
  states: string[];
  slots?: Record<string, { allowed: string[] }>;
  mapping?: { code?: string; figma?: string };
  rules?: string[];
  version: string;
}

export interface Catalog {
  meta: { library: string; version: string };
  components: ComponentContract[];
}

export const ComponentContractSchema = z
  .object({
    id: z.string().min(1),
    library: z.string().min(1),
    source: z.enum(["code", "figma", "baseline", "generated"]),
    availability: z.enum(["available", "code-only", "figma-only", "generated", "missing"]),
    category: z.string().min(1),
    props: z.record(
      z.string(),
      z
        .object({
          type: z.string().min(1),
          required: z.boolean().optional(),
          enum: z.array(z.string()).optional(),
        })
        .strict()
    ),
    variants: z.array(z.string()),
    states: z.array(z.string()),
    slots: z.record(z.string(), z.object({ allowed: z.array(z.string()) }).strict()).optional(),
    mapping: z.object({ code: z.string().optional(), figma: z.string().optional() }).strict().optional(),
    rules: z.array(z.string()).optional(),
    version: z.string().min(1),
  })
  .strict();

export const CatalogSchema = z
  .object({
    meta: z.object({ library: z.string().min(1), version: z.string().min(1) }).strict(),
    components: z.array(ComponentContractSchema),
  })
  .strict();
```

`src/ui-brief.ts`：

```ts
import { z } from "zod";

export interface UiBriefPage {
  id: string;
  name: string;
  purpose: string;
  archetype: string;
  target: "web" | "mobile";
  profile: string;
  route: string;
  roles: string[];
  requiredStates: string[];
  reqRefs: string[];
  fields?: string[];
  actions?: string[];
}

export interface UiBrief {
  meta: {
    project: string;
    version: string;
    sourcePrdHash: string;
    date: string;
    profile: string;
    platforms: Array<"web" | "mobile">;
  };
  product: {
    name: string;
    type: string;
    goals: string[];
    users: string[];
    roles: string[];
    scope: string[];
    nonGoals: string[];
    successMetrics: string[];
  };
  ia: {
    pages: UiBriefPage[];
    navigation: { primary: string[] };
    flows: Array<{ id: string; steps: string[] }>;
  };
  data: {
    entities: Array<{
      name: string;
      fields: Array<{ name: string; type: string; required?: boolean; enum?: string[] }>;
    }>;
  };
  assets: { icons: string[]; illustrations: string[]; images: string[] };
  designDirection: { profile: string; density: string; tone: string; motionLevel: string };
  openQuestions: Array<{ id: string; question: string; blocking: boolean }>;
  assumptions: Array<{ id: string; statement: string }>;
  traceability: { reqMap: Record<string, string[]>; unmapped: string[] };
}

export const UiBriefPageSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    purpose: z.string().min(1),
    archetype: z.string().min(1),
    target: z.enum(["web", "mobile"]),
    profile: z.string().min(1),
    route: z.string().min(1),
    roles: z.array(z.string()).min(1),
    requiredStates: z.array(z.string()).min(1),
    reqRefs: z.array(z.string().regex(/^REQ-[A-Z0-9]+-\d+$/)).min(1),
    fields: z.array(z.string()).optional(),
    actions: z.array(z.string()).optional(),
  })
  .strict();

export const UiBriefSchema = z
  .object({
    meta: z
      .object({
        project: z.string().min(1),
        version: z.string().min(1),
        sourcePrdHash: z.string().min(1),
        date: z.string().min(1),
        profile: z.string().min(1),
        platforms: z.array(z.enum(["web", "mobile"])).min(1),
      })
      .strict(),
    product: z
      .object({
        name: z.string().min(1),
        type: z.string().min(1),
        goals: z.array(z.string()),
        users: z.array(z.string()),
        roles: z.array(z.string()).min(1),
        scope: z.array(z.string()),
        nonGoals: z.array(z.string()),
        successMetrics: z.array(z.string()),
      })
      .strict(),
    ia: z
      .object({
        pages: z.array(UiBriefPageSchema).min(1),
        navigation: z.object({ primary: z.array(z.string()) }).strict(),
        flows: z.array(z.object({ id: z.string(), steps: z.array(z.string()) }).strict()),
      })
      .strict(),
    data: z
      .object({
        entities: z.array(
          z
            .object({
              name: z.string().min(1),
              fields: z.array(
                z
                  .object({
                    name: z.string().min(1),
                    type: z.string().min(1),
                    required: z.boolean().optional(),
                    enum: z.array(z.string()).optional(),
                  })
                  .strict()
              ),
            })
            .strict()
        ),
      })
      .strict(),
    assets: z
      .object({
        icons: z.array(z.string()),
        illustrations: z.array(z.string()),
        images: z.array(z.string()),
      })
      .strict(),
    designDirection: z
      .object({
        profile: z.string().min(1),
        density: z.string().min(1),
        tone: z.string().min(1),
        motionLevel: z.string().min(1),
      })
      .strict(),
    openQuestions: z.array(
      z.object({ id: z.string(), question: z.string(), blocking: z.boolean() }).strict()
    ),
    assumptions: z.array(z.object({ id: z.string(), statement: z.string() }).strict()),
    traceability: z
      .object({ reqMap: z.record(z.string(), z.array(z.string())), unmapped: z.array(z.string()) })
      .strict(),
  })
  .strict();
```

`src/asset-manifest.ts`：

```ts
import { z } from "zod";

export interface AssetEntry {
  id: string;
  kind: "icon" | "illustration" | "image";
  library?: string;
  style?: string;
  files: Array<{ path: string; scale?: number; format: string }>;
  license: string;
  hash?: string;
}

export interface AssetManifest {
  project: string;
  profile: string;
  assets: AssetEntry[];
  placeholders: string[];
  complete: boolean;
}

export const AssetManifestSchema = z
  .object({
    project: z.string().min(1),
    profile: z.string().min(1),
    assets: z.array(
      z
        .object({
          id: z.string().min(1),
          kind: z.enum(["icon", "illustration", "image"]),
          library: z.string().optional(),
          style: z.string().optional(),
          files: z.array(
            z.object({ path: z.string().min(1), scale: z.number().optional(), format: z.string().min(1) }).strict()
          ).min(1),
          license: z.string().min(1),
          hash: z.string().optional(),
        })
        .strict()
    ),
    placeholders: z.array(z.string()),
    complete: z.boolean(),
  })
  .strict();
```

`src/findings.ts`：

```ts
import { z } from "zod";

export type Severity = "blocker" | "major" | "minor" | "question";

export interface Finding {
  id: string;
  ruleId: string;
  severity: Severity;
  category: string;
  location: string;
  evidence: string;
  issue: string;
  suggestedQuestion?: string;
  owner?: string;
  confidence?: number;
}

export const FindingSchema = z
  .object({
    id: z.string().min(1),
    ruleId: z.string().min(1),
    severity: z.enum(["blocker", "major", "minor", "question"]),
    category: z.string().min(1),
    location: z.string().min(1),
    evidence: z.string().min(1),
    issue: z.string().min(1),
    suggestedQuestion: z.string().optional(),
    owner: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();
```

`src/run.ts`：

```ts
import { z } from "zod";

export type Stage = "intake" | "brief" | "compile" | "validate" | "report" | "done";
export type RunStatus = "pending" | "running" | "success" | "degraded" | "failed";
export type GateStatus = "pending" | "passed" | "failed" | "waived";

export interface RunState {
  runId: string;
  stage: Stage;
  status: RunStatus;
  attempts: Record<string, number>;
  degraded: boolean;
  gates: Record<string, GateStatus>;
  startedAt: string;
  updatedAt: string;
}

export const RunStateSchema = z
  .object({
    runId: z.string().min(1),
    stage: z.enum(["intake", "brief", "compile", "validate", "report", "done"]),
    status: z.enum(["pending", "running", "success", "degraded", "failed"]),
    attempts: z.record(z.string(), z.number().int().min(0)),
    degraded: z.boolean(),
    gates: z.record(z.string(), z.enum(["pending", "passed", "failed", "waived"])),
    startedAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
```

`src/index.ts`：

```ts
export * from "./ids.js";
export * from "./page-spec.js";
export * from "./profile.js";
export * from "./catalog.js";
export * from "./ui-brief.js";
export * from "./asset-manifest.js";
export * from "./findings.js";
export * from "./run.js";
```

`packages/contracts/package.json`：

```json
{
  "name": "@prd-ui/contracts",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": { "zod": "^4.6.7" }
}
```

`packages/contracts/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests"]
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd pipeline && pnpm test`
Expected: contracts 测试全部通过。

- [ ] **Step 6: 提交**

```bash
cd "/Users/jihui/Desktop/产品、ui"
git add pipeline/package.json pipeline/pnpm-workspace.yaml pipeline/tsconfig.base.json pipeline/vitest.config.ts pipeline/packages/contracts
git commit -m "feat: add phase 1 workspace and contracts"
```

---

### Task 2: Baseline Profiles, Catalogs, and 8 Archetypes

**Files:**
- Create: `pipeline/packages/design-system/package.json`
- Create: `pipeline/packages/design-system/tsconfig.json`
- Create: `pipeline/packages/design-system/src/profiles/b-dense.ts`
- Create: `pipeline/packages/design-system/src/profiles/c-expressive.ts`
- Create: `pipeline/packages/design-system/src/catalogs/b-dense.ts`
- Create: `pipeline/packages/design-system/src/catalogs/c-expressive.ts`
- Create: `pipeline/packages/design-system/src/archetypes.ts`
- Create: `pipeline/packages/design-system/src/index.ts`
- Test: `pipeline/packages/design-system/tests/design-system.test.ts`

**Interfaces:**
- Produces: `bDenseProfile`, `cExpressiveProfile: Profile`
- Produces: `bDenseCatalog`, `cExpressiveCatalog: Catalog`
- Produces: `archetypes: ArchetypeDef[]`；`ArchetypeDef = { id: string; target: "web" | "mobile"; requiredSlots: string[]; allowedComponents: string[]; requiredStates: string[] }`
- Produces: `getProfile(name)`, `getCatalog(name)`, `getArchetype(id)`.

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import {
  archetypes,
  bDenseCatalog,
  bDenseProfile,
  cExpressiveCatalog,
  cExpressiveProfile,
  getArchetype,
  getCatalog,
  getProfile,
} from "../src/index.js";

describe("design-system baselines", () => {
  it("provides two profiles and catalogs", () => {
    expect(getProfile("b-dense").meta.name).toBe("b-dense");
    expect(getProfile("c-expressive").meta.name).toBe("c-expressive");
    expect(getCatalog("b-dense").components.length).toBeGreaterThanOrEqual(12);
    expect(getCatalog("c-expressive").components.length).toBeGreaterThanOrEqual(12);
  });

  it("has eight archetypes", () => {
    expect(archetypes).toHaveLength(8);
    expect(archetypes.map((a) => a.id).sort()).toEqual([
      "auth",
      "detail",
      "feed",
      "form",
      "list",
      "onboarding",
      "overview",
      "settings",
    ]);
  });

  it("every allowed component exists in its catalog", () => {
    for (const archetype of archetypes) {
      const catalog = archetype.target === "web" ? bDenseCatalog : cExpressiveCatalog;
      for (const component of archetype.allowedComponents) {
        expect(catalog.components.some((c) => c.id === component)).toBe(true);
      }
    }
  });

  it("every component is available", () => {
    for (const catalog of [bDenseCatalog, cExpressiveCatalog]) {
      for (const component of catalog.components) {
        expect(component.availability).toBe("available");
      }
    }
  });

  it("gets an archetype by id", () => {
    expect(getArchetype("list").requiredSlots).toContain("content");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd pipeline && pnpm test -- packages/design-system`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 profiles**

`b-dense` 使用 spike 中的颜色/字号/间距，并补全：

```ts
import type { Profile } from "@prd-ui/contracts";

export const bDenseProfile: Profile = {
  meta: { name: "b-dense", library: "b-dense", version: "0.1.0", origin: "baseline" },
  color: {
    "surface.default": "#FFFFFF",
    "surface.subtle": "#F3F4F6",
    "surface.raised": "#FFFFFF",
    "text.primary": "#111827",
    "text.secondary": "#6B7280",
    "text.onAction": "#FFFFFF",
    "action.primary": "#030213",
    "action.secondary": "#F3F4F6",
    "status.success": "#16A34A",
    "status.warning": "#D97706",
    "status.danger": "#DC2626",
    "border.subtle": "#E5E7EB",
  },
  space: { "1": "4px", "2": "8px", "3": "12px", "4": "16px", "6": "24px", "8": "32px", "12": "48px" },
  radius: { sm: "4px", md: "8px", lg: "12px", full: "9999px" },
  motion: { fast: "120ms", normal: "200ms", slow: "320ms" },
  breakpoints: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px" },
  typography: {
    "heading.1": { fontFamily: "Noto Sans SC", fontSize: 32, fontWeight: 700, lineHeight: 40 },
    "heading.2": { fontFamily: "Noto Sans SC", fontSize: 24, fontWeight: 600, lineHeight: 32 },
    "heading.3": { fontFamily: "Noto Sans SC", fontSize: 18, fontWeight: 600, lineHeight: 26 },
    "body.md": { fontFamily: "Noto Sans SC", fontSize: 14, fontWeight: 400, lineHeight: 20 },
    "body.sm": { fontFamily: "Noto Sans SC", fontSize: 13, fontWeight: 400, lineHeight: 18 },
    "label.sm": { fontFamily: "Noto Sans SC", fontSize: 12, fontWeight: 500, lineHeight: 16 },
  },
};
```

`c-expressive` 使用 spike 中的 C 端值：

```ts
import type { Profile } from "@prd-ui/contracts";

export const cExpressiveProfile: Profile = {
  meta: { name: "c-expressive", library: "c-expressive", version: "0.1.0", origin: "baseline" },
  color: {
    "surface.default": "#FFFFFF",
    "surface.subtle": "#FFF1E6",
    "surface.raised": "#FFFFFF",
    "text.primary": "#1F2937",
    "text.secondary": "#6B7280",
    "text.onAction": "#FFFFFF",
    "action.primary": "#FF5A5F",
    "action.secondary": "#FFF1E6",
    "status.success": "#16A34A",
    "status.warning": "#D97706",
    "status.danger": "#DC2626",
    "border.subtle": "#FDE2D2",
  },
  space: { "1": "4px", "2": "8px", "3": "12px", "4": "16px", "6": "24px", "8": "32px", "12": "48px" },
  radius: { sm: "8px", md: "16px", lg: "24px", full: "9999px" },
  motion: { fast: "140ms", normal: "220ms", slow: "360ms" },
  breakpoints: { sm: "390px", md: "768px", lg: "1024px", xl: "1280px" },
  typography: {
    "heading.1": { fontFamily: "Noto Sans SC", fontSize: 28, fontWeight: 700, lineHeight: 36 },
    "heading.2": { fontFamily: "Noto Sans SC", fontSize: 22, fontWeight: 600, lineHeight: 30 },
    "heading.3": { fontFamily: "Noto Sans SC", fontSize: 18, fontWeight: 600, lineHeight: 26 },
    "body.md": { fontFamily: "Noto Sans SC", fontSize: 15, fontWeight: 400, lineHeight: 24 },
    "body.sm": { fontFamily: "Noto Sans SC", fontSize: 13, fontWeight: 400, lineHeight: 20 },
    "label.sm": { fontFamily: "Noto Sans SC", fontSize: 12, fontWeight: 500, lineHeight: 16 },
  },
};
```

- [ ] **Step 4: 实现 catalogs**

每套 catalog 至少包含以下组件，字段完整（`id/library/source/availability/category/props/variants/states/version`）：

- **b-dense（web）**：`PageShell`、`Sidebar`、`Header`、`Section`、`FilterBar`、`DataTable`、`Pagination`、`Button`、`Input`、`Select`、`FormField`、`Card`、`Stat`、`List`、`ListItem`、`Badge`、`EmptyState`、`Skeleton`、`ErrorState`、`Modal`。
- **c-expressive（mobile）**：`MobileShell`、`TopBar`、`BottomNav`、`FeedCard`、`Image`、`Card`、`Button`、`IconButton`、`Input`、`FormField`、`Avatar`、`Badge`、`List`、`ListItem`、`Tabs`、`SearchBar`、`EmptyState`、`Skeleton`、`ErrorState`、`StepIndicator`。

示例条目：

```ts
{
  id: "Button",
  library: "b-dense",
  source: "baseline",
  availability: "available",
  category: "action",
  props: {
    label: { type: "string", required: true },
    emphasis: { type: "enum", enum: ["primary", "secondary", "ghost", "danger"] },
    size: { type: "enum", enum: ["sm", "md", "lg"] },
    disabled: { type: "boolean" },
    loading: { type: "boolean" },
  },
  variants: ["primary", "secondary", "ghost", "danger"],
  states: ["default", "hover", "active", "focus", "disabled", "loading"],
  version: "0.1.0",
}
```

- [ ] **Step 5: 实现 archetypes**

```ts
import type { Target } from "@prd-ui/contracts";

export interface ArchetypeDef {
  id: string;
  target: Target;
  requiredSlots: string[];
  allowedComponents: string[];
  requiredStates: string[];
}

export const archetypes: ArchetypeDef[] = [
  {
    id: "overview",
    target: "web",
    requiredSlots: ["header", "content"],
    allowedComponents: ["PageShell", "Sidebar", "Header", "Section", "Stat", "Card", "List", "ListItem", "Skeleton", "ErrorState"],
    requiredStates: ["default", "loading", "error"],
  },
  {
    id: "list",
    target: "web",
    requiredSlots: ["header", "content", "table"],
    allowedComponents: ["PageShell", "Sidebar", "Header", "Section", "FilterBar", "DataTable", "Pagination", "Button", "EmptyState", "Skeleton", "ErrorState"],
    requiredStates: ["default", "empty", "loading", "error"],
  },
  {
    id: "detail",
    target: "web",
    requiredSlots: ["header", "summary", "fields", "actions"],
    allowedComponents: ["PageShell", "Sidebar", "Header", "Section", "Card", "List", "ListItem", "Badge", "Button", "Skeleton", "ErrorState"],
    requiredStates: ["default", "loading", "error"],
  },
  {
    id: "form",
    target: "web",
    requiredSlots: ["header", "fields", "actions"],
    allowedComponents: ["PageShell", "Sidebar", "Header", "Section", "FormField", "Input", "Select", "Button", "ErrorState"],
    requiredStates: ["default", "loading", "error", "disabled"],
  },
  {
    id: "settings",
    target: "web",
    requiredSlots: ["header", "groups", "actions"],
    allowedComponents: ["PageShell", "Sidebar", "Header", "Section", "Card", "FormField", "Input", "Select", "Button", "ErrorState"],
    requiredStates: ["default", "loading", "error"],
  },
  {
    id: "feed",
    target: "mobile",
    requiredSlots: ["header", "feed", "bottom-nav"],
    allowedComponents: ["MobileShell", "TopBar", "FeedCard", "Image", "Card", "BottomNav", "Skeleton", "EmptyState", "ErrorState"],
    requiredStates: ["default", "empty", "loading", "error"],
  },
  {
    id: "auth",
    target: "mobile",
    requiredSlots: ["title", "fields", "actions"],
    allowedComponents: ["MobileShell", "FormField", "Input", "Button", "ErrorState"],
    requiredStates: ["default", "loading", "error", "disabled"],
  },
  {
    id: "onboarding",
    target: "mobile",
    requiredSlots: ["illustration", "title", "body", "actions"],
    allowedComponents: ["MobileShell", "Image", "Button", "StepIndicator", "Skeleton", "ErrorState"],
    requiredStates: ["default", "loading", "error"],
  },
];
```

- [ ] **Step 6: index + getters**

```ts
import type { Catalog, Profile } from "@prd-ui/contracts";
import { bDenseProfile } from "./profiles/b-dense.js";
import { cExpressiveProfile } from "./profiles/c-expressive.js";
import { bDenseCatalog } from "./catalogs/b-dense.js";
import { cExpressiveCatalog } from "./catalogs/c-expressive.js";

export { bDenseProfile, cExpressiveProfile, bDenseCatalog, cExpressiveCatalog };
export { archetypes, type ArchetypeDef } from "./archetypes.js";

const profiles: Record<string, Profile> = {
  "b-dense": bDenseProfile,
  "c-expressive": cExpressiveProfile,
};
const catalogs: Record<string, Catalog> = {
  "b-dense": bDenseCatalog,
  "c-expressive": cExpressiveCatalog,
};

export function getProfile(name: string): Profile {
  const profile = profiles[name];
  if (!profile) throw new Error(`Unknown profile: ${name}`);
  return profile;
}

export function getCatalog(name: string): Catalog {
  const catalog = catalogs[name];
  if (!catalog) throw new Error(`Unknown catalog: ${name}`);
  return catalog;
}

export function getArchetype(id: string): ArchetypeDef {
  const archetype = archetypes.find((a) => a.id === id);
  if (!archetype) throw new Error(`Unknown archetype: ${id}`);
  return archetype;
}
```

`packages/design-system/package.json`：

```json
{
  "name": "@prd-ui/design-system",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": { "@prd-ui/contracts": "workspace:*" }
}
```

- [ ] **Step 7: 运行测试**

Run: `cd pipeline && pnpm test -- packages/design-system`
Expected: 全部通过。

- [ ] **Step 8: 提交**

```bash
git add pipeline/packages/design-system
git commit -m "feat: add baseline design systems and archetypes"
```

---

### Task 3: Sample PRD + UI Brief (8 pages)

**Files:**
- Create: `pipeline/samples/sample-prd.md`
- Create: `pipeline/samples/ui-brief.sample.json`
- Test: `pipeline/packages/design-system/tests/sample-brief.test.ts`（或 contracts 测试中）

**Interfaces:**
- Produces: 一份可通过 `UiBriefSchema` 的 `ui-brief.sample.json`，覆盖 8 个页面。
- Produces: 一份带 `REQ-ORDER-*` 编号的 sample PRD，用于追溯测试。

- [ ] **Step 1: 写 sample PRD**

内容必须包含：业务范围、角色权限、页面清单、状态矩阵、字段表、验收示例、需求编号。页面矩阵：

| 平台 | 页面 id | 原型 | 必填状态 |
|---|---|---|---|
| web | orders-overview | overview | default, loading, error |
| web | orders-list | list | default, empty, loading, error |
| web | order-detail | detail | default, loading, error |
| web | order-form | form | default, loading, error, disabled |
| web | settings | settings | default, loading, error |
| mobile | home-feed | feed | default, empty, loading, error |
| mobile | item-detail | detail | default, loading, error |
| mobile | auth | auth | default, loading, error, disabled |

角色：`admin`、`operator`、`viewer`。字段表：Order（orderNo/customer/amount/status/createdAt）、Customer（name/phone/email）、Settings（notifications/language/timezone）。需求编号 `REQ-ORDER-001` 至 `REQ-ORDER-008`，每页至少一个。

- [ ] **Step 2: 写 UI Brief**

`ui-brief.sample.json` 的 `ia.pages` 使用上表；每页包含 `purpose`、`archetype`、`target`、`profile`、`route`、`roles`、`requiredStates`、`reqRefs`、`fields`、`actions`。`assets` 包含 icons `search/filter/plus/chevron/user/bell`，illustrations `empty-orders`，images 空。`traceability.reqMap` 覆盖 8 个 REQ；`unmapped` 为空。

- [ ] **Step 3: 写测试**

```ts
import { describe, expect, it } from "vitest";
import { UiBriefSchema } from "@prd-ui/contracts";
import brief from "../../../samples/ui-brief.sample.json";

describe("sample ui brief", () => {
  it("is valid and has 8 pages", () => {
    const parsed = UiBriefSchema.parse(brief);
    expect(parsed.ia.pages).toHaveLength(8);
    expect(parsed.ia.pages.map((p) => p.id).sort()).toEqual([
      "auth",
      "home-feed",
      "item-detail",
      "order-detail",
      "order-form",
      "orders-list",
      "orders-overview",
      "settings",
    ]);
  });

  it("has no blocking open questions", () => {
    expect(brief.openQuestions.filter((q) => q.blocking)).toHaveLength(0);
  });

  it("maps every requirement", () => {
    expect(Object.keys(brief.traceability.reqMap)).toHaveLength(8);
    expect(brief.traceability.unmapped).toEqual([]);
  });
});
```

- [ ] **Step 4: 运行测试并提交**

Run: `cd pipeline && pnpm test -- sample-brief`
Expected: PASS.

```bash
git add pipeline/samples pipeline/packages/design-system/tests/sample-brief.test.ts
git commit -m "feat: add sample prd and eight-page ui brief"
```

---

### Task 4: Deterministic Page Spec Compiler

**Files:**
- Create: `pipeline/packages/compiler/package.json`
- Create: `pipeline/packages/compiler/tsconfig.json`
- Create: `pipeline/packages/compiler/src/compile-page-spec.ts`
- Create: `pipeline/packages/compiler/src/compile-project.ts`
- Create: `pipeline/packages/compiler/src/index.ts`
- Test: `pipeline/packages/compiler/tests/compiler.test.ts`

**Interfaces:**
- Consumes: `UiBrief`, `UiBriefPage`, `Profile`, `Catalog`, `ArchetypeDef`, `PageSpec`。
- Produces: `compilePageSpec(input: { brief: UiBrief; page: UiBriefPage; profile: Profile; catalog: Catalog; archetype: ArchetypeDef }): PageSpec`。
- Produces: `compileProject(brief: UiBrief, deps: { getProfile; getCatalog; getArchetype }): PageSpec[]`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { UiBriefSchema } from "@prd-ui/contracts";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import briefJson from "../../../samples/ui-brief.sample.json";
import { compileProject } from "../src/index.js";

const brief = UiBriefSchema.parse(briefJson);
const deps = { getProfile, getCatalog, getArchetype };
```

测试内容：

- `compileProject` 返回 8 个 PageSpec；
- 每页 `meta.pageId` / `target` / `profile` / `archetype` 与 brief 一致；
- 每页 `states` 包含 archetype 的 requiredStates 和 brief 的 requiredStates；
- 每页布局中出现的每个 `type` 都在对应 catalog 的 `allowedComponents` 中；
- 每页至少有一个 `reqRef`；
- 原始颜色/尺寸不出现在 props 中。

- [ ] **Step 2: 实现 compiler**

`compile-page-spec.ts` 结构：

```ts
import type {
  ArchetypeDef,
  Catalog,
  PageSpec,
  Profile,
  SpecNode,
  UiBrief,
  UiBriefPage,
} from "@prd-ui/contracts";

const nav = ["概览", "订单", "客户", "设置"];
const tabs = ["推荐", "关注", "附近", "我的"];

function btn(label: string, emphasis = "primary"): SpecNode {
  return { type: "Button", props: { label, emphasis } };
}

function text(label: string, textRole = "body.md"): SpecNode {
  return { type: "Text", props: { text: label }, textRole };
}

export function compilePageSpec(input: {
  brief: UiBrief;
  page: UiBriefPage;
  profile: Profile;
  catalog: Catalog;
  archetype: ArchetypeDef;
}): PageSpec {
  const { brief, page, profile, archetype } = input;
  const layout = buildLayout(page, archetype, profile);
  const states = Object.fromEntries(
    [...new Set([...archetype.requiredStates, ...page.requiredStates])].map((name) => [
      name,
      { name },
    ])
  );

  return {
    meta: {
      pageId: page.id,
      project: brief.meta.project,
      name: page.name,
      target: page.target,
      profile: page.profile,
      archetype: page.archetype,
      reqRefs: page.reqRefs as PageSpec["meta"]["reqRefs"],
      version: "0.1.0",
    },
    layout,
    states,
    interactions: buildInteractions(page),
    traceability: {
      reqMap: Object.fromEntries(page.reqRefs.map((req) => [req, [page.id]])),
      designDefaults: [],
      unmapped: [],
    },
  };
}

function buildLayout(page: UiBriefPage, archetype: ArchetypeDef, profile: Profile): SpecNode {
  switch (archetype.id) {
    case "overview":
      return {
        type: "PageShell",
        props: { title: page.name, nav },
        slots: {
          content: [
            {
              type: "Section",
              props: { padding: "space.6", gap: "space.4" },
              children: [
                {
                  type: "Grid",
                  props: { columns: 4, gap: "space.4" },
                  children: [
                    { type: "Stat", props: { label: "今日订单", value: "128" } },
                    { type: "Stat", props: { label: "待处理", value: "12" } },
                    { type: "Stat", props: { label: "已完成", value: "96" } },
                    { type: "Stat", props: { label: "异常", value: "3" } },
                  ],
                },
                { type: "Card", props: { title: "近期订单" }, children: [{ type: "List", props: { items: 5 } }] },
              ],
            },
          ],
        },
      };
    case "list":
      return {
        type: "PageShell",
        props: { title: page.name, nav },
        slots: {
          content: [
            {
              type: "Section",
              props: { padding: "space.6", gap: "space.4" },
              children: [
                { type: "FilterBar", props: { fields: ["status", "date", "keyword"], action: "新建订单" } },
                { type: "DataTable", props: { columns: ["orderNo", "customer", "amount", "status", "createdAt"], pageSize: 20 } },
                { type: "Pagination", props: { pageSize: 20 } },
              ],
            },
          ],
        },
      };
    case "detail":
      return {
        type: "PageShell",
        props: { title: page.name, nav },
        slots: {
          summary: [{ type: "Card", props: { title: "订单摘要" }, children: [{ type: "List", props: { items: 4 } }] }],
          fields: [
            {
              type: "Section",
              props: { padding: "space.6", gap: "space.3" },
              children: page.fields?.map((field) => ({ type: "FormField", props: { label: field, readOnly: true } })) ?? [],
            },
          ],
          actions: [{ type: "Button", props: { label: "编辑订单", emphasis: "primary" } }],
        },
      };
    case "form":
      return {
        type: "PageShell",
        props: { title: page.name, nav },
        slots: {
          fields: [
            {
              type: "Section",
              props: { padding: "space.6", gap: "space.4" },
              children: (page.fields ?? ["orderNo", "customer", "amount"]).map((field) => ({
                type: "FormField",
                props: { label: field, required: true },
                children: [{ type: "Input", props: { name: field, placeholder: `请输入${field}` } }],
              })),
            },
          ],
          actions: [
            { type: "Section", props: { padding: "space.4", gap: "space.2" }, children: [btn("保存"), btn("取消", "secondary")] },
          ],
        },
      };
    case "settings":
      return {
        type: "PageShell",
        props: { title: page.name, nav },
        slots: {
          groups: [
            {
              type: "Section",
              props: { padding: "space.6", gap: "space.4" },
              children: [
                {
                  type: "Card",
                  props: { title: "通知设置" },
                  children: [
                    { type: "FormField", props: { label: "订单通知" }, children: [{ type: "Select", props: { options: ["开启", "关闭"] } }] },
                    { type: "FormField", props: { label: "语言" }, children: [{ type: "Select", props: { options: ["简体中文", "English"] } }] },
                  ],
                },
              ],
            },
          ],
          actions: [{ type: "Button", props: { label: "保存设置", emphasis: "primary" } }],
        },
      };
    case "feed":
      return {
        type: "MobileShell",
        props: { title: page.name, tabs },
        slots: {
          feed: [
            { type: "FeedCard", props: { title: "周末去哪儿", body: "城市周边 5 个小众目的地" } },
            { type: "FeedCard", props: { title: "新店开业", body: "手冲咖啡买一送一" } },
          ],
          "bottom-nav": [{ type: "BottomNav", props: { items: tabs } }],
        },
      };
    case "auth":
      return {
        type: "MobileShell",
        props: { title: page.name },
        slots: {
          title: [text(page.name, "heading.1")],
          fields: [
            { type: "FormField", props: { label: "邮箱" }, children: [{ type: "Input", props: { name: "email", inputType: "email" } }] },
            { type: "FormField", props: { label: "密码" }, children: [{ type: "Input", props: { name: "password", inputType: "password" } }] },
          ],
          actions: [btn("登录")],
        },
      };
    case "onboarding":
      return {
        type: "MobileShell",
        props: { title: page.name },
        slots: {
          illustration: [{ type: "Image", props: { assetRef: "onboarding-1", ratio: "4:3" } }],
          title: [text(page.name, "heading.1")],
          body: [text("用三步完成设置", "body.md")],
          actions: [btn("开始"), btn("稍后", "secondary")],
        },
      };
    default:
      throw new Error(`Unsupported archetype: ${archetype.id}`);
  }
}

function buildInteractions(page: UiBriefPage): PageSpec["interactions"] {
  return (page.actions ?? []).map((action) => ({
    trigger: action,
    action: "navigate",
    reqRef: page.reqRefs[0],
  }));
}
```

注意：`PageShell` 的 `slots` 与 spike 的 `children` 不同；Phase 1 统一用 `slots`，validator 会检查。`Text` 不是 catalog 组件时，要么在 catalog 里加入 `Text`，要么所有文本改用 `Text` 作为允许的 primitive。**决定：catalog 增加 `Text`（web/mobile 都 available），archetype 的 `allowedComponents` 加上 `Text`。** 实施时必须同步修改 Task 2 的 catalogs/archetypes 和测试。

`compile-project.ts`：

```ts
import type { PageSpec, UiBrief } from "@prd-ui/contracts";
import type { ArchetypeDef } from "@prd-ui/design-system";
import type { Catalog, Profile } from "@prd-ui/contracts";
import { compilePageSpec } from "./compile-page-spec.js";

export interface CompileDeps {
  getProfile: (name: string) => Profile;
  getCatalog: (name: string) => Catalog;
  getArchetype: (id: string) => ArchetypeDef;
}

export function compileProject(brief: UiBrief, deps: CompileDeps): PageSpec[] {
  return brief.ia.pages.map((page) =>
    compilePageSpec({
      brief,
      page,
      profile: deps.getProfile(page.profile),
      catalog: deps.getCatalog(page.profile),
      archetype: deps.getArchetype(page.archetype),
    })
  );
}
```

- [ ] **Step 3: 运行测试并提交**

Run: `cd pipeline && pnpm test -- compiler`
Expected: 8 页全部通过结构测试。

```bash
git add pipeline/packages/compiler
git commit -m "feat: add deterministic page spec compiler"
```

---

### Task 5: Validators

**Files:**
- Create: `pipeline/packages/validators/package.json`
- Create: `pipeline/packages/validators/tsconfig.json`
- Create: `pipeline/packages/validators/src/types.ts`
- Create: `pipeline/packages/validators/src/schema.ts`
- Create: `pipeline/packages/validators/src/catalog.ts`
- Create: `pipeline/packages/validators/src/token.ts`
- Create: `pipeline/packages/validators/src/layout.ts`
- Create: `pipeline/packages/validators/src/state.ts`
- Create: `pipeline/packages/validators/src/asset.ts`
- Create: `pipeline/packages/validators/src/traceability.ts`
- Create: `pipeline/packages/validators/src/validate.ts`
- Create: `pipeline/packages/validators/src/index.ts`
- Test: `pipeline/packages/validators/tests/validators.test.ts`

**Interfaces:**
- Produces: `ValidationContext = { profile: Profile; catalog: Catalog; archetype: ArchetypeDef; manifest: AssetManifest }`
- Produces: `validatePageSpec(spec: PageSpec, ctx: ValidationContext): ValidationReport`
- Produces: `ValidationReport = { pageId: string; findings: Finding[]; blockers: number; major: number; minor: number; questions: number; passed: boolean }`
- Produces: `validateProject(specs, ctxs): ValidationReport[]`

- [ ] **Step 1: 写失败测试**

覆盖：
- 合法 spec 0 blocker；
- 未知组件 → blocker `CATALOG-UNKNOWN`；
- 原始颜色 → blocker `TOKEN-RAW-VALUE`；
- 缺少 `default` state → schema blocker；
- 缺少 archetype required state → blocker `STATE-REQUIRED`；
- `assetRef` 不在 manifest → blocker `ASSET-MISSING`；
- `reqRef` 不在 page reqRefs / REQ 映射 → blocker `TRACE-UNMAPPED`；
- `position: absolute` / `top` / `left` → blocker `LAYOUT-ABSOLUTE`；
- 不支持的 archetype → blocker。

- [ ] **Step 2: 实现 validator 规则**

每个文件导出一个 `validateX(spec, ctx): Finding[]`，规则 ID 固定：

- `schema.ts`：`SCHEMA-INVALID`，用 `PageSpecSchema.safeParse`；失败时每个 issue 一条 blocker。
- `catalog.ts`：
  - `CATALOG-UNKNOWN`：节点 `type` 不在 catalog。
  - `CATALOG-UNAVAILABLE`：`availability !== "available"`。
  - `CATALOG-PROP-UNKNOWN`：props key 不在组件契约。
  - `CATALOG-PROP-ENUM`：enum 值不在允许列表。
  - `CATALOG-VARIANT`：`props.emphasis`/`variant` 不合法。
  - `CATALOG-ARCHETYPE`：组件不在 archetype.allowedComponents。
- `token.ts`：
  - `TOKEN-RAW-VALUE`：props 中出现 `#hex`、`rgb(`、`hsl(`、`px`、`rem`。
  - `TOKEN-UNKNOWN`：`space.*`/`radius.*`/`color.*`/`motion.*` 引用不存在。
  - `TOKEN-TEXTRole`：`textRole` 不在 profile.typography。
  - `TOKEN-CONTRAST`：`text.primary`/`text.secondary` 对 `surface.default` 对比度 < 4.5。
  - `TOKEN-FONT-SIZE`：正文字号 < 12（web）或 < 11（mobile）。
- `layout.ts`：
  - `LAYOUT-ARCHETYPE`：root type 与 archetype 的 shell 不匹配。
  - `LAYOUT-ABSOLUTE`：props 含 `position`/`top`/`left`/`right`/`bottom`。
  - `LAYOUT-SLOT`：缺少 archetype.requiredSlots 中的 slot。
  - `LAYOUT-PRIMITIVE`：`type` 为 `PageShell`/`MobileShell`/`Section`/`Grid`/`Row`/`Stack`/`Text`/`Image`/`Icon` 之外的布局 primitive 时只允许 catalog 组件；不做额外限制。
- `state.ts`：
  - `STATE-REQUIRED`：缺少 archetype.requiredStates 或 page.requiredStates。
  - `STATE-DEFAULT`：缺少 default。
  - `STATE-OVERRIDE`：state overrides 指向不存在的 node id 或 component。
- `asset.ts`：
  - `ASSET-MISSING`：`assetRef` 不在 manifest.assets。
  - `ASSET-PLACEHOLDER`：manifest.placeholders 非空时 blocker（最终交付门禁；Phase 1A 允许占位，但报告 major）。
  - `ASSET-INCOMPLETE`：manifest.complete=false → major。
  - `ASSET-ICON-SVG`：icon 文件必须 `.svg`。
- `traceability.ts`：
  - `TRACE-PAGE-REQ`：page reqRefs 为空。
  - `TRACE-NODE-REQ`：节点 reqRef 不在 page reqRefs 或 brief reqMap。
  - `TRACE-DESIGN-DEFAULT`：`designDefault` 为空字符串或缺失理由。
  - `TRACE-UNMAPPED`：traceability.unmapped 非空。
- `validate.ts`：汇总所有 findings；`passed = blockers === 0`。

- [ ] **Step 3: 实现对比度计算**

在 `token.ts` 内实现 `contrastRatio(fg, bg)`，使用 WCAG 相对亮度；对 profile 的 `text.primary`/`text.secondary` 与 `surface.default` 做检查。`#RRGGBB` 输入。

- [ ] **Step 4: 运行测试并提交**

Run: `cd pipeline && pnpm test -- validators`
Expected: 合法 spec 全部 0 blocker；每个坏例产生对应 ruleId。

```bash
git add pipeline/packages/validators
git commit -m "feat: add page spec validators"
```

---

### Task 6: State Machine, Run Artifacts, Phase 1 Exit Check

**Files:**
- Create: `pipeline/pipeline/orchestrator/package.json`
- Create: `pipeline/pipeline/orchestrator/tsconfig.json`
- Create: `pipeline/pipeline/orchestrator/src/state-machine.ts`
- Create: `pipeline/pipeline/orchestrator/src/run-phase1.ts`
- Test: `pipeline/pipeline/orchestrator/tests/state-machine.test.ts`

**Interfaces:**
- Consumes: `UiBrief`, `compileProject`, `validateProject`, design-system getters.
- Produces: `runPhase1(): Promise<Phase1Result>`；`Phase1Result = { runId; pages: number; blockers: number; runDir: string; passed: boolean }`。
- Produces: 文件：
  - `runs/<runId>/state.json`
  - `runs/<runId>/artifacts/ui-brief.json`
  - `runs/<runId>/artifacts/page-spec/<page>.json`
  - `runs/<runId>/reports/validation.json`
  - `runs/<runId>/logs/run.log`

- [ ] **Step 1: 写 state machine 测试**

```ts
import { describe, expect, it } from "vitest";
import { createRunState, transition } from "../src/state-machine.js";

describe("state machine", () => {
  it("runs the happy path", () => {
    let state = createRunState("run-test");
    state = transition(state, "brief");
    state = transition(state, "compile");
    state = transition(state, "validate");
    state = transition(state, "report");
    state = transition(state, "done");
    expect(state.stage).toBe("done");
    expect(state.status).toBe("success");
  });

  it("rejects an invalid transition", () => {
    const state = createRunState("run-test");
    expect(() => transition(state, "done")).toThrow(/invalid transition/i);
  });
});
```

- [ ] **Step 2: 实现 state machine**

```ts
import type { RunState, Stage } from "@prd-ui/contracts";

const order: Stage[] = ["intake", "brief", "compile", "validate", "report", "done"];

export function createRunState(runId: string): RunState {
  const now = new Date().toISOString();
  return {
    runId,
    stage: "intake",
    status: "running",
    attempts: {},
    degraded: false,
    gates: { brief: "passed" },
    startedAt: now,
    updatedAt: now,
  };
}

export function transition(state: RunState, next: Stage): RunState {
  const current = order.indexOf(state.stage);
  const target = order.indexOf(next);
  if (target !== current + 1) {
    throw new Error(`invalid transition: ${state.stage} -> ${next}`);
  }
  const now = new Date().toISOString();
  return {
    ...state,
    stage: next,
    status: next === "done" ? "success" : "running",
    updatedAt: now,
  };
}
```

- [ ] **Step 3: 实现 run-phase1.ts**

流程：

1. 生成 `runId = new Date().toISOString().replace(/[:.]/g, "-")`；
2. 创建 `runs/<runId>/{artifacts,reports,logs}`；
3. `intake`：读取 `samples/ui-brief.sample.json`，用 `UiBriefSchema.parse` 校验；写 `artifacts/ui-brief.json`；
4. `compile`：`compileProject(brief, { getProfile, getCatalog, getArchetype })`；逐页写 `artifacts/page-spec/<pageId>.json`；
5. `validate`：为每页构造 `ValidationContext`（profile/catalog/archetype/manifest）；manifest 从 `samples/asset-manifest.sample.json` 读取（Task 3 可补一个最小 manifest，包含 icons 与 empty-orders 插画；没有实际文件时 `complete: true`，但所有引用必须有条目）；
6. `report`：写 `reports/validation.json`；
7. 若 blockers > 0：`state.status = "failed"`，写 `state.json`，进程 exit 1；
8. 若 0 blocker：`transition` 到 `done`，`state.status = "success"`，写 `state.json`，`console.log("Phase 1A OK: 8 pages, 0 blockers")`。

`run-phase1.ts` 使用 `node:fs` 写文件；路径基于 `process.cwd()`（从 `pipeline/` 运行）。`pipeline/package.json` 的 `phase1:verify` 已指向该文件。

- [ ] **Step 4: 补 sample asset manifest**

`pipeline/samples/asset-manifest.sample.json`：

```json
{
  "project": "demo-orders",
  "profile": "b-dense",
  "assets": [
    { "id": "search", "kind": "icon", "library": "lucide", "files": [{ "path": "samples/assets/icons/search.svg", "format": "svg" }], "license": "ISC" },
    { "id": "filter", "kind": "icon", "library": "lucide", "files": [{ "path": "samples/assets/icons/filter.svg", "format": "svg" }], "license": "ISC" },
    { "id": "plus", "kind": "icon", "library": "lucide", "files": [{ "path": "samples/assets/icons/plus.svg", "format": "svg" }], "license": "ISC" },
    { "id": "chevron", "kind": "icon", "library": "lucide", "files": [{ "path": "samples/assets/icons/chevron.svg", "format": "svg" }], "license": "ISC" },
    { "id": "user", "kind": "icon", "library": "lucide", "files": [{ "path": "samples/assets/icons/user.svg", "format": "svg" }], "license": "ISC" },
    { "id": "bell", "kind": "icon", "library": "lucide", "files": [{ "path": "samples/assets/icons/bell.svg", "format": "svg" }], "license": "ISC" },
    { "id": "empty-orders", "kind": "illustration", "style": "c-soft", "files": [{ "path": "samples/assets/illustrations/empty-orders@2x.png", "scale": 2, "format": "png" }], "license": "internal" }
  ],
  "placeholders": [],
  "complete": true
}
```

Phase 1A 不需要真实 SVG/PNG 文件；validator 只检查 manifest 条目是否存在。若后续接入真实资产，再补文件与 hash。

- [ ] **Step 5: 运行出口校验**

Run: `cd pipeline && pnpm phase1:verify`
Expected: `Phase 1A OK: 8 pages, 0 blockers`；检查 `runs/<runId>/` 下的 state/artifacts/reports/logs。

- [ ] **Step 6: 提交**

```bash
git add pipeline/pipeline/orchestrator pipeline/samples/asset-manifest.sample.json pipeline/package.json pipeline/pnpm-workspace.yaml
git commit -m "feat: add phase 1 state machine and exit verification"
```

---

## Phase 1A Exit Criteria

- `pnpm test` 全部通过；
- `pnpm phase1:verify` 返回 0，输出 8 页、0 blocker；
- `runs/<runId>/artifacts/page-spec/` 有 8 个 JSON；
- `runs/<runId>/reports/validation.json` 中每页 `passed: true`；
- 所有 Page Spec 只引用 catalog 中 `available` 的组件；
- 没有原始颜色/尺寸、绝对定位、缺失状态、缺失资产、缺失追溯；
- `pipeline/` 与 `spike/` 互相独立。

## Self-Review

- **Spec coverage**：本计划覆盖 Phase 1 的 contracts、两套基线 Profile/Catalog、8 个 archetype、样本 PRD/UI Brief、确定性 compiler、7 类 validator、状态机/run 产物和出口校验。现有设计系统接入（code/Figma/docs/screenshots adapters）和真实 PRD Review Gate 属于 Phase 1B/Phase 2，不在本计划。
- **Placeholder scan**：无 TBD/TODO；所有任务有文件路径、接口、测试命令和提交命令。
- **Type consistency**：`PageSpec`、`Profile`、`Catalog`、`UiBrief`、`ValidationContext`、`ValidationReport` 在 contracts/validators 中命名一致；compiler 使用 `slots`，validator 检查 `slots`；catalog 必须包含 `Text` primitive（Task 2 中补充）。
