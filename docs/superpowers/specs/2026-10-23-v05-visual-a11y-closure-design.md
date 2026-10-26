# v0.5 视觉 + a11y 收口设计

- 日期：2026-10-23
- 状态：Implemented & signed（2026-10-23；胡冀徽，`acceptedMajors=[]`，`waivers=[]`）
- 输入：v0.4.1 已签核（胡冀徽，`waivers=[]`）、v0.4.1 最终 Critic findings、主设计文档、v0.4.1 → v1.0 版本路线
- 关联：[主设计文档](2026-10-19-prd-to-ui-pipeline-design.md)、[v0.4.1 设计](2026-10-23-v041-visual-patch-design.md)、[v0.4.1 交接](../../handoffs/2026-10-23-v041-implementation-handoff.md)、[版本路线](../plans/2026-10-23-version-roadmap.md)

## 0. 结论

v0.5 是 Phase 3（Figma/Studio）之前的**布局、视觉与 a11y 收口**。v0.4.1 已把 6 条“明显没收尾”的 finding 清掉；v0.5 处理剩下的结构性问题：

1. `appointment-list` loading：用真实结构做 skeleton，消除数百像素的布局跳动。
2. `appointment-list` empty：empty 进入日历/列表面板内容流，不再用浮层覆盖网格。
3. `appointment-form` mode：移除可交互 mode pills；模式由入口、标题和上下文条表达。
4. a11y 基线：对比度、焦点可见、键盘操作、表单 label/required。
5. Critic 收敛：fresh critique 只采样一次；`0 blocker + ≤2 major + 人工签核` 固化为 signoff gate。
6. 视觉债：`取消` 危险语义、footer CTA 高度、页面 gutter 一致；可选修正重复文案/状态说明位置。

v0.5 不重开 7 列周历。v0.4.1 已由 Critic 和人工接受 390px 紧凑 7 列；如果后续真实验证证明密度不可用，另开 v0.5.x 日历布局设计，不在本 spec 里改回 3 天滚动。

## 1. 现状

### 1.1 v0.4.1 已签核

| 项 | 值 |
|---|---|
| 签核 | 胡冀徽，2026-10-23，`waivers=[]` |
| Baseline | `pipeline/baselines/employee-app-phase2`，24 cases，manifest `sha256:341458e6…c4f4` |
| 最终 Critic | `run-2026-10-23T03-01-28-979Z`，24/24，diff 24/0/0，0 blocker，¥0.3970 |
| 机械门禁 | 652 tests、typecheck、`test:dsh` 4、Phase 1 `8/2/4/8` 全 0、strict motion 8/0/0 |

### 1.2 v0.4.1 遗留 findings（v0.5 输入）

最终 Critic 报 6 项（4 major / 2 minor / 0 blocker）：

| 严重度 | 页面·状态 | 问题 |
|---|---|---|
| major | `appointment-list.state.empty` | empty 卡浮在日历网格上，遮住 day header 和前 3 小时 |
| major | `appointment-list.state.loading` | 骨架只有 5 行、无 day header/time rail，加载完成跳数百像素 |
| major | `appointment-form.default` / `.mode.reschedule` | mode pills 与主 CTA 同权重，reschedule 只剩一个孤 pill |
| major | `appointment-detail.default` | `取消` 是 neutral ghost，与改期/客户详情无差别 |
| minor | `customer-search.default` | idle 标题与 placeholder 逐字重复 |
| minor | `appointment-detail.business.爽约` | 状态说明游离在按钮下方 |

### 1.3 为什么现在不继续修

v0.4.1 是 S 规模补丁；上述 3 个结构/布局 major（empty/loading/mode）和 1 个视觉债 major（取消 danger）需要重排 loading/empty/mode 的 DOM 与状态表达。继续在 v0.4.1 里修会把补丁变成 v0.5，并推迟 Phase 3。v0.5 应在进入 Figma/Studio 前把这些状态收口。

## 2. 范围与非目标

### 2.1 范围

- mobile-list loading：calendar view 与 list view 的结构化 skeleton；保留筛选、视图切换、日期标题、图例、footer CTA。
- appointment-detail loading：summary 11 行 + action footer 骨架。
- mobile-list empty：inline empty band；保留网格/图例/清空筛选，不覆盖 day header/time rail。
- mobile-form mode：移除交互式 mode pills；入口决定模式；标题/上下文条/CTA 一致。
- a11y 基线：关键页面（today、appointment-list、appointment-form、appointment-detail）的对比度、焦点可见、键盘操作、表单 label/required。
- Critic 停止规则：signoff `acceptedMajors` + 最多 2 个 major；fresh critique 不反复重跑。
- 视觉债 P1：`取消` danger、footer CTA 高度、页面 gutter 一致。
- 视觉债 P2（低风险才做）：customer-search idle 文案、detail 状态说明位置、detail 摘要标题去重。
- 对应单测、Playwright/a11y 检查、baseline 更新、真实 critic、签核与文档。

### 2.2 非目标

- Figma Renderer、Studio、Asset Compiler、scratch 沙箱、Test Subagent、Handoff（v0.6/v0.7）。
- 完整 axe/AA 全量、屏幕阅读器矩阵、跨浏览器矩阵（Phase 3 沙箱）。
- 新页面、新业务规则、真实接口、后端。
- 修改已签核 brief、M1/intake 产物、dsh profile、pricing。
- 回到 3 天滚动日历或重开 7 列密度；日历布局若需重构，另开 v0.5.x spec。
- 生产代码直出。

### 2.3 不变项

- 8 页 `employee-app-phase2` 切片、signed brief、M1/Intake 产物不变。
- `PageSpec.meta.version` 保持 `0.1.0`；只增可选 catalog/signoff 字段。
- 视觉矩阵保持 24 case；不因 v0.5 新增页面或状态 case。
- baseline 只由人运行 `visual:baseline` 并签核；`visual:review` 不写 baseline。
- 本地 commit，不 push；不提交 `.env`、key、`runs/`、`.visual-cache/`。

## 3. 方案选择

| 决策 | 采用方案 | 备选与取舍 | 理由 |
|---|---|---|---|
| Loading | 在真实页面上做 in-place skeleton：保留真实 chrome，grid cells/明细 value 变 shimmer；list view 用 12 行 skeleton | 单独 skeleton 页面；沿用绝对定位 overlay | 几何与真实状态一致，布局跳动最小；不复制一套易漂移的 DOM |
| Empty | inline band：放在日历/列表面板内容流中，保留网格/图例/清空筛选 | 继续 floating overlay；整块替换 grid | 满足 roadmap“网格/图例/清空筛选稳定”；不遮 day header/time rail |
| Form mode | 删除 mode pills；入口 + 动态标题 + 上下文条表达模式 | 保留 segmented control；只读 mode badge | 消除“第二个主 CTA”和孤 pill；入口规则最清晰 |
| Calendar | 保持 7 列紧凑周历 | 3 天滚动；固定周条 + 宽时间轴；日缩放 | v0.4.1 已签核；7 列已由 Critic 接受，v0.5 不再重开 |
| A11y | 关键页面 Playwright 对比度/焦点/键盘/label 检查 | 全量 axe/AA；完整屏幕阅读器 | 与 roadmap 的“基线”一致；全量留 Phase 3 沙箱 |
| Critic stop rule | signoff 增加 `acceptedMajors`，最多 2 个 major；fresh run 只采样一次 | 仅文档约定；无限重跑 | 防止“再跑一次找干净结果”；把验收标准写进 gate |
| 视觉债 | P1：取消 danger、footer CTA 高度、gutter；P2 低风险再修 | 全部塞进 v0.5；全部推迟 | 先清会出现在每张截图的系统性问题，文案/位置类低风险 |

## 4. 数据与契约

### 4.1 EmptyState `inline` variant

`b-mobile` 的 EmptyState `variant` 枚举增加 `"inline"`：

```ts
variant: { type: "enum", enum: ["default", "calendar", "inline"] },
```

`calendar` 保留给旧引用；v0.5 的 mobile-list 使用 `inline`。不修改 PageSpec 的 required 字段。

Skeleton 的 `list` variant 已存在于 b-mobile catalog；v0.5 把 renderer 的 `Skeleton` `variant: "list"` 从单个 card 改为 12 行 `.skeleton-list-row`，`card` 行为不变。

### 4.2 Button `danger` emphasis

`b-mobile` Button 增加：

```ts
emphasis: {
  type: "enum",
  enum: ["primary", "secondary", "ghost", "danger"]
},
```

catalog `variants` 同步增加 `"danger"`。Renderer 增加 `.btn.danger`：

```css
.btn.danger{background:#fff;color:var(--color-status-danger);
  border:1px solid color-mix(in srgb,var(--color-status-danger) 40%,white);}
```

只用于破坏性动作（当前为 detail 的「取消」）；不改变表单主 CTA。

### 4.3 Signoff `acceptedMajors`

在 `core/agents/src/signoff.ts` 增加：

```ts
export const AcceptedMajorSchema = z.object({
  findingId: z.string().min(1),
  reason: z.string().min(1),
  owner: z.string().min(1),
  reviewBy: z.string().min(1).optional(),
}).strict();
```

`SignoffBlockSchema` 增加 `acceptedMajors: z.array(AcceptedMajorSchema).default([])`；`ParsedSignoff` 同步携带。

`visual:sign` 的停止规则：

- 未 waive 的 blocker：失败（现有）。
- major 数量 > `maxMajor`（默认 2）：`VISUAL_MAJOR_LIMIT`。
- 每个 major 必须有匹配 `findingId` 的 `acceptedMajors` 条目：`VISUAL_MAJOR_UNACCEPTED`。
- `acceptedMajors` 指向未知 finding：`VISUAL_MAJOR_UNKNOWN`。
- 旧 signoff（v0.4.1 及以前）不回溯校验；v0.5 新签核按新规则。

### 4.4 不变

- 不改 `PageSpecSchema` required 字段；EmptyState/Button 是 catalog 扩展。
- 不改视觉矩阵 case 集；loading/empty/mode 仍用现有 case。
- 不改 `VisualCase` 结构；本轮不需要新 action。

## 5. 设计

### 5.1 Loading：in-place skeleton

**目标**：加载态与 loaded 态共享同一 DOM 几何，避免 200–500px 跳动；保留真实 chrome。

**appointment-list · calendar view**

- 保留真实 top bar、筛选（状态/日期）、`切换日历/列表`、`日历 11-05 周三` 标题、图例和 footer `新增预约`。
- 保留真实 CalendarGrid 的 day header、time rail（09:00–20:00）、12 行、7 列。
- 加载时：

```css
body[data-state="loading"] .calendar-block{display:none;}
body[data-state="loading"] .calendar-cell{
  background:linear-gradient(90deg,#E7E9ED 25%,#FCFCFD 37%,#E7E9ED 63%);
  background-size:400% 100%;
  animation:shimmer 1.4s ease infinite;
}
body[data-state="loading"] .calendar-hint,
body[data-state="loading"] .calendar-fade{display:none;}
```

- 真实 day/date/time 文本保留，作为加载中的上下文；不隐藏标题/图例/切换。
- footer CTA 保留（可 disabled 或正常；加载态点击不产生数据写入）。
- 不再为 mobile-list 渲染绝对定位的 `state-panel.loading` 覆盖层；其他 archetype 保留通用 loading panel。
- loading 时 footer CTA 保留占位，但 `pointer-events:none`，避免加载中触发表单。

**appointment-list · list view**

- 保留筛选/切换/日期标题/footer。
- 列表行隐藏；加入 12 行 skeleton：

```html
<div class="list-skeleton" aria-hidden="true">
  <div class="skeleton-list-row"></div>
  ... 12 行
</div>
```

- `.skeleton-list-row` 高度与真实 `ListRow` 一致（约 56px），含标题/副标题/右侧 meta 三条 shimmer line。
- Skeleton 节点由 compiler 放进 `[data-view-panel="list"]` 的列表 Section；`Skeleton` renderer 的 `variant: "list"` 输出 12 行 `.skeleton-list-row`，只在 `body[data-state=loading]` 显示，正常时 `display:none`。

**appointment-detail · loading**

- 保留 top bar、summary card 标题、11 行 label/value 结构、footer 空间。
- 加载时把 `.list-text-value` / `.form-value` 文本替换为 shimmer bar；label 保留；行高与 card 高度不变。
- 不渲染三块 generic slab；不缩小卡片。
- footer actions 保留占位（disabled 或 skeleton bar），避免 pop-in。

**a11y**

- loading 时 `.app-scroll` 或 `.app` 加 `aria-busy="true"`；装饰 skeleton `aria-hidden="true"`；提供 visually-hidden「正在加载」文本。
- `prefers-reduced-motion` 下关闭 shimmer（改为静态 surface）。
- 加载完成后移除 `aria-busy`。

**验收**

- 390×844 截图：loading 与 default 的 calendar 高度差 ≤ 8px；list/detail 高度差 ≤ 8px。
- filters/toggle/heading/legend/footer 在 loading 截图中可见。
- 0 console / 0 overflow。

### 5.2 Empty：inline band

**目标**：empty 是面板的一种状态，不是覆盖层；保留网格/图例/清空筛选。

**Compiler**

- mobile-list 的 empty 节点改为 `variant: "inline"`，`description` 带当前日期：

```ts
{
  type: "EmptyState",
  props: {
    title: page.emptyTitle ?? "当前条件没有预约",
    description: activeDateLabel
      ? `${activeDateLabel} · 调整筛选条件后重试`
      : "调整筛选条件后重试",
    variant: "inline"
  },
  children: [btn("清空筛选", "secondary")]
}
```

- 把 empty 节点放进**两个 view panel**：
  - calendar panel：放在 legend 之后、CalendarGrid 之前（inline band 在网格上方）。
  - list panel：放在列表行之前。
- 删除当前 content 末尾的单一 `emptyNode`（避免重复/浮层）；`interaction.views === undefined` 时只在列表 panel 保留一个 inline empty。
- 非 mobile-list 页面保持现有 empty 行为。

**Renderer**

- `.empty-state.empty-inline`：

```css
.empty-state.empty-inline{display:none;width:100%;padding:var(--space-4);
  border-top:1px solid var(--color-border-subtle);
  border-bottom:1px solid var(--color-border-subtle);
  background:var(--color-surface-subtle);box-shadow:none;border-radius:0;}
body[data-state="empty"] .empty-state.empty-inline{display:flex;}
```

- 删除 `body[data-state="empty"] .empty-calendar{position:fixed;...}`。
- `body[data-state="empty"] .calendar-block` 仍隐藏；day header/time rail/grid 保留。
- list view 隐藏 `.list-row`，保留日期标题和 inline band。
- inline band 不使用 `position:fixed/absolute`、不使用大阴影。

**验收**

- empty 截图：day header、time rail、7 列、图例、清空筛选可见；无浮层遮挡。
- 390×844 下不出现横向 overflow；empty band 与 grid 同宽。
- 切换 calendar/list 时 empty 仍在对应面板内。

### 5.3 Form mode：删除 mode pills

**规则**

- 模式只由入口决定：
  - `today`「预约」/列表 `新增预约` → `/appointments/form?mode=new`
  - 详情「改期」→ `/appointments/form?mode=reschedule&recordId=...`，并写入 sessionStorage。
- 表单内**不再提供模式切换**；`formModes` 仍驱动 CTA 文案、客户锁定和 actions。

**Renderer**

- 删除 `applyFormModes` 中的 `mode-tabs` 创建、按钮、`history.replaceState`、`lockEntryMode`。
- 仍从 `?mode=` 选择 `current`；没有参数时用 `formModes[0]`。
- 页面标题动态：

```ts
const title = document.querySelector(".page-title");
if (title) {
  title.textContent =
    current.name === "reschedule" ? "改期预约" : "新增预约";
}
```

- reschedule 保留 `reschedule-context`（「正在改期」+ 客户/项目/时间/护理师）；
- 没有 record 的 reschedule：上下文条显示「请从预约详情进入改期」，`保存改期` disabled；有 record 后启用。
- 删除 `.mode-tabs` CSS 与 `applyReadonlyState` 中的 mode-tabs 选择器。
- 验收：form default/reschedule/disabled 截图不再出现 mode pills；标题与 CTA 一致。

### 5.4 a11y 基线

**范围**：today、appointment-list、appointment-form、appointment-detail 的关键交互；不做全量 axe/AA。

**对比度**

- 新增 `runtimes/standalone/tests/a11y.test.ts`（Chromium-gated）：渲染 phase2 8 页，取关键 selector 的 computed color/background，按 WCAG 相对亮度计算。
- 阈值：普通文本 4.5:1；大文本（≥18pt/14pt bold）3:1。
- 检查 selector：
  - `.card-title`、`.row-title`、`.row-subtitle`、`.form-label`、`.calendar-hour`、`.calendar-day`、`.calendar-block-title`、`.empty-desc`、`.error-desc`、`.tab`/`.tab.active`
  - `.badge.tone-success/warning/danger/info`
  - `.btn.primary`、`.btn.secondary`、`.btn.ghost`、`.btn.danger`
  - `.input` placeholder、`.input:disabled`
- 失败修 token（`text.tertiary`/`text.secondary`/status 色）或用法；token 改动会更新 baseline，需人工复核。

**焦点可见**

```css
:where(a,button,.btn,.tab,.input,.select,.calendar-scroll,
  .list-row[data-row-link],[data-block]):focus-visible{
  outline:2px solid var(--color-action-primary);
  outline-offset:2px;
}
```

- `.search-input` 当前 `outline:none`；改为 `:focus-visible` 保留可见环。
- 检查 focus ring 不被 `.app-scroll`/calendar overflow 裁切；必要时用 inset ring。

**键盘**

- `ListRow`/`[data-row-link]`：`tabindex="0"`、`role="button"`，Enter/Space 触发原 click。
- 日历 block `[data-block]`：同上，Enter/Space 打开 drawer。
- drawer：Escape 关闭；打开时焦点进入 drawer，关闭后回到触发 block。
- 表单：原生 input/select/button 的 tab 顺序；customer picker 按钮可键盘触发。
- Tabs/BottomNav：当前 `href="#"` 的死链不在 v0.5 修；a11y 只保证可聚焦、不误导（若无法跳转，记录为 v0.6 Studio 导航项）。

**表单 label / required**

- FormField 已是 `<label>` 包裹 input；检查每个 input 有可访问名称。
- required 字段给 input 加 `required`/`aria-required="true"`（仅语义，不新增校验逻辑）。
- 错误提示：本轮不做表单校验/错误文案；错误态留 Phase 3 沙箱。

### 5.5 Critic 收敛与停止规则

- **fresh run 只采样一次**：每次 baseline/spec 变化后跑一次真实 Critic；不因结果不理想反复重跑。
- **signed cache** 只用于同 manifest/spec/runtime/profile/model；cache hit 不代表新输入通过。
- **签核门槛**：
  - 0 blocker；
  - ≤2 major；
  - 每个 major 有 `acceptedMajors`（reason + owner + reviewBy）；
  - 0 unwaived deterministic failure；
  - 人工 `visual:sign`。
- **超过 2 major**：先修；不能修则记录为 v0.5.x 债务，不签“通过”。
- **v0.4.1 例外**：v0.4.1 以 4 major 签核；这是补丁版特例，不回溯校验。v0.5 起按新规则。

### 5.6 视觉债

**P1**

- `取消` danger：b-mobile Button `danger` + detailLayout 把 `取消` 映射为 danger；CSS `.btn.danger`；Playwright/截图确认。
- footer CTA 高度：mobile footer primary/secondary 统一为 44px 高；`.app-actions .btn` 统一，保留 touch target；检查 customer-detail/appointment-list/form/detail。
- 页面 gutter：统一 MobileShell 内容左/右 16px；section、card、footer、list row 对齐；用 Playwright 测 `x` 一致性（允许 1px 误差）。

**P2（低风险才做）**

- customer-search idle 文案：把搜索框 placeholder 改为「搜索客户」，保留 brief 的 idle 标题；不改 signed brief。若产品希望改 idle 标题本身，需要新的 brief 版本，放到 v0.5.x。
- detail 状态说明：把「爽约已记录入客户档案」等 note 放到 status badge 下方或 action row 上方，使用统一 notice 样式。
- detail 摘要标题：去掉/重命名 `*详情摘要`，避免与页面标题重复；只改 compiler 默认文案，不改 brief。

## 6. 错误处理与降级

| 场景 | 行为 | 门禁 |
|---|---|---|
| loading 骨架与真实高度偏差 | 调整 CSS/行高；截图测量 > 8px 视为失败 | 视觉/几何检查 |
| empty band 仍遮挡 grid | 改为 grid 上方/下方内容流，不使用 fixed/absolute | 截图 + DOM 断言 |
| mode 删除后入口缺失 | 保留 `/appointments/form?mode=new` 与 detail → reschedule；缺入口记录阻断 | Playwright 导航 |
| 无 record 的 reschedule | 标题/上下文条提示；保存 disabled | 交互检查 |
| 对比度 token 调整导致大面积视觉变化 | 只改失败 token；baseline 全量复核；逐 case 记录 | a11y + 人工签核 |
| 键盘/焦点检查发现不可聚焦控件 | 加 tabindex/role/keydown；若为死链导航，记录 v0.6 债务 | Playwright |
| Critic > 2 major | 不签；修复或转 v0.5.x 债务 | signoff gate |
| Critic infra/超时 | 不签；按已记录失败处理，不伪造 pass | review 失败 |
| baseline 未更新/不匹配 | gate 失败；baseline 只由人更新 | 视觉 gate |

## 7. 测试与验收

### 7.1 单测

- `core/compiler/tests/compiler.test.ts`
  - loading：list Section 有 12 行 Skeleton（或等价节点）；empty 节点在 calendar/list 两个 panel 内；variant `inline`。
  - mode：`formModes` 仍存在；空节点/标题数据正确。
  - cancel：detail actions 中 `取消` 为 danger emphasis。
- `core/renderer-html/tests/renderer.test.ts`
  - loading CSS/HTML：真实 filters/toggle/heading/legend/footer 保留；`.calendar-block` 在 loading 隐藏；list skeleton 12 行；detail values skeleton。
  - empty：inline class、无 fixed/absolute 规则；两个 panel 各有一个 empty。
  - mode：无 `mode-tabs`；reschedule 标题/上下文条；无 record 时 save disabled。
  - a11y：focus-visible 规则、required/aria-required、row/block tabindex。
  - cancel：`.btn.danger`。
- `core/agents/tests/signoff.test.ts` / `runtimes/standalone/tests/visual-cli.test.ts`
  - `acceptedMajors` 解析；2 major 通过；3 major `VISUAL_MAJOR_LIMIT`；缺 reason `VISUAL_MAJOR_UNACCEPTED`；未知 finding `VISUAL_MAJOR_UNKNOWN`。
- `core/design-system/tests/design-system.test.ts`
  - b-mobile EmptyState `inline`、Button `danger` 契约。

### 7.2 Playwright / a11y

- `runtimes/standalone/tests/a11y.test.ts`（skipIf no Chromium）：
  - 8 页关键 selector 对比度；失败列出 selector/ratio。
  - Tab 顺序；filters/toggle/CTA 可聚焦；row/block Enter；drawer Escape。
  - 每个 input 有 label/required；focus-visible 环存在。
- 交互：
  - loading→default 高度差 ≤8px；empty 无浮层；mode 无 pills；reschedule prefill；cancel danger。
  - footer CTA 高度 44px；页面内容 x=16。

### 7.3 视觉验收

```bash
cd pipeline
pnpm spec:engineer --project samples/projects/employee-app-phase2/project.yaml \
  --agent-run /tmp/m1-final2/run-2026-10-22T03-16-05-257Z \
  --runs /tmp/spec-v05 --strict-motion
pnpm render:html --run /tmp/spec-v05/<runId> --out /tmp/html-v05
pnpm visual:baseline --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v05/<runId> --html /tmp/html-v05 \
  --out baselines/employee-app-phase2
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm visual:review \
  --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v05/<runId> --html /tmp/html-v05 \
  --baseline baselines/employee-app-phase2 --runtime dsh --profile prd-ui-visual \
  --runs /tmp/visual-v05 --max-cost-cny 3 --json
pnpm visual:sign --run /tmp/visual-v05/<runId> --signoff-visual /tmp/signoff-v05.md
```

如果 `/tmp/m1-final2/<runId>` 已被清理，按 v0.4 交接重跑 intake/M1；不得修改已签核 brief。v0.5 不改 intake/M1。

预期：

- 24/24 截图；0 console / 0 overflow；diff 仅 v0.5 预期 case。
- fresh critic 0 blocker、≤2 major（目标 0）；remaining major 必须有 `acceptedMajors`。
- baseline 更新；人工复核 loading/empty/mode/footer/cancel 截图。
- 签核绑定新 `manifestHash`/`findingsHash`；`waivers=[]` 或仅 blocker waiver。

### 7.4 出口门禁

- `pnpm test` 652+ 通过；typecheck clean；`test:dsh` 4。
- Phase 1 `8/2/4/8` 全 0；strict motion 8/0/0；render 8+index。
- loading/empty/mode/cancel 的截图与 Playwright 检查通过。
- a11y 关键页面：对比度、焦点、键盘、label/required 通过。
- fresh critic：0 blocker、≤2 major、acceptedMajors 完整。
- baseline + signoff 人工签核；artifacts 更新；本地 commit，不 push。

## 8. 实施顺序

1. Catalog/contracts：EmptyState `inline`、Button `danger`、signoff `acceptedMajors`。
2. Compiler：empty 双 panel、list skeleton、cancel danger、P2 文案（如做）。
3. Renderer：loading in-place skeleton、empty inline、mode 删除、focus/keyboard、footer/gutter。
4. Stop rule gate + `visual:sign` 校验 + 测试。
5. 单测/Playwright/a11y；全量门禁。
6. Spec/render/baseline；真实 critic；按 ≤2 major 修复/接受；`visual:sign`。
7. artifacts、CHANGELOG、roadmap、handoff、AGENTS 更新。

## 9. 关键文件

- `core/design-system/src/catalogs/b-mobile.ts`：EmptyState `inline`、Button `danger`。
- `core/compiler/src/compile-page-spec.ts`：empty 双 panel、list skeleton、cancel danger、P2 文案。
- `core/renderer-html/src/index.ts`：loading/empty/mode/a11y/footer/gutter/cancel。
- `core/agents/src/signoff.ts`：`acceptedMajors`。
- `runtimes/standalone/src/visual/signoff.ts`：max major / accepted major gate。
- `runtimes/standalone/src/visual-sign-cli.ts`：输出/校验 accepted majors。
- Tests：`core/compiler/tests/compiler.test.ts`、`core/renderer-html/tests/renderer.test.ts`、`core/design-system/tests/design-system.test.ts`、`core/agents/tests/signoff.test.ts`、`runtimes/standalone/tests/visual-cli.test.ts`、`runtimes/standalone/tests/a11y.test.ts`。
- `pipeline/baselines/employee-app-phase2/`、`pipeline/artifacts/employee-app-phase2/visual-review/`。

## 10. 完成定义

- [ ] loading 与 loaded 的 calendar/list/detail 高度差 ≤8px；chrome 保留。
- [ ] empty 为 inline band；网格/图例/清空筛选可见；无浮层。
- [ ] form 无 mode pills；入口/标题/上下文条/CTA 一致；无 record 时 save disabled。
- [ ] a11y 关键页面对比度/焦点/键盘/label 检查通过。
- [ ] `取消` danger、footer CTA 44px、gutter 16px。
- [ ] signoff gate ≤2 major + acceptedMajors；fresh run 只采样一次。
- [ ] 24/24 截图、0 blocker、diff 预期；baseline + signoff 已签。
- [ ] 全量门禁绿；artifacts/docs 更新；本地 commit，不 push。

## 11. 风险与处理

| 风险 | 处理 |
|---|---|
| in-place skeleton 仍与 loaded 高度漂移 | 用真实 grid/rows 做骨架；截图测量 ±8px；必要时统一行高 token |
| empty band 加高把 grid 推下首屏 | 截图复核；如果遮挡/滚动不可接受，改为替换 grid 的 inline panel（仍不用浮层） |
| 删除 mode pills 后用户不知道当前模式 | 动态标题 + 上下文条 + CTA；入口唯一；Playwright 覆盖 new/reschedule |
| 对比度 token 调整影响 24 张 baseline | 只改失败 token；逐 case 复核；baseline 人工签核 |
| 键盘焦点在 overflow 容器被裁切 | 用 inset ring 或调整 overflow；Playwright 检查 |
| Critic 采样仍出现 3+ major | 不签；修复或转 v0.5.x；不重跑找干净结果 |
| stop rule 与 v0.4.1 旧 signoff 冲突 | v0.4.1 不回溯；v0.5 新签核适用 |
| 范围膨胀到 Phase 3 | 非目标清单是门禁；Figma/Studio/沙箱/HANDOFF 全部后置 |

## 12. 与后续版本的边界

- v0.5 通过后进入 v0.6：Figma Renderer、Studio、Asset Compiler。
- v0.7：scratch 沙箱、Test Subagent、Handoff Packager。
- v0.8：真实项目试点；v0.9 RC；v1.0 最终交付。
- 7 列日历若在 v0.8 真实项目中被证明密度不足，另开日历布局 spec；不在 v0.5 里反复改。

## 13. 实施结果（2026-10-23）

### 13.1 已实现

- Loading：mobile-list/detail 改为 in-place skeleton；calendar 保留 7 列/12 行、day header、time rail、筛选/切换/标题/图例/footer；list 12 行 skeleton；detail summary value shimmer，loading 中隐藏状态 badge、次级 action row 和 footer。
- Empty：inline band，保留网格/图例/清空筛选；无 fixed overlay；空态与日历面板增加间距。
- Mode：删除 mode pills；标题切到「新增预约/改期预约」；上下文条/CTA/客户锁定保留；无 record 的 reschedule 禁用保存。
- a11y：text/status token 提升到 AA；`:focus-visible`；search focus ring；row/block Enter/Space；drawer Escape + focus 返回；`required`/`aria-required`。
- 视觉债：取消 danger 且右置；footer CTA 44px；gutter 16px；search placeholder「搜索客户」；detail 摘要 value 列对齐；calendar 16:30 按 30 分钟偏移定位并显示真实时间。
- Signoff gate：`acceptedMajors` + `maxMajor`（默认 2）；`visual:sign` 拒绝超过上限或缺少 accepted reason 的 major。

### 13.2 与 spec 的偏差

- `appointment-detail` loading 选择隐藏状态/action/footer，而不是保留 footer 占位；这是 Critic 要求，避免“half-real”状态。
- calendar 16:30 偏移是实施中发现的既有 bug（原先所有块吸附整点并显示整点），v0.5 一并修复；`parseTime` 保留分钟，renderer 用 `margin-top`/height 表达 30 分钟偏移。
- P2 只做了 search placeholder、detail value 对齐、customer lock 视觉、chevron 居中和 empty 间距；detail 摘要标题去重与状态说明位置未做，留 v0.5.x。

### 13.3 证据

- `pnpm test`：**672 passed**；typecheck clean；`test:dsh` 4 passed。
- Phase 1：`8 / 2 / 4 / 8` pages，全 0 blockers。
- Spec Engineer：`/tmp/spec-v05/run-2026-10-23T06-07-48-403Z`，8 Page Specs / 0 blockers / 0 unresolved。
- Renderer：8 HTML + index。
- Visual baseline：`pipeline/baselines/employee-app-phase2`，24 cases，manifest `sha256:6c900b29…c79f`。
- 最终 Critic：`/tmp/visual-v05d/run-2026-10-23T06-10-08-791Z`，24/24、diff 24/0/0、0 console/overflow、**0 major / 4 minor / 0 blocker**、¥0.4105、`usageComplete=true`。
- 签核：胡冀徽，2026-10-23，`acceptedMajors=[]`、`waivers=[]`；`status=success`。
- 成本：2 次有效 Critic + 1 次 infra 失败 ≈¥1.4048；失败未伪造 pass。

### 13.4 剩余 minor（v0.5.x）

1. disabled 状态下 datetime 字段容器视觉丢失。
2. loading 中选中日列仍是静态 tint，不是 skeleton。
3. 周日列灰色 tint（既有）。
4. treatment-notice 已确认时间 `2026/10/22 09:00:00` 格式不统一。

### 13.5 下一步

v0.5 已签核，可进入 v0.6：Figma Renderer、Studio、Asset Compiler。v0.5.x minor 不阻塞 Phase 3。未 commit；按仓库规则本地提交、不 push。
