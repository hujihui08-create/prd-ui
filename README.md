# PRD → UI Pipeline

确定性管线 + 双运行时资产评审 + M1 设计 Agent 层。一个运行时无关的 `core`，两个薄适配器：`standalone`（文件系统/CI）和 `dsh`（DeepSeek Harness headless）。

## 现在能做什么

- **Phase 1A/1B**：UI Brief → Page Spec → validators → HTML Renderer，员工端两页切片（`今日` + `库存查询`）保持 `2 pages / 0 blockers`。
- **M0 资产评审**：10 个 Lucide 图标 + 3 个 test-fixture 插画走 A 库，经过规范化、硬门禁、独立 reviewer、重试/切源/预算/审计，产出 `asset-review.json` 和 `manifest.json`。
- **硬化（M0.5）**：H1–H15 已实现——全元素 SVG 门禁、图标/插画 set 级一致性门禁、reviewer 错误隔离、严格配置/provider 校验、dsh usage 成本核算与 10 元全局护栏、2x PNG 证据、`--json -` stdin 传输、append-only `log.ndjson`、raw review sidecar、一次 schema 修复、`manifest.review.json` 与统一脱敏。
- **M1 Agent 层**：IA / Interaction / Visual Style 三个只读 Agent，共享 `AgentRunnerPort`，确定性门禁、预算、重试、失败隔离、证据与人工 signoff；`pnpm agent:run` 可离线（scripted fixtures）或走真实 dsh。产物是 `ia-map` / `interaction-spec` / `motion-spec` / `visual-style` / `asset-briefs`，不修改 Page Spec、HTML 或 renderer。
- **Spec Engineer v0**：确定性 mapper，把 M1 的 interaction/motion/asset artifacts 写进 Page Spec；新增可选 `interactions[].nodeId` 与 `motion`，输出 gate/summary。motion 已携带、尚未动画到 HTML。
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
    agents/             # M1 IA/Interaction/Visual Style 契约、prompt、门禁、runM1
  runtimes/
    standalone/         # phase1/render/asset/agent CLI + fs/library/scripted/model 适配
    dsh/                # Cordis 插件、工具、headless adapter、agent runner
  dsh/                  # 项目内 dsh profile（prd-ui-assets / prd-ui-agents；不修改 ~/.dsh）
  samples/assets/m0/    # 10 图标 + 3 插画 + briefs + scripted reviews
  samples/agents/m1/    # employee-app 的 IA/Interaction/Visual scripted fixtures
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

- `pnpm test`：448 tests（core + standalone + dsh adapter conformance；offline，不跑 dsh mock integration）。
- `pnpm test:dsh`：2 tests（真实 pinned dsh CLI + 本地 OpenAI-compatible mock server；分别是 asset review 和 M1 IA；无需 key，不访问外网）。
- `pnpm typecheck`：clean。
- `pnpm phase1:verify`：`2 pages / 0 blockers`。
- `pnpm asset:review ... --assets samples/assets/m0 --runtime standalone`：`13 assets / 13 passed`。
- `pnpm asset:review ... --assets samples/assets/m0 --runtime dsh`（真实 `deepseek-flash`）：`13 assets / 13 passed`。
- `pnpm agent:run ... --runtime standalone`：三个 Agent 产物齐全；缺签核时 `awaiting_signoff`，签核后 `success`。
- `pnpm agent:run ... --runtime dsh`（真实 `deepseek-flash`）：三 Agent 各 1 次调用，`success`，¥0.1973，`usageComplete=true`，无 waiver。
- `pnpm spec:engineer --agent-run <clean M1 run>`：2 个增强 Page Spec，0 blockers，28 warnings（v0 预期）。
- `samples/assets/m0-scenarios`：`1 passed / 1 unresolved`，exit 1。
- standalone 与 dsh-like adapter 对同一 fixtures 产出相同 decision trace；确定性资产 byte-identical。

## 目录与文档

| 内容 | 路径 |
|---|---|
| 当前设计 | [`docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md`](docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md) |
| M1 Agent 设计 | [`docs/superpowers/specs/2026-10-20-m1-agent-layer-design.md`](docs/superpowers/specs/2026-10-20-m1-agent-layer-design.md) |
| Phase 2 Spec Engineer 设计 | [`docs/superpowers/specs/2026-10-20-phase-2-spec-engineer-design.md`](docs/superpowers/specs/2026-10-20-phase-2-spec-engineer-design.md) |
| Phase 2 Spec Engineer 计划 | [`docs/superpowers/plans/2026-10-20-phase-2-spec-engineer.md`](docs/superpowers/plans/2026-10-20-phase-2-spec-engineer.md) |
| M1 实施计划 | [`docs/superpowers/plans/2026-10-20-m1-agent-layer.md`](docs/superpowers/plans/2026-10-20-m1-agent-layer.md) |
| M0 使用说明 | [`pipeline/docs/asset-review-m0.md`](pipeline/docs/asset-review-m0.md) |
| M1 使用说明 | [`pipeline/docs/agent-m1.md`](pipeline/docs/agent-m1.md) |
| M1 UAT 矩阵 | [`pipeline/docs/agent-m1-uat.md`](pipeline/docs/agent-m1-uat.md) |
| Spec Engineer v0 使用说明 | [`pipeline/docs/spec-engineer-v0.md`](pipeline/docs/spec-engineer-v0.md) |
| dsh profile / key | [`pipeline/dsh/README.md`](pipeline/dsh/README.md) |
| 交接文档 | [`docs/handoffs/2026-10-20-prd-ui-agent-dsh-handoff.md`](docs/handoffs/2026-10-20-prd-ui-agent-dsh-handoff.md) |
| 变更记录 | [`CHANGELOG.md`](CHANGELOG.md) |
| ZCode 工作约束 | [`AGENTS.md`](AGENTS.md) |

## 当前限制

- dsh 的 key 只在本地 `pipeline/.env`，不提交；`.env` 不会自动加载，需要 `set -a; . ./.env; set +a`。换环境需要重新配置。未配置时 profile 能加载、插件能激活，但 review 会以 `MISSING_CREDENTIAL` 失败，不会伪造 pass。
- `pnpm test:dsh` 需要 `node_modules/.bin/dsh`（`pnpm install` 后可用）；缺失时测试失败并提示安装，只有 `SKIP_DSH=1` 才跳过。
- M0 只接 A 库真实文件；B/C 的 adapter 接口和状态机已实现，真实供应商在 M2。
- M1 只产出 IA/Interaction/Visual spec 与 findings；Spec Engineer v0 已把 interaction/motion/asset 写进 Page Spec，但 motion 尚未动画到 HTML，未解析的 motion nodeId 只记 warning。
- M1 没有签核 UI；CLI 只校验 `signoff/*.md` 的机器可读块。`--allow-unreviewed` 不会产生 `success`。
- Spec Engineer v0 是确定性 mapper，不做 Spec Repair；gate 失败只写 findings。不做 PRD Reviewer、UI Briefer；不做 Figma、截图 diff、录屏/trace（M3）。
- 插画 fixture 是 test-fixture，不是最终品牌资产。
- 不 push；本地 commit。
