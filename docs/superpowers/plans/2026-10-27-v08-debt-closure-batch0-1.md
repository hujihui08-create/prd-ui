# v0.8 技术债收口 — Batch 0–1 实施计划（合并 + 组件 id 机制）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已签核的 v0.7 合并进 `main`，并修好组件 id 发射机制与 `Switch`/`InventoryCard` 的 plan 映射，为后续 actionId 与 `ActionMenu` 批次清出干净基线。

**Architecture:** 全部改动落在 v0.7 合并后的 `main`。renderer 负责给每个映射节点输出 `data-node-id`；`core/figma` 负责 coverage 归类与 plan 样式；测试以「全类型清单」为单一来源，防止新增组件时漏改。

**Tech Stack:** TypeScript (ESM, strict), Zod 4, Vitest 5, Playwright（不在本批次）, pnpm workspace。

## Global Constraints

- 所有命令从 `pipeline/` 运行；仓库根没有 package manifest。
- 先合并 `v0.7-visual-gates`，再改任何 v0.8 代码。
- `core/` 不得 import `@deepseek-ai/*`、Playwright、pngjs、pixelmatch、fflate、`node:fs`。
- 相对 import 必须带 `.js` 后缀。
- 每个 task 结束必须 `pnpm test` + `pnpm typecheck` 通过并单独 commit。
- 本地 commit，不 push；不提交密钥或 `.env`。
- 本批次不改动作语义、不改视觉、不重建 baseline；如果视觉字节变化，说明改错了。
- 证据路径：`pipeline/artifacts/<project>/...`；本批次只在 `/tmp` 跑验证。

---

## 后续计划（不在本文件）

| 计划 | 范围 | 前置 |
|---|---|---|
| `2026-10-27-v08-debt-closure-batch2.md` | A1 端到端 actionId（契约/词表/编译器/JS/gate/fixtures/brief 重签） | 本计划完成 |
| `2026-10-27-v08-debt-closure-batch3.md` | A2 placement + `ActionMenu` + baseline 重签 | batch2 |
| `2026-10-27-v08-debt-closure-batch4.md` | A4 spec run + B1 verify 入 smoke + B4 缺口 | batch3 |
| `2026-10-27-v08-debt-closure-batch5.md` | B2 分 case parity + B6 多状态机制 + today 试点 | batch4 |
| `2026-10-27-v08-debt-closure-batch6-8.md` | B3/B5、C1/C2、C5/C6 | batch5 |

每份计划在开始前按同一格式补齐，不提前写空任务。

---

## File Structure

| 文件 | 职责 | 本批次动作 |
|---|---|---|
| `core/renderer-html/src/index.ts` | HTML 渲染；每个节点输出 `data-node-id` | 给 `Switch` / `InventoryCard` 分支补 `motionAttrs` |
| `core/renderer-html/tests/node-id-coverage.test.ts` | 全类型 id 覆盖测试 | 新建 |
| `core/figma/src/coverage.ts` | coverage 归类、consumed props、partial 白名单 | 补 `Switch`/`InventoryCard` 的 consumed props；`Switch` 移出 partial |
| `core/figma/src/compile-plan.ts` | plan 映射 | 新增 `Switch` 分支；`InventoryCard` 从空 frame 改为带结构 |
| `core/figma/tests/coverage.test.ts` | coverage 单元测试 | 加 `Switch`/`InventoryCard` 的 mapped 断言 |
| `core/figma/tests/plan.test.ts` | plan 输出测试 | 加两个类型的结构断言 |
| `docs/superpowers/specs/2026-10-27-v08-debt-closure-design.md` | 设计输入 | 不改（本批次按 A3 执行） |

---

## Task 0: 合并 v0.7 并冻结基线

**Files:**
- Modify: `AGENTS.md`（Branch topology 段落）
- Git: `main` ← `v0.7-visual-gates`

**Interfaces:**
- Consumes: 已签核的 `v0.7-visual-gates` 分支。
- Produces: `main` 上的 v0.7 代码、`v0.7.0` tag、更新的 `AGENTS.md`。

- [ ] **Step 1: 提交主树文档**

```bash
cd /Users/jihui/Desktop/产品、ui
git add AGENTS.md docs/superpowers/specs/2026-10-27-v08-debt-closure-design.md
git commit -m "docs(v0.8): add debt closure design and update agent instructions"
```

- [ ] **Step 2: 提交 worktree 的 AGENTS.md 同步**

```bash
cd /Users/jihui/Desktop/产品、ui/.worktrees/v0.7
git add AGENTS.md
git commit -m "docs: sync AGENTS.md with the v0.8 debt spec"
git status --short
```

Expected: 输出为空。

- [ ] **Step 3: 合并前门禁（在 worktree）**

```bash
cd /Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline
pnpm test
pnpm test:dsh
pnpm typecheck
pnpm --dir runtimes/figma typecheck
pnpm --dir runtimes/figma build
```

Expected: 987 passed / 87 files；4 passed / 3 files；typecheck clean；build OK。

- [ ] **Step 4: 合并并打 tag**

```bash
cd /Users/jihui/Desktop/产品、ui
git merge --no-ff v0.7-visual-gates -m "merge: v0.7 visual gates, structure, blocks, and handoff"
git tag v0.7.0
git log --oneline -3
```

Expected: merge commit 在最上面。若 `AGENTS.md` 冲突，取 `main` 侧的版本（两侧内容应相同）。

- [ ] **Step 5: 合并后安装与门禁（在 main 树）**

```bash
cd /Users/jihui/Desktop/产品、ui/pipeline
pnpm install
pnpm test
pnpm test:dsh
pnpm typecheck
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/v08-postmerge-2p
pnpm phase1:verify --project samples/projects/employee-app-phase2/project.yaml --runs /tmp/v08-postmerge-8p
pnpm phase1:verify --project samples/projects/employee-app-appointments-03/project.yaml --runs /tmp/v08-postmerge-4p
pnpm phase1:verify --project samples/project.demo-orders-intake.yaml --runs /tmp/v08-postmerge-8p-intake
```

Expected: 987 passed；4 passed；typecheck clean；phase1 为 2 / 8 / 4 / 8 pages，0 blocker。

- [ ] **Step 6: 确认 main 与分支的产物一致**

```bash
cd /Users/jihui/Desktop/产品、ui
git diff main v0.7-visual-gates -- pipeline/core pipeline/runtimes pipeline/artifacts
```

Expected: 空输出。

- [ ] **Step 7: 更新 AGENTS.md 的 branch topology**

把 `AGENTS.md` 的 `**Branch topology:**` 条目改为：

```markdown
- **Branch topology:** `main` carries the merged v0.7 code and docs. The
  `v0.7-visual-gates` branch and `.worktrees/v0.7` are kept for history; do not
  develop there. v0.8 work happens on `main`.
```

- [ ] **Step 8: 提交并验证状态**

```bash
cd /Users/jihui/Desktop/产品、ui
git add AGENTS.md
git commit -m "docs: record the v0.7 merge"
git status --short
```

Expected: 只剩未跟踪的 `.zcode/` 与 `docs/research/`。

---

## Task 1: renderer 为 `Switch` / `InventoryCard` 输出 `data-node-id`

**Files:**
- Modify: `core/renderer-html/src/index.ts`（`Switch` 与 `InventoryCard` 分支）
- Test: `core/renderer-html/tests/renderer.test.ts`

**Interfaces:**
- Consumes: `motionAttrs(node, renderMotionContext)`（`core/renderer-html/src/motion.ts`）。
- Produces: 两个类型的根元素带 `data-node-id="<node.id>"`。

- [ ] **Step 1: 写失败测试**

在 `core/renderer-html/tests/renderer.test.ts` 末尾追加：

```ts
describe("node id emission", () => {
  it("emits data-node-id for Switch and InventoryCard", () => {
    const spec = byId.get("inventory-query");
    expect(spec).toBeDefined();
    const html = renderDocument(spec!, getProfile("b-mobile"));
    const switchId = "inventory-query.root.content.0.children.1.children.1";
    const cardId = "inventory-query.root.content.0.children.3";
    expect(html).toContain(`data-node-id="${switchId}"`);
    expect(html).toContain(`data-node-id="${cardId}"`);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd pipeline
pnpm exec vitest run core/renderer-html/tests/renderer.test.ts -t "node id emission"
```

Expected: FAIL，两个 `toContain` 都不匹配。

- [ ] **Step 3: 给两个分支补 attrs**

`core/renderer-html/src/index.ts` 的 `case "Switch"` 改为：

```ts
    case "Switch": {
      const label = str(props.label);
      const value = str(props.value);
      const state = str(props.state) || "off";
      const motion = motionAttrs(node, renderMotionContext);
      return `<div class="switch-row"${motion.attrs}${inlineStyle("", motion.style)}>
  <span class="switch-label">${esc(label)}</span>
  <span class="switch ${state === "on" ? "on" : "off"}"><span class="switch-thumb"></span></span>
  <span class="switch-value">${esc(value)}</span>
</div>`;
    }
```

`case "InventoryCard"` 的根元素改为：

```ts
      const motion = motionAttrs(node, renderMotionContext);
      return `<article class="inventory-card"${motion.attrs}${inlineStyle("", motion.style)}>
```

（该分支其余内容不变；只替换开标签那一行。）

- [ ] **Step 4: 运行测试确认通过**

```bash
cd pipeline
pnpm exec vitest run core/renderer-html/tests/renderer.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add core/renderer-html/src/index.ts core/renderer-html/tests/renderer.test.ts
git commit -m "fix(renderer): emit data-node-id for Switch and InventoryCard"
```

---

## Task 2: coverage 归类与 plan 映射

**Files:**
- Modify: `core/figma/src/coverage.ts`
- Modify: `core/figma/src/compile-plan.ts`
- Test: `core/figma/tests/coverage.test.ts`
- Test: `core/figma/tests/plan.test.ts`

**Interfaces:**
- Consumes: `CONSUMED_PROPS`、`KNOWN_PARTIAL_TYPES`、`frame()`、`text()`、`colorToken()`、`spacePx()`、`radiusPx()`。
- Produces: `Switch`/`InventoryCard` 的 coverage `status: "mapped"`；plan 中有带样式的节点。

- [ ] **Step 1: 写 coverage 失败测试**

在 `core/figma/tests/coverage.test.ts` 追加（沿用该文件已有的 `spec`/`compilePlan` 构造方式；若没有 helper，用最小 PageSpec 字面量）：

```ts
it("maps Switch and InventoryCard without degrade reasons", () => {
  const coverage = buildCoverage(specWithSwitchAndCard, plan);
  const nodes = coverage.nodes;
  const sw = nodes.find((n) => n.specId === "p.switch.1");
  const card = nodes.find((n) => n.specId === "p.card.1");
  expect(sw?.status).toBe("mapped");
  expect(card?.status).toBe("mapped");
  expect(sw?.reason).toBeUndefined();
  expect(card?.reason).toBeUndefined();
});
```

`specWithSwitchAndCard` 的最小形状：

```ts
const specWithSwitchAndCard = {
  meta: {
    pageId: "p", project: "t", name: "P", target: "mobile" as const,
    profile: "b-mobile", archetype: "mobile-list", purpose: "p",
    route: "/p", roles: ["r"], reqRefs: ["REQ-T-001"], version: "0.1.0",
  },
  layout: {
    type: "MobileShell", id: "p.root",
    slots: {
      content: [
        { type: "Switch", id: "p.switch.1", props: { label: "仅看预警", value: "关", state: "off" } },
        { type: "InventoryCard", id: "p.card.1", props: {
          name: "医用面膜", spec: "（25ml）", badge: "低库存", badgeTone: "warning",
          attributes: [{ label: "属性", value: "耗材" }],
          currentLabel: "当前库存", currentStock: "1 瓶",
          availableLabel: "可用库存", availableStock: "1 瓶",
          inTransit: "待收 20 次",
        } },
      ],
    },
  },
  states: { default: { layout: { type: "MobileShell", id: "p.root", slots: { content: [] } } } },
  interactions: [],
  traceability: [],
} as unknown as PageSpec;
```

- [ ] **Step 2: 运行确认失败**

```bash
cd pipeline
pnpm exec vitest run core/figma/tests/coverage.test.ts -t "Switch and InventoryCard"
```

Expected: FAIL（`status` 为 `degraded`，reason 为 `PARTIAL_MAPPING:Switch` / `UNMAPPED_PROP:...`）。

- [ ] **Step 3: 修 coverage**

`core/figma/src/coverage.ts`：

1. 在 `CONSUMED_PROPS` 中把 `InventoryCard` 改为实际 props：

```ts
  InventoryCard: [
    "name", "spec", "badge", "badgeTone", "attributes",
    "currentLabel", "currentStock", "availableLabel", "availableStock", "inTransit",
  ],
  Switch: ["label", "value", "state"],
```

2. 从 `KNOWN_PARTIAL_TYPES` 删除 `"Switch"`（保留其余）。

- [ ] **Step 4: 写 plan 失败测试**

在 `core/figma/tests/plan.test.ts` 追加：

```ts
it("builds a HORIZONTAL Switch and a structured InventoryCard", () => {
  const plan = compilePlan(specWithSwitchAndCard, profile, catalog);
  const sw = findPlanNode(plan, "p.switch.1");
  const card = findPlanNode(plan, "p.card.1");
  expect(sw?.layoutMode).toBe("HORIZONTAL");
  expect(sw?.name).toBe("Switch");
  expect(card?.layoutMode).toBe("VERTICAL");
  expect(card?.padding).toBe(16);
  expect(card?.gap).toBe(8);
  expect(card?.children?.length).toBeGreaterThan(0);
});
```

`findPlanNode` 用已有的 plan 遍历 helper；若文件里没有，加：

```ts
function findPlanNode(plan: FigmaPlan, specId: string): FigmaPlanNode | undefined {
  const walk = (node: FigmaPlanNode): FigmaPlanNode | undefined => {
    if (node.specId === specId) return node;
    for (const child of node.children ?? []) {
      const hit = walk(child);
      if (hit !== undefined) return hit;
    }
    if (node.child !== undefined) return walk(node.child);
    return undefined;
  };
  return walk(plan.root);
}
```

- [ ] **Step 5: 运行确认失败**

```bash
cd pipeline
pnpm exec vitest run core/figma/tests/plan.test.ts -t "HORIZONTAL Switch"
```

Expected: FAIL（`Switch` 落到 default 的 `Switch` empty frame，`layoutMode` 为 VERTICAL；`InventoryCard.children` 为空）。

- [ ] **Step 6: 实现 `Switch` 映射并补 `InventoryCard` 结构**

在 `core/figma/src/compile-plan.ts` 的 `case "SummaryRow"` 之后插入：

```ts
    case "Switch": {
      const state = str(props.state) || "off";
      const children = [
        text(`${specId}.label`, "Label", str(props.label), ctx.profile, "body.md", {
          origin: "derived",
        }),
        frame(`${specId}.track`, "Track", "NONE", [], {
          width: 36,
          height: 20,
          radius: 10,
          fill: state === "on" ? colorToken("status.success") : colorToken("border.strong"),
          origin: "derived",
        }),
        text(`${specId}.value`, "Value", str(props.value), ctx.profile, "label.sm", {
          origin: "derived",
        }),
      ];
      return frame(specId, "Switch", "HORIZONTAL", children, {
        gap: 6,
        alignItems: "CENTER",
      });
    }
```

把 `case "InventoryCard"` 替换为：

```ts
    case "InventoryCard": {
      const attributes = Array.isArray(props.attributes)
        ? (props.attributes as Array<{ label?: unknown; value?: unknown }>)
        : [];
      const head = frame(`${specId}.head`, "Head", "HORIZONTAL", [
        text(`${specId}.name`, "Name", str(props.name), ctx.profile, "heading.3", {
          origin: "derived",
        }),
        ...(str(props.spec) === ""
          ? []
          : [text(`${specId}.spec`, "Spec", str(props.spec), ctx.profile, "body.sm", {
              origin: "derived",
            })]),
      ], { gap: 2, alignItems: "BASELINE", origin: "derived" });
      const attrRows = attributes.map((attr, index) =>
        text(
          `${specId}.attr.${index}`,
          "Attr",
          `${str(attr.label)} ${str(attr.value)}`,
          ctx.profile,
          "body.sm",
          { origin: "derived" }
        )
      );
      const numbers = frame(`${specId}.numbers`, "Numbers", "VERTICAL", [
        text(`${specId}.current`, "Current", `${str(props.currentLabel)} ${str(props.currentStock)}`,
          ctx.profile, "body.sm", { origin: "derived" }),
        text(`${specId}.available`, "Available", `${str(props.availableLabel)} ${str(props.availableStock)}`,
          ctx.profile, "body.sm", { origin: "derived" }),
        ...(str(props.inTransit) === ""
          ? []
          : [text(`${specId}.transit`, "InTransit", str(props.inTransit), ctx.profile, "body.sm", {
              origin: "derived",
            })]),
      ], { gap: 2, origin: "derived", borderTop: 1 });
      return frame(specId, "InventoryCard", "VERTICAL", [head, ...attrRows, numbers], {
        fill: colorToken("surface.default"),
        radius: radiusPx(ctx.profile, "lg"),
        padding: spacePx(ctx.profile, "4"),
        gap: spacePx(ctx.profile, "2"),
      });
    }
```

- [ ] **Step 7: 运行两个测试确认通过**

```bash
cd pipeline
pnpm exec vitest run core/figma/tests/coverage.test.ts core/figma/tests/plan.test.ts
```

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add core/figma/src/coverage.ts core/figma/src/compile-plan.ts core/figma/tests/coverage.test.ts core/figma/tests/plan.test.ts
git commit -m "fix(figma): map Switch and InventoryCard instead of degrading them"
```

---

## Task 3: 全类型 node-id 契约测试

**Files:**
- Create: `core/renderer-html/tests/node-id-coverage.test.ts`
- Modify: `core/renderer-html/src/index.ts`（仅当测试暴露漏发 id 的类型）

**Interfaces:**
- Consumes: `renderDocument`、`getProfile`、`PageSpec`/`SpecNode` 类型。
- Produces: 一张「哪些类型必须发 id、哪些是派生/覆盖层」的显式清单，测试强制。

- [ ] **Step 1: 写测试（先覆盖全部非 shell 类型）**

新建 `core/renderer-html/tests/node-id-coverage.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import type { PageSpec, SpecNode } from "@prd-ui/contracts";
import { getProfile } from "@prd-ui/design-system";
import { renderDocument } from "../src/index.js";

const TYPES = [
  "TopBar", "TabBar", "BottomNav", "Stat", "List", "DataTable", "FilterBar",
  "Pagination", "FormField", "Input", "Select", "FeedCard", "Image", "Section",
  "Card", "Row", "Stack", "Grid", "Text", "Icon", "QuickAction", "CalendarGrid",
  "ListRow", "Badge", "SearchBar", "CollapsedFilter", "Switch", "SummaryRow",
  "InventoryCard", "EmptyState", "Button",
] as const;

const DERIVED_OR_OVERLAY = new Set(["TabBar", "BottomNav"]);

function specWith(nodes: SpecNode[]): PageSpec {
  return {
    meta: {
      pageId: "p", project: "t", name: "P", target: "mobile",
      profile: "b-mobile", archetype: "mobile-list", purpose: "p",
      route: "/p", roles: ["r"], reqRefs: ["REQ-T-001"], version: "0.1.0",
    },
    layout: {
      type: "MobileShell", id: "p.root",
      slots: { content: nodes },
    },
    states: {
      default: {
        layout: { type: "MobileShell", id: "p.root", slots: { content: [] } },
      },
    },
    interactions: [],
    traceability: [],
  } as unknown as PageSpec;
}

describe("node id coverage", () => {
  it("emits exactly one data-node-id for every non-derived type", () => {
    const nodes = TYPES.map((type) => ({ type, id: `p.${type}`, props: {} }));
    const html = renderDocument(specWith(nodes), getProfile("b-mobile"));
    const ids = [...html.matchAll(/data-node-id="([^"]+)"/g)].map((m) => m[1]);
    for (const type of TYPES) {
      if (DERIVED_OR_OVERLAY.has(type)) continue;
      expect(ids.filter((id) => id === `p.${type}`)).toHaveLength(1);
    }
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
cd pipeline
pnpm exec vitest run core/renderer-html/tests/node-id-coverage.test.ts
```

Expected: FAIL，列出仍缺 id 的类型（预期至少 `Skeleton`/`ErrorState` 不在清单里，若其他类型也缺则暴露）。

- [ ] **Step 3: 按失败清单补 `motionAttrs`**

对每个报错的类型，在 `core/renderer-html/src/index.ts` 对应分支加：

```ts
      const motion = motionAttrs(node, renderMotionContext);
```

并把根元素开标签改为带 `${motion.attrs}${inlineStyle("", motion.style)}`。

若某类型没有独立根元素（纯 children 透传），在测试的
`DERIVED_OR_OVERLAY` 中加入该类型并写明理由；不允许默默跳过。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd pipeline
pnpm exec vitest run core/renderer-html/tests/node-id-coverage.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add core/renderer-html/src/index.ts core/renderer-html/tests/node-id-coverage.test.ts
git commit -m "test(renderer): enforce data-node-id for every mapped type"
```

---

## Task 4: employee-app 端到端验证与批次收尾

**Files:**
- 无源码改动；验证与文档。

**Interfaces:**
- Consumes: Task 0–3 的产物。
- Produces: inventory conformance 0 blocker 的证据；批次完成记录。

- [ ] **Step 1: 渲染并生成 plan**

```bash
cd /Users/jihui/Desktop/产品、ui/pipeline
rm -rf /tmp/v08-batch1-runs /tmp/v08-batch1-html /tmp/v08-batch1-plans
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/v08-batch1-runs
pnpm render:html --run /tmp/v08-batch1-runs/<runId> --out /tmp/v08-batch1-html
pnpm figma:plan --spec-run /tmp/v08-batch1-runs/<runId> --out /tmp/v08-batch1-plans
```

Expected: 2 pages / 0 blocker；plan 生成 `figma-plan.today.json` 与
`figma-plan.inventory-query.json`。

- [ ] **Step 2: 跑 conformance**

```bash
pnpm figma:conformance \
  --spec-run /tmp/v08-batch1-runs/<runId> \
  --html /tmp/v08-batch1-html \
  --plans /tmp/v08-batch1-plans \
  --out /tmp/v08-batch1-conformance
```

Expected: exit 0；`inventory-query` 0 blocker（此前 6 条 `CONFORMANCE_NODE_MISSING`）。

- [ ] **Step 3: 确认 8 页 phase2 不回归**

```bash
rm -rf /tmp/v08-batch1-8p-html
pnpm render:html --run artifacts/employee-app-phase2/figma/spec-source --out /tmp/v08-batch1-8p-html
pnpm figma:conformance \
  --spec-run artifacts/employee-app-phase2/figma/spec-source \
  --html /tmp/v08-batch1-8p-html \
  --plans artifacts/employee-app-phase2/figma/plans \
  --out /tmp/v08-batch1-conformance-8p
```

Expected: 0 blocker / 0 major / 233 checked。

- [ ] **Step 4: 全量测试与 typecheck**

```bash
pnpm test
pnpm test:dsh
pnpm typecheck
```

Expected: ≥987 passed；4 passed；clean。

- [ ] **Step 5: 更新 AGENTS.md 债务清单**

把 `AGENTS.md` 中 `Unmapped component types` 条目改为已关闭的描述：

```markdown
- **Unmapped component types:** closed in v0.8 Batch 1. `Switch` and
  `InventoryCard` are mapped in both the renderer (`data-node-id`) and the plan
  compiler; `employee-app` `inventory-query` conformance is 0 blocker.
  Unknown types still fail closed in Phase 1.
```

- [ ] **Step 6: 提交收尾**

```bash
cd /Users/jihui/Desktop/产品、ui
git add AGENTS.md
git commit -m "docs: close the unmapped component debt for batch 1"
```

- [ ] **Step 7: 批次报告**

把以下内容写进提交说明或 `docs/handoffs/2026-10-27-v08-batch1.md`（新建）：

```markdown
# v0.8 Batch 0–1 完成记录

- 合并：v0.7 merge commit，tag `v0.7.0`
- 测试：<pnpm test 数字> / test:dsh 4 / typecheck clean
- inventory-query conformance：0 blocker（此前 6）
- phase2 conformance：0 blocker / 0 major / 233 checked
- 未改视觉：baseline 未重生成
- 下一批：batch2（端到端 actionId）
```

---

## Self-Review

- **Spec coverage:** 本计划覆盖 spec 的 D1（合并）与 D3（组件覆盖/id 发射）；D2/D4–D16 明确列在「后续计划」。
- **Placeholder scan:** 无 TBD/TODO；每个代码步骤都有实际代码。Task 3 的补 id 步骤按测试失败清单执行，清单由测试输出决定，不是占位。
- **Type consistency:** `motionAttrs` / `renderDocument` / `frame` / `text` / `buildCoverage` / `compilePlan` 均为仓库现有签名；`CONSUMED_PROPS` 与 `KNOWN_PARTIAL_TYPES` 在 `core/figma/src/coverage.ts`。
- **风险：** Task 3 的 kitchen-sink fixture 可能让个别分支抛错（缺必填 props）；处理方式是给该类型补最小 props 或加入 `DERIVED_OR_OVERLAY` 并写理由，不允许跳过。
