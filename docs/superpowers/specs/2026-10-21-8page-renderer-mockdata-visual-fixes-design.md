# Phase 2 · 8 页 Renderer / Mock Data / 视觉修复设计

- 日期：2026-10-21
- 状态：Implemented (2026-10-21)
- 输入：Phase 2 8 页出口已产出 8 个 Page Spec，但 Playwright 视觉巡检发现 5 个 web 页面与 3 个 mobile 页面全部空白
- 关联：
  - `docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md`
  - `docs/superpowers/specs/2026-10-20-phase-2-spec-engineer-design.md`
  - `docs/superpowers/specs/2026-10-20-phase-2-prd-review-ui-briefer-design.md`
  - `docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md`
  - `pipeline/artifacts/employee-app/`
  - `pipeline/samples/project.demo-orders-intake.yaml`

## 0. 结论

1. **这不是“调 CSS”，而是 renderer 的能力缺口**：`renderNode` 只有 `MobileShell`，没有 `PageShell`；`MobileShell` 只渲染 `top-bar/content/bottom-nav`，忽略 `feed/summary/fields/actions/title/body/illustration`。因此 8 个内容页实际是空 DOM。
2. **Page Spec 是完整的，缺的是消费层**：Spec Engineer 产出的 8 个 Page Spec 包含 Section/Card/Stat/DataTable/FormField/feed 等节点；renderer 没有对应 case，默认 `return children`，最终渲染为空。
3. **UI Brief 也缺通用数据位**：`mockData`（列表行、详情值、概览列表）与 `fieldLabels`（字段中文标签）不存在，导致即使 renderer 补齐，页面仍是骨架和英文 id。
4. **本轮补齐 renderer + 数据链路 + 标签 + 基础视觉**：
   - PageShell/MobileShell 全 slot；
   - 11 个通用组件；
   - `UiBriefPage.mockData`、`fieldLabels`；
   - 标题/索引/导航/按钮/徽标/状态切换器/空态；
   - 语义 validator 接受本地化标签；
   - employee-app 2 页 HTML/截图刷新。
5. **不做**：motion 动画、M1 per-profile 输入、8 页 asset review、Visual Critic、自动截图 diff、Figma/Studio。这些进入 `docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md`。

## 1. 问题与当前基线

| 项 | 修复前 |
|---|---|
| 8 页 Page Spec | 8 个，schema/gate 通过 |
| `render:html` | 生成 9 个 HTML 文件（8 页 + index） |
| web 页面 | 6 个页面仅剩状态切换器；`PageShell` 未渲染 |
| mobile 页面 | home-feed/item-detail/auth 空白；`feed/summary/fields/actions/title` slot 未渲染 |
| 语义校验 | `phase1:verify` 8/0，但只校验 base Page Spec，不覆盖 HTML 视觉 |
| 视觉巡检 | Playwright 截图确认：只有 index 有内容 |
| 数据 | brief 没有通用 mock 行/值；列表/详情为骨架，字段标签是英文 id |

根因：

- `core/renderer-html/src/index.ts` 的 `renderNode` 没有 `PageShell` case。
- `MobileShell` 只读取 `top-bar/content/bottom-nav`。
- `Stat`、`DataTable`、`FilterBar`、`Pagination`、`FormField`、`Input`、`Select`、`List`、`FeedCard`、`BottomNav` 没有 case。
- `UiBriefPage` 没有通用 mock 数据/标签字段；compiler 无法把数据写进 Page Spec。

## 2. 目标与非目标

### 2.1 目标

- 8 个内容页全部渲染真实 DOM，不再是空白。
- 支持 10 个 archetype 的通用 shell/slot：
  - PageShell：`summary/content/groups/fields/actions`；
  - MobileShell：`title/illustration/body/summary/feed/fields/actions/content/top-bar/bottom-nav`。
- 支持 web/mobile 通用组件：Stat、List、DataTable、FilterBar、Pagination、FormField、Input、Select、FeedCard、BottomNav、Image。
- UI Brief 可携带可选 `mockData`/`fieldLabels`，经 compiler 进入 Page Spec，再由 renderer 渲染。
- 页面标题/索引/导航/按钮/徽标/状态切换器/空态具备原型级视觉质量。
- 2 页 employee-app 回归不退化。

### 2.2 非目标

- 不做 motion 动画到 HTML（v0.1）。
- 不做 M1 per-profile catalog/motion 输入（计划文档任务 2）。
- 不做真实 UI Briefer 自动生成 mockData/fieldLabels（计划文档任务 1）。
- 不做 8 页 asset briefs/asset review（计划文档任务 3）。
- 不做 Visual Critic、自动截图 diff、Figma/Studio。
- 不改变 Page Spec schema 的既有必填字段；mockData/fieldLabels 全部可选。

## 3. 数据契约

### 3.1 UiBriefPage 扩展

```ts
interface UiBriefMockData {
  /** 详情页只读字段值。 */
  values?: Record<string, string>;
  /** 列表/详情表格行；键是页面的 field id。 */
  rows?: Array<Record<string, string>>;
  /** 概览页 "近期数据" 列表行。 */
  listItems?: string[];
}

interface UiBriefPage {
  // ...existing
  /** 字段 id -> 展示标签；未提供时使用 field id。 */
  fieldLabels?: Record<string, string>;
  /** 原型用 mock 数据；不是业务事实源。 */
  mockData?: UiBriefMockData;
}
```

Zod：

- `UiBriefMockDataSchema` strict：`values`/`rows`/`listItems` 全部可选；
- `fieldLabels` 为 `Record<string,string>`；
- `UiBriefPageSchema` strict 同步加入。

### 3.2 数据流

```text
ui-brief.json
  fields / fieldLabels / mockData / stats / feedItems
        │
        ▼
compilePageSpec
  - DataTable { columns, columnLabels, rows }
  - FormField { label, value }
  - List { items: string[] | number }
  - Stat { label, value }
  - FeedCard { title, body }
        │
        ▼
Page Spec
        │
        ▼
renderer-html
  - PageShell / MobileShell
  - 通用组件 case
        │
        ▼
HTML
```

## 4. Renderer 设计

### 4.1 Render options 与导航标签

```ts
export interface RenderOptions {
  /** page id -> 页面名，用于侧栏/底部导航标签。 */
  pageNames?: Record<string, string>;
}
```

- `renderDocument(spec, profile, options?)` 设置 module-level 的 page names/project/page id。
- `pageLabel(id)` 优先使用 `pageNames[id]`，否则把 kebab-case id 转成可读文本。
- `render-html-cli` 先扫描全部 Page Spec 构建 `pageNames`，再渲染。

### 4.2 PageShell

```ts
case "PageShell":
  - 左侧深色 sidebar：project brand + nav items（active 当前页）
  - 右侧 page-header-web：页面标题
  - page-body：按 summary → content → groups → fields → actions 渲染 slot
  - state-panels：loading/error
```

CSS：

- `.page-shell` / `.page-sidebar` / `.page-nav` / `.page-main` / `.page-body`；
- `.page-slot-actions` 横向按钮；
- `.page-shell .state-panel` 覆盖内容区；
- `.state-switcher` 右下角悬浮，避免遮挡内容。

### 4.3 MobileShell

渲染顺序：

```text
header (top-bar / back / title)
title slot
illustration slot
body slot
summary slot
feed slot
fields slot
actions slot
content slot
bottom-nav (if present)
state-panels
```

规则：

- 没有 `top-bar` 且没有 `title` slot 时，自动加页面标题 header；
- `showTabs` 只在 `bottom-nav` 非空时为 true，避免详情页出现空 tabbar；
- `feed` 支持 FeedCard + EmptyState；
- `fields`/`actions` 直接渲染 FormField/Button。

### 4.4 通用组件

| 组件 | 行为 |
|---|---|
| `BottomNav` | 与 TabBar 类似，使用 page label 和 tabIcons；active 当前页 |
| `Stat` | 指标卡 label/value |
| `List` | `items: string[]` 渲染文本行；number 渲染骨架行 |
| `DataTable` | `columns` 作为行键，`columnLabels` 作为表头；`rows` 有值渲染真实行，否则骨架 |
| `FilterBar` | fields 渲染为中文筛选 chip；action 渲染按钮 |
| `Pagination` | 上一页/1/2/3/下一页 |
| `FormField` | label + required + children；只读值用 `form-value`，无值为 `form-readonly` |
| `Input` | name/type/placeholder/value |
| `Select` | options |
| `FeedCard` | title/body 卡片 |
| `Image` | placeholder 框 |

### 4.5 视觉修正

- 页面 title：`${spec.meta.name} · ${spec.meta.project}`，不再硬编码“员工端”。
- 索引：`${project} · N 个页面`；卡片链接继承深色文字、无下划线、hover 阴影。
- `PageShell` 侧栏导航显示中文页面名，active 高亮。
- 移动端底部导航使用 page label + tabIcons（orders-overview/dashboard、orders-list/list 等）。
- 操作按钮在 PageShell actions slot 横排，不再全宽/堆叠；secondary 按钮有边框。
- Badge `align-self:flex-start`，不再拉满整行。
- `body[data-state="empty"]` 隐藏 table wrap/list/feed card，显示 EmptyState。
- 空表不再留下 table-wrap 边框线。
- State switcher 右下角，z-index 高于 header。

## 5. Compiler 映射

- `detailLayout`：
  - summary 使用 `mockData.values`（带 fieldLabels）或 `listItems`；
  - `status` 存在时生成 Badge，tone 按 在售/已完成→success、待处理→warning、异常/失败→danger、其他→neutral；
  - fields 使用 `fieldFormNode(field, true, value, label)`。
- `form`：FormField label/placeholder 使用 fieldLabels。
- `list`：
  - FilterBar fields 转 label；
  - DataTable `columns` 保留 field id，新增 `columnLabels`；
  - `rows` 来自 `mockData.rows`；
  - extra actions（搜索）放在 FilterBar 之后、表格之前。
- `overview`：List items 使用 `mockData.listItems`；stats 使用 `page.stats`。
- `settings`：label 优先级 settingsFieldMeta → fieldLabels → field id。
- `auth`：label 优先级 authFieldMeta → fieldLabels → field id。
- `feed`：`feedItems` 已有；renderer 补 FeedCard。

## 6. 语义校验

`core/validators/src/semantic.ts`：

- `SEMANTIC-FIELD` 接受 `briefPage.fieldLabels[field]`；
- `SEMANTIC-FILTER` 接受本地化 label；
- settings 仍兼容既有 `settingsFieldLabels`；
- 不改变 finding severity（仍为 blocker）。

测试同步：

- `customers-list` 负例同时修改 `columns` 与 `columnLabels`，确保仍能报 `SEMANTIC-FIELD`。

## 7. 样本数据

### 7.1 8 页验收 sample

- `samples/project.demo-orders-intake.yaml`
- `samples/projects/demo-orders-intake/ui-brief.json`

补齐：

- orders-overview：4 个 stats + 4 条 listItems；
- orders-list：4 行 mockData.rows + 中文 columnLabels；
- order-detail：values（订单号/客户/金额/状态/创建时间）；
- order-form：中文 labels；
- settings：中文 labels（settingsFieldMeta 已有）；
- home-feed：3 条 feedItems；
- item-detail：values（标题/价格/描述/状态）；
- auth：中文 labels；
- 所有页面 fieldLabels。

### 7.2 employee-app 2 页

- `samples/ui-brief.sample.json` 的 item-detail 增加 `status: 在售`，保持 renderer 测试的 Badge 覆盖。
- `pipeline/artifacts/employee-app/html/*` 与 6 张截图刷新。

## 8. 测试

新增/更新：

- `core/renderer-html/tests/renderer.test.ts`：
  - PageShell 页面有 sidebar/表格行/中文标题；
  - overview stats + recent rows；
  - MobileShell feed/auth slots；
  - detail mock values；
  - renderIndex project title + link styles。
- `core/validators/tests/validators.test.ts`：labels 兼容 + 负例调整。
- `core/validators` 全部 64 tests 保持通过。

## 9. 验收记录（2026-10-21）

- `pnpm test`：**488 passed**（renderer 7 tests）。
- `pnpm typecheck`：clean。
- `pnpm test:dsh`：2 passed。
- `phase1:verify --project samples/project.demo-orders-intake.yaml`：`8 pages / 0 blockers`。
- 8 页 Spec Engineer：8 Page Specs，0 blockers。
- Playwright 巡检：
  - 5 个 web 页面有 sidebar、标题、内容、真实数据；
  - 3 个 mobile 页面有 feed/详情/登录内容；
  - index 有 8 个卡片、项目标题、样式化链接；
  - 空/加载/错误态可见；
  - 移动端底部导航图标/标签正确。
- employee-app 2 页 HTML/截图刷新，`2 pages / 0 blockers` 不退化。

## 10. 已知限制（进入计划文档）

1. 真实 UI Briefer 尚未稳定生成 `mockData`/`fieldLabels`；sample brief 是人工补齐。
2. M1 仍只接收一个 catalog/motion token 集（`brief.meta.profile`）；混合 profile 项目需 per-profile 输入。
3. 8 页 asset briefs = 0；8 页 asset review 未跑。
4. motion 尚未动画到 HTML；稳定 node id 未做。
5. 视觉验收是手工 Playwright 巡检，没有自动截图 diff。
6. Figma/Studio/Handoff 不在本轮范围。

后续任务与验收见 `docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md`。
