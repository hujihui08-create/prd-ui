# 资产来源切换与 Agent 评审策略（Icon / Illustration / Poster）

- 日期：2026-10-20
- 状态：策略定稿，待接入 Asset Compiler
- 关联：`2026-10-19-ai-asset-generation-research.md`、`2026-10-20-illustration-system-research.md`、`2026-10-19-phase-1c-renderer-design.md`
- 范围：图标、插画、海报的 A（专业库）/ B（AI 原生矢量/图像）/ C（高级包/委托/上传）三类来源，统一评审、重试、切源、降级与审计。

## 0. 结论

1. **A/B/C 都保留，不做单来源锁定。** 来源是适配器；评审和编排是核心。
2. **每个来源最多尝试 3 次。** 每次都是“一个候选 + 规范化 + 硬门禁 + 独立 Agent 评审”；3 次不过 → 切下一个来源。
3. **Agent 评审必须独立于生成 Agent。** 生成方不自评；评审 Agent 只拿 brief、风格包、候选和硬门禁结果，输出结构化 verdict。
4. **切源/降级必须可解释、可审计。** 记录来源、尝试次数、评分、失败原因、成本、最终签核；禁止静默替换。
5. **全部来源失败 → 人工升级 / 中性占位并阻断最终交付。** 不把“没做出来”伪装成“已完成”。
6. **Icon 与插画共用同一状态机，但门禁和来源顺序不同。** 标准图标库优先；AI 图标只做兜底且必须过更严格的矢量/一致性门禁。

### 0.1 已确认决策（2026-10-20）

1. **标准 UI 图标链**：A 库 → C 委托/补库 → B AI 矢量（质量优先）。
2. **品牌关键插画链**：C 委托 → B AI 矢量 → A 库（质量优先）。
3. **预算**：A/B 自动生成每资产最多 9 次、$1.0、30 分钟；超预算或 C 委托不设硬金额上限，但必须人工 review/审批。
4. **通过线（最严）**：任一维 ≥4、平均 ≥4.5；品牌关键资产平均 ≥4.8。
5. **人工签核**：B/C 或自定义资产全量签；标准库图标抽检。

## 1. 来源定义

| 来源 | 图标 | 插画 | 海报 |
|---|---|---|---|
| **A · 专业库** | Lucide/Tabler/Iconify/Material Symbols | unDraw/Blush/Storyset/Open Peeps 等 | 库存图/模板库 |
| **B · AI** | AI 原生矢量（Recraft V4 Styles Vector / Firefly Text to Vector） | AI 原生矢量或栅格（按场景） | AI 图像层（文字/logo 后期叠加） |
| **C · 高级/定制** | 委托/内部手绘/付费图标包 | Envato/Creative Fabrica/IconScout/插画师 | 设计/摄影/委托 |

所有来源最终都进入同一 `AssetManifest`；Page Spec 只引用 `assetRef`。

## 2. 默认来源链（可按项目覆盖）

| 资产类型 | 默认链 | 理由 |
|---|---|---|
| **标准 UI 图标**（导航/操作/表单/状态） | **A → C → B** | 库最稳；缺口优先补库/委托；AI 只做兜底，过严格矢量/一致性门禁 |
| **自定义/品牌图标** | **B → C → A** | AI 矢量先出品牌草稿；不满意转委托；最后才用库内近似 |
| **通用插画**（空态/错误/引导/卡片） | **A → B → C** | 库最快最稳；库不够品牌化再 AI；最后才走高级/委托 |
| **品牌关键插画**（首页/主视觉/IP） | **C → B → A** | 先委托/设计师做品牌关键插画；不够用 AI 矢量兜底；库只做参考 |
| **海报图像层** | **B → C → A** | AI 出氛围/主体；文字/logo/截图永远确定性叠加；C 做品牌级定稿 |
| **产品截图/Logo** | **不生成** | 真实资产合成；禁止 AI 重绘 |

> “降级”在本策略里是**来源切换 + 质量下限**：先走默认链；每次失败有记录；最终如果只能用低一档来源，必须在 handoff 标注 `degraded`。  
> 也可以按项目改链，例如品牌项目把插画默认改成 `B → C → A`；测试项目保持 `A → B → C`。

## 3. 状态机

```text
ASSET_REQUEST
  → BRIEF（场景/图标语义、风格包、尺寸、禁用元素）
  → SOURCE_SELECT（按资产类型取链）
  → 对每个来源 SOURCE：
       attempt = 1
       while attempt <= 3:
          PRODUCE（库检索 / AI 生成 / 上传）
          NORMALIZE（SVG 清理、色板映射、命名、尺寸）
          HARD_GATE（格式/安全/授权/无文字/网格/线宽…）
          AGENT_REVIEW（独立评审 Agent，结构化 verdict）
          if PASS:
             if 来源需要人工签核（B/C 或自定义）:
                HUMAN_SIGNOFF
             FREEZE → MANIFEST → DONE
          if RETRY and attempt < 3:
             attempt += 1（带评审建议重试）
          else:
             RECORD_FAILURE
             break
       next SOURCE
  → 全部来源失败:
     HUMAN_ESCALATION（或中性占位 + unresolved；最终 handoff 阻断）
```

### 3.1 “一次尝试”的定义

一次尝试 = **一个候选资产**完成规范化并通过/未通过评审。  
同一来源内换 prompt、换 seed、换库内场景都算新的尝试；不能无限微调。

### 3.2 预算

- 每个来源最多 **3 次**；
- 每个资产总尝试上限 **9 次**（3 来源 × 3）；
- 每个资产总成本/时间上限（A/B 默认 $1.0 / 30 分钟）；超预算或 C 委托不设硬金额上限，但必须人工 review/审批；
- 超预算 → 停止生成，进入人工升级；不允许“再试一次”绕过预算。

## 4. Agent 评审

### 4.1 角色隔离

- **Producer**：库检索 / AI 生成 / 上传，不评分。
- **Reviewer**：独立 Agent，只拿 brief、style spec、候选、硬门禁结果；输出 verdict。
- **Human Design Owner**：B/C 或自定义资产的最终签核；标准库图标只做抽检。
- **Orchestrator**：计数、预算、切源、落盘、阻断。

### 4.2 Verdict Schema

```json
{
  "verdict": "pass",
  "hardIssues": [],
  "scores": {
    "brandFit": 4,
    "semantics": 5,
    "consistency": 4,
    "editability": 4,
    "composition": 4
  },
  "suggestedChanges": [],
  "reason": "语义清晰、三张风格一致、SVG 可编辑；品牌贴合度 4。"
}
```

- `verdict`: `pass` / `retry` / `fallback`
- `hardIssues`: 硬门禁问题（不可通过重试修复的，直接 fallback）
- `scores`: 1–5；**任一维度 < 4 → 不允许 pass**；平均 ≥ 4.5 才 pass；品牌关键资产平均 ≥ 4.8
- `retry`: 问题可在同一来源内修复（换 prompt/换场景/调整构图）
- `fallback`: 该来源无法满足（库无场景、AI 不矢量、授权不清、连续 3 次不过）

### 4.3 硬门禁 vs 软评分

| 类型 | Icon | Illustration | Poster |
|---|---|---|---|
| 硬门禁 | SVG 合法、24px 网格、线宽、currentColor、无文字/脚本、授权 | 矢量/格式、色板 token、安全区、无文字/logo/UI 截图、授权 | 文字层确定性、真实 logo/截图、无商标混淆、印刷规格、授权 |
| 软评分 | 语义、视觉重量、圆角/端点一致、16/20/24px 可读、品牌贴合 | 品牌贴合、场景语义、构图层次、三张一致性、细节层级、人物风格 | 品牌贴合、构图、信息层级、氛围 |

## 5. 切源/降级触发

满足任一即切下一个来源：

1. 同一来源连续 3 次未 pass；
2. 硬门禁出现该来源无法修复的问题（例如库无此场景、AI 输出不可矢量、授权不明）；
3. Agent 评分任一维度 < 3，且评审建议无法在同一来源内解决；
4. 超出该资产的时间/成本预算；
5. 人工评审否决。

**最终降级**：

- 所有来源失败 → `unresolved` 占位 + 人工升级；
- 最终 handoff 中 `unresolved` 阻断交付；
- 如果最终用了低一档来源（例如标准图标用 AI 兜底），manifest 标 `degraded: true` 和 `degradedReason`，handoff 可见。

## 6. 记录与审计

`AssetManifest` 增加：

```json
{
  "id": "illus-home-quick-actions",
  "kind": "illustration",
  "sourceTier": "B",
  "source": "ai-vector",
  "tool": "recraft",
  "model": "v4-styles-vector",
  "prompt": "...",
  "seed": 12345,
  "referenceAssets": ["..."],
  "attempts": [
    {
      "source": "A",
      "attempt": 1,
      "verdict": "retry",
      "scores": { "brandFit": 2, "semantics": 4, "consistency": 3, "editability": 5, "composition": 3 },
      "issues": ["too generic", "no brand character"],
      "cost": 0,
      "timestamp": "2026-10-20T10:00:00Z"
    }
  ],
  "fallbackFrom": "A",
  "fallbackReason": "library scene too generic after 3 attempts",
  "degraded": false,
  "review": { "agent": "asset-reviewer", "human": "design-owner", "status": "approved" },
  "license": "commercial",
  "files": [{ "path": "assets/illustrations/home-quick-actions.svg", "format": "svg" }],
  "hash": "sha256:..."
}
```

- 每次尝试都要落盘；不能只记录最后一次。
- Run log 记录切源原因和预算消耗。
- Handoff 的 `ai-provenance.json` / `licenses` 同步。

## 7. Icon 专项规则

- **标准图标链 A → C → B**：库优先；库缺 → 委托/补库；最后 AI 矢量兜底。
- AI 图标必须过：SVG 合法、24px 网格、1.5px 线宽、圆角/端点一致、currentColor、无文字、无脚本/外链、整套并排一致性、16/20/24px 可读。
- AI 图标不能直接入库：必须人工审校 + manifest 记录 model/prompt/seed/review。
- 自定义图标链 B → C → A：AI 先出品牌草稿；3 次不过转委托；库只做近似参考。
- 任何情况下都不接受 AI 位图当图标。

## 8. 插画专项规则

- 通用插画链 A → B → C；品牌关键插画 B → C → A。
- 一次生成/检索只针对一个场景；三张场景必须同一风格包。
- 插画必须过：无文字/logo/UI 截图、安全区、色板 token、矢量/格式、风格一致性。
- 当前 80×56 的“图标拼贴”不算插画；画布至少 96×72，建议 120×80，含背景/中景/前景。
- AI 插画参考图不能使用 unDraw 等禁止 AI 训练的素材；用自有品牌/截图/已授权素材。

## 9. 接入 Phase 1C

项目配置：

```yaml
assets:
  icon:
    chain: [library, commission, ai-vector]
    maxAttemptsPerSource: 3
  illustration:
    chain: [library, ai-vector, commission]
    maxAttemptsPerSource: 3
  poster:
    chain: [ai-raster, commission]
    maxAttemptsPerSource: 3
  budget:
    maxAttemptsPerAsset: 9
    maxCostUsd: 1.0
    maxMinutes: 30
```

运行阶段：`assets`（在 compile/validate 之后、render 之前）。
Run state：`asset` 阶段记录每个资产的来源/尝试/评审/冻结状态；有 `unresolved` → 最终 handoff 阻断。
Visual Gate：读取 manifest 的 `sourceTier`/`degraded`/`review`，低一档来源必须在报告中显示。

## 10. 测试

- 状态机单测：首次 pass；第 3 次 pass；3 次 fail → 切源；全 fail → unresolved；预算超限。
- 评审输出 schema 校验；verdict 与分数阈值一致性。
- Manifest 记录完整（attempts/fallback/degraded/review）。
- 图标门禁：网格/线宽/currentColor/无文字/整套一致性。
- 插画门禁：无文字/logo、色板、安全区、三张一致。
- 真实测试：3 个首页插画 + 10 个图标，跑 A/B/C，观察切源是否按策略发生。

## 11. 风险

- **Agent 评审偏差**：需要评分校准集、抽样人工复核、阈值可调。
- **成本/时间失控**：硬预算 + 最大尝试数 + 超限升级。
- **风格混搭**：切源时必须保持同一 style spec；不同来源的资产并排检查。
- **静默降级**：manifest/handoff 必须显示 `degraded`/`fallbackReason`。
- **授权**：每个来源先过 license gate；unDraw 禁止 AI 训练；Storyset 免费版需署名。
- **AI 不可复现**：固定模型版本/seed/参考图；记录 prompt；保留候选。

## 12. 已确认与剩余

已确认决策见 §0.1：

1. 标准图标链 `A → C → B`。
2. 品牌关键插画链 `C → B → A`。
3. B/C 资产全量人工签；标准库图标抽检。
4. A/B 预算 $1.0 / 30 分钟 / 9 次；超预算或 C 委托人工审批。
5. 通过线：单维 ≥4、平均 ≥4.5；品牌关键 ≥4.8。

剩余：具体库/AI 供应商选型、模型/账号/授权、真实资产参考图。

## 13. Visual Style Agent（新增独立角色）

### 13.1 为什么需要

上传组件/设计系统只解决“有哪些组件、props、tokens”，不解决：

- 品牌视觉方向（logo 使用、留白、摄影/插画/图形语言）；
- 插画/图片/海报的场景语义与风格一致性；
- 不同来源（库/AI/委托）之间怎么保持同一套视觉；
- 页面之间的视觉节奏和品牌识别。

因此需要一个独立的 **Visual Style Agent**，负责“视觉风格与资产方向”，不负责组件 API、布局和 Page Spec 结构。

### 13.2 职责

| 职责 | 输出 |
|---|---|
| 从品牌资料/参考图提炼视觉风格包 | `visual-style.json` |
| 定义插画/图标/图片/海报风格规则 | `illustration.style.json`、`image.style.json`、`logo.guidance.md` |
| 把页面意图翻译成资产生成 brief | `asset-briefs/*.json` |
| 选择来源策略（A/B/C 链）与参考图 | `source-policy.json` + `references/` |
| 评审资产是否符合视觉方向 | `style-review.md`（建议，不是最终签核） |
| 维护风格快照，检测跨页漂移 | `visual-style.snapshot.json` |

### 13.3 边界

- **不改组件契约/布局**：组件、props、Page Spec 由设计系统 + Spec Engineer 负责。
- **不自评/不终审**：Visual Style Agent 只给“风格建议/评分”；Asset Reviewer 独立评审；人做最终签核。
- **不自动定稿 logo**：logo/wordmark 必须人工/设计师主导；AI 只做概念探索，需商标检索、矢量重绘、人工签核。
- **不直接生成最终资产**：它定义 brief/参考/风格；Asset Producer 执行；Asset Reviewer 检查。
- **一个产品面一套风格**：不混搭；换风格走显式版本/迁移。

### 13.4 与其他角色的关系

```text
品牌资料 / 现有组件 / 参考图
  → Design System Ingestor（组件/tokens，确定性 + 人）
  → Visual Style Agent（风格包 + 资产 brief + 来源策略）
  → Asset Producer（A/B/C 执行）
  → Asset Reviewer（独立评审）
  → Human Design Owner（签核）
  → Freeze → RenderPlan / Renderer
```

- PRD Reviewer / UI Briefer：内容与结构意图；
- Spec Engineer：Page Spec 结构；
- Visual Style Agent：视觉方向与资产 brief；
- Asset Producer：执行；
- Asset Reviewer / Visual Critic：独立评审；
- Human：最终视觉签核（尤其 logo/IP）。

### 13.5 Logo / 插画 / 图片的特殊规则

| 资产 | 规则 |
|---|---|
| Logo/wordmark | 人工/设计师主导；AI 只做概念；必须商标检索、矢量重绘、人工签核；不得自动生成终稿 |
| 插画 | Visual Style Agent 定风格包 + 场景 brief；A/B/C 生产；Asset Reviewer 检查；人签核 |
| 图片/摄影 | 定图片处理规则（色调、裁切、人物、版权）；AI 只做图像层；真实产品截图/logo 不得重绘 |
| 海报 | 图像层 AI/C；文字/logo/截图确定性叠加；Visual Style Agent 定版式和视觉方向；人签核 |
| 图标 | 标准库优先；自定义图标走 A/B/C 链 + 严格矢量门禁；Visual Style Agent 只定风格，不替代图标工程 |

### 13.6 阶段接入

- Phase 1C.1：建立 `visual-style.json` + `illustration.style.json` + 3 个首页场景 brief；先跑 A/B/C 对比。
- Phase 1C.2：Visual Style Agent 参与 Figma 页面视觉评审（与 Visual Critic 分工：风格方向 vs 截图缺陷）。
- Phase 1C.3：风格快照进入 handoff；跨页一致性检查纳入 Visual Gate。

### 13.7 风险

- **风格漂移**：必须有 style pack + snapshot + 跨页检查。
- **AI logo/IP 风险**：logo 不自动定稿；商标/原创性/授权人工把关。
- **Agent 越权**：不改组件/布局；不替人签核。
- **评审瓶颈**：Visual Style Agent 只做方向/评分；Asset Reviewer 做合规；人只做关键签核。
- **多来源混搭**：一套风格包约束所有来源；切源后重新做并排一致性检查。

