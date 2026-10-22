# v0.4 动效与视觉回归设计

- 日期：2026-10-22
- 状态：Approved（设计已确认，待实现）
- 输入：Phase 2 clean 出口（v0.3.1，0 waiver / 0 patch）、主设计文档、v0.4 版本路径
- 关联：[主设计文档](2026-10-19-prd-to-ui-pipeline-design.md)、[Clean Phase 2 收尾](2026-10-22-clean-phase-2-finish-design.md)

## 0. 结论

v0.4 只做“Phase 2 已跑通、但视觉/动效还没闭环”的部分：

1. **motion 真正进 HTML**：compiler 生成稳定 node id，Spec Engineer 解析 M1 motion binding，renderer 用 CSS 执行预设并支持 reduced-motion。
2. **Visual Review 新阶段**：渲染后启动截图矩阵、确定性检查、与 baseline 的像素 diff，再由 Visual Critic agent 做主观视觉评审，最后人工 `visual:sign`。
3. **customer picker 与完整日期**：把 PRD 已声明但 renderer 未接的 picker 流程接通；日历空格预填完整 ISO 日期。
4. **视觉保真度修复**：去掉列表裸字段行、详情/告知重复字段、裸状态文本、单 Tab、搜索 idle 孤立按钮、表单原始输入等问题。

本 spec 不重开 Phase 2 的业务范围；它把 v0.3.1 的“能跑通”推进到“视觉可回归、动效可验收”。

## 1. 现状与问题

| 项 | 现状 | 问题 |
|---|---|---|
| motion | M1 产出 8 个 preset、34 条 node binding；Page Spec 已携带 `motion` | renderer 不消费；binding 的 node id 在 layout 中不存在，Spec Engineer 报 34 条 `SPEC_MOTION_NODE_UNRESOLVED` |
| node id | compiler 不写 `SpecNode.id` | M1 的语义 id（`ad.footer-checkin`）无法稳定落位；每次运行无法验证动画绑定 |
| 视觉验收 | 人工 Playwright 巡检 + 19 张截图 | 无 Visual Critic、无 baseline、无截图 diff；视觉问题不可回归 |
| picker | PRD/brief 声明 form → customer-search `mode=picker` | renderer 没有链接路由/状态恢复；「选择客户」按钮 inert |
| 日期 | 日历空格传 day-of-month（`03 09:00`） | 不满足 PRD 的完整 `YYYY-MM-DD` 契约 |
| 视觉保真 | 功能可用 | 列表裸字段行、detail/notice 重复字段与裸状态、单 Tab、搜索 idle 按钮、表单原始输入 |

## 2. 范围与非目标

### 2.1 范围

- motion 链路：semantic node id → Page Spec → renderer。
- Visual Review：截图矩阵、确定性 gate、pixel diff、Visual Critic、人工签核、baseline。
- picker 与完整日期。
- 8 页视觉保真修复。
- 对应的单测、集成测试、Playwright 验收与文档。

### 2.2 非目标

- Phase 3：Figma Renderer、Studio、scratch 沙箱、Handoff Packager。
- 完整 a11y AA、axe 自动化、键盘/焦点全量测试（Phase 3）。
- 品牌插画/图片资产、60–80 图标库、C 端风格包。
- 真实项目 Phase 4 验收、用户最终签核。
- 新页面、新业务规则、新后端接口。
- motion 的 JS 物理动画/复杂编排；v0.4 使用 CSS keyframes/transition。

### 2.3 设计系统与项目切换

设计系统、项目、Agent runtime 是三条独立轴，切换时不要混用：

| 轴 | 决定因素 | 切换方式 |
|---|---|---|
| 设计系统 | `page.profile` + `page.target`；Profile/Catalog/Archetype | 改 brief 的 profile/target；新系统需补 profile/catalog/asset manifest |
| 项目 | `project.yaml` + brief + PRD + manifests | 只换 `--project`，不改代码 |
| Agent runtime | dsh profile（`prd-ui-agents` / `prd-ui-intake` / `prd-ui-visual`） | CLI `--profile`；与设计系统 profile 无关 |

- 单 profile 项目：`brief.meta.profile` 与每页 `page.profile` 一致；`project.yaml.manifests` 提供对应资产 manifest。
- 混合项目：每页各自 `profile`；M1 的 `catalogsByProfile` / `motionTokensByProfile` 按页传入，compiler 逐页取 catalog。
- 新设计系统：在 `core/design-system` 增加 profile/catalog（必须提供 `PageShell` 或 `MobileShell`，以及页面用到的组件/槽位），在项目 manifests 注册；否则 compiler 直接报错，不会静默降级。
- 组件复用：通用组件进 catalog，跨项目复用；页面特有组合留在 compiler。切到缺少该组件的 catalog 时，validators 会阻断，需在目标 catalog 实现或改用允许的组件。
- 切项目不改变设计系统；切设计系统不改变项目，只改 brief 的 profile/target 与资产映射。

## 3. Motion 链路

### 3.1 语义 node id 注册表

新增 `core/design-system/src/semantic-ids.ts`，作为 compiler 与 M1 共用的稳定 id 契约。

```ts
export type SemanticKind =
  | "page"
  | "action"
  | "field"
  | "row"
  | "card"
  | "mode"
  | "view"
  | "calendar";

export function semanticNodeId(
  pageId: string,
  kind: SemanticKind,
  key: string
): string {
  return `${pageId}.${kind}.${key}`;
}
```

注册表覆盖 12 个 archetype 的已知语义键。8 页 clean 切片至少覆盖：

| 页面 | 示例 id |
|---|---|
| today | `today.page.root`、`today.quick.new-appointment`、`today.quick.create-order`、`today.quick.customer-search`、`today.row.appointment`、`today.row.callback` |
| customer-search | `customer-search.row.result`、`customer-search.action.clear`、`customer-search.action.view-detail` |
| customer-detail | `customer-detail.action.view-appointment`、`.new-appointment`、`.view-notice`、`.callback` |
| appointment-detail | `appointment-detail.action.checkin`、`.open-order`、`.reschedule`、`.cancel`、`.notice`、`.customer` |
| appointment-form | `appointment-form.field.customer`、`.start-time`、`.end-time`、`.therapist`、`.source`、`appointment-form.action.save`、`.pick-customer`；`new`/`reschedule` 是 JS 模式标签，不是 motion 节点 |
| treatment-notice | `treatment-notice.action.confirm` |
| appointment-list | `appointment-list.action.new-appointment`、`.toggle-view`、`.view-detail`、`appointment-list.row.appointment`、`appointment-list.calendar.grid`、`appointment-list.view.list` |
| callback-register | `callback-register.field.customer`、`.service`、`.content`、`.result`、`callback-register.action.save`、`.pick-customer` |

规则：

- 单个节点使用唯一 `node.id`；重复行使用同一个 **group id**（如 `appointment-list.row.appointment`），compiler 给每行写 `data-motion-group`，行本身的 `node.id` 加序号。
- 未在注册表覆盖的页面/组件使用路径 id（`<pageId>.<slot>.<type>.<index>`）；这类页面不进入 v0.4 的 0-unresolved 验收。
- id 只由语义键和页面 id 决定，不依赖 mock 数据、数组顺序或随机值。

### 3.2 Compiler

`compilePageSpec` 为每个 `SpecNode` 写 `node.id`：

- 页面根：`semanticNodeId(page.id, "page", "root")`。
- 已知 action/field/row/card/mode/view：查注册表。
- 重复行：`node.id = groupId + "." + index`，同时 `props.motionGroup = groupId`。
- `data-motion-group` 只作为渲染属性，不进入 Page Spec 的必填契约。

Spec Engineer 的 motion 解析新增：

```ts
resolveMotionBinding(binding, specs): {
  nodeIds: string[];
  groupIds: string[];
  unresolved?: string;
}
```

- 精确匹配 `node.id` → `nodeIds`。
- 匹配 group id → 展开为该组所有节点。
- 旧 fixture 的语义 id 通过 `legacyMotionAliases`（`core/spec-engineer/src/motion-aliases.ts`）映射（例如 `ad.footer-checkin` → `appointment-detail.action.checkin`）。
- 解析失败 → `SPEC_MOTION_NODE_UNRESOLVED`。

v0.4 起，clean 8 页的 `SPEC_MOTION_NODE_UNRESOLVED` 从 warning 升级为 **blocker**；其他 sample 若未迁移，保留 warning 并在验收报告中列出。升级前先迁移 8 页 fixture 与 sample。

升级通过 `SpecEngineerInput.strictMotionPages?: string[]` 控制：

- clean `employee-app-phase2` 传 8 页 id，未解析即 blocker；
- 其他项目不传，保持 warning；
- 迁移完成后可把默认值改为 `"all"`。

### 3.3 Renderer

`PageSpec.motion` 已存在，renderer 新增：

- 给绑定节点输出 `data-motion-preset="<preset>"`、`data-motion-duration`、`data-motion-easing`。
- 页面级 binding（无 nodeId）作用于根 shell。
- preset → CSS 映射：

| preset | CSS 行为 |
|---|---|
| `enter-fade` | opacity 0→1 + translateY(4px)→0 |
| `page-push` | translateX(12px)→0 + opacity |
| `sheet-up` | translateY(16px)→0 |
| `state-swap` | opacity 0→1 |
| `list-stagger` | 子节点按 `--stagger-index` 递增 delay，使用 preset.staggerMs |
| `press-feedback` | `:active` scale(.98) |
| `confirm-collapse` | scale(.98) + opacity |
| `toast-in` | translateY(-8px)→0 + opacity |

- `prefers-reduced-motion: reduce` 按 `motion.reducedMotion.fallback`：
  - `none`：不添加动画；
  - `fade`：只保留 opacity；
  - `instant`：无 transition/animation。
- motion 不改变布局尺寸；不使用绝对定位或 JS 测量。
- 未知 preset 由 Spec Engineer gate 阻断，renderer 不静默。

## 4. Visual Review

### 4.1 新阶段

```text
spec:engineer → render:html → visual:review → visual:sign
```

Visual Review 是渲染后的独立阶段，不把 HTML 塞回 M1。

### 4.2 Screenshot 矩阵

`core/visual-review` 生成确定性矩阵，至少覆盖：

- 每页 `state=default`。
- Page Spec 中的 `empty / loading / error / disabled`（存在才截）。
- `businessStates` 每个状态。
- `formModes` 每个 mode。
- `views` 的 calendar/list。
- 搜索 idle / 有结果 / 无匹配。
- 日历抽屉、详情抽屉。
- 告知未确认 / 已确认。

矩阵项结构：

```ts
interface VisualCase {
  id: string;              // 唯一，如 appointment-detail.cancelled
  pageId: string;
  state: string;           // default/empty/.../business:已取消
  query?: Record<string, string>;
  actions?: Array<
    | { kind: "search"; value: string }
    | { kind: "toggle-view" }
    | { kind: "open-drawer" }
    | { kind: "confirm-notice" }
    | { kind: "select-mode"; mode: "new" | "reschedule" }
  >;
  viewport: { width: number; height: number };
}
```

截图通过 query 驱动状态：`state`（页面状态）、`status`（business state）、`mode`（form mode）、`view`（calendar/list）；搜索/抽屉/告知确认通过 `actions` 执行。8 页 clean 切片目标 19–24 张；矩阵数量必须与 manifest 一致。

### 4.3 确定性检查（硬门禁）

| code | 条件 |
|---|---|
| `VISUAL_SCREENSHOT_MISSING` | 矩阵项没有截图 |
| `VISUAL_CONSOLE_ERROR` | 页面 console error 或 pageerror |
| `VISUAL_OVERFLOW` | `scrollWidth > clientWidth + 1` 或关键元素越界 |
| `VISUAL_DIFF_EXCEEDED` | baseline 存在且 diff 超过阈值 |
| `VISUAL_BASELINE_MISSING` | 矩阵项没有 baseline（首次建立除外） |

diff 参数：

- 浏览器：Chromium，`deviceScaleFactor: 1`，禁用动画/过渡（截图前 `emulateMedia({ reducedMotion: "reduce" })`）。
- 比较：`pixelmatch`，`threshold: 0.1`，`maxDiffPixelRatio: 0.01`。
- 输出 diff PNG 到 run 的 `diff/`，只作证据，不提交。

### 4.4 Visual Critic Agent

新增 `core/agents/src/roles/visual-critic.ts`，并在 `AgentTaskRoleSchema` 增加 `"visual-critic"`。

输入：

- 截图 manifest + PNG 路径（相对 run 目录）；
- Page Spec（页面/状态/交互/motion）；
- profile 与 visual-style pack；
- 当前 findings（用于二次评审）。

输出 schema：

```ts
interface VisualCritique {
  verdict: "pass" | "changes";
  findings: Array<{
    id: string;                 // VC-001
    severity: "blocker" | "major" | "minor";
    pageId: string;
    state: string;
    evidence: string;           // 截图路径 + 位置
    issue: string;
    proposal: string;
  }>;
  summary: string;
}
```

规则：

- 只做主观视觉判断：层级、留白、对齐、密度、视觉平衡、品牌一致性。
- 不重复确定性检查（console/overflow/diff）。
- 不修改文件、不写最终交付目录。
- blocker 必须有人工 waiver 才能通过；major 是 warning；minor 记录不阻断。
- 真实 dsh 使用新 profile `prd-ui-visual`（vision + 文件读取，maxTokens 65536）；standalone 使用 scripted critic 做测试。
- 预算：`--max-cost-cny 3`，usage fail-closed；一次 schema repair。

### 4.5 Gate 与签核

`runVisualReview` 输出：

```ts
interface VisualReviewResult {
  status: "passed" | "awaiting_signoff" | "blocked";
  cases: number;
  screenshots: number;
  findings: VisualFinding[];
  diff: { passed: number; failed: number; missing: number };
  costCny: number;
  usageComplete: boolean;
}
```

- 有确定性 blocker → `blocked`。
- 无确定性 blocker，但缺 `visual:sign` → `awaiting_signoff`。
- 签核文件包含 `manifestHash`（截图 manifest 的 canonical hash）和 findings hash；waiver 只对 `VISUAL_CRITIC_BLOCKER` 生效，必须有 owner/reason/expires。

```md
# Visual signoff

<!-- signoff
{
  "signer": "Sample Reviewer",
  "date": "2026-10-22",
  "manifestHash": "sha256:...",
  "findingsHash": "sha256:...",
  "waivers": []
}
-->
```

- `visual:sign` 与 `agent:sign` 同构，不调用模型；`manifestHash` 或 `findingsHash` 不匹配时拒绝签核。

### 4.6 Baseline

- 位置：`pipeline/baselines/<project>/`，每个矩阵项一个 PNG + `manifest.json`（pageId/state/query/viewport/sha256）。
- `pnpm visual:baseline` 生成/更新 baseline，只做确定性截图，不调用模型。
- `visual:review` 从不自动更新 baseline；baseline 更新必须由人显式运行并提交，防止视觉回归被静默接受。
- baseline 变更进入 commit diff；CI/本地重跑必须稳定。

### 4.7 CLI 与产物

```bash
pnpm visual:review --project <yaml> --spec-run <dir> --html <dir> \
  --baseline pipeline/baselines/<project> --runtime dsh \
  --runs /tmp/visual-review --max-cost-cny 3 --json

pnpm visual:sign --run /tmp/visual-review/<runId> \
  --signoff-visual /tmp/signoff-visual.md

pnpm visual:baseline --project <yaml> --spec-run <dir> --html <dir> \
  --out pipeline/baselines/<project>
```

`pipeline/package.json` 新增 `visual:review`、`visual:sign`、`visual:baseline` 三个脚本；统一走 `runtimes/standalone` 的 tsx CLI。

产物：

```text
runs/<runId>/
  visual-review.json
  state.json
  screenshots/<case-id>.png
  screenshots/manifest.json
  diff/<case-id>.png
  findings/visual-gate.json
  findings/visual-critic.json
  signoff/visual.md
  logs/visual.ndjson
```

## 5. Picker 与完整日期

### 5.1 Contract

`UiBriefPage` / `PageSpec` 新增可选字段：

```ts
pickerReturnTo?: PageId;   // customer-search：picker 完成后回到的表单页
customerPicker?: PageId;   // appointment-form / callback-register：客户选择器指向的搜索页
calendarWeekStart?: string; // ISO date，日历一周的第一天
```

约束：

- `pickerReturnTo` 只允许出现在 `customer-search`。
- `customerPicker` 只允许出现在 mobile form 页面。
- `calendarWeekStart` 只允许出现在 `mobile-list`，且页面有 `date` 或 `time` 字段。

### 5.2 Compiler / Renderer

- Compiler 输出 `data-picker-search`、`data-picker-return`、`data-calendar-week-start`。
- 表单「选择客户」按钮：
  - 保存当前表单草稿到 `sessionStorage["prd-ui:picker:<formPageId>"]`；
  - 跳转 `<searchPage>.html?mode=picker&returnTo=<formPageId>`。
- 搜索页 `mode=picker`：
  - 标题显示「选择客户」；
  - 行点击写入 `sessionStorage["prd-ui:picker:selected"]`，返回 `returnTo` 页；
  - 取消/返回不写入选择结果，表单草稿保留。
- 表单恢复：
  - 读取草稿并回填字段；
  - 读取 selected 客户并填入 customer；
  - 清理 selected，保留草稿直到保存/取消。
- 日期：
  - `calendarWeekStart` 缺省为页面第一条 `mockData.rows[].date`（`MM-DD`）所在周的周一，年份取 `brief.meta.date`；没有可解析日期时回退到 `brief.meta.date` 所在周的周一；
  - `CalendarGrid` 每个 day 携带完整 `YYYY-MM-DD`；
  - 空格点击传 `date=YYYY-MM-DD&time=HH:mm`；
  - 表单 `startTime` 预填 `YYYY-MM-DD HH:mm`，`endTime` 默认 +60 分钟。

### 5.3 Briefer / gate

- Briefer prompt：有 customer picker 的页面必须写 `customerPicker`/`pickerReturnTo`；有日历的页面必须写 `calendarWeekStart` 或给出可由 `meta.date` 推导的明确说明。
- Brief gate 新增：
  - `BRIEF_PICKER_RETURN_UNKNOWN`（blocker）：`pickerReturnTo` 不是存在的页面；
  - `BRIEF_CUSTOMER_PICKER_UNKNOWN`（blocker）：`customerPicker` 不是存在的 customer-search；
  - `BRIEF_CALENDAR_DATE_INVALID`（blocker）：`calendarWeekStart` 不是 ISO 日期或页面没有 date/time。

## 6. 渲染保真度修复

组件复用规则：**只有跨两个以上 archetype/页面复用、且有稳定语义契约的能力才进 catalog；页面特定的组合留在 compiler，页面特定的行为留在 renderer，不新增一次性组件。** 本轮的 `datetime-local` 是 `Input` 的通用类型，`badge`/`badgeTone` 是 `Card` 的通用 prop；日历图例用现有 `Row` + `Badge` 组合，picker 复用 `Input`/`Button`/`ListRow`。

这些是 v0.4 的硬验收项：

| 页面 | 修复 |
|---|---|
| mobile-list | 删除字段标签 Row（“日期 时间段 客户 …”）；字段信息只在行/日历块里表达 |
| detail / treatment-notice | 摘要卡与 fields slot 去重：只读 detail 不再渲染重复的字段节点，但保留次要动作 Row；状态 badge 放在摘要卡标题行，删除裸状态文本 |
| home | 底部 Tab 至少包含「今日」+「预约列表」：compiler 将 `page.id` 并入 `navigation.tabs`，并按 pageNames 解析标签；不伪造宿主页面；只有一个 Tab 时不渲染空 TabBar |
| customer-search | idle 状态隐藏结果依赖的页面级「查看详情」；不显示底部「搜索」按钮（输入即过滤）；只有有结果时显示「查看详情」；空态显示「清空关键词」 |
| mobile-form | `startTime`/`endTime` 使用 `datetime-local`；客户字段接 picker；有 formModes 时移除重复的「另一模式」文案 |
| calendar | 标题显示完整日期；390px 下横向滚动，最小列宽；增加状态色图例；按 `mockData.rows[].date` 的「周X」把块放到正确列，块文字保持可读 |
| 全局 | 列表行/搜索结果行有 hover/active 反馈；按钮 disabled/readonly 有可辨识样式 |

### 6.1 页面级视觉设计

统一基线：顶部 48px（返回 + 标题，首页为门店名），内容左右 16px、卡片圆角 12px、卡片内边距 16px、卡片间距 12px；底部动作栏 64px；状态 badge 只出现在卡片标题行；页面内不再出现机器字段名。

**今日**
1. TopBar：门店名 + 下拉箭头；消息入口固定关闭。
2. 快捷操作卡：3 个等宽 QuickAction（开单/预约/客户搜索），图标 + 文字，点击有 press 反馈。
3. 我的预约卡：标题行「我的预约」；每条为 ListRow（客户 + 状态 badge / 项目 / 时间段），整行可点。
4. 待回访卡：标题行「待回访」；每条 ListRow（客户 / 项目 / 最近天数）。
5. 空态：卡片内 EmptyState，不显示裸字段。
6. 底部 Tab：今日 / 预约列表两个；不渲染宿主 Tab 占位。

**客户搜索**
1. 顶部返回 + 「客户搜索」。
2. SearchBar 占满宽度，placeholder「输入姓名或脱敏手机号搜索客户」，输入即过滤。
3. idle：居中提示标题 + 说明；不显示「查看详情」，不显示底部「搜索」按钮。
4. 有结果：ListRow（姓名 / 脱敏手机号 · 门店 / chevron），整行点击进入客户详情；不再显示裸字段行「姓名 手机号 门店」。
5. 空态：「没有匹配的客户」+「清空关键词」按钮；清空后回到 idle。
6. picker 模式：标题「选择客户」；行点击选中并返回表单。

**客户详情**
1. 顶部返回 + 「客户详情」。
2. 摘要卡：姓名（标题行）、手机号、等级、余额、累计消费、卡张数、标签、备注、最近服务记录。
3. 动作区：查看预约 / 新增预约 / 查看告知 / 回访登记，使用一列次要按钮或 2×2 动作网格；不再重复摘要字段。
4. 无服务记录时「查看预约」「查看告知」不显示或置灰，并给出说明。

**预约详情**
1. 顶部返回 + 「预约详情」。
2. 摘要卡标题行：摘要标题 + 状态 badge；正文按组展示：客户/手机号、项目/时间段、护理师/门店、来源/创建人/创建时间、委派留痕、服务完成。
3. 次要动作 Row：改期 / 取消 / 术后告知 / 客户详情；放在摘要卡下方，不重复字段。
4. 底部固定动作栏：主 CTA「已到店确认」+ 次 CTA「开单」；状态变为已到店后只剩「开单」；取消/爽约/已取消时动作栏隐藏，显示只读说明。
5. 告知分块：按项目 Card + List；空内容显示「暂无告知内容」，不显示确认。

**新增/改期预约**
1. 顶部返回 + 「新增/改期预约」。
2. 模式 segmented control：新增预约 / 改期；当前模式高亮；URL 同步 `mode`。
3. 字段：客户（输入框 + 行内「选择」按钮）、项目、开始时间、结束时间（`datetime-local`）、护理师、来源（Select）。
4. 改期：客户字段锁定并显示预约 id chip；CTA 为「保存改期」；新增 CTA 为「保存」。
5. 不再显示「另一模式 保存改期」重复文案。
6. 底部 CTA 固定；保存/取消后清理 picker 草稿。

**术后告知**
1. 顶部返回 + 「术后告知」。
2. 摘要卡标题行：摘要标题 + 状态 badge；正文：客户、单号、确认人、确认时间；状态只在 badge 中出现一次。
3. 告知内容：每个项目一张 Card，标题为项目名，List 为话术；不使用裸字段行。
4. 底部 CTA「确认已当面告知」；确认后隐藏动作栏并回填确认人/确认时间。
5. 内容为空：显示「暂无告知内容」，不显示确认 CTA。

**预约列表**
1. 顶部返回 + 「预约列表」。
2. 筛选行：状态/日期 CollapsedFilter；视图切换用 segmented control（日历/列表），不占独立按钮行。
3. 日历：状态色图例；周一至周日，完整日期；390px 下横向滚动，最小列宽 88px；块显示客户 + 项目，按「周X」落列。
4. 列表：按日期分组；行显示客户 + 状态 badge、项目 · 护理师、时间段；整行点击进入详情；不再显示裸字段行。
5. 底部 CTA「新增预约」；点空格进入表单并预填日期时间。
6. 点日历块打开只读抽屉；抽屉提供「查看完整详情」。

**回访登记**
1. 顶部返回 + 「回访登记」。
2. 字段：客户（输入 + 行内选择）、服务项目、回访内容、回访结果（Select）。
3. 底部 CTA「保存回访」；保存后按来源返回今日或客户详情。
4. 客户选择器与新增预约共用同一 picker 契约。

### 6.2 Motion 编排

| 元素 | preset | 时长/缓动 | 行为 |
|---|---|---|---|
| 页面根 | `enter-fade` | 200ms / ease-out | 首次进入 opacity + 4px 上移 |
| 列表行 / 日历块 | `list-stagger` | 200ms + 40ms stagger | 逐行淡入；不改变行高 |
| 按钮 / QuickAction | `press-feedback` | 120ms / ease | active 时 scale(.98) |
| 日历块抽屉 | `sheet-up` | 200ms / ease-out | 从底部 16px 上移淡入 |
| 业务状态切换 | `state-swap` | 160ms / ease | 状态 badge/动作栏淡入 |
| 告知确认 | `confirm-collapse` | 200ms / ease | 确认区收缩并淡出 |
| Toast | `toast-in` | 160ms / ease-out | 从上方 8px 淡入 |

- 动画只使用 transform/opacity，不触发布局。
- 同屏同时运行的 stagger 列表不超过 2 组。
- `prefers-reduced-motion` 按 spec 的 fallback：none/fade/instant；默认 `fade`。

### 6.3 Picker 状态机

```text
form.idle
  --选择客户--> form.picking (保存草稿) -> search.picker
search.picker
  --选择行--> form.restored (selected + draft) -> form.idle
  --返回/取消--> form.restored (draft, no selected) -> form.idle
form
  --保存/取消--> 清理草稿与 selected
```

- 草稿只保存在 sessionStorage，不写后端。
- 返回表单时恢复所有已填字段；picker 取消不清草稿。
- 改期模式客户字段锁定，不允许打开 picker。

## 7. 错误处理、预算与人工门禁

- Screenshot 启动失败/浏览器缺失 → `VISUAL_SCREENSHOT_FAILED` blocker，不产生假通过。
- 矩阵少于 spec 计算数量 → blocker。
- diff 读取失败 → blocker，不按 0 处理。
- Visual Critic 调用失败 → 保留确定性结果，status `blocked`，不能仅靠确定性检查宣布视觉通过；`--runtime standalone` 使用 scripted critic 只用于测试，不作为真实视觉证据。
- 预算：`--max-cost-cny 3`；usage 不完整 → `usage_incomplete` blocker（与 M0/M1 一致）。
- 人工门禁：
  - `visual:sign` 必须包含 `manifestHash` 与 findings hash；
  - baseline 更新必须人工执行并提交；
  - Visual Critic blocker 的 waiver 必须有 owner/reason/expires；
  - 不允许自动签名或自动更新 baseline。

## 8. 测试与验收

### 8.1 单测 / 集成

- `semantic-ids`：id 稳定、重复运行一致、group id 展开正确。
- compiler：8 页 node id 覆盖；picker/date 字段；fidelity 修复的节点结构。
- Spec Engineer：8 页 motion binding 0 unresolved；legacy alias 兼容；其他 sample 的 warning 行为。
- renderer：`data-node-id`、`data-motion-*`、reduced-motion fallback、picker 状态恢复、datetime-local、去重后的 detail/notice。
- visual-review：矩阵生成、screenshot 记录、console/overflow/diff gate、scripted critic、signoff hash、baseline 缺失。
- visual-critic prompt：schema、输入截图清单、禁止修改文件、findings 规则。
- CLI：`visual:review`/`visual:sign`/`visual:baseline` 参数、退出码、JSON summary、usage fail-closed。

### 8.2 端到端验收

在 clean `employee-app-phase2` 上：

1. `spec:engineer` 8 Page Specs / 0 blockers / **0 motion unresolved**。
2. `render:html` 8 页 + index；motion 在页面可见。
3. `visual:review`：
   - 19–24 张截图；
   - 0 console error、0 overflow、0 missing；
   - 与 baseline diff 在阈值内；
   - Visual Critic 输出 findings，无未 waiver blocker；
   - `visual:sign` 后 `passed`。
4. picker：form → customer-search → 选择客户 → 返回表单，字段保留。
5. 日历空格 → form 预填完整日期时间。
6. 6 项保真修复通过截图复核。
7. 重跑 `visual:review`，同一 HTML + baseline 结果稳定。
8. 回归：`pnpm test` 529+、typecheck、`test:dsh` 2、Phase 1 `8/2/4/8` 全 0。

### 8.3 完成定义

v0.4 完成 = 上述 8 项全部通过，并且：

- `pipeline/artifacts/employee-app-phase2/` 包含 visual-review 截图、diff、findings、signoff、baseline manifest；
- 文档更新：主设计 §14.1、README、AGENTS、CHANGELOG、Spec Engineer/agent 文档；
- 本地 commit，不 push，不提交 `.env`、密钥、`node_modules`、`/tmp` 产物。

## 9. 风险与处理

| 风险 | 处理 |
|---|---|
| Playwright/Chromium 安装与 CI 差异 | 固定 Chromium 版本；`visual:review` 启动失败即 blocker；本地与 CI 使用同一 viewport/deviceScaleFactor |
| baseline 频繁漂移 | 禁用动画、固定字体加载、等待 `document.fonts.ready`；diff 阈值明确；baseline 只由人工更新 |
| Visual Critic 主观/不稳定 | 只做 advisory；硬门禁全部确定性；blocker 需要人工 waiver；同输入二次评审只允许 findings 收敛 |
| motion 造成布局抖动 | 只用 transform/opacity；不改变尺寸；reduced-motion 优先 |
| 语义 id 注册表维护成本 | 注册表集中在 design-system；compiler 与 M1 prompt 共用；未覆盖页面回退路径 id |
| picker 状态丢失 | sessionStorage 草稿 + 取消不清草稿；Playwright 覆盖返回/取消/保存三条路径 |
| 日期时区 | `calendarWeekStart` 使用本地日期字符串；不经过 UTC 解析；测试固定 `TZ=Asia/Shanghai` |

## 10. 实施顺序

1. 契约与语义 id 注册表 + compiler node id + 单测。
2. Spec Engineer motion 解析 + gate 升级 + fixture 迁移。
3. Renderer motion 消费 + reduced-motion + 单测。
4. Picker/date 契约、compiler、renderer、Briefer/gate + 测试。
5. 渲染保真度修复 + 截图复核。
6. `core/visual-review` 契约/矩阵/gate + `visual:baseline`/`visual:review`/`visual:sign` CLI。
7. Visual Critic role + prompt/schema + dsh profile + scripted fixture。
8. clean 8 页全链路：Spec → render → visual:review → sign → baseline。
9. 文档、artifacts、全量回归、本地 commit。

## 11. 关键文件

```text
core/design-system/src/semantic-ids.ts          语义 id 注册表
core/compiler/src/compile-page-spec.ts          node id、picker/date、保真修复
core/spec-engineer/src/apply.ts                 motion binding 解析
core/spec-engineer/src/gates.ts                 unresolved blocker
core/agents/src/roles/visual-critic.ts          Visual Critic prompt/schema
core/agents/src/contracts.ts                    visual-critic role
core/visual-review/                             矩阵、gate、run、contracts
core/renderer-html/src/index.ts                 motion、picker、保真修复
runtimes/standalone/src/visual-review-cli.ts
runtimes/standalone/src/visual-sign-cli.ts
runtimes/standalone/src/visual/baseline-cli.ts
dsh/home/profiles/prd-ui-visual/                vision profile
pipeline/baselines/employee-app-phase2/         baseline PNG + manifest
pipeline/artifacts/employee-app-phase2/visual-review/  证据
```
