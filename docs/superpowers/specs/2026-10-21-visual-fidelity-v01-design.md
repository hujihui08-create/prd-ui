# Renderer 视觉保真 v0.1 设计（03 预约与告知切片）

- 日期：2026-10-21
- 状态：Implemented
- 输入：03 真实 PRD 四页切片（`samples/projects/employee-app-appointments-03`）与 [主设计文档](2026-10-19-prd-to-ui-pipeline-design.md)
- 关联：`docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md`、`pipeline/docs/agent-m1.md`

## 0. 结论

v0.1 只解决 03 切片暴露的**可见视觉缺口**，不改变 PRD → Brief → Page Spec 的事实源：

1. 预约列表补**七列日历**，与列表维度同页展示；日历是默认视觉，列表在下方滚动。
2. `MobileShell` 的 `actions` slot 移到滚动区外，形成**底部固定操作栏**。
3. detail 页把动作拆成**主操作**（footer）与**次要操作**（滚动区内 ghost 行）；主操作优先取第一个动作，并保留含「开单」的动作。
4. `mobile-form` 只渲染**一个主 CTA**，另一个模式用「另一模式 + 动作名」提示，不再出现两个主按钮。
5. `UiBriefPage.noticeBlocks` 支持**按项目分块的告知内容**；detail 渲染 `告知内容` 标题 + 每个项目一张 Card，并隐藏旧的单段 `notices` 字段。

## 1. 契约变更

### 1.1 `UiBriefPage.noticeBlocks`

```ts
interface UiBriefPage {
  // ...
  noticeBlocks?: Array<{ title: string; items: string[] }>;
}
```

- 可选字段，旧 brief 不需要迁移。
- 只用于 detail 类页面（术后告知、交接说明等）。
- 有 `noticeBlocks` 时，compiler 不再把 `notices` 放进 summary/fields，避免重复长文本。
- `UiBriefPageSchema` 同步增加 strict 校验。

### 1.2 `CalendarGrid`（b-mobile catalog）

```ts
props: {
  days: Array<{ label: string; date: string; today?: boolean }>;
  hours: string[];
  blocks: Array<{
    day: number;       // 0..6
    start: number;     // hour, 9..20
    duration: number;  // hours
    title: string;
    subtitle?: string;
    status?: string;
    tone?: "neutral" | "success" | "warning" | "danger" | "info";
  }>;
}
```

- `mobile-list` 的 `allowedComponents` 增加 `CalendarGrid`。
- compiler 从 `mockData.rows` 生成 blocks：`time` 解析为 start/duration，`customer`/`project`/`status` 作为块内容与 tone。
- 没有合法时间时回退 09:00 / 1 小时；日历始终显示 09:00–20:00。
- 日历在 `empty` 状态下隐藏，列表 heading 一并隐藏。

### 1.3 `mobile-form` 动作

- `actions[0]` 进入 `actions` slot（固定 footer，主 CTA）。
- `actions.slice(1)` 以 `Row(Text("另一模式"), Text(action))` 出现在表单内容里；语义 validator 仍能看到完整 action 文案。

## 2. 渲染规则

- `MobileShell.actions` 不再位于 `.app-scroll` 内；新增 `.app-actions`，`flex:0 0 auto`，按钮 `flex:1`、`white-space:nowrap`。
- `.calendar` 使用 CSS grid：`44px + repeat(7, minmax(44px, 1fr))`，行高 44px，块用 `grid-column` / `grid-row` 定位，块高随时长。
- 今天列使用 `.calendar-day.today` 高亮。
- `noticeBlocks` 的 Card 使用现有 `Card` + `List` 组件，不新增渲染原语。
- `body[data-state="empty"]` 隐藏日历、列表行、inventory card 和 heading.3，只保留空态说明与筛选/主操作。

## 3. 测试

- `core/design-system/tests/design-system.test.ts`：`mobile-list` 允许 `CalendarGrid`，b-mobile catalog 包含该组件。
- `core/compiler/tests/compiler.test.ts`：
  - `mobile-list` 生成 7 天、4 个 blocks、正确 start/duration/tone。
  - `mobile-form` 只生成一个主 Button，并保留「保存改期」文本。
  - detail 的 `noticeBlocks` 生成项目 Card，`告知内容` 文本存在，`notices` FormField 被移除。
- `core/renderer-html/tests/renderer.test.ts`：
  - 03 列表渲染 `.calendar-grid`、block 内容、固定 footer。
  - 03 表单只有一个 footer 主 CTA，且包含另一模式提示。
- `runtimes/standalone/tests/intake-cli.test.ts`：03 fixture 的 brief 含 `noticeBlocks`，发布后仍通过 gate。
- `phase1:verify`：8 页 / 2 页 / 4 页全部 `0 blockers`。

## 4. 证据

- `pipeline/artifacts/employee-app-appointments-03/`：4 页 HTML + 5 张截图（日历、空态、固定操作栏、单 CTA、告知分块）。
- 真实 dsh 数据沿用 03 切片：intake ¥0.5147、M1 ¥0.2746；v0.1 只改渲染，不新增模型调用。
- 03 的 sample `ui-brief.json` 和 `intake-appointments-03` fixture 已人工补 `noticeBlocks`（内容来自 PRD §9），用于 v0.1 渲染验收；该 brief 的 hash 不再对应原始 intake run，后续真实 intake 重跑时应让 briefer 直接生成 `noticeBlocks` 并重新签核。
- `pnpm test`：500 passed；typecheck clean；`pnpm test:dsh` 2 passed。

## 5. 限制与下一版

- 业务状态（已登记/已到店/爽约/已取消）尚未驱动动作栏切换；当前 HTML 默认展示「已登记」动作。
- 表单 mode 只是提示，不是可交互切换。
- 日历是静态周视图；没有日期选择、翻周、点空格新建的真实交互。
- motion 仍未进 HTML；没有 Visual Critic / 自动截图 diff。
- 这些留给 v0.1.1 / v0.2：业务状态 actions、真实 mode、日历交互、motion 与视觉回归。
