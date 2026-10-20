# PRD → UI Pipeline

确定性管线 + 双运行时资产评审。一个运行时无关的 `core`，两个薄适配器：`standalone`（文件系统/CI）和 `dsh`（DeepSeek Harness headless）。

## 现在能做什么

- **Phase 1A/1B**：UI Brief → Page Spec → validators → HTML Renderer，员工端两页切片（`今日` + `库存查询`）保持 `2 pages / 0 blockers`。
- **M0 资产评审**：10 个 Lucide 图标 + 3 个 test-fixture 插画走 A 库，经过规范化、硬门禁、独立 reviewer、重试/切源/预算/审计，产出 `asset-review.json` 和 `manifest.json`。
- **双运行时**：同一 core 状态机；`standalone` 用 scripted reviewer 跑 CI，`dsh` 用 headless + vision 模型跑真实评审。
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

需要 vision 模型 key（DeepSeek text-only adapter 不支持图像）。`PRD_UI_VISION_BASE_URL` 和 `PRD_UI_VISION_MODEL` 必须显式配置，缺失时 CLI 在启动阶段以 `CONFIGURATION_ERROR` 退出：

```bash
cd pipeline
cp .env.example .env
# edit .env and fill PRD_UI_VISION_API_KEY
# PRD_UI_VISION_BASE_URL=https://api.deepseek.com/v1
# PRD_UI_VISION_MODEL=deepseek-flash
set -a; source .env; set +a

DSH_HOME="$PWD/dsh/home" \
  pnpm asset:review \
    --project samples/projects/employee-app/project.yaml \
    --assets samples/assets/m0 \
    --runtime dsh \
    --runs /tmp/m0-runs-dsh
```

profile 安装、凭据解析顺序和限制见 [`pipeline/dsh/README.md`](pipeline/dsh/README.md)。

> 已用真实 `deepseek-flash` 跑通 dsh 端到端：13/13 passed。本轮 13 个资产约 **¥0.46**（按峰值价估算），加上探针/重跑累计约 **¥0.78**，低于 10 元上限。key 只写在本地 `pipeline/.env`，不提交。模型成本目前从 dsh 会话 usage 外部核算，尚未写入 `asset-review.json`。

## 测试与验收

- `pnpm test`：233 tests（core + standalone + dsh adapter conformance）。
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

- dsh 的 key 只在本地 `pipeline/.env`，不提交；换环境需要重新配置。未配置时 profile 能加载、插件能激活，但 review 会以 `MISSING_CREDENTIAL` 失败，不会伪造 pass。
- 模型成本目前从 dsh 会话 usage 外部核算，尚未进入 `asset-review.json` 的 `costUsd` 字段。
- M0 只接 A 库真实文件；B/C 的 adapter 接口和状态机已实现，真实供应商在 M2。
- 不实现 IA / Interaction / Visual Style Agent（M1）；不做 Figma、截图 diff、录屏/trace（M3）。
- 插画 fixture 是 test-fixture，不是最终品牌资产。
- 不 push；本地 commit。
