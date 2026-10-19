# Phase 0 Figma Spike Report

> **状态：PRELIMINARY — Task 7 人工 Figma 视觉验收尚未执行，不能给出最终 go/no-go。**
> 日期：2026-10-19
> 分支：`phase-0-spike`
> 关键 commit：`064c3b0`（docs）→ `69747c0`（插件尺寸修复）→ `2de2654`（忽略构建产物）→ `53d8bb6`（验收文档）→ `48f0449`（最终对齐修复）→ `b35907d`（HTML 字体对齐）→ `868fdea`（字体回退与字号守卫）
> 人工验收包：`spike/artifacts/figma/checklist.md`、`spike/artifacts/figma/notes.md`

## 环境

- macOS / Node `v24.19.0` / pnpm `11.19.0`
- Vite `8.3.4`、Vitest `5.0.5`、Playwright（Chromium）
- Figma 桌面版已安装；Figma Brio MCP 未连接（本 phase 不依赖）
- 字体：Noto Sans SC（主），PingFang SC 回退

## 验证范围

- 同一份 Page Spec fixture → React HTML 与原生 Figma 图层
- 嵌套 Auto Layout、颜色变量、文本样式、组件变体/实例、中文字体、图标矢量、图片填充
- HTML 布局：1440×900（B 端）与 390×844（C 端），无横向溢出

## 自动化结果（已通过）

| 检查项 | 结果 | 证据 | 备注 |
|---|---|---|---|
| 单元测试 | **pass** | `pnpm test` 输出 | 4 个测试文件 / 20 个测试全部通过 |
| plan 编译 | **pass** | `spike/spec/figma-plan.{b,c}-end.json` | `pnpm plan` 生成两份 plan；B 有 12 个 `STRETCH` + Content `layoutGrow: 1`，C 有 4 个 `STRETCH` |
| HTML 构建 | **pass** | `spike/dist-html/` | Vite 构建成功，21 个模块 |
| HTML 布局 / 无溢出 | **pass** | `spike/artifacts/b-end.png`、`spike/artifacts/c-end.png` | `pnpm test:e2e` 2 passed；console / pageerror 断言为空（自动化）；两张截图已人工查看 |
| Figma 插件构建 | **pass** | `spike/figma-plugin/dist/code.js` | `pnpm build:figma` exit 0；bundle 32,663 bytes，含两份 plan，无未解析 import |
| 类型检查 | **not clean（非门禁）** | `tsc --noEmit` | 插件包 `tsc --noEmit` 报告 19 个 type-only 错误（JSON 推断 + 新增字段读取）；`build-plans.ts` 缺 `@types/node`；CSS side-effect import 缺 `vite/client`。esbuild / vitest / Vite 构建均不受影响；计划没有把 `tsc` 设为 Phase 0 门禁 |

## Figma 人工结果（待执行）

| # | 检查项 | 结果 | 证据 | 备注 |
|---|---|---|---|---|
| 1 | 页面创建 | **PENDING** | `artifacts/figma/01-pages.png` | 需人工在 Figma 桌面版运行插件 |
| 2 | 嵌套 Auto Layout | **PENDING** | `artifacts/figma/02-layout.png` | 已修复 frame 100×100 塌陷与 fill 轴 `AUTO` 问题；需画布确认 |
| 3 | 中文字体 | **PENDING** | `artifacts/figma/03-font.png` | 需确认无豆腐块 |
| 4 | 变量 | **PENDING** | `artifacts/figma/04-variables.png` | 颜色变量集合与填充绑定 |
| 5 | 文本样式 | **PENDING** | `artifacts/figma/05-text-styles.png` | `heading.1/2/3`、`body.md`、`label.sm` |
| 6 | 组件变体 | **PENDING** | `artifacts/figma/06-button.png` | `Button` 组件集 + `CreateButton` 实例 |
| 7 | 图标 | **PENDING** | `artifacts/figma/07-icon.png` | C 端 `bookmark` 应为可编辑矢量 |
| 8 | 图片填充 | **PENDING** | `artifacts/figma/08-image.png` | C 端 FeedCard 封面为 IMAGE 填充 |
| 9 | HTML / Figma 一致性 | **PENDING** | `artifacts/figma/09-side-by-side.png` | 并排对比；已知偏差见 checklist |

## 偏差与已知限制

### 实现过程中对计划代码的修正

- **Auto Layout 尺寸**：计划的插件代码设置 `layoutMode` 后没有设置 sizing mode，frame 会停留在 100×100；fill 轴保持 `AUTO` 也与 Figma 类型约束冲突。已新增 `layoutGrow` / `layoutAlign` 字段与纯函数 `resolveSizingModes`，保证 fill 轴为 `FIXED`、hug 轴为 `AUTO`，并新增 14 个单元测试。
- **最终验收前对齐修复**：C 端新增 `FeedContent` 包裹层（padding 16 / gap 16），FeedCard 宽 358、封面满宽、`FeedText` 水平内缩 16px / 垂直 12px，与 HTML 一致；文本填充绑定 `color.text.primary`；Header / TopBar / Search 改为水平 padding 并垂直居中，FilterBar / HeaderRow / Row 垂直居中，BottomNav 两端对齐；图标按 plan `size` 缩放；表格示例文案改用列名。以上均在最终修复波次完成。
- **HTML 字体层级**：HTML renderer 现在通过 CSS 变量消费 profile typography（`heading.1/2/3`、`body.md`、`label.sm`）；字号/行高按 profile type scale 对齐；字重仍受插件映射限制（500→Regular，≥600→SemiBold），已在已知偏差中记录。
- **Zod v4**：计划测试使用 Zod 3 的单参数 `z.record()`；安装的是 Zod 4，改为双参数形式，语义等价。
- **`findNode` 测试 helper**：计划中的 guard 顺序会让 ICON 节点永远找不到；调整为先比较 name，再判断 type，断言未变。
- **Vite 预览地址**：`vite preview` 默认只绑定 `::1`，已给 `preview:html` / `dev:html` 加 `--host 127.0.0.1`，与计划中的 URL 和 Playwright `baseURL` 一致。

### Figma 端预期偏差（详见 checklist）

- 图片使用 1×1 占位 PNG，FeedCard 封面为纯色/空白；fixture 的 `assets/feed-*.png` 未加载。
- 字重映射：`>=600` 统一 `SemiBold`，`500` 为 `Regular`；Noto Sans SC 缺失时回退 PingFang SC Regular。
- 按钮实例文案固定为 “按钮”，不应用 plan 的 `props.label`。
- BottomNav 在 Figma 中顺序排列，未固定在底部。
- 表格列不自动均分；组件圆角固定 8px，未引用 `radius.*` token。
- FeedCard / FeedText 未设置圆角；表格行分隔线未绘制。
- 两页分别创建同名文本样式（`heading.1/2/3`、`body.md`、`label.sm`），本地样式面板会出现重复项。
- 同一文件重复运行插件会产生重复页面、变量集合和文本样式；应使用全新空白文件。
- Button 组件集与根 Frame 都在页面原点，可能互相遮挡；用图层面板查看。

## 结论

**当前不能给出最终 go/no-go。** 自动化侧全部通过；Figma 机制的关键检查项（页面创建、嵌套 Auto Layout、中文字体、变量、文本样式、组件变体、图标、图片填充、一致性）必须在 Figma 桌面版中人工确认。

人工验收后按 `artifacts/figma/checklist.md` 的规则判定：

- **Go**：1–9 全部通过（允许预期偏差）。
- **Conditional Go**：仅非关键项失败（图片占位、字重、按钮文案等），记录风险后进入 Phase 1。
- **No-Go**：嵌套 Auto Layout、中文字体或组件变体任一失败 → 退回 B（Plumb）或 C（HTML-first）。

## 下一步

1. 按 `spike/artifacts/figma/checklist.md` 在 Figma 桌面版运行插件并完成 9 项检查。
2. 将结果与截图写入 `spike/artifacts/figma/notes.md`。
3. 用实际结果替换本报告的 PENDING 行，并给出最终 go/no-go。
4. 若 Go / Conditional Go：编写 Phase 1 基础计划（契约、校验器、状态机、样本 PRD）。
