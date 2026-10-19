# 插画通用解决方案 · 调研与落地框架

- 日期：2026-10-20
- 状态：调研完成，待选择测试路径
- 关联：`2026-10-19-ai-asset-generation-research.md`、`2026-10-19-phase-1c-renderer-design.md`
- 背景：当前首页卡片的插画是 80×56 的内联 SVG，偏“图标组合”，不像插画；用户认为“差点意思”。需要通用方案，而不是为这次测试临时找一张图。

## 0. 结论

1. **这不是“换一个插画库”的问题，而是缺一套插画子系统。** 需要把风格规范、场景库、来源适配、规范化、校验、人工审校、版本化都定义出来；库/AI/定制只是“来源”，不是方案本身。
2. **通用架构：IllustrationStyle + IllustrationScene + Source Adapter + Compiler + Gate + Snapshot。** 与图标/资产管线同构，接入 Page Spec 的 `assetRef` 和 Asset Compiler。
3. **测试期建议“三源对比”**：同一组 3 个场景，分别用（A）专业插画库 + 品牌换色、（B）AI 原生矢量（Recraft V4 Styles Vector）、（C）高级/定制插画；按品牌贴合、语义、一致性、可编辑性、授权、成本、时间打分，再决定默认路径。
4. **推荐默认策略：library-first，AI-vector 做自定义/品牌场景，人工审校定稿。** 一个产品面只用一套插画风格；禁止混搭。
5. **当前 80×56 太小、太抽象。** 插画需要更大的画布（建议 96×72 或 120×80）、背景/中景/前景的层次、明确的场景语义，以及一套统一的线宽/圆角/色板规则。

## 1. 为什么现在的插画“差点意思”

| 问题 | 表现 | 根因 |
|---|---|---|
| 尺寸太小 | 80×56，缩在卡片标题右侧 | 插画被当成图标使用 |
| 像图标而非插画 | 单据 + 日历 + 勾选，几何拼贴 | 没有场景、人物、背景、叙事 |
| 风格语言不统一 | 三个插画各自画法，细节层级不同 | 没有 style spec / 参考图 / 组件化 |
| 没有品牌感 | 颜色是 token，但造型和构图通用 | 没有品牌插画风格包 |
| 没有生产规则 | 手写 SVG，改一次画一次 | 没有场景 brief、模板、来源适配、审校 |

**结论**：继续手写 SVG 只会得到“更精致的图标组合”。要提升到插画，需要系统化。

## 2. 通用架构

```text
IllustrationStyle（项目级风格包）
  - palette tokens / 线宽 / 圆角 / 端点 / 透视 / 填充 / 纹理 / 构图 / 人物规则 / 禁用元素
IllustrationScene（场景目录）
  - 语义 ID（quick-actions / empty / error / onboarding / hero）
  - 画布尺寸 / 安全区 / 层次（背景/中景/前景）/ 必需元素 / 禁用元素 / 参考图 / prompt brief
IllustrationSource（来源适配器）
  - library | ai-vector | ai-raster | commission | upload
IllustrationCompiler（编译器）
  - 选型 → 获取/生成 → 规范化（SVG/色板/命名）→ 校验 → 人工审校 → 冻结 → 导出
IllustrationGate（门禁）
  - 风格/色板/矢量质量/无文字/安全区/授权/一致性
IllustrationSnapshot（项目快照）
  - style + scenes + assets + 版本/hash；随项目冻结
```

接入点：

- Page Spec 只引用 `assetRef`（语义 ID），不写像素；
- Asset Compiler 负责来源、规范化、manifest/hash/授权；
- RenderPlan 消费冻结后的插画文件；
- Visual Gate 检查插画与页面/品牌的一致性；
- Handoff 输出 SVG/PNG @1x/2x/3x + 来源/授权。

## 3. 来源方案对比

| 来源 | 代表 | 质量/风格 | 一致性 | 可编辑性 | 授权 | 适合 |
|---|---|---|---|---|---|---|
| 专业插画库 | unDraw、Storyset、Blush、Open Peeps/Humaaans/Open Doodles | 成熟、风格多 | 库内一致；跨库易混 | SVG（部分库免费仅 PNG） | 各不相同，见 §4 | 快速起量、通用场景 |
| AI 原生矢量 | Recraft V4 Styles Vector、Firefly/Illustrator Text to Vector | 可定制、品牌感强 | 参考图/风格包可锁定 | SVG | 按工具条款 | 自定义/品牌场景 |
| 高级/定制 | Envato、Creative Fabrica、IconScout、外部插画师 | 最贴合业务/品牌 | 高（同一作者/风格包） | SVG/AI/EPS | 一次性/订阅/委托 | 品牌 IP、美容/门店场景 |
| 手绘/内部 | 设计团队 | 最高品牌辨识度 | 最高 | 最高 | 自有 | 长期品牌资产 |

**注**：不要用 unDraw 资产训练/微调 AI（其许可明确禁止）；用 AI 生成时，参考图应使用自有素材/品牌截图/已授权素材。

## 4. 授权要点（2026-10 核验）

- **unDraw**：免费商用、无需署名；SVG/PNG；可修改/换色；禁止转售/打包分发/竞争服务；**禁止用于 AI 训练/微调**。
- **Storyset（Freepik）**：免费版需署名 + 每日下载限制；Premium 去署名；SVG/PNG/Lottie/视频；适合动画场景。
- **Blush**：免费版 PNG、Pro 解锁 SVG/全库；商用、无需署名；禁止转售/周边/竞争服务。
- **Open Peeps / Humaaans / Open Doodles**：CC0，最干净，可自由修改/分发；偏人物/手绘。
- **Recraft V4 Styles Vector**：原生 SVG、1–10 张参考图锁定风格、按图计费；商用条款按订阅/API 合同确认。
- **Envato / Creative Fabrica / IconScout**：一次性或订阅商用许可；需看具体 pack 的许可范围。
- **AI 生成物**：纯 AI 可能无版权保护；需人类创作贡献、来源记录、商标检索；详见 `2026-10-19-ai-asset-generation-research.md`。

## 5. 风格规范模板（IllustrationStyle）

```json
{
  "id": "warm-editorial",
  "palette": {
    "primary": "action.primary",
    "secondary": "action.secondary",
    "accentCustomer": "accent.customer",
    "accentInventory": "accent.inventory",
    "ink": "text.primary",
    "surface": "surface.default"
  },
  "line": { "weight": 2, "cap": "round", "join": "round" },
  "geometry": { "cornerRadius": 8, "grid": 4, "perspective": "flat", "organicBias": 0.4 },
  "fill": { "style": "flat", "shading": "none", "texture": "subtle-grain" },
  "composition": { "safeArea": 0.12, "background": "soft-blob", "layers": 3, "detail": "medium" },
  "characters": { "style": "simplified", "proportions": "6-head", "faces": "minimal" },
  "forbidden": ["text", "brand logos", "UI screenshots", "3d-gloss", "heavy-gradients"]
}
```

原则：**选 1 种主风格**；线宽/圆角/色板 token 锁定；背景/中景/前景分层；避免“光滑 AI 渐变/3D 泡泡”这类已显廉价的风格。

## 6. 场景 Brief 模板（IllustrationScene）

```json
{
  "id": "home-quick-actions",
  "purpose": "首页快捷操作卡片",
  "size": "96x72",
  "safeArea": 0.12,
  "layers": {
    "background": "soft blob / warm cream",
    "midground": "front desk + calendar",
    "foreground": "receipt + check + small plant"
  },
  "required": ["appointment calendar", "receipt/check", "front desk", "small plant"],
  "forbidden": ["text", "logos", "UI screenshots"],
  "prompt": "Warm editorial flat illustration, cream background, rose and terracotta accents, rounded shapes, subtle grain, no text, no logos, 96x72.",
  "references": ["style-ref-1.png", "style-ref-2.png"]
}
```

## 7. 测试期方案（三源对比）

用同一组 3 个首页场景：

1. `home-quick-actions`（开单/预约）
2. `home-appointments`（我的预约）
3. `home-callbacks`（待回访）

分别跑三条来源：

- **A. 专业库**：unDraw 或 Blush，按品牌色换色；最快，验证“专业插画”是否立刻改善观感。
- **B. AI 原生矢量**：Recraft V4 Styles Vector，3–5 张参考图 + 结构化 brief；验证品牌感和一致性；需要账号/预算。
- **C. 高级/定制**：Envato/Creative Fabrica 美容 Spa 包，或委托插画师；验证最高品牌贴合度。

评分（1–5）：

| 维度 | 说明 |
|---|---|
| 品牌贴合 | 与暖玫瑰/美容门店气质是否一致 |
| 场景语义 | 是否一眼看懂“开单/预约/回访” |
| 一致性 | 三张是否像同一套 |
| 可编辑性 | SVG 路径/图层/换色是否可用 |
| 授权 | 商用/交付/客户转交是否清晰 |
| 成本/时间 | 获取/生成/审校的总成本 |

决策规则：

- 库方案在品牌贴合/语义/一致性 ≥4 → 可以先用库；
- AI 方案在品牌贴合/一致性 ≥4 且 SVG 可编辑 → 可作为品牌定制路径；
- 只有需要独特 IP/人物/门店场景时才走委托；
- 任何方案都必须过“无文字/无 logo/安全区/色板/授权”门禁。

## 8. 推荐

- **测试期先跑 A（库方案）**：不需要账号，能快速回答“专业插画是否比手写 SVG 明显更好”。建议先试 **unDraw**（无署名、商用、SVG）或 **Blush Pro**（更精致的模块化插画；免费版仅 PNG）。
- **同时准备 B 的评测包**：Recraft V4 Styles Vector 的 3 个场景 brief + 3–5 张风格参考图（用我们自己的 UI 截图/色板，不要用 unDraw 训练）；有账号后跑。
- **长期默认**：library-first；自定义/品牌场景用 AI-vector；关键 IP/人物/门店场景用委托；所有来源统一进 Illustration Compiler + Gate + Snapshot。
- **当前页面**：把插画区从 80×56 提升到 96×72/120×80，三张同一风格；插画放在卡片标题右侧或卡片顶部，不要继续用“图标拼贴”。

## 9. 下一步

1. 写 `illustrations.style.json` + `illustrations.scenes.json`（本测试项目）。
2. 跑 A 方案：选 3 张 unDraw/Blush 场景，换暖玫瑰色，接入首页卡片，截图对比。
3. 准备 B 方案评测包：3 个 prompt + 参考图 + 评分表；有 Recraft 账号后跑。
4. 根据评分确定默认来源，再把 Illustration Compiler 接入 Asset Compiler。

## 10. 参考

- unDraw license：https://undraw.co/license
- Blush license：https://blush.design/license
- Storyset：https://storyset.com/
- Open Peeps：https://www.openpeeps.com/
- Humaaans：https://www.humaaans.com/
- Open Doodles：https://www.opendoodles.com/
- Recraft 官方博客（V4 Styles / Vector）：https://www.recraft.ai/blog
- IconScout illustrations：https://iconscout.com/illustrations
- Envato Elements：https://elements.envato.com/
- Creative Fabrica：https://www.creativefabrica.com/
- Indeed Design / PayPay / 阿里 HiTu 的插画系统方法论：作为行业参考，具体文章链接以官方发布为准。
