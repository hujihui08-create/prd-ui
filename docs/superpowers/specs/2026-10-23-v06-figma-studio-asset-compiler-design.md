# v0.6 Phase 3A：Figma Renderer + Studio + Asset Compiler 设计

- 日期：2026-10-23
- 状态：Implemented（2026-10-25；自动化部分完成；Figma 人工门禁待执行，未签核）
- 输入：v0.5 已签核（0 major / 4 minor / 0 blocker）、主设计 §6.7/6.8/10.2/10.3/12、版本路线 v0.6、`spike/` Phase 0 经验
- 关联：[主设计文档](2026-10-19-prd-to-ui-pipeline-design.md)、[v0.5 设计](2026-10-23-v05-visual-a11y-closure-design.md)、[v0.5 交接](../../handoffs/2026-10-23-v05-visual-a11y-closure-handoff.md)、[版本路线](../plans/2026-10-23-version-roadmap.md)

## 0. 结论

v0.6 是 Phase 3A：把 Page Spec 变成可交付的 Figma 源文件，并补齐 Asset Compiler 与只读 Studio 工作台。

1. **Figma Renderer**：PageSpec → `figma-plan.json` → Figma 插件 → 原生图层/Auto Layout/Variables/Text Styles/Button 实例/图标/图片；插件导出 readback JSON，core 做结构 diff；scratch 构建通过后交付。
2. **Asset Compiler**：Asset Manifest + frozen assets → `handoff/assets/` + `manifest.json` + `LICENSES.md`；确定性、无模型；缺资产/未知 license 阻断。
3. **Studio**：只读本地工作台，展示 8 页、状态预览、catalog/profile、findings、assets；使用 `ui-design-system`（shadcn/ui + Tailwind v4），不承载编排。

Figma 插件不能 headless：plan 生成、结构 diff、Asset Compiler、Studio 可自动化；真实 Figma 构建/回读/视觉一致性是**人工门禁**。v0.6 只渲染 8 页 default frame；loading/empty/error 的 Figma 状态帧、完整组件库、Studio 编辑/导出留 v0.6.x/v0.7。

## 1. 现状

### 1.1 已完成

- v0.5 signed：672 tests、typecheck clean、`test:dsh` 4、Phase 1 `8/2/4/8` 全 0、24 张 visual baseline、Critic 0 major / 4 minor。
- HTML 渲染器覆盖 8 页及 loading/empty/error/business/view/search/drawer 状态。
- `PageSpec` 有稳定语义 `node.id`；Profile/Catalog/AssetManifest/VisualReview 契约齐全。
- M0 资产评审 13/13；phase2 asset-review 有 4 个 frozen icon；M0 有 Lucide ISC license 文本。

### 1.2 缺口

| 能力 | 现状 |
|---|---|
| Figma plan | 只有 `spike/plan` 的两页原型，类型与当前 PageSpec 不匹配 |
| Figma 插件 | `spike/figma-plugin` 把 plan 硬编码进 bundle，只建 2 页；重复运行产生重复页面/变量/文本样式；Button 文案固定 |
| readback/diff | 无正式契约；spike 只有人工 checklist |
| 组件映射 | catalog 有 `mapping.figma?` 字段，但 b-mobile 没有声明；无 Figma 组件库 |
| Asset Compiler | 无；`asset-manifest.b-mobile.json` 为空，M0 frozen/Lucide license 未打包 |
| Studio | 无；只有 HTML 产物 |
| Figma 环境 | Brio MCP 当前未连接；插件必须 Figma 桌面版人工运行 |

`spike/` 是历史 Phase 0 证据，只作为 Auto Layout/字体/变量的经验来源，**不直接复用**：
- 不嵌入 plan；改为插件 UI 选择 plan 文件。
- 文本样式/变量按 profile 命名，禁止重复。
- 8 页、真实 Button 实例文案、BottomNav 固定在底部。
- `tsc` 必须 clean；esbuild bundle 无 Node import。

### 1.3 Studio UI 约束

Studio 自身 UI 必须使用 `ui-design-system` skill 的 shadcn/ui + Tailwind v4 规范：
- 黑白灰、`h-9` 控件、`rounded-md`/`rounded-xl`、指定字号；
- Button/Input/Card/Dialog 从 `@/components/ui/*` 导入，禁止手写；
- 图标只用 lucide-react；
- workbench 三栏（页面树/预览/右侧面板）用 shadcn 原语组合；
- **工作台样式与产品 b-mobile 样式严格隔离**，产品库不用于 Studio，Studio 样式不进入 HTML/Figma 产物。

## 2. 范围与非目标

### 2.1 范围

- 新增 `core/contracts` Figma plan/readback/diff 契约。
- 新增 `core/figma`：plan 编译器、组件样式注册表、readback diff。
- 新增 `runtimes/figma`：插件 sandbox、插件 UI、esbuild bundle、plugin manifest。
- 新增 `core/asset-compiler` + standalone `asset:compile` CLI。
- 新增 `studio`：Vite + React + Tailwind v4 + shadcn；`studio:prepare` 生成静态数据；只读。
- 8 页 default Figma plan + 插件 scratch/delivery + readback/diff + 人工视觉检查。
- Button 组件集/实例；颜色变量；文本样式；中文字体；glyph/vector 图标；image fill 支持。
- M0 13 资产 + phase2 4 frozen icons 的资产包/LICENSES。
- 单测、插件 build、readback fixture diff、Studio Playwright、Asset Compiler 测试、人工 Figma checklist。

### 2.2 非目标

- Figma loading/empty/error/business 状态帧；v0.6 只 default 8 页，状态帧 v0.6.x/v0.7。
- 全组件库映射；v0.6 只有 Button 实例，其他组件用 native frame。
- 全部图标矢量化；v0.6 资产图标用 vector，Material Symbols 用 glyph text，完整矢量集 v0.6.x。
- Figma 原型连线/Smart Animate。
- Studio 编辑、项目向导、Git、逐页重生成、导出 Handoff；只读 MVP。
- Asset Compiler 生成式资产/IP；只做 manifest/frozen 打包与授权。
- 完整 a11y、scratch 沙箱、Test Subagent、Handoff Packager（v0.7）。
- 真实项目试点（v0.8）、RC（v0.9）、最终交付（v1.0）。
- 生产代码直出。

### 2.3 不变项

- PageSpec required 字段不变；只新增可选 Figma 类型/映射。
- HTML 渲染器、视觉 baseline、M1/intake/资产评审产物不变；v0.6 不修改已签核 brief。
- Figma 构建是人工门禁；没有 Figma 构建/readback 时 v0.6 不能签 `passed`。
- 本地 commit，不 push；不提交 `.env`、keys、Figma credentials。

## 3. 方案选择

| 决策 | 采用方案 | 备选与取舍 | 理由 |
|---|---|---|---|
| Plan 交付 | 插件 UI 选择 `figma-plan.json`；插件固定 | 把 plan 嵌入 bundle；只用 MCP 注入 | 可重复、可交付；嵌入 plan 每页重建插件（spike 的坑）；MCP 只做开发验证，不能作为交付路径 |
| 组件范围 | Button 组件集/实例；其余 native frame | 全组件库；全部 frame | Button 满足 Component Instance；全库超出 v0.6；全 frame 缺组件证据 |
| Figma 状态 | 8 页 default only | 8 页 + 24 状态；8 页 + 6 代表状态 | PageSpec 目前没有状态专用布局；状态帧要新编译器能力，放 v0.6.x/v0.7 |
| Studio | 静态 `studio-data.json` + Vite/React | 本地 Node API；纯 HTML | 只读、无编排；静态构建最简单；UI 用 shadcn |
| Asset Compiler | AssetManifest + frozen/source dir | 只读 asset-review manifest；生成资产 | review manifest 没有文件/license；生成超出 v0.6；frozen 文件可确定性打包 |
| 图标 | 资产图标 vector；Material Symbols 用 glyph text | 全部 Lucide vector；全部 glyph | 与 HTML 图标家族一致；4 个资产图标可矢量；完整 Material Symbols SVG 集后置 |
| 验证 | readback JSON + core diff + 人工检查 | 只截图；只人工 | 结构 diff 可定位 frame/文本/变量/实例/字体；截图只做视觉一致性 |
| 日历 | CalendarGrid 内部允许受控 absolute（仅时间块），其余 Auto Layout | 全 Auto Layout 网格；把日历改成列表 | 时间块需跨行/半小时间隔；Figma Auto Layout 不支持跨格重叠；受控 absolute 是唯一保真方案，readback 检查坐标 |

## 4. 架构与包

```text
core/contracts/src/figma.ts        # FigmaPlan / FigmaReadback / FigmaDiff schema
core/figma/                        # runtime-neutral plan compiler + style registry + diff
core/asset-compiler/               # runtime-neutral asset package compiler
runtimes/figma/                    # Figma plugin sandbox + UI + esbuild bundle + manifest
runtimes/standalone/               # figma:plan / figma:verify / asset:compile / studio:prepare CLIs
studio/                            # Vite + React + Tailwind v4 + shadcn read-only workbench
```

- `core/figma` 依赖 `contracts`、`design-system`；不依赖 runtime。
- `core/asset-compiler` 依赖 `contracts`；文件写入由 `runtimes/standalone` 完成。
- `runtimes/figma` 只含浏览器/Figma sandbox 代码；esbuild bundle 不得 import Node。
- `studio` 独立 app；只读 `studio-data.json` + HTML；不 import core 的编排。
- Workspace 增加 `studio`；`pnpm-workspace.yaml` packages 增加 `"studio"`；根 scripts 增加：
  `figma:plan`、`figma:verify`、`asset:compile`、`studio:prepare`、`studio:build`、`studio:dev`。

## 5. Figma Renderer

### 5.1 Plan 契约

```ts
export interface FigmaPlan {
  schemaVersion: "1.0";
  project: string;
  pageId: string;
  pageName: string;
  width: number;
  height: number;
  background: string; // token, e.g. color/surface/subtle
  tokens: Record<string, string>;       // color/space/radius tokens
  textStyles: Record<string, TextStyleDef>;
  components: {
    Button: {
      variants: Record<"primary" | "secondary" | "ghost" | "danger", {
        fill: string; text: string; labelTextStyle: string;
      }>;
    };
  };
  root: FigmaPlanNode;
  stats: { frames: number; texts: number; instances: number; icons: number; images: number };
}

export type FigmaPlanNode =
  | { type: "FRAME"; specId: string; name: string; layoutMode: "VERTICAL"|"HORIZONTAL";
      width?: number; height?: number; padding?: number; paddingX?: number; paddingY?: number;
      gap?: number; fill?: string; radius?: number; clip?: boolean;
      layoutGrow?: number; layoutAlign?: "STRETCH"; children: FigmaPlanNode[] }
  | { type: "TEXT"; specId: string; name: string; characters: string;
      textStyle: string; color?: string; align?: "LEFT"|"CENTER"|"RIGHT" }
  | { type: "INSTANCE"; specId: string; name: string; component: "Button";
      variant: "primary"|"secondary"|"ghost"|"danger"; label: string }
  | { type: "GLYPH"; specId: string; name: string; glyph: string; size: number; color?: string }
  | { type: "VECTOR"; specId: string; name: string; assetId: string; svg: string; size: number }
  | { type: "IMAGE"; specId: string; name: string; assetId: string; dataUrl: string;
      width: number; height: number; radius?: number }
  | { type: "ABSOLUTE"; specId: string; name: string; x: number; y: number;
      width: number; height: number; child: FigmaPlanNode };
```

- `specId` 来自 PageSpec `node.id`；没有 id 的节点用稳定路径 `<pageId>.<slot>.<type>.<index>`。
- 根 frame 固定 `width/height`（mobile 390×844）；clip content。
- 颜色只引用 token；plan 中不出现 raw hex（token 值除外）。
- `ABSOLUTE` 只允许在 `CalendarGrid` 内部（时间块），其他节点必须 Auto Layout；validators/plan tests 检查。

### 5.2 Plan 编译器

`core/figma` 的 `compileFigmaPlan(pageSpec, profile, catalog, assets): FigmaPlan`：

- 8 页全量；每页输出 `figma-plan.<pageId>.json` 和 `figma-plan.index.json`（pageId/name/route/width/height/hash）。
- 默认态过滤：只渲染 default view（`defaultView ?? views[0]`）的 panel；跳过 `viewPanel` 非默认的 Section、`Skeleton`、`EmptyState`（除 `emptyKind: "idle"`）、加载/错误等状态节点；`emptyKind: "idle"` 是搜索页默认空态，保留。`ErrorState`/inline EmptyState 不进入 default plan。
- 组件映射（v0.6）：

| PageSpec node | Plan node | 说明 |
|---|---|---|
| MobileShell | FRAME VERTICAL 390×844, clip | top bar / scroll content / tab bar |
| TopBar / TabBar | FRAME HORIZONTAL | padding/gap token；TabBar 用 layoutGrow spacer 固定在底部 |
| Section / Card / Row / Stack / Grid | FRAME | padding/gap/fill/radius |
| Text | TEXT | textStyle from role；color from props/role |
| QuickAction | FRAME + GLYPH + TEXT | 图标/文案；不是 Button |
| Button | INSTANCE Button | variant/label 覆盖 |
| Icon / material symbol | GLYPH | Material Symbols Rounded；size/color |
| 资产图标 | VECTOR | assetId + svg from Asset Manifest/package |
| Image / image slot | IMAGE | dataUrl from asset package；v0.6 fixture |
| ListRow / SummaryRow / CollapsedFilter / Switch / SearchBar | FRAME + TEXT/GLYPH | 原生结构 |
| CalendarGrid | FRAME + ABSOLUTE blocks | 7 列 × 12 小时；时间块按 start/duration 绝对定位（含 16:30） |
| EmptyState / Skeleton / ErrorState | FRAME | default 页很少出现；有则 native |
| FormField / Input / Select / List / Badge | FRAME + TEXT | 非 Button 的组件先 native |

- 组件样式来自 `core/figma/src/styles.ts` 的 `ComponentStyleRegistry`：每种 PageSpec node 映射 padding/gap/fill/radius/textStyle/layout；值只来自 profile tokens 和 catalog variants。
- 文本/颜色：Text `textRole` → profile typography；颜色按 role/props；不写 raw 值。
- Button 组件：plan.components.Button 包含 4 个 emphasis variants；plugin 生成组件集；实例 label 覆盖。
- 字体：textStyles 名称用 `<profile>/<role>`（如 `b-mobile/heading.1`），避免多页重复。
- 图标：Material Symbols 名称落到 GLYPH；资产 id 落到 VECTOR（M0/asset package）；未解析资产 → blocker。
- 图片：Asset Manifest 中 image/illustration 生成 dataUrl（v0.6 fixture）；缺资产 → blocker 或 placeholder（manifest.placeholders）。
- plan stats：frames/texts/instances/icons/images；用于 readback diff 期望值。

### 5.3 Figma 插件

`runtimes/figma`：

- `src/plugin.ts`（Figma sandbox）+ `src/ui.html`（plan 文件选择/build/readback 下载）+ `manifest.json`（`documentAccess: "dynamic-page"`）+ esbuild bundle。
- UI：
  - 选择 `figma-plan.index.json`（或单页 plan）；
  - “Scratch build + readback”：新建 `<pageId> [scratch]` 页面，构建后导出 `figma-readback.<pageId>.json`；
  - “Build delivery page”：只有 scratch diff 通过后可用；创建 `<pageId>`；若同名页面存在则阻止并提示（不删除用户页面）；
  - 显示 fonts/variables/text styles/Button set 状态与错误。
- 构建：
  - **变量**：颜色 token → `color/<group>/<name>` 变量集合（Figma 变量名不允许点号）；fill 绑定变量；space/radius 暂为常量（v0.6.x FLOAT variables）。
  - **文本样式**：`<profile>/<role>`；`loadFontAsync` Noto Sans SC（Regular/Medium/SemiBold）；缺失回退 PingFang SC；记录 fallback。
  - **Button 组件集**：`b-mobile/Button`，variants primary/secondary/ghost/danger；实例 label 覆盖；组件集放在页面右侧（x = width+100），不遮挡。
  - **Auto Layout**：`layoutMode` + `primaryAxisSizingMode/counterAxisSizingMode`；fill 轴 FIXED、hug 轴 AUTO；`layoutGrow`/`layoutAlign` 按 plan；根 frame clip。
  - **绝对定位**：只有 ABSOLUTE（calendar blocks）设置 `layoutPositioning="ABSOLUTE"` + x/y；其他节点禁止。
  - **图标**：GLYPH 用 Material Symbols Rounded 文本；VECTOR 用 `figma.createNodeFromSvg`，尺寸/currentColor；字体缺失时记录。
  - **图片**：`figma.createImage` from dataUrl；IMAGE fill；缺图 placeholder。
  - **page frame**：顶部/底部固定，内容区可 clip；TabBar 在底部。
- 幂等：
  - 变量集合/文本样式按名称查找复用；已存在不重建。
  - 页面同名：scratch 页面可重建（删除 scratch 页面）；delivery 页面存在则阻止。
  - 组件集已存在则复用；不存在再创建。
- 失败：
  - 缺 font/variable/asset → 记录错误，readback 不完整；不显示成功。
  - 构建异常 → 删除 scratch 页面，UI 显示错误；plan 仍可交付。
  - 插件不能 headless；没有 Figma build 时状态 `manual_required`，不能 `passed`。

### 5.4 Readback 与结构 diff

```ts
export interface FigmaReadback {
  schemaVersion: "1.0";
  pageId: string;
  fileKey?: string;
  builtAt: string;
  fonts: Array<{ family: string; style: string; fallback: boolean }>;
  variables: string[];
  textStyles: string[];
  components: string[];
  nodes: FigmaReadbackNode[];
  errors: string[];
}
export interface FigmaReadbackNode {
  specId: string;
  nodeId: string;
  type: string;
  name: string;
  layoutMode?: string;
  itemSpacing?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  fills?: string[];
  fontName?: { family: string; style: string };
  fontSize?: number;
  textStyleName?: string;
  characters?: string;
  componentName?: string;
  variantProperties?: Record<string, string>;
  children?: FigmaReadbackNode[];
}
```

`core/figma/src/diff.ts` 对比 plan/readback：

| Code | 严重度 | 规则 |
|---|---|---|
| `FIGMA_PAGE_MISSING` / `FIGMA_PAGE_EXTRA` | blocker | pageId/页面数量 |
| `FIGMA_NODE_MISSING` / `FIGMA_NODE_EXTRA` | blocker | specId 集合 |
| `FIGMA_HIERARCHY` | blocker | 父子关系/顺序 |
| `FIGMA_LAYOUT_MODE` | blocker | frame layoutMode |
| `FIGMA_SIZE` | major | 显式 width/height 偏差 >1px |
| `FIGMA_SPACING` | major | padding/gap 偏差 >1px |
| `FIGMA_FILL_UNBOUND` | major | 颜色 fill 未绑定变量 |
| `FIGMA_TEXT_STYLE` | blocker | text style 缺失/名称错误 |
| `FIGMA_FONT` | major | 字体/字重与 plan 不符（fallback 记录） |
| `FIGMA_TEXT_MISSING` | blocker | characters 缺失/空 |
| `FIGMA_COMPONENT_INSTANCE` | blocker | Button 不是实例/变体错误 |
| `FIGMA_ICON` | major | GLYPH/VECTOR 类型/尺寸错误 |
| `FIGMA_IMAGE` | major | IMAGE fill 缺失 |
| `FIGMA_ABSOLUTE` | major | 日历块 x/y/尺寸偏差 >1px |
| `FIGMA_READBACK_INCOMPLETE` | blocker | errors 非空/usage 不完整 |

- 退出：0 blocker；major ≤2 且有接受理由（v0.6 人工 checklist 记录）；否则不交付。
- `figma:verify` CLI 输出 `figma-diff.json` + console summary；不通过时非 0。
- `figma-map.json`：`{pageId, nodes: {specId: nodeId}, components, textStyles, variables}`。

### 5.5 手工 Figma 验收

前置：
- Figma 桌面版；新建空白文件；导入 `runtimes/figma/manifest.json`；如需 MCP，先连接 Brio MCP（当前未连接，非必需）。
- 本机字体 Noto Sans SC（中文）与 Material Symbols Rounded（glyph 图标）；缺失时插件回退/记录，中文用 PingFang SC；图标字体缺失会显示 tofu，需安装字体或记录为 v0.6.x vector 债。

步骤：
1. 生成 8 页 plan：`pnpm figma:plan --spec-run /tmp/spec-v05/<id> --out /tmp/figma-v06`。
2. 在 Figma 运行插件，选择 index；scratch build 8 页；下载 readback。
3. `pnpm figma:verify --plan ... --readback ...`：0 blocker；记录 major。
4. 通过后 build delivery pages；检查：
   - 8 页 frame 390×844，TabBar 在底部；
   - 中文无豆腐块；Noto Sans SC/PingFang 回退记录；
   - 颜色变量绑定；修改变量能联动；
   - 文本样式 `b-mobile/*` 使用正确；
   - Button 是实例，variant/label 正确；
   - 图标 glyph/vector 正确；日历 16:30 位置正确；
   - 与 HTML 关键页并排（today、appointment-list、appointment-form）布局/字号/间距接近。
5. 证据保存到 `artifacts/employee-app-phase2/figma/`；写 `figma-checklist.md`。

没有 Figma build/readback：v0.6 状态 `manual_required`，不能签 `passed`。

## 6. Asset Compiler

### 6.1 输入/输出

输入（三种模式，互斥）：
- `AssetManifest` + source/frozen 目录（项目资产；phase2 空 manifest 时可用 asset-review 模式）；
- `--library <index.json>`（M0 library 13 项；用于完整库验收）；
- `--asset-review <run>`（读取 frozen assets + review manifest；phase2 4 个图标）；
- license 文本目录（如 `samples/assets/m0/LICENSE-lucide.txt`）；
- profile/icon style（可选，用于包 README）。

输出：

```text
assets/
  icons/<id>.svg
  illustrations/<id>@2x.png
  images/<id>...
  manifest.json       # 相对路径 + sha256 + license + complete
  LICENSES.md         # 每个 license 全文/标识；Lucide ISC；test-fixture 说明
  README.md           # 项目/profile/来源/数量/未解析
```

- manifest 的 `files[].path` 改为包内相对路径；`hash` 写 sha256；`complete=false` 或 placeholders 非空 → blocker。
- 未知 license / 缺 license 文本 → blocker；`test-fixture` 允许但必须在 LICENSES 写明“非生产资产”。
- 文件复制不改内容（frozen 已规范化）；SVG 检查 currentColor/无 script/外链（复用 asset-review 规则）。
- 幂等：同输入输出 hash 稳定；输出目录先写临时目录再原子替换。
- 无模型、无网络。

### 6.2 CLI 与验收

```bash
# M0 library：13 项完整导出（验收用）
pnpm asset:compile --library samples/assets/m0/library/index.json \
  --source samples/assets/m0/library --licenses samples/assets/m0 \
  --out /tmp/handoff-v06/assets

# phase2：4 个 frozen icon + review 证据
pnpm asset:compile --asset-review artifacts/employee-app-phase2/asset-review \
  --licenses samples/assets/m0 --out /tmp/handoff-v06/assets-phase2

# 普通项目 manifest
pnpm asset:compile --project samples/projects/demo-crm/project.yaml \
  --manifest samples/projects/demo-crm/asset-manifest.b-dense.json \
  --source samples/assets/m0/library --licenses samples/assets/m0 \
  --out /tmp/handoff-v06/assets-demo
```

- M0 验收：library 13 assets → 包内 13 文件 + manifest complete + LICENSES 含 Lucide ISC + test-fixture 说明。
- phase2：asset-review frozen 4 icons → 4 文件 + license + manifest；缺资产/未知 license 阻断。
- 普通项目：manifest 7 资产（demo-crm）同样可编译；不作为 13 项验收。

## 7. Studio（只读 MVP）

### 7.1 数据

`studio:prepare` 从 spec run + HTML + visual review + asset package 生成：

```json
{
  "schemaVersion": "1.0",
  "project": "employee-app-phase2",
  "runId": "run-...",
  "generatedAt": "2026-10-23T...",
  "pages": [
    { "id": "today", "name": "今日", "archetype": "home", "route": "/today",
      "html": "html/today.html", "states": ["default","empty","loading","error"],
      "views": [], "formModes": [], "businessStates": [] }
  ],
  "profile": { "name": "b-mobile", "tokens": {}, "typography": {} },
  "catalog": { "library": "b-mobile", "components": [] },
  "findings": { "visual": [], "deterministic": [] },
  "assets": { "complete": true, "assets": [], "licenses": [] },
  "figma": { "status": "not-built|manual_required|passed", "planDir": "...", "diff": null },
  "signoffs": []
}
```

- `studio:prepare` 复制 HTML 到 `studio/public/html/`，写 `studio/public/studio-data.json`；不写 runs。
- Studio 只读，不调用 agents/compiler；刷新只重读数据。

### 7.2 UI

- 三栏：左 PageTree（8 页，archetype/route/state 标记）；中 Preview iframe + Viewport/State/View 切换；右 Inspector tabs：Spec / Catalog / Profile / Findings / Assets / Traceability。
- 顶部：project/run、baseline/signoff 状态、Open HTML、Copy Figma/Studio 命令、Export 入口（v0.7 才真正打包）。
- 空态：没有 run/数据时显示 setup 指引；加载/错误态完整。
- 组件：shadcn `Button`、`Input`、`Tabs`、`Card`、`Badge`、`ScrollArea`、`Separator`、`Tooltip`、`Dialog`（如需）；lucide-react 图标；禁止手写同功能控件。
- 样式：黑白灰；h-9；rounded-md/xl；指定字号；8-point spacing；不与 b-mobile 样式混用。
- iframe 状态：`?state=loading/empty/error/disabled`、`?view=list`、`?mode=reschedule`；状态来自 studio-data。
- Findings：按 severity/page 过滤；显示 evidence；不提供编辑/waive。
- Assets：manifest 列表、license、complete 状态；Figma plan/diff 状态只读。

### 7.3 验收

- `pnpm studio:prepare ...` + `pnpm studio:build`；静态站点可离线打开。
- Playwright：8 pages、切页、state/view、tabs、findings/assets、0 console error、无 overflow；截图 1 张。
- `ui-design-system` skill 三步流程在实现时执行；组件全部来自 `@/components/ui/*`。
- 工作台样式不进入 `pipeline/artifacts/.../html`；产品样式不进入 Studio。

## 8. 错误处理与降级

| 场景 | 行为 | 门禁 |
|---|---|---|
| Figma 未连接/未安装 | `manual_required`；输出 plan/插件/说明；HTML/资产仍交付 | 不能 `passed` |
| 插件构建失败 | 删除 scratch 页面；UI 错误；readback 不完整 | blocker |
| 字体缺失 | PingFang 回退；readback 记录 fallback；人工确认无豆腐块 | major/人工 |
| 变量/文本样式重复 | 按名称复用；不重建 | 幂等测试 |
| 页面同名 | scratch 可重建；delivery 阻止 | blocker |
| readback 缺失/损坏 | `FIGMA_READBACK_INCOMPLETE`；不 diff | blocker |
| diff blocker | 不交付；修复 plan/plugin | blocker |
| diff major >2 | 不交付或人工记录理由 | major gate |
| 资产缺文件/未知 license | `asset:compile` 非 0；不生成 complete 包 | blocker |
| Studio 数据缺失 | 空态/错误态；不崩溃 | Playwright |
| Studio 样式泄漏 | 构建隔离；产品 CSS 不 import | 代码审查/构建 |

## 9. 测试与验收

### 9.1 单测

- `core/figma/tests/plan.test.ts`：8 页 plan、specId 覆盖、root/frame 尺寸、tokens/textStyles、Button 实例、glyph/vector、无 raw values、CalendarGrid 16:30 absolute。
- `core/figma/tests/diff.test.ts`：clean readback 0 blocker；missing node/hierarchy/text/style/instance → blocker；size/spacing/fill/font → major；duplicate/extra。
- `core/asset-compiler/tests/package.test.ts`：M0 13/13、paths/hash/license/LICENSES、placeholder/unknown license blocker、幂等。
- `runtimes/figma/tests/build.test.ts`：esbuild bundle 存在、manifest 有效、bundle 无 `node:`/`fs` import；UI HTML 含 plan file picker/readback。
- `core/contracts/tests/figma.test.ts`：plan/readback schema 正反例。

### 9.2 集成/Studio

- `runtimes/standalone/tests/figma-cli.test.ts`：`figma:plan` 生成 8 plans；`figma:verify` clean fixture 通过、mutated 失败。
- `studio` Playwright：prepare fixture + build；8 page tree、iframe state/view、tabs、findings/assets、0 console/overflow。
- Asset CLI integration：M0 包 + LICENSES。

### 9.3 手工 Figma

- 按 §5.5 清单；证据 `artifacts/employee-app-phase2/figma/`（8 页截图、readback、diff、checklist）。
- 退出：0 blocker；major ≤2 且有理由；中文无豆腐块；Button 实例；变量/文本样式；关键页 side-by-side 可接受。

### 9.4 出口门禁

- `pnpm test` 672+；typecheck clean；`test:dsh` 4。
- Phase 1 `8/2/4/8` 全 0；HTML 24-case baseline 不变。
- `figma:plan` 8 plans；`figma:verify` 0 blocker；手工 8 页 build 通过。
- Asset Compiler M0 13/13 + phase2 4 icons；LICENSES 完整。
- Studio Playwright 通过；8 页可浏览。
- 无 Figma build/readback → 不能签 v0.6。

## 10. 实施顺序

1. Contracts/workspace：FigmaPlan/Readback/Diff、catalog Button mapping、StudioData；workspace 加 studio。
2. `core/figma` plan compiler + style registry + 8-page tests。
3. `runtimes/figma` plugin/UI/bundle/manifest；插件 build test。
4. readback fixture + diff + `figma:plan`/`figma:verify` CLI。
5. `core/asset-compiler` + `asset:compile` + M0/phase2 tests。
6. `studio:prepare` + Studio app（shadcn/Tailwind）+ Playwright。
7. 手工 Figma 8 页 scratch/delivery/readback/diff/视觉检查。
8. 证据、CHANGELOG、roadmap、handoff、AGENTS；本地 commit（不 push）。

## 11. 关键文件

- `core/contracts/src/figma.ts`、`core/contracts/src/index.ts`
- `core/figma/src/{compile-plan,styles,diff,index}.ts`
- `core/figma/tests/{plan,diff}.test.ts`
- `core/asset-compiler/src/{package,licenses,index}.ts`
- `runtimes/figma/src/{plugin.ts,ui.html}`、`manifest.json`、`esbuild.config.mjs`
- `runtimes/standalone/src/{figma-cli.ts,asset-compile-cli.ts,studio-prepare-cli.ts}`
- `studio/src/{App.tsx,components/*,lib/*}`、`vite.config.ts`、`tailwind.config.*`
- `pipeline/package.json`、`pnpm-workspace.yaml`
- `documents`: v0.6 spec/plan/handoff、roadmap、AGENTS、CHANGELOG
- `artifacts/employee-app-phase2/figma/`、`handoff/assets/`

## 12. 完成定义

- [ ] 8 页 `figma-plan.json` 生成；plan 单测通过。
- [ ] 插件 UI 可选 plan；scratch 8 页构建；readback JSON 可下载。
- [ ] `figma:verify` 0 blocker；major ≤2 有理由；Button 实例/变量/文本样式/字体/图标/日历 16:30 正确。
- [ ] 手工 Figma 8 页 delivery + 关键页 side-by-side 通过；无豆腐块。
- [ ] Asset Compiler M0 13/13 + phase2 4 icons；LICENSES 完整；无未解析。
- [ ] Studio 8 页只读工作台；Playwright 0 console/overflow；shadcn 组件使用合规。
- [ ] 全量门禁绿；证据/文档更新；本地 commit，不 push。

## 13. 风险与处理

| 风险 | 处理 |
|---|---|
| Figma 插件不能 headless | 人工 scratch/delivery/readback；MCP 只做开发辅助；无 build 不签 |
| Auto Layout 尺寸塌陷 | 复用 spike `resolveSizingModes` 经验；plan/readback size diff |
| 字体缺失/豆腐块 | Noto Sans SC/PingFang 回退；readback fonts；人工检查 |
| 变量/文本样式重复 | 按名称复用；profile 前缀；幂等测试 |
| 日历时间块跨行 | 受控 ABSOLUTE（仅 CalendarGrid blocks）；x/y/尺寸 diff |
| HTML/Figma 样式漂移 | ComponentStyleRegistry + 关键页 side-by-side；major ≤2 |
| Button 实例文案不生效 | 实例 label 覆盖；readback characters 检查 |
| 资产 license 不完整 | license 文本必需；unknown/test-fixture 规则；阻断 |
| Studio 样式泄漏 | 独立 app/构建；只 import shadcn；CSS 隔离 |
| 范围膨胀到状态帧/编辑 | 非目标清单；v0.6 default 8 页/只读 Studio |

## 14. 与 v0.7 的边界

- v0.7 Phase 3B：scratch 沙箱（HTML/Figma/Asset/Spec）、Test Subagent、Handoff Packager。
- v0.6.x：Figma 状态帧、完整组件库、Material Symbols 矢量全集、Studio 编辑/导出。
- v0.8：真实项目试点；v0.9 RC；v1.0 最终交付。
- Figma 构建/回读是 v0.6 的人工门禁；v0.7 沙箱再把它纳入自动验证。

## 15. 实施进度（2026-10-26）

### 15.1 已完成（自动化部分）

- `core/contracts/src/figma.ts`：FigmaPlan / FigmaReadback / FigmaDiff schema。
- `core/figma`：8 页 plan compiler、Button 实例、glyph/vector/image、CalendarGrid 绝对定位、readback diff。
- `runtimes/figma`：插件 sandbox + UI + esbuild bundle + manifest（`documentAccess: "dynamic-page"`）。
- `runtimes/standalone`：`figma:plan`、`figma:verify`、`asset:compile`、`studio:prepare`、`studio:smoke` CLI。
- `core/asset-compiler`：M0 13/13、phase2 4 frozen icons、LICENSES、hash/幂等。
- `studio`：Vite/React/Tailwind v4 + 本地 shadcn 原语，8 页只读工作台；`studio:smoke` 8 页 / 8 iframe / 0 error。
- 测试：**697 passed**；typecheck clean；`test:dsh` 4；Phase 1 `8/2/4/8` 全 0。

### 15.2 真实 Figma 门禁（2026-10-26）

- 8 页 scratch 在 Figma 桌面版构建完成；`figma:verify` **8/8 passed（0 blocker / 0 major / 0 findings）**。
- 在新空白文件构建 8 页 delivery；delivery diff **8/8 passed**；16 份 readback 均 `errors: []`。
- Figma 文件：scratch `iL99qSPGhmh08BB9LketgF`，delivery `ne1JYKpfjDivRr0nK5jm4S`（均为 Drafts `Untitled`）。
- 证据：`pipeline/artifacts/employee-app-phase2/figma/{spec-source,plans,readback,diff,screenshots}/`，
  索引与复现步骤见同目录 `README.md`。
- 门禁暴露并修复的真实 bug：
  1. `getMainComponent()` 在 dynamic-page 下被拒绝 → `getMainComponentAsync()`。
  2. readback 递归进 INSTANCE 的内部 `Label`，每页 Button 报 `expected 0 children, got 1` → INSTANCE 作为叶子。
  3. Figma 在变量绑定 paint 时会丢弃 `opacity` → tinted token 改用 `<token>/alpha-NN` RGBA 变量。
  4. plan compiler 只读 `slots.content`，`detail`/`notice` 的 `summary`/`fields` 被丢弃（3 页空白）→ 按 renderer 顺序合并。
  5. 搜索页结果行（`searchText`）在默认态应隐藏 → plan 跳过。
  6. view-panel section 保留纵向 padding、去掉横向 padding，对齐 `[data-view-panel]`。
- 计划来源：v0.5 spec run 已丢失；plans 由已签核 brief 经 `compileProject` 重建（`spec-source/` 留档），
  旧的手改 spacing 被编译器修复取代。

### 15.3 未完成（人工签字）

- 8 页与 HTML baseline 的并排人工视觉检查、字体/变量/实例/glyph/16:30 日历核对尚未执行。
- 因此 v0.6 仍为 implemented；**签核只能由胡冀徽执行**，结构 diff 不能代替签字。

### 15.4 下一步

1. 按 `pipeline/artifacts/employee-app-phase2/figma/README.md` 的「Manual Figma checklist」逐项检查。
2. 通过后更新 roadmap/CHANGELOG/handoff 并签核 v0.6；签核后进入 v0.7。
3. v0.6.x 债不变：状态帧、完整组件库、Material Symbols 矢量集、readback 编排。
