# PRD → 双端 UI 交付管线 · 设计文档

> 日期：2026-10-19
> 状态：Phase 1 + Phase 2 切片已实现（2026-10-22，v0.4 动效/视觉回归验收完成）；Phase 3/4 待做。实现状态见 §14.1。
> 路线：A（语义编译 + 多端渲染）
> 工作目录：`/Users/jihui/Desktop/产品、ui`

---

## 0. 摘要

把 PRD 编译成受约束的 **Page Spec**，再由确定性渲染器产出三类交付物：

1. 可点击、可切换状态的 **React HTML 原型**；
2. 可编辑的 **原生 Figma 源文件**（图层、Auto Layout、变量、组件实例）；
3. 可直接交付开发的 **切图 + 规格 + 校验报告**。

AI 只写规格和内容，不写像素。布局、组件、颜色、字号、间距、图标网格全部由设计系统、组件契约和渲染器决定；所有产物先经过校验与沙箱测试，通过后才进入交付目录。

### 关键决策

| 决策 | 结论 |
|---|---|
| 技术路线 | A：语义编译 + 多端渲染 |
| 唯一事实源 | PRD → UI Brief → Page Spec；HTML / Figma / 切图都是派生物 |
| 组件库 | 项目级接入现有系统（代码 / Figma / tokens / 文档 / 截图），可后补；缺口用基线（`b-dense` / `c-expressive`）补齐；共享语义 ID 注册表 |
| 工作台 UI | 内部工具使用现有 `ui-design-system`（shadcn/ui + Tailwind v4），不复用产品库 |
| 版本控制 | 源文件进 Git；运行/生成物按 run/handoff 版本；Figma 用 file key + version 链接 |
| 项目数据仓库 | 首版独立项目目录 `projects/<project>/`，不与产品代码共用；handoff 只打 tag；后续可迁移 |
| 产品面与系统 | 一个产品面只用一个设计系统/库；同一页面禁止混用 |
| PRD 质量 | 前置独立 PRD Review Gate + 人工签核 |
| 编排 | 确定性状态机 + 专职 Agent；不使用 LLM 编排器 |
| 容错 | 规则路由 + 预算 + 断点 + 分层降级 + 部分成功 |
| 质量验证 | Verification Sandbox（HTML / Figma / Asset / Spec）+ 测试 Subagent |
| 首版范围 | 1 个真实 PRD、6–8 页、Web + 移动端，垂直切片 |

### 已评估但未采用的方案

| 方案 | 未采用原因 |
|---|---|
| 单 Agent 串行完成所有阶段 | 上下文膨胀、自评偏差、职责不清、难定位错误 |
| LLM 编排器动态决策 | 路由不可预测、可能跳门禁、难复现、成本高 |
| 群聊 / 蜂群式多 Agent | 易循环、漂移、互相污染、不可审计 |
| B/C 共用一套 Catalog + 两套 Profile | 用户明确选择两套独立库，便于后期单独优化 |
| Figma-first（Plumb Design DSL） | DSL 偏落地页，App 后台页型需要大量扩展；HTML 质量有限 |
| HTML-first 后再补 Figma | 首版无法验证完整交付，二期容易漂移 |
| 直接依赖 json-render 作为渲染器 | 需要双库、布局原语、token-only、状态矩阵等扩展，自研注册表更可控 |
| 直接采用 Plumb / mcp-figma 插件 | 作为参考与备选；核心 Figma 插件自研，匹配自有 Page Spec |

---

## 1. 背景与问题

### 1.1 现状

- AI 可以生成 PRD（Markdown），也能直接生成 UI，但结果存在四类问题：
  1. **格式混乱**：结构、层级、间距不统一；
  2. **错版严重**：溢出、重叠、断点错乱、状态缺失；
  3. **组件规范失效**：给了规范文档，模型仍自行发明组件和样式；
  4. **图标和图片不可用**：图标不可编辑、不统一、无法切图；图片含文字、风格不一致。
- 已有资产：
  - `design-agent`：token、确定性渲染、校验门禁、图标网格、Studio 工作台；
  - `prd-prototype-rules v1.9`：PRD 规则抽取 + 原型标注层；
  - `ui-design-system`：B 端 shadcn 风格的组件纪律。
- 调研结论：GitHub 上没有端到端覆盖「PRD → HTML + Figma + 切图」的开源方案；现有项目可复用外围能力，但核心的「PRD → 双端语义规格」需要自建。

### 1.2 根因

1. 让模型直接产出像素，质量取决于采样运气；
2. 组件规范是**文档**，不是可执行、可校验的契约；
3. 缺少布局、状态、资产、追溯的机器校验；
4. PRD 本身常缺页面清单、状态矩阵、字段级规则、权限矩阵；
5. HTML、Figma、切图三份产物各自维护，必然漂移。

### 1.3 解决思路

把链路拆成三层，并让每层可校验：

- **语义层**：PRD Review、UI Brief、Page Spec；
- **渲染层**：HTML、Figma；
- **资产层**：图标、插画、图片、切图。

AI 只负责语义层的理解、抽取、编译和修复；渲染层与资产层由确定性代码完成。

---

## 2. 目标与非目标

### 2.1 目标

1. 输入任意 Markdown PRD，自动抽取 UI Brief，并列出缺口向人追问；
2. 生成 Web + 移动端的高保真、可点击 HTML 原型；
3. 生成原生、可编辑的 Figma 源文件，而不是截图或扁平图层；
4. 导出图标 SVG、插画/图片切图、页面截图、Page Spec、校验报告，可直接交付开发；
5. 优先复用现有 B/C 组件、令牌与规范；缺口用基线库补齐，并允许两套系统分别优化；
6. 错版、组件越界、状态缺失、资产缺失能在交付前被机器拦截；
7. 同一输入可重复生成等价结果，变更影响范围可计算。

### 2.2 非目标

1. 不直接生成生产级前端代码（React/Vue/小程序代码导出是后续可选项）；
2. 不做 Figma 手动改稿的**双向同步**（v1 单向：Spec → Figma）；
3. 不覆盖任意页面类型；首版只覆盖 8 类页面原型；
4. 不做原创 IP 插画的全自动生产（IP 走显式管线，人工审校）；
5. 不做多人在线协作、云端任务队列、账号体系；
6. 不做 Figma 原型连线与 Smart Animate；Figma 交付静态状态帧，交互由 HTML 原型承载；
7. 不替代产品决策；PRD 的业务正确性由人签核。

---

## 3. 核心原则

1. **AI 不写像素**：Agent 只产出结构化规格；颜色、字号、间距、组件外观由设计系统决定。
2. **一份 Page Spec，多端派生**：HTML、Figma、切图都从同一份规格生成，不各自维护。
3. **组件规范可执行**：组件白名单、props schema、variants、states、slots、平台映射都是机器可校验的契约。
4. **布局用原语**：PageShell / Stack / Grid / Section / Columns；普通页面禁用自由绝对定位。
5. **校验优先于目检**：能机器判定的（溢出、重叠、对比度、token、状态、资产）不靠人眼；机器判不了的（视觉品味、业务正确性）交人。
6. **人在门禁上，不在流程里**：人只在 PRD 签核、Brief 确认、最终验收三个硬门禁介入；中间不打断。
7. **先隔离，再并行；先确定性，再模型**：沙箱隔离产物，确定性工具优先，LLM 只处理语义与主观判断。
8. **多套设计系统，一套语义 ID；一个产品面只用一个系统**：实现可以完全独立，但组件名、页面原型名、状态名必须共享，否则无法路由。

---

## 4. 总体架构

### 4.1 分层图

```
PRD.md
  │
  ├─ Intake（确定性解析）
  ├─ PRD Review Gate（确定性检查 + 独立 Reviewer + 人工签核）
  ▼
UI Brief（已确认的 UI 意图）
  │
  ├─ Design Profile（b-dense / c-expressive）
  ├─ Component Catalog（当前库的组件契约）
  ├─ Page Archetypes（页面原型）
  ▼
Page Spec（可执行设计契约）
  │
  ├─ Validators（schema / catalog / token / layout / state / asset / traceability）
  ├─ Spec Repair（最多 2 轮）
  ▼
  ├──────────────┬────────────────┬──────────────────┐
  ▼              ▼                ▼
HTML Renderer   Figma Renderer   Asset Compiler
(React/Vite)    (自研插件)        (图标/插画/切图)
  └──────────────┴────────────────┴──────────────────┘
                          │
                          ▼
                Verification Sandbox
                （HTML / Figma / Asset / Spec）
                          │
                          ▼
                   Handoff Packager
```

### 4.2 模块边界

| 模块 | 单一职责 | 输入 → 输出 |
|---|---|---|
| `prd-review` | 判断 PRD 是否 UI-ready | PRD + review config → findings + 报告 + readiness |
| `ui-brief` | 把 PRD 解析成已确认的 UI 意图 | PRD + 人工回答 → UI Brief |
| `page-spec` | 把 UI Brief 编译成可执行规格 | UI Brief + Profile + Catalog → Page Spec |
| `design-system` | 提供两套库的 tokens、组件契约、页面原型、风格包 | 版本化配置 → profile/catalog/archetypes |
| `validators` | 纯函数校验，不生成内容 | 任意 spec → findings |
| `render-html` | 把 spec 渲染成可点击原型 | Page Spec → React/Vite 站点 |
| `render-figma` | 把 spec 渲染成原生 Figma 图层 | Page Spec + figma-plan → Figma 节点映射 |
| `assets` | 图标、插画、图片槽、切图 | Asset 声明 + style pack → manifest + 文件 |
| `sandbox` | 隔离执行与测试 | 构建产物 + 测试计划 → test findings + 证据 |
| `studio` | 编排、预览、确认、导出 | 上述模块 → 本地工作台 |
| `handoff` | 打包交付物 | 全部产物 → 交付目录 + HANDOFF.md |

每个模块都有明确输入输出，可以单独测试；渲染器不承担业务判断，校验器不生成内容。

### 4.3 事实源层级

1. **PRD**：业务意图的事实源，不是 UI 的事实源。
2. **UI Brief**：已确认的 UI 意图事实源；所有歧义在这里解决，不带到渲染阶段。
3. **Page Spec**：可执行的设计契约；HTML、Figma、切图都是它的派生物。
4. **Design Profile / Component Catalog / Page Archetypes**：版本化依赖。
5. **Asset Manifest**：资产的事实源；渲染器只引用 manifest 中的 asset ID。

### 4.4 派生与回写规则

- **派生物不回写**：改设计只能改 Page Spec；不能手改 HTML/Figma 再反向同步。
- **Figma 手动改稿**：v1 不回收。需要变更时，改 Page Spec 后重新构建；手工改动记录为 `known deviation`。
- **资产变更**：更新 Manifest 后重新渲染；缺资产会阻断最终交付。
- **版本化**：UI Brief、Page Spec、Profile、Catalog、Manifest 都带版本号和内容 hash；可回退、可复现。

---

## 5. 数据契约

### 5.1 PRD Review Contract

评审范围限定为 **UI-ready**，不是完整技术设计文档。

```yaml
scope: ui-ready
out_of_scope:
  - technical_architecture
  - pricing_strategy
  - visual_style
required_sections:
  - business_scope
  - roles_permissions
  - page_inventory
  - state_matrix
  - field_tables
  - acceptance_examples
severity:
  blocker:
    - missing_page_inventory
    - missing_state_matrix
    - unresolved_placeholder
    - role_permission_undefined
    - business_rule_without_example
  major:
    - missing_field_table
    - missing_flow
    - inconsistent_terminology
    - missing_empty_state
    - missing_error_state
  minor:
    - missing_example
    - formatting_inconsistency
    - redundant_section
budgets:
  max_questions_per_round: 10
  max_rounds: 3
evidence: required
confidence_threshold: 0.7
signoff:
  business_rules: product_owner
  permissions: security_owner
  data_definitions: data_owner
  visual_defaults: design_owner
waivers:
  allowed: true
  require_reason: true
  require_expiry: true
```

Finding 结构：

```json
{
  "id": "F-001",
  "ruleId": "IA-PAGE-INVENTORY",
  "severity": "blocker",
  "category": "information_architecture",
  "location": "## 3. 功能清单",
  "evidence": "未提供页面清单与导航层级",
  "issue": "无法确定页面边界和角色视图",
  "suggestedQuestion": "订单模块包含哪些页面？谁可以访问？",
  "owner": "product_owner",
  "confidence": 0.92
}
```

约束：

- 每条 blocker 必须有 `location + evidence`，或明确写「缺失」；
- 置信度低于阈值只能作为 `question`，不能作为 blocker；
- Reviewer 不替作者补需求，只提问、标记、给建议；
- `evidence` 必须可复现：原文引用或缺失声明；
- `owner` 必须映射到签核角色。

产物：`prd-review.md`、`findings.json`、`readiness.json`、`decision-log.md`、`signoff.yaml`。

### 5.2 UI Brief

UI Brief 是「已确认的 UI 意图」，不是 PRD 的摘要。字段：

| 区块 | 字段 | 说明 |
|---|---|---|
| meta | project、version、sourcePrdHash、date、profile、platforms | 追溯与版本 |
| product | name、type、goals、users、roles、permissions、scope、nonGoals、successMetrics | 业务上下文 |
| ia | surfaces、pages、navigation、flows | 页面清单、导航、流程 |
| pages | id、name、purpose、archetype、entryPoints、routes、roles、requiredStates、reqRefs | 每页的用途与约束 |
| data | entities、fields、enums、validation、mockDataRules | 字段、口径、示例数据 |
| assets | icons、illustrations、images | 资产语义清单 |
| designDirection | profile、brandAssets、references、density、tone、motionLevel | 视觉方向 |
| openQuestions | id、question、options、impact、owner、blocking | 未决问题 |
| assumptions | id、statement、source、confidence、acceptedBy | 显式假设 |
| traceability | reqMap、unmapped | 需求追溯 |

规则：

- 每个页面必须有 `purpose`、`archetype`、`requiredStates`、`reqRefs`；
- 每个角色必须有页面/操作可见性矩阵；
- 每个核心实体必须有字段表；
- 阻塞性问题未清零，不得进入 Page Spec 编译；
- 非阻塞问题可以带假设进入编译，但必须写入 `assumptions` 和交付报告。

### 5.3 Design Profile

每套库一个 Profile，包含：

- **origin**：`imported` / `baseline` / `hybrid`，以及来源引用（代码 tokens、Figma variables、文档、截图）；
- **color**：语义色 + 原始色板；正文/次级文字对比度 ≥ 4.5:1；
- **typography**：`display / heading-1..3 / body / label / caption / numeric`，含字号、行高、字重、字距；
- **space**：4/8/12/16/24/32/48 等阶梯；
- **radius**：sm/md/lg/full；
- **shadow**：elevation 1–3；
- **motion**：duration（fast/normal/slow）、easing（standard/decelerate/accelerate/spring）、distance、stagger、reduced-motion 策略；
- **breakpoints**：sm/md/lg/xl；
- **zIndex**：base/dropdown/sticky/overlay/modal/toast；
- **iconStyle**：网格、线宽、端点、圆角、光学尺寸、颜色规则；
- **illustrationStyle**：风格包、色板、参考图、提示词模板、seed、宽高比；
- **fontStrategy**：字体家族、回退、加载方式、中文排版规则。

Token 使用 DTCG 兼容格式；Page Spec 只能引用 token 名称，不能写原始值。有现成系统时，Profile 由接入生成，不是手写。

### 5.4 Component Catalog（现有系统优先）

有现成组件时，Catalog 由接入生成，不是手写清单。每个条目增加：

- `source`：`code` / `figma` / `baseline` / `generated`；
- `availability`：`available` / `code-only` / `figma-only` / `generated` / `missing`；
- `mapping`：`{ code?: ..., figma?: ... }`；
- `library`：现有系统名或基线名。

没有现成系统时，使用基线 `b-dense` / `c-expressive`。两套系统共享**语义 ID 注册表**（组件名、页面原型名、状态名、props 名）；实现、props 扩展和视觉可以独立。

每个组件的契约字段：

```json
{
  "id": "Button",
  "library": "b-dense",
  "source": "code",
  "availability": "available",
  "category": "action",
  "description": "触发操作",
  "props": {
    "label": { "type": "string", "required": true },
    "emphasis": { "enum": ["primary", "secondary", "ghost", "danger"] },
    "size": { "enum": ["sm", "md", "lg"] },
    "disabled": { "type": "boolean" },
    "loading": { "type": "boolean" },
    "icon": { "type": "iconRef" }
  },
  "variants": ["primary", "secondary", "ghost", "danger"],
  "states": ["default", "hover", "active", "focus", "disabled", "loading"],
  "slots": { "icon-left": { "allowed": ["Icon"] } },
  "motion": { "press": "scale.98", "duration": "motion.fast" },
  "a11y": { "role": "button", "keyboard": ["Enter", "Space"] },
  "mapping": { "code": "src/components/Button.tsx", "figma": "Button" },
  "rules": ["不可嵌套 Button", "同一区域 primary 最多一个"],
  "version": "0.1.0"
}
```

规则：

- 页面只能使用 Snapshot 中 `available` 的组件、props、variants；
- 组件缺失时，发起 catalog 扩展申请；不允许静默换库或用原始 HTML 顶替；
- 没有 mapping 的组件不能声称「原生还原」；
- 组件契约变更必须走版本号和迁移检查；
- 一个产品面只用一个系统；同一页面禁止混用。

### 5.5 Page Spec

Page Spec 是可执行的设计契约，只允许语义字段。

```json
{
  "meta": {
    "pageId": "orders-list",
    "name": "订单列表",
    "target": "web",
    "profile": "b-dense",
    "archetype": "list",
    "reqRefs": ["REQ-ORDER-001", "REQ-ORDER-002"],
    "version": "0.1.0"
  },
  "layout": {
    "type": "PageShell",
    "props": { "header": "page-header", "sidebar": "main-nav" },
    "children": [
      {
        "type": "Section",
        "props": { "padding": "space.6", "gap": "space.4" },
        "children": [
          { "type": "FilterBar", "props": { "fields": ["status", "date", "keyword"] } },
          {
            "type": "DataTable",
            "props": {
              "columns": ["orderNo", "customer", "amount", "status", "createdAt"],
              "pagination": { "pageSize": 20 },
              "rowActions": ["view", "cancel"]
            },
            "states": ["default", "empty", "loading", "error"]
          }
        ]
      }
    ]
  },
  "states": {
    "default": {},
    "empty": { "overrides": [{ "component": "DataTable", "state": "empty" }] },
    "loading": { "overrides": [{ "component": "DataTable", "state": "loading" }] },
    "error": { "overrides": [{ "component": "DataTable", "state": "error" }] }
  },
  "interactions": [
    { "trigger": "row.click", "action": "navigate", "target": "order-detail" },
    { "trigger": "filter.change", "action": "refetch" }
  ],
  "traceability": { "designDefaults": [], "unmapped": [] }
}
```

禁止字段：

- 原始颜色：`#hex`、`rgb()`、`hsl()`；
- 原始尺寸：`font-size`、`padding: 16px`、`border-radius: 8px`；
- 组件内部样式：`style`、`className`、CSS 字符串；
- 自由定位：`position: absolute`、任意 `top/left`（装饰槽除外）。

允许字段：

- `type` / `component` / `variant` / `props` / `slots`；
- layout 原语与 token 引用（`space.4`、`radius.md`）；
- `states` / `motion` / `textRole` / `assetRef`；
- `reqRef` / `designDefault`。

### 5.6 Asset Manifest

```json
{
  "project": "orders",
  "profile": "b-dense",
  "icons": {
    "search": {
      "library": "lucide",
      "style": "outline",
      "svg": "assets/icons/search.svg",
      "license": "ISC",
      "hash": "sha256:4f3c2a1b9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b"
    }
  },
  "illustrations": {
    "empty-orders": {
      "mode": "library",
      "stylePack": "c-soft",
      "files": [
        { "path": "assets/illustrations/empty-orders@2x.png", "scale": 2, "format": "png" }
      ],
      "license": "internal"
    }
  },
  "images": {},
  "placeholders": [],
  "complete": true
}
```

规则：

- 所有页面引用的 icon / illustration / image 必须出现在 manifest；
- `placeholders` 非空时，最终交付门禁阻断；
- 每个资产必须有来源、授权、hash；
- 图标必须有 SVG；插画至少 @2x；图片按用途提供裁剪。

### 5.7 Validation / Test Findings

```json
{
  "testId": "layout.overflow",
  "page": "orders-list",
  "state": "empty",
  "viewport": "390x844",
  "severity": "blocker",
  "expected": "无横向溢出",
  "actual": "scrollWidth 412 > 390",
  "evidence": {
    "screenshot": "sandbox/orders-list-empty-390.png",
    "selector": "[data-spec-id=orders-table]",
    "console": ""
  },
  "repro": "打开 /orders?state=empty，视口 390x844"
}
```

严重级别：

- `blocker`：阻断交付（溢出、重叠、缺资产、缺状态、组件越界、Figma 结构不符）；
- `major`：不阻断但必须修复或记录；
- `minor`：建议修复；
- `question`：需要人工确认。

### 5.8 追溯 ID

- 每条 PRD 需求分配 `REQ-<domain>-<number>`；
- UI Brief 的页面、字段、状态引用 `reqRefs`；
- Page Spec 的组件/区块引用 `reqRefs`；
- 追溯矩阵：`REQ → Page → Section → State → Field`；
- Page Spec 中无法追溯到 PRD 的元素，必须标记 `designDefault` 并说明理由；
- 交付包包含 `traceability.csv`。

---

## 6. 流水线阶段

### 6.0 项目设置（Project Setup）

项目创建时完成以下输入；除 PRD 外均可后补：

| 输入 | 何时需要 | 形式 | 缺失时 |
|---|---|---|---|
| PRD | 项目开始 | md 上传/路径 | 必填 |
| 目标端/平台 | 项目开始 | Web / 移动 / 双端 | 默认 Web |
| 设计系统来源 | 项目设置时选择，可后补 | baseline / import / hybrid | baseline |
| 代码库 | 接入时 | repo 路径、组件包、Storybook | 跳过 code adapter |
| Figma 库 | 接入时 | 文件/库链接、component keys | 跳过 figma adapter |
| Tokens | 接入时 | tokens.json / Tailwind / CSS variables | 从代码/Figma/文档推导 |
| 规范文档 | 接入时 | md / PDF / Notion | 用截图/默认规则 |
| 截图 | 接入时 | 目录/链接 | 无视觉基线 |
| 设计系统映射 | 接入时 | B/C 系统、首版组件/页面 | 人工确认 |

规则：

- 所有来源都是项目级配置，不硬编码到流水线；
- 可以后补/替换，重新接入后重新渲染；
- 缺失来源不阻塞：走基线/文档/截图，并记录 gap；
- 每次运行记录来源版本/hash。

### 6.1 Intake

- **输入**：Markdown PRD。
- **处理**：解析标题、表格、列表；建立章节索引；标记 `【】`、`TBD`、`待确认`、空章节；计算内容 hash。
- **输出**：规范化文档 + 占位符索引 + 资产/术语初筛。
- **失败**：文件不可读、编码错误、空文档 → 直接失败并提示。

### 6.2 PRD Review Gate

- **输入**：规范化 PRD + review config。
- **处理**：
  1. 确定性检查：占位符、空章节、表格缺列、术语重复；
  2. 独立 Reviewer：按清单评审完整性、一致性、可验收性；
  3. 复评：检查 findings 是否有证据、是否越界、severity 是否合理；
  4. 人工签核：按决策权矩阵分派。
- **输出**：findings + readiness + decision log + signoff。
- **门禁**：blocker 未清零或未获 waiver，不得进入 UI Brief。
- **失败**：Reviewer 不可用 → 人工评审表单；不接受自动通过。

### 6.3 UI Brief

- **输入**：PRD + 签核记录 + 设计方向（B/C、品牌资产、参考图）。
- **处理**：抽取页面清单、角色权限、状态、字段、流程、资产清单；生成阻塞/非阻塞问题；从品牌资产/参考截图提取风格覆盖（颜色、字体、圆角、密度），结果必须人工确认后才写入 profile overlay。
- **输出**：`ui-brief.json`、`questions.json`、`assumptions.json`。
- **门禁**：阻塞性问题清零；人工确认 Brief。
- **失败**：抽取不完整 → 生成结构化填空表单，不猜。

### 6.4 Page Spec 编译

- **输入**：UI Brief + 当前库 Profile + Catalog + Archetypes。
- **处理**：
  1. 选择页面原型（list/detail/form/settings/overview/feed/auth/onboarding）；
  2. 用布局原语搭结构；
  3. 从 catalog 选组件、props、variants；
  4. 绑定 token、textRole、assetRef；
  5. 生成状态矩阵与响应式规则；
  6. 生成交互与追溯。
- **输出**：`page-spec/<page>.json`。
- **失败**：组件缺失 → catalog 扩展申请；布局无法用原语表达 → 显式「表现力槽位」+ 人工确认。

### 6.5 校验与修复

- **输入**：Page Spec。
- **校验**：
  - schema；
  - catalog（组件/props/variants/slots）；
  - token（无原始值、对比度、字号阶梯）；
  - layout（原语、禁用绝对定位、内容密度）；
  - state（必需状态）；
  - asset（引用存在、manifest 完整）；
  - traceability（REQ 覆盖、designDefault 说明）。
- **修复**：Spec Repair Agent 只改 spec，最多 2 轮；不收敛 → 人工。
- **输出**：validation report + patched spec。
- **失败**：非法产物隔离，不进入渲染。

### 6.6 HTML 渲染

- **输入**：Page Spec + Catalog 的 HTML 实现 + Profile tokens + mock data。
- **输出**：React + Vite 静态站点；支持路由、状态切换、交互、响应式。
- **细节**：
  - 组件注册表按 catalog ID 映射；
  - token 编译为 CSS variables；
  - 状态通过 query/路由切换（如 `?state=empty`）；
  - mock data 来自 UI Brief，不硬编码在页面；
  - 构建使用相对路径 + hash 路由，便于离线打开；
  - 不生成生产代码，不做后端。
- **失败**：单页构建失败 → 隔离该页，其他页继续；标记 failed。

### 6.7 Figma 渲染

- **输入**：Page Spec + `figma-plan.json` + 当前库 Figma 组件映射。
- **处理**：
  1. 生成 figma-plan（页面、frame、auto-layout、text、component instance、variant set、icon vector、image fill）；
  2. 在 scratch 文件/页面 dry-run；
  3. 创建变量集合、文本样式、组件集/实例、frame；
  4. 回读节点树，与 plan 做结构 diff；
  5. 通过后构建到交付文件/页面。
- **输出**：Figma 节点映射（spec ID → node ID）+ 构建报告。
- **限制**：
  - 插件不能 headless，必须 Figma 桌面版打开；
  - 字体必须在本机可用；中文使用 Noto Sans SC / PingFang SC；
  - v1 不生成原型连线和 Smart Animate；
  - 失败时降级为 `figma-plan + 操作说明`，HTML 仍交付。

### 6.8 Asset Compiler

- **输入**：Page Spec 的 `assetRef` + Asset 清单 + Profile 的 icon/illustration style pack。
- **处理**：
  - 图标：选型 → 风格化 → 补缺 → 校验 → SVG/sprite；
  - 插画：风格库优先 → 生成式补位（可选）→ 后处理 → @2x/@3x；
  - 图片：素材槽 → 裁剪/压缩 → manifest；
  - 切图：页面截图、图标、插画、图片。
- **输出**：Asset Manifest + 文件。
- **失败**：缺资产 → 占位 + `unresolved`；最终门禁阻断。

### 6.9 Verification Sandbox

- **输入**：HTML 构建、Figma scratch 构建、Asset Manifest、Page Spec。
- **处理**：四类沙箱 + 测试 Subagent 并行执行；输出证据与 findings。
- **输出**：`test-findings.json` + 截图/录屏/DOM/节点 diff。
- **门禁**：0 blocker；infra 失败不算通过。
- **失败**：重试 → 隔离 → 人工。

### 6.10 Handoff

- **输入**：通过门禁的 HTML/Figma/Assets/Spec/Reports。
- **输出**：交付包 + `HANDOFF.md`。
- **门禁**：用户最终视觉签核。

### 6.11 项目版本与 Git 集成

**版本对象与载体**

| 对象 | 载体 | 版本方式 |
|---|---|---|
| PRD / UI Brief / Page Spec | Git | commit + 项目 semver |
| Design System Snapshot | Git（JSON） | semver + content hash，写入 `project.yaml` |
| Run | `runs/<id>/run.json` | 不可变 run ID + 输入 hash + git commit |
| Handoff | Git tag + zip | semver，例如 `handoff/orders/1.2.0` |
| Figma 文件 | Figma 链接 | file key + version ID + spec→node map |
| 大资产（截图/切图/zip） | Git LFS 或 artifact store | content hash |
| Tool / prompt / model | `project.yaml` / lockfile | 版本固定，保证可重建 |

**项目文件布局**

```
projects/<project>/
  project.yaml
  prd/PRD.md
  ui-brief.json
  page-spec/<page>.json
  design-system/snapshot.json
  assets/manifest.json
  review/{findings,signoff,decision-log}.*
  handoff/
  out/                 # gitignored 或 LFS
```

**`project.yaml` 示例**

```yaml
project: orders
version: 1.2.0
profile: b-dense
designSystem:
  mode: import          # baseline | import | hybrid
  snapshot: 2026-10-19.1
  hash: sha256:4f3c...
tool:
  version: 0.3.0
  promptSet: 2026-10-19
git:
  repo: .
  branch: design/orders
  tag: handoff/orders/1.2.0
```

**规则**

- 源文件进 Git；生成物（HTML/Figma/截图/zip）按 run/handoff 版本管理，不直接合并。
- 每次 run 记录 `git commit / branch / dirty / input hashes / tool version / prompt set`。
- 工作区 dirty 时允许生成，但 run 标记 `dirty`；最终 handoff 要求 clean commit 或 tag。
- 审批通过后创建 `handoff/<project>/<version>` tag；是否自动 commit 由配置决定，默认不自动 push。
- 大文件走 Git LFS 或 artifact store；Figma 文件不放进 Git，用 file key + version + node map 链接。
- CI：PR 上跑 validator + 预览构建 + 截图；blocker 阻断合并。
- 冲突：Page Spec 一页一文件、稳定 ID、键排序，减少 JSON 冲突；合并后必须重跑校验。
- 可重建：`pnpm prd-ui rebuild --run <id>` 按 run 记录的版本重建；无法重建时标 `non-reproducible`。

**首版选择（2026-10-19）**

- 项目数据放在流水线仓库的 `projects/<project>/`，不与产品代码仓库共用。
- handoff 只创建 `handoff/<project>/<version>` tag；不自动 commit、不自动 push。
- 迁移路径：
  - 升级到产品仓库 `design/`：`git mv projects/<project> <product>/design/<project>`，更新 `project.yaml` 的 `git.repo` 与路径，重新校验；内容 hash 不变。
  - 升级到独立设计仓库：把 `projects/<project>` 拆成独立 repo，tag 迁移；产品侧用 handoff zip/tag 引用。
- 迁移只动目录与配置，不动 Page Spec/Catalog 结构。

**Figma 链接**

- 插件构建后输出 `figma-map.json`：spec ID → node ID、file key、file version。
- `figma-map.json` 进 Git（小 JSON）；Figma 文件本身用链接 + version 引用。
- 手工改 Figma 视为 deviation，不回写；需要变更走 Page Spec 重建。

---

## 7. Agent 编排

### 7.1 编排形态

- **确定性状态机**，不是 LLM 编排器；
- 每个节点是一个任务，有显式输入、输出、重试、预算、门禁；
- Agent 之间不聊天，只交换磁盘上的结构化产物；
- 人工门禁是状态，不是建议；
- 状态机可断点恢复、可重放、可审计。

### 7.2 Agent 阵容

| Agent | 职责 | 模型/温度 | 工具 | 看得到 | 看不到 | 输出 |
|---|---|---|---|---|---|---|
| PRD Reviewer | 独立评审 PRD 是否 UI-ready | 与作者不同模型，temp 0 | 无（只读） | PRD + 评审契约 | 作者推理、UI Brief | findings + readiness |
| IA Agent | 检查 PRD 信息架构：页面清单、层级、导航、流程、角色、命名、断链/死路 | 强推理，temp 0 | 只读 PRD + 现有 IA/截图 | UI Brief、视觉 | ia-map + ia-findings + proposed IA |
| UI Briefer | 抽取 UI Brief、生成追问 | 强推理，temp 0–0.2 | 读文件 | PRD + 签核记录 + IA map | Page Spec、渲染结果 | UI Brief + questions |
| Interaction Design Agent | 交互模型、状态矩阵、动效规范、原型交互/动效评审 | 强推理 + video/vision，temp 0 | 只读 UI Brief/Page Spec/motion tokens/原型 | 视觉风格、代码 | interaction-spec + motion-spec + review |
| Spec Engineer | 编译 Page Spec；修复校验问题 | 强结构化输出，temp 0 | catalog 查询、schema 校验、沙箱渲染 | UI Brief + Profile + 当前库 Catalog + findings | PRD 全文、另一个库 | Page Spec / patch |
| Visual Critic | 看截图做视觉评审 | Vision 模型，temp 0 | 只看截图 | 截图 + spec + profile | 作者推理、代码 | visual findings |
| Visual Style Agent | 品牌视觉方向、插画/图片/logo 风格、资产 brief、来源策略 | Vision + 强推理，temp 0.2 | 读品牌资产、截图、UI Brief；写 style pack/brief | PRD 全文、Spec 细节 | visual-style pack + asset briefs |
| Asset Producer | 库检索 / AI 生成 / 上传，执行资产 brief | 按来源，temp 0.2 | 库、生成、上传 | brief + style pack | asset candidates |
| Asset Reviewer | 独立评审资产，输出 pass/retry/fallback + 评分 | Vision，temp 0 | 只读候选 + brief + style pack | 生成推理、成本 | review verdict + scores |

确定性节点：Intake、Validators、HTML Renderer、Figma Renderer、Asset Compiler、Sandbox Orchestrator、Handoff Packager。

人工门禁：PRD 签核、UI Brief 确认、最终视觉验收。

### 7.3 隔离规则

| 隔离项 | 规则 |
|---|---|
| 上下文 | 每个 Agent 独立 session；不共享聊天记录 |
| 模型 | Reviewer 尽量与作者不同模型；至少不同 prompt/角色 |
| 工具 | Reviewer 无工具、不联网；Spec Engineer 只能读当前库 catalog 和校验器 |
| 产物 | 只能通过编排器传递，不能 Agent 直接调用另一个 Agent |
| 库 | 一个项目只加载一个库的 Catalog；混用需要显式 hybrid 配置 |
| 权限 | Agent 不能写最终交付目录，只能写 run 的 artifacts |

### 7.4 路由规则

Router 是纯函数：

```
route(state, artifact, findings, changeScope, profile) → nextStage
```

| 条件 | 路由到 |
|---|---|
| PRD 有 blocker | 人工签核，禁止进入 UI Brief |
| UI Brief 有未回答问题 | Clarify，禁止编译 spec |
| spec schema/catalog 错误，repair 轮次 < 2 | Spec Repair |
| spec 错误且 repair ≥ 2 | 人工升级 |
| 页面类型 = list/detail/form/settings | 对应页面原型编译器 |
| target = mobile | mobile archetype + 对应 profile/库 |
| 组件在当前库不存在 | Catalog 扩展申请 |
| 只改文案 | 只重渲染该页 |
| 只改 profile/tokens | 全站重渲染 |
| 改组件契约 | 迁移 + 全站校验 |
| 资产缺失 | 占位 + 最终门禁阻断 |
| Figma 写入失败 | 重试 → `figma-plan` 降级交付 |
| 视觉评审失败 | 人工评审或布局修复 |

路由维度：阶段、严重级别、平台、变更范围、置信度、风险等级。高风险页面（权限、支付、删除）强制人工评审。

### 7.5 容错与预算

| 故障类型 | 处理方式 |
|---|---|
| API 超时/限流 | 指数退避重试，最多 3 次 |
| LLM 输出非法 JSON | schema 校验失败 → 定向修复提示，最多 2 次 |
| 需求歧义 | 不猜，生成问题，进入人工回答 |
| 组件不存在 | 阻断 + 扩展申请 |
| 资产缺失 | 占位 + `unresolved`，最终门禁阻断 |
| HTML 渲染崩 | 隔离该页，其他页继续 |
| Figma 插件失败 | 重试 → 降级为 `figma-plan + 操作说明` |
| 修复循环不收敛 | 停止，升级人工，附失败 diff |
| 视觉评审不可用 | 人工目检门禁 |
| 产物冲突 | spec 是事实源；以 spec 为准重建，冲突记录 |

机制：

- **不静默降级**：任何 fallback 写 `degraded: true` + 原因；
- **部分成功**：按页面记录 `success / degraded / failed`；
- **幂等 + 断点**：每个节点落盘产物 + hash；重跑只执行受影响节点；
- **预算**：重试 3 次、修复 2 轮、每轮问题 10 个、单 Agent token/时间上限；
- **隔离**：非法产物不进下游；
- **回滚**：spec/profile/catalog 版本化，可回退重建。

### 7.6 状态与断点

```
runs/<run-id>/
  state.json          # 当前状态、attempts、degraded、门禁
  artifacts/          # prd-review, ui-brief, page-spec, manifest
  findings/           # validator/visual findings
  logs/               # prompt/model/token/耗时
  renders/            # screenshots, html build, figma-plan
  reports/            # 校验报告、追溯矩阵
```

Studio 只读 `state.json` 和产物，不参与编排逻辑；CLI 与 UI 跑同一条链路。

### 7.7 为什么不使用单 Agent / 群聊式多 Agent

- 单 Agent：上下文膨胀、自评偏差、职责冲突、工具过多、成本高。
- LLM 编排器：路由不可预测、可能跳门禁、难复现。
- 群聊/蜂群：易循环、漂移、互相污染、不可审计。
- 评审团（Debate/Panel）：高风险项目可选，v1 不用；等误报率/漏报率有数据后再加。

---

## 8. 设计系统

### 8.1 设计系统来源：现有接入 + 基线兜底

```
design-system/
  ingest/
    code/                # 组件导出、props、Storybook、tokens
    figma/               # component sets、variants、variables、text styles
    docs/                # 规范文档、页面规则
    screenshots/         # 风格画像、参考视觉
  registry/
    components.yaml      # 语义组件名、props 名、variants、states（无实现）
    archetypes.yaml      # 页面原型名与槽位
  snapshots/             # 接入后冻结的 Profile + Catalog + mapping + gaps
  baseline/
    b-dense/
    c-expressive/
```

规则：

- 默认优先接入现有系统；基线只在缺口、新品牌或没有现成系统时使用。
- 接入结果冻结为 `design-system.snapshot.json`，Page Spec 只引用 Snapshot。
- 现有系统之间共享语义 ID 注册表；实现、props 扩展、视觉可以独立。
- 一个产品面只用一个系统；同一页面禁止混用。
- 没有 mapping 的组件不能用于 Page Spec；缺组件发起扩展申请。
- 接入按首版 16–20 个组件做垂直切片，不一次性接全库。
- Studio 使用独立的内部设计系统（`ui-design-system`），不引用产品系统。

### 8.2 Tokens

- 来源：现有代码 tokens / Figma variables 优先；文档/截图仅作补充并标 `assumption`；
- 颜色：语义 token（action.primary、surface.default、text.secondary、border.subtle、status.*）+ 原始色板；
- 字体：type scale、行高、字重、字距；
- 间距：4/8/12/16/24/32/48；
- 圆角：sm/md/lg/full；
- 阴影：elevation 1–3；
- 动效：duration/easing/distance/stagger；
- 断点：sm/md/lg/xl；
- z-index：base/dropdown/sticky/overlay/modal/toast。

约束：

- Page Spec 只能引用 token 名称；
- 正文/次级文字对比度 ≥ 4.5:1；
- 字号不得低于 12px（Web）/ 11px（移动端辅助文字）；
- 动效必须支持 `prefers-reduced-motion`。

### 8.3 Components（v1 子集）

下表是候选集；每套现有系统/基线库首版按页面实际使用选 16–20 个，优先复用现有组件，不要求全部实现：

| 类别 | 组件 |
|---|---|
| 操作 | Button、IconButton、Link |
| 输入 | Input、Textarea、Select、Checkbox、Radio、Switch、FormField |
| 展示 | Card、List、ListItem、Badge、Avatar、EmptyState、Skeleton、Stat |
| 导航 | Tabs、Breadcrumb、Pagination、Sidebar（Web）、BottomNav（Mobile） |
| 容器 | Modal、Drawer、Toast、Tooltip |
| 数据 | DataTable（Web）、FilterBar（Web）、SearchBar（Mobile） |

所有组件必须定义：props、variants、states、slots、motion、a11y、HTML/Figma 映射、使用规则。

### 8.4 Page Archetypes

首版 8 类：

1. `overview`：概览/仪表盘（指标、图表、快捷入口）；
2. `list`：列表/表格（筛选、分页、批量操作、空/错/加载）；
3. `detail`：详情（摘要、字段、操作、关联、状态）；
4. `form`：创建/编辑（字段分组、校验、提交/取消、错误）；
5. `settings`：设置（分组、开关、保存、权限）；
6. `auth`：登录/注册/验证码；
7. `feed`：C 端首页/信息流（卡片流、下拉刷新、无限滚动）；
8. `onboarding`：引导/空状态/权限请求。

每个 archetype 定义：槽位、必需区域、可选区域、状态清单、响应式行为、允许的组件集合。

### 8.5 动效

| 层 | 内容 |
|---|---|
| Profile | duration/easing/distance/stagger/reduced-motion |
| Catalog | 每个组件的动效契约（Modal 进出、Drawer 滑入、Toast 淡入、Accordion 展开） |
| Page Spec | 只写语义（`enter: fade-up`、`transition: shared-axis`），不写 keyframes |
| HTML | CSS/WAAPI 实现；复杂动效用 Lottie |
| Figma | 静态状态帧 + 动效标注；复杂动效附 Lottie/GIF；v1 不做原型连线 |

校验：只能引用 motion tokens；必须支持 reduced-motion；禁止无限循环干扰动效；动效不能阻塞关键操作。

### 8.6 文字与中文排版

| 关注点 | 解决位置 |
|---|---|
| 文案内容 | UI Brief / Page Spec |
| 文字样式 | Profile type tokens + 组件 textRole |
| 排版规则 | 组件契约 + 校验器 |

规则：

- Page Spec 只写 `textRole` + 内容，不写字号；
- B 端与 C 端各自一套 type scale；
- 组件内部文字由组件契约决定；
- 中文使用 Noto Sans SC（主）/ PingFang SC（macOS 回退）/ Source Han Sans（可选）；
- 校验：字体加载、缺字回退、标点挤压、断行、行宽（45–75 字符）、最小字号。

### 8.7 图标与插画风格包

| 资产 | 风格包 |
|---|---|
| B 端图标 | Lucide/Tabler 线性，24px 网格，1.5px stroke，currentColor |
| C 端图标 | 线性 / 面性 / 双色三套；20/24 光学尺寸；品牌强调色 |
| B 端插画 | 少量空状态/错误场景，克制风格 |
| C 端插画 | 风格库（扁平/柔光 3D/手绘）；默认风格库，IP 需求显式切换 |
| IP 插画 | 风格圣经 + 参考图 + 多姿态 + 人工审校（v1 只定义接口，不实现全自动） |

### 8.8 变更管理

- 换 profile：全站重渲染，Page Spec 无 diff；
- 改组件外观：受影响页面重渲染，Page Spec 不变；
- 改组件契约：迁移 + 校验受影响页面；
- 改页面：只重渲染该页，Figma 用稳定 ID 做 sync；
- 所有 profile/catalog/spec 版本化，交付包记录版本。

### 8.9 现有设计系统接入（Ingestion）

当项目已有组件或规范时，优先接入，不从零建库。接入来源是项目级配置，在项目创建时上传/连接；可后补，不阻塞首版。接入结果冻结为版本化 Snapshot，Page Spec 只引用 Snapshot。

**四种来源**

| 来源 | 接入内容 | 强制力 | 缺口 |
|---|---|---|---|
| 代码组件库 + tokens | 组件导出、props、variants、states、样式 | HTML 端强 | Figma 端需要 mapping 或生成近似 |
| Figma 组件库 + variables | component set、variant properties、variables、text styles | Figma 端强 | HTML 端需要 mapping 或生成近似 |
| 设计规范文档 | tokens、用法、页面规则 | 中 | 无真实组件 |
| 截图/参考 UI | 色板、字体、间距、密度、风格 | 弱 | 无组件契约 |

**事实源矩阵**

| 产物 | 优先事实源 | 交叉校验 | 冲突处理 |
|---|---|---|---|
| Tokens | 代码 tokens（tokens.json/Tailwind/CSS variables）或 Figma variables | 另一方 + 文档 | 人裁决，按类别冻结 |
| 组件 API/行为 | 代码库 | Figma variant properties | 人裁决 |
| 组件外观 | Figma 库（无 Figma 时用代码截图） | 代码/Storybook | 人裁决 |
| 页面规则/状态 | 规范文档 | 截图 | 缺口提问 |
| 视觉参考 | 截图/Storybook/Figma | — | 人工目检 |

**流程**

1. Discovery：扫描代码、Figma、tokens、文档、截图；输出 `inventory.json`（来源、版本、覆盖、缺口、许可证）。
2. Ingest：四个 adapter 分别产出 `catalog.code.json`、`catalog.figma.json`、`rules.docs.json`、`profile.screenshot.json`。
3. Reconcile：比对 tokens、组件、variants、规则；输出 `token-diff.json`、`component-map.json`、`gap-list.md`。
4. Freeze：生成 `design-system.snapshot.json`（Profile + Catalog + mapping + gaps + 版本/hash）。
5. Compile：Page Spec 只使用 Snapshot 中 `available` 的组件/variants；缺组件发起扩展申请。
6. Render：HTML 用真实代码组件；Figma 用真实组件实例；无真实组件的部分用基线并标 `generated`。
7. Validate：props/variants 合同测试、token 对照、Storybook/Figma/截图视觉回归。

**冲突示例**

- 代码 Button `size: sm|md|lg`，Figma `Size: S|M|L` → mapping 表，不猜。
- 代码 token `#2563EB`，Figma variable `#1D4ED8` → 生成 diff，按类别选事实源，冻结。
- 文档写「主按钮黑色」，代码是蓝色 → 冲突，人裁决；裁决结果写进 Snapshot。
- 截图里有、代码/Figma 没有的布局 → 只能作为参考；需要新增 archetype 或组件，不能假装已接入。

**缺口处理**

| 缺口 | 处理 |
|---|---|
| 代码有、Figma 无 | 生成近似 Figma 组件（标 `generated`）或人工补库 |
| Figma 有、代码无 | 生成代码 wrapper/组合，或标 `figma-only` |
| 两边都无 | 用基线组件或新建；人工决定 |
| variant 缺失 | 限制 Page Spec 只能用现有 variant，或扩库 |
| token 缺失 | 从文档/截图推导，标 `assumption`，人工确认 |

**边界**

- 没有 mapping，就不能声称「原生还原」。
- 只有文档/截图时，输出是「符合规范的高保真设计」，不是「复刻现有组件库」。
- 现有组件覆盖不了的页面原型，先列 gap，不硬套。
- 接入按首版 16–20 个组件做垂直切片，不一次性接全库。

---

## 9. 资产管线

### 9.1 图标

1. **声明**：UI Brief 提取功能图标语义；
2. **选型**：Lucide/Tabler/Iconify，锁定一个家族；
3. **风格化**：统一网格、线宽、端点、圆角、currentColor；
4. **补缺**：缺失图标由设计师补或受控 SVG 生成；必须过网格/线宽校验；
5. **导出**：单 SVG + sprite；
6. **Figma**：矢量组件，支持 currentColor 对应的变量绑定；
7. **验收**：24×24、1.5px、无硬编码色、视觉一致。

图标不使用文生图模型：不可编辑、无法切图、无法继承 currentColor。

### 9.2 插画

两种模式：

- `mode: library`（默认）：从风格库选择场景（空状态、错误、引导、Hero）；套用品牌色板；输出 @2x/@3x PNG/WebP；授权记录。
- `mode: ip`（显式需求）：风格圣经 + 参考图 + 固定提示词 + seed；多姿态一致性；人工审校；v1 只定义接口，不实现全自动。

生成式补位规则：

- 只进插画槽，不画 UI 文字、图标、按钮；
- 固定 style pack + 参考图 + seed，保证同一套视觉；
- 后处理：去底、裁切、放大、色板校准；
- 授权记录进 Manifest；
- 视觉评审 + 人工终审。

### 9.3 图片槽

- UI Brief 声明用途、比例、最小尺寸；
- 素材来源：用户上传、生成、图库；
- 输出：@1x/@2x/@3x、WebP/PNG、裁剪规则；
- 禁止外链；交付包内本地化；
- 授权记录。

### 9.4 切图与 Manifest

- 页面截图：每页 × 状态 × 断点，PNG @1x/@2x；
- 图标：SVG + sprite；
- 插画：@2x/@3x PNG/WebP；
- 图片：按用途裁剪；
- Manifest：引用、文件、hash、授权、完成状态。

### 9.5 授权与安全

- 图标库许可证记录（Lucide ISC、Tabler MIT 等）；
- 插画库/生成图授权记录；
- 字体许可证记录；
- SVG 清洗：禁止 script、外链、事件属性；
- 图片本地化，禁止运行时外链；
- 交付包附 `LICENSES.md`。

---

## 10. 渲染器

### 10.1 HTML Renderer

- React + Vite + Tailwind；
- 自研组件注册表，按 catalog ID 映射到当前库的 React 组件；
- Profile tokens 编译为 CSS variables；
- 路由 + 状态切换（`?state=` / hash route）；
- mock data 来自 UI Brief；
- 响应式：按 profile breakpoints；
- 构建使用相对路径 + hash 路由，支持离线打开；
- 只做设计原型，不生成生产代码；
- 输出：静态站点 + 预览截图。

### 10.2 Figma Renderer

- 自研 TypeScript Figma 插件，消费 `figma-plan.json`；
- 支持：页面、frame、嵌套 Auto Layout、text、component set/instance、variant、icon vector、image fill、variables、text styles；
- 字体：`figma.loadFontAsync`，中文 Noto Sans SC / PingFang SC；
- 沙箱：scratch 文件/页面 dry-run → 构建 → 回读 → 结构 diff；
- 构建后回写 spec ID → node ID 映射；
- 限制：不能 headless；必须 Figma 桌面版；v1 不做原型连线/Smart Animate；
- 失败降级：输出 `figma-plan + 操作说明`，HTML 仍交付。

### 10.3 Studio

本地 Web 工作台：

- **自身 UI 使用项目现有的 `ui-design-system`**（shadcn/ui + Tailwind v4：黑白灰、`h-9` 控件、页面原型约束），不复用生成的 `b-dense` / `c-expressive` 库；
- 新增一个 `workbench` 三栏布局原型（页面树 / 预览画布 / 右侧面板）；PageTree、FindingsTable、DiffViewer、AssetGrid、ViewportSwitcher 用 shadcn 原语组合，禁止手写 Button/Input/Card/Dialog；
- **样式严格分离**：工作台样式不进入 HTML/Figma 产物，产品库也不用于工作台；
- 新建项目向导：PRD → 目标端/平台 → 设计系统（baseline / import / hybrid）→ 资产 → 确认；
- 项目设置可后补/替换来源，重新接入后重渲染；
- Git 状态（branch/commit/dirty）与 handoff tag；默认不自动 push；
- PRD 导入与 Review 仪表盘；
- UI Brief 编辑与问题回答；
- 页面树与预览（多断点、多状态）；
- 逐页重生成；
- findings / validation / traceability 面板；
- 资产面板（图标、插画、图片、切图）；
- 导出交付包；
- 只读 `state.json`，不承载编排逻辑。

---

## 11. 验证与沙箱

### 11.1 四类沙箱

| 沙箱 | 隔离方式 | 测试内容 | 限制 |
|---|---|---|---|
| HTML | 本地独立进程 + Playwright（容器化作为后续加固）；固定 Chromium、字体、依赖；仅 localhost；无密钥、无外网 | 加载、控制台、布局几何、截图、交互、a11y | 不访问生产 API/真实数据 |
| Figma | 专用 scratch 文件/页面；dry-run + 构建 + 回读 | 结构 diff、Auto Layout、字体、变量、组件实例 | 插件不能 headless；需 Figma 桌面版 |
| Asset | 本地静态检查 + 隔离渲染 | SVG 清洗、24px 网格、线宽、currentColor、图片尺寸、授权 | 禁止外链 |
| Spec | 纯函数校验 | schema、catalog、token、状态、追溯 | 不产生视觉判断 |

### 11.2 测试 Subagent

| Subagent | 测试内容 | 工具 | 输出 |
|---|---|---|---|
| Contract Tester | schema、组件白名单、token、状态、追溯 | JSON Schema/Zod、catalog | contract findings |
| Render & Layout Tester | 控制台、资源、溢出、重叠、截断、断点 | Playwright + DOM 几何 + 截图 | layout findings + 证据 |
| A11y & Interaction Tester | axe、焦点顺序、键盘、表单、弹窗、跳转、状态切换 | axe-core + Playwright | a11y/interaction findings |
| Figma Verifier | frame 数量、嵌套 Auto Layout、文本样式、变量、组件实例、图标矢量 | Figma 插件回读 + diff | figma findings + node diff |
| Asset Tester | 图标网格/线宽/currentColor、插画尺寸/透明/授权、Manifest 完整 | 自定义校验 + 渲染 | asset findings |
| Visual Critic | 层级、留白、视觉平衡、品牌一致性 | 截图 + vision 模型 | visual findings（主观，人工终审） |

原则：能用确定性工具判定的，不交给 LLM；视觉模型只负责主观判断。

首版实际编排 4 个测试角色：Render & Layout、A11y & Interaction、Figma Verifier、Visual Critic；Contract Tester 与 Asset Tester 作为确定性校验器运行，不单独起 Agent。

### 11.3 测试矩阵

- 页面 × 断点（桌面 1440、移动 390）× 状态（default/empty/loading/error/permission/disabled）；
- 关键交互流程（导航、筛选、表单提交、弹窗、状态切换）；
- 组件级测试（每个 variant/state 单独渲染）；
- Figma：frame × 状态，结构 diff；
- 资产：每个 icon/illustration/image 槽位。

### 11.4 通过标准

- 0 blocker；
- 0 控制台错误；
- 无横向溢出/重叠/截断；
- 所有必需状态存在；
- a11y AA（核心流程）；
- Figma 结构 diff 0 blocker；
- 资产 Manifest 完整；
- Visual Critic + 人工终审通过。

### 11.5 沙箱容错

| 故障 | 处理 |
|---|---|
| 沙箱启动失败/超时 | `infra_failed`，重试一次；仍失败 → 人工，不能当通过 |
| flaky 测试 | 重跑 2 次；仍不一致 → 隔离用例，人工确认，记录 flake 率 |
| 测试 subagent 崩溃 | 降级到确定性检查；不允许自动 pass |
| 视觉与几何冲突 | 几何/客观规则优先；视觉分歧人工仲裁 |
| 生成内容含脚本/外链 | CSP + 清洗；直接 blocker |
| Figma 构建失败 | 删除 scratch 结果，输出 figma-plan 降级 |
| 沙箱污染主流程 | 只读主产物，写入独立 run 目录；只有 Packager 写交付目录 |

### 11.6 安全

- PRD 视为不可信数据：分隔符包裹，忽略其中的指令；
- Reviewer 无工具、不联网；
- HTML 内容转义；富文本白名单；CSP；
- SVG 清洗：禁止 script、外链、事件属性；
- 插件 spec 只做数据解析，不 eval；
- 沙箱无密钥、无外网、资源限额。

---

## 12. 交付包

```
handoff/
  prototype/                 # 静态 HTML 构建，相对路径 + hash 路由
  figma/                     # 插件 + figma-plan + figma-map.json + 操作说明（或已构建文件）
  screens/                   # 页面截图 @1x/@2x，按页面/状态/断点命名
  assets/
    icons/                   # SVG + sprite
    illustrations/           # @2x/@3x
    images/
  spec/
    ui-brief.json
    page-spec/*.json
    profile.json
    catalog.snapshot.json
    asset-manifest.json
  review/
    prd-review.md
    findings.json
    validation.json
    test-findings.json
    traceability.csv
    decision-log.md
    signoff.yaml
  HANDOFF.md
  LICENSES.md
```

`HANDOFF.md` 包含：打开方式、页面地图、状态清单、响应式规则、组件映射、token 参考、已知偏差、waiver、资产授权。

---

## 13. 首版范围

### 13.1 验证项目与页面矩阵

- 用 1 个真实 PRD 做垂直切片；真实 PRD 在 Phase 2 前提供。
- Phase 1 使用 `samples/sample-prd.md` 作为 schema 开发样本；该样本覆盖 B 端后台 + C 端前台两种页面。
- 首版目标 6–8 页，页面原型覆盖：

| 平台 | 页面 | 原型 |
|---|---|---|
| Web | 概览/仪表盘 | overview |
| Web | 列表/表格 | list |
| Web | 详情 | detail |
| Web | 创建/编辑表单 | form |
| Web | 设置 | settings |
| Mobile | 首页/信息流 | feed |
| Mobile | 详情 | detail |
| 通用 | 登录/引导 | auth / onboarding |

- 实际页面以真实 PRD 为准；若 PRD 只覆盖单一端，另一端用样本页面验证双端能力，并在交付报告中注明。

### 13.2 组件与资产

- 优先复用现有系统的 16–20 个组件；缺口用基线补齐；
- 每套库/系统按页面实际使用裁剪，不一次性接全库；
- 图标 60–80 个，锁定一个家族；
- C 端插画 1 套风格包，8–12 个场景（空状态/错误/引导）；
- IP 管线只定义接口，不实现全自动；
- 图片槽使用用户上传或占位，不默认启用生成式图片。

### 13.3 交付物

- HTML 原型（静态构建，可离线打开）；
- Figma 源文件（原生图层、Auto Layout、变量、文本样式、组件实例）；
- 切图包（图标/插画/图片/页面截图）；
- 规格包（UI Brief、Page Spec、Profile、Catalog 快照、Asset Manifest）；
- 评审包（PRD Review、validation、test findings、traceability、decision log、signoff）；
- `HANDOFF.md` + `LICENSES.md`。

### 13.4 验收标准

1. 端到端跑通 1 个真实 PRD，生成 6–8 页、Web + 移动端；
2. PRD Review：0 blocker，或全部 waiver 有 owner/理由/有效期；
3. UI Brief：无阻塞问题，追溯完整；
4. Page Spec：全部 validator 通过，0 blocker；
5. HTML：所有页面/状态可打开；0 控制台错误；无溢出/重叠；核心流程可交互；a11y AA；
6. Figma：原生图层、Auto Layout、变量、文本样式、组件实例；结构 diff 0 blocker；中文字体正确；
7. 资产：所有 icon/illustration/image 解析完成；图标 24px 网格、1.5px、currentColor；插画 @2x/@3x；授权记录；
8. 沙箱：测试 Subagent 通过；infra 失败未被当作通过；
9. 交付包完整，`HANDOFF.md` 可让开发独立实现；
10. 用户视觉终审通过；
11. 同一输入重跑，Page Spec 等价，渲染结果在允许误差内一致。

### 13.5 非目标（首版）

- 生产代码直出；
- Figma 双向同步；
- Figma 原型连线/Smart Animate；
- 原创 IP 插画全自动；
- 任意页面类型/任意品牌；
- 多用户协作/云端服务；
- 跨浏览器全矩阵/性能压测；
- 生成式图片默认开启。

---

## 14. 里程碑

| 阶段 | 内容 | 出口条件 |
|---|---|---|
| Phase 0 · Spike（3 天） | Figma 插件写回、中文加载、嵌套 Auto Layout、变量/文本样式、组件集；1 张 B 端页 + 1 张 C 端页；HTML 渲染验证 | 两张页面在 HTML/Figma 均可构建；截图对比可接受；字体正确；结构 diff 可读 |
| Phase 1 · 基础 | 数据契约、两套 Profile、两套 Catalog v1、8 个 Archetype、Validators、状态机、样本 PRD | 样本 PRD 能编译出 Page Spec 并通过校验 |
| Phase 2 · 垂直切片 | PRD Review Gate、UI Brief、Page Spec、HTML Renderer、Asset Compiler、Studio | 真实 PRD 生成 6–8 页 HTML，校验通过 |
| Phase 3 · Figma + 沙箱 | Figma Renderer、scratch 沙箱、测试 Subagent、Handoff | Figma 构建 + 沙箱通过 + 交付包完整 |
| Phase 4 · 验收 | 真实项目走查、修复、文档 | 验收标准全部满足，用户签核 |

时间预估：Phase 0 为 3 天；Phase 1–4 的具体排期由实施计划给出，不在本设计文档中承诺。

### 14.1 实现状态（2026-10-22）

| 阶段 | 状态 | 已有证据 |
|---|---|---|
| Phase 0 · Spike | 完成（历史） | `spike/` 保留 Figma 写回与 HTML 验证，不作为现行实现 |
| Phase 1 · 基础 | 完成 | `core/*` 契约/编译器/校验/renderer；**12 个 archetype**（原 10 个 + `mobile-list` / `mobile-form`）；644 tests、typecheck clean、`test:dsh` 4 passed |
| Phase 2 · 前半段 | 完成 | `intake:run`：PRD normalize/review + IA + UI Briefer + 两道签核 + 原子发布；Briefer 自动产出 `fieldLabels` / `mockData` / `feedItems` |
| Phase 2 · 后半段 | 完成 | M1 → Spec Engineer → HTML；per-profile M1 真实 run（b-dense + c-expressive）interaction passed；8 页 sample 出口 `8 pages / 0 blockers`；03 真实 PRD 四页切片全链路通过（intake ¥0.5147、M1 ¥0.2746、Spec 4 页 / 0 blockers、HTML 4 页） |
| Phase 2 · 完整出口 | 完成（2026-10-22，clean v0.4；v0.5 视觉债） | `employee-app-phase2` 8 页真实 PRD：intake `run-2026-10-22T03-09-28-544Z` success，8 页全 `b-mobile`，brief hash `sha256:b558b57a…b8335`，0 waivers / 0 手工 brief patch，¥0.8978；M1 `run-2026-10-22T03-16-05-257Z` `gates={ia:passed, interaction:passed, visualStyle:passed}`、0 waivers、`agent:sign` 后 success，¥0.43998；Spec Engineer v0.4 `run-2026-10-22T12-10-44-917Z` 8 Page Specs / 8 motion pages / 0 blockers / 0 motion unresolved（2 unused asset warnings）；HTML 8 页 + index，`phase1:verify` 8/0；v0.4 Visual Review：baseline 24 cases。concrete-major 修复后最终 `run-2026-10-22T13-55-24-469Z` 24/24 截图、0 console / 0 overflow、diff 24/0/0、9 findings（6 major / 3 minor / 0 blocker）；signed critique cache 命中（¥0，0 次模型调用）；按停止规则签核，`status=passed`、`signoff.valid=true`，6 major 作为 v0.5 视觉债记录。Motion node id / picker / 完整日期 / reschedule prefill / 日历一致 / loading-empty 结构已进 HTML。Studio/Asset Compiler 仍后置 |
| Phase 3 · Figma + 沙箱 | 未开始 | Figma Renderer、scratch 沙箱、测试 Subagent、Handoff 均未实现 |
| Phase 4 · 验收 | 未开始 | 真实项目走查、用户最终签核未做 |

当前 renderer 能力：

- `PageShell` / `MobileShell` 全 slot；`mobile-list` 带七列日历、列表双维度；`mobile-form` 单主 CTA；detail 页底部固定操作栏；`noticeBlocks` 按项目分块；`mockData` / `fieldLabels` 全链路。
- `CalendarGrid`、`ListRow`、`FormField`、`Input`、`Select`、`List`、`ListItem` 等已进入 `b-mobile` catalog。
- 轻量 vanilla JS 控制器（v0.4）：`businessStates` 驱动详情页状态与动作栏、`formModes`（new/reschedule）驱动 CTA 与客户锁定、`views` 切换日历/列表、搜索 idle/过滤/清空/空态、空格预填、详情抽屉、customer picker 草稿恢复（sessionStorage）、完整日期预填。PageShell 页面不注入交互。
- Motion：compiler 写语义 `node.id`，Spec Engineer 解析 M1 binding（legacy alias + group 展开），renderer 输出 `data-motion-*` CSS 动效并按 `prefers-reduced-motion` 回退。
- Visual Review：`core/visual-review` 构建 24 项截图矩阵，Playwright 截图 + pixelmatch baseline diff，Visual Critic 走 `prd-ui-visual`（vision、只读工具、65536 maxTokens、900s timeout），人工 `visual:sign` 后才 `passed`。
- 仍后置（v0.5）：today「查看全部」；390px 三日历滚动提示；loading skeleton 完整 12 行模板；empty overlay 呈现；form mode pills；static reschedule 截图上下文。Critic 同输入已用 signed cache 稳定复现；fresh critique 仍有采样波动。Figma/Studio/Asset Compiler、完整 a11y 仍后置。

版本路径（内部迭代）：

| 版本 | 目标 | 主要缺口 |
|---|---|---|
| v0.1 | 视觉保真 | 已完成：日历、固定操作栏、单主 CTA、告知分块 |
| v0.2 | 多 profile + 资产 | 已完成：per-profile M1、标准图标 inventory、asset review |
| v0.3 | Phase 2 验收交付 | 已完成（sample waiver）：8 页真实 PRD、HTML/资产/视觉巡检 |
| v0.3.1 | Clean Phase 2 收尾 | 已完成：0 waiver / 0 brief patch、状态动作栏、表单 mode、日历/搜索交互、529 tests、19 张交互截图 |
| v0.4 | 动效 + 视觉回归 | 已完成：motion node id / CSS 动效、picker、完整日期、24 项截图 baseline、真实 Visual Critic（已签核，v0.5 债）、644 tests、`test:dsh` 4、Phase 1 8/2/4/8 全 0；critic major 转入 Phase 3/4 视觉债 |
| v1.0 | 项目最终交付 | Phase 3 + Phase 4：Figma/Studio/Handoff、沙箱、真实项目用户签核 |

---

## 15. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| Figma 插件写回能力/保真度 | 高 | Phase 0 spike；scratch + 回读 + 结构 diff；失败降级为 figma-plan；HTML 仍交付 |
| 中文字体加载/缺字 | 高 | Noto Sans SC + PingFang SC 回退；沙箱预装字体；字体校验；授权记录 |
| 多套现有系统不一致/双倍维护 | 中高 | 共享语义 ID 注册表；一个产品面只用一个系统；按首版切片接入；各自视觉验收 |
| PRD 质量不足 | 高 | PRD Review Gate + 决策权签核 + 问题预算 + 可测试示例 |
| C 端插画一致性/授权 | 中 | 风格包 + 参考图 + seed；人工审校；授权 Manifest；v1 默认风格库 |
| 范围膨胀 | 高 | 6–8 页、16–20 组件、8 个 archetype；非目标清单；Phase 门禁 |
| LLM 非确定性 | 中 | temp 0、schema 校验、快照、修复循环、人工门禁 |
| 沙箱 flaky/infra 失败 | 中 | 重跑、隔离、flake 指标；infra 失败不当通过 |
| Figma 插件不能 headless | 中 | scratch 文件流程；用户打开 Figma；plan 降级 |
| 字体/图标/插画授权 | 中 | 许可证清单；只用可商用资产；`LICENSES.md` |
| Prompt 注入/不安全内容 | 中 | PRD 当数据；Reviewer 无工具；CSP；HTML/SVG 清洗 |
| 双端页面规则翻倍 | 中 | 8 个 archetype + 平台变体；首版只覆盖核心页型 |

---

## 16. 假设与依赖

1. 本地环境：macOS，Node 24、pnpm、Chrome、ffmpeg、Figma 桌面版已安装（已验证）。
2. Figma 插件 API 支持 Auto Layout、Variables、Text Styles、Component Set/Instance（Phase 0 验证）。
3. 字体：Noto Sans SC 与 Inter 可安装/打包；PingFang SC 作为 macOS 回退；许可证记录。
4. 真实 PRD 在 Phase 2 前提供；Phase 1 使用 `samples/sample-prd.md` 开发 schema。
5. 图片生成默认关闭；v1 使用风格库 + 用户上传 + 占位图；生成式补位是可选接口。
6. HTML 原型是设计交付物，不是生产代码；开发按 Figma + 切图 + 规格实现。
7. 一个产品面只用一个系统/库；跨系统页面需要显式 hybrid 配置，v1 不默认支持。
8. 首版只保证 Chromium 渲染 + 移动视口模拟；不做全浏览器矩阵。
9. 现有资产在项目创建时按需提供（代码/Figma/tokens/文档/截图）；不是流水线构建的前提；缺失时用基线/文档/截图并记录 gap。

---

## 17. 附录

### 17.1 Page Spec 示例

见 5.5。

### 17.2 Component Catalog 示例

见 5.4。

### 17.3 Profile Token 示例

```json
{
  "meta": { "name": "b-dense", "library": "b-dense", "version": "0.1.0" },
  "color": {
    "action.primary": { "$value": "#030213", "$type": "color" },
    "surface.default": { "$value": "#FFFFFF", "$type": "color" },
    "text.primary": { "$value": "#111827", "$type": "color" },
    "text.secondary": { "$value": "#6B7280", "$type": "color" }
  },
  "typography": {
    "body.md": {
      "fontFamily": "Noto Sans SC",
      "fontSize": "14px",
      "lineHeight": "20px",
      "fontWeight": 400
    },
    "heading.2": {
      "fontFamily": "Noto Sans SC",
      "fontSize": "24px",
      "lineHeight": "32px",
      "fontWeight": 600
    }
  },
  "space": { "1": "4px", "2": "8px", "3": "12px", "4": "16px", "6": "24px", "8": "32px" },
  "radius": { "sm": "4px", "md": "8px", "lg": "12px", "full": "9999px" },
  "motion": {
    "fast": "120ms",
    "normal": "200ms",
    "easing.standard": "cubic-bezier(0.2, 0, 0, 1)"
  },
  "breakpoints": { "sm": "640px", "md": "768px", "lg": "1024px", "xl": "1280px" }
}
```

### 17.4 目录结构

```
prd-ui-pipeline/
  docs/
  samples/
    sample-prd.md
  projects/
    <project>/
      project.yaml
      prd/
      page-spec/
      design-system/
      assets/
      review/
      handoff/
  design-system/
    ingest/
    registry/
    snapshots/
    baseline/
      b-dense/
      c-expressive/
  pipeline/
    orchestrator/
    agents/
    validators/
    spec/
    assets/
    render-html/
    render-figma/
    sandbox/
    studio/
    handoff/
  runs/
  out/
```

### 17.5 术语表

| 术语 | 定义 |
|---|---|
| UI Brief | 已确认的 UI 意图，包含页面、角色、状态、字段、流程、资产 |
| Page Spec | 可执行的设计契约，HTML/Figma/切图的唯一来源 |
| Design Profile | 一套库的 tokens、排版、动效、图标/插画风格 |
| Catalog | 组件契约 + HTML/Figma 实现映射 |
| Archetype | 页面原型（列表/详情/表单/设置/概览/Feed/Auth/Onboarding） |
| Asset Manifest | 资产清单，记录来源、文件、授权、完成状态 |
| Verification Sandbox | 隔离的验证环境，运行测试 Subagent |
| Review Gate | PRD 是否 UI-ready 的评审与人工签核门禁 |
| Degraded | 降级产物，功能可用但存在已知限制，需在交付报告中标注 |
| PDS | Plumb Design Spec，调研阶段的参考设计图结构，不作为本项目契约 |

---

## 18. 用户输入与默认值

以下输入会影响 Phase 1/2 的落地细节，但不改变架构。每项都给出默认值；未提供时按默认执行。

| 输入 | 默认值 | 影响 |
|---|---|---|
| 真实 PRD | Phase 2 前提供；Phase 1 使用 `samples/sample-prd.md` | 页面清单、字段、状态、页面矩阵 |
| 设计系统来源 | 项目创建时选择 baseline / import / hybrid；可后补 | 使用现有组件还是基线；缺失来源走 fallback |
| 两套库命名 | `b-dense` / `c-expressive`（内部代号，可替换） | 目录与 profile 名称 |
| 首版页面矩阵 | 8 页矩阵（见 13.1） | 若真实 PRD 只覆盖一端，另一端用样本页验证 |
| 字体 | Noto Sans SC + Inter；品牌字体通过 profile override 接入 | 字体加载、授权、视觉风格 |
| Figma 交付文件 | 新建文件；目标文件路径作为配置项 | 插件运行位置与权限 |
| 仓库形态 | ① 独立项目目录 `projects/<project>/` | 不与产品代码共用；后续可迁移 |
| handoff 自动化 | 只打 tag；不自动 commit/push | 人工控制 Git 历史 |
