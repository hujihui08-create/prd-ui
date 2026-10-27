# v0.8 技术债收口设计（P0 / P1 / P2）

- 日期：2026-10-27
- 状态：**Draft（2026-10-27 决策对接后更新，未实施）**
- 输入：[AGENTS.md Technical debt](../../AGENTS.md)、
  [v0.7 实施交接](../handoffs/2026-10-26-v07-implementation-handoff.md) §10、
  [v0.7 终审修复](../handoffs/2026-10-26-v07-final-review-fixes.md)
- 关联：[版本路线](../plans/2026-10-23-version-roadmap.md)、
  [v0.7 设计](2026-10-26-v07-visual-gates-structure-handoff-design.md)、
  [v0.6 设计](2026-10-23-v06-figma-studio-asset-compiler-design.md)

> 路径注意：v0.7 代码与 v0.7 交接目前只在 `v0.7-visual-gates` 分支
> （`.worktrees/v0.7`），`main` 只有文档。本文件写在 `main`；合并后与代码同树。

## 0. 决策记录（2026-10-27 对接）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 动作身份 | **端到端 `actionId`，v0.8 内完成**；不再按 label 绑定 |
| 2 | brief 契约形状 | **单一数组 + 每项 placement**；`businessStates`/`formModes` 改引用 id |
| 3 | overflow | **v0.8 实现 `ActionMenu`**，不做「换行凑合」 |
| 4 | `Switch`/`InventoryCard` | **补齐映射**（renderer id + Figma 样式），不标 partial、不从 sample 移除 |
| 5 | Figma 状态帧 | **全量多状态 + 逐状态门禁**；变体集合对齐 24 个 baseline case |
| 6 | 多状态铺开 | **机制 + `today` 试点在 v0.8，8 页铺开拆 v0.8.1** |
| 7 | parity 阈值 | **分 case 阈值 = 实测 + 固定余量**，config 记录实测值与 baselineHash |

决策 1–4 互相咬合：端到端 id 是 `ActionMenu` 和 placement 的前提；`ActionMenu` 是新组件，
必须走「五处联动」清单；`Switch`/`InventoryCard` 的补齐顺带把 id 发射机制修成统一的，
避免新组件再踩同一个坑。

## 1. 结论

1. **先合并再开工**：`v0.7-visual-gates` 合入 `main` 是 v0.8 的第 0 个任务；合并前
   不改任何 v0.8 代码。
2. **动作身份端到端**：`actions` 变成 `ActionRef[]`（`id` / `label` / 可选
   `placement`）；能力词表负责行为 id，项目本地命名空间负责词表外的动作；
   label 只做展示。编译器和内联 JS 里所有中文 label 判断全部删除。
3. **位置与 overflow 进契约**：默认级联 `footer → card-actions(≤3) → overflow`；
   `inline` 仅保留为显式 legacy；`ActionMenu` 是正式组件，有独立 id、Figma 表示和
   conformance 规则。
4. **组件按机制修**：renderer 35 个分支里 13 个不自己发 `data-node-id`；改为统一
   发射 + 全类型契约测试 + 五处联动清单；`Switch`/`InventoryCard` 补齐样式映射。
5. **A3 几乎零成本**：`spec-run-v07` 已是真实 spec run，8 页 `page-spec` 与
   `figma/spec-source` 逐字节一致；只改打包指向并在 manifest 记录 `specRun`。
6. **smoke 纳入 verify**：`figma:verify` 只读 `plan + readback`；v0.8 让
   `v07:smoke` 跑第 5 步，`complete` 要求 verify 通过。
7. **parity 分 case**：每 case 阈值 = 实测 + 余量，config 记录 `measured`；
   改阈值必须重算并重签。
8. **多状态分两步**：v0.8 完成多状态 plan 机制、逐状态门禁和 `today` 试点；
   8 页 24 个 case 的铺开作为 v0.8.1。v0.8 的交付包仍标注「状态帧未全量铺开」。

## 2. 现状

v0.7 已于 2026-10-27 签核：conformance 0 blocker / 0 major（233 checked）、delivery
`figma:verify` 8/8、parity 8/8（全局 calibrated）、Visual Critic 0/0/3 minor、
`v07:smoke` `complete: true`、`handoff:pack` 114 files + zip。测试 **987 passed /
87 files**，`test:dsh` 4 passed，typecheck clean。

但收口只覆盖「8 页样例的默认态 + 已实现组件」。本轮对接把原来的 15 项债务扩展为
16 项（新增 D16 多状态），并改变了 4 项的关闭方式。

| 类别 | 表现 | 债务 |
|---|---|---|
| 流程 | 签核实现未合并 | D1 |
| 契约缺口 | 动作无身份/位置语义，只能塞进视觉槽位 | D2 |
| 实现缺口 | 类型存在但映射/证据不完整 | D3、D4、D8 |
| 门禁盲区 | 门禁只覆盖可无头执行的部分，或阈值/采样不可复现 | D5、D6、D7、D9 |
| 证据缺口 | Figma 只有默认态，状态无逐状态门禁 | D16 |
| 泛化不足 | 内容生成、分块、修复、资产、签核仍绑定样例 | D10–D15 |

债务编号（后续章节按此引用）：

| ID | 债务 | 目标 | 关闭方式 |
|---|---|---|---|
| D1 | v0.7 分支未合并 | v0.8 Batch 0 | 合并 + 合并后重跑门禁 |
| D2 | IA 无动作身份与位置语义 | v0.8 Batch 2–3 | 端到端 actionId + placement + ActionMenu |
| D3 | 组件映射/id 发射不完整 | v0.8 Batch 1 | 统一 id + 五处清单 + Switch/InventoryCard 补齐 |
| D4 | `figma/spec-source` 非完整 spec run | v0.8 Batch 3 | 指向 `spec-run-v07` + manifest 记录 |
| D5 | `v07:smoke` 不含 `figma:verify` | v0.8 Batch 4 | smoke 第 5 步 |
| D6 | parity 只有全局单档且偏松 | v0.8 Batch 5 | 分 case 阈值 + 实测值入 config |
| D7 | Visual Critic 采样不确定 | v0.8 Batch 6 | deterministic/advisory 分流 + 复核采样 |
| D8 | Handoff 缺口 | v0.8 Batch 4–5 | 打包 delivery 证据、字体子集、block manifest |
| D9 | structure 只 warning | v0.8 Batch 6 | severity overrides + 3 条规则升 blocker |
| D10 | Briefer typed content 项目专用 | v0.8 Batch 7 | `content` 通道（最小） |
| D11 | 分块结论过期 | v0.8 Batch 7 | 重评协议 + 报告 |
| D12 | Spec Engineer 无 repair | v0.9 | 有界 repair 契约 |
| D13 | 资产 B/C 未接真实供应商 | v0.9/M2 | 冻结 adapter 契约 |
| D14 | M1 签核未绑定内容 hash | v0.8 Batch 8 | signoff schema 硬化 |
| D15 | 3 个视觉 minor + v0.6.x 遗留 | v0.8 Batch 8 | 修复 + 新 baseline；库/矢量集推迟 |
| D16 | Figma 只有默认态，状态无门禁 | v0.8 机制+试点；v0.8.1 铺开 | 多状态 plan + 逐状态门禁 |

## 3. 目标与非目标

目标：

- P0（D1–D4）**全部关闭**，且每项有可复现证据。
- P1（D5–D9）全部变成门禁，或转成带 owner + expiry 的显式 waiver。
- D16 在 v0.8 完成机制、`today` 试点与逐状态门禁；8 页铺开在 v0.8.1 关闭。
- P2（D10–D15）给出契约与实验协议；D14 在 v0.8 关闭，D10/D11 给出结论，
  D12/D13/D15 的延期项写清版本与理由。

非目标：

- 不做全量组件库、不引入外部设计系统。
- 不接 M2 的真实资产供应商。
- 不新增页面能力/页面类型。
- 不替代人工视觉签核；自动化只负责「把问题变红」。
- 不做全量 a11y（axe/AA 全扫）——仍按 v0.5 的基线口径。

## 4. 设计原则

1. **契约先于模板**：先改 `core/contracts`，再改 `core/compiler` 的模板；禁止用模板
   特判消化语义缺失。
2. **Fail-closed**：表达不了的状态必须失败并给 reason；「degraded 且不检查」不算通过。
3. **单一来源**：能从 HTML/CSSOM、profile 或 baseline case 派生，就不要手写常量。
4. **证据 hash 绑定**：每个门禁产出 JSON，签核绑定输入 hash；stored `passed` 不可信。
5. **身份与文案分离**：行为按 id、展示按 label；同一 id 在不同项目可以有不同文案。
6. **兼容优先**：契约变更 additive；删除/改语义必须同时升 schema 版本并写迁移说明。

## 5. Part 0 — 合并与冻结（D1）

### 5.1 前置检查

在 `.worktrees/v0.7` 执行并记录输出：

```bash
git status --short          # 必须干净；AGENTS.md 的文档同步先单独提交
pnpm test                   # 987 passed / 87 files
pnpm test:dsh               # 4 passed / 3 files
pnpm typecheck
pnpm --dir runtimes/figma typecheck && pnpm --dir runtimes/figma build
pnpm v07:smoke ... --json   # complete: true
```

### 5.2 合并协议

- 用 **merge commit**（不用 squash），保留 43 个提交的审查历史。
- 合并前把 v0.7 分支的 `AGENTS.md` 与 `main` 的版本对齐（当前已同步，内容一致）。
- 冲突处理原则：`docs/handoffs/2026-10-26-v07-*.md` 以分支为准；`pipeline/artifacts/`
  以分支为准；`AGENTS.md` 以包含 Technical debt 章节的版本为准。
- 合并后 `main` 立即打 tag：`v0.7.0`（本地，不 push）。

### 5.3 合并后必跑（在 `main` 上）

| 命令 | 期望 |
|---|---|
| `pnpm test` | ≥987 passed，0 failed |
| `pnpm test:dsh` | 4 passed |
| `pnpm typecheck` | clean |
| `pnpm phase1:verify` 四个项目 | 8 / 2 / 4 / 8 pages，0 blocker |
| `pnpm v07:smoke` | `complete: true` |
| `git diff main v0.7-visual-gates -- pipeline/artifacts` | 空 |

### 5.4 验收

- `main` 与 v0.7 分支的 `pipeline/{core,runtimes}` 与 `artifacts` 无差异。
- `AGENTS.md` 的「Branch topology」段落改为「已合并」，并移除 worktree 限定语。

## 6. Part A — 试点前置（P0）

### A1. 动作身份：端到端 `actionId`（D2）

#### A1.1 问题

现在动作没有独立身份：

- brief 的 `actions` 是中文文案数组；编译器 `btn(label, emphasis, action = label)`
  让 `action` 永远等于 `label`；HTML 输出 `data-action="中文"`。
- 内联 JS 用中文做行为派发：`action === "改期"`（7 处 label 等值分支）、
  `[data-action="选择客户"]`、`[data-action="清空筛选"]`、`[data-action="清空关键词"]`。
- 编译器还有按中文判断的模板逻辑：`/新增|保存|提交|确认|登录/`、
  `actions.includes("保存")`、`actions.includes("保存改期")`、
  `/到店确认|确认到店/`、`label.includes("开单")`、`label !== "术后告知"`、
  `label === "取消"`。
- 已经出现不一致：`选择` 的 action 是 `选择客户`，`当场开单` 的 action 为空。

结果：文案即身份。改文案会同时改变行为、placement 和测试；换语言/换项目就没有可绑定
的语义。

#### A1.2 契约

```ts
// core/contracts/src/ui-brief.ts
export type ActionId = string; // ^[a-z][a-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$
export type ActionPlacement = "footer" | "card-actions" | "overflow" | "inline";

export interface ActionRef {
  id: ActionId;
  label: string;
  /** 缺省按 A2.2 的位置级联推导。 */
  placement?: ActionPlacement;
}

export interface UiBriefPage {
  actions?: ActionRef[];
  /** 溢出菜单触发器文案；存在 overflow 动作时生效，默认「更多」。 */
  overflowLabel?: string;
  /** 只引用 action id。 */
  businessStates?: Array<{ name: string; actions: ActionId[]; note?: string }>;
  formModes?: Array<{
    name: "new" | "reschedule";
    label: string;
    actions: ActionId[];
    customerLocked?: boolean;
  }>;
}
```

`PageSpec` 侧对应改成：

```ts
interactions: Interaction[];                 // 不变
businessStates?: Array<{ name: string; actions: ActionId[]; note?: string }>;
formModes?: Array<{ name: string; label: string; actions: ActionId[] }>;
```

#### A1.3 能力词表（版本化、开放扩展）

行为 id 由一张**能力词表**定义。词表只描述「行为」，不描述某个项目的文案或组件：

| 能力 id | 语义 |
|---|---|
| `form.submit` | 提交/保存表单 |
| `form.reschedule` | 提交改期 |
| `appointment.create` | 新增预约 |
| `appointment.reschedule` | 改期（进入改期流程） |
| `appointment.cancel` | 取消预约 |
| `appointment.accept` | 接单/确认接单 |
| `appointment.check-in` | 到店确认 |
| `appointment.view` | 查看预约详情 |
| `customer.view` | 查看客户详情 |
| `customer.select` | 选择客户（picker） |
| `customer.callback.create` | 回访登记 |
| `order.create` | 开单 |
| `treatment.notice.view` | 查看术后告知 |
| `treatment.confirm` | 确认已告知 |
| `filter.clear` | 清空筛选 |
| `search.clear` | 清空关键词 |
| `view.toggle` | 切换日历/列表 |

规则：

- 动作语义命中词表 → **必须**用词表 id，label 用项目文案。项目写「调整时间」也绑定
  `appointment.reschedule`。
- 词表外的动作 → 项目本地 id `<module>.<verb>`，例如 `inventory.transfer`。渲染为
  普通动作，无内置行为；需要真实行为时按 A1.7 加能力，不为项目写分支。
- 词表版本随 contracts 发布；新增能力必须同时提供 id、行为、测试和文档。

#### A1.4 谁来绑定（正式项目路径）

链路不变，只是绑定点显式化：

```
真实 PRD → intake（PRD review + IA）→ briefer 产出 ActionRef[] → brief gate
        → compiler（Button.action = id）→ renderer（data-action = id）
        → 内联 JS / 交互层按 id 派发
```

- IA 目前不含 actions（`IaPageSchema` 只有页面/导航/flow），动作仍由 briefer 从 PRD
  页面动作提取；briefer 的输出就是正式项目的绑定表。
- briefer prompt 增加：能力词表清单、id 命名规则、命中词表必须用能力 id、
  词表外 mint 项目本地 id、拿不准时发 blocking question（禁止猜）。
- 签核后的 brief 冻结绑定；handoff 可选附带 `brief/actions.json`（页面 → ActionRef[]）
  作为可审计的绑定表。

#### A1.5 编译器与运行时改动

- `btn(ref)`：`Button.props.action = ref.id`，`label = ref.label`。
- emphasis 由能力推导，删除启发式：footer → primary；`*.cancel` → danger；
  card-actions / overflow → ghost；`form.submit` 在表单页 → primary。
- 删除全部中文 label 判断（列出以便逐条替换）：
  `/新增|保存|提交|确认|登录/`、`actions.includes("保存")`、
  `actions.includes("保存改期")`、`/到店确认|确认到店/`、
  `label.includes("开单")`、`label !== "术后告知"`、`label === "取消"`。
  分别替换为 `form.submit`、`order.create`、`appointment.check-in`、
  `treatment.notice.view`、`appointment.cancel`、`appointment.reschedule`。
- 内联 JS 的 7 处 label 等值分支和 4 处 `data-action="中文"` 选择器改为能力 id；
  不再存在任何中文行为键。
- `businessStates`/`formModes` 的 subset 校验改为 id 集合校验。

#### A1.6 门禁

brief gate 新增：

- `ACTION_ID_INVALID`（blocker）：id 不符合命名空间 slug 规则（含中文即失败）。
- `ACTION_ID_DUPLICATE`（blocker）：同页 id 重复。
- `ACTION_LABEL_MISSING`（blocker）：label 为空。
- `ACTION_REF_UNKNOWN`（blocker）：`businessStates`/`formModes` 引用了不存在的 id。
- `ACTION_CAPABILITY_REQUIRED`（blocker）：页面结构要求某能力但缺少对应 id：
  - `mobile-form` 必须有 `form.submit`；
  - 声明 `views` 的列表必须有 `view.toggle`；
  - 有 `customerPicker` 的表单必须有 `customer.select`；
  - 有 `filterFields` 的列表必须有 `filter.clear`。
- `ACTION_CAPABILITY_MISMATCH`（warning）：同一能力 id 在同页出现两次（例如两个
  `form.submit`），提示人工确认。

#### A1.7 新增能力的流程

新能力 = 契约 + 行为 + 测试 + 词表版本：

1. 在 `core/contracts` 注册 id 与语义。
2. 在 renderer 的交互层实现行为（或声明为纯路由动作）。
3. 加 Playwright 交互测试与 brief gate 用例。
4. 更新能力词表文档与版本号。

不接受「某项目需要特殊跳转 → 在模板里写死项目 id」的做法；`pageId` 特判只允许存在于
产品样例的 fixture，不允许进入 `core/`。

#### A1.8 迁移

- `UiBrief` schema 升 **major**（2.0）；旧 brief 明确拒绝，错误码
  `BRIEF_SCHEMA_UNSUPPORTED`，不做 label→id 自动迁移（会伪造行为身份）。
- 5 组 intake fixture 与 8 页 brief 全部重写为 `ActionRef[]`。
- 8 页 brief 重新生成 → **brief hash 变化 → 重新签核**（IA 不变，只重签 brief）。
- `PageSpec.meta.version` `0.1.0` → `0.2.0`。
- 视觉不变（label 不变），因此 **不需要**重做 visual baseline；但 HTML 的
  `data-action` 值变化，交互测试要同步。

#### A1.9 验收

- 8 页 brief 全部通过新 schema 与 gate；0 个中文 id。
- 编译器与 renderer 中不存在中文 label 的行为判断（`grep` 断言）。
- 改一个动作的 label 后：placement、行为、测试全部不变（只重签 brief）。
- 旧 brief（v1）被明确拒绝，错误信息给出迁移路径。
- `businessStates`/`formModes` 的 id 引用全部可解析。

### A2. 动作呈现：placement 与 `ActionMenu`（D2）

#### A2.1 位置语义

`placement = "footer" | "card-actions" | "overflow" | "inline"`。

- `footer`：页面固定动作区，primary/单个；最多一个。
- `card-actions`：摘要卡内的动作行，最多 3 个。
- `overflow`：进入 `ActionMenu`，按需展开。
- `inline`：legacy filter-row（v0.7 行为），只允许显式声明，structure lint 给
  `ACTION_IN_FILTER_ROW` warning。

#### A2.2 默认级联（缺省值）

1. `actions[0]` → `footer`。
2. 其后最多 3 个 → `card-actions`。
3. 其余 → `overflow`。
4. 显式 `placement` 逐项覆盖；覆盖后若出现 >1 个 footer 或 >3 个 card-actions →
   blocker `ACTION_PLACEMENT_CONFLICT`。
5. `overflow` 存在时自动生成 `ActionMenu`；不存在 overflow 时不生成。

固定页面的最终位置写入 `findings/action-placement.json`（brief gate 产物），供人工
审阅；编译器不在运行时猜。

#### A2.3 `ActionMenu` 组件契约

```ts
// SpecNode
{
  type: "ActionMenu";
  props: { label: string };      // 触发器文案
  children: SpecNode[];          // 仅 Button，item 数量 >= 1
}
```

- id：编译器固定生成 `<pageId>.action-menu`（稳定，可被 structure diff 追踪）。
- 位置：只能出现在 `actions` 槽，且必须是最后一个子节点。
- 每个子 Button 的 `action` 仍是能力 id，`data-node-id` 为
  `<pageId>.action.<actionId>`。

#### A2.4 渲染与交互

- 触发器：`<button class="btn ghost" data-action-menu aria-haspopup="dialog"
  aria-expanded="false">更多</button>`。
- 面板：`<div class="action-sheet" role="dialog" aria-modal="true" hidden>`，
  内含按钮列表；点击遮罩/按 Esc 关闭；打开时焦点进入首个按钮，关闭后焦点回到触发器。
- 面板关闭态不进入截图的可见区域（`hidden`），因此 parity 与 baseline 不受影响。
- 无 JS 时：触发器降级为隐藏菜单，不阻塞首屏；页面仍可通过默认态截图审阅。

#### A2.5 Figma 表示

- plan 生成 `ActionMenu` 节点：一个 `HORIZONTAL` 的触发器 frame（文本 = label）。
- 面板内容在 plan 中标记 `visible: false` 的容器 + 子按钮（新增
  `FigmaPlanNode.visible?: boolean`，默认 true）。
- `figma:verify` 比较触发器与隐藏容器（readback 记录 `visible:false`）。
- `figma:conformance` 对 `visible:false` 的节点记 `skipped`，reason
  `SKIPPED_HIDDEN`；触发器本身正常比较。
- parity 只反映闭合态（与 baseline 一致）。
- handoff 追加「菜单打开态」的 HTML 交互截图，记为 interaction evidence，
  不参与 parity。

#### A2.6 动画与 a11y

- 支持 `motionLevel`：`none` 直接显隐；`low/medium` 用 120–160ms 的 translateY
  与 opacity，遵循 `prefers-reduced-motion`。
- 焦点顺序、Esc、遮罩点击、`aria-expanded` 同步；不用 `alert()`。

#### A2.7 验收

- `appointment-detail` 的 6 个次级动作按级联分为 card-actions（≤3）与 overflow；
  面板可键盘打开/关闭。
- `customer-detail` 的 3 个次级动作全部在 card-actions，不生成 ActionMenu。
- 显式 placement 冲突时 gate 报 `ACTION_PLACEMENT_CONFLICT`。
- plan/conformance/verify 对隐藏面板的 skip 语义一致（不产生 blocker、也不是静默通过，
  coverage 有 reason）。
- 视觉 baseline 重生成并重签（card-actions 与菜单是可见变化）。

### A3. 组件覆盖与 node id 发射（D3）

#### A3.1 根因（已验证）

- renderer 的 35 个 `case` 中，13 个不调用 `motionAttrs`，因此不输出 `data-node-id`：
  `TabBar`、`BottomNav`、`Stat`、`DataTable`、`FilterBar`、`Pagination`、`FeedCard`、
  `Image`、`Icon`、`Switch`、`InventoryCard`、`Skeleton`、`ErrorState`。
- 其中 `TabBar`/`BottomNav` 通过 `derivedNodeId` 给子项发 id；`Skeleton`/`ErrorState`
  是状态覆盖层；`Stat`/`DataTable`/`FilterBar`/`Pagination`/`FeedCard` 属于
  `KNOWN_PARTIAL_TYPES`。**`Switch` 与 `InventoryCard` 是「有 plan 节点、没有 HTML
  id」的组合**，于是 `figma:conformance` 报 `CONFORMANCE_NODE_MISSING`（`employee-app`
  的 `inventory-query` 共 6 条）。
- 这是机制缺口：新增类型忘记发 id 会以同样方式失败。

#### A3.2 三类归属（每个类型必须显式归一类）

| 归属 | 定义 | 门禁行为 |
|---|---|---|
| mapped | plan 能表达样式且 HTML 有 id | conformance 逐项比较 |
| partial | plan 只表达结构/占位，样式不完整 | coverage `skipped` + reason `PARTIAL_MAPPING:<type>`；不允许「degraded 但参与比较」 |
| unknown | plan/compiler 都不认识 | `figma:plan` coverage `unmapped`；Phase 1 blocker `SPEC_UNKNOWN_COMPONENT` |

#### A3.3 `Switch` / `InventoryCard` 补齐

- 移出 `KNOWN_PARTIAL_TYPES`，改为 mapped：
  - `Switch`：行高、label/value 文本样式、thumb 尺寸与轨道颜色。
  - `InventoryCard`：卡片填充、圆角、padding、head/name/spec 文本样式、属性行间距。
- renderer 分支补 `data-node-id`（由 A3.4 的统一机制保证）。
- `employee-app` 的 `inventory-query` conformance 从 6 blocker 变 0；若产品决定不支持
  这两个类型，则必须在 Phase 1 以 `SPEC_UNKNOWN_COMPONENT` 拒绝，不允许「空 frame +
  红门禁没人认领」。

#### A3.4 统一 id 发射

- 在 `renderNode` 出口统一附加 `data-node-id`，删除「分支自行决定是否发 id」的自由度。
- 状态覆盖层（`Skeleton`/`ErrorState`）与派生节点（Tab/List row/calendar）继续用派生
  id，但必须在 `derived-ids.ts` 有登记。
- 新增契约测试：构造覆盖全部 `SpecNode` 类型的 fixture spec，断言每个带 `id` 的节点
  在 HTML 中都有且仅有一个 `data-node-id`。

#### A3.5 五处联动清单（新增/修改组件类型时必须全改）

1. `core/contracts/src/page-spec.ts`：`SpecNode` 类型/props 契约。
2. `core/design-system/src/catalogs/{b-mobile,b-dense,c-expressive}.ts`：slot 允许
   列表、variants、props 契约。
3. `core/renderer-html/src/index.ts`：渲染分支 + `data-node-id` + CSS + 交互。
4. `core/figma/src/compile-plan.ts` + `core/figma/src/coverage.ts`：映射、consumed
   props、partial 白名单。
5. `runtimes/figma/src/plugin.ts`（新图层/Auto Layout/可见性）与两侧契约测试。

自动化：`component-contract.test.ts` 以 `SpecNode` 类型清单为单一来源，断言上述 1–4
都能处理每个类型；允许显式标注 `partial`/`unknown`，但不允许「没出现」。

#### A3.6 验收

- `employee-app` inventory conformance 0 blocker。
- 全类型 fixture 测试通过（id 全覆盖、唯一）。
- 8 页 conformance 保持 0 blocker；Figma delivery 重跑 verify 8/8。
- `ActionMenu` 作为新类型跑通五处清单。

### A4. 真实 spec run 与打包来源（D4）

#### A4.1 事实

- `pipeline/artifacts/employee-app-phase2/spec-run-v07/` 含 `spec-engineer.json` 与
  `findings/spec-engineer-gate.json`（`passed: true`，带 motion warning）。
- 该 run 的 8 页 `artifacts/page-spec/*.json` 与
  `figma/spec-source/artifacts/page-spec/*.json` **逐字节一致**（已核对）。
- handoff manifest 没有 `specRun` 字段，无法从包内追溯 gate。

#### A4.2 契约

```ts
// core/contracts/src/handoff.ts
export interface HandoffSpecRun {
  runId: string;
  gateHash: string;                    // sha256(findings/spec-engineer-gate.json)
  specHashes: Record<string, string>;  // pageId -> sha256(page-spec/<pageId>.json)
}

export interface HandoffInput {
  // ...
  specRun: HandoffSpecRun;             // 新增，必填
}
```

#### A4.3 行为与验收

- `handoff:pack --spec-run <dir>` 要求目录内同时有 `artifacts/page-spec/` 与
  `findings/spec-engineer-gate.json`；缺任一 → blocker。
- manifest 的 `specRun.specHashes` 必须与包内 `spec/page-spec/*` 一致，否则
  `HANDOFF_SPEC_STALE`。
- `figma/spec-source` 停止作为打包输入；保留时改为带 `provenance.json` 的只读副本。
- 验收：用 `spec-run-v07` 重打包成功；manifest 出现 `specRun`；删除/篡改 gate 后
  exit ≠0 且不写输出目录。

## 7. Part B — 门禁可信度（P1）

### B1. `v07:smoke` 纳入 `figma:verify`（D5）

**设计**：

- smoke 增加第 5 步 `figma:verify`，输入 `--figma` 下的 `plans/` 与 `readback/`。
- 前置：每页/每变体的 plan 与 readback 都存在；否则 `verify: {status:"skipped", reason}`。
- `complete` 的定义改为**五步全跑且全过**；跳过任一步 → `complete: false`，新增
  `skipped: string[]`。
- readback 必须比 plan 新：plan 文件写 `planHash`，readback 写 `planHash`；不一致 →
  `verify: {status:"stale"}`，不是 pass。
- 人工职责收敛为「重建 Figma 页 → 产生新 readback」。

**验收**：8 页默认态 smoke 输出 `verify.status = "passed"`；篡改一份 readback 后
smoke 非 0；缺 readback 时 `complete: false` 且 reason 指明页面。

### B2. parity 分 case 阈值（D6）

**问题**：全局 2% / 0.92 / 250 对最好的页面（0.338%）过松，对最差的页面（1.698%）
刚好贴边；strict 的 0.5% 当前 7/8 页不可达。

**设计**：

```jsonc
// pipeline/artifacts/<project>/figma/parity/parity.config.json
{
  "schemaVersion": "1.2",
  "baselineHash": "sha256:…",
  "defaults": { "maxPixelDiff": 0.02, "minSsim": 0.92, "maxClusterPixels": 250 },
  "cases": {
    "customer-search.default": {
      "maxPixelDiff": 0.0064,
      "minSsim": 0.9734,
      "maxClusterPixels": 183,
      "measured": { "pixelDiffRatio": 0.00338, "ssim": 0.9884, "maxDiffCluster": 146 }
    },
    "appointment-detail.default": {
      "maxPixelDiff": 0.0200,
      "minSsim": 0.9200,
      "maxClusterPixels": 160,
      "measured": { "pixelDiffRatio": 0.01698, "ssim": 0.9306, "maxDiffCluster": 128 }
    }
  }
}
```

生成规则（写进 `figma:parity --recalibrate`）：

- `maxPixelDiff = min(0.02, max(measured + 0.003, measured × 1.25))`
- `minSsim = max(0.92, measured − 0.015)`
- `maxClusterPixels = min(250, max(measured + 25, measured × 1.25))`
- 上限/下限就是当前全局值：**分 case 只允许收紧，不允许把任何页面放宽**。
- `baselineHash` 必须是当前已签 baseline 的 hash；baseline 变化 → config 失效。

治理：

- 改阈值必须重跑 `--recalibrate` 并重签，config hash 进 `figma:sign`；
  禁止只改阈值不留 `measured`。
- `figma:parity` 校验 `measured` 与 `baselineHash` 一致；不一致 → `PARITY_CONFIG_STALE`。
- 新增变体时自动生成该 case 的条目；删除变体时条目必须同步删除，否则 blocker。

收紧路径：

- v0.8：分 case 阈值（当前实测 + 余量）。
- v0.9：字体子集落地后按同一规则自动重算。
- v1.0：目标每 case `pixel ≤1%`、`ssim ≥0.95`；达不到的 case 逐 case waiver
  （owner + expiry），不允许恢复全局宽阈值。

**验收**：`customer-search` 的阈值从 2% 收紧到 ~0.64% 且仍通过；把它的 Figma PNG
替换成另一页后失败；改 config 后旧 signoff 报 stale。

### B3. Visual Critic 的确定性边界（D7）

**设计**：

- **finding 分流**：按 `ruleId` 维护 `DETERMINISTIC_RULES` 白名单（几何溢出、对比度、
  缺失节点、文本截断等可程序化复核的规则）。白名单内 → 参与 gate；白名单外 →
  `advisory: true`，只进报告。
- **blocker 复核**：non-deterministic 规则报 blocker 时自动重跑一次；两次都报同一
  `ruleId + location` 才判 blocker，否则降为 advisory 并记录两次结果。
  `--no-confirm` 仅开发用，不能签核。
- **cache key** 增加 `promptHash`（role prompt + schema 版本）与采样参数；prompt
  变更必须 miss。
- **报告字段**：`findings[].deterministic`、`sampling: { runs, agreed }`、
  `advisories: string[]`；`visual:sign` 接受 advisory 列表（不是 waiver）。

**验收**：同一输入两次 review 的 blocker 集一致；构造一次采样才出现的 finding，报告
标记 `sampling.agreed: false` 且不判 blocker；prompt 改动使 cache miss。

### B4. Handoff 缺口收敛（D8）

| 缺口 | 决定 | 做法 |
|---|---|---|
| 无 delivery readback/diff | **关闭** | 打包 `figma/readback/delivery/` 与 `figma/diff/delivery/`；manifest 记 `figma.delivery` |
| Material Symbols 依赖本地字体 | **关闭** | 打包 Material Symbols Rounded 子集 woff2 + 许可证；`LICENSES.md` 加条目 |
| 8 张 v0.6 手工裁图 | **关闭** | 从包内删除 `screenshots/figma-manual/`；历史对照留在仓库 artifacts |
| 无 block manifest | **关闭** | 打包 `block-manifest/` 与 `block-verify.json`（若项目使用分块） |
| 无 `.fig` 二进制 | **永久 gap** | 插件无法导出 `.fig`；记录 `fileKey` + delivery PNG + readback，HANDOFF 写复现步骤 |
| 状态帧 | **D16 处理** | v0.8 机制 + `today` 试点；v0.8.1 铺开 8 页 |

**验收**：重新打包后 `knownGaps` 只剩「无 `.fig`」与「状态帧 v0.8.1 铺开」两条，
均带 owner/expiry；`screenshots/figma/` 全部来自 parity PNG（hash 绑定）。

### B5. structure 从 warning 到 blocker 的升级机制（D9）

**设计**：

```yaml
# project.yaml
structure:
  severity:
    STRUCTURE_OVERFLOW_X: blocker
    STRUCTURE_FOOTER_OVERLAP: blocker
    STRUCTURE_HEIGHT_OVER_BUDGET: warning
  heightBudgetPct: 1.2
```

- 默认仍是 warning；v0.8 只把 3 条升 blocker：`STRUCTURE_OVERFLOW_X`、
  `STRUCTURE_FOOTER_OVERLAP`、`STRUCTURE_HEIGHT_OVER_BUDGET`（20% 容差）。
- 升级门槛：8 页 + 2 个真实项目 0 误报；每条规则有缺陷注入测试。
- `structure:check` exit code 与 summary 同时记录 blockers/warnings；smoke 把 blocker
  视为失败。

**验收**：注入三类缺陷 → exit 1；当前 8 页 0 warning / 0 blocker；`project.yaml`
覆盖生效且被 schema 校验。

### B6. 多状态 plan 与逐状态门禁（D16）

#### B6.1 变体集合

变体 = `PageSpec.states` ∪ `businessStates` ∪ `formModes` ∪ `views`，与 visual
baseline 的 24 个 case 一一对齐，不另造一套命名：

| 后缀 | 来源 | 例子 |
|---|---|---|
| `default` | `states.default` | `today.default` |
| `state.<name>` | `states` 的其他键 | `appointment-list.state.loading` |
| `business.<name>` | `businessStates[].name` | `appointment-detail.business.已到店` |
| `mode.<name>` | `formModes[].name` | `appointment-form.mode.reschedule` |
| `view.<name>` | `views[]` | `appointment-list.view.list` |

#### B6.2 产物与命名

- `figma:plan --variants`：为每个 page × variant 生成
  `plans/figma-plan.<page>.<variant>.json`；`default` 仍写
  `plans/figma-plan.<page>.json`（兼容旧路径）。
- readback：`readback/figma-readback.<page>.<variant>.json`。
- PNG：`parity/figma.<page>.<variant>.png`。
- plan 节点内记录 `variant` 与 `pageId`，`figma-files.json` 记录
  `{pageId, variant, frameName}`。

#### B6.3 逐状态门禁

- **coverage**：每个变体的 plan 独立生成覆盖率；`unmapped` 仍是 blocker。
- **conformance**：Playwright 捕获按变体进行，case → URL/交互的映射复用
  `visual:baseline` 的 case builder（单一来源，禁止两套状态定义）。
- **verify**：每变体一份 diff；`planHash` 绑定 readback。
- **parity**：每变体对齐 baseline 的同名 case，阈值见 B2。
- **handoff**：`states` map 记录每个 case 的 plan/readback/PNG hash；
  `screenshots/figma/<page>.<variant>.png` 来自 parity PNG。

#### B6.4 落地策略与 go/no-go

1. v0.8 先用 `today`（`default`、`state.empty`、`state.loading`、`state.error`、
   `state.disabled`）跑通四道门禁。
2. 记录：构建时间、Figma frame 数、verify/conformance 噪声、人工操作步骤数。
3. **通过标准**：四道门禁全部可运行；噪声可解释（失败都能归因到 plan/字体/几何，
   不是随机）；单页构建时间可接受（建议 ≤10 分钟人工操作）。
4. 通过后 v0.8.1 铺 8 页；不通过则回退到默认态 + HTML 状态证据，并在 manifest
   记录原因（D16 不关闭）。

#### B6.5 风险

- 24–32 个 frame 会让 Figma 文件变重、插件构建变慢；必要时按页拆文件。
- 变体命名含中文（`business.已到店`）与 baseline 一致，但要注意文件系统编码。
- 状态之间的差异可能只是数据替换，plan 编译器需要支持 `PageState` 覆盖合并；
  复杂页面（日历、抽屉）的状态渲染要单独验证。

#### B6.6 验收

- `today` 的 5 个变体：plan/readback/coverage/conformance/verify/parity 全部可运行，
  结果落盘。
- 缺任一变体的 plan/readback → smoke 与 handoff 均 fail-closed。
- `states` map 的 hash 与包内文件一致。
- v0.8.1 验收：8 页 24 case 全绿。

## 8. Part C — 能力泛化（P2）

### C1. Briefer 内容通道泛化（D10）

**设计（最小版）**：

```ts
export type ContentBlock =
  | { kind: "quick-actions"; items: Array<{ label: string; icon: string; tone?: string }> }
  | { kind: "list"; items: Array<{ primary: string; secondary?: string; meta?: string; status?: string }> }
  | { kind: "stats"; items: Array<{ label: string; value: string }> }
  | { kind: "notice"; title: string; items: string[] };

export interface UiBriefPage {
  content?: ContentBlock[];
}
```

- 优先级：`content` > typed 字段 > 通用字段。briefer 先尝试 `content`；未知页型发
  blocking question（不猜）。
- 编译器把 `content` 映射到现有组件（`QuickAction`/`List`/`Stat`/`Section`），不新增
  节点类型。
- typed 字段保留一版并标 deprecated，v0.9 删除。

**验收**：新增页型（如 `inventory`）只加 fixture 与 catalog，不改 briefer 代码即可产出
brief；8 页 brief 与 v0.7 签核版差异仅在 `content` 通道。

### C2. 分块生成重评协议（D11）

- **固定输入**：baseline = `spec-run-v07`；试验页 = `today`、`appointment-list`、
  `callback-register`。
- **指标**（缺一即 `insufficient_evidence`）：`heightDeltaPct`（`contentHeight` 与
  `documentHeight` 都 ≤5%）、conformance blocker 0、parity passed、token drift
  ≤ baseline、seams 0、block retries、成本与耗时。
- **`requiredStates`**：块只声明支持的状态；组装层补齐缺失状态并记录来源。
- **id 稳定性**：块根 id = `<pageId>.<slot>.<index>.<role>`；重生成复用 baseline id。
- **决策规则**：三页全部 `promote` 才推广；任一 `rollback` 保留整页生成，并写原因。
- 注意：分块实验只评估默认态；多状态（D16）不纳入本版实验，避免指标爆炸。

**验收**：报告含全部字段；结论有 promote/rollback 与理由；同输入重跑指标一致。

### C3. Spec Engineer 有界 repair（D12，v0.9）

只做「按 finding code 映射到最小改动」的 repair，最多 1 轮：

| finding | 允许的 repair |
|---|---|
| `SPEC_MOTION_NODE_UNRESOLVED` | 删除无效 binding 或改指已存在节点 |
| `SPEC_ASSET_UNUSED` | 从 assetRefs 移除 |
| `STRUCTURE_*`（warning） | 不改（只报告） |

禁止改页面语义、改 brief、增删页面、自由重写 slot。repair 后必须重跑 gate；仍失败交
人工。每次 repair 写 `findings/spec-repair.json`。

**验收**：三类 finding 的 fixture 各修一次后 gate 通过；越权 repair 被 schema 拒绝。

### C4. 资产链 M2 边界（D13，v0.9/M2）

- 冻结 `AssetSourceAdapter` 契约（source id、license、fallback reason、成本字段），
  B/C mock adapter 做契约测试。
- `asset:review` 保持独立命令；`spec:engineer` gate 只校验 brief 引用。
- 验收：mock B/C 通过契约测试；M0 A 库 13/13 不变；换真实供应商不改 core。

### C5. M1 签核硬化（D14，v0.8）

- `agent-sign.json` 增加 `contentHash`（`state.json` + `signoffs/*` + `artifacts/`
  的规范化 sha256）与 `signoffs[]`（`signedBy`/`signedAt`/`scope`/`hash`）。
- `agent:sign` 拒绝：`contentHash` 不符、`signedAt` 在未来、scope 不一致、重复签核。
- `spec:engineer` / `agent:run` 读取 signoff 前重算 `contentHash`。

**验收**：签核后篡改一个 page-spec → 下游 `SIGNOFF_STALE`；正常路径无感。

### C6. 视觉小债清账（D15，v0.8）

| 项 | 做法 |
|---|---|
| appointment-list 日历块密度/时间重复 | 调整 cell padding 与时间格式，补 3 天/7 天宽度回归 |
| appointment-form 「选择」缺 ghost button chrome | picker trigger 用 `Button emphasis:"ghost"`，补 hover/focus |
| today 待回访行缺 chevron | `ListRow.action` 补 chevron 标记并更新 plan 映射 |
| v0.6.x 完整组件库 | 推迟到 v0.9/v1.0，不在 v0.8 做 |
| Material Symbols 矢量集 | 与 B4 字体子集合并处理 |
| readback 编排 | 与 B1 合并：smoke 消费 readback |

**验收**：fresh Visual Critic 0 blocker / 0 major；minor ≤1 且有接受理由；新 baseline
签核。

## 9. 契约变更汇总

| 契约 | 文件 | 变更 | 兼容性 |
|---|---|---|---|
| `UiBriefPage.actions` | `core/contracts/src/ui-brief.ts` | `string[]` → `ActionRef[]` | **major**（2.0）；旧 brief 拒绝 |
| `ActionId` / `ActionRef` | 同上 | 新类型 + 命名空间规则 | 新 |
| `businessStates/formModes.actions` | 同上 | 引用 `ActionId` | 随 major |
| `UiBriefPage.overflowLabel` | 同上 | 新增可选 | additive |
| `UiBriefPage.content` | 同上 | 新增可选 | additive |
| `SpecNode.ActionMenu` | `core/contracts/src/page-spec.ts` | 新节点类型 | additive；走五处清单 |
| `FigmaPlanNode.visible` | `core/contracts/src/figma.ts` | 新增可选 | additive |
| `HandoffInput.specRun` | `core/contracts/src/handoff.ts` | 新增必填 | manifest 1.0 → 1.1 |
| `ParityReport` 分 case 配置 | `core/contracts/src/parity.ts` | `cases` + `measured` | config 1.0 → 1.2 |
| `StructureConfig.severity` | `core/contracts/src/structure.ts` | 新增可选 overrides | additive |
| `PageSpec.meta.version` | `core/spec-engineer` | `0.1.0` → `0.2.0` | 读取端兼容 0.1.0 |
| `M1Signoff.contentHash` | `core/contracts`（M1 状态） | 新增 | 旧签核需重签 |

## 10. 门禁与证据矩阵

| 债务 | 门禁 | 证据文件 | 失败语义 |
|---|---|---|---|
| D2 | brief gate + structure lint + conformance | `findings/action-placement.json`、`structure-measured.json`、`conformance.json` | id 非法/冲突 → 不产 brief |
| D3 | Phase 1 + conformance + component contract test | `conformance.json`、`plan-coverage.json`、测试报告 | 未知类型 blocker；缺 id blocker |
| D4 | `handoff:pack` | `handoff.manifest.json.specRun` | gate 缺失/哈希不符 → exit ≠0 |
| D5 | `v07:smoke` | `v07-smoke.json.verify` | verify 失败 → exit 1；跳过 → `complete:false` |
| D6 | `figma:parity` + `figma:sign` | `parity.json`、`parity.config.json` | 配置/实测不符 → signoff 失效 |
| D7 | `visual:review` + `visual:sign` | `visual-review.json.sampling` | 未复核 blocker 降 advisory |
| D8 | `handoff:pack` | `knownGaps`、`LICENSES.md` | 缺字体/证据 → blocker |
| D9 | `structure:check` | `structure-measured.json` | 升级规则 blocker → exit 1 |
| D14 | `agent:sign` | `agent-sign.json.contentHash` | 内容不符 → `SIGNOFF_STALE` |
| D16 | plan/coverage/conformance/verify/parity（按 case）+ handoff | `plans/`、`readback/`、`parity/`、`states` map | 缺变体 → fail-closed |

## 11. 实施批次

| 批次 | 内容 | 依赖 | 退出条件 |
|---|---|---|---|
| 0 | 合并 v0.7、打 tag、更新 AGENTS.md | — | 合并后门禁全绿 |
| 1 | A3 统一 id 发射 + 五处清单 + `Switch`/`InventoryCard` 补齐 | Batch 0 | inventory conformance 0；8 页不回归 |
| 2 | A1 端到端 actionId（契约/词表/编译器/JS/gate/fixtures/brief 重签） | Batch 1 | 无中文行为键；8 页 brief 通过新 gate |
| 3 | A2 placement + `ActionMenu` + 新 baseline 重签 | Batch 2 | appointment-detail 走查通过；新 baseline 签核 |
| 4 | A4 spec run 来源 + handoff 重打包；B1 verify 入 smoke；B4 前三条缺口 | Batch 3 | manifest 有 `specRun`；smoke 含 verify；knownGaps 收敛 |
| 5 | B2 分 case parity + B6 多状态机制 + `today` 试点 | Batch 4 | today 5 变体四道门禁可运行；go/no-go 记录 |
| 6 | B3 critic 分流 + B5 structure 升级 + B4 字体子集 | Batch 5 | 注入测试变红；fresh critic 0/0 |
| 7 | C1 content 通道 + C2 分块重评 | Batch 6 | 报告有结论；新页型不改 briefer |
| 8 | C5 签核硬化 + C6 视觉 minor + C3/C4 契约冻结 | Batch 7 | 篡改测试失效；critic ≤1 minor |
| v0.8.1 | B6 多状态铺开 8 页 24 case + B2 阈值收紧 | Batch 5 | 24 case 全绿；handoff 状态证据完整 |

原则：每个批次单独 commit；每批次结束跑全量测试 + typecheck；不把多个批次压成一个
大 spec。

## 12. v0.8 出口验收

1. `main` 已合并 v0.7，`pnpm test` ≥987、`test:dsh` 4、typecheck clean。
2. D1–D4 全部关闭，证据落在 `pipeline/artifacts/employee-app-phase2/`。
3. 动作体系：8 页 brief 使用 `ActionRef[]`，0 个中文 id，编译器和 JS 无中文行为判断；
   brief 已重签。
4. `ActionMenu`：appointment-detail 的 overflow 动作可用键盘打开/关闭；conformance
   对隐藏面板有 skip reason；新 baseline 已签核。
5. `v07:smoke` 五步全跑且 `complete: true`（含 verify）。
6. `handoff:pack` 从真实 spec run 成功；`knownGaps` ≤2，均有 owner + expiry。
7. parity 分 case 阈值生效：`customer-search` 阈值 ≤0.7%，config 记录 `measured`，
   改配置使旧 signoff 失效。
8. D16：多状态机制 + `today` 5 变体四道门禁可运行，go/no-go 记录落盘；8 页铺开明确
   排在 v0.8.1。
9. D5–D9 要么门禁化，要么 waiver（owner + expiry + 理由）。
10. D10/D11 有报告与结论；D12/D13 有冻结契约与排期；D14 关闭；D15 minor ≤1。
11. `AGENTS.md` 债务清单按实际状态更新。

## 13. 风险与未决

风险：

- **端到端 id 是破坏性迁移**：brief schema major、5 组 fixture、8 页 brief 重签、
  7 处 JS 分支、11 处 `btn()`、2 个测试文件。任何一处漏改都会让行为静默失效；
  验收必须包含「grep 无中文行为键」。
- **能力词表的边界**：如果词表设计得过细（按项目动作命名），会退化成项目专用；
  过粗（只有 submit/cancel）则 briefer 要 mint 大量本地 id，行为覆盖下降。词表评审
  要和真实 PRD 一起做。
- **`ActionMenu` 的隐藏面板**：Figma 的 `visible:false` 在 readback/verify 的语义要
  先验证；如果插件不支持，退回「面板不建、coverage 标 skipped + reason」。
- **多状态的成本**：`today` 试点若单页超过 10 分钟或噪声不可解释，8 页铺开会拖垮
  v0.8.1；go/no-go 必须严格执行，不能因为「已经做了一半」而硬推。
- **分 case 阈值治理**：阈值和实测值同文件，容易被一起改；必须靠 config hash +
  签核 + `--recalibrate` 三重约束。
- **brief 重签的连锁**：brief hash 变化会触发下游 gate；要在合并后、动代码前先做，
  避免和视觉变更混在一起。
- **`customer-search` 等页面的 strict 目标**：0.64% 已接近字体渲染噪声；再收紧前
  先做字体子集（B4）。

未决（需要产品或设计确认）：

1. `overflowLabel` 在非中文项目的中默认值：固定「更多」，还是由 brief 必填？
   **建议**：brief 可选，默认「更多」；非中文项目必须显式提供，gate 只检查非空。
2. briefer 拿不准能力时：发 blocking question，还是 mint 项目本地 id？
   **建议**：影响行为的动作（提交/取消/改期/选择/清空/切换）必须 block；纯导航类
   可 mint 本地 id。
3. `today` 的 `disabled` 状态是否真的需要作为 Figma 变体？它是整页禁用，视觉价值低。
   **建议**：today 试点包含，8 页铺开时逐页评审，允许用 waiver 跳过无意义变体。
4. v0.8.1 是否允许单独发版，还是并入 v0.9 RC？
   **建议**：独立 v0.8.1，避免 RC 阶段再动 plan 结构。

## 14. 与架构边界

- 契约（`ActionRef`、`ActionId`、`ActionMenu`、`visible`、`specRun`、parity `cases`、
  `structure severity`、`content`）全部在 `core/contracts`；纯逻辑在
  `core/{compiler,figma,validators,handoff}`。
- Playwright、pngjs、pixelmatch、fflate、字体子集打包只在 `runtimes/standalone`；
  `core/` 不引入 `node:fs`。
- Figma 状态帧/PNG 导出/可见性改动在 `runtimes/figma`（插件），plan 侧在 `core/figma`。
- 内联交互 JS 属于 `core/renderer-html`（HTML 产物的一部分），但不得引入项目特判；
  能力 id → 行为的映射集中在 renderer 的一个模块里。
- 证据路径：`pipeline/artifacts/<project>/{figma,render,blocks,handoff}/`；新增文件
  必须可 JSON 校验并写 hash。
- `v07:smoke` 仍是编排层，不复制各 CLI 逻辑；verify 只调用 `figma-cli.ts verify`。

## 15. 完成定义

v0.8 完成 = 第 12 节全部满足 + 第 9 节契约变更全部落地 + `AGENTS.md` 债务清单与实际
一致。未关闭项必须以 waiver 形式存在（owner、expiry、理由），waiver 数量 ≤3；超过
3 条视为本版未完成，需回到路线图重新拆分。v0.8.1 的完成定义单独看 B6 铺开与 B2
收紧，不混入 v0.8 签核。
