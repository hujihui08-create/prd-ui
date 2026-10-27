# v0.8 Batch 3 — placement + ActionMenu 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消费 `placement`（footer / card-actions / overflow / inline），新增 `ActionMenu` 组件承载溢出动作，把 `detail` 的次级动作从 filter-row 移到 summary 的 card-actions 行，并重生成视觉/Figma 证据。

**Architecture:** 位置解析是 `core/compiler` 的纯函数；`ActionMenu` 是新 SpecNode 类型，走「五处联动」清单（contracts → catalog → renderer → plan → plugin/tests）；plan 用 `visible:false` 表示隐藏面板，conformance 跳过它。样例的 Page Spec 用新的 `spec:refresh` 从 brief 重编译 layout（保留 M1 enrichment），不重跑模型。

**Tech Stack:** TypeScript (ESM, strict), Zod 4, Vitest 5, Playwright（baseline/parity，人工门禁）。

## Global Constraints

- 所有命令从 `pipeline/` 运行。
- 先完成 Batch 2（已在 `main`，997 tests）。本批次基于 Batch 2 的 `ActionRef`。
- 视觉会变（card-actions 行 + 更多菜单），必须重生成并人工签核 baseline；不伪造截图或签核。
- `ActionMenu` 是正式组件：contracts、三个 catalog、renderer、plan、plugin、测试五处都要改。
- 隐藏面板在 Figma 里用 `visible:false`，conformance 必须显式 skip（带 reason），不能静默通过。
- 每个 Task 结束跑 `pnpm test` + `pnpm typecheck`；本地 commit；不 push（除非用户要求）。
- 人工门禁（baseline、Figma 重建、双签）由用户执行；agent 只准备命令与证据目录。

---

## 设计要点

### 位置解析（默认级联）

1. 先做业务过滤（保留 Batch 2 规则）：去掉与 footer 重复的 check-in、服务未完成时的
   `treatment.notice.view`。
2. 对过滤后的 refs 做位置解析：
   - `placement` 显式值优先；
   - 未显式时按顺序级联：第 1 个 → `footer`；第 2–4 个 → `card-actions`；
     第 5 个起 → `overflow`。
3. 校验：footer 恰好 1 个；card-actions ≤3；`inline` 只允许显式。
4. 组内排序：`appointment.cancel` 永远最后；`card-actions` 与 `overflow` 保持其余
   原始顺序。

### ActionMenu

```ts
{
  type: "ActionMenu";
  props: { label: string };   // 触发器文案，默认「更多」
  children: SpecNode[];       // 仅 Button
}
```

- id：`<pageId>.action-menu`。
- 只出现在 `actions` 槽，排在 footer 动作之后。
- HTML：触发器 + `hidden` 的 `role=dialog` sheet；JS 打开/关闭、Esc、遮罩、
  焦点进入/归还、`aria-expanded` 同步。
- plan：触发器 frame + `visible:false` 的 sheet frame（子按钮也在 sheet 内）。
- conformance：sheet 与子按钮跳过（`SKIPPED_MENU_HIDDEN`）；触发器正常比较。
- Figma：只建闭合态；parity 只反映闭合态。

---

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `core/compiler/src/action-placement.ts` | 位置解析纯函数 + 校验 | 新建 |
| `core/compiler/src/compile-page-spec.ts` | `detailLayout` 消费分组 | 修改 |
| `core/contracts/src/figma.ts` | `FigmaPlanNode.visible?: boolean` | 修改 |
| `core/contracts/src/page-spec.ts` | `ActionMenu` 说明（type 是 string，无需 union） | 文档注释 |
| `core/design-system/src/catalogs/*.ts` | `ActionMenu` 组件契约 + `actions` 槽允许 | 修改 |
| `core/renderer-html/src/index.ts` | ActionMenu 分支、CSS、交互 JS、card-actions 样式 | 修改 |
| `core/figma/src/compile-plan.ts` | ActionMenu 映射 + `visible` | 修改 |
| `core/figma/src/coverage.ts` | ActionMenu 子节点 skip | 修改 |
| `core/figma/src/conformance.ts` | `visible:false` 跳过 | 修改 |
| `runtimes/figma/src/plugin.ts` | 建隐藏 sheet | 修改 |
| `runtimes/standalone/src/spec-refresh-cli.ts` | `spec:refresh` | 新建 |
| `package.json` | `spec:refresh` script | 修改 |
| 测试 | 位置解析、detail 布局、ActionMenu、refresh | 新建/修改 |

---

## Task 1: 位置解析与 detailLayout

**Files:**
- Create: `core/compiler/src/action-placement.ts`
- Modify: `core/compiler/src/compile-page-spec.ts`
- Test: `core/compiler/tests/action-placement.test.ts`, `core/compiler/tests/compiler.test.ts`

**Interfaces:**
- Produces: `resolveActionPlacements(actions: ActionRef[]): PlacementGroups`，其中
  `PlacementGroups = { footer: ActionRef[]; cardActions: ActionRef[]; overflow: ActionRef[]; inline: ActionRef[] }`。

- [ ] **Step 1: 写失败测试**

`core/compiler/tests/action-placement.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { resolveActionPlacements } from "../src/action-placement.js";

const ref = (id: string, placement?: "footer" | "card-actions" | "overflow" | "inline") => ({
  id,
  label: id,
  ...(placement === undefined ? {} : { placement }),
});

describe("resolveActionPlacements", () => {
  it("cascades footer, three card actions, then overflow", () => {
    const groups = resolveActionPlacements([
      ref("a"), ref("b"), ref("c"), ref("d"), ref("e"), ref("f"),
    ]);
    expect(groups.footer.map((r) => r.id)).toEqual(["a"]);
    expect(groups.cardActions.map((r) => r.id)).toEqual(["b", "c", "d"]);
    expect(groups.overflow.map((r) => r.id)).toEqual(["e", "f"]);
  });

  it("honors explicit placements without consuming cascade slots", () => {
    const groups = resolveActionPlacements([
      ref("a"), ref("b", "overflow"), ref("c"), ref("d"), ref("e"),
    ]);
    expect(groups.footer.map((r) => r.id)).toEqual(["a"]);
    expect(groups.cardActions.map((r) => r.id)).toEqual(["c", "d"]);
    expect(groups.overflow.map((r) => r.id)).toEqual(["b", "e"]);
  });

  it("keeps inline only when explicit", () => {
    const groups = resolveActionPlacements([ref("a"), ref("b", "inline")]);
    expect(groups.inline.map((r) => r.id)).toEqual(["b"]);
    expect(groups.cardActions).toEqual([]);
  });

  it("rejects multiple footers and more than three card actions", () => {
    expect(() =>
      resolveActionPlacements([ref("a", "footer"), ref("b", "footer")])
    ).toThrow(/footer/);
    expect(() =>
      resolveActionPlacements([
        ref("a"), ref("b", "card-actions"), ref("c", "card-actions"),
        ref("d", "card-actions"), ref("e", "card-actions"),
      ])
    ).toThrow(/card-actions/);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm exec vitest run core/compiler/tests/action-placement.test.ts
```

Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `core/compiler/src/action-placement.ts`**

```ts
import type { ActionRef } from "@prd-ui/contracts";

export interface PlacementGroups {
  footer: ActionRef[];
  cardActions: ActionRef[];
  overflow: ActionRef[];
  inline: ActionRef[];
}

const MAX_CARD_ACTIONS = 3;

export function resolveActionPlacements(actions: ActionRef[]): PlacementGroups {
  const groups: PlacementGroups = {
    footer: [],
    cardActions: [],
    overflow: [],
    inline: [],
  };
  let positional = 0;
  for (const action of actions) {
    if (action.placement === "footer") {
      groups.footer.push(action);
    } else if (action.placement === "card-actions") {
      groups.cardActions.push(action);
    } else if (action.placement === "overflow") {
      groups.overflow.push(action);
    } else if (action.placement === "inline") {
      groups.inline.push(action);
    } else if (positional === 0) {
      groups.footer.push(action);
      positional += 1;
    } else if (positional <= MAX_CARD_ACTIONS) {
      groups.cardActions.push(action);
      positional += 1;
    } else {
      groups.overflow.push(action);
      positional += 1;
    }
  }

  if (groups.footer.length > 1) {
    throw new Error(
      `ACTION_PLACEMENT_CONFLICT: ${groups.footer.length} footer actions`
    );
  }
  if (groups.cardActions.length > MAX_CARD_ACTIONS) {
    throw new Error(
      `ACTION_PLACEMENT_CONFLICT: ${groups.cardActions.length} card-actions`
    );
  }
  if (actions.length > 0 && groups.footer.length === 0) {
    throw new Error("ACTION_PLACEMENT_CONFLICT: no footer action");
  }
  return groups;
}
```

> 注意：显式 placement 不消耗级联位置，所以上例 `b` 显式 overflow 后，`c/d` 仍占
> card-actions 的前两位。级联计数只在未显式时递增。

- [ ] **Step 4: 在 `detailLayout` 消费分组**

替换 `detailLayout` 里从 `const primary = ...` 到 `secondaryActions` 的整段：

```ts
  const candidates = actionRefs
    .filter((action) => action.id !== "treatment.notice.view" || serviceCompleted)
    .filter(
      (action) =>
        !(
          checkinPrimary &&
          (action.id === "appointment.check-in" || action.id === "appointment.accept")
        )
    );
  const groups = resolveActionPlacements(candidates);
  const orderWithCancelLast = (refs: ActionRef[]) => [
    ...refs.filter((action) => action.id !== "appointment.cancel"),
    ...refs.filter((action) => action.id === "appointment.cancel"),
  ];
  const footerNodes = groups.footer.map((action, index) =>
    btn(action, index === 0 ? "primary" : "secondary")
  );
  const cardActionNodes = orderWithCancelLast(groups.cardActions).map((action) =>
    btn(action, action.id === "appointment.cancel" ? "danger" : "ghost")
  );
  const overflowNodes = orderWithCancelLast(groups.overflow).map((action) =>
    btn(action, action.id === "appointment.cancel" ? "danger" : "ghost")
  );
  const inlineNodes = orderWithCancelLast(groups.inline).map((action) =>
    btn(action, action.id === "appointment.cancel" ? "danger" : "ghost")
  );
  const actionMenu: SpecNode | undefined =
    overflowNodes.length === 0
      ? undefined
      : {
          type: "ActionMenu",
          id: `${page.id}.action-menu`,
          props: { label: page.overflowLabel ?? "更多" },
          children: overflowNodes,
        };
```

注意：
- `checkinPrimary` 仍按 primary 的 id 判断，但 primary 现在是 `groups.footer[0]`。
  先用 `resolveActionPlacements` 的“预览”结果判断：先算出 `groups`，再取
  `groups.footer[0]`；把 `checkinPrimary` 的计算移到 `groups` 之后。
- 删除旧的 `openOrder`/`footerRefs`/`secondaryRefs`/`orderedSecondaryRefs`。

- [ ] **Step 5: 放置 groups**

mobile 分支：

```ts
    const fieldNodes: SpecNode[] = [
      ...missingFields.map((field) =>
        fieldFormNode(field, true, values?.[field], page.fieldLabels?.[field])
      ),
      ...(inlineNodes.length === 0
        ? []
        : [
            {
              type: "Row" as const,
              props: { gap: "space.2", variant: "filter" },
              children: inlineNodes,
            },
          ]),
      ...(page.emptyTitle === undefined
        ? []
        : [emptyStateNode(page, page.emptyTitle)]),
    ];
    if (fieldNodes.length === 0) {
      fieldNodes.push({ type: "Row", props: { gap: "space.1" } });
    }
    const summarySlot: SpecNode[] = [
      summaryCard,
      ...(cardActionNodes.length === 0
        ? []
        : [
            {
              type: "Row" as const,
              id: `${page.id}.card-actions`,
              props: { gap: "space.2", variant: "card-actions" },
              children: cardActionNodes,
            },
          ]),
      ...noticeSection,
    ];
    return {
      type: "MobileShell",
      props: { title: page.name, tabs, back: true },
      reqRef: page.reqRefs[0] as ReqId | undefined,
      slots: {
        summary: summarySlot,
        fields: fieldNodes,
        actions: [...footerNodes, ...(actionMenu === undefined ? [] : [actionMenu])],
      },
    };
```

web 分支同样把 `inlineNodes` 放进 fields 的 Section，`cardActionNodes` 放进 summary，
`actionMenu` 放在 `actions` 末尾（web 的 PageShell 有 `actions` 槽）：

```ts
      slots: {
        summary: summarySlot,
        fields: [ /* Section：missingFields + inlineNodes + empty */ ],
        actions: [...footerNodes, ...(actionMenu === undefined ? [] : [actionMenu])],
      },
```

- [ ] **Step 6: 编译测试**

在 `core/compiler/tests/compiler.test.ts` 追加：

```ts
it("moves detail secondary actions into card-actions and overflow", () => {
  const detail = phase2Spec("appointment-detail");
  const buttons = nodesOf(detail, "Button").map((node) => node.props?.action);
  expect(buttons).toContain("appointment.check-in");
  const cardRow = nodesOf(detail, "Row").find(
    (node) => node.props?.variant === "card-actions"
  );
  expect(
    (cardRow?.children ?? []).map((node) => node.props?.action)
  ).toEqual(["order.create", "appointment.reschedule", "appointment.cancel"]);
  const menu = nodesOf(detail, "ActionMenu")[0];
  expect(menu).toBeDefined();
  expect(
    (menu?.children ?? []).map((node) => node.props?.action)
  ).toEqual(["customer.view"]);
});

it("does not create a menu when everything fits in card-actions", () => {
  const detail = phase2Spec("customer-detail");
  expect(nodesOf(detail, "ActionMenu")).toEqual([]);
  const cardRow = nodesOf(detail, "Row").find(
    (node) => node.props?.variant === "card-actions"
  );
  expect((cardRow?.children ?? []).length).toBe(3);
});
```

- [ ] **Step 7: 运行并修到绿**

```bash
pnpm exec vitest run core/compiler/tests
pnpm typecheck
```

- [ ] **Step 8: 提交**

```bash
git add core/compiler
git commit -m "feat(compiler): resolve action placements into footer/card-actions/overflow"
```

---

## Task 2: ActionMenu 五处联动

### 2.1 契约与 catalog

- [ ] **Step 1: 给 `FigmaPlanNode` 加 `visible`**

`core/contracts/src/figma.ts`：接口加 `visible?: boolean;`，schema 加
`visible: z.boolean().optional(),`。

- [ ] **Step 2: 三个 catalog 加 `ActionMenu`**

在 `b-mobile`、`b-dense`、`c-expressive` 的 `components` 中加：

```ts
    {
      id: "ActionMenu",
      library: "<profile>",
      source: "code",
      availability: "available",
      category: "action",
      props: { label: { type: "string", required: true } },
      variants: ["default"],
      states: ["closed"],
      slots: { children: { allowed: ["Button"] } },
      mapping: { code: "ActionMenu", figma: "ActionMenu" },
      version: "1.0.0",
    },
```

并把 `actions` 槽的 allowed 列表加入 `"ActionMenu"`（三个 catalog 都要）。

- [ ] **Step 3: 运行 catalog 测试**

```bash
pnpm exec vitest run core/design-system/tests
```

### 2.2 Renderer

- [ ] **Step 4: 写失败测试**

`core/renderer-html/tests/renderer.test.ts` 追加：

```ts
it("renders an action menu with a hidden modal sheet", () => {
  const spec = phase2ById.get("appointment-detail")!;
  const html = renderDocument(spec, getProfile("b-mobile"));
  expect(html).toContain('data-node-id="appointment-detail.action-menu"');
  expect(html).toContain("data-action-menu");
  expect(html).toContain('role="dialog"');
  expect(html).toContain(" aria-expanded=\"false\"");
  expect(html).toContain('data-action="customer.view"');
  expect(html).toContain("action-sheet");
});
```

> 该测试依赖 Task 1 已经把 ActionMenu 放进 spec。

- [ ] **Step 5: 实现分支、CSS、JS**

`renderNode` 加：

```ts
    case "ActionMenu": {
      const label = str(props.label) || "更多";
      const motion = motionAttrs(node, renderMotionContext);
      return `<div class="action-menu"${motion.attrs}${inlineStyle("", motion.style)}>
  <button class="btn ghost" type="button" data-action-menu aria-haspopup="dialog" aria-expanded="false">${esc(label)}</button>
  <div class="action-sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}" hidden>
    <div class="action-sheet-panel">${children}</div>
  </div>
</div>`;
    }
```

CSS（追加到样式块）：

```css
.action-menu{display:flex;}
.action-sheet{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;background:rgba(17,24,39,.4);}
.action-sheet[hidden]{display:none;}
.action-sheet-panel{width:100%;background:var(--color-surface-default);border-radius:var(--radius-lg) var(--radius-lg) 0 0;padding:var(--space-3);display:flex;flex-direction:column;gap:var(--space-2);}
.action-sheet-panel .btn{width:100%;height:44px;justify-content:center;}
.row[data-variant="card-actions"]{display:flex;gap:var(--space-2);flex-wrap:wrap;}
.row[data-variant="card-actions"] .btn{flex:0 0 auto;}
```

> `Row` 分支现在只给 `variant === "filter"` 加 class；补上
> `variant === "card-actions" ? " card-actions-row"` 并给容器加 `data-variant`。

交互 JS（追加到内联脚本，`shellInteractionAttrs` 之后）：

```js
  (() => {
    const menus = Array.from(document.querySelectorAll("[data-action-menu]"));
    for (const trigger of menus) {
      const root = trigger.closest(".action-menu");
      const sheet = root ? root.querySelector(".action-sheet") : null;
      if (!sheet) continue;
      const panel = sheet.querySelector(".action-sheet-panel");
      const buttons = panel ? Array.from(panel.querySelectorAll("button")) : [];
      const open = () => {
        sheet.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        buttons[0]?.focus();
      };
      const close = () => {
        sheet.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        trigger.focus();
      };
      trigger.addEventListener("click", () => (sheet.hidden ? open() : close()));
      sheet.addEventListener("click", (event) => {
        if (event.target === sheet) close();
      });
      sheet.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
          return;
        }
        if (event.key !== "Tab" || buttons.length === 0) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
      for (const button of buttons) {
        button.addEventListener("click", close);
      }
    }
  })();
```

- [ ] **Step 6: 运行 renderer 测试**

```bash
pnpm exec vitest run core/renderer-html/tests
```

### 2.3 Plan、coverage、conformance

- [ ] **Step 7: 写失败测试**

`core/figma/tests/plan.test.ts` 追加：

```ts
it("builds a closed action menu with a hidden sheet", () => {
  const plan = compileFigmaPlan(
    phase2Spec("appointment-detail"),
    getProfile("b-mobile"),
    getCatalog("b-mobile")
  );
  let menu: FigmaPlanNode | undefined;
  let sheet: FigmaPlanNode | undefined;
  walk(plan.root, (node) => {
    if (node.name === "ActionMenu") menu = node;
    if (node.name === "ActionSheet") sheet = node;
  });
  expect(menu).toBeDefined();
  expect(sheet?.visible).toBe(false);
});
```

- [ ] **Step 8: 实现 plan 映射**

`core/figma/src/compile-plan.ts`：

```ts
    case "ActionMenu": {
      const label = str(props.label) || "更多";
      const sheet = frame(
        `${specId}.sheet`,
        "ActionSheet",
        "VERTICAL",
        renderChildren(childrenOf(node), ctx, `${path}.children`),
        {
          visible: false,
          gap: spacePx(ctx.profile, "2"),
          padding: spacePx(ctx.profile, "3"),
          fill: colorToken("surface.default"),
          radius: radiusPx(ctx.profile, "lg"),
          origin: "derived",
        }
      );
      return frame(specId, "ActionMenu", "VERTICAL", [
        instance(`${specId}.trigger`, label, "ghost", { origin: "derived" }),
        sheet,
      ], { gap: 0 });
    }
```

`instance()` 的签名按仓库现有 helper 为准；若没有 `origin` 选项，给 helper 加。

- [ ] **Step 9: coverage 跳过菜单子节点**

`core/figma/src/coverage.ts` 的 `walkSpec` 加参数 `inMenu = false`：

```ts
    if (node.type === "ActionMenu") {
      nodes.push({
        specId: node.id!,
        specType: node.type,
        path,
        status: "mapped",
      });
      for (const child of childrenOf(node)) {
        walkSpec(child, `${path}.children[${index}]`, visit, true);
      }
      return;
    }
    if (inMenu) {
      nodes.push({
        specId: node.id ?? `${spec.meta.pageId}.${path}`,
        specType: node.type,
        path,
        status: "skipped",
        reason: "SKIPPED_MENU_HIDDEN",
      });
      return;
    }
```

- [ ] **Step 10: conformance 跳过 `visible:false`**

`core/figma/src/conformance.ts` 的 `walk`：

```ts
  const walk = (node: FigmaPlanNode): void => {
    const hidden = node.visible === false;
    const visible = !hidden &&
      (node.origin !== "derived" || isMaterialDerivedId(node.specId));
    ...
  };
```

隐藏节点仍要递归，但不产生 NODE_MISSING / 样式比较。

- [ ] **Step 11: 运行 figma 测试**

```bash
pnpm exec vitest run core/figma/tests
```

### 2.4 Figma 插件

- [ ] **Step 12: 建隐藏 sheet**

`runtimes/figma/src/plugin.ts` 在创建 frame 时设置：

```ts
    if (node.visible === false) frame.visible = false;
```

并确认 readback 导出包含 `visible`（若 readback 契约没有该字段，加
`visible?: boolean` 到 readback 节点类型）。

- [ ] **Step 13: build + typecheck**

```bash
pnpm --dir runtimes/figma typecheck && pnpm --dir runtimes/figma build
```

- [ ] **Step 14: 提交**

```bash
git add core/contracts core/design-system core/renderer-html core/figma runtimes/figma
git commit -m "feat: add ActionMenu with hidden plan sheet and placement-aware rendering"
```

---

## Task 3: `spec:refresh` 与 spec-run-v08

**Files:**
- Create: `runtimes/standalone/src/spec-refresh-cli.ts`
- Modify: `package.json`
- Test: `runtimes/standalone/tests/spec-refresh-cli.test.ts`

**Interfaces:**
- Produces: `spec:refresh --spec-run <dir> --project <yaml> --brief <json> --out <dir>`，输出
  `artifacts/page-spec/*.json`（layout 重编译，其余字段保留）。

- [ ] **Step 1: 写失败测试**

```ts
it("recompiles layouts and preserves enrichment", async () => {
  const out = path.join(await tempDir(), "refreshed");
  const code = await main([
    "--spec-run", "artifacts/employee-app-phase2/spec-run-v07",
    "--project", "samples/projects/employee-app-phase2/project.yaml",
    "--brief", "samples/projects/employee-app-phase2/ui-brief.json",
    "--out", out,
  ], silent);
  expect(code).toBe(0);
  const before = JSON.parse(readFileSync("artifacts/employee-app-phase2/spec-run-v07/artifacts/page-spec/appointment-detail.json", "utf8"));
  const after = JSON.parse(readFileSync(path.join(out, "artifacts/page-spec/appointment-detail.json"), "utf8"));
  expect(after.motion).toEqual(before.motion);
  expect(after.interactions).toEqual(before.interactions);
  expect(after.states).toEqual(before.states);
  expect(JSON.stringify(after.layout)).not.toBe(JSON.stringify(before.layout));
});
```

- [ ] **Step 2: 实现 CLI**

```ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { compilePageSpec } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { PageSpecSchema, UiBriefSchema, type PageSpec } from "@prd-ui/contracts";
import { loadProjectConfig } from "@prd-ui/orchestrator";

export async function main(argv: string[], io = { stdout: console.log, stderr: console.error }): Promise<number> {
  // 解析 --spec-run/--project/--brief/--out；缺参返回 2。
  // 1) const { config } = loadProjectConfig(projectPath);
  //    const brief = UiBriefSchema.parse(JSON.parse(await readFile(briefPath, "utf8")));
  // 2) 遍历 <spec-run>/artifacts/page-spec/*.json。
  // 3) 对每页：
  //    const page = brief.ia.pages.find((entry) => entry.id === spec.meta.pageId);
  //    if (page === undefined) return fail(`BRIEF_PAGE_MISSING: ${spec.meta.pageId}`);
  //    const base = compilePageSpec({
  //      brief, page,
  //      profile: getProfile(page.profile),
  //      catalog: getCatalog(page.profile),
  //      archetype: getArchetype(page.archetype),
  //    });
  //    const refreshed = PageSpecSchema.parse({ ...existing, layout: base.layout });
  // 4) 写到 <out>/artifacts/page-spec/<page>.json。
  // 5) 写 provenance.json：{ sourceSpecRun, briefHash, generatedAt }。
  return 0;
}
```

完整实现要点：只替换 `layout`，保留 `states`/`motion`/`interactions`/`linkedRoutes`/
`traceability`；输出前过 `PageSpecSchema`；brief 找不到页面时 fail-closed。

- [ ] **Step 3: 加 script**

`package.json`：

```json
"spec:refresh": "tsx runtimes/standalone/src/spec-refresh-cli.ts",
```

- [ ] **Step 4: 运行 refresh 到 `spec-run-v08`**

```bash
rm -rf artifacts/employee-app-phase2/spec-run-v08
pnpm spec:refresh \
  --spec-run artifacts/employee-app-phase2/spec-run-v07 \
  --project samples/projects/employee-app-phase2/project.yaml \
  --brief samples/projects/employee-app-phase2/ui-brief.json \
  --out artifacts/employee-app-phase2/spec-run-v08
```

Expected: 8 页写出；`appointment-detail` 出现 `ActionMenu` 与 `card-actions`。

- [ ] **Step 5: 渲染、plan、conformance**

```bash
rm -rf /tmp/v08-b3-html /tmp/v08-b3-plans /tmp/v08-b3-conf
pnpm render:html --run artifacts/employee-app-phase2/spec-run-v08 --out /tmp/v08-b3-html
pnpm figma:plan --spec-run artifacts/employee-app-phase2/spec-run-v08 --out /tmp/v08-b3-plans
pnpm figma:conformance \
  --spec-run artifacts/employee-app-phase2/spec-run-v08 \
  --html /tmp/v08-b3-html --plans /tmp/v08-b3-plans --out /tmp/v08-b3-conf
```

Expected: 0 blocker / 0 major；ActionMenu 的隐藏子项记 skipped。

- [ ] **Step 6: 全量测试与提交**

```bash
pnpm test
pnpm typecheck
git add runtimes/standalone/src/spec-refresh-cli.ts runtimes/standalone/tests/spec-refresh-cli.test.ts package.json artifacts/employee-app-phase2/spec-run-v08
git commit -m "feat(spec): refresh page layouts without rerunning agents"
```

---

## Task 4: 人工视觉与 Figma 门禁

> 这一步必须由人执行；agent 只准备好命令、产物目录和检查清单。

- [ ] **Step 1: 生成新 baseline（人工）**

```bash
pnpm visual:baseline \
  --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run artifacts/employee-app-phase2/spec-run-v08 \
  --html /tmp/v08-b3-html \
  --out baselines/employee-app-phase2
```

- [ ] **Step 2: 真实 Visual Critic + 签核**

```bash
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm visual:review \
  --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run artifacts/employee-app-phase2/spec-run-v08 \
  --html /tmp/v08-b3-html \
  --baseline baselines/employee-app-phase2 \
  --runtime dsh --profile prd-ui-visual --runs /tmp/v08-b3-visual --max-cost-cny 3 --json
pnpm visual:sign --run /tmp/v08-b3-visual/<runId> --signoff-visual /tmp/signoff-visual-b3.md
```

- [ ] **Step 3: 重建 Figma（人工）**

```bash
pnpm figma:serve --figma artifacts/employee-app-phase2/figma --port 9600
# 在 Figma 桌面版按新 plan 重建 8 页（含 ActionMenu 触发器；sheet 为隐藏层）
```

- [ ] **Step 4: verify / parity / sign（人工触发）**

```bash
for page in appointment-detail appointment-form appointment-list callback-register \
            customer-detail customer-search today treatment-notice; do
  pnpm figma:verify \
    --plan "/tmp/v08-b3-plans/figma-plan.$page.json" \
    --readback "artifacts/employee-app-phase2/figma/readback/figma-readback.$page.json" \
    --out "artifacts/employee-app-phase2/figma/diff/figma-diff.$page.json"
done
pnpm figma:parity \
  --figma artifacts/employee-app-phase2/figma/parity \
  --baseline baselines/employee-app-phase2 \
  --spec-run artifacts/employee-app-phase2/spec-run-v08 \
  --out artifacts/employee-app-phase2/figma/parity
pnpm figma:sign --figma artifacts/employee-app-phase2/figma \
  --baseline baselines/employee-app-phase2 --signoff-figma /tmp/signoff-figma-b3.md
```

- [ ] **Step 5: 记录结果并提交文档**

更新 `AGENTS.md`（D2 的 placement/ActionMenu 部分关闭）、新建
`docs/handoffs/2026-10-27-v08-batch3.md`，包含：新 baseline hash、critic 结果、
verify/parity 数字、ActionMenu 已知限制（Figma 只建闭合态、sheet 隐藏）。

```bash
git add AGENTS.md docs/handoffs/2026-10-27-v08-batch3.md
git commit -m "docs: record v0.8 batch 3 (placement and ActionMenu)"
```

---

## Self-Review

- **Spec coverage:** A2.1–A2.7（placement、级联、ActionMenu、hidden 语义、baseline）。
- **Placeholder scan:** 无 TBD；`spec:refresh` 的 Step 2 给了完整行为清单，CLI 骨架
  按仓库 loader 命名落地。
- **Type consistency:** `ActionRef`/`PlacementGroups`/`resolveActionPlacements` 在
  Task 1 定义；`FigmaPlanNode.visible` 在 Task 2 加入；`ActionMenu` 的 `props.label`
  与 catalog 一致。
- **风险：** `spec:refresh` 只换 `layout`，若模板改动了 `states` 结构需扩展；本批只改
  layout，因此够用。`ActionMenu` 的交互只有字符串断言，键盘行为需在 Step 1 的
  baseline 人工走查里确认。
