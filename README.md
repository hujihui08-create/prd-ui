# PRD → UI Pipeline

确定性管线 + 双运行时资产评审 + M1 设计 Agent 层。一个运行时无关的 `core`，两个薄适配器：`standalone`（文件系统/CI）和 `dsh`（DeepSeek Harness headless）。

## 现在能做什么

- **Phase 1A/1B**：UI Brief → Page Spec → validators → HTML Renderer，员工端两页切片（`今日` + `库存查询`）保持 `2 pages / 0 blockers`。
- **M0 资产评审**：10 个 Lucide 图标 + 3 个 test-fixture 插画走 A 库，经过规范化、硬门禁、独立 reviewer、重试/切源/预算/审计，产出 `asset-review.json` 和 `manifest.json`。
- **硬化（M0.5）**：H1–H15 已实现——全元素 SVG 门禁、图标/插画 set 级一致性门禁、reviewer 错误隔离、严格配置/provider 校验、dsh usage 成本核算与 10 元全局护栏、2x PNG 证据、`--json -` stdin 传输、append-only `log.ndjson`、raw review sidecar、一次 schema 修复、`manifest.review.json` 与统一脱敏。
- **M1 Agent 层**：IA / Interaction / Visual Style 三个只读 Agent，共享 `AgentRunnerPort`，确定性门禁、预算、重试、失败隔离、证据与人工 signoff；`pnpm agent:run` 可离线（scripted fixtures）或走真实 dsh。产物是 `ia-map` / `interaction-spec` / `motion-spec` / `visual-style` / `asset-briefs`，不修改 Page Spec、HTML 或 renderer。
- **Spec Engineer v0**：确定性 mapper，把 M1 的 interaction/motion/asset artifacts 写进 Page Spec；新增可选 `interactions[].nodeId` 与 `motion`，输出 gate/summary。`--strict-motion` 下 clean 8 页 0 `SPEC_MOTION_NODE_UNRESOLVED`；compiler 语义 node id + renderer CSS 动效已接通。
- **PRD Review + UI Briefer**：Phase 2 前半段。`pnpm intake:run` 读 PRD，做确定性 normalize、PRD Reviewer、IA review、UI Briefer；两道人工签核后才写 `ui-brief.json`，可 resume 和原子发布。
- **Phase 2 8 页出口**：已签核的 8 页 brief 可跑通 M1（IA/Interaction/Visual）、Spec Engineer、8 页 Page Spec 和 8 页 HTML；Phase 1 语义校验 `8 pages / 0 blockers`。
- **Phase 2 出口（真实 PRD，v0.4）**：`samples/projects/employee-app-phase2` 的 8 页真实 PRD 切片已跑通 clean 链路：intake 8 页、0 waiver、0 手工 brief patch，brief hash `sha256:b558b57a…b8335`（¥0.8978）；M1 三 gate passed、0 waiver（¥0.44）；Spec Engineer 8 Page Specs / 0 blockers / 0 motion unresolved；8 页 HTML + index，Phase 1 `8/0`；24 项 visual baseline + 真实 Visual Critic；concrete-major 修复后最终 review 为 9 findings（6 major / 3 minor / 0 blocker），由 signed critique cache 命中（¥0，0 次模型调用）；按 stopping rule 签核，`status=passed`，6 major 记为 v0.5 视觉债。Studio/Asset Compiler 仍后置。
- **Renderer 视觉 v0.4**：`mobile-list` 七列日历 + 列表双维度；`mobile-form` 单主 CTA + `datetime-local` + customer picker 草稿；detail 底部固定操作栏与主/次动作拆分；`noticeBlocks` 告知按项目分块；共 12 个 archetype。轻量 vanilla JS 支持业务状态动作栏、new/reschedule 表单 mode、日历/列表切换、搜索过滤、详情抽屉、picker 返回/取消/reload、完整日期预填；CSS motion 按 `data-motion-preset` 执行并支持 reduced-motion。
- **Visual Review**：`core/visual-review` 生成 24 项确定性截图矩阵，Playwright 390×844 截图、console/overflow gate、pixelmatch baseline diff；`visual:baseline` 只由人运行，`visual:review` 支持 `standalone` scripted critic 与真实 dsh `prd-ui-visual`（vision、只读工具、65536 maxTokens、900s timeout），`visual:sign` 绑定 `manifestHash` + `findingsHash` 后才 `passed`。signed critique cache 以视觉 manifest hash + Page Spec hash + runtime/profile/model 为 key（`pipeline/.visual-cache/`），命中时不调用模型。
- **双运行时**：同一 core 状态机；`standalone` 用 scripted reviewer 跑 CI，`dsh` 用 headless + vision 模型跑真实评审。默认 provider 是 DeepSeek（`deepseek-flash`），没有 OpenAI fallback。
- **dsh 适配**：项目内 pinned profile（`@deepseek-ai/dsh@0.2.1-rc.2`），插件可加载；真实评审需要配置 vision key。

## 架构

```text
pipeline/
  core/                 # 运行时无关，单一事实源
    contracts/
    design-system/
    compiler/
    validators/
    renderer-html/
    orchestrator/
    asset-review/       # 契约、ports、状态机、硬门禁、verdict、manifest
    agents/             # M1 IA/Interaction/Visual Style + Visual Critic + PRD review/Briefer 角色、prompt、门禁、runM1
    spec-engineer/      # M1 artifacts → 增强 Page Spec（motion node id 解析）
    intake/             # PRD normalize、PRD/Brief gates、runIntake、resume
    visual-review/      # 截图矩阵、确定性 gate、pixel diff、status/signoff 契约
  runtimes/
    standalone/         # phase1/render/asset/agent/spec/intake/visual CLI + fs/library/scripted/model 适配
    dsh/                # Cordis 插件、工具、headless adapter、agent runner
  dsh/                  # 项目内 dsh profile（prd-ui-assets / prd-ui-agents / prd-ui-intake / prd-ui-visual；不修改 ~/.dsh）
  baselines/            # visual:baseline 生成的 PNG + manifest（人工提交）
  artifacts/            # 已验收 HTML、截图、visual-review/signoff、run summaries
  samples/assets/m0/    # 10 图标 + 3 插画 + briefs + scripted reviews
  samples/agents/m1/    # employee-app 的 IA/Interaction/Visual scripted fixtures
  samples/agents/intake/# demo-orders 8 页与 employee-app 2 页 intake fixtures
  samples/agents/visual-critic/ # standalone scripted critic fixture
```

- `core/` 不 import `@deepseek-ai/*`，也不 import `node:fs`/`node:child_process`。
- `runs/<runId>/` 是 canonical 事实源；dsh 的 `stdout`/session 只作执行证据。
- 重试、切源、预算、`unresolved`、`degraded` 都在 core；dsh 只评审一个候选。

## 快速开始

```bash
cd pipeline
pnpm install
pnpm test
pnpm typecheck

# Phase 1A：员工端两页
pnpm phase1:verify \
  --project samples/projects/employee-app/project.yaml \
  --runs /tmp/employee-app-runs

# HTML 渲染
pnpm render:html --run /tmp/employee-app-runs/<runId> --out /tmp/employee-app-html

# M1 三个设计 Agent（离线 fixtures；缺签核时为 awaiting_signoff）
pnpm agent:run \
  --project samples/projects/employee-app/project.yaml \
  --runs /tmp/m1-agent-runs \
  --allow-unreviewed

# Spec Engineer v0：消费 M1 run，输出增强 Page Spec
pnpm spec:engineer \
  --project samples/projects/employee-app/project.yaml \
  --agent-run /tmp/m1-agent-runs/<runId> \
  --runs /tmp/spec-engineer-runs

# PRD Review + UI Briefer：8 页 sample PRD 的离线路径
pnpm intake:run \
  --project samples/project.demo-orders.yaml \
  --prd samples/sample-prd.md \
  --runs /tmp/intake-runs \
  --fixtures samples/agents/intake

# Phase 2 8 页出口：已签核 brief → M1 → Spec Engineer → HTML
pnpm phase1:verify --project samples/project.demo-orders-intake.yaml --runs /tmp/phase1-8p
# 真实 dsh M1（IA waiver 文件按 run 的 findings 生成）
DSH_HOME="$PWD/dsh/home" pnpm agent:run \
  --project samples/project.demo-orders-intake.yaml \
  --runtime dsh --profile prd-ui-intake \
  --signoff-ia /tmp/signoff-ia-8p.md \
  --runs /tmp/m1-8p
pnpm spec:engineer --project samples/project.demo-orders-intake.yaml \
  --agent-run /tmp/m1-8p/<runId> --runs /tmp/spec-8p
pnpm render:html --run /tmp/spec-8p/<runId> --out /tmp/html-8p

# v0.4 视觉回归：baseline → 真实 critic → 人工签核
pnpm spec:engineer --project samples/projects/employee-app-phase2/project.yaml \
  --agent-run /tmp/m1-final2/run-2026-10-22T03-16-05-257Z \
  --runs /tmp/spec-v04 --strict-motion
pnpm render:html --run /tmp/spec-v04/<runId> --out /tmp/html-v04
pnpm visual:baseline --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v04/<runId> --html /tmp/html-v04 \
  --out baselines/employee-app-phase2
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm visual:review \
  --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v04/<runId> --html /tmp/html-v04 \
  --baseline baselines/employee-app-phase2 \
  --runtime dsh --profile prd-ui-visual \
  --runs /tmp/visual-v04 --max-cost-cny 3 --json
pnpm visual:sign --run /tmp/visual-v04/<runId> --signoff-visual /tmp/signoff-visual.md
```

## M1 Agent 层

```bash
cd pipeline

# 离线：scripted fixtures，验证门禁与产物（awaiting_signoff，exit 1）
pnpm agent:run \
  --project samples/projects/employee-app/project.yaml \
  --runs /tmp/m1-agent-runs \
  --allow-unreviewed

# 只跑 IA
pnpm agent:run --only-role ia --runs /tmp/m1-ia --allow-unreviewed

# 人工签核后 success（签核格式见 docs/agent-m1.md）
pnpm agent:run \
  --project samples/projects/employee-app/project.yaml \
  --runs /tmp/m1-agent-runs \
  --signoff-ia /tmp/signoff-ia.md \
  --signoff-visual-style /tmp/signoff-visual-style.md

# 已有 artifacts、只缺签核：复用 run，不重跑 Agent
pnpm agent:sign \
  --run /tmp/m1-agent-runs/<runId> \
  --signoff-visual-style /tmp/signoff-visual-style.md
```

真实 dsh：

```bash
cd pipeline
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm agent:run \
  --project samples/projects/employee-app/project.yaml \
  --runtime dsh \
  --runs /tmp/m1-agent-dsh
```

- IA 先运行；blocker 没有有效 waiver 时不进入 Interaction/Visual。
- Interaction 与 Visual 并行、失败隔离；一个失败不会删除另一个的产物。
- 默认整 run 成本上限 10 CNY；`usageComplete=false` 时 fail closed，`--allow-unknown-cost` 才继续。
- `--allow-unreviewed` 只用于开发冒烟，最终状态必须是 `awaiting_signoff`，不会产生 `success`。
- 产物布局、签核格式、门禁代码和退出码见 [`pipeline/docs/agent-m1.md`](pipeline/docs/agent-m1.md)。

> 真实 `deepseek-flash` 三 Agent 回归（clean run）：`status=success`，`gates={ia:passed, interaction:passed, visualStyle:passed}`，10 个 asset briefs，**¥0.1973**，`usageComplete=true`，不需要 waiver。employee-app 切片已按 IA 发现修复死 Tab、库存入口、库管落地和权限错配；早前带开发 waiver 的 run 为 ¥0.2081 / ¥0.2487。

## Spec Engineer v0

```bash
cd pipeline
pnpm spec:engineer \
  --project samples/projects/employee-app/project.yaml \
  --agent-run /tmp/m1-agent-runs/<runId> \
  --runs /tmp/spec-engineer-runs
```

- 读取 M1 `state.json`（`success` / `awaiting_signoff` / `partial`）、`interaction-spec.json`、`motion-spec.json`、可选 `ia-map.json` 与 `asset-briefs/*`。
- 输出 `artifacts/page-spec/*.json`（只有 gate 通过时）、`findings/spec-engineer-gate.json`、`spec-engineer.json`。
- Page Spec 新增可选 `interactions[].nodeId` 与 `motion`；已有 Page Spec 不受影响。
- 真实 employee-app clean M1 run：2 个 Page Spec，interactions 各 10 条，states 覆盖六种，motion 两页都有；**0 blockers**，28 warnings（19 个未解析 nodeId、9 个未用 asset brief，均为 v0 预期）。
- 用法、映射、门禁和限制见 [`pipeline/docs/spec-engineer-v0.md`](pipeline/docs/spec-engineer-v0.md)。

## PRD Review + UI Briefer

```bash
cd pipeline

# 1) PRD review + IA：无 blocker 时停在 awaiting_signoff
pnpm intake:run \
  --project samples/project.demo-orders.yaml \
  --prd samples/sample-prd.md \
  --runs /tmp/intake-runs \
  --fixtures samples/agents/intake

# 2) 带 PRD/IA 签核继续到 brief 草稿
pnpm intake:run \
  --project samples/project.demo-orders.yaml \
  --prd samples/sample-prd.md \
  --resume /tmp/intake-runs/<runId> \
  --fixtures samples/agents/intake \
  --signoff-prd-ia /tmp/signoff-prd-ia.md

# 3) 带 brief 签核并发布（hash 从 awaiting summary 的 brief.hash 取）
pnpm intake:run \
  --project samples/project.demo-orders.yaml \
  --prd samples/sample-prd.md \
  --resume /tmp/intake-runs/<runId> \
  --fixtures samples/agents/intake \
  --signoff-prd-ia /tmp/signoff-prd-ia.md \
  --signoff-brief /tmp/signoff-brief.md \
  --publish-brief /tmp/demo-orders-ui-brief.json
```

- 8 页 sample PRD：2 次 reviewer + briefer，产出 8 页 `ui-brief.json`；brief gate 含 schema、页面/角色/状态/追溯、占位符、blocking questions 与 compiler dry-run。
- employee-app 两页路径用 `samples/agents/intake-employee-app` fixtures；真实 dsh 2 页已跑通（success + publish，累计 ¥0.6948）。8 页真实 dsh 使用 `prd-ui-intake` profile（65536 maxTokens）也已跑通，sample findings 以 waiver 通过（累计 ¥0.90666）。v0.3.1 clean run：`employee-app-phase2` 8 页、PRD/IA 与 brief gate passed、**0 waiver / 0 手工 brief patch**、brief hash `sha256:b558b57a…b8335`、¥0.8978，`usageComplete=true`。
- 只有 `success` 才写最终 `ui-brief.json`；`awaiting_signoff` / `blocked` 只写草稿与 findings。
- 签核格式、resume、publish、门禁与限制见 [`pipeline/docs/prd-review-briefer.md`](pipeline/docs/prd-review-briefer.md)。

## Phase 2 8 页出口

`samples/project.demo-orders-intake.yaml` 指向真实 intake 产出的 8 页 brief（`samples/projects/demo-orders-intake/ui-brief.json`，已按 PRD “overview 无字段”修正）。

```bash
cd pipeline
pnpm phase1:verify --project samples/project.demo-orders-intake.yaml --runs /tmp/phase1-8p

set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm agent:run \
  --project samples/project.demo-orders-intake.yaml \
  --runtime dsh --profile prd-ui-intake \
  --signoff-ia /tmp/signoff-ia-8p.md \
  --runs /tmp/m1-8p

pnpm spec:engineer --project samples/project.demo-orders-intake.yaml \
  --agent-run /tmp/m1-8p/<runId> --runs /tmp/spec-8p
pnpm render:html --run /tmp/spec-8p/<runId> --out /tmp/html-8p
```

- Phase 1：`8 pages / 0 blockers`。
- 真实 dsh M1：`gates={ia:waived, interaction:passed, visualStyle:passed}`，¥0.3298；IA-001/002 是 sample PRD 的 C 端断链/路由冲突，用 sample waiver；`pnpm agent:sign` 复用该 run 完成 visual-style 签核（不调用模型），状态 `success`。
- Spec Engineer：8 个 Page Spec，0 blockers；27 warnings（26 个未解析 motion node、asset briefs missing）。
- Renderer：8 个页面 + `index.html`；PageShell/MobileShell 全部 slot 已支持，带 stats、真实表格行、详情值、feed 卡片、本地化字段标签、空/加载状态和移动端底部导航。已用 Playwright 逐页截图巡检。
- `agent:run` 新增 `--brief <path>` 和 `--profile <name>`；intake 的 brief gate 现在同时跑 compiler dry-run 和 Phase 1 语义 validators。
- `UiBriefPage` 新增可选 `mockData`（values/rows/listItems）和 `fieldLabels`；8 页 brief 已填充示例数据。

## M0 资产评审

```bash
cd pipeline

# 一个图标：只跑 brief/source/hard gate
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --only icon-home --dry-run \
  --runs /tmp/m0-smoke

# 13 个资产：standalone + scripted reviewer（无 key）
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --runtime standalone \
  --runs /tmp/m0-runs

# retry / unresolved 场景
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0-scenarios \
  --runtime standalone \
  --runs /tmp/m0-scenarios
```

完整用法、产物和退出码见 [`pipeline/docs/asset-review-m0.md`](pipeline/docs/asset-review-m0.md)。

## dsh 真实评审

需要 vision 模型 key（DeepSeek text-only adapter 不支持图像）。默认走 DeepSeek 的 OpenAI-compatible 端点（`https://api.deepseek.com/v1` + `deepseek-flash`）；`PRD_UI_VISION_BASE_URL` 和 `PRD_UI_VISION_MODEL` 必须显式配置，没有 OpenAI fallback，缺失时 CLI 在启动阶段以 `CONFIGURATION_ERROR` 退出。

`.env` 不会被自动加载；先导出再运行：

```bash
cd pipeline
cp .env.example .env
# edit .env and fill PRD_UI_VISION_API_KEY
# PRD_UI_VISION_BASE_URL=https://api.deepseek.com/v1
# PRD_UI_VISION_MODEL=deepseek-flash
set -a; . ./.env; set +a

DSH_HOME="$PWD/dsh/home" \
  pnpm asset:review \
    --project samples/projects/employee-app/project.yaml \
    --assets samples/assets/m0 \
    --runtime dsh \
    --runs /tmp/m0-runs-dsh
```

`--runtime dsh` 默认全局 review 成本上限 10 元（`--max-review-cost-cny`）；usage 不完整时 fail closed，只有显式 `--allow-unknown-cost` 才继续。单资产 reviewer 失败默认继续（`--fail-fast` 改为立即停止）。

profile 安装、凭据解析顺序和限制见 [`pipeline/dsh/README.md`](pipeline/dsh/README.md)。

> 已用真实 `deepseek-flash` 跑通 dsh 端到端：13/13 passed，`summary.usageComplete = true`，`summary.reviewCostCny` 约 **¥0.35**（本次最终 run；多轮探针/重跑累计约 **¥1.1**，低于 10 元上限）。key 只写在本地 `pipeline/.env`，不提交。每次 review 的 usage/cost 已写入 `asset-review.json`；`pnpm test:dsh` 用本地 mock 服务器验证 dsh 链路，不需要真实 key。

## 测试与验收

- `pnpm test`：644 tests（core + standalone + dsh adapter conformance；offline，不跑 dsh mock integration）。
- `pnpm test:dsh`：4 tests（真实 pinned dsh CLI + 本地 OpenAI-compatible mock server；asset review、M1 IA、visual-critic mock 与 profile tool-list 断言；无需 key，不访问外网）。
- `pnpm typecheck`：clean。
- `pnpm phase1:verify`：`2 pages / 0 blockers`。
- `pnpm asset:review ... --assets samples/assets/m0 --runtime standalone`：`13 assets / 13 passed`。
- `pnpm asset:review ... --assets samples/assets/m0 --runtime dsh`（真实 `deepseek-flash`）：`13 assets / 13 passed`。
- `pnpm agent:run ... --runtime standalone`：三个 Agent 产物齐全；缺签核时 `awaiting_signoff`，签核后 `success`。
- `pnpm agent:run ... --runtime dsh`（真实 `deepseek-flash`）：三 Agent 各 1 次调用，`success`，¥0.1973，`usageComplete=true`，无 waiver。
- `pnpm spec:engineer --agent-run <clean M1 run>`：2 个增强 Page Spec，0 blockers；v0.4 clean 8 页 `--strict-motion` 为 8 Page Specs / 0 blockers / 0 motion unresolved。
- `pnpm intake:run --project samples/project.demo-orders.yaml --prd samples/sample-prd.md`：8 页 PRD review/IA/brief；PRD/IA 与 brief 签核后 `success`，发布 8 页 `ui-brief.json`。
- Briefer 数据完整性：scripted 8 页 intake 产出 `fieldLabels` / `mockData.rows` / `mockData.values` / `mockData.listItems` / `feedItems`，brief gate 通过；真实 dsh 干净 run（sample PRD-001 waiver）8 页、brief gate 通过、`awaiting_signoff`，¥0.5938，`usageComplete=true`。
- `pnpm intake:run --project samples/projects/employee-app/project.yaml --prd samples/projects/employee-app/prd.md`：2 页路径，brief gate 通过后等待签核。
- `pnpm phase1:verify --project samples/project.demo-orders-intake.yaml`：8 页 brief 的 Phase 1 语义校验，`8 pages / 0 blockers`。
- `pnpm phase1:verify --project samples/projects/employee-app-appointments-03/project.yaml`：03 真实 PRD 四页切片，`4 pages / 0 blockers`；真实 dsh intake `¥0.5147`、M1 `¥0.2746`（`ia:waived / interaction:passed / visualStyle:passed`）、Spec Engineer 4 Page Specs / 0 blockers、HTML 4 页。产物：[`pipeline/artifacts/employee-app-appointments-03/`](pipeline/artifacts/employee-app-appointments-03/)。
- 8 页 M1/Spec Engineer/renderer：8 Page Specs、8 HTML + index；M1 gate `ia:waived / interaction:passed / visualStyle:passed`，Spec Engineer 0 blockers。
- Phase 2 clean 出口（v0.4）：`samples/projects/employee-app-phase2` 8 页真实 PRD 切片；intake 8 页、0 waiver、0 手工 brief patch、brief hash `sha256:b558b57a…b8335`（¥0.8978）、M1 `ia:passed / interaction:passed / visualStyle:passed`（0 waiver，¥0.43998）、Spec Engineer 8 Page Specs / 0 blockers / 0 motion unresolved、HTML 8 页、`phase1:verify` `8 pages / 0 blockers`；visual baseline 24 cases、真实 Visual Critic 0 blocker / 9 findings（6 major / 3 minor），critique cache 命中 ¥0（0 次模型调用），按 stopping rule 签核后 `status=passed`（6 major 记为 v0.5 债）；Playwright picker/date/reschedule prefill 检查通过。产物：[`pipeline/artifacts/employee-app-phase2/`](pipeline/artifacts/employee-app-phase2/)。
- per-profile M1：8 页 demo-orders sample 真实 run prompt 含 b-dense + c-expressive，interaction passed（¥0.5105）。
- 资产链：`deriveStandardAssetInventory` + Visual Style 4 个标准图标 briefs；`asset:review --briefs` `4/4 passed`。
- `samples/assets/m0-scenarios`：`1 passed / 1 unresolved`，exit 1。
- standalone 与 dsh-like adapter 对同一 fixtures 产出相同 decision trace；确定性资产 byte-identical。

## 目录与文档

| 内容 | 路径 |
|---|---|
| 当前设计 | [`docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md`](docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md) |
| M1 Agent 设计 | [`docs/superpowers/specs/2026-10-20-m1-agent-layer-design.md`](docs/superpowers/specs/2026-10-20-m1-agent-layer-design.md) |
| Phase 2 Spec Engineer 设计 | [`docs/superpowers/specs/2026-10-20-phase-2-spec-engineer-design.md`](docs/superpowers/specs/2026-10-20-phase-2-spec-engineer-design.md) |
| Phase 2 PRD Review + UI Briefer 设计 | [`docs/superpowers/specs/2026-10-20-phase-2-prd-review-ui-briefer-design.md`](docs/superpowers/specs/2026-10-20-phase-2-prd-review-ui-briefer-design.md) |
| 8 页 Renderer / Mock Data 修复设计 | [`docs/superpowers/specs/2026-10-21-8page-renderer-mockdata-visual-fixes-design.md`](docs/superpowers/specs/2026-10-21-8page-renderer-mockdata-visual-fixes-design.md) |
| Renderer 视觉保真 v0.1 设计 | [`docs/superpowers/specs/2026-10-21-visual-fidelity-v01-design.md`](docs/superpowers/specs/2026-10-21-visual-fidelity-v01-design.md) |
| v0.4 动效 + 视觉回归设计 | [`docs/superpowers/specs/2026-10-22-v04-motion-visual-regression-design.md`](docs/superpowers/specs/2026-10-22-v04-motion-visual-regression-design.md) |
| Phase 2 剩余工作实施计划 | [`docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md`](docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md) |
| 8 页 Renderer 交接文档 | [`docs/handoffs/2026-10-21-8page-renderer-handoff.md`](docs/handoffs/2026-10-21-8page-renderer-handoff.md) |
| 8 页 Renderer 对话式交接 | [`docs/handoffs/2026-10-21-8page-renderer-handoff-dialogue.md`](docs/handoffs/2026-10-21-8page-renderer-handoff-dialogue.md) |
| Phase 2 Spec Engineer 计划 | [`docs/superpowers/plans/2026-10-20-phase-2-spec-engineer.md`](docs/superpowers/plans/2026-10-20-phase-2-spec-engineer.md) |
| M1 实施计划 | [`docs/superpowers/plans/2026-10-20-m1-agent-layer.md`](docs/superpowers/plans/2026-10-20-m1-agent-layer.md) |
| M0 使用说明 | [`pipeline/docs/asset-review-m0.md`](pipeline/docs/asset-review-m0.md) |
| M1 使用说明 | [`pipeline/docs/agent-m1.md`](pipeline/docs/agent-m1.md) |
| M1 UAT 矩阵 | [`pipeline/docs/agent-m1-uat.md`](pipeline/docs/agent-m1-uat.md) |
| Spec Engineer v0 使用说明 | [`pipeline/docs/spec-engineer-v0.md`](pipeline/docs/spec-engineer-v0.md) |
| PRD Review + UI Briefer 使用说明 | [`pipeline/docs/prd-review-briefer.md`](pipeline/docs/prd-review-briefer.md) |
| dsh profile / key | [`pipeline/dsh/README.md`](pipeline/dsh/README.md) |
| 交接文档 | [`docs/handoffs/2026-10-20-prd-ui-agent-dsh-handoff.md`](docs/handoffs/2026-10-20-prd-ui-agent-dsh-handoff.md) |
| 变更记录 | [`CHANGELOG.md`](CHANGELOG.md) |
| ZCode 工作约束 | [`AGENTS.md`](AGENTS.md) |

## 当前限制

- dsh 的 key 只在本地 `pipeline/.env`，不提交；`.env` 不会自动加载，需要 `set -a; . ./.env; set +a`。换环境需要重新配置。未配置时 profile 能加载、插件能激活，但 review 会以 `MISSING_CREDENTIAL` 失败，不会伪造 pass。
- `pnpm test:dsh` 需要 `node_modules/.bin/dsh`（`pnpm install` 后可用）；缺失时测试失败并提示安装，只有 `SKIP_DSH=1` 才跳过。
- M0 只接 A 库真实文件；B/C 的 adapter 接口和状态机已实现，真实供应商在 M2。
- M1 只产出 IA/Interaction/Visual spec 与 findings；Spec Engineer v0 已把 interaction/motion/asset 写进 Page Spec；v0.4 clean 8 页 motion 已进 HTML，其他项目未迁移的 motion nodeId 仍按 warning。
- M1 没有签核 UI；CLI 只校验 `signoff/*.md` 的机器可读块。`--allow-unreviewed` 不会产生 `success`。
- Spec Engineer v0 是确定性 mapper，不做 Spec Repair；gate 失败只写 findings。PRD Reviewer/UI Briefer、Visual Review/baseline diff 已实现；Figma、录屏/trace 仍属 Phase 3。
- 8 页 M1 仍只接收一个 catalog/motion token 集（`brief.meta.profile`）；混合 profile brief 的移动页已通过，但需要 per-profile 输入增强。
- 真实 UI Briefer 尚未稳定输出 `mockData`/`fieldLabels`；8 页 sample brief 是人工补齐的，briefer prompt/schema 还需硬化。
- 8 页 asset briefs 未产出，`SPEC_ASSET_BRIEFS_MISSING` 仍是 warning；8 页 asset review 未跑。
- 视觉验收已有 24 项 baseline + 确定性 gate + Visual Critic；critic 仍是 advisory，真实 model 有采样波动，尚未实现“finding 收敛”的确定性 replay。
- 插画 fixture 是 test-fixture，不是最终品牌资产。
