# 交接文档 · PRD → UI 管线 / Agent 架构 / DSH 适配

- 日期：2026-10-20
- 工作目录：`/Users/jihui/Desktop/产品、ui`
- 当前分支：`phase-1b-usability`
- 当前 HEAD：以 `git log -1` 为准（M0 提交链见 `CHANGELOG.md`）
- 状态：**checkpoint 已提交；core/runtimes 重排与 M0 asset review 已实现**；真实 dsh 视觉评审待 `PRD_UI_VISION_API_KEY`
- 下一阶段：配置 vision key 跑通真实 dsh 评审；然后 M1 IA/Interaction/Visual Style

> **2026-10-20 实施更新**：目录已重排为 `pipeline/core/*` + `pipeline/runtimes/*`；新增 `asset-review`、standalone/dsh runtime、`samples/assets/m0`、项目内 dsh profile。当前验证：231 tests、typecheck clean、`2 pages / 0 blockers`、`13 assets / 13 passed`；dsh profile 可加载、插件可激活，无 key 时报 `MISSING_CREDENTIAL`。详见 `README.md`、`pipeline/docs/asset-review-m0.md`、`CHANGELOG.md` 和 spec §15。

---

## 0. 快速摘要

已经完成的：

1. Phase 1A/1B 的确定性管线、验证与最终复审收口（157/157 测试，typecheck clean）。
2. 真实测试 PRD（员工端微信小程序）跑通两页切片：`今日` + `库存查询`，`2 pages / 0 blockers`。
3. 新增 `b-mobile` profile/catalog、`home`/`inventory-list` archetype、Content Model、HTML Renderer。
4. 首页曾试过暖玫瑰 + 卡片插画，现已**恢复中性测试基线**；暖玫瑰/插画代码保留为实验能力。
5. 完成 Agent 组织架构、资产来源 A/B/C 降级策略、插画系统调研。

还没做的：

- dsh 适配与 Agent 运行时；
- IA / Interaction / Visual Style / Asset Reviewer 等 Agent 的实际实现；
- Figma Renderer 正式链路；
- 视觉门禁（截图 diff / 录屏 / trace）；
- 资产 Compiler 的 A/B/C 适配器。

---

## 1. 当前真实状态

### 1.1 已验证

```bash
cd "/Users/jihui/Desktop/产品、ui/pipeline"
pnpm test        # 157/157
pnpm typecheck   # clean
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/employee-app-runs
# Phase 1A OK: 2 pages, 0 blockers
pnpm render:html --run /tmp/employee-app-runs/<runId> --out /tmp/employee-app-html
```

产物与截图：

- `pipeline/artifacts/employee-app/html/index.html`（可打开）
- `pipeline/artifacts/employee-app/today-default.png`
- `pipeline/artifacts/employee-app/inventory-default.png`
- 以及 empty/loading/error 截图
- 本地预览：`http://127.0.0.1:4174/`（当前后台 Python server；新会话可能已停）

### 1.2 已实现的代码

| 模块 | 内容 |
|---|---|
| `core/design-system` | `b-mobile` profile/catalog；`home`/`inventory-list` archetype |
| `core/contracts` | `UiBriefPage.content` 内容模型 |
| `core/compiler` | `home`/`inventory-list` 模板 |
| `core/renderer-html` | Page Spec + b-mobile tokens → HTML；默认/空/加载/失败状态 |
| `samples/projects/employee-app` | 两页 UI Brief + project.yaml + manifest |
| `artifacts/employee-app` | 渲染 HTML、截图、README |

### 1.3 还没有的

- 没有 Agent 运行时；
- 没有 IA/Interaction/Visual Style/Asset Reviewer Agent；
- 没有资产 Compiler（A/B/C）实现；
- 没有 Figma Renderer 正式链路；
- 没有视觉 diff / 录屏 / trace 门禁；
- 没有 dsh 安装/插件。

---

## 2. 已确认决策

### 2.1 Phase 1C（视觉交付）

1. 设计系统：先基线（`b-dense` / `c-expressive` / `b-mobile`），后接真实系统。
2. 页面：8 页 sample + 真实切片；首版真实切片为员工端 `今日` + `库存查询`；`客户详情` 第三页。
3. 冲突优先级：`RenderPlan` + tokens 是契约；Figma 管静态视觉，HTML 管行为/动效；冲突只改契约。
4. 视觉验收：runtime 断言 + 截图感知 diff + 人工签核；waiver 有 owner/理由/有效期。
5. 动效：标准预设库；HTML 原型是动效事实源；Figma 只做静态状态帧/标注。
6. AI 资产：标准 UI 图标走库；自定义图标 AI 矢量草稿；插画/海报图像层 AI；文字/logo/截图确定性图层。
7. AI 工具：先小样本评测 Recraft vs Firefly，再定。
8. 海报：首版交付 1–2 张。
9. 内容：按“内容细化”处理，真实业务数据、无 lorem ipsum。
10. **视觉基线（当前）**：已恢复中性测试基线；暖玫瑰 + 首页插画作为实验能力保留，A/B/C 测试时再启用。

### 2.2 Agent 组织

1. **角色型 + 确定性 Orchestrator**，不是管理型 LLM 层级。
2. 新增 **IA Agent**：检查 PRD 页面清单、层级、导航、流程、角色、命名、断链/死路；有 blocker 权，人可 waiver。
3. 新增 **Interaction Design Agent**：交互模型、状态矩阵、motion/动效规范、原型交互评审；不写 keyframes/代码。
4. **Interaction Spec 独立**：`interaction-spec.json` / `motion-spec.json`，Page Spec 只引用 ID。
5. **动效评审证据**：录屏 + Playwright trace。
6. **人工签核**：PRD/IA 与 Brief 全量签；最终视觉/动效关键页 + 抽检。
7. **模型能力分开配置**：IA 强文档推理；Interaction 视频/轨迹理解。
8. **Visual Style Agent 独立**：品牌视觉方向、插画/图片/logo/海报风格、资产 brief；不自动定稿 logo。
9. **动效实现不在 Agent**：Interaction 定规范，HTML Renderer 确定性实现；自定义 Lottie/Rive 由 Motion Producer 产出，Renderer 播放。

### 2.3 资产来源与降级

1. **标准 UI 图标链**：A 库 → C 委托/补库 → B AI 矢量（质量优先）。
2. **品牌关键插画链**：C 委托 → B AI 矢量 → A 库（质量优先）。
3. **预算**：A/B 自动生成每资产最多 9 次、$1.0、30 分钟；超预算或 C 委托不设硬金额上限，但必须人工 review/审批。
4. **通过线（最严）**：任一维 ≥4、平均 ≥4.5；品牌关键资产平均 ≥4.8。
5. **审计**：每次尝试写入 manifest（来源/次数/评分/失败原因/成本）；`degraded` 必须可见；全部失败 → 人工 / unresolved，handoff 阻断。

---

## 3. 目标 Agent 架构

```text
Intake
  ├── PRD Reviewer ──┐
  └── IA Agent ──────┤
                     ▼
              PRD/IA Gate（Human）
                     ▼
                UI Briefer
                     ▼
              Brief Gate（Human）
        ┌────────────┴─────────────┐
        ▼                          ▼
Interaction Design Agent     Visual Style Agent
  interaction-spec             visual-style
  motion-spec                  asset-briefs
        ▼                          ▼
   Spec Engineer              Asset Producer
        ▼                          ▼
   Validators                 Asset Reviewer
        └────────────┬─────────────┘
                     ▼
             HTML / Figma Renderer
                     ▼
   Visual Critic + Interaction Review + Test Subagents
                     ▼
              Final Gate（Human）
                     ▼
                Handoff
```

- Orchestrator 是确定性状态机 + 纯函数 Router；不是 LLM Manager。
- Agent 之间不聊天；只交换磁盘上的结构化产物。
- 人工门禁：PRD/IA、Brief、最终视觉/动效。
- 完整角色/边界/产物/门禁：`docs/superpowers/specs/2026-10-20-agent-organization.md`。

---

## 4. dsh（DeepSeek Harness）适配方案

> 依据 2026-10 公开资料：dsh 是 DeepSeek 开源的 Agent 执行框架（MIT，2026-08-13 发布，Developer Preview 0.1.x），核心是 “Agent = Model + Harness”，plugin-first，Cordis 热插拔内核，`@deepseek-ai/dsh-agent-loop` 提供 ReactLoopAgent（turn/step/Inbox），支持 session trajectory、sandbox、permissions、插件生态。  
> **“DeepSeek Harness Next”怎么理解**：公开资料里它主要指 `@next` 发布通道 / DSH NEXT 桌面版 / v0.2.x 下一代，不是一个独立的稳定 API。`next` 是滚动预览通道，`latest` 可能落后；接入必须锁精确版本，把 `next` 当 canary，不当生产依赖。  
> **注意**：仍是 preview（0.1.x/0.2.x），官方明示会有 breaking changes；接入前以官方文档/实际版本为准，锁版本。

### 4.1 推荐适配原则

**dsh 作为 Agent 执行层，我们的确定性 Orchestrator 仍是控制平面。**

- 不把 dsh 的 ReactLoopAgent 当成整个管线的“管理者”：它可能动态决策、跳过门禁；
- 让 dsh 负责：Agent session、模型调用、工具注册、sandbox、session trajectory、插件生命周期；
- 让我们的 Node/TS Orchestrator 负责：状态机、Router、预算、重试/切源、门禁、人工签核、handoff；
- 两者通过结构化产物 + tool calls 交互，不让 Agent 直接改最终交付目录。

### 4.2 角色 → dsh 映射

| 我们的角色/节点 | dsh 形态 | 说明 |
|---|---|---|
| PRD Reviewer | dsh agent + skill | 文本推理，只读 PRD；输出 JSON |
| IA Agent | dsh agent + tools | 读 PRD/IA；输出 `ia-map`/`ia-findings` |
| UI Briefer | dsh agent + skill | 文本；输出 UI Brief |
| Interaction Design Agent | dsh agent + vision/video tools | 读 Brief/原型/录屏/trace；输出 interaction/motion spec |
| Spec Engineer / Repair | dsh agent + deterministic tools | 调 validators、catalog、renderer |
| Visual Style Agent | dsh agent + vision | 读品牌资料/截图；输出 style pack/brief |
| Asset Producer | dsh tools | 库检索、AI 生成、上传；不评分 |
| Asset Reviewer | dsh agent | 独立评审；输出 pass/retry/fallback |
| Visual Critic | dsh agent | 只看截图；输出 findings |
| Test Subagents | dsh tools/agents | 布局/a11y/Figma/视觉 |
| HTML/Figma Renderer | 确定性工具 | 不交给 LLM；作为 dsh tool 或外部进程 |
| Asset Compiler | 确定性工具 | SVG/图片规范化、manifest |
| Orchestrator | **外部 Node/TS 服务**（推荐）或 dsh plugin | 确定性状态机；调用 dsh tools/agents |

### 4.3 dsh 插件/工具划分（建议）

```text
dsh/
  cordis.yml
  plugins/
    prd-ia/            # PRD Reviewer + IA Agent skills
    interaction/       # Interaction Design Agent
    visual-style/      # Visual Style Agent
    assets/            # Asset Producer tools + Asset Reviewer
    spec/              # Spec Engineer/Repair
    verify/            # Visual Critic + test tools
    renderers/         # HTML/Figma renderer tools
  skills/
  prompts/
  schemas/
  tools/
  tests/
```

- 每个插件用 `defineTool`/`defineSkill` 暴露明确输入/输出；输出 schema 用 Zod/Schemastery。
- 角色 Agent 独立 session；不共享聊天；只通过 workspace/artifacts 交换。
- Reviewer 只读候选 + brief + style pack；Producer 不能自评。
- Agent 只能写 `runs/<runId>/...` artifacts；最终 handoff 由 Orchestrator/Human 写。
- 预算、重试、切源由 Orchestrator 执行；dsh 的 approval/permission 用于高风险工具。
- 使用 dsh 的 session trajectory 做审计/回放；每个 run 保存 trajectory 哈希。

### 4.4 开发里程碑

**M0 · dsh 最小闭环（先做这个）**

- 安装 dsh（Node ≥22；本机 Node 24 已满足）；
- 起 dsh web / 本地 runtime；
- 创建一个 `assets` 插件：
  - `read_asset_brief`
  - `normalize_svg`
  - `validate_icon`
  - `score_asset`（模型/评审）
- 用 3 张插画 + 10 个图标跑 A 库方案，验证：session、tool、artifact、manifest、attempts、fallback。
- 产出：`runs/<id>/assets/**` + `asset-review.json` + `manifest.json`。

**M1 · IA + Interaction**

- `prd-ia` 插件：IA Agent 输出 ia-map/findings；PRD Reviewer 输出 readiness。
- `interaction` 插件：Interaction spec/motion spec；原型评审（录屏 + trace）。
- 用员工端 PRD 跑：IA findings + interaction spec，和人工结论对照。

**M2 · Visual Style + 资产降级 + HTML motion**

- `visual-style` 插件：style pack + scene briefs。
- `assets` 插件接 A/B/C 链、3 次/来源、预算、切源。
- HTML Renderer 接 `motion-spec`；生成录屏/trace。

**M3 · Figma + Visual Gate + Handoff**

- Figma Renderer tool（插件/桥接）；
- Visual Critic + 截图 diff + a11y + 交互评审；
- Handoff packager；人工签核。

### 4.5 dsh 风险

- 0.1.x preview，API/插件契约可能变；锁版本，封装 adapter；
- ReactLoopAgent 不应替代确定性 Orchestrator；
- session/context 隔离要验证；避免 Agent 互相污染；
- sandbox/权限要限制写最终目录；
- 模型 adapter 要支持文本/vision/video；
- 插件热插拔/版本升级要做回归。

---

## 5. 工具清单

### 5.1 已安装

| 工具 | 版本 |
|---|---|
| Node.js | v24.19.0 |
| pnpm | 11.19.0 |
| Python 3 | 3.12.13 |
| ffmpeg | 8.1.2 |
| Chrome | 已安装 |
| Figma 桌面版 | 已安装 |
| Playwright | 1.64.1 |
| Git | 2.50.1 |

### 5.2 需要安装

| 工具 | 用途 |
|---|---|
| `svgo` | SVG 规范化/压缩 |
| `sharp` | 图片缩放/格式转换 |
| `pixelmatch` + `pngjs` | 截图 diff |
| `@resvg/resvg-js` | SVG → PNG（可选） |
| dsh（`@deepseek-ai/dsh` / `npx -y @deepseek-ai/dsh web`） | Agent runtime |

> dsh 安装命令以官方文档为准；当前公开资料给的是 `npx -y @deepseek-ai/dsh web`，Node ≥22。

### 5.3 需要账号/采购

| 来源 | 需要 |
|---|---|
| A 库 | unDraw / Blush / Storyset / Open Peeps 等（多为免费，注意署名/商用限制） |
| B AI | Recraft（V4 Styles Vector）或 Adobe Firefly/Illustrator；API key/credits |
| C 高级/委托 | Envato / Creative Fabrica / IconScout 订阅或单包；或插画师 |
| Agent 模型 | 文本/vision/video 模型 API（DeepSeek/OpenAI/Anthropic/Google 等）；按 dsh model adapter 配置 |
| Figma | 打开 Figma + 运行 Brio MCP 插件（当前未连接）；正式 Figma Renderer 未接 |

---

## 6. 新会话第一步

> 2026-10-20 更新：M0 已实现；下面的步骤 3–4 已过期，保留作为历史。

1. 读 `README.md`、`CHANGELOG.md`、`docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md` §15，以及三份 agent/资产设计文档。
2. `git status`：checkpoint 与 M0 提交已完成；确认工作树干净。
3. 配 `pipeline/.env` 的 `PRD_UI_VISION_API_KEY`，先跑 `--only icon-home --runtime dsh` 验证真实评审；没有 key 时预期 `MISSING_CREDENTIAL`。
4. 再进 M1 IA/Interaction/Visual Style；B/C 真实供应商在 M2。

### 建议的新会话开场

```text
请阅读 README.md、CHANGELOG.md 和 docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md §15。
M0 已完成；先跑 pnpm test / pnpm phase1:verify / pnpm asset:review（standalone），
再配置 PRD_UI_VISION_API_KEY 跑 --runtime dsh 的真实评审。
先不要改 Page Spec/视觉基线。
```

---

## 7. 常用命令

```bash
cd "/Users/jihui/Desktop/产品、ui/pipeline"

pnpm test
pnpm typecheck
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/employee-app-runs
pnpm render:html --run /tmp/employee-app-runs/<runId> --out /tmp/employee-app-html
open /tmp/employee-app-html/index.html

# M0 asset review
pnpm asset:review --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 --runtime standalone --runs /tmp/m0-runs
pnpm asset:review --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0-scenarios --runtime standalone --runs /tmp/m0-scenarios

# dsh headless smoke（需要 PRD_UI_VISION_API_KEY）
DSH_HOME="$PWD/dsh/home" ./node_modules/.bin/dsh --profile prd-ui-assets \
  "Return the JSON {\"ok\":true} and nothing else."

# 本地预览（当前 4174 可能已在跑）
cd pipeline/artifacts/employee-app/html
python3 -m http.server 4174 --bind 127.0.0.1
```

---

## 8. 关键文件地图

| 内容 | 路径 |
|---|---|
| 总体设计 | `docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md` |
| Phase 1C 设计 | `docs/superpowers/specs/2026-10-19-phase-1c-renderer-design.md` |
| Phase 1C 风险 | `docs/superpowers/specs/2026-10-19-phase-1c-renderer-risks.md` |
| AI 资产调研 | `docs/superpowers/specs/2026-10-19-ai-asset-generation-research.md` |
| 插画系统 | `docs/superpowers/specs/2026-10-20-illustration-system-research.md` |
| Agent 组织 | `docs/superpowers/specs/2026-10-20-agent-organization.md` |
| 资产降级策略 | `docs/superpowers/specs/2026-10-20-asset-source-fallback-policy.md` |
| 员工端 PRD 审查 | `docs/superpowers/specs/2026-10-20-employee-app-prd-review.md` |
| b-mobile profile | `pipeline/core/design-system/src/profiles/b-mobile.ts` |
| b-mobile catalog | `pipeline/core/design-system/src/catalogs/b-mobile.ts` |
| home/inventory archetype | `pipeline/core/design-system/src/archetypes.ts` |
| Content Model | `pipeline/core/contracts/src/ui-brief.ts` |
| 两页模板 | `pipeline/core/compiler/src/compile-page-spec.ts` |
| HTML Renderer | `pipeline/core/renderer-html/src/index.ts` |
| core/runtime 设计 | `docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md` |
| 员工端 Brief | `pipeline/samples/projects/employee-app/ui-brief.json` |
| 渲染产物/截图 | `pipeline/artifacts/employee-app/` |

---

## 9. Git 状态（交接时）

> 历史快照。2026-10-20 已完成 checkpoint 提交，并把目录重排为 `core/` + `runtimes/`；下面的路径只反映交接当时。

- 分支：`phase-1b-usability`
- HEAD：`0084181`
- 未提交修改（主要）：
  - `docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md`
  - `pipeline/README.md`、`pipeline/package.json`、`pipeline/pnpm-lock.yaml`
  - `pipeline/packages/compiler/src/compile-page-spec.ts`
  - `pipeline/packages/contracts/src/ui-brief.ts`
  - `pipeline/packages/design-system/src/{archetypes,index}.ts`
  - `pipeline/packages/design-system/tests/design-system.test.ts`
  - `pipeline/packages/validators/src/semantic.ts`
- 未跟踪（主要）：
  - `pipeline/packages/design-system/src/profiles/b-mobile.ts`
  - `pipeline/packages/design-system/src/catalogs/b-mobile.ts`
  - `pipeline/packages/renderer-html/`
  - `pipeline/samples/projects/employee-app/`
  - `pipeline/artifacts/`
  - `docs/superpowers/specs/` 下多份新文档
  - `pipeline/docs/user-acceptance-2026-10-19-after-fixes.md`

**建议**：新会话先 `git status`，确认是否提交当前 checkpoint；提交信息可用 `feat: add b-mobile slice and agent architecture docs`。不要 push。

---

## 10. 不要做

- 不要 push；当前所有分支都是本地。
- 不要把 “0 blockers” 当成视觉验收；最终仍要人签。
- 不要让 Agent 直接写最终 handoff 目录；只能写 run artifacts。
- 不要让生成 Agent 自评；评审必须独立。
- 不要用 unDraw 资产训练/微调 AI；其许可禁止。
- 不要用脚本批量抓取插画库；遵守站点条款。
- 不要用 AI 位图直接当图标；不要自动定稿 logo。
- 不要在同一个页面混用两套插画风格。
- 不要把暖玫瑰/插画实验当成当前默认；当前默认是中性测试基线。

---

## 11. 剩余开放项

1. dsh 具体版本/API 与插件契约（接入时锁版本）。
2. Agent 模型供应商（文本/vision/video）与 API key。
3. 真实切片的品牌色/字体/图标（当前中性基线）。
4. 客户详情手机号口径（第三页前）。
5. Figma 正式 Renderer / Brio 连接。
6. 3 张插画 + 10 个图标的 A/B/C 实际评测与评分。

---

## 12. 单核心 + 双运行时：DSH Next 评估

### 12.1 结论

**不要开发两个完整版本。做一个核心 + 两个运行时适配器：**

```text
core/                        # 运行时无关，单一事实源
  contracts
  orchestrator/state-machine
  validators
  renderers (HTML/Figma)
  assets/compiler
  gates (visual/a11y/interaction)
runtime-standalone/          # 当前 CLI/Node 运行时
runtime-dsh/                 # dsh 插件/工具/agent preset 适配
  DshRuntimeAdapter
  plugins/{prd-ia,interaction,visual-style,assets,spec,verify,renderers}
```

- **core 只保留一份**：契约、编排、校验、渲染、资产、门禁。
- **standalone** 与 **dsh** 只是执行层适配；同一份 core、同一套 fixtures、同一套输出。
- **dsh Next** 不单独开分支：它是 `@next` 通道/桌面版/下一代；用同一个 DSH adapter + 版本矩阵验证。

### 12.2 为什么不做两个版本

| 维度 | 两个完整版本 | 一个核心 + 适配器（推荐） |
|---|---|---|
| 业务逻辑 | 复制两份，必然漂移 | 单一事实源 |
| 测试 | 两套 fixtures/两次回归 | 一套 fixtures，两个 runtime 跑 |
| DSH 升级 | 两处改 | 只改 adapter |
| 输出一致性 | 容易不一致 | 同一 core 输出 |
| 维护成本 | 高 | 低 |
| 适用场景 | 产品面/交互模型根本不同 | 同一产品、不同执行环境 |

只有当 **DSH 版的产品形态/交互模型与 standalone 根本不同**（例如 DSH 桌面端要完全不同的 UX/数据模型）时，才考虑拆两个版本；当前不是。

### 12.3 为什么不做 DSH-only

- dsh 仍是 preview（0.1.x/0.2.x），官方明示 breaking changes；
- 需要 standalone/CI/headless 运行；
- 确定性 Orchestrator 必须独立于 DSH 的 ReactLoopAgent，否则可能跳过门禁；
- DSH session log 是执行证据，不是我们的 canonical run record；我们的 `runs/<id>/` 仍是事实源。

### 12.4 Runtime 接口（建议）

```ts
type AgentRuntime = {
  runAgent(role: AgentRole, input: AgentInput, ctx: RunContext): Promise<AgentOutput>;
  runTool(tool: ToolName, input: unknown, ctx: RunContext): Promise<ToolOutput>;
};
```

- `StandaloneRuntime`：直接调模型/确定性代码；当前 CLI 的封装。
- `DshRuntime`：把 role 映射到 dsh agent preset/skill，把 tool 映射到 `ctx.tools`；session 用 dsh，产物写回 `runs/<id>/`。
- core 只依赖 `AgentRuntime` 接口，不 import dsh。

### 12.5 DSH 映射

| core | dsh |
|---|---|
| `runAgent(role)` | dsh agent preset/skill + 独立 session |
| `runTool(name)` | `ctx.tools.register(defineTool(...))` |
| 预算/审批 | core Orchestrator + dsh `tools/pre-execute`/permission |
| artifacts | dsh workspace + 我们的 `runs/<id>/`（canonical） |
| 审计 | dsh session trajectory + 我们的 run log；两者都保留 |
| 模型 | dsh model adapter；core 只传 role/model 配置 |

### 12.6 版本策略

1. **锁精确版本**：`@deepseek-ai/dsh@<exact>`，写进 lockfile；不要默认 `@next`。
2. **`next` 只做 canary**：CI 单独跑兼容性，不阻塞主版本；升级前看 release notes。
3. **Adapter 合同测试**：同一 fixtures 分别跑 standalone/dsh pinned/dsh next，比较 artifacts 的语义等价（不要求日志逐字节一致）。
4. **DSH NEXT 桌面版**只是 client；不单独开代码路径，仍走同一 adapter。

### 12.7 迁移步骤

1. 从当前 `pipeline/` 抽 `core`（contracts/orchestrator/validators/renderers/assets），保持现有 CLI 行为不变。
2. 定义 `AgentRuntime` 接口 + fixtures；standalone adapter 包住现有 CLI。
3. 建 `runtime-dsh`：先做 **Asset Reviewer + 资产 tools**（M0），跑 3 插画 + 10 图标。
4. 再接 IA/Interaction/Visual Style；每次只加一个角色。
5. 加双运行时 golden tests；锁定 dsh 版本；`next` canary。
6. 最后才考虑 DSH 桌面/Next 的 UX 适配。

### 12.8 风险

- dsh API/插件契约频繁变化 → adapter + 版本锁 + 合同测试；
- session 格式可能升级后不可读 → 我们的 `runs/` 事实源不依赖 dsh session；
- 模型 adapter 差异 → 同一 role 的 prompt/schema 由 core 管理；
- 两运行时输出漂移 → 同一 fixtures + golden tests；
- 调试复杂 → 先 standalone 复现，再 dsh 复现；保留两边日志。

### 12.9 推荐落地顺序

1. **先抽 core + standalone adapter**（不改变当前 157 测试/2 pages 0 blockers）。
2. **再做 DSH M0**（Asset Reviewer + tools）。
3. DSH M1（IA/Interaction）→ M2（Visual Style/资产链）→ M3（Figma/Visual Gate）。
4. dsh `next` 只在 CI canary，不进入默认开发链路。

> 参考：DeepSeek Harness 官方仓库/文档（github.com/deepseek-ai/deepseek-harness、deepseek-harness.github.io）与 2026-10 公开资料。dsh 仍在快速迭代，具体 API 以官方文档和锁定版本为准。
