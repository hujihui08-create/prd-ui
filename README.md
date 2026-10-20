# PRD → UI Pipeline

确定性管线 + 双运行时资产评审。一个运行时无关的 `core`，两个薄适配器：`standalone`（文件系统/CI）和 `dsh`（DeepSeek Harness headless）。

## 现在能做什么

- **Phase 1A/1B**：UI Brief → Page Spec → validators → HTML Renderer，员工端两页切片（`今日` + `库存查询`）保持 `2 pages / 0 blockers`。
- **M0 资产评审**：10 个 Lucide 图标 + 3 个 test-fixture 插画走 A 库，经过规范化、硬门禁、独立 reviewer、重试/切源/预算/审计，产出 `asset-review.json` 和 `manifest.json`。
- **硬化（M0.5）**：H1–H15 已实现——全元素 SVG 门禁、图标/插画 set 级一致性门禁、reviewer 错误隔离、严格配置/provider 校验、dsh usage 成本核算与 10 元全局护栏、2x PNG 证据、`--json -` stdin 传输、append-only `log.ndjson`、raw review sidecar、一次 schema 修复、`manifest.review.json` 与统一脱敏。
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
  runtimes/
    standalone/         # phase1/render/asset CLI + fs/library/scripted/model 适配
    dsh/                # Cordis 插件、工具、headless adapter
  dsh/                  # 项目内 dsh profile（不修改 ~/.dsh）
  samples/assets/m0/    # 10 图标 + 3 插画 + briefs + scripted reviews
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
```

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

> 已用真实 `deepseek-flash` 跑通 dsh 端到端：13/13 passed，`summary.usageComplete = true`，`summary.reviewCostCny` 约 **¥0.46**（峰值价估算），加上探针/重跑累计约 **¥0.78**，低于 10 元上限。key 只写在本地 `pipeline/.env`，不提交。每次 review 的 usage/cost 已写入 `asset-review.json`；`pnpm test:dsh` 用本地 mock 服务器验证 dsh 链路，不需要真实 key。

## 测试与验收

- `pnpm test`：336 tests（core + standalone + dsh adapter conformance；offline，不跑 dsh mock integration）。
- `pnpm test:dsh`：1 test（真实 pinned dsh CLI + 本地 OpenAI-compatible mock server；无需 key，不访问外网）。
- `pnpm typecheck`：clean。
- `pnpm phase1:verify`：`2 pages / 0 blockers`。
- `pnpm asset:review ... --assets samples/assets/m0 --runtime standalone`：`13 assets / 13 passed`。
- `pnpm asset:review ... --assets samples/assets/m0 --runtime dsh`（真实 `deepseek-flash`）：`13 assets / 13 passed`。
- `samples/assets/m0-scenarios`：`1 passed / 1 unresolved`，exit 1。
- standalone 与 dsh-like adapter 对同一 fixtures 产出相同 decision trace；确定性资产 byte-identical。

## 目录与文档

| 内容 | 路径 |
|---|---|
| 当前设计 | [`docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md`](docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md) |
| 实施计划与勾选 | [`docs/superpowers/plans/2026-10-20-core-runtime-m0.md`](docs/superpowers/plans/2026-10-20-core-runtime-m0.md) |
| M0 使用说明 | [`pipeline/docs/asset-review-m0.md`](pipeline/docs/asset-review-m0.md) |
| dsh profile / key | [`pipeline/dsh/README.md`](pipeline/dsh/README.md) |
| 交接文档 | [`docs/handoffs/2026-10-20-prd-ui-agent-dsh-handoff.md`](docs/handoffs/2026-10-20-prd-ui-agent-dsh-handoff.md) |
| 变更记录 | [`CHANGELOG.md`](CHANGELOG.md) |
| ZCode 工作约束 | [`AGENTS.md`](AGENTS.md) |

## 当前限制

- dsh 的 key 只在本地 `pipeline/.env`，不提交；`.env` 不会自动加载，需要 `set -a; . ./.env; set +a`。换环境需要重新配置。未配置时 profile 能加载、插件能激活，但 review 会以 `MISSING_CREDENTIAL` 失败，不会伪造 pass。
- `pnpm test:dsh` 需要 `node_modules/.bin/dsh`（`pnpm install` 后可用）；缺失时测试失败并提示安装，只有 `SKIP_DSH=1` 才跳过。
- M0 只接 A 库真实文件；B/C 的 adapter 接口和状态机已实现，真实供应商在 M2。
- 不实现 IA / Interaction / Visual Style Agent（M1）；不做 Figma、截图 diff、录屏/trace（M3）。
- 插画 fixture 是 test-fixture，不是最终品牌资产。
- 不 push；本地 commit。
