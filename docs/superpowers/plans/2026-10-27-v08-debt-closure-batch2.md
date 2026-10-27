# v0.8 Batch 2 — 端到端 actionId 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 brief 的 `actions: string[]` 迁移为 `ActionRef[]`（`id`/`label`/`placement`），让按钮行为按能力 id 派发，彻底移除编译器与内联 JS 的中文 label 判断；迁移全部 fixture 并重签 8 页 brief。

**Architecture:** 契约在 `core/contracts`（`action.ts` + brief/page-spec schema）；compiler 只读 `ActionRef`，`Button.props.action` 存 id；renderer 的 `data-action` 与交互 JS 全部按 id 分支；validators/brief gate 用 id 做引用与能力校验；briefer prompt 要求产出 `{id,label}`。fixtures 用一次性脚本迁移，脚本保留为工具。

**Tech Stack:** TypeScript (ESM, strict), Zod 4, Vitest 5, pnpm workspace。

## Global Constraints

- 所有命令从 `pipeline/` 运行。
- 本批次是 **breaking migration**：`UiBrief` schema 升 2.0；旧 brief（string actions）必须被明确拒绝，不做自动猜测。
- 视觉结构不变：batch 2 只改身份与派发，不改布局位置（`placement` 字段先写入契约，batch 3 才消费）。任何可见变化都说明改错了。
- 不重建 visual baseline（除非渲染字节意外变化，需停下排查）。
- `core/` 不得 import `@deepseek-ai/*`、Playwright、pngjs、pixelmatch、fflate、`node:fs`。
- 相对 import 带 `.js` 后缀。
- 每个 Task 结束跑全量 `pnpm test` + `pnpm typecheck`；本批次 Task 1 是原子迁移，中间子步骤不单独 commit。
- 本地 commit；未经用户要求不 push。

---

## 能力词表（本批次版本）

| id | 语义 |
|---|---|
| `form.submit` | 提交/保存表单 |
| `form.reschedule` | 提交改期 |
| `form.cancel` | 取消表单 |
| `appointment.create` | 新增预约 |
| `appointment.reschedule` | 改期（进入流程） |
| `appointment.cancel` | 取消预约 |
| `appointment.accept` | 接单/确认接单 |
| `appointment.check-in` | 到店确认 |
| `appointment.view` | 查看预约详情 |
| `customer.view` | 查看客户详情 |
| `customer.select` | 选择客户 |
| `customer.create` | 新建客户 |
| `customer.callback.create` | 回访登记 |
| `order.create` | 开单/新建订单 |
| `treatment.notice.view` | 查看术后告知 |
| `treatment.confirm` | 确认已告知 |
| `filter.clear` | 清空筛选 |
| `search.submit` | 执行搜索 |
| `search.clear` | 清空关键词 |
| `view.toggle` | 切换日历/列表、我的/全店 |
| `auth.login` | 登录 |
| `nav.back` | 返回列表 |

词表外使用项目本地 id：`<module>.<verb>`（如 `inventory.query`、`purchase.create`、`order.edit`、`onboarding.start`）。

## Fixture 标签 → id 映射

| label | id |
|---|---|
| 保存 | `form.submit` |
| 保存改期 | `form.reschedule` |
| 保存回访 | `form.submit` |
| 保存设置 | `form.submit` |
| 切换我的排单/全店 | `scope.toggle` |
| 切换日历/列表 | `view.toggle` |
| 取消 | `appointment.cancel` |
| 回访登记 | `customer.callback.create` |
| 客户详情 | `customer.view` |
| 已到店确认 | `appointment.check-in` |
| 已当面告知客户，确认 | `treatment.confirm` |
| 库存查询 | `inventory.query` |
| 开单 | `order.create` |
| 接单并确认到店 | `appointment.accept` |
| 搜索 | `search.submit` |
| 改期 | `appointment.reschedule` |
| 新增预约 | `appointment.create` |
| 新建联系人 | `customer.create` |
| 新建订单 | `order.create` |
| 术后告知 | `treatment.notice.view` |
| 查看告知 | `treatment.notice.view` |
| 查看完整详情 | `appointment.view` |
| 查看详情 | `appointment.view` |
| 查看预约 | `appointment.view` |
| 清空筛选 | `filter.clear` |
| 登录 | `auth.login` |
| 确认已当面告知 | `treatment.confirm` |
| 立即购买 | `purchase.create` |
| 编辑订单 | `order.edit` |
| 返回列表 | `nav.back` |
| 选择客户 | `customer.select` |

---

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `core/contracts/src/action.ts` | `ActionId`/`ActionRef`/`ActionPlacement` schema + 能力词表 | 新建 |
| `core/contracts/src/ui-brief.ts` | brief 契约 | `actions` → `ActionRef[]`，`businessStates/formModes.actions` → `ActionId[]`，新增 `overflowLabel` |
| `core/contracts/src/page-spec.ts` | PageSpec 契约 | `businessStates/formModes.actions` → `ActionId[]` |
| `pipeline/scripts/migrate-brief-actions.ts` | 一次性迁移工具 | 新建 |
| `core/design-system/src/semantic-ids.ts` | 语义 node id 映射 | 增加 id → 短键映射，保持 node id 不变 |
| `core/compiler/src/compile-page-spec.ts` | 模板 | `btn(ref)`、`primaryAction(ref)`、7 处模板按 id 分支 |
| `core/renderer-html/src/index.ts` | 内联 JS | 11 处中文 action 判断改能力 id |
| `core/validators/src/semantic.ts` | `actionRepresented` | 按 id 判断，删除 label 特例 |
| `core/intake/src/gates.ts` | brief gate | id 校验/唯一/引用/能力要求 |
| `core/agents/src/roles/ui-briefer.ts` | prompt | 能力词表与 id 规则 |
| `samples/projects/*/ui-brief.json`（5） | 样例 brief | 迁移为 refs |
| `samples/agents/intake*/ui-briefer.json`（4） | intake fixtures | 迁移 `output.brief` |

---

## Task 1: 原子迁移（契约 + fixtures + compiler + renderer + gates）

> 这一步必须一次提交完成：schema 一改，compiler/renderer/gates/fixtures 必须同时对齐，
> 中间状态不允许 commit。

**Files:**
- Create: `core/contracts/src/action.ts`
- Create: `pipeline/scripts/migrate-brief-actions.ts`
- Modify: `core/contracts/src/ui-brief.ts`, `core/contracts/src/page-spec.ts`, `core/contracts/src/index.ts`
- Modify: `core/design-system/src/semantic-ids.ts`
- Modify: `core/compiler/src/compile-page-spec.ts`
- Modify: `core/renderer-html/src/index.ts`
- Modify: `core/validators/src/semantic.ts`
- Modify: `core/intake/src/gates.ts`
- Modify: 5 个 `samples/projects/*/ui-brief.json` + 4 个 `samples/agents/intake*/ui-briefer.json`
- Test: `core/contracts/tests/contracts.test.ts`, `core/compiler/tests/*`, `core/renderer-html/tests/renderer.test.ts`, `core/validators/tests/validators.test.ts`, `core/intake/tests/*`

**Interfaces:**
- Produces: `ActionRef`、`ActionId`、`ActionPlacement`、`ActionRefSchema`、`ActionIdSchema`、`ACTION_CAPABILITIES`、`ACTION_ID_PATTERN`。
- Produces: `SpecNode.Button.props.action = ActionId`。

### 1.1 契约

- [ ] **Step 1: 写失败契约测试**

在 `core/contracts/tests/contracts.test.ts` 追加：

```ts
import { ActionRefSchema, ACTION_ID_PATTERN } from "../src/index.js";

describe("action refs", () => {
  it("accepts namespaced ids with labels", () => {
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

  it("rejects non-namespaced or non-ascii ids", () => {
    expect(ActionRefSchema.safeParse({ id: "改期", label: "改期" }).success).toBe(false);
    expect(ActionRefSchema.safeParse({ id: "Reschedule", label: "改期" }).success).toBe(false);
    expect(ActionRefSchema.safeParse({ id: "appointment", label: "改期" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm exec vitest run core/contracts/tests/contracts.test.ts -t "action refs"
```

Expected: FAIL（`ActionRefSchema` 未导出）。

- [ ] **Step 3: 新建 `core/contracts/src/action.ts`**

```ts
import { z } from "zod";

/** Namespaced ASCII id: `form.submit`, `appointment.check-in`. */
export const ACTION_ID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;
export const ActionIdSchema = z
  .string()
  .regex(ACTION_ID_PATTERN, "invalid action id");

export const ACTION_PLACEMENTS = [
  "footer",
  "card-actions",
  "overflow",
  "inline",
] as const;
export const ActionPlacementSchema = z.enum(ACTION_PLACEMENTS);
export type ActionPlacement = z.infer<typeof ActionPlacementSchema>;
export type ActionId = z.infer<typeof ActionIdSchema>;

export const ActionRefSchema = z
  .object({
    id: ActionIdSchema,
    label: z.string().min(1),
    placement: ActionPlacementSchema.optional(),
  })
  .strict();
export type ActionRef = z.infer<typeof ActionRefSchema>;

/** Behavior vocabulary. Extend with a new id + behavior + test, never per-project forks. */
export const ACTION_CAPABILITIES = {
  "form.submit": "submit the current form",
  "form.reschedule": "submit a reschedule form",
  "form.cancel": "cancel the current form",
  "appointment.create": "start a new appointment",
  "appointment.reschedule": "start rescheduling an appointment",
  "appointment.cancel": "cancel an appointment",
  "appointment.accept": "accept an appointment",
  "appointment.check-in": "confirm customer arrival",
  "appointment.view": "open appointment detail",
  "customer.view": "open customer detail",
  "customer.select": "pick a customer",
  "customer.create": "create a customer record",
  "customer.callback.create": "start a callback registration",
  "order.create": "create an order",
  "treatment.notice.view": "view the treatment notice",
  "treatment.confirm": "confirm the notice was delivered",
  "filter.clear": "clear filters",
  "search.submit": "run a search",
  "search.clear": "clear the search keyword",
  "view.toggle": "toggle calendar/list or my/all",
  "auth.login": "sign in",
  "nav.back": "return to the previous list",
} as const;
export type CapabilityId = keyof typeof ACTION_CAPABILITIES;
export const CAPABILITY_IDS = Object.keys(ACTION_CAPABILITIES) as CapabilityId[];
```

- [ ] **Step 4: 更新 brief 契约**

`core/contracts/src/ui-brief.ts`：

```ts
import { ActionIdSchema, ActionRefSchema, type ActionId, type ActionRef } from "./action.js";
```

接口字段改为：

```ts
  actions?: ActionRef[];
  /** Overflow trigger label; defaults to 更多 when overflow actions exist. */
  overflowLabel?: string;
  businessStates?: Array<{ name: string; actions: ActionId[]; note?: string }>;
  formModes?: Array<{
    name: "new" | "reschedule";
    label: string;
    actions: ActionId[];
    customerLocked?: boolean;
  }>;
```

schema 字段改为：

```ts
    actions: z
      .array(z.union([ActionRefSchema, z.string().min(1)]))
      .optional()
      .superRefine((list, ctx) => {
        list?.forEach((value, index) => {
          if (typeof value === "string") {
            ctx.addIssue({
              code: "custom",
              message:
                "BRIEF_SCHEMA_UNSUPPORTED: actions must be {id,label}; legacy string actions are rejected",
              path: [index],
            });
          }
        });
      })
      .transform((list) => list as ActionRef[] | undefined),
    overflowLabel: z.string().min(1).optional(),
    businessStates: z
      .array(
        z
          .object({
            name: z.string().min(1),
            actions: z.array(ActionIdSchema),
            note: z.string().min(1).optional(),
          })
          .strict()
      )
      .optional(),
    formModes: z
      .array(
        z
          .object({
            name: z.enum(["new", "reschedule"]),
            label: z.string().min(1),
            actions: z.array(ActionIdSchema),
            customerLocked: z.boolean().optional(),
          })
          .strict()
      )
      .optional(),
```

- [ ] **Step 5: 更新 PageSpec 契约**

`core/contracts/src/page-spec.ts`：`businessStates` 与 `formModes` 的 `actions` 从
`z.array(z.string().min(1))` 改为 `z.array(ActionIdSchema)`，TS 类型同步为 `ActionId[]`。

- [ ] **Step 6: 导出新契约**

`core/contracts/src/index.ts` 增加：

```ts
export * from "./action.js";
```

- [ ] **Step 7: 加语义 id 映射（保持 node id 不变）**

`core/design-system/src/semantic-ids.ts` 的 `ACTION_KEYS` 追加 id → 短键（与同义 label
的键一致）：

```ts
  "appointment.check-in": "checkin",
  "appointment.accept": "checkin",
  "order.create": "open-order",
  "appointment.reschedule": "reschedule",
  "appointment.cancel": "cancel",
  "treatment.notice.view": "notice",
  "customer.view": "customer",
  "appointment.view": "view-appointment",
  "customer.callback.create": "callback",
  "appointment.create": "new-appointment",
  "form.submit": "save",
  "form.reschedule": "save-reschedule",
  "form.cancel": "cancel",
  "customer.select": "pick-customer",
  "treatment.confirm": "confirm",
  "view.toggle": "toggle-view",
  "search.clear": "clear",
  "search.submit": "search",
  "filter.clear": "clear",
  "auth.login": "login",
  "nav.back": "back",
```

### 1.2 迁移 fixtures

- [ ] **Step 8: 新建迁移脚本**

`pipeline/scripts/migrate-brief-actions.ts`：

```ts
import { readFileSync, writeFileSync } from "node:fs";

const MAP: Record<string, string> = {
  保存: "form.submit",
  保存改期: "form.reschedule",
  保存回访: "form.submit",
  保存设置: "form.submit",
  "切换我的排单/全店": "view.toggle",
  "切换日历/列表": "view.toggle",
  取消: "appointment.cancel",
  回访登记: "customer.callback.create",
  客户详情: "customer.view",
  已到店确认: "appointment.check-in",
  "已当面告知客户，确认": "treatment.confirm",
  库存查询: "inventory.query",
  开单: "order.create",
  接单并确认到店: "appointment.accept",
  搜索: "search.submit",
  改期: "appointment.reschedule",
  新增预约: "appointment.create",
  新建联系人: "customer.create",
  新建订单: "order.create",
  术后告知: "treatment.notice.view",
  查看告知: "treatment.notice.view",
  查看完整详情: "appointment.view",
  查看详情: "appointment.view",
  查看预约: "appointment.view",
  清空筛选: "filter.clear",
  登录: "auth.login",
  确认已当面告知: "treatment.confirm",
  立即购买: "purchase.create",
  编辑订单: "order.edit",
  返回列表: "nav.back",
  选择客户: "customer.select",
};

function idFor(value: string): string {
  const mapped = MAP[value];
  if (mapped !== undefined) return mapped;
  // Idempotent: an already-migrated id is valid input.
  if (/^[a-z][a-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/.test(value)) return value;
  throw new Error(`UNMAPPED_ACTION: ${value}`);
}

function migrateBrief(brief: any): void {
  for (const page of brief.ia.pages) {
    const seen = new Set<string>();
    page.actions = (page.actions ?? []).map((value: any) => {
      if (typeof value === "object") return value;
      const id = idFor(value);
      if (seen.has(id)) {
        throw new Error(`DUPLICATE_ACTION: ${page.id} -> ${id}`);
      }
      seen.add(id);
      return { id, label: value };
    });
    for (const state of page.businessStates ?? []) {
      state.actions = state.actions.map(idFor);
    }
    for (const mode of page.formModes ?? []) {
      mode.actions = mode.actions.map(idFor);
    }
  }
}

const checkOnly = process.argv.includes("--check");
for (const file of process.argv.slice(2).filter((arg) => arg !== "--check")) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  migrateBrief(json.output?.brief ?? json);
  if (checkOnly) {
    console.log(`checked ${file}`);
  } else {
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
    console.log(`migrated ${file}`);
  }
}
```

> 注意：`label` 始终保留原文案；迁移只补 `id`。

- [ ] **Step 9: 迁移全部 fixtures**

```bash
pnpm exec tsx scripts/migrate-brief-actions.ts \
  samples/projects/employee-app/ui-brief.json \
  samples/projects/employee-app-appointments-03/ui-brief.json \
  samples/projects/employee-app-phase2/ui-brief.json \
  samples/projects/demo-crm/ui-brief.json \
  samples/projects/demo-orders-intake/ui-brief.json \
  samples/agents/intake/ui-briefer.json \
  samples/agents/intake-employee-app/ui-briefer.json \
  samples/agents/intake-appointments-03/ui-briefer.json \
  samples/agents/intake-employee-app-phase2/ui-briefer.json
```

Expected: 9 行 `migrated …`，无 `UNMAPPED_ACTION` / `DUPLICATE_ACTION`。

- [ ] **Step 10: 校验迁移结果（幂等重跑）**

```bash
pnpm exec tsx scripts/migrate-brief-actions.ts --check \
  samples/projects/employee-app/ui-brief.json \
  samples/projects/employee-app-appointments-03/ui-brief.json \
  samples/projects/employee-app-phase2/ui-brief.json \
  samples/projects/demo-crm/ui-brief.json \
  samples/projects/demo-orders-intake/ui-brief.json \
  samples/agents/intake/ui-briefer.json \
  samples/agents/intake-employee-app/ui-briefer.json \
  samples/agents/intake-appointments-03/ui-briefer.json \
  samples/agents/intake-employee-app-phase2/ui-briefer.json
```

Expected: 9 行 `checked …`，无 `UNMAPPED_ACTION` / `DUPLICATE_ACTION`。

### 1.3 Compiler

- [ ] **Step 11: 替换 `btn` / `actionButtons` / `primaryAction`**

`core/compiler/src/compile-page-spec.ts` 顶部：

```ts
function btn(action: ActionRef, emphasis = "primary"): SpecNode {
  return { type: "Button", props: { label: action.label, emphasis, action: action.id } };
}

function primaryAction(actions: ActionRef[], fallback: ActionRef): ActionRef {
  return actions.find((action) => action.placement === "footer") ?? actions[0] ?? fallback;
}

function actionButtons(page: UiBriefPage, defaults: ActionRef[]): SpecNode[] {
  const actions = page.actions && page.actions.length > 0 ? page.actions : defaults;
  return actions.map((action, index) =>
    btn(action, index === 0 ? "primary" : "secondary")
  );
}
```

删除旧的 `btn`、`actionButtons`、`primaryAction(labels: string[])`。import 增加
`type ActionRef`。

- [ ] **Step 12: 逐个模板替换**

| 位置 | 旧 | 新 |
|---|---|---|
| `actionButtons(page, ["保存","取消"])`（约 556） | string defaults | `actionButtons(page, [{ id:"form.submit",label:"保存" },{ id:"appointment.cancel",label:"取消" }])` |
| `actionButtons(page, ["保存"])`（约 594） | string defaults | `actionButtons(page, [{ id:"form.submit", label:"保存" }])` |
| `actionButtons(page, ["登录"])`（约 1271） | string defaults | `actionButtons(page, [{ id:"auth.login", label:"登录" }])` |
| `actionButtons(page, ["开始","稍后"])`（约 1285） | string defaults | `actionButtons(page, [{ id:"onboarding.start",label:"开始" },{ id:"onboarding.skip",label:"稍后" }])` |
| `FilterBar.props.action = actions[0]` | ref object | `actions[0]?.label ?? "新建"` |
| `extraActions.map((action) => btn(action, "secondary"))` | ref | 不变（`btn` 已接 ref） |
| `btn("清空筛选","secondary")`（约 976） | label | `btn({ id:"filter.clear", label:"清空筛选" }, "secondary")` |
| `btn("清空关键词","secondary")`（约 977） | label | `btn({ id:"search.clear", label:"清空关键词" }, "secondary")` |
| `secondaryActions.map((label) => btn(label,"secondary"))`（约 1052） | label | `secondaryActions.map((action) => btn(action,"secondary"))` |
| `/日历.*列表/.test(label)`（约 1053） | 正则 | `action.id === "view.toggle"` |
| `actions = page.actions ?? ["保存"]`（约 1148） | strings | `page.actions ?? [{ id:"form.submit", label:"保存" }]` |
| `alternateActions = actions.filter(label => label !== primary && /保存|提交|确认/.test(label))`（约 1150） | 正则 | `actions.filter(a => a.id !== primary.id && a.id === "form.reschedule")` |
| `otherActions = actions.filter(label => ... !(hasCustomerField && label === "选择客户"))`（约 1155） | label | `actions.filter(a => a.id !== primary.id && !alternateActions.includes(a) && !(hasCustomerField && a.id === "customer.select"))` |
| `otherActions.map((label) => btn(label,"ghost"))`（约 1238） | label | `otherActions.map((action) => btn(action,"ghost"))` |
| `actions: [btn(primary,"primary")]`（约 1242） | label | 不变（`primary` 已是 ref） |
| `primaryAction(actions, "新增")`（约 850） | string fallback | `primaryAction(actions, { id:"appointment.create", label:"新增" })` |
| `secondaryActions` 过滤 `label !== "查看完整详情"` / `"查看详情"`（约 851） | label | `action.id !== "appointment.view"` |
| `(page.actions ?? []).includes("保存")` / `"保存改期"`（约 328） | label | `(page.actions ?? []).some(a => a.id === "form.submit")` / `"form.reschedule"`；派生 formModes 的 actions 写 id |
| `buildInteractions` 的 `trigger: action`（约 1473） | label | `trigger: action.id` |

- [ ] **Step 13: 重写 `detailLayout` 的动作分组**

```ts
function detailLayout(page: UiBriefPage, nav: string[], tabs: string[]): SpecNode {
  const fields = page.fields ?? [];
  const summaryTitle = page.summaryTitle ?? `${page.name}摘要`;
  const actions = page.actions?.length
    ? page.actions
    : [{ id: "form.submit", label: "编辑" }];
  const primary = primaryAction(actions, actions[0]!);
  const openOrder = actions.find(
    (action) => action.id === "order.create" && action.id !== primary.id
  );
  const footerRefs = [primary, ...(openOrder === undefined ? [] : [openOrder])];
  const checkinPrimary =
    primary.id === "appointment.check-in" || primary.id === "appointment.accept";
  const values = page.mockData?.values;
  const serviceCompletedValue = values?.serviceCompleted;
  const serviceCompleted =
    serviceCompletedValue === undefined ||
    !/^(否|false|no|未完成)$/i.test(String(serviceCompletedValue).trim());
  const secondary = actions
    .filter((action) => !footerRefs.some((footer) => footer.id === action.id))
    .filter(
      (action) =>
        !(
          checkinPrimary &&
          (action.id === "appointment.check-in" || action.id === "appointment.accept")
        )
    )
    .filter(
      (action) => action.id !== "treatment.notice.view" || serviceCompleted
    );
  const orderedSecondary = [
    ...secondary.filter((action) => action.id !== "appointment.cancel"),
    ...secondary.filter((action) => action.id === "appointment.cancel"),
  ];
  const actionsNodes = footerRefs.map((action, index) =>
    btn(action, index === 0 ? "primary" : "secondary")
  );
  const secondaryActions = orderedSecondary.map((action) =>
    btn(action, action.id === "appointment.cancel" ? "danger" : "ghost")
  );
  // 后续函数体沿用原逻辑，只把 `actions`/`secondaryActions` 当作 SpecNode 使用。
}
```

注意：原函数里 `actions`（按钮节点）与 `secondaryActions`（按钮节点）名字沿用；新的
`actions`（ActionRef）改名为 `actionRefs`，避免混淆：

```ts
  const actionRefs = page.actions?.length ? page.actions : [{ id: "form.submit", label: "编辑" }];
  const primary = primaryAction(actionRefs, actionRefs[0]!);
  ...
  const actions = footerRefs.map(...);            // SpecNode[]
  const secondaryActions = orderedSecondary.map(...); // SpecNode[]
```

- [ ] **Step 14: 运行编译器测试，修剩余类型错误**

```bash
pnpm exec vitest run core/compiler/tests
pnpm typecheck
```

Expected: compiler 测试通过；typecheck 可能在 renderer/tests 处报错，进入下一步。

### 1.4 Renderer JS

- [ ] **Step 15: 替换 11 处 label 判断**

`core/renderer-html/src/index.ts`：

| 旧 | 新 |
|---|---|
| `action === "改期"` | `action === "appointment.reschedule"` |
| `action === "术后告知"` | `action === "treatment.notice.view"` |
| `action === "客户详情"` | `action === "customer.view"` |
| `action === "开单"` | `action === "order.create"` |
| `action === "已到店确认" \|\| action === "接单并确认到店"` | `action === "appointment.check-in" \|\| action === "appointment.accept"` |
| `action === "取消"` | `action === "appointment.cancel"` |
| `action === "确认已当面告知"` | `action === "treatment.confirm"` |
| `[data-action="选择客户"]`（2 处） | `[data-action="customer.select"]` |
| `[data-action="清空关键词"]` | `[data-action="search.clear"]` |
| `[data-action="清空筛选"]` | `[data-action="filter.clear"]` |

`formModes` 的 `current.actions[0]` 现在天然是 id，`submit.dataset.action` 赋值逻辑不变。

- [ ] **Step 16: 更新 renderer 测试**

`core/renderer-html/tests/renderer.test.ts`：

- `expect(html).toContain('data-action="已到店确认"')` → `'data-action="appointment.check-in"'`
- `expect(form).toContain('data-action="选择客户"')` → `'data-action="customer.select"'`
- 其余断言「文案仍存在」的保留（label 未变）。

### 1.5 Validators 与 brief gate

- [ ] **Step 17: 改 `actionRepresented`**

`core/validators/src/semantic.ts`：

```ts
function actionRepresented(actionId: string, facts: LayoutFacts, spec: PageSpec): boolean {
  if (facts.buttonActions.has(actionId)) return true;

  if (
    spec.formModes?.some((mode) => mode.actions.includes(actionId)) === true
  ) {
    return true;
  }

  if (spec.businessStates?.some((state) => state.actions.includes(actionId)) === true) {
    return true;
  }

  if (actionId === "search.submit" && facts.hasSearchBar) return true;

  if (actionId === "appointment.view" && listDetailAffordance(spec, facts)) return true;

  if (
    (actionId === "appointment.check-in" || actionId === "appointment.accept") &&
    facts.buttonActions.has("appointment.check-in")
  ) {
    return true;
  }

  return false;
}
```

调用处：

```ts
for (const ref of briefPage.actions ?? []) {
  if (!actionRepresented(ref.id, facts, spec)) {
    push(
      "SEMANTIC-ACTION",
      "layout",
      ref.id,
      `Brief action "${ref.label}" (${ref.id}) has no Button, form mode, business state, or detail-affordance representation in the page layout.`
    );
  }
}
```

删除 `facts.buttonLabels` / `quickActionLabels` / `filterBarActions` 的 label 分支（如果
还有其他调用点，逐一改为 id）。

- [ ] **Step 18: brief gate 增加 id 校验**

`core/intake/src/gates.ts` 在 page 循环内加：

```ts
const actionRefs = page.actions ?? [];
const actionIds = new Set<string>();
for (const ref of actionRefs) {
  if (actionIds.has(ref.id)) {
    issues.push(
      issue("BRIEF_ACTION_DUPLICATE", "blocker", `page ${page.id} has duplicate action id ${ref.id}`, ref.id)
    );
  }
  actionIds.add(ref.id);
}
for (const state of page.businessStates ?? []) {
  for (const id of state.actions) {
    if (!actionIds.has(id)) {
      issues.push(
        issue(
          "BRIEF_BUSINESS_STATE_ACTION_UNKNOWN",
          "blocker",
          `state ${state.name} uses unknown action id ${id}`,
          id
        )
      );
    }
  }
}
for (const mode of page.formModes ?? []) {
  for (const id of mode.actions) {
    if (!actionIds.has(id)) {
      issues.push(
        issue(
          "BRIEF_FORM_MODE_ACTION_UNKNOWN",
          "blocker",
          `mode ${mode.name} uses unknown action id ${id}`,
          id
        )
      );
    }
  }
}
const required: string[] = [];
if (page.archetype === "mobile-form") required.push("form.submit");
if ((page.views ?? []).length > 0) required.push("view.toggle");
if (page.customerPicker !== undefined) required.push("customer.select");
if ((page.filterFields ?? []).length > 0) required.push("filter.clear");
for (const id of required) {
  if (!actionIds.has(id)) {
    issues.push(
      issue(
        "BRIEF_ACTION_CAPABILITY_MISSING",
        "blocker",
        `page ${page.id} requires capability ${id}`,
        page.id
      )
    );
  }
}
```

`hostAction` 判断改为 `.label`：

```ts
const hostAction = (page.actions ?? []).find((ref) =>
  /前往客户\s*(Tab|页)|前往工作台|打开工作台|前往我的|我的\s*(Tab|页)/.test(ref.label)
);
```

- [ ] **Step 19: 更新 contracts/validators/intake 测试 fixture**

把内联 fixture 的 `actions: ["已到店确认","开单","取消"]` 改成 refs；`businessStates` /
`formModes` 的 actions 改成 id。受影响文件：

- `core/contracts/tests/contracts.test.ts`（约 198–297）
- `core/validators/tests/validators.test.ts`（约 707 的 "保存改期" 断言改为 id 或保留 label 断言）
- `core/intake/tests/*.test.ts`（grep `actions:` / `businessStates` / `formModes`）

- [ ] **Step 20: 全量测试直到绿**

```bash
pnpm test
pnpm typecheck
```

Expected: 全绿。若失败，按错误逐个修 fixture 或断言；不允许为过测试而放宽 schema。

- [ ] **Step 21: 视觉不变验证**

```bash
rm -rf /tmp/v08-batch2-html
pnpm render:html --run artifacts/employee-app-phase2/figma/spec-source --out /tmp/v08-batch2-html
# 与 v0.7 签核 HTML 比对：标签文字应一致，只有 data-action 值变化
```

Expected: `data-action` 从中文变为 id；可见文本（label）不变。

- [ ] **Step 22: 提交（原子）**

```bash
git add core/contracts core/design-system core/compiler core/renderer-html core/validators core/intake scripts samples
git commit -m "feat(v0.8): migrate brief actions to end-to-end action ids"
```

---

## Task 2: Briefer prompt 与能力词表约束

**Files:**
- Modify: `core/agents/src/roles/ui-briefer.ts`
- Test: `core/agents/tests/*`（prompt 断言 / fixture 校验）

**Interfaces:**
- Consumes: `ACTION_CAPABILITIES` from `@prd-ui/contracts`.
- Produces: prompt 要求 `actions: [{id,label}]`。

- [ ] **Step 1: 写失败测试**

在 `core/agents/tests` 中找 briefer prompt 的现有断言（grep `actions`），追加：

```ts
it("lists the capability vocabulary and requires {id,label}", () => {
  const prompt = buildUiBrieferPrompt(input);
  expect(prompt).toContain("form.submit");
  expect(prompt).toContain("appointment.check-in");
  expect(prompt).toContain("{id,label}");
});
```

（`buildUiBrieferPrompt` 以该文件实际导出名为准。）

- [ ] **Step 2: 运行确认失败**

```bash
pnpm exec vitest run core/agents/tests -t "capability vocabulary"
```

- [ ] **Step 3: 在 prompt 的 Mapping rules 后插入**

```ts
    "## Action ids",
    "- Every action is `{ id, label }`. `id` is namespaced ASCII (e.g. `appointment.reschedule`); `label` is the PRD wording.",
    "- Use a capability id when the action means that behavior; the label may differ from the id.",
    `- Capability ids: ${Object.keys(ACTION_CAPABILITIES).join(", ")}.`,
    "- For actions outside the vocabulary mint `<module>.<verb>` (e.g. `inventory.transfer`). Never derive an id from Chinese text.",
    "- businessStates/formModes actions reference ids, not labels.",
    "- If the behavior is ambiguous, ask a blocking question; never guess a capability.",
```

import 增加：

```ts
import { ACTION_CAPABILITIES } from "@prd-ui/contracts";
```

- [ ] **Step 4: 运行测试确认通过并提交**

```bash
pnpm exec vitest run core/agents/tests
git add core/agents
git commit -m "feat(agents): require action ids in the briefer prompt"
```

---

## Task 3: 端到端验证、文档与收尾

**Files:**
- Modify: `AGENTS.md`（D2 状态）
- Create: `docs/handoffs/2026-10-27-v08-batch2.md`

**Interfaces:**
- Consumes: Task 1–2。
- Produces: 批次证据与新 brief hash。

- [ ] **Step 1: intake fixture 跑通**

```bash
pnpm intake:run --project samples/projects/employee-app/project.yaml \
  --prd samples/projects/employee-app/prd.md \
  --fixtures samples/agents/intake-employee-app \
  --runs /tmp/v08-batch2-intake
```

Expected: brief gate passed；`ui-brief.json` 的 actions 是 refs。

- [ ] **Step 2: 四个项目 phase1**

```bash
for p in samples/projects/employee-app/project.yaml \
         samples/projects/employee-app-phase2/project.yaml \
         samples/projects/employee-app-appointments-03/project.yaml \
         samples/project.demo-orders-intake.yaml; do
  pnpm phase1:verify --project "$p" --runs "/tmp/v08-batch2-$(basename $(dirname $p))"
done
```

Expected: 2 / 8 / 4 / 8 pages，0 blocker。

- [ ] **Step 3: 8 页渲染 + conformance**

```bash
rm -rf /tmp/v08-batch2-8p-html
pnpm render:html --run artifacts/employee-app-phase2/figma/spec-source --out /tmp/v08-batch2-8p-html
pnpm figma:conformance \
  --spec-run artifacts/employee-app-phase2/figma/spec-source \
  --html /tmp/v08-batch2-8p-html \
  --plans artifacts/employee-app-phase2/figma/plans \
  --out /tmp/v08-batch2-conformance
```

Expected: 0 blocker / 0 major / 233 checked。

- [ ] **Step 4: 全量门禁**

```bash
pnpm test
pnpm test:dsh
pnpm typecheck
pnpm --dir runtimes/figma typecheck && pnpm --dir runtimes/figma build
```

- [ ] **Step 5: 记录新 brief hash 与重签说明**

```bash
shasum -a 256 samples/projects/employee-app-phase2/ui-brief.json
```

写入交接文档：旧 hash 已失效，需人工重新签核（brief 内容语义等价，label 未变）。

- [ ] **Step 6: 更新 AGENTS.md**

把 D2 条目改为已关闭，并记录能力词表位置：

```markdown
- **Action contract:** closed in v0.8 Batch 2. `actions` is `ActionRef[]`
  (`id`/`label`/`placement`); behavior dispatches on capability ids, labels are
  display-only. Legacy string actions are rejected. `placement` is stored but
  consumed in Batch 3.
```

- [ ] **Step 7: 新建 `docs/handoffs/2026-10-27-v08-batch2.md`**

包含：改了什么、迁移的 9 个 fixture、能力词表版本、新 brief hash、测试/门禁数字、
未做（placement/ActionMenu/多状态在后续批次）。

- [ ] **Step 8: 提交**

```bash
git add AGENTS.md docs/handoffs/2026-10-27-v08-batch2.md
git commit -m "docs: record v0.8 batch 2 (end-to-end action ids)"
```

---

## Self-Review

- **Spec coverage:** 覆盖 spec A1（端到端 actionId、能力词表、brief 绑定、迁移）。
  `placement` 仅写入契约，A2 的消费在 Batch 3；多状态/parity 不在本计划。
- **Placeholder scan:** 无 TBD；模板替换用表格给出精确 before/after；迁移脚本含完整映射。
- **Type consistency:** `ActionRef`/`ActionId`/`ActionPlacement` 与 `btn(ref)`/`primaryAction(refs,fallback)` 在 Task 1 内定义并被后续步骤引用；`ACTION_CAPABILITIES` 在契约与 prompt 中共用。
- **风险：** 迁移脚本按 label 映射，重复 id 会抛错（例如同页两个「查看详情」）；遇到时应在
  fixture 里给第二个动作加项目本地 id（`<page>.<verb>`），不要放宽唯一性校验。
