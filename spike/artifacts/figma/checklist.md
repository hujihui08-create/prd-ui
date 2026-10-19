# Phase 0 · Figma 人工验收清单

> 日期：2026-10-19
> 插件构建 commit：`b35907d`（`fix: align html typography to profile tokens`）
> 参考 HTML 截图：`spike/artifacts/b-end.png`、`spike/artifacts/c-end.png`

## 前置条件

- Figma 桌面版已安装（`/Applications/Figma.app`）。
- 插件已构建：在 `spike/` 下运行 `pnpm build:figma`，应生成 `spike/figma-plugin/dist/code.js`。
- 使用**新的空白 Figma 文件**，不要在生产文件里运行。
- 字体：Noto Sans SC（主）；如果本机没有，插件会回退到 PingFang SC。中文应正常显示，不应出现豆腐块。

## 操作步骤

1. 打开 Figma 桌面版，新建空白文件。
2. 菜单 `Plugins → Development → Import plugin from manifest…`，选择：
   `spike/figma-plugin/manifest.json`
3. 运行插件 `PRD UI Spike`。
4. 插件应创建两个页面：`Spike B`、`Spike C`。
5. 按下面的检查表逐项检查，每项截图保存到本目录（`spike/artifacts/figma/`）。
6. 把结果、截图文件名、异常现象写入 `notes.md`。

## 检查表

| # | 检查项 | 通过标准 | 证据文件名 |
|---|---|---|---|
| 1 | 页面创建 | 出现 `Spike B`、`Spike C` 两个页面 | `01-pages.png` |
| 2 | 嵌套 Auto Layout | PageShell 为横向；Sidebar 宽 240、纵向；Content 填满剩余宽度；Section / DataTable 为嵌套纵向；Frame 不再停留在 100×100 | `02-layout.png` |
| 3 | 中文字体 | `订单管理`、`发现`、`订单号` 等中文正常显示，无豆腐块 | `03-font.png` |
| 4 | 变量 | 每个页面有颜色变量集合（`Spike B Tokens` / `Spike C Tokens`）；填充绑定变量，修改变量颜色可联动 | `04-variables.png` |
| 5 | 文本样式 | `heading.1/2/3`、`body.md`、`label.sm` 已创建，并被对应文本使用 | `05-text-styles.png` |
| 6 | 组件变体 | `Button` 组件集含 `primary` / `secondary`；`CreateButton` 是 `Button` 实例 | `06-button.png` |
| 7 | 图标 | C 端 `bookmark` 节点为可编辑矢量（不是位图） | `07-icon.png` |
| 8 | 图片填充 | C 端 FeedCard 封面为 IMAGE 填充 | `08-image.png` |
| 9 | HTML / Figma 一致性 | 两边布局、字号层级、间距节奏肉眼接近；已知偏差见下 | `09-side-by-side.png` |

## 已对齐（本轮 parity 修复，验收时按已对齐检查）

- C 端 FeedContent 16px 包裹与 16px 卡片间距；FeedCard 358 宽、封面 358×180 全宽。
- 文本填充绑定 `color.text.primary`。
- Header / TopBar / Search 使用水平 padding + 垂直居中；BottomNav 使用 space-between。
- 表格正文单元格使用列名，与 HTML 一致；ICON 尺寸来自 plan。
- HTML 字体层级已消费 profile type scale（heading.1/2/3、body.md、label.sm）。

## 已知偏差（预期内，不算失败）

这些是 `spike` 代码的已知限制，验收时只需确认“符合预期”，不要当作新 bug：

- **图片是占位**：插件用 1×1 占位 PNG 填充 IMAGE 节点，FeedCard 封面会显示为纯色/空白；fixture 中的 `assets/feed-*.png` 没有被加载。
- **字体字重会压缩**：`fontWeight >= 600` 统一映射为 `SemiBold`，`500` 映射为 `Regular`；Noto Sans SC 缺失时回退 PingFang SC Regular。
- **按钮文案固定**：组件实例使用组件内的 “按钮”，不会应用 plan 里的 `props.label`（`新建订单`）。
- **BottomNav 未固定在底部**：Figma 里它排在 FeedContent 之后；HTML 里是 `position: fixed` 底部导航。
- **表格列不会自动均分**：HeaderRow / Row 已横向拉伸，但单元格文本是左对齐紧凑排列，不会像 HTML 表格一样按列宽分布。
- **表格行分隔线未绘制**：HTML 表格有行边框/分隔线，Figma 只用填充区分表头与数据行。
- **组件圆角固定 8px**：Button 组件没有引用 `radius.*` token；C 端 `radius.md` 是 16px。
- **FeedCard / FeedText 未设置圆角**：HTML 卡片是圆角，Figma 里为直角。
- **Button 组件集位置**：组件集创建在页面原点，根 Frame 也追加在 0,0，可能遮挡组件集；用图层面板查看即可。
- **文本样式同名重复**：两个页面都会创建 `heading.1/2/3`、`body.md`、`label.sm`；每个文本节点使用各自正确的 style ID，但本地样式面板会出现重复项。
- **重复运行会产生重复内容**：在同一文件再次运行插件会创建重复的 `Spike B` / `Spike C` 页面、变量集合和文本样式；请使用全新的空白文件。
- **其他普通容器 padding**：除已对齐的 Header / TopBar / Search 外，其他帧仍使用统一 padding。

## 结论填写

在 `notes.md` 末尾给出：

- **Go**：1–9 全部通过（允许上述已知偏差）。
- **Conditional Go**：仅非关键项失败（例如图片占位、字重、按钮文案），记录风险后可进入 Phase 1。
- **No-Go**：嵌套 Auto Layout、中文字体或组件变体任一失败；记录证据并评估退回 Plumb / HTML-first。
