# 会话交接：v0.6 Figma 门禁证据完成（待人工签核）

- 日期：2026-10-26
- 状态：**v0.6 结构门禁 8/8 scratch + 8/8 delivery 全部 passed；人工视觉检查与签核未做**
- 上一版：[v0.5.x / v0.6.x 小债清理](2026-10-26-v05x-v06x-debt-cleanup.md)

## 1. 一句话状态

8 页 Figma plan 在真实 Figma 桌面版完成 scratch 与 delivery 两轮构建，16 份 readback 全部
`errors: []`，`figma:verify` 16/16 `passed`（0 blocker / 0 major / 0 findings）；
证据已落到 `pipeline/artifacts/employee-app-phase2/figma/`。v0.6 只差人工并排视觉检查与签字。

## 2. 本次做了什么

| 项 | 结果 |
|---|---|
| 插件真实 bug | 3 个：dynamic-page 下 `mainComponent`、INSTANCE 内部子节点、变量 fill 丢 opacity |
| plan 编译器 bug | 3 个：`summary`/`fields` 槽位被丢（3 页空白）、搜索行未跳过、view-panel padding 不对 |
| 插件 UI | Build mode 由原生 `<select>` 改为单选框（NSMenu 无法被 CUA 驱动） |
| Plans | 由已签核 brief 重新编译（`compileProject`）并 `figma:plan` 重生成；旧手改 spacing 被编译器替代 |
| 证据 | `spec-source/`、8 plans、16 readback、16 diff、16 张截图、`figma/README.md` |
| Figma 文件 | scratch `iL99qSPGhmh08BB9LketgF`，delivery `ne1JYKpfjDivRr0nK5jm4S`（Drafts，均名 `Untitled`） |
| 测试 | `pnpm test` **697 passed**；`pnpm typecheck` clean |

## 3. 关键决策

1. **用插件 UI 的真实构建路径，不用 Brio 代跑。** Brio sandbox 的 `fetch` 被 Figma 的
   networkAccess 拦住（连 `localhost:9500` 都不行），无法把 plan 喂进 sandbox；最终用插件 UI 的
   URL loader + 剪贴板 readback，构建与回读都来自真实插件。
2. **INSTANCE 在 readback 里作为叶子。** plan 不描述实例内部结构；递归进 `Label` 会让每个
   Button 报 `FIGMA_HIERARCHY`（expected 0 children）。实例仍通过 `characters` 校验 label。
3. **tinted fill 用 `<token>/alpha-NN` 变量。** Figma 在把 paint 绑定到变量时会丢弃
   `opacity`（实测把 opacity:0.12 变成 1），所以为每个 token+alpha 组合生成 RGBA 变量；
   badge、日历块、状态 legend 才和 HTML 的浅底一致。
4. **计划来源改为可复现。** 原 `/tmp/spec-v05` spec run 已丢失；本次从已签核 brief 编译
   PageSpec 并留档到 `figma/spec-source/`，`figma:plan` 可重跑。旧的 8 份手改 plan 已被替换。
5. **Delivery 在新空白文件构建。** 组件集与变量自包含，不和 scratch 文件共用；delivery
   页面同名会阻止的行为保持不变。
6. **不重命名 Figma 文件。** 两个文件都留在 Drafts 的 `Untitled`，用 fileKey 识别，避免动
   用户资产。

## 4. 验证

- `pnpm test` 697 passed（新增 3 个 plan 回归测试：summary/fields、搜索行、view-panel padding）。
- `pnpm typecheck` clean；`pnpm --dir runtimes/figma typecheck` clean。
- `figma:verify`：
  - scratch：today / customer-search / customer-detail / appointment-detail /
    appointment-list / appointment-form / treatment-notice / callback-register 全部
    `passed (0 blocker / 0 major / 0 findings)`。
  - delivery：同样 8/8 passed。
- 16 份 readback 的 `errors` 均为空；delivery 文件含 25 个变量（17 base + 8 alpha）、
  6 个文本样式、1 个 `b-mobile/Button` 组件集。
- 视觉抽查：treatment-notice badge 由实心棕块恢复为浅底 + `未确认`；customer-detail /
  appointment-detail / treatment-notice 3 页从空 frame 恢复为完整内容；appointment-list
  日历块与 legend 恢复浅色底。

## 5. 如何复现

完整命令与 checklist 见 `pipeline/artifacts/employee-app-phase2/figma/README.md`。要点：

```bash
cd pipeline
pnpm figma:plan --spec-run artifacts/employee-app-phase2/figma/spec-source \
  --out artifacts/employee-app-phase2/figma/plans
# Figma 桌面版运行 runtimes/figma/manifest.json → 逐页 Load plan URL → Build → Copy readback
pnpm figma:verify --plan artifacts/employee-app-phase2/figma/plans/figma-plan.<page>.json \
  --readback artifacts/employee-app-phase2/figma/readback/figma-readback.<page>.json \
  --out artifacts/employee-app-phase2/figma/diff/figma-diff.<page>.json
```

本次用的本地 plan 服务是 `/tmp` 临时脚本（`node:http` 静态返回 plans + `POST /save`），
不在仓库里；`/tmp` 可能被系统清理，不影响已落盘证据。

## 6. 未做 / 下一步

### 必须由人做

1. 按 `figma/README.md` 的 Manual Figma checklist 做 8 页并排视觉检查：中文字体无 tofu、
   变量/文本样式绑定、Button 实例、glyph/vector、16:30 日历位置。
2. 由胡冀徽签核 v0.6；签核后更新 roadmap/CHANGELOG/handoff，再开 v0.7。

### 已知债（v0.6.x，不阻塞签核）

1. Figma state frames（loading/empty/error/business state）。
2. 完整组件库（当前只有 Button 实例）。
3. Material Symbols 完整矢量集（当前 glyph text，依赖本机字体）。
4. Figma readback/build 编排仍依赖人工步骤（插件不能 headless）。
5. v0.5 visual baseline 仍因 2026-10-26 的 CSS 改动而过期，下一次视觉门禁必须重生成并重签。

## 7. 坑

1. **插件注册路径是 `~/Downloads/prd-ui-figma/`。** 每次 `pnpm --dir runtimes/figma build` 后
   必须把 `dist/{code.js,ui.html}` 复制过去，否则 Figma 跑旧 bundle。
2. **Figma 会丢弃变量绑定 paint 的 opacity。** 需要透明度就生成 RGBA 变量，不要只改
   `paint.opacity`。
3. **原生 `<select>` / NSMenu 无法被 CUA 点击。** 插件 UI 已改为单选框；遇到类似控件改用
   web 渲染控件或元素索引。
4. **scratch 页关标签会丢。** 构建后立即 Copy readback / 截图，不要先切走。
5. **重建页面会重建组件集。** 若页面上的实例引用别的页的组件集，先删掉全部 scratch 页再整体
   重建，避免实例指向被删除的 master。
6. **Brio 与我们的插件不能同时运行。** 运行另一个会替换当前插件；Brio 的 `getPluginData`
   读不到别的插件写的 pluginData（按插件 ID 隔离），不能用它按 specId 检查我们的节点。

## 8. 保真修复（同日第二轮）

用户指出「布局、button、排版、颜色不对」后，用 Playwright 实测 HTML 的几何与计算样式，
和 Figma readback 逐项对比，修正了 8 类问题：

1. **按钮变体**：ghost 改为透明文字按钮；`.filter-row` 内 ghost 用 `ghost-chip`
   （白底 + `border.strong`、32h、radius 8、px12）；secondary/danger 补边框
   （`border.control`、`status.danger` 40% α）；每个变体自带高度/圆角/padding。
2. **分隔线**：列表行与详情行补 1px `border/subtle` 底边；详情 label 13px `body.sm`。
3. **TabBar**：页面中文名 + `home`/`calendar_month` 图标，只保留顶部边框。
4. **输入/下拉**：14px/400、radius 8、`border.control`；下拉显示首个选项（到店）。
5. **EmptyState**：spec 没有 icon 时不再画默认图标。
6. **日历**：选中日 600 字重 + 2px info 下划线、选中列 4% info 底、色块 2px 左侧色条、
   标题 600 / 副标题与时间 10px；ABSOLUTE 子 frame 显式尺寸，列宽铺满。
7. **契约/插件**：plan 节点新增 per-side border；Button 变体新增 fill/stroke/radius/
   padding/height/strokeAlpha；插件按边设置 stroke weight，按变体建组件。
8. **profile**：新增 `border.control`（#CBD5E1）；plan 追加 `input.md`、`label.bold`、
   `caption`、`date` 文本样式。

结果：8 份 plan 重新生成、16 页全部重建，16 份 diff 仍为 0/0/0；`pnpm test` 704 passed。
插件 bundle 为 `sha256:4f6aedcd6456…`。人工并排检查时请重点看：按钮边框/高度、列表分隔线、
TabBar 图标与文案、输入框字号与圆角、日历选中列与色块左侧色条。

### 截图注意

- 截图时不要运行插件：Figma 会保留「Running <plugin>」toast；用 `Cancel` 关掉。
- 截图前按两次 Escape 取消选中；不要在画布内点坐标（会选中 frame）。
- 窗口可能部分移出屏幕，坐标点击会报 `frame no longer maps to a live display`；
  一律用 AX 元素索引操作。
