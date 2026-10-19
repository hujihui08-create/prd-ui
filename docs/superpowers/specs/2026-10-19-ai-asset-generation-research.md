# AI 生成 Icon / 海报 / 插画 · 调研与风险备忘录

- 日期：2026-10-19
- 状态：调研完成，决策已确认（2026-10-19）
- 关联：`docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md` §8.7 / §9、`docs/superpowers/specs/2026-10-19-phase-1c-renderer-risks.md`
- 问题：产出高保真设计图和原型时，AI 能否承担 icon、海报、插画等资产生成？风险是什么？怎么接进 Asset Compiler？

## 0. 结论摘要

1. **标准 UI 图标不要用文生图。** 不可编辑、无法继承 `currentColor`、无法保证 24px 网格/1.5px 线宽/圆角一致；即使矢量模型能出 SVG，也需要规范化与人工审校。
2. **AI 可以用于“自定义图标草稿”和“插画/海报视觉”，但只能作为候选资产，不是直接交付物。** 必须经过矢量规范化、栅格/矢量校验、风格一致性检查、授权/来源记录和人工签核。
3. **AI 海报最大的问题不是“不好看”，而是文字、品牌一致性和版权。** 2026 年英文短文案已明显改善，中文仍不稳定；品牌关键文字应由 HTML/Figma 的确定性文本层叠加，不能烘焙进 AI 位图。
4. **版权是“双重风险”：** 纯 AI 生成物可能既侵犯第三方权利，又因缺乏人类作者而不受版权保护（美国最高法院 2026 年 3 月拒绝复审 *Thaler v. Perlmutter*，维持人类作者要求）。需要人类创作贡献、来源记录、商标检索和工具条款审查。
5. **建议策略：library-first + AI-assisted draft + deterministic text/layout + human review + provenance。** 标准图标走 Lucide/Tabler/Iconify；自定义图标允许 AI 矢量草稿；插画/海报允许 AI 图像；文字、logo、产品截图永远用确定性图层，不交给 AI 重绘。

### 0.1 已确认决策（2026-10-19）

1. **AI 资产范围**：标准 UI 图标只用图标库；自定义/品牌图标允许 AI 原生矢量草稿；插画、海报图像层允许 AI；文字/logo/产品截图用确定性图层。
2. **工具路线**：先用固定小样本（8 个标准风格图标 + 2 个品牌图标 + 1 张中文海报 brief）评测 Recraft vs Adobe Firefly，再决定采购/接入。
3. **风格参考**：先用现有 `b-dense` / `c-expressive` 基线与 8 页 sample；品牌手册/参考图后续通过 adapter 接入。
4. **审校责任**：AI 资产都是 candidate；由用户/设计负责人签核后才能冻结并进入 handoff；标准图标库资产不逐项审。
5. **海报范围**：首版交付 1–2 张；AI 只出图像层，文字/logo/产品截图确定性叠加，中文逐字校对，印刷规格检查。
6. **内容**：按“内容细化”处理——真实业务数据、各状态文案、无 lorem ipsum；与 Content Model 一起落地。

## 1. 调研范围与方法

- 范围：UI 图标（线性/面性/双色）、插画（空状态/错误/引导/Hero）、海报/营销图（含中文文案）、产品截图类素材。
- 方法：2026 年公开资料与官方文档（Recraft、Adobe Firefly、Figma AI、Lucide/Iconify）、2026 年研究（LoRAicon、PosterCraft）、版权判例（Thaler v. Perlmutter），结合本项目现有资产管线设计。
- 说明：文生图工具迭代很快，具体模型能力以采购/接入时实测为准；本文给的是风险框架与准入规则，不是对某个工具的永久结论。

## 2. AI 做 Icon 的现状与问题

### 2.1 失败模式（按严重度）

| 失败模式 | 表现 | 为什么难修 |
|---|---|---|
| 不可编辑/不可切图 | 输出位图或“看起来像矢量”的位图；无法改线宽、颜色、锚点 | 文生图模型的输出是像素；转矢量是 lossy，路径会碎、节点爆炸 |
| 风格/细节漂移 | 同一套图标里线宽、圆角、视觉重量、细节层级不一致 | 每次生成是独立采样；通用模型缺少“整套一致性”约束 |
| 网格/线宽不达标 | 不是 24px 网格、线宽不是 1.5px、端点/圆角不统一 | 模型不懂设计系统的几何约束；需要后处理/校验 |
| 颜色不可继承 | 颜色写死，无法 `currentColor` / 变量绑定 | 位图或填色路径；需要重新着色/绑定 |
| 语义偏差 | 画错隐喻（“设置”画成齿轮+扳手+滑块）、过度细节、含文字 | 模型对功能语义和图标规范理解不足 |
| SVG 路径质量差 | 路径冗余、分组混乱、数字精度漂移、圆不圆 | LLM/SVG 生成对数字和几何约束不擅长；需要 SVGO/重绘 |
| 可复现性差 | 同一 prompt 重跑结果不同，无法稳定重建 | 采样随机性；需要固定模型版本/seed/参考图 |

### 2.2 2026 年的进展

- **原生矢量模型**：Recraft V4/V4.1 Vector 直接生成可编辑 SVG；支持 1–10 张参考图的 V4 Styles、批量生成和矢量编辑器；官方博客把“一致风格的图标”作为用例。局限：SVG 可能仍有冗余路径，需要清理；免费版图片公开且不可商用；V4 的样式创建/编辑能力有版本差异，需实测。
- **Adobe Firefly / Illustrator Text to Vector**：输出可编辑矢量，商用安全叙事强（licensed Adobe Stock + public domain、Content Credentials）；风格参考/结构参考可用，但批量一致性和“一次定义、整套复用”弱于 Recraft；企业版 IP indemnification 需按合同确认，第三方模型不自动继承。
- **Figma AI**：可生成图片/矢量、Weave 工具、Write-to-Canvas 用设计系统生成内容；适合在 Figma 内迭代，但不是专门的“整套图标一致性引擎”；部分功能 Beta，按 credit 计费，Org/Enterprise 有可选版权保护 addendum。
- **研究进展**：LoRAicon（KN Journal, 2026）用 SDXL + LoRA 在图标集上微调，用户研究显示整体一致性“good”，但设计师仍能看出线宽/视觉重量差异；研究还指出通用模型“风格、细节、尺寸漂移”，需要反复执行和 prompt 迭代。CANVAS/Iconix 等工作在探索长上下文一致性和图标网格控制，但还不是开箱即用的生产管线。
- **LLM 直接写 SVG**：适合简单几何图标，但路径数字/控制点/分组质量不稳定；需要强约束、模板和测试，不适合作为整套图标的主路径。

### 2.3 判断

- **标准 UI 图标（导航、操作、表单、状态）**：必须走锁定图标库（Lucide/Tabler/Iconify），保证网格、线宽、`currentColor`、授权和一致性；AI 不参与。
- **品牌/自定义图标（产品特有隐喻、品牌图形）**：可以让 AI 出矢量草稿（优先 Recraft/Firefly Text to Vector），但必须经过：SVG 规范化 → 24px 网格/1.5px 线宽/圆角/端点校验 → `currentColor`/变量绑定 → 与现有图标集并排一致性检查 → 人工设计审校 → 资产来源/授权记录。
- **不要**把文生图位图直接当图标；不要用“看起来像矢量”的 PNG 交付；不要让 AI 在图标里写文字。

## 3. AI 做海报/插画的现状与问题

### 3.1 文字是最大风险

- 2026 年英文短文案（2–3 词）已较可靠，但长文案、小字号、中文仍不稳定；有评测称英文接近 100%，中文约 90%（模型/基准差异大），意味着批量生产仍会出现错字。
- 实际案例：中文海报出现“烂字/错字”、残留水印、版面混乱；社媒/餐饮场景已被公开吐槽。
- 研究：PosterCraft（ICLR 2026）把文字渲染、版面、风格一致性作为训练目标，文字准确率 0.735，接近 Gemini 2.0-Flash 的 0.746，但仍不是 100%；开源模型可自部署，但需要 GPU 和工程化。
- **结论**：品牌关键文字不能依赖 AI 位图。正确做法是 AI 只生成背景/氛围/插画，文字、logo、按钮、标签用 HTML/Figma 的确定性文本层叠加；海报如果必须出位图，文字层单独渲染并合成。

### 3.2 品牌一致性

- 跨批次风格漂移：颜色温度、字体感觉、留白、构图会变；即使写“统一风格”prompt，批量仍像不同人做的。
- 产品截图/logo 被“重绘”：image-to-image 会把真实 UI/文字改掉，生成不存在的界面，属于品牌事故。
- 风格锁定需要：参考图（1–10 张）、固定 style pack、固定模型版本/seed、色板/字体/构图约束、批量生成后人工筛选。
- **结论**：海报/插画可以 AI 生成图像层，但品牌层（logo、字体、色板、产品截图、文案）必须是确定性资产。

### 3.3 版权/商标

- **纯 AI 生成物可能无版权**：美国最高法院 2026 年 3 月拒绝复审 *Thaler v. Perlmutter*，维持“人类作者”要求；纯 AI 输出可能进入公有领域，别人可自由使用，你也难以维权。
- **可能侵权**：训练数据包含版权作品/商标；输出可能与他人作品/品牌混淆；商标侵权看“混淆可能性”，不知情不免责；工具可能注入真实品牌 logo/产品形状。
- **工具条款差异**：商用许可、训练数据来源、 indemnification、Content Credentials 各不相同；免费版常限制商用；第三方模型不一定继承平台的安全承诺。
- **缓解**：人类实质性创作（选择、组合、修改、版式/文字层）、来源记录（模型/版本/prompt/seed/参考图/人工修改）、商标检索、避免“in the style of 某品牌/艺术家”、使用商用安全工具、交付包附授权清单。

## 4. 工具能力矩阵（2026-10 视角）

| 工具/路径 | 矢量原生 | 风格一致性 | 文字 | 商用/授权 | 适合 |
|---|---|---|---|---|---|
| Lucide / Tabler / Iconify | 是（SVG） | 库内一致 | 无 | ISC/MIT 等，明确 | **标准 UI 图标首选** |
| Recraft V4/V4.1 Vector | 是（SVG） | 强（V4 Styles，1–10 参考图，批量） | 弱 | 免费版公开/非商用；付费需确认 | 自定义图标草稿、品牌图形、插画 |
| Adobe Firefly / Text to Vector | 是（可编辑矢量） | 中（风格参考，批量弱） | 弱 | 商用安全叙事强；企业 indemnification 看合同 | 已有 Adobe 工作流、商用敏感项目 |
| Figma AI | 部分（图片/矢量/Weave） | 中 | 中 | Beta/credit；Org/Enterprise 版权 addendum | Figma 内迭代、设计系统内生成 |
| GPT Image 2 / Seedream / Nano Banana / Qwen-Image | 否（位图） | 中 | 英文较好，中文不稳 | 按平台条款 | 海报/氛围图，文字后期叠加 |
| Midjourney / Flux / SDXL + LoRA | 否（位图） | 可训练到强 | 弱 | 按模型/训练数据，风险高 | 风格化插画/概念图 |
| LLM 直接写 SVG | 是（代码） | 弱到中 | 取决于模板 | 代码/模型条款 | 简单几何图标、原型验证 |

## 5. 风险登记（AI 资产专项）

| ID | 风险 | 概率 | 影响 | 等级 | 缓解 | 触发信号 |
|---|---|---|---|---|---|---|
| AI-01 | 整套图标风格/线宽/视觉重量不一致 | 高 | 高 | P0 | 标准图标用库；自定义图标走参考图/风格锁定 + 并排一致性检查；AI 只出草稿 | 同一套图标像不同人画的；设计师一眼看出线宽差异 |
| AI-02 | 输出不可编辑/非真正矢量 | 高 | 高 | P0 | 只接受原生 SVG（或可编辑矢量）；禁止 PNG 当图标；SVGO/路径检查；必要时人工重绘 | 路径节点爆炸、无法改色、无法 currentColor |
| AI-03 | 网格/线宽/圆角/端点不符合设计系统 | 高 | 中高 | P1 | 24px 网格、1.5px 线宽、圆角/端点规则；自动校验 + 人工审校 | 图标在 16/20/24px 下模糊/错位 |
| AI-04 | 语义错误/过度细节/含文字 | 中高 | 高 | P1 | 明确图标语义清单；禁止文字；人工确认隐喻；小尺寸可读性测试 | “设置”画成奇怪组合；图标里有字母/数字 |
| AI-05 | 海报文字错字/乱码（尤其中文） | 高 | 高 | P0 | 文字层用 HTML/Figma 确定性渲染；AI 只出图像层；如必须位图文字，人工逐字校对 | 中文错字、缺字、水印、字距异常 |
| AI-06 | 品牌一致性漂移 | 高 | 中高 | P1 | 固定 style pack + 参考图 + seed + 模型版本；批量后人工筛选；品牌色/字体/构图约束 | 多张海报像不同品牌/不同人做的 |
| AI-07 | AI 重绘产品截图/logo | 中高 | 高 | P0 | 产品截图/logo 用真实资产合成；禁止 image-to-image 重绘 UI；输出前比对 | 界面文字/按钮被改；logo 变形/伪造 |
| AI-08 | 版权/商标侵权 | 中 | 高 | P1 | 商用安全工具；避免品牌/艺术家风格 prompt；商标检索；来源记录；人类创作贡献 | 输出疑似某品牌/角色/产品；工具条款不清 |
| AI-09 | 纯 AI 作品无版权保护 | 中高 | 中高 | P1 | 人类实质性修改/组合/版式；记录创作过程；关键资产人工重绘 | 资产完全由 AI 一次生成、无人工修改 |
| AI-10 | 不可复现/无法重建 | 高 | 中 | P1 | 固定模型版本/seed/参考图/prompt；缓存；资产 manifest 记录；保留源文件 | 重跑同一 prompt 结果不同；无法追溯版本 |
| AI-11 | 成本/延迟/供应商锁定 | 中 | 中 | P2 | 预算/配额；批量离线生成；保留 library/fallback；多供应商评估 | 生成排队/超时；价格/条款变化 |
| AI-12 | 安全/提示注入/恶意 SVG | 中 | 中高 | P1 | SVG 清洗（去 script/外链/事件）；prompt 当数据；输出隔离；CSP | SVG 含脚本/外链；生成内容异常 |
| AI-13 | 可访问性/对比度不足 | 中 | 中 | P1 | 对比度校验；`currentColor`；16/20/24px 可读性；焦点/禁用状态 | 小尺寸不可辨；对比度不达标 |
| AI-14 | 人工审校成为瓶颈 | 高 | 中 | P1 | 只让 AI 做“候选”；定义审校 SLA/抽样；标准图标不进入审校 | 每张图都要改；审校排队 |

## 6. 建议的资产策略

### 6.1 资产类型 × AI 准入

| 资产类型 | AI 是否可用 | 推荐路径 | 必须通过的检查 |
|---|---|---|---|
| 标准 UI 图标 | **否** | Lucide/Tabler/Iconify 锁定家族 | 网格/线宽/currentColor/授权 |
| 自定义/品牌图标 | **仅草稿** | 原生矢量模型（Recraft/Firefly）或人工绘制 | SVG 有效、24px 网格、1.5px、圆角/端点、并排一致性、人工审校 |
| 空状态/错误/引导插画 | **是** | 风格包 + 参考图 + seed + 后处理 | 无 UI 文字/logo/按钮；风格一致；@2x/@3x；授权 |
| Hero/海报图像层 | **是** | AI 生成背景/氛围/主体，文字/logo/UI 后期叠加 | 无错字（文字层）、无伪造 logo/截图、分辨率/出血/色彩模式、人工审校 |
| 产品截图 | **否** | 真实截图/真实 UI 渲染 | 不得 AI 重绘；内容一致 |
| 图标字体/sprite | **否** | 由通过审核的 SVG 生成 | 构建校验 |

### 6.2 Asset Compiler 接入方式

```
资产声明（UI Brief / Page Spec assetRef）
  → 选型（library / ai-vector / ai-raster / upload / placeholder）
  → 生成/获取（AI 只产出候选）
  → 规范化（SVGO、viewBox、currentColor、命名）
  → 校验（格式/网格/线宽/路径/对比度/文字/授权）
  → 人工审校（自定义图标、插画、海报）
  → 冻结（manifest + hash + 来源 + 版本）
  → 导出（SVG / PNG @1x/2x/3x / sprite）
```

**Asset Manifest 扩展字段**：

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

### 6.3 验收门禁

- **Icon gate**：SVG 合法；`viewBox="0 0 24 24"`；stroke 1.5；`currentColor`；无 `<text>`/`<script>`/外链；路径复杂度阈值；16/20/24px 可读；整套并排一致性；授权/来源记录。
- **Poster gate**：文字层是确定性文本（非 AI 位图）；logo/产品截图真实；中文逐字校对；分辨率/出血/CMYK（如印刷）；无商标混淆；人工签核。
- **Illustration gate**：无 UI 文字/图标/按钮；风格与参考一致；透明底/裁切正确；@2x/@3x；授权/来源。
- **Provenance gate**：模型/版本/prompt/seed/参考图/人工修改/许可证齐全；可复现。

## 7. 对 Phase 1C 的影响

1. **Asset Compiler 增加 `ai-vector` / `ai-raster` 两种 origin**，但默认仍是 `library`；AI 资产默认 `candidate`，未审核不能进 handoff。
2. **Page Spec 不直接引用 AI 产物**；只引用 asset ID；manifest 记录来源。渲染器不关心资产怎么来的，只消费冻结后的文件。
3. **视觉门禁增加 AI 资产专项断言**：图标网格/线宽/currentColor；海报文字层；logo/截图真实性；来源/授权。
4. **现有设计文档 §9.1 “图标不使用文生图模型” 保留为默认规则**，补充例外：自定义图标可使用原生矢量 AI 草稿，但必须过规范化/审校；标准 UI 图标仍然禁止。
5. **风险登记新增 AI-01..AI-14**，与 Phase 1C 的 R1–R18 并列；AI-01/AI-02/AI-05/AI-07 为 P0。

## 8. 待讨论的问题

1. **AI 具体用在哪几类资产？** 只做插画/海报图像层，还是也要做自定义图标？标准 UI 图标是否坚持 100% 图标库？
2. **品牌参考资产是否可用？** 是否有品牌手册、参考图、现有图标集，用来做 style pack / 一致性对照？
3. **工具偏好/采购约束？** Recraft（原生矢量、风格一致性强）vs Adobe Firefly（商用安全、Adobe 工作流）vs 自部署（Flux/PosterCraft）；是否需要企业级 indemnification？
4. **审校责任人是谁？** 自定义图标/插画/海报由谁签核？是否接受“AI 候选 + 人工定稿”的流程？
5. **“内容虚化”具体指什么？** 是内容细化、内容占位、还是对 AI 生成内容做模糊/脱敏？确认后再并入 Content Model。

## 9. 来源

- Recraft 官方博客（V4/V4.1 Vector、V4 Styles、图标一致性、矢量编辑器）：https://www.recraft.ai/blog
- Adobe Firefly 官方页（矢量生成、商用安全、Content Credentials）：https://www.adobe.com/products/firefly.html
- Figma AI 官方页（图片/矢量/Weave、Write-to-Canvas、Beta/credit、版权 addendum）：https://www.figma.com/ai/
- LoRAicon 论文（KN Journal of Cartography and Geographic Information, 2026）：https://link.springer.com/article/10.1007/s42489-026-00211-w
- PosterCraft（ICLR 2026，文字渲染/版面/风格一致性）：https://github.com/MeiGen-AI/PosterCraft
- *Thaler v. Perlmutter*（美国最高法院 2026-03-02 拒绝复审，维持人类作者要求）：https://www.supremecourt.gov/
- Lucide 图标库（SVG、currentColor、开源许可）：https://lucide.dev/
- Iconify（图标集聚合/授权）：https://iconify.design/
- WCAG 2.1（对比度/可访问性）：https://www.w3.org/TR/WCAG21/
- SVGO（SVG 规范化）：https://github.com/svg/svgo

> 说明：部分 2026 年工具评测/行业数据来自公开搜索摘要，具体数值随模型版本和基准变化；接入前需用固定 brief 做并排实测，并以官方条款为准。
