# 交接文档 · PRD → 双端 UI 交付管线

- **日期**：2026-10-19
- **工作目录**：`/Users/jihui/Desktop/产品、ui`
- **当前分支**：`phase-1b-usability`
- **当前 HEAD**：`7faca50`（`fix: surface all actions and remove hidden asset defaults`）
- **下一阶段建议**：先确认 Phase 0 的最终视觉结论，再完成 Phase 1B 的复审/复测；之后进入 Phase 1B 设计系统接入与 Phase 2。

---

## 0. 当前状态摘要

| 阶段 | 状态 | 结论 |
|---|---|---|
| Phase 0 · Figma Spike | 代码与自动验证完成；Figma 实际构建 9/9 pass（assistant-observed） | **推荐 Go**，但**最终视觉签核待用户确认**；图片/按钮文案/BottomNav 等已知偏差需要决定是否先修 |
| Phase 1A · Contracts/Validators | 完成 | 100/100 测试；`pnpm phase1:verify` = 8 页 / 0 blocker；最终审查的 6 个门禁问题已修复 |
| Phase 1B · 用户可用性 | 实现完成 | 144/144 测试；sample 8/0；demo-crm 1/0；但 **7faca50 的 scoped re-review 被取消，修复后的独立用户复测和整分支最终审查尚未执行** |
| Phase 2+ | 未开始 | PRD Review Gate、UI Brief LLM、Spec Engineer、正式 HTML/Figma Renderer、Asset Compiler、Studio、沙箱、Handoff |

**关键提醒：不要把 Phase 1A/1B 的 sample 通过当成“用户可直接用自己的 PRD 跑”的产品；也不要把 Phase 0 的 assistant-observed 9/9 当成用户已签字。**

---

## 1. 先读这些文件

1. **总体设计文档**：`docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md`
2. **Phase 0 计划**：`docs/superpowers/plans/2026-10-19-phase-0-figma-spike.md`
3. **Phase 1A 计划**：`docs/superpowers/plans/2026-10-19-phase-1a-contracts-and-validators.md`
4. **Phase 1B 计划**：`docs/superpowers/plans/2026-10-19-phase-1b-usability.md`
5. **Phase 0 报告/验收记录**（在 `phase-0-spike` 分支）：
   - `spike/report.md`
   - `spike/artifacts/figma/notes.md`
   - `spike/artifacts/figma/checklist.md`
6. **Phase 1 使用说明**：`pipeline/README.md`
7. **独立用户测试记录**：
   - `pipeline/docs/user-acceptance-2026-10-19.md`（Phase 1A 之后的首轮用户测试）
   - 本文档第 5 节（Phase 1B 复测与被取消的复审）

---

## 2. 分支与提交地图

| 分支 | HEAD | 内容 |
|---|---|---|
| `main` | `064c3b0` | 只有设计文档和 Phase 0 计划 |
| `phase-0-spike` | `875e881` | Phase 0 spike 全部代码 + Figma 验收证据 + report/notes |
| `phase-1-foundation` | `5172eb7` | Phase 1A contracts / design-system / compiler / validators / orchestrator + 用户测试记录 |
| `phase-1b-usability` | `7faca50` | Phase 1B 项目配置/CLI、Brief 驱动、语义校验、demo-crm、复测修复 |

**重要**：

- 所有分支都是**本地 commit，没有 push**。
- Phase 0 的 Figma 验收 commit `875e881` **只在 `phase-0-spike` 分支**；`phase-1-foundation` / `phase-1b-usability` 不包含它。
- `phase-1b-usability` 基于 `phase-1-foundation`，`phase-1-foundation` 基于 `phase-0-spike` 的较早状态；合并/迁移时注意不要丢失 `875e881` 的验收证据。

### 关键 commit（按时间）

**Phase 0**
- `ea0aafa` scaffold spike workspace
- `43bf1a6` page spec/profile fixtures
- `ac9b106` plan compiler
- `c04843f` HTML renderer
- `484d644` Playwright layout checks
- `bd1f5d7` Figma plugin
- `fa38c7e` auto-layout sizing fix
- `69747c0` fill-axis sizing fix
- `5a9a3cc` variable-name fix + local bridge harness
- `08233f8` Button component-set offset
- `875e881` Figma acceptance evidence + report

**Phase 1A**
- `627db4a` plan
- `f02dc74` workspace + contracts
- `00d1d4b` design-system baselines/archetypes
- `4afa1ac` PageShell slot contracts
- `5edf8f0` sample PRD + 8-page UI Brief
- `376d1d8` deterministic compiler
- `bb3561d` validators
- `a42d3ae` state machine + exit verification
- `6e63b5b` final-review gate fixes
- `5172eb7` independent user acceptance findings

**Phase 1B**
- `7f31e72` plan
- `87a9706` project config + CLI
- `540839a` brief-driven page content
- `334010f` semantic validation
- `fa61a88` demo-crm project + docs
- `7faca50` re-test fixes (all actions, no hidden asset defaults, CLI reasons, SEMANTIC-FILTER)

---

## 3. Phase 0 · Figma Spike（`phase-0-spike`，HEAD `875e881`）

### 3.1 已完成

- 同一份 Page Spec → React HTML 原型 + 原生 Figma 图层。
- 修复了计划中的关键实现问题：
  1. **Auto Layout 尺寸**：frame 不再停留在 100×100；fill 轴 `FIXED`、hug 轴 `AUTO`；新增 `resolveSizingModes` 与 14 个单元测试。
  2. **Figma 变量名**：Figma 不允许变量名含点号；`color.surface.default` 改为 `color/surface/default`。
  3. **组件集重叠**：Button 组件集从页面原点移到根 Frame 右侧（`x = 页面宽度 + 100`）。
  4. **manifest**：补上 `id`（`prd-ui-spike-local-dev`），便于后续手动导入。
  5. **桥接执行**：文件选择器导入开发插件在本次环境一直无响应，改用已安装的 **Brio MCP** 作为执行通道，运行同一份 `dist/code.js` / plan；`spike/scripts/figma-bridge.mjs` 负责连接、清理、构建、导出 PNG。

### 3.2 Figma 实际构建结果

真实 Figma 构建成功，`Spike B` / `Spike C` 已创建：

| # | 检查 | 结果 | 证据 |
|---|---|---|---|
| 1 | 页面创建 | pass | `figma-runtime.json`: `Spike B` 1:115、`Spike C` 1:187 |
| 2 | 嵌套 Auto Layout | pass | B 1440×900 / Sidebar 240×900 / Content 1200×900；C 390×844 / 390×56 / 390×620 / 390×64 |
| 3 | 中文字体 | pass | `spike-b.png`、`spike-c.png` 中文正常 |
| 4 | 变量 | pass | 两页各 7 个颜色变量，填充绑定 |
| 5 | 文本样式 | pass | heading.1/2/3、body.md、label.sm 已创建并应用 |
| 6 | 组件变体 | pass | 2 个 Button 集 ×2 变体；CreateButton 实例；组件集 x=1540/490 |
| 7 | 图标 | pass | bookmark 可编辑矢量 |
| 8 | 图片填充 | pass | `imageFillCount: 2`（占位图） |
| 9 | HTML/Figma 一致性 | pass（含已知偏差） | B/C 布局、字号层级、间距基本一致 |

**证据**（在 `phase-0-spike`）：
- `spike/artifacts/figma/spike-b.png`
- `spike/artifacts/figma/spike-c.png`
- `spike/artifacts/figma/figma-runtime.json`
- `spike/artifacts/figma/notes.md`
- `spike/report.md`

### 3.3 视觉上“不是我原本设想”的部分（必须知道）

用户在最后问到“图片和样式是你预期设想的吗？”。回答：**样式大体是预期的，图片不是。**

| 现象 | 是否符合预期 | 说明 |
|---|---|---|
| C 端封面是粉色块 | **否** | 1×1 占位 PNG 被拉伸，不是真实图片；HTML 对应灰色占位 `#ddd` |
| B 端按钮文案“按钮” | **否** | 应为 `新建订单`；组件实例没有应用 plan 的 `props.label` |
| C 端 BottomNav 未贴底 | **否** | 下方有 beige 空白；HTML 是 `position: fixed` 底部导航 |
| 表格列不均分、无行分隔线 | 已知偏差 | spike 的 DataTable 只做结构验证 |
| 卡片没有圆角 | 已知偏差 | FeedCard/FeedText 未设置 `radius.*` |
| 两页文本样式同名重复 | 已知偏差 | 每个文本节点 style ID 正确，本地样式面板重复 |
| B/C 布局、字号、主色、中文、变量、文本样式、组件、图标 | **是** | 与 b-dense/c-expressive 基线一致 |

**结论**：9 项按“允许已知偏差”记为 pass，`spike/report.md` 推荐 **Go**；但这是 assistant-observed，**最终视觉签核仍待用户确认**。如果用户不接受图片/按钮文案/BottomNav 偏差，则应先修这 3 项，或判 **Conditional Go**。

### 3.4 Phase 0 的未完成项

- [ ] 用户最终视觉签核（Go / Conditional Go / No-Go）。
- [ ] 可选视觉修复：C 封面改中性灰/真实图、B 按钮文案应用 `props.label`、C BottomNav 固定底部；修完重跑桥接导出截图。
- [ ] 表格列均分、行分隔线、卡片圆角属于后续保真度任务，不是 Phase 0 机制门禁。

---

## 4. Phase 1A · Contracts & Validators（`phase-1-foundation`，HEAD `5172eb7`）

### 4.1 已完成

`pipeline/` 独立 workspace，与 `spike/` 隔离：

- `@prd-ui/contracts`：PageSpec/SpecNode、Profile、Catalog、UI Brief、Asset Manifest、Findings、RunState 的严格 Zod schema。
- `@prd-ui/design-system`：`b-dense` / `c-expressive` 两套 Profile、两套各 20 组件 Catalog、8 个 archetype、layout primitives。
- `samples/`：Phase 1 样本 PRD、8 页 UI Brief、两份 asset manifest。
- `@prd-ui/compiler`：8 页确定性 Page Spec 模板。
- `@prd-ui/validators`：schema/catalog/token/layout/state/asset/traceability + 语义校验。
- `@prd-ui/orchestrator`：状态机、run 产物、CLI 出口校验。

### 4.2 验证

```bash
cd pipeline
pnpm test        # Phase 1A 时 100/100
pnpm typecheck   # 5 packages clean
pnpm phase1:verify
# Phase 1A OK: 8 pages, 0 blockers
```

- 最终整分支审查发现 6 个 Important 门禁问题（root shell 绕过 catalog、单 profile manifest、page ID 未约束、失败 run 不落盘、Brief 门禁形式化、page 级 requiredStates 未校验），已在 `6e63b5b` 修复并复审通过。
- 首轮独立用户测试记录在 `pipeline/docs/user-acceptance-2026-10-19.md`：sample 通过，但自定义项目/CLI/自定义内容在 Phase 1A 时不可用——这正是 Phase 1B 的起点。

---

## 5. Phase 1B · 用户可用性（`phase-1b-usability`，HEAD `7faca50`）

### 5.1 已完成

- **项目级配置 + CLI**：`project.yaml`、`--project`、`--brief`、`--manifest profile=path`、`--runs`、`--help`；默认 sample 仍 8/0。
- **PageSpec 元数据**：`purpose` / `route` / `roles`。
- **Brief 驱动的页面内容**：nav/tabs、fields、filterFields、actions、emptyTitle/emptyAssetRef、summaryTitle、feedItems、stats 从 UI Brief 取值，不再硬编码订单文案。
- **语义校验**：`SEMANTIC-META`、`SEMANTIC-NAV`、`SEMANTIC-FIELD`、`SEMANTIC-ACTION`、`SEMANTIC-EMPTY`、`SEMANTIC-FILTER`，全部 blocker。
- **demo-crm 项目**：`samples/projects/demo-crm/`，单页 `contacts-list`；CLI 可跑 1 页/0 blocker，内容为联系人而非订单。
- **复测修复（`7faca50`）**：
  - 去掉隐藏的 `empty-orders` 默认：使用 `page.emptyAssetRef`，缺省不再强依赖 empty 资产。
  - 所有 actions 渲染进布局（list/detail/form/settings/auth/onboarding）；`SEMANTIC-ACTION` 要求布局存在，不再接受 interactions-only。
  - CLI 失败时打印 failure reason；单复数修正。
  - 新增 `SEMANTIC-FILTER`。

### 5.2 验证

```bash
cd pipeline
pnpm test        # 144/144
pnpm typecheck   # clean
pnpm phase1:verify
# Phase 1A OK: 8 pages, 0 blockers
pnpm phase1:verify --project samples/projects/demo-crm/project.yaml --runs /tmp/demo-crm-runs
# Phase 1A OK: 1 pages, 0 blockers
```

### 5.3 Phase 1B 尚未完成的验证（重要）

1. **`7faca50` 的 scoped re-review 被取消**：修复后还没有完成正式的 fix-wave 复审。
2. **修复后的独立用户复测 A–D 尚未执行**：上一轮独立复测（修复前）结果是 A/C/D pass、B pass 但发现 hidden `empty-orders` 和 only-first-action；`7faca50` 修了这两点，但还没有新 agent 复测确认。
3. **Phase 1B 整分支最终审查尚未执行**。
4. 因此：**Phase 1B 不能标记为“用户验收完成”**；只能标记为“实现完成、验证待补”。

### 5.4 Phase 1B 已知限制

- 没有 PRD → UI Brief 解析（Phase 2）；用户仍需手写严格 `UiBrief` JSON，或提供 `project.yaml` + brief。
- 没有真实设计系统接入（code/Figma/docs/screenshots adapters、reconcile、snapshot）；目前只有 `b-dense` / `c-expressive` 基线。
- 页面内容模板是确定性的；更复杂的业务页面需要 Phase 2 的 Spec Engineer（LLM + 模板约束）。
- onboarding 仍未纳入 sample；部分 fallback 文案仍是通用值。
- 资产文件/哈希未真正接入（manifest 只做条目校验）。

---

## 6. 关键决策与约束

1. **路线 A**：PRD → UI Brief → Page Spec → HTML / Figma / 切图；AI 只写规格，不写像素。
2. **Page Spec 只允许语义字段**：组件 ID、props、slots、token 引用、textRole、assetRef、states、reqRef、designDefault；禁止原始颜色/尺寸/style/className/绝对定位。
3. **页面布局用 Auto Layout 原语**：PageShell/MobileShell、Section、Grid/Row/Stack、嵌套 frame；组件集是页面画布旁的顶层资产，不参与页面布局。
4. **一个产品面只用一个设计系统**；两套基线 `b-dense` / `c-expressive`，共享语义 ID。
5. **spike 与 pipeline 隔离**：`spike/` 是一次性验证；`pipeline/` 是正式基础。不要把 spike 代码直接提升为生产。
6. **Phase 0 视觉门禁**：计划要求人工看画布；本次用 Brio MCP 执行通道生成真实 Figma 输出，但最终签核仍应是人。
7. **Phase 1B 用户路径**：`project.yaml` + brief + manifests；CLI 不静默回退；缺 manifest / 项目不匹配会显式失败。
8. **Git**：所有分支本地 commit，未 push；handoff 只打 tag 的规则属于后续正式管线。

---

## 7. 如何运行 / 复现

### 7.1 Phase 0 HTML

```bash
cd "/Users/jihui/Desktop/产品、ui/spike"
pnpm build:html
pnpm preview:html
# http://127.0.0.1:4173/?page=b
# http://127.0.0.1:4173/?page=c
```

### 7.2 Phase 0 Figma

手动导入（manifest 已补 `id`）：

1. Figma 桌面版 → 新建空白文件
2. Plugins → Development → Import plugin from manifest → `spike/figma-plugin/manifest.json`
3. 运行 `PRD UI Spike`

如果文件选择器仍无响应，用桥接：

```bash
cd "/Users/jihui/Desktop/产品、ui/spike"
node scripts/figma-bridge.mjs   # listens 9500
# 在 Figma 中运行 Plugins → Development → Brio MCP
# 桥接会清理旧页面、执行 dist/code.js、导出：
# spike/artifacts/figma/spike-b.png
# spike/artifacts/figma/spike-c.png
# spike/artifacts/figma/figma-runtime.json
```

**注意**：桥接是 spike 测试 harness，不是正式 Figma Renderer；正式渲染器在 Phase 3。

### 7.3 Phase 1A/1B

```bash
cd "/Users/jihui/Desktop/产品、ui/pipeline"
pnpm install
pnpm test
pnpm typecheck
pnpm phase1:verify
pnpm phase1:verify --project samples/projects/demo-crm/project.yaml --runs /tmp/demo-crm-runs
```

产物：`pipeline/runs/<runId>/`（state.json、artifacts/ui-brief.json、artifacts/page-spec/*.json、reports/validation.json、logs/run.log）。

### 7.4 分支切换

```bash
git switch phase-0-spike        # Phase 0 + Figma 验收证据
git switch phase-1-foundation   # Phase 1A
git switch phase-1b-usability   # Phase 1B（当前最完整）
```

---

## 8. 下一步建议（按优先级）

### P0 · 阶段 0 视觉结论

- 决定：先修 3 项（C 封面改中性灰/真实图、B 按钮文案、C BottomNav 固定）再签核；或接受已知偏差，判 Conditional Go。
- 修完重跑桥接，更新 `spike/report.md`、`notes.md`，再由用户确认 Go/No-Go。

### P1 · 完成 Phase 1B 验证

1. 对 `7faca50` 做 scoped re-review（之前被取消）。
2. 派新的独立 agent 重跑用户场景 A–D：
   - 默认 sample 8/0
   - 自定义 `customers-list` 9/0，内容为客户、无订单文案、两个 action 都在布局
   - demo-crm 1/0
   - CLI `--help`/未知参数/缺 manifest/项目不匹配
3. 做 Phase 1B 整分支最终审查；修完 Important 后再合并/收尾。

### P2 · Phase 1B 后续 / Phase 2

- 现有设计系统接入：code / Figma / docs / screenshots adapters + reconcile + Snapshot。
- PRD Review Gate、UI Brief LLM、Spec Engineer、正式 HTML/Figma Renderer、Asset Compiler、Studio、沙箱、Handoff。
- 真实 PRD、真实组件库/Figma 库/tokens/文档/截图、B/C 系统与首版 6–8 页清单。

---

## 9. 产物地图

| 产物 | 路径 / 分支 |
|---|---|
| 设计文档 | `docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md` |
| Phase 0 计划 | `docs/superpowers/plans/2026-10-19-phase-0-figma-spike.md` |
| Phase 1A 计划 | `docs/superpowers/plans/2026-10-19-phase-1a-contracts-and-validators.md` |
| Phase 1B 计划 | `docs/superpowers/plans/2026-10-19-phase-1b-usability.md` |
| Phase 0 代码/证据 | `phase-0-spike`：`spike/`、`spike/artifacts/figma/`、`spike/report.md` |
| Phase 1A/1B 代码 | `phase-1b-usability`：`pipeline/` |
| 用户测试记录 | `pipeline/docs/user-acceptance-2026-10-19.md` |
| 本文档 | `docs/handoffs/2026-10-19-prd-ui-pipeline-handoff.md` |

---

## 10. 注意事项 / 不要做

- **不要 push**：当前所有分支都是本地 commit，没有 remote push。
- **不要把 Phase 0 9/9 当成用户已签字**：它是 assistant-observed；用户最后对图片/样式提出了疑问，签核未完成。
- **不要把 Phase 1B sample 通过当成用户可用产品**：没有 PRD 解析、没有真实设计系统接入、没有 Studio/正式渲染器。
- **不要修改 `spike/` 去实现 Phase 1/2**：spike 是一次性验证；正式实现在 `pipeline/`。
- **不要删除根目录未跟踪的用户图片/资产**：`_i*.png`、`_m*.png`、`_v*.png`、`_w*.png`、`_x*.png`、`_y*.png`、`assets/` 等可能属于用户参考素材。
- **不要在没有复审的情况下认为 `7faca50` 已验证**：scoped re-review 被取消，修复后独立复测未跑。
- **不要在 Figma 里重复运行插件后不清理**：桥接脚本会清理 `Spike B`/`Spike C`、同名变量集合和文本样式；手动运行时请用新空白文件。
