# v0.4.1 视觉小额补丁设计

- 日期：2026-10-23
- 状态：Implemented & signed（2026-10-23；胡冀徽，`waivers=[]`）
- 输入：v0.4 已签核视觉评审（24/24 截图，9 findings：6 major / 3 minor / 0 blocker）、版本路线 v0.4.1、主设计文档
- 关联：[主设计文档](2026-10-19-prd-to-ui-pipeline-design.md)、[v0.4 设计](2026-10-22-v04-motion-visual-regression-design.md)、[版本路线](../plans/2026-10-23-version-roadmap.md)、[v0.4 交接](../../handoffs/2026-10-23-v04-acceptance-handoff.md)

## 0. 结论

v0.4.1 是 v0.4 之后的补丁版本，只清 Visual Critic 中“明显没收尾”的 6 条 finding，不新增页面、业务能力或后端契约。

本 spec 解决的 6 项：

1. today「我的预约」卡头缺「查看全部」入口（VC-001，major）。
2. 390px 周历只露 3 天，且没有滚动提示或边缘渐隐（VC-002，major）。
3. reschedule 静态截图没有改期上下文，客户锁定但字段全空（VC-006，major）。
4. native `datetime-local` 显示英文 placeholder（VC-007，minor）。
5. 日历选中日没有高亮，时间锚点丢失（VC-008，minor）。
6. 列表 error 状态丢失筛选、日期和视图上下文（VC-009，minor）。

不处理 VC-003（loading skeleton）、VC-004（empty overlay）、VC-005（form mode pills）；它们按版本路线留在 v0.5。也不做完整 a11y、Figma、沙箱或 Handoff。

验收目标：fresh Visual Critic 为 0 blocker、0 新 major；上述 6 项不再以同一 page/state/issue 出现；剩余 3 条 major 作为 v0.5 债务记录；baseline 仅因预期视觉字节变化而更新；人工签核。

## 1. 现状与问题

| Finding | 页面·状态 | 证据 | 根因 | v0.4.1 处理 |
|---|---|---|---|---|
| VC-001 major | `today.default` | 「我的预约」卡头右侧空白，无「查看全部」 | compiler 的 home Card 没有 action 数据；renderer 的 Card 不渲染卡头动作；`linkedRoutes` 没有列表路由 | 增加 `linkedRoutes.list` + Card `actionLabel/actionRoute`，渲染为静态链接 |
| VC-002 major | `appointment-list.default` | 390px 只看到周一至周三，周四至周日无入口或提示 | `.calendar-grid` 固定 7 列、`min-width:720px`；`.calendar-scroll` 可横向滚动但没有任何 affordance | 溢出检测 + 顶部滑动提示 + 右缘渐隐；不压缩列宽 |
| VC-006 major | `appointment-form.mode.reschedule` | 客户禁用但显示「请输入客户」，项目、时间、护理师全空，无原预约摘要 | prefill 只读取详情页点击「改期」写入的 sessionStorage；视觉矩阵直接打开 `?mode=reschedule`，没有记录；renderer 没有上下文条 | 视觉矩阵在导航前注入记录 + renderer 增加「正在改期」上下文条；字段复用现有 prefill |
| VC-007 minor | `appointment-form.default` | 原生输入显示 `mm/dd/yyyy, --:-- --` | `<input type="datetime-local">` 的占位文本由浏览器 UI locale 决定，页面无法直接本地化 | 增加静止态中文显示层，聚焦时让位给原生控件 |
| VC-008 minor | `appointment-list.default` | 11-05 周三列与相邻日无差别 | `today` 标记比较 `brief.meta.date`（2026-10-22）与 2025-11-03 周，无一天匹配；没有 `selected` 概念 | compiler 按筛选日期写 `selected`；renderer 高亮表头和整列 |
| VC-009 minor | `appointment-list.state.error` | 只剩居中错误块，筛选、日期、视图切换全消失 | `statePanels()` 的 error 是绝对定位覆盖层，从 top 48px 盖住整个内容区 | mobile-list 的 error 改为内容流内面板，保留筛选/日期/视图上下文 |

补充根因：

- VC-001 的 PRD 依据是 `samples/projects/employee-app-phase2/prd.md` 的交互规则：“预约列表从今日「我的预约」卡头或工作台「客户预约」进入。”当前 HTML 里卡头没有该入口，属于实现缺口，不是新需求。
- VC-008 的 `resolvedRowDate` 已经是 `2025-11-05`（`calendarWeekStart=2025-11-03`），但该值只用于生成周起始，没有回写到 day 标记；因此高亮数据缺失，不是 CSS 缺失。
- VC-009 的 error 覆盖层是移动壳的通用实现；v0.4.1 只改 `mobile-list` 的 error，其他 archetype 保持原覆盖层，避免连带视觉回归。

### 1.1 明确留给 v0.5 的 finding

| Finding | 内容 | 原因 |
|---|---|---|
| VC-003 major | loading 只有 7×6 短骨架，日期标题和视图切换消失 | 需要完整 12 行 calendar/list skeleton，属于结构改造 |
| VC-004 major | empty 以 floating overlay 覆盖日历 | 需要重排 empty 为 inline 状态，属于结构改造 |
| VC-005 major | new/reschedule mode pills 像调试控件 | 需要重定入口模式规则，属于交互结构 |
| a11y | 对比度、焦点、键盘、表单 label/错误提示全量基线 | v0.5 范围 |

## 2. 范围与非目标

### 2.1 范围

- today 卡头「查看全部」：compiler 路由、Card 数据、renderer 链接与样式。
- 日历：`selected` 标记、表头/列高亮、溢出滑动提示、右缘渐隐、滚动到末端后隐藏提示。
- 列表 error：mobile-list 的内容流内错误面板，保留筛选/日期/视图上下文。
- 表单：`datetime-local` 静止态中文显示；reschedule 上下文条与静态截图注入。
- 视觉矩阵：`VisualCase.storage` 与 reschedule 记录提取；不新增截图 case。
- 对应单测、Playwright 交互检查、baseline 更新、真实 critic 复核、签核与文档。

### 2.2 非目标

- VC-003/004/005 的结构改造。
- 完整 a11y AA、axe 全量、键盘/焦点全量；本 patch 只做滑动区域的 `tabindex`/`aria-label`。
- 新页面、新组件、新业务规则、真实接口。
- TabBar 的「预约列表」链接修复；本 patch 只修卡头入口。
- Figma Renderer、Studio、Asset Compiler、scratch 沙箱、Test Subagent、Handoff。
- 修改已签核 brief、M1/intake 产物、dsh profile、pricing。
- 新增截图 case；矩阵保持 24 项。
- 不升级 PageSpec schema 版本；只增加可选字段。

### 2.3 不变项

- `samples/projects/employee-app-phase2/ui-brief.json` 不编辑；「查看全部」由 IA 路由推导，不写进 brief。
- M1、intake、Spec Engineer 的输入输出结构不变；`--strict-motion` 仍是 8 Page Specs / 0 blockers / 0 unresolved。
- `pipeline/baselines/employee-app-phase2` 只由人运行 `visual:baseline` 更新；`visual:review` 不写 baseline。
- dsh 仍固定 `0.2.1-rc.2`；`prd-ui-visual` 仍为 65536 maxTokens、900s timeout。
- 本地 commit，不 push；不提交 `.env`、key、`runs/`、`.visual-cache/`。

## 3. 方案选择

| 决策 | 采用方案 | 备选与取舍 | 理由 |
|---|---|---|---|
| today 入口 | `linkedRoutes.list` + Card `actionLabel/actionRoute` | 硬编码标题「我的预约」；在 compiler 插 Row 头 | 数据驱动、可跨项目复用；不把中文标题写进 renderer；不改变 Card 结构 |
| 日历提示 | JS 检测溢出，设置 `data-scrollable/data-scroll-end`，CSS 显示提示和渐隐 | 纯 CSS media query；直接压缩成 7 列 | 能准确判断是否需要提示、滚到末端会消失；压缩列宽会改变密度，属于 v0.5 结构改造 |
| 选中日 | compiler 写 `selected`，renderer 高亮表头和列 | JS 解析筛选文本；只高亮 today | 选中日来自数据（筛选日期），不依赖 DOM 文本；当前周不含 today，只高亮 today 无法修复 |
| error 上下文 | mobile-list 的 error 面板放进 `app-scroll` 内容流，隐藏数据区 | 固定 top 偏移；在覆盖层里克隆筛选条 | 真实保留上下文 DOM，不重复交互元素；固定偏移会随筛选行高度变化而失效 |
| datetime 文案 | 静止态中文显示层，聚焦/选择时让位给原生控件 | 自定义日期控件；只在输入下方加格式提示 | 保留原生 picker 和现有表单逻辑；自定义控件超出 S 规模；下方提示无法遮住英文 placeholder |
| reschedule 静态上下文 | 视觉矩阵导航前注入 sessionStorage + renderer 上下文条 | compiler 写 `rescheduleContext`；只加空状态说明 | 复现真实点击路径，不新增 PageSpec 能力；跨页派生记录更适合后续版本 |

所有选择都保持 v0.4.1 的 S 规模；任何需要重排页面结构或新增交互模型的方案都推迟到 v0.5。

## 4. 数据契约

### 4.1 `PageSpec.linkedRoutes.list`

```ts
linkedRoutes?: {
  create?: string;
  detail?: string;
  customer?: string;
  notice?: string;
  form?: string;
  /** 列表页路由；today 卡头的「查看全部」消费此值。 */
  list?: string;
};
```

`PageSpecSchema.linkedRoutes` 增加同名字段，仍为可选、严格对象。

选择规则（`linkedRoutesFor`）：

```ts
const listPages = brief.ia.pages.filter(
  (entry) => entry.archetype === "mobile-list" && entry.id !== "customer-search"
);
const listPage =
  listPages.find((entry) => entry.id.includes(moduleKey)) ??
  (page.id === "today"
    ? listPages.find((entry) => entry.id.includes("appointment"))
    : undefined) ??
  listPages[0];
```

- `customer-search` 是 picker/搜索页，不作为「列表」候选。
- today 的 `moduleKey` 是 `today`，没有同名列表，因此按 `appointment` 找 `appointment-list`。
- 没有列表页时省略 `list`；Card 不渲染入口，不产生死链。

### 4.2 Card 动作 props

`SpecNode.props` 是开放对象，PageSpec schema 不需要变更；但 catalog validator 会拒绝未声明的 prop。必须在 `b-mobile`、`c-expressive`、`b-dense` 的 `Card` 契约中增加两个可选 string prop：

```ts
actionLabel: { type: "string" },
actionRoute: { type: "string" },
```

否则 `phase1:verify` 会报 `CATALOG-PROP-UNKNOWN`。三个 library 都加是为了契约一致；本 patch 实际只在 mobile home 生成 action。

```ts
{
  type: "Card",
  props: {
    title: "我的预约",
    actionLabel: "查看全部",
    actionRoute: "/appointments"
  }
}
```

- `actionRoute` 是路由字符串，不是 HTML 文件名；renderer 用现有 `routeHref()` 解析为 `<pageId>.html`。
- 只有 `actionLabel` 和可解析的 `actionRoute` 同时存在才渲染链接。
- 该 props 不写入 brief；由 compiler 的 home layout 生成。

### 4.3 CalendarGrid 的 `selected`

`CalendarGrid.props.days` 的每一项增加可选布尔值：

```ts
{ label: "周三", date: "2025-11-05", today: false, selected: true }
```

- `today` 仍表示 `brief.meta.date` 当天。
- `selected` 表示当前筛选/锚定日；v0.4.1 用 `resolvedRowDate`。
- 两者可以同时为真；CSS 顺序让 `selected` 的视觉优先。

### 4.4 `VisualCase.storage`

```ts
export interface VisualCase {
  id: string;
  pageId: string;
  state: string;
  query?: Record<string, string>;
  actions?: VisualAction[];
  /** 导航前注入的 sessionStorage，用于复现真实入口路径。 */
  storage?: Record<string, string>;
  viewport: { width: number; height: number };
}
```

- 只用于截图夹具，不进入 Page Spec、brief 或 baseline manifest。
- screenshot adapter 在 `page.goto` 之前调用 `page.addInitScript` 写入；写入失败按截图失败处理，不允许静默通过。

### 4.5 版本与兼容性

- 新增字段全部可选；旧 Page Spec、旧 baseline、旧 brief 仍然有效。
- `PageSpec.meta.version` 保持 `0.1.0`：这是制品 schema 版本，不是发布版本；本次没有 required 字段变化。
- 不修改 `UiBriefSchema`、M1 schema、intake schema。

## 5. 实现设计

### 5.1 today「查看全部」

**Compiler**

`buildLayout` 的 `home` 分支给「我的预约」Card 增加 action：

```ts
{
  type: "Card",
  props: {
    title: "我的预约",
    ...(listRoute === undefined
      ? {}
      : { actionLabel: "查看全部", actionRoute: listRoute })
  },
  children: [/* 现有 ListRow 与 EmptyState 不变 */]
}
```

`listRoute` 从 `linkedRoutesFor(brief, page).list` 取得；不在 renderer 里判断标题。

**Renderer**

`Card` 分支：

```ts
const actionLabel = str(props.actionLabel);
const actionRoute = str(props.actionRoute);
const actionHref = routeHref(actionRoute);
const action =
  actionLabel !== "" && actionHref !== undefined
    ? `<a class="card-action" href="${esc(actionHref)}">${esc(actionLabel)}<span class="card-action-chevron" aria-hidden="true">›</span></a>`
    : "";
```

卡头顺序为标题、动作、插图：

```html
<div class="card-head">
  <h2 class="card-title">我的预约</h2>
  <a class="card-action" href="appointment-list.html">查看全部<span aria-hidden="true">›</span></a>
</div>
```

CSS：

```css
.card-action{margin-left:auto;display:inline-flex;align-items:center;gap:2px;
  font-size:var(--type-label-sm-size);line-height:var(--type-label-sm-line);
  font-weight:var(--type-body-md-weight);color:var(--color-text-secondary);
  white-space:nowrap;}
.card-action-chevron{font-size:16px;color:var(--color-text-tertiary);}
```

- 链接是普通 `<a>`，不是 Button；静态 HTML 直接可跳转。
- 没有插图时动作靠右；未来有插图时动作在插图左侧，避免遮挡。
- 路由无法解析时不渲染；不生成 `href="#"`。

### 5.2 日历滚动提示与选中日高亮

**Compiler**

```ts
const weekEnd = isoAddDays(weekStart, 6);
const selectedDate =
  resolvedRowDate ??
  (brief.meta.date >= weekStart && brief.meta.date <= weekEnd
    ? brief.meta.date
    : undefined);

const calendarDays = WEEKDAY_LABELS.map((label, index) => {
  const date = isoAddDays(weekStart, index);
  return {
    label,
    date,
    today: date === brief.meta.date,
    selected: date === selectedDate
  };
});
```

- phase2 的 `resolvedRowDate` 为 `2025-11-05`，因此周三列 `selected: true`。
- 没有行日期且 meta 日期不在所选周（例如显式 `calendarWeekStart`）时，所有 `selected` 为 false；不错误高亮。

**Renderer**

day 数据解析增加 `selected`：

```ts
const dayItems = days.map((entry) => {
  if (typeof entry === "string") {
    return { label: entry, date: "", today: false, selected: false };
  }
  const record = entry as Record<string, unknown>;
  return {
    label: str(record.label),
    date: str(record.date),
    today: bool(record.today),
    selected: bool(record.selected)
  };
});
```

表头与单元格：

```ts
const dayClass = ["calendar-day", day.selected ? "selected" : "", day.today ? "today" : ""]
  .filter(Boolean)
  .join(" ");
const cellClass = `calendar-cell${day.selected ? " selected" : ""}`;
```

结构：

```html
<div class="calendar" data-view-panel="calendar">
  <div class="calendar-hint" aria-hidden="true">左右滑动查看整周 ›</div>
  <div class="calendar-viewport">
    <div class="calendar-scroll" tabindex="0" aria-label="预约周历，可左右滑动查看整周">
      <div class="calendar-grid">...</div>
    </div>
    <span class="calendar-fade" aria-hidden="true"></span>
  </div>
</div>
```

提示放在网格上方、日历卡内部，保证初始视口可见；不放到 12 小时网格下方，避免被底部 CTA 挡住。

CSS：

```css
.calendar{position:relative;}
.calendar-viewport{position:relative;}
.calendar-scroll{scrollbar-width:none;}
.calendar-scroll::-webkit-scrollbar{display:none;}
.calendar-hint{display:none;justify-content:flex-end;align-items:center;gap:4px;
  padding:8px 12px 0;font-size:10px;line-height:14px;color:var(--color-text-tertiary);}
.calendar-fade{position:absolute;top:0;right:0;bottom:0;width:24px;
  background:linear-gradient(90deg,transparent,var(--color-surface-default));
  pointer-events:none;opacity:0;}
.calendar[data-scrollable="true"] .calendar-hint{display:flex;}
.calendar[data-scrollable="true"] .calendar-fade{opacity:1;}
.calendar[data-scroll-end="true"] .calendar-hint{display:none;}
.calendar[data-scroll-end="true"] .calendar-fade{opacity:0;}
.calendar-day.selected{background:color-mix(in srgb,var(--color-status-info) 14%,var(--color-surface-subtle));
  color:var(--color-status-info);font-weight:600;box-shadow:inset 0 -2px 0 var(--color-status-info);}
.calendar-cell.selected{background:color-mix(in srgb,var(--color-status-info) 4%,white);}
@media (max-width:719px){
  .calendar:not([data-scrollable="false"]):not([data-scroll-end="true"]) .calendar-hint{display:flex;}
  .calendar:not([data-scrollable="false"]):not([data-scroll-end="true"]) .calendar-fade{opacity:1;}
}
```

**运行时**

```ts
function applyCalendarScroll() {
  const calendars = qsa(".calendar");
  const sync = (calendar: HTMLElement) => {
    const scroll = calendar.querySelector<HTMLElement>(".calendar-scroll");
    if (!scroll) return;
    const overflow = scroll.scrollWidth > scroll.clientWidth + 1;
    const atEnd = !overflow || scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 1;
    calendar.dataset.scrollable = overflow ? "true" : "false";
    calendar.dataset.scrollEnd = atEnd ? "true" : "false";
  };
  for (const calendar of calendars) {
    const scroll = calendar.querySelector<HTMLElement>(".calendar-scroll");
    if (!scroll) continue;
    scroll.addEventListener("scroll", () => sync(calendar), { passive: true });
    sync(calendar);
  }
  window.addEventListener("resize", () => calendars.forEach(sync), { passive: true });
}
```

行为：

- 390px 下 `scrollWidth > clientWidth`，提示和右缘渐隐出现。
- 滚到最右端时 `data-scroll-end=true`，提示和渐隐消失，表示已看完整周。
- 1440px 下 7 列全部可见，`data-scrollable=false`，不显示提示。
- `tabindex="0"` 让键盘可以聚焦滚动区；`aria-label` 说明可滑动，完整 a11y 仍留 v0.5。
- 无 JS 时 media query 兜底显示提示和渐隐；滚到末端不会自动隐藏，这是可接受的降级。
- VC-002 的验收标准是“存在明确滚动提示和右缘渐隐，且周四至周日可滚动到达”；不要求 390px 同屏显示 7 列。压缩列宽是 v0.5 的结构改动，不在本 patch。

### 5.3 列表 error 状态上下文

**Renderer 结构调整**

把现有 `statePanels()` 拆成 `loadingPanel()` 与 `errorPanel(variant)`：

```ts
function errorPanel(variant: "inline" | "overlay"): string {
  const className = variant === "inline" ? "state-panel error inline" : "state-panel error";
  return `<div class="${className}" aria-hidden="true">
    <div class="error-box">...</div>
  </div>`;
}
```

`MobileShell` 只在 `mobile-list` 把 error 面板放进内容流：

```ts
const listArchetype = renderSpec?.meta.archetype === "mobile-list";
...
<main class="app-scroll">
  ${titleSlot}${illustration}${body}${summary}${feed}${fields}${content}
  ${listArchetype ? errorPanel("inline") : ""}
</main>
${loadingPanel()}
${listArchetype ? "" : errorPanel("overlay")}
```

CSS：

```css
.state-panel.error.inline{position:static;display:none;background:transparent;
  padding:var(--space-4);}
body[data-state="error"] .state-panel.error.inline{display:flex;}
.app[data-page-archetype="mobile-list"] .state-panel.error.inline .error-box{
  width:100%;background:var(--color-surface-default);border-radius:var(--radius-lg);
  padding:var(--space-6) var(--space-4);box-shadow:0 1px 2px rgba(17,24,39,.04);}
body[data-state="error"] .app[data-page-archetype="mobile-list"] .calendar,
body[data-state="error"] .app[data-page-archetype="mobile-list"] [data-view-panel="list"],
body[data-state="error"] .app[data-page-archetype="mobile-list"] .empty-state{display:none;}
```

结果：

- error 截图保留 top bar、状态/日期筛选、切换日历/列表、日历标题和图例。
- 只隐藏数据区（网格或列表）和空态；底部「新增预约」仍可见。
- `appointment-detail`、`today` 等其他 archetype 继续使用原覆盖层，不在本 patch 改动。
- loading 覆盖层不在本 patch 改动；VC-003 留 v0.5。

### 5.4 `datetime-local` 中文显示

**Compiler**

```ts
const inputType = field === "startTime" || field === "endTime" ? "datetime-local" : undefined;
const placeholder = inputType === "datetime-local" ? `请选择${label}` : `请输入${label}`;
```

**Renderer**

```ts
const control = `<input class="input" ... placeholder="${esc(placeholder)}" ... />`;
if (inputType === "datetime-local") {
  return `<span class="datetime-control">${control}<span class="datetime-display" aria-hidden="true">${esc(placeholder)}</span></span>`;
}
return control;
```

**运行时**

```ts
function formatDateTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}` : value;
}

function applyDateTimeDisplay() {
  for (const control of qsa(".datetime-control")) {
    const input = control.querySelector<HTMLInputElement>("input");
    const display = control.querySelector<HTMLElement>(".datetime-display");
    if (!input || !display) continue;
    const sync = () => {
      display.textContent = input.value ? formatDateTime(input.value) : input.placeholder;
      display.classList.toggle("filled", input.value !== "");
    };
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
    sync();
  }
}
```

CSS：

```css
.datetime-control{position:relative;display:block;}
.datetime-display{position:absolute;inset:0 34px 0 10px;display:flex;align-items:center;
  background:#fff;color:#94A3B8;font-size:14px;pointer-events:none;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.datetime-display.filled{color:#0F172A;}
.datetime-control:focus-within .datetime-display{display:none;}
.datetime-control:has(.input:disabled) .datetime-display{opacity:.5;}
```

行为：

- 未赋值时显示「请选择开始时间」，覆盖浏览器英文 placeholder。
- 有值时显示 `YYYY-MM-DD HH:mm` 中文可读格式，覆盖原生值格式；reschedule 截图因此不再出现英文日期。
- 聚焦时隐藏显示层，原生 picker 和原生文本照常工作；失焦后恢复中文显示。
- 初始化顺序必须先 `applyFormModes()` 再 `applyDateTimeDisplay()`；reschedule prefill 直接写 `.value` 不会触发 `input`，显示层必须在预填之后同步一次，否则仍显示 placeholder。
- 右侧 34px 留给原生日历图标，显示层不拦截点击。
- 如果目标 Chromium 仍出现英文文本溢出，降级为在字段下方增加一行「格式：YYYY-MM-DD HH:mm」，并保持显示层；该降级必须在视觉复核中记录。

### 5.5 reschedule 静态上下文

**视觉夹具**

`VisualCase` 增加 `storage`（见 §4.4）。`captureCase` 在 `page.goto` 前注入：

```ts
if (visualCase.storage !== undefined) {
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      sessionStorage.setItem(key, value);
    }
  }, visualCase.storage);
}
```

**矩阵记录提取**

`buildVisualMatrix(specs)` 为 reschedule case 找同一模块的详情页，并从摘要 `List` 提取记录：

```ts
function rescheduleContext(specs: PageSpec[], form: PageSpec) {
  const candidates = specs.filter(
    (entry) =>
      entry.meta.pageId !== form.meta.pageId &&
      entry.linkedRoutes?.form === form.meta.route
  );

  for (const detail of candidates) {
    const summaryCard = collectNodes(detail.layout).find(
      (node) => node.type === "Card" && String(node.props?.title ?? "").includes("摘要")
    );
    const items = collectNodes(summaryCard ?? detail.layout)
      .filter((node) => node.type === "List" && Array.isArray(node.props?.items))
      .flatMap((node) => node.props!.items as unknown[])
      .filter(isLabelValueItem);

    const pick = (labels: string[]) =>
      items.find((item) => labels.some((label) => item.label.includes(label)))?.value;
    const record = {
      customer: pick(["客户"]) ?? "",
      project: pick(["项目"]) ?? "",
      time: pick(["时间段", "时间"]) ?? "",
      therapist: pick(["护理师", "护理"]) ?? ""
    };
    if (record.customer === "" || record.time === "") continue;

    const key = detail.referenceId ?? detail.meta.pageId;
    return {
      key,
      record,
      queryKey: detail.referenceId === undefined ? "recordId" : "appointmentId"
    };
  }
  return undefined;
}
```

- `customer-detail`、`treatment-notice` 的 `linkedRoutes.form` 也可能回退到 appointment-form；必须遍历候选并跳过无法提取客户/时间的详情页，否则会取错记录。phase2 中只有 `appointment-detail` 能提供完整记录。

case 生成：

```ts
const context = rescheduleContext(specs, spec);
cases.push({
  id: `${pageId}.mode.${mode.name}`,
  pageId,
  state: `mode:${mode.name}`,
  query: {
    mode: mode.name,
    ...(context === undefined ? {} : { [context.queryKey]: context.key })
  },
  ...(context === undefined
    ? {}
    : {
        storage: {
          [`prd-ui:appointment:${context.key}`]: JSON.stringify(context.record)
        }
      }),
  viewport
});
```

- phase2 的 `appointment-detail` 摘要包含客户、项目、时间段、护理师；记录为张女士 / 小气泡 / 11-05 周三 10:00-11:00 / 王美容。
- `collectNodes` 是 matrix 里的递归遍历（与 `hasNode` 同源）；`isLabelValueItem` 只接受 `{label: string, value: string}`，忽略字符串 item 和占位 `List`。优先从标题含「摘要」的 Card 提取，找不到再退回整页 `List`。
- `appointment-detail.referenceId` 为空时使用 `recordId=appointment-detail` 和同名 storage key；有 `referenceId` 时使用 `appointmentId`，与详情页「改期」点击路径一致。
- 找不到详情或摘要时省略 storage；截图退回 fallback 状态，不伪造数据。

**Renderer 上下文条**

`applyFormModes` 读取记录后保存为 `rescheduleRecord`。现有 `rawRecord` 解析分支改为：

```ts
let rescheduleRecord: Record<string, unknown> | null = null;
...
try {
  rescheduleRecord = JSON.parse(rawRecord) as Record<string, unknown>;
  // 现有 customer/project/therapist/start/end prefill 改用 rescheduleRecord
} catch {
  // malformed record：保持 null，上下文条显示入口提示
}
```

`apply()` 中：

```ts
const ensureBanner = (host: HTMLElement): HTMLElement => {
  let banner = host.querySelector<HTMLElement>(".reschedule-context");
  if (!banner) {
    banner = document.createElement("div");
    banner.className = "reschedule-context";
    host.prepend(banner);
  }
  return banner;
};

const context = host?.querySelector(".reschedule-context");
const parts = [
  rescheduleRecord?.customer,
  rescheduleRecord?.project,
  rescheduleRecord?.time,
  rescheduleRecord?.therapist
].filter((part): part is string => typeof part === "string" && part.length > 0);

if (current.name === "reschedule" && host) {
  const banner = ensureBanner(host);
  const title = document.createElement("strong");
  title.textContent = "正在改期";
  const summary = document.createElement("span");
  summary.textContent = parts.length > 0 ? parts.join(" · ") : "请从预约详情进入改期";
  banner.replaceChildren(title, summary);
  if (appointmentId) {
    const id = document.createElement("span");
    id.className = "reschedule-id";
    id.textContent = `预约 ${appointmentId}`;
    banner.append(id);
  }
} else {
  context?.remove();
}
```

- 移除现有 `.appointment-id` 注入；上下文条取代它。
- 字段 prefill 复用现有时间解析逻辑，数据源改为 `rescheduleRecord.customer/project/therapist/time`；没有记录时字段保持空，但上下文条明确提示入口。
- DOM 用 `textContent`，不拼 `innerHTML`，避免记录内容注入。
- 上下文条在 mode tabs 之上、表单字段之前。

CSS：

```css
.reschedule-context{display:flex;flex-direction:column;gap:2px;
  margin:0 var(--space-4) var(--space-2);padding:10px 12px;
  border-radius:var(--radius-md);
  background:color-mix(in srgb,var(--color-status-info) 8%,white);
  border:1px solid color-mix(in srgb,var(--color-status-info) 22%,white);
  font-size:var(--type-label-sm-size);line-height:var(--type-label-sm-line);
  color:var(--color-text-secondary);}
.reschedule-context strong{font-size:var(--type-body-sm-size);color:var(--color-text-primary);}
.reschedule-id{font-size:10px;color:var(--color-text-tertiary);}
```

## 6. 错误处理与降级

| 场景 | 行为 | 门禁 |
|---|---|---|
| 没有列表页或路由无法解析 | 不渲染「查看全部」，不产生 `href="#"` | 单测断言无链接 |
| 日历无溢出 | `data-scrollable=false`，提示和渐隐隐藏 | 1440px 检查 |
| 滚动到末端 | `data-scroll-end=true`，提示和渐隐消失 | Playwright 滚动检查 |
| 无行日期且 meta 日期不在本周 | 无 `selected`，不错误高亮 | compiler 单测 |
| 非 mobile-list 的 error | 保持原覆盖层 | 渲染结构断言 |
| `datetime-local` 显示层被原生文本穿透 | 增加字段下方格式提示，并在视觉复核记录 | 截图复核 |
| 找不到 reschedule 详情/摘要 | 不注入 storage；显示「请从预约详情进入改期」 | matrix 单测 + 截图复核 |
| storage 写入失败 | 截图 capture 失败，按 console/pageerror 处理，不判 pass | 视觉 gate |
| fresh critic infra/超时失败 | 不签核；按 v0.4 的失败处理记录，不伪造 pass | `visual:review` 失败 |
| baseline 缺失或不匹配 | gate 失败；baseline 只由人运行 `visual:baseline` 更新 | 视觉 gate |

## 7. 测试与验收

### 7.1 单测

- `core/compiler/tests/compiler.test.ts`
  - phase2 today 的「我的预约」Card 有 `actionLabel="查看全部"` 和 `actionRoute="/appointments"`；`linkedRoutes.list` 存在。
  - 无列表页的 fixture 不产生 action props / `list`。
  - `appointment-list` 的 `CalendarGrid.days` 中 `2025-11-05` 为 `selected: true`，其余为 false；`today` 仍为 false。
  - `appointment-form` 的 `startTime/endTime` placeholder 为「请选择开始时间/请选择结束时间」。
- `core/design-system/tests/design-system.test.ts`
  - b-mobile / b-dense / c-expressive 的 Card 契约包含 `actionLabel`、`actionRoute`（可选 string）。
  - `phase1:verify` 的 catalog gate 不再报 `CATALOG-PROP-UNKNOWN`。
- `core/renderer-html/tests/renderer.test.ts`
  - Card 输出 `card-action`、正确 `href`；无法解析路由时不输出链接。
  - 日历输出 `calendar-hint`、`calendar-viewport`、`calendar-fade`、`calendar-day selected`、`calendar-cell selected`，并包含 `applyCalendarScroll`。
  - `mobile-list` 的 error 面板位于 `</main>` 之前；`appointment-detail` 仍在 `</main>` 之后。
  - `datetime-control`、`datetime-display`、`formatDateTime`、`applyDateTimeDisplay` 存在。
  - reschedule 上下文条包含 `正在改期`，旧 `.appointment-id` 注入被移除。
- `core/visual-review/tests/matrix.test.ts`
  - reschedule case 的 query 含 `recordId`（或 `appointmentId`），storage key 为 `prd-ui:appointment:<key>`，值为提取到的记录。
  - 无详情摘要时不产生 storage。
  - 多个 detail 候选时跳过无法提取客户/时间的页面（例如 customer-detail），选择 appointment-detail。
  - case id 集合不新增；仍只有 `mode.reschedule` 一个 form-mode case。
- `runtimes/standalone/tests/visual-cli.test.ts`
  - 截图前注入 storage；带记录的 reschedule 截图包含 prefill 或上下文条对应的 DOM/文本。

### 7.2 Playwright 交互检查

- 点击「查看全部」→ 导航到 `appointment-list.html`。
- 390px：日历初始 `data-scrollable=true`，提示可见；`scrollLeft` 到末端后 `data-scroll-end=true`，提示/渐隐隐藏。
- 键盘：聚焦 `.calendar-scroll` 后方向键可滚动；若浏览器焦点行为不稳定，测试直接设置 `scrollLeft` 并断言同步属性。
- error 状态：筛选、日期、切换按钮、日历标题/图例可见；错误卡可见；无横向溢出。
- `datetime-local`：未赋值时显示中文提示；赋值并失焦后显示 `YYYY-MM-DD HH:mm`；聚焦时显示层隐藏。
- reschedule：注入记录后客户、项目、开始/结束时间、护理师有值，上下文条显示「正在改期」；无记录时显示「请从预约详情进入改期」。

### 7.3 视觉验收

```bash
cd pipeline
pnpm spec:engineer --project samples/projects/employee-app-phase2/project.yaml \
  --agent-run /tmp/m1-final2/<runId> --runs /tmp/spec-v041 --strict-motion
pnpm render:html --run /tmp/spec-v041/<runId> --out /tmp/html-v041

# baseline 只由人运行；比较旧/新 manifest 的 visualHash
pnpm visual:baseline --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v041/<runId> --html /tmp/html-v041 \
  --out baselines/employee-app-phase2

# 真实 critic；需要 .env
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm visual:review \
  --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v041/<runId> --html /tmp/html-v041 \
  --baseline baselines/employee-app-phase2 --runtime dsh --profile prd-ui-visual \
  --runs /tmp/visual-v041 --max-cost-cny 3 --json

pnpm visual:sign --run /tmp/visual-v041/<runId> --signoff-visual /tmp/signoff-v041.md
```

如果 `/tmp/m1-final2/<runId>` 已被清理，按 v0.4 交接重跑 intake/M1，使用同一 signed brief；不得修改 `samples/projects/employee-app-phase2/ui-brief.json`。本 patch 不改 intake/M1，重跑只影响成本，不改变 Page Spec 语义。

预期：

- 24/24 截图；0 console error；0 overflow。
- baseline 24 cases；预期 visualHash 变化的 case：`today.default`、`appointment-form.default`、`appointment-form.state.disabled`、`appointment-form.mode.reschedule`、`appointment-list.default`、`appointment-list.state.error`；`appointment-list.drawer`/`state.empty` 如因共享日历样式变化，需逐张确认后记录。
- fresh critic 0 blocker；VC-001/002/006/007/008/009 不再以同一 page/state/issue 出现；VC-003/004/005 仍在，作为 v0.5 债务。VC-002 以滚动提示/渐隐为验收，不以 7 列同屏为准。
- 不以 critic 的 VC 编号做跨 run 匹配；按 `pageId + state + issue 主题` 判断。
- signed cache 只用于同输入复现；本次截图/规格变化后应 cache miss，记录真实成本。
- 签核绑定新的 `manifestHash` + `findingsHash`；`waivers=[]`。

### 7.4 出口门禁

- `pnpm test`：644+ 通过。
- `pnpm typecheck`：clean。
- `pnpm test:dsh`：4 passed。
- `phase1:verify`：demo-orders / employee-app / 03-slice / phase2 = `8 / 2 / 4 / 8`，全 0 blockers。
- Spec Engineer `--strict-motion`：8 Page Specs / 0 blockers / 0 motion unresolved。
- Renderer：8 HTML + index。
- Visual：24/24、0 console、0 overflow、diff 仅预期 case。
- Critic：0 blocker、0 新 major、6 项已修复、3 项 v0.5 债务。
- Signoff：`visual:sign` 成功，`waivers=[]`，baseline manifest 与截图已提交。
- 不修改 signed brief、M1/intake 产物、dsh profile、`.env`。

### 7.5 证据记录

- spec/render/visual run id 与耗时。
- 真实 critic 成本、`usageComplete`、`cacheHit`、模型/profile。
- baseline 旧/新 manifest hash；变化 case 的 visualHash。
- findings 列表（按 page/state/issue）、signoff 的 `manifestHash`/`findingsHash`。
- 测试数量与四条 `phase1:verify` 输出。
- 截图路径：`pipeline/artifacts/employee-app-phase2/visual-review/`。

## 8. 实施顺序

1. 契约：`PageSpec.linkedRoutes.list`、`VisualCase.storage`。
2. Compiler：列表路由、today Card action、`selected`、datetime placeholder。
3. Renderer：Card action、日历提示/渐隐/选中高亮、error inline、datetime 显示层、reschedule 上下文条。
4. 视觉夹具：screenshot storage 注入、matrix 记录提取。
5. 单测与 Playwright 检查。
6. 重跑 spec/render，确认 8 页与 24 case 结构不变。
7. 人工更新 baseline，比较 manifest，确认为预期 case。
8. 真实 critic → 修复新问题（如有）→ `visual:sign`。
9. 把新 run 的 screenshots / findings / signoff 复制到 `pipeline/artifacts/employee-app-phase2/visual-review/`，更新该目录 README 的 run id、成本与 hash。
10. 更新 `CHANGELOG.md`、版本路线状态、v0.4.1 交接文档；本地 commit，不 push。

## 9. 关键文件

- `core/design-system/src/catalogs/b-mobile.ts`、`b-dense.ts`、`c-expressive.ts`：Card 的 `actionLabel`/`actionRoute` 契约。
- `core/contracts/src/page-spec.ts`：`linkedRoutes.list`。
- `core/compiler/src/compile-page-spec.ts`：`linkedRoutesFor`、home Card、`calendarDays.selected`、datetime placeholder。
- `core/renderer-html/src/index.ts`：Card、CalendarGrid、state panels、Input、reschedule 运行时、CSS/JS。
- `core/visual-review/src/contracts.ts`：`VisualCase.storage`。
- `core/visual-review/src/matrix.ts`：reschedule 记录提取与 case storage。
- `runtimes/standalone/src/visual/screenshot.ts`：`addInitScript` 注入。
- `core/design-system/tests/design-system.test.ts`、`core/compiler/tests/compiler.test.ts`、`core/renderer-html/tests/renderer.test.ts`、`core/visual-review/tests/matrix.test.ts`、`runtimes/standalone/tests/visual-cli.test.ts`。
- `pipeline/baselines/employee-app-phase2/`、`pipeline/artifacts/employee-app-phase2/visual-review/`：baseline 与证据。
- `CHANGELOG.md`、`docs/superpowers/plans/2026-10-23-version-roadmap.md`、`docs/handoffs/`：状态与交接。

## 10. 完成定义

- [ ] 6 项 finding 在对应截图中消失，并有单测/Playwright 证据。
- [ ] 24 个视觉 case 数量不变；无 console error、无 overflow。
- [ ] baseline 只包含预期视觉变化；manifest 旧/新 hash 已记录。
- [ ] fresh critic：0 blocker、0 新 major；VC-003/004/005 明确记录为 v0.5。
- [ ] `pnpm test` 644+、typecheck、`test:dsh` 4、Phase 1 `8/2/4/8` 全 0。
- [ ] `--strict-motion` 8 Page Specs / 0 blockers / 0 unresolved。
- [ ] `visual:sign` 成功，`waivers=[]`；签核 hash 与 baseline 对应。
- [ ] signed brief、M1/intake、dsh profile 未被修改。
- [ ] CHANGELOG/roadmap/handoff 更新；本地 commit，不 push。

## 11. 风险与处理

| 风险 | 处理 |
|---|---|
| `datetime-local` 原生文本在不同 Chromium 版本穿透显示层 | 固定 Playwright Chromium；截图复核；失败时增加字段下方格式提示并记录 |
| 日历提示放在网格上方改变首屏高度 | 只占一行 10px 文本；截图中检查 24 个 case 无新增 overflow |
| error inline 面板影响其他 archetype | 只在 `renderSpec.meta.archetype === "mobile-list"` 时启用；其他页面断言 DOM 顺序不变 |
| reschedule 摘要标签因项目而异，提取失败 | 标签匹配 + 缺失时 fallback；phase2 必须有记录，否则 VC-006 不算完成 |
| storage 注入导致截图不确定 | 记录值固定来自 Page Spec；addInitScript 在导航前执行；两次截图稳定性检查保留 |
| fresh critic 采样波动 | 只跑一次 fresh run + 人工签核；不反复重跑找“好结果”；signed cache 只证明同输入复现 |
| baseline 全量重写掩盖非预期变化 | 逐 case 比较 visualHash；非预期 case 先定位再提交 |
| 改动范围膨胀到 v0.5 | 本 spec 的非目标清单是门禁；VC-003/004/005 不在本 patch 修 |

## 12. 与后续版本的边界

- v0.5 继续：loading 12 行 skeleton、empty inline 呈现、form mode pills、a11y 基线、fresh critic 停止规则（0 blocker + ≤2 major + 人工签核）。
- v0.6：Figma Renderer、Studio、Asset Compiler。
- v0.7：scratch 沙箱、Test Subagent、Handoff Packager。
- v0.8：真实项目试点；v0.9 RC；v1.0 最终交付。

版本路线明确要求 v0.4.1 与 v0.5 分开写 spec；本 spec 只覆盖 v0.4.1，不把 v0.5 的结构改造混入。

## 13. 实施结果与偏差（2026-10-23）

### 13.1 已实现

- today「查看全部」：`linkedRoutes.list` + Card `actionLabel/actionRoute` + 三个 catalog 的 Card 契约；渲染为 `appointment-list.html` 静态链接。
- 日历：`selected` 数据、表头/整列高亮、7 天同屏、短日期、时间/事件字号与时间 cue、错误态上下文；hint/fade 代码保留但无溢出时隐藏。
- 列表 error：mobile-list 的 inline 面板，保留筛选、日期、切换按钮和日历标题/图例；移除游离的「列表」标签。
- `datetime-local`：静止态中文显示层，聚焦让位原生控件；禁用态统一底色并隐藏原生 picker indicator。
- reschedule：`VisualCase.storage` 注入详情摘要记录；上下文条、客户/项目/时间/护理师 prefill 生效；旧 `.appointment-id` 注入移除。
- 预置动作层级修复：business state 下若 footer 只有一个可见动作，提升为 primary（修复已到店状态「开单」显示为次要按钮的既有问题）。

### 13.2 与 §5.2 的偏差

真实 Critic 连续两轮拒绝“3 天 + 滚动提示/渐隐”方案，认为周历被截断、提示像浮层。最终改为 **390px 紧凑 7 日周视图**（36px 时间槽 + 7 等分列、`MM-DD` 短日期、11px 时间/日期、12px 事件标题 + 10px 项目/时间），并在 chip 内增加开始时间 cue。这覆盖了 §5.2 的 3 天滚动描述与 §2.2“压缩列宽留 v0.5”的非目标；依据是 Critic 的第一推荐方案（“Fit seven equal day columns at 390px with abbreviated weekday/date labels”）。

其他实现细节：

- 列表视图删除「列表」标题；error 状态不再出现游离标签。
- 禁用态 `input/select` 使用 disabled surface；`datetime-local` 原生图标隐藏。
- footer 单动作提升为 primary，用于已到店「开单」。

### 13.3 机械与视觉证据

- `pnpm test`：652 passed；`pnpm typecheck` clean；`pnpm test:dsh` 4 passed。
- Phase 1：`8 / 2 / 4 / 8` pages，全 0 blockers。
- Spec Engineer：`/tmp/spec-v041/run-2026-10-23T02-51-25-415Z`，8 pages / 0 blockers / 0 unresolved。
- Renderer：8 HTML + index。
- Visual baseline（临时）：`/tmp/v041-baseline`，24 cases；相对旧 baseline 的 `visualHash` 变化为 `appointment-detail.business.已到店`、`appointment-form.mode.reschedule`、`appointment-list.default`、`appointment-list.state.error`、`appointment-list.drawer`。
- 真实 Critic 最终 run：`/tmp/visual-v041g/run-2026-10-23T03-01-28-979Z`；24/24 截图、diff 24/0/0、0 blocker、`usageComplete=true`、¥0.3970；签核后 `status=success`。
- 6 项 v0.4.1 finding 已不再出现；剩余 major 为 v0.5 的 `VC-003` loading skeleton、`VC-004` empty overlay、`VC-005` mode pills，以及一个既有问题 `appointment-detail` 的「取消」缺少危险语义（本轮新暴露，不在本 patch 范围）。

### 13.4 签核结果

- baseline 已更新：`pipeline/baselines/employee-app-phase2`，24 cases；manifest `sha256:341458e621be6911b0f5a21cf0442582f38239a54e56b1b2f210ec714c4fcb4a`。
- `visual:sign` 已执行：`run-2026-10-23T03-01-28-979Z`，`status=success`，signer `胡冀徽`，date 2026-10-23，`waivers=[]`；findings hash `sha256:0b7829da3b490a75ab9c5a9766b4cdce9f760b511dd96f03d0448e95954c0b06`。
- artifacts 证据已复制到 `pipeline/artifacts/employee-app-phase2/visual-review/`；`CHANGELOG.md`、版本路线、handoff、`AGENTS.md` 已更新为 signed。
- 剩余 major（empty/loading/mode-pills 与既有 `取消` 语义）记录为 v0.5 债务。
- 未提交任何 commit；不 push。
