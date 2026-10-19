# Phase 1C · 高保真 Renderer 与交付包 · 设计

- 日期：2026-10-19
- 状态：待用户审阅
- 路线：B（把 Renderer 提升为 pipeline 正式能力）
- 工作目录：`/Users/jihui/Desktop/产品、ui`
- 关联：
  - 总体设计：`docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md`
  - 风险登记：`docs/superpowers/specs/2026-10-19-phase-1c-renderer-risks.md`
  - AI 资产调研：`docs/superpowers/specs/2026-10-19-ai-asset-generation-research.md`

## 0. 已确认决策

| # | 决策 | 结论 |
|---|---|---|
| 1 | 设计系统 | 先用 `b-dense` / `c-expressive` 扩成高保真基线；后续 adapter 接入真实 Figma 库/tokens |
| 2 | 页面范围 | 8 页 sample + 真实切片（真实 PRD 已提供：员工端微信小程序）；**首版顺序 B 端优先**：先做 `orders-list` + `order-detail` 垂直切片，再铺 B 端其余页面（overview/form/settings），最后 C 端（`c-expressive`：feed/item-detail/auth）；**真实切片首版为移动 B 端 `今日` + `库存查询`，需新增 `b-mobile` profile**（见 §5.4） |
| 3 | 冲突优先级 | `RenderPlan` + tokens 是唯一契约；Figma 管静态视觉，HTML 管行为/动效；冲突只改契约 |
| 4 | 视觉验收 | runtime 断言 + 截图感知 diff + 人工签核；waiver 必须有 owner/理由/有效期 |
| 5 | 动效 | 标准预设库：页面转场、列表 stagger、卡片 hover、按钮 press、输入 focus、骨架 shimmer、空态淡入、弹层/抽屉 |
| 6 | AI 资产 | 标准 UI 图标走图标库；自定义图标允许 AI 原生矢量草稿；插画/海报图像层允许 AI；文字/logo/产品截图确定性图层 |
| 7 | AI 工具 | 先固定小样本评测 Recraft vs Adobe Firefly，再决定采购/接入 |
| 8 | AI 风格参考 | 现有基线 + sample 页面；品牌手册后续接入 |
| 9 | AI 审校 | 用户/设计负责人签核；AI 资产默认 candidate |
| 10 | 海报 | 首版交付 1–2 张；AI 图像层 + 确定性文字/logo/截图 |
| 11 | 内容 | 按“内容细化”：真实业务数据、各状态文案、无 lorem ipsum |

> **真实切片已确认（2026-10-20）**：员工端小程序 `今日` + `库存查询`；视口 390×844；测试基线为中性 B 端色（黑色主按钮/白字、客户蓝/库存橙、语义红黄绿），首页卡片暂不启用插画；暖玫瑰/插画作为实验能力保留，A/B/C 测试时再启用；面性图标用 Material Symbols Filled。详见 `2026-10-20-employee-app-prd-review.md`。

## 1. 目标与完成定义

### 1.1 目标

同一份经校验的 Page Spec，生成并交付：

1. **高保真 Figma 设计图**：原生图层、Auto Layout、变量、文本/效果样式、组件变体/实例、页面各状态、资产填充、交付标注。
2. **高保真 HTML 交互原型**：8 页 + 真实切片，可导航、可切换状态、含标准动效预设、响应式、可访问。
3. **1–2 张海报**：AI 图像层 + 确定性文字/logo/产品截图，中文校对、印刷规格检查。
4. **切图与资产包**：SVG 图标、PNG/WebP 插画/图片 @1x/2x/3x、海报导出、manifest + hash + 授权/来源。
5. **交付包**：设计图、原型、资产、tokens、Page Spec、动效说明、视觉对比报告、`HANDOFF.md`。
6. **视觉门禁**：runtime 断言 + HTML/Figma 截图 diff + 资产/AI 来源断言 + 人工签核。

### 1.2 完成定义（Definition of Done）

一页/一次交付只有在以下全部成立时才完成：

1. Page Spec 0 blocker；
2. RenderPlan 生成且所有 token/asset 可解析；
3. HTML 页面/状态可打开，0 控制台错误，核心交互可用；
4. Figma 页面/状态生成，runtime JSON 结构断言通过；
5. HTML/Figma 截图 diff 在阈值内，或有 owner/有效期明确的 waiver；
6. 资产 manifest 完整（文件、hash、格式、倍率、授权/来源）；
7. a11y 检查通过（对比度、焦点、键盘、reduced-motion）；
8. 人工视觉签核记录。

**“0 blocker”只是第 1 条，不构成交付完成。**

## 2. 架构

```text
PRD → UI Brief → Page Spec（语义契约，已存在）
        │
        ├── Content Model（内容细化：真实数据、各状态文案）
        ├── Design System Profile（tokens + components + icons + illustrations + motion）
        └── RenderPlan（平台无关 IR）
              ├── HTML Renderer（React + Vite + CSS vars + Framer Motion）
              │     → 可交互高保真原型 + Playwright 截图
              └── Figma Renderer（插件 + 桥接）
                    → Foundations + Components + Pages/<pageId> 各状态
                    → variables/text/effect styles + component sets/instances
                    → runtime JSON + PNG 导出
              └── Asset Compiler（library / ai-vector / ai-raster / upload / placeholder）
                    → SVG/PNG/WebP + manifest/hash/license/provenance
Visual Gate（runtime 断言 + 截图 diff + 资产/AI 断言 + 签核）
Handoff（design + prototype + assets + specs + reports + README）
```

### 2.1 包结构（建议）

```text
pipeline/
  packages/
    render-plan/        # RenderPlan 类型、编译、契约测试
    content/            # Content Model、fixture、内容校验
    renderer-html/      # React/Vite renderer + motion + Playwright
    renderer-figma/     # Figma plan transformer + plugin 源码
    assets/             # Asset Compiler、SVG 规范化、切图、manifest
    visual-check/       # runtime 断言、截图 diff、报告、waiver
  pipeline/orchestrator # 新阶段：render:html / render:figma / assets / visual
```

`spike/` 保留为参考实现；达到 parity 后 retire，不直接提升为生产代码。

## 3. RenderPlan 契约

RenderPlan 是 HTML 与 Figma 的唯一输入；两端不得各自发明布局/样式。

### 3.1 结构

```ts
type RenderPlan = {
  meta: {
    planId: string;
    pageId: string;
    project: string;
    profile: string;
    target: "web" | "mobile";
    viewport: { width: number; height: number };
    sourceHash: string;
    version: string;
  };
  tokens: TokenSet;              // 已解析的 token 值 + 引用
  states: {
    default: RenderNode;
    empty?: RenderNode;
    loading?: RenderNode;
    error?: RenderNode;
  };
  assets: AssetRef[];
  annotations: Annotation[];
};

type RenderNode =
  | FrameNode
  | TextNode
  | ImageNode
  | IconNode
  | ComponentInstanceNode;

type FrameNode = {
  kind: "frame";
  id: string;
  name: string;
  layout: "none" | "horizontal" | "vertical" | "grid";
  gap?: string;                  // token ref
  padding?: { top: string; right: string; bottom: string; left: string };
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "space-between";
  sizing: {
    width: "fixed" | "hug" | "fill";
    height: "fixed" | "hug" | "fill";
    fixedWidth?: number;
    fixedHeight?: number;
    grow?: number;
  };
  fill?: string;                 // token ref
  stroke?: { token: string; width: number };
  radius?: string;               // token ref
  shadow?: string;               // token ref
  columns?: ColumnSpec[];        // DataTable/Grid
  children: RenderNode[];
  state?: string;
  reqRefs?: string[];
  notes?: string[];
  motion?: MotionBinding;
};

type ColumnSpec = {
  key: string;
  label: string;
  width: "fixed" | "fill";
  fixedWidth?: number;
  grow?: number;
};

type TextNode = {
  kind: "text";
  id: string;
  text: string;
  textRole: string;              // token ref
  fill?: string;                 // token ref
  align?: "start" | "center" | "end";
  maxLines?: number;
  motion?: MotionBinding;
};

type ImageNode = {
  kind: "image";
  id: string;
  assetRef?: string;             // manifest id；缺省时用 placeholder token
  placeholderToken?: string;     // 统一中性占位，禁止硬编码颜色
  fit: "cover" | "contain";
  aspectRatio?: number;
  alt?: string;
  motion?: MotionBinding;
};

type IconNode = {
  kind: "icon";
  id: string;
  iconRef: string;               // 图标库/自定义 id
  size: number;
  colorToken: string;            // 通常 color.text.primary/currentColor
  motion?: MotionBinding;
};

type ComponentInstanceNode = {
  kind: "instance";
  id: string;
  componentId: string;           // catalog id
  variant: string;
  props: Record<string, string | number | boolean>;
  textOverrides?: Record<string, string>;
  slots?: Record<string, RenderNode[]>;
  motion?: MotionBinding;
};

type MotionBinding = {
  enter?: MotionPreset;
  exit?: MotionPreset;
  hover?: MotionPreset;
  press?: MotionPreset;
  focus?: MotionPreset;
};

type TokenSet = Record<
  string,
  { value: string | number; type: "color" | "number" | "string"; ref?: string }
>;

type AssetRef = {
  id: string;
  kind: "icon" | "illustration" | "image" | "poster";
  origin: "library" | "ai-vector" | "ai-raster" | "upload" | "placeholder";
  files: Array<{ path: string; format: string; scale?: number }>;
  hash?: string;
  license?: string;
  review?: { status: "candidate" | "approved" | "rejected"; reviewer?: string };
};

type MotionPreset =
  | "page-enter"
  | "page-exit"
  | "list-stagger"
  | "card-hover"
  | "button-press"
  | "input-focus"
  | "skeleton-shimmer"
  | "empty-fade"
  | "modal-enter"
  | "modal-exit"
  | "toast-enter";

type Annotation = {
  id: string;
  targetId: string;
  kind: "req" | "asset" | "interaction" | "motion" | "state";
  text: string;
};
```

### 3.2 约束

- 只允许 token 引用；禁止原始颜色/尺寸/圆角/阴影。
- `instance` 必须携带 `label`/`textOverrides`；Figma 渲染器必须覆盖组件内文字（修复本轮“按钮=按钮”问题）。
- 图片必须有 `assetRef` 或 `placeholderToken`；占位统一由 token 决定（修复粉色占位问题）。
- `frame.sizing.grow` 用于底部导航/内容填充（修复 BottomNav 不贴底）。
- `columns` 用于表格列宽/拉伸（修复表头/数据列不对齐）。
- `stroke`/`radius` 用于行分隔线与卡片圆角。
- 每个站点/页面状态生成独立 `states` 树；HTML 用 query 切换，Figma 生成独立 Frame。
- 所有内容来自 Content Model；RenderPlan 不生成文案。

### 3.3 契约测试

- RenderPlan schema 校验；
- 所有 token 能解析；
- 所有 assetRef 在 manifest 中存在；
- 无原始色值/尺寸；
- 每个 state 树包含必需区域；
- HTML/Figma 两端对同一 plan 的节点数量/关键属性一致（runtime 断言）。

## 4. Content Model（内容细化）

### 4.1 UI Brief 扩展

```ts
type PageContent = {
  list?: {
    rows: Array<Record<string, string>>;      // 5–10 行真实结构数据
    total?: number;
    filterOptions?: Record<string, string[]>;
  };
  feed?: {
    items: Array<{ title: string; body: string; imageRef?: string; meta?: string }>;
  };
  detail?: {
    summary?: string;
    badge?: string;
    values: Record<string, string>;
  };
  form?: {
    values?: Record<string, string>;
    placeholders?: Record<string, string>;
    helpText?: Record<string, string>;
  };
  settings?: {
    groups: Array<{
      title: string;
      fields: Array<{ key: string; label: string; value: string; options?: string[] }>;
    }>;
  };
  overview?: {
    stats: Array<{ label: string; value: string; trend?: string }>;
    recent?: Array<{ title: string; meta: string }>;
  };
  auth?: { title: string; subtitle?: string; links?: string[] };
  onboarding?: { steps: Array<{ title: string; body: string }> };
  states?: {
    empty?: { title: string; description?: string };
    loading?: { title?: string };
    error?: { title: string; description?: string };
  };
};
```

- `UiBriefPage.content?: PageContent`。
- 缺省时由 deterministic fixture 生成：从 `data.entities` + 领域词表生成结构化数据；禁止 lorem ipsum。
- 每页必须能渲染 5–10 条列表数据/2–3 条 Feed/完整详情字段；不足时内容校验报 blocker（高保真模式）。
- 状态文案与 `emptyTitle`/`emptyAssetRef` 合并；`empty` 文案优先取 `content.states.empty`，否则用 `emptyTitle`，再否则用 `暂无${page.name}`。

### 4.2 内容校验

新增 `CONTENT-*` 规则（高保真模式 blocker）：

- `CONTENT-MISSING`：页面无 content/fixture 且 archetype 需要内容；
- `CONTENT-ROW-COUNT`：列表行数 < 5；
- `CONTENT-FIELD-MISMATCH`：content key 不在 page.fields/data.entities；
- `CONTENT-PLACEHOLDER`：出现 lorem/示例 1/TODO 等占位；
- `CONTENT-STATE`：缺少 empty/loading/error 文案（由 archetype 决定）；
- `CONTENT-PII`：检测到疑似真实 PII（手机号/邮箱/身份证），仅警告并要求替换为合成数据。

### 4.3 sample 与真实切片

- 更新 `samples/ui-brief.sample.json`：8 页全部有细化 content；demo-crm 同步。
- 真实切片：1 个真实 PRD 的 1–2 页；输入依赖见 §13；未提供时 1C.1 用 sample 验收，1C.3 的真实切片验收顺延。

## 5. 设计系统扩容

### 5.1 Tokens

在现有 Profile 基础上增加/补全：

- `color`: 语义色（surface/text/border/accent/success/warning/danger/info）+ 状态色（hover/pressed/disabled/focus）+ 对比度配对；
- `type`: family/weight/size/lineHeight/letterSpacing；B/C 两套字阶；
- `space`: 4/8/12/16/24/32/48/64；
- `radius`: sm/md/lg/full；
- `border`: width/color；
- `shadow`: sm/md/lg；
- `opacity`；
- `motion`: duration fast/base/slow、easing standard/emphasized、distance、stagger；
- `breakpoints`/`grid`: web 1440 12 列 / mobile 390 4 列；
- `icon`: 24px 网格、1.5px stroke、圆角/端点、currentColor；
- `illustration`: 风格包、色板、场景清单。

### 5.2 Components

在现有 20 组件 catalog 上补全 variants/states：

- Button（primary/secondary/ghost/danger；default/hover/pressed/disabled/focus）；
- Input/Select/FormField（default/focus/error/disabled/readonly）；
- DataTable（header/row/stripe/empty/loading/error；列宽策略）；
- Card/FeedCard/Badge/Stat；
- PageShell/Sidebar/Header/Nav/BottomNav；
- EmptyState/Skeleton/ErrorState；
- Modal/Drawer/Toast/Accordion（若页面使用）。

每个组件定义：props schema、variants、states、slots、HTML 映射、Figma 组件名/变体名、动效契约。

### 5.3 图标与插画

- 标准 UI 图标：Lucide/Tabler/Iconify 锁定家族；24px/1.5px/currentColor；SVG + sprite。
- 自定义图标：AI 原生矢量草稿（见 §7）；必须过规范化/校验/人工审校；与标准图标并排一致性检查。
- 插画：8–12 个场景风格包；AI 图像允许；无 UI 文字/图标/按钮；@2x/@3x。
- 海报：1–2 张；AI 图像层 + 确定性文字/logo/截图。

### 5.4 多项目/多品牌基线策略

基线不是“每个项目重新生成一套”，而是**全局稳定、项目级选择/冻结**。

| 层 | 行为 |
|---|---|
| 全局基线库 | `b-dense` / `c-expressive` 版本化、跨项目稳定；作为 fallback，不随项目变化 |
| 项目选择 | UI Brief/项目配置声明 page profile；机器解析现有 profile；未知 profile 直接失败，不静默替换 |
| 项目快照 | 每个项目冻结 `design-system/snapshot.json`（mode/source/version/hash）；项目内所有页面只引用该快照 |
| 真实系统接入 | `mode=import` / `hybrid`：adapter 接入 Figma 库/tokens/代码/文档；缺口用基线并标 `baseline`/`generated` |
| 派生候选（可选） | `mode=derive`：从品牌资产/参考图生成候选 tokens/风格；必须人工签核后冻结，不能自动生效 |

规则：

- 一个产品面只用一个设计系统；同一页面禁止混用两套。
- 新项目默认必须显式选择 profile；没有匹配的 profile 时，先创建/接入，不允许机器悄悄生成。
- 机器可以“提议”新 baseline/风格（从品牌色/logo/参考图推导），但不能“决定”品牌身份；`derive` 必须走人工签核。
- 项目快照随项目版本化；换项目不会改变其他项目的基线。
- 跨项目复用同一 baseline 时，基线升级需要显式 migration，不自动传播。

示例：

- 项目 A（demo-orders）：`mode=baseline`，`profile=b-dense`。
- 项目 B（品牌 X 有 Figma 库）：`mode=import`，`snapshot=brand-x@1.0`，基线只补缺口。
- 项目 C（无品牌资产）：显式选择 `b-dense` / `c-expressive`；或用 `mode=derive` 生成候选，人工签核后冻结。

**1C.1 新增 `b-mobile` profile**：真实切片是移动端 B 端员工小程序，而现有 `b-dense` 是 Web B 端、`c-expressive` 是移动 C 端。`b-mobile` 复用 b-dense 的语义色/字阶，增加移动布局与组件（TopBar/TabBar/Card/ListRow/Badge/NumericBlock/BottomActionBar/CollapsedFilter 等），不是新品牌系统。移动 B 端页面必须用 `b-mobile`，不能用 `b-dense` 直接编译（缺 MobileShell）。

## 6. HTML Renderer 与动效

### 6.1 渲染

- React + Vite + TypeScript；组件注册表按 catalog ID 映射。
- Token → CSS variables；状态通过 query（`?state=empty|loading|error`）切换。
- 路由：每页一个 route；页面间导航可用；hash 路由便于离线。
- Content 来自 RenderPlan；不硬编码文案。
- 响应式：web 1440、mobile 390；CSS Grid/Flex；无绝对定位（除设计系统允许的覆盖层）。
- 构建输出：`out/html/` 静态站点；相对路径；可离线打开。

### 6.2 动效预设

| 预设 | 用途 | 实现 |
|---|---|---|
| `page-enter` / `page-exit` | 页面转场 | fade/slide + opacity |
| `list-stagger` | 列表项进入 | stagger 40–60ms |
| `card-hover` | 卡片 hover | translateY(-2px)+shadow |
| `button-press` | 按钮按下 | scale(0.98) |
| `input-focus` | 输入焦点 | border/ring transition |
| `skeleton-shimmer` | 加载骨架 | gradient shimmer |
| `empty-fade` | 空态进入 | fade+scale |
| `modal-enter` / `modal-exit` | 弹层/抽屉 | fade+slide |
| `toast-enter` | Toast | slide+fade |

- 使用 Framer Motion；token 控制 duration/easing；`prefers-reduced-motion` 时降级为无动画/淡入。
- 禁止无限循环、阻塞关键操作、过度弹跳。
- Motion Lab 页：集中展示预设，便于评审。

### 6.3 交互

- 列表：筛选/排序/分页/空态切换；
- 表单：输入、焦点、错误、禁用、提交反馈（前端 mock）；
- 详情：字段展示、状态 badge、操作按钮；
- 设置：分组、开关/选择、保存反馈；
- Auth/onboarding：表单/步骤/切换；
- Feed：卡片、滚动、下拉/加载更多（mock）；
- 页面导航：侧边栏/底部导航/返回。

### 6.4 可访问性

- 语义化 landmark、label、alt；
- 键盘可达、focus-visible；
- 对比度 AA；
- reduced-motion；
- 移动视口无横向溢出。

## 7. Figma Renderer

### 7.1 文件结构

每个项目/版本一个 Figma 文件（或页面组）：

```text
00 Foundations
  - Color variables
  - Type styles
  - Spacing/radius/shadow/motion 说明
  - Icon grid / icon set
01 Components
  - Button / Input / Select / FormField / DataTable / Card / FeedCard / Badge / Stat
  - PageShell / Sidebar / Header / Nav / BottomNav
  - EmptyState / Skeleton / ErrorState
  - Modal / Drawer / Toast / Accordion（按需）
02 Pages
  - <pageId> / Web 1440×900 / Default | Empty | Loading | Error
  - <pageId> / Mobile 390×844 / Default | Empty | Loading | Error
03 Handoff
  - 页面清单、组件映射、资产清单、已知偏差、签核记录
```

### 7.2 构建规则

- 变量集合：color/spacing/radius；文本样式：heading/body/label；效果样式：shadow。
- 组件集：变体 + 状态；实例带文字覆盖（`label`/`textOverrides`）、图标覆盖、资产填充。
- Auto Layout：正确的 fixed/hug/fill；`layoutGrow` 用于底部导航/内容填充；表格列宽/拉伸；行 stroke；卡片圆角。
- 图片：真实资产或统一中性占位；禁止随机颜色/1×1 拉伸图。
- 标注：reqRef、assetRef、交互/动效说明、状态说明；组件描述与代码映射。
- 原型：v1 不做 Figma 原型连线/Smart Animate；交付静态状态帧 + 动效标注；HTML 承载动效（沿用总体设计非目标 #6）。
- 幂等：构建前清理同名页面/变量/文本样式/组件集；失败回滚/隔离；桥接预检。
- runtime JSON：回读节点树（id/name/type/位置/尺寸/填充/描边/圆角/文字/组件变体），供视觉门禁断言。
- 导出：页面 PNG（每页×状态×视口）、图标 SVG、插画/图片 PNG @2x/@3x、海报导出。

### 7.3 桥接

- `spike/scripts/figma-bridge.mjs` 的思路保留，正式版放在 `pipeline/packages/renderer-figma/bridge/`。
- 预检：Figma 桌面版、插件已导入、字体可用、文件可写、端口可用。
- 执行：清理 → 构建 → 回读 → 导出 → 报告。
- 失败降级：输出 `figma-plan + 操作说明`，HTML/资产仍交付；Figma 标记 degraded。

## 8. Asset Compiler 与 AI 资产

### 8.1 模式

| 模式 | 用途 | 规则 |
|---|---|---|
| `library` | 标准 UI 图标 | Lucide/Tabler/Iconify；默认路径 |
| `ai-vector` | 自定义/品牌图标草稿 | 原生矢量；SVGO/网格/线宽/currentColor 校验；人工审校 |
| `ai-raster` | 插画/海报图像层 | 无 UI 文字/logo/按钮；风格包/seed/参考图；人工审校 |
| `upload` | 用户提供的资产 | 校验格式/尺寸/授权 |
| `placeholder` | 缺失资产 | 统一中性占位；manifest 标 `unresolved`；最终门禁阻断 |

### 8.2 流程

```text
声明 → 选型 → 生成/获取 → 规范化 → 校验 → 人工审校 → 冻结 → 导出
```

- 规范化：SVGO、viewBox、currentColor、命名、路径精度；
- 校验：格式/尺寸/网格/线宽/圆角/端点/对比度/文字/SVG 安全；
- 审校：自定义图标/插画/海报由用户/设计负责人签核；标准图标库不逐项审；
- 冻结：manifest + hash + 来源/授权 + 版本；未冻结不进 handoff。

### 8.3 Manifest 扩展

```json
{
  "id": "icon-custom-report",
  "kind": "icon",
  "origin": "ai-vector",
  "tool": "recraft",
  "model": "v4.1-vector",
  "prompt": "...",
  "seed": 12345,
  "referenceAssets": ["..."],
  "humanEdits": ["normalized viewBox", "redrew 2 paths"],
  "license": "commercial",
  "review": { "status": "approved", "reviewer": "design-owner", "date": "2026-10-19" },
  "files": [{ "path": "assets/icons/report.svg", "format": "svg" }],
  "hash": "sha256:..."
}
```

### 8.4 AI 准入规则

- 标准 UI 图标：**禁止** AI 位图；标准图标库优先。
- 自定义/品牌图标：允许 AI 原生矢量草稿；必须过 §8.2 校验与人工审校。
- 插画：允许 AI；无 UI 文字/图标/按钮；风格包/seed/参考图；人工审校。
- 海报：AI 只出图像层；文字/logo/产品截图确定性叠加；中文逐字校对；印刷规格检查。
- 禁止 AI 重绘产品截图/logo；禁止用 AI 位图直接当图标；禁止把品牌文字烘焙进位图。
- 来源/授权/人类贡献记录齐全；详见 AI 调研备忘录 §5、§6。

### 8.5 切图

- 图标：单 SVG + sprite；24px 网格；currentColor。
- 插画：PNG/WebP @2x/@3x；透明底/裁切。
- 图片：按用途裁剪；@1x/@2x/@3x；WebP/PNG；本地化。
- 海报：PNG/PDF；CMYK/出血按印刷需求；文字层可编辑（Figma/HTML 源）。
- 页面截图：每页×状态×视口 PNG。
- `LICENSES.md`：字体、图标库、插画、图片、AI 工具条款。

## 9. 视觉门禁

### 9.1 检查层次

1. **Runtime 断言（优先）**：从 Figma runtime JSON 断言关键结构：
   - Button 实例文字 == RenderPlan `label`；
   - BottomNav `y + height == viewport.height`；
   - DataTable 表头/数据列 x 坐标对齐；
   - FeedCard/卡片 `cornerRadius == radius.md`；
   - 行 stroke 存在；
   - IMAGE 填充是资产或中性占位，不是随机色；
   - 组件变体/状态正确。
2. **截图 diff**：HTML 截图 vs Figma PNG，逐页/状态/视口；
   - `pixelmatch` threshold 0.1；
   - 初始阈值：差异像素 ≤1.5%（基线建立后校准）；
   - 输出并排图 + diff 图 + JSON 报告；
   - 文字区域不默认遮罩；字体差异只能走 waiver。
3. **资产/AI 断言**：
   - 所有引用资产存在、hash 匹配；
   - 无 `unresolved` 占位进入最终 handoff；
   - AI 资产有 model/prompt/seed/license/review；
   - 图标网格/线宽/currentColor 合规；
   - 海报文字层为确定性文本、logo/截图真实。
4. **a11y 断言**：对比度、焦点、键盘、reduced-motion。
5. **人工签核**：每页检查表 + reviewer/date；waiver 需 owner/理由/有效期。

### 9.2 输出

```text
reports/visual/
  <pageId>-<state>-<viewport>.json
  <pageId>-<state>-<viewport>.diff.png
  <pageId>-<state>-<viewport>.side-by-side.png
reports/visual-report.html
reports/a11y.json
reports/ai-provenance.json
reports/signoff.md
```

### 9.3 门禁行为

- 任一 runtime 断言失败 → fail；
- diff 超阈值且无 waiver → fail；
- 资产未解析/AI 未签核 → fail；
- a11y blocker（文字/控件对比度低于 AA、键盘不可达、表单控件缺 label、动效无 reduced-motion 降级）→ fail；a11y major（landmark/标题层级等最佳实践）报告但不单独阻断；
- Figma 桥接不可用 → degraded，HTML/资产仍交付，但 handoff 标记 Figma 未完成；
- 所有 fail 都必须在报告中给出可复现证据。

## 10. Handoff 交付包

```text
handoff/<project>/<version>/
  HANDOFF.md
  LICENSES.md
  design/
    figma-link.md            # file key + version + node map
    screenshots/             # 每页×状态×视口
    runtime/                 # figma-runtime.json
  prototype/                 # 静态 HTML 构建，可离线打开
  assets/
    icons/                   # SVG + sprite
    illustrations/           # @2x/@3x
    images/                  # @1x/@2x/@3x
    posters/                 # 1–2 张
    manifest.json            # id/path/format/scale/hash/license/origin/review
  specs/
    page-spec/               # Page Spec JSON
    tokens.json              # 设计 token
    content.json             # 细化内容
    motion-spec.md           # 预设/时长/缓动/reduced-motion
    component-map.json       # Figma ↔ catalog ↔ HTML/code
    a11y.md
  reports/
    validation.json
    visual/
    a11y.json
    ai-provenance.json
    signoff.md
    waivers.json
```

`HANDOFF.md` 必须让开发独立实现：页面清单、状态、组件映射、tokens、资产、交互/动效、响应式、已知偏差、签核。

## 11. 阶段与退出标准

### 1C.1 · RenderPlan + 设计系统扩容 + 内容 + HTML/动效 + AI 评测

- RenderPlan 包 + 契约测试；
- **首版顺序 B 端优先**：先做 `orders-list` + `order-detail` 垂直切片（覆盖表格/筛选/空态/详情/操作），看到实物后再铺 `orders-overview`/`order-form`/`settings`，最后 C 端；
- **真实切片**：员工端微信小程序（移动 B 端）`今日` + `库存查询`，需先补 `b-mobile` profile；`客户详情` 作为第三页；开单/调拨/欠款暂不进首版；
- Profile tokens 扩容（颜色/字阶/间距/圆角/边框/阴影/动效）；
- Content Model + 8 页细化 content + demo-crm；
- HTML Renderer + 标准动效预设 + Motion Lab；
- 8 页 default/empty/loading/error 截图基线；
- AI 工具评测：8 个标准风格图标 + 2 个品牌图标 + 1 张中文海报 brief；Recraft vs Firefly 评分（可编辑性/一致性/网格/文字/授权）+ 建议。

**退出**：8 页 HTML 原型可打开、可导航、有动效、有细化内容；截图基线；AI 评测报告；`pnpm test` / `typecheck` 通过。

### 1C.2 · Figma Renderer

- Foundations/Components/Pages 生成；
- variables/text/effect styles、component sets/instances、text overrides；
- 表格列宽/行 stroke、卡片圆角、BottomNav 贴底；
- 资产填充（真实/中性占位）；
- runtime JSON 回读 + 结构断言；
- PNG/资产导出；
- AI 评测通过的自定义图标以冻结 SVG 进入组件/页面。

**退出**：Figma 页面/状态生成；runtime 断言通过；与 HTML 截图对比报告；已知偏差清单。

### 1C.3 · Asset Compiler + 视觉门禁 + Handoff + 海报 + 真实切片

- Asset Compiler 全模式；manifest + hash + license/provenance；
- 视觉门禁（runtime + diff + 资产/AI + a11y + 签核）；
- Handoff 包 + HANDOFF.md + LICENSES.md；
- 1–2 张海报（AI 图像层 + 确定性文字/logo/截图；中文校对；印刷规格）；
- 真实切片 1–2 页跑通；
- 用户视觉签核。

**退出**：全部 DoD 满足；用户签核；真实切片与 sample 均通过。

## 12. 测试策略

- **单元**：RenderPlan 编译、content fixture/校验、SVG 规范化、token 映射、motion preset。
- **契约**：schema、token 解析、assetRef 存在、无原始值、state 完整。
- **Golden**：HTML 截图、Figma runtime JSON 快照。
- **视觉**：runtime 断言 + 截图 diff（阈值/waiver）。
- **资产**：SVG 安全/网格/线宽/currentColor、图片倍率/格式/hash、AI 来源。
- **A11y**：axe-core、对比度、键盘、reduced-motion。
- **E2E**：8 页导航/状态/交互；真实切片。
- **人工**：每页视觉检查表 + 签核。

## 13. 输入依赖与开放项

- **真实切片**：员工端微信小程序 PRD 已提供（`/Users/jihui/Desktop/产品资料总库/01-产品需求与原型/拆分小程序prd`）；首版 `今日` + `库存查询`，需先补 `b-mobile` profile；`客户详情` 第三页。仍需：品牌色/语义色 hex、字体、图标风格（面性）、目标视口（390×844 或 375×812）、客户手机号口径（PRD 内部冲突）、是否只用示例内容。
- **AI 工具账号/授权**：Recraft/Firefly 试用或企业账号；评测前确认商用条款。
- **海报需求**：主题、尺寸、是否印刷（CMYK/出血）、品牌素材；1C.3 前提供。
- **品牌手册/参考图**：后续 adapter 接入；当前用基线 + sample。
- **字体**：Noto Sans SC / PingFang SC；确认许可；Figma/浏览器一致。
- **Figma 桌面版 + 桥接**：构建/导出时需人工打开文件并运行插件。
- **内容细化样例**：字段级样例与业务词表；1C.1 前提供。

## 14. 风险

- 详见 `2026-10-19-phase-1c-renderer-risks.md`（R1–R22）。
- AI 资产专项：`2026-10-19-ai-asset-generation-research.md`（AI-01–AI-14）。
- Top：R1 视觉基准、R2 设计系统输入、R10 范围、R20 海报、R19/R5 AI 图标与内容。
- 不建议承诺：像素级 100%、无设计系统输入下的品牌级高保真、Figma 内完整动效、一次性全量交付。

## 15. 非目标（1C）

- 生产代码直出；
- Figma 双向同步/手动改稿回收；
- Figma 原型连线/Smart Animate（动效由 HTML 承载）；
- 任意页面/任意品牌；
- 多人在线协作/云端队列；
- 生成式图片默认开启（AI 资产需显式选择/审校）；
- 用 AI 位图直接当图标或烘焙品牌文字/logo/截图。
