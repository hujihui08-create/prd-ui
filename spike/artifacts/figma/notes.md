# Phase 0 · Figma 验收记录

- 日期：2026-10-19
- Figma 文件：`Untitled`（新建空白文件，file key `QE1vNbo90RxCSAJqzJvsA5`）
- 文件版本：本地新建文件，未在版本历史中标记
- 插件构建：`69747c0` + manifest `id` 修复 + bridge 修复（随后提交）
- 操作方式：Brio MCP 作为执行通道（同一插件代码、同一 Figma 文档），桥接导出页面截图与运行时结构
- 最终视觉签核：**待用户确认**（本记录为 assistant-observed）

## 检查结果

| # | 检查项 | 结果 | 证据 | 备注 |
|---|---|---|---|---|
| 1 | 页面创建 | **pass** | `figma-runtime.json` | 存在 `Spike B`（id 1:115）、`Spike C`（id 1:187） |
| 2 | 嵌套 Auto Layout | **pass** | `figma-runtime.json`、`spike-b.png`、`spike-c.png` | B：PageShell 1440×900 HORIZONTAL；Sidebar 240×900 VERTICAL；Content 1200×900 VERTICAL（`layoutGrow: 1`）。C：MobileShell 390×844 VERTICAL；TopBar 390×56；FeedContent 390×620（hug）；BottomNav 390×64。未出现 100×100 塌陷 |
| 3 | 中文字体 | **pass** | `spike-b.png`、`spike-c.png` | `订单管理`、`发现`、`周末去哪儿`、`暂无订单` 等中文正常，无豆腐块 |
| 4 | 变量 | **pass** | `figma-runtime.json` | `Spike B Tokens` / `Spike C Tokens` 各 7 个颜色变量；插件通过 `setBoundVariableForPaint` 绑定填充 |
| 5 | 文本样式 | **pass** | `figma-runtime.json` | `heading.1/2/3`、`body.md`、`label.sm` 已创建并应用到文本；两页同名样式重复为已知偏差 |
| 6 | 组件变体 | **pass** | `figma-runtime.json`、`spike-b.png` | 两个 `Button` 组件集各 2 个变体（primary/secondary）；`CreateButton` 实例指向 `Variant=primary`；组件集 x=1540/490，不再遮挡页面 |
| 7 | 图标 | **pass** | `spike-c.png`、`figma-runtime.json` | `bookmark` 为可编辑矢量（`vectorIconNames: ["bookmark"]`） |
| 8 | 图片填充 | **pass** | `spike-c.png`、`figma-runtime.json` | `imageFillCount: 2`；封面为 1×1 占位图填充（已知偏差） |
| 9 | HTML / Figma 一致性 | **pass（含已知偏差）** | `spike-b.png` vs `b-end.png`；`spike-c.png` vs `c-end.png` | 布局、字号层级、间距基本一致；已知偏差：按钮文案固定“按钮”、封面占位、BottomNav 未固定底部、表格列不均分、卡片圆角/行分隔线未绘制 |

## 偏差与问题

- Figma 文件选择器导入开发插件在本次环境中没有完成（点击 Open 无响应）；改用已安装的 **Brio MCP** 作为执行通道，运行的是同一份 `dist/code.js` 和同一份 plan，页面节点与截图均为真实 Figma 输出。
- manifest 已补上 `id`（`prd-ui-spike-local-dev`），后续手动导入应可用；本次实际构建不依赖该导入。
- 其它预期偏差见 `spike/report.md` 的 “Figma 端预期偏差”。

## 结论

- [x] **Go（推荐）**：1–9 全部通过；机制与核心视觉均成立，已知偏差在可接受范围内。
- [ ] Conditional Go
- [ ] No-Go

理由：页面创建、嵌套 Auto Layout、中文、变量、文本样式、组件变体/实例、图标、图片填充均通过；HTML/Figma 主要布局一致。已知偏差（占位图、按钮文案、BottomNav 固定、表格列均分、圆角/分隔线）不影响 Phase 0 的机制验证。

**最终视觉签核：待用户确认。**
