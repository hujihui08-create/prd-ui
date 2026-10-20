# Asset Review M0 — 使用说明

M0 是资产评审的最小闭环：`asset:review` 读取 brief 和 A 库候选，走确定性硬门禁，再由独立 reviewer 给出 verdict，最后冻结并生成 manifest。M0 不生成 IA/Interaction/Visual Style 产物，不接真实 B/C 供应商，不做 Figma/截图 diff/录屏。

M0.5 硬化（H1–H15）已实现：全元素/组合 SVG 门禁、图标与插画 set 级门禁、reviewer 错误隔离、严格配置校验、dsh usage/成本核算与 10 元护栏、PNG 证据、`--json -` stdin、append-only 日志、raw review sidecar、一次 schema 修复、`manifest.review.json`、`--json` 输出和 `pnpm test:dsh`。

## 快速开始

```bash
cd pipeline
pnpm install
pnpm test          # offline，不含 dsh mock integration
pnpm test:dsh      # 本地 mock server + 真实 pinned dsh CLI（无需 key）
pnpm typecheck

# 先看一个图标：只解析 brief/source/gate，不调模型
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --only icon-home --dry-run \
  --runs /tmp/m0-smoke

# 一个图标走完整状态机（scripted reviewer，无 key、无成本）
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --only icon-home --runtime standalone \
  --runs /tmp/m0-smoke

# 13 个资产全跑（10 图标 + 3 插画）
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --runtime standalone \
  --runs /tmp/m0-runs

# 机器可读输出：stdout 只有一个 JSON 文档，人类可读行改走 stderr
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --runtime standalone \
  --runs /tmp/m0-runs --json | jq '.summary, .usageComplete'
```

预期输出：

```text
Asset review OK: 13 assets, 13 passed, 0 retried, 0 unresolved, 0 degraded
Run: /tmp/m0-runs/run-...
```

## dsh 真评审

dsh 需要 vision 模型 key；默认使用 DeepSeek（`PRD_UI_VISION_BASE_URL=https://api.deepseek.com/v1`、`PRD_UI_VISION_MODEL=deepseek-flash`），没有 OpenAI fallback。配置见 [`pipeline/dsh/README.md`](../dsh/README.md)。

`.env` **不会**被自动加载；显式导出后再运行：

```bash
cd pipeline
set -a; . ./.env; set +a

DSH_HOME="$PWD/dsh/home" \
  pnpm asset:review \
    --project samples/projects/employee-app/project.yaml \
    --assets samples/assets/m0 \
    --runtime dsh \
    --runs /tmp/m0-runs-dsh
```

先用 `--only icon-home` 验证 key 和 profile，再跑全部资产。`--runtime dsh` 默认 `--max-review-cost-cny 10`；usage 不完整时 fail closed（`REVIEW_USAGE_INCOMPLETE`），只有 `--allow-unknown-cost` 才继续。

已用真实 `deepseek-flash` 跑通 dsh 端到端（1 个图标 smoke + 13 个资产全通过）。13 个资产本轮 usage：79,607 input + 30,043 output + 727,552 cache read；估算 ¥0.463 峰值 / ¥0.232 低谷，累计探针/重跑约 ¥0.78，低于 10 元上限。usage/cost 已写入 `asset-review.json` 的 `summary`，key 只在本地 `pipeline/.env`，不提交。

### dsh mock integration

`pnpm test:dsh` 在本地启动 OpenAI-compatible mock HTTP server，用真实 pinned dsh CLI/profile 跑 `asset:review --only icon-home --runtime dsh`，断言 exit 0、资产 passed、`dsh/` 证据存在且 `summary.usageComplete === true`。它不使用真实 key，也不访问外网。

- mock 必须在 `usage.prompt_tokens_details.cached_tokens` 中给出非零 cache-read；dsh 在 cache-read 为 0 时会省略 `cacheReadTokens`，适配器因此报告 usage 不完整。
- 缺少 `node_modules/.bin/dsh` 时测试失败并给出 `pnpm install` 提示；只有 `SKIP_DSH=1 pnpm test:dsh` 才跳过。
- 该测试被默认 `vitest.config.ts` 排除，`pnpm test` 仍是纯 offline 单元测试。

## 结果

| 路径 | 内容 |
|---|---|
| `run.json` / `asset-review.json` | run 状态、summary（含 usage/cost）、每个资产每次 attempt 的 source/verdict/scores/issues/cost/timestamp、fallback/degraded |
| `manifest.json` | 冻结后的资产清单；`complete: true` 才能交给 renderer |
| `manifest.review.json` | 只读审计 sidecar：batch gates、review usage/source、degraded/unresolved |
| `assets/briefs/<id>.json` | 实际使用的 brief |
| `assets/attempts/<id>/<source>-<n>/` | `candidate.svg`、`candidate.png`（2x）、`candidate.meta.json`、`normalized.svg`、`gate.json`、`review.json` |
| `assets/icon-set.json` / `assets/illustration-set.json` | set 级门禁结果（`--only` 时写 `assets/batch-gates.json`，标记 `PARTIAL_REVIEW`） |
| `assets/frozen/<id>/` | 最终冻结文件 |
| `log.ndjson` | append-only 事件流；key 已脱敏 |
| `dsh/<assetId>-<source>-<attempt>/` | dsh 的 prompt/stdout/stderr/session、`review.raw.json`、失败时的 `error.json`（不含 key） |

常用检查：

```bash
RUN=/tmp/m0-runs/run-...
jq '.summary' "$RUN/asset-review.json"
jq '.assets[] | select(.status != "passed")' "$RUN/asset-review.json"
jq '.complete, (.assets | length)' "$RUN/manifest.json"
jq '.usageSource, .usageComplete, .batchGates' "$RUN/manifest.review.json"
```

退出码：

- `0`：全部冻结，`manifest.json complete`。
- `1`：有 `unresolved`、`reviewer_error`、`configuration_error`、usage 不完整（`REVIEW_USAGE_INCOMPLETE`）或预算超限。
- `2`：CLI 参数错误。

`--json` 时 stdout 始终只输出一个 JSON 对象，包含 `runDir`、`summary`、`assets`、`batchGates`、`error`、`reviewCostCny`、`usageSource`、`usageComplete`（不可用值为 `null`，`--dry-run` 时额外带 `preflight`）；人类可读行写到 stderr。

## Fixtures

- `samples/assets/m0/`：happy path，10 个 Lucide 图标（ISC，stroke-width 已统一为 1.5）+ 3 个本地 `test-fixture` 插画。
- `samples/assets/m0-scenarios/`：1 个 retry-then-pass、1 个三次失败 → unresolved，用于验证状态机。
- 插画是测试 fixture，不是最终品牌资产；真实 A/B/C 采购在 M2。

## 参数

| 参数 | 作用 |
|---|---|
| `--runtime standalone\|dsh` | 执行层；默认 standalone |
| `--reviewer scripted\|model` | standalone 的 reviewer；默认 scripted |
| `--only <assetId>` | 只跑指定资产，可重复；跳过 set 门禁并标记 `PARTIAL_REVIEW` |
| `--dry-run` | 只做 brief/source/hard gate；不调模型、不冻结 |
| `--budget-usd` / `--budget-minutes` | 覆盖每资产 producer 预算 |
| `--max-review-cost-cny <n>` | 全局 review 成本上限（dsh 默认 10 元） |
| `--allow-unknown-cost` | usage 不完整时继续，而不是 fail closed |
| `--fail-fast` | 第一个 reviewer 错误即停止批次（默认继续其它资产） |
| `--pricing <path>` | 价格文件；默认 `<assets>/pricing.json` 或 `pipeline/pricing.json` |
| `--json` | stdout 输出单个 JSON summary，人类可读行改走 stderr |
| `--profile` | 设计 profile；默认取项目唯一的 manifest profile |

## 当前限制

- 只接 A 库真实文件；B/C adapter 接口和状态机已实现，真实供应商在 M2。
- `--runtime dsh` 需要 vision key；没有 key 时 standalone + scripted 是 CI 路径，`pnpm test:dsh` 是 mock 集成路径。
- 不把 `asset:review` 接进 phase1 主状态机；M0 是独立命令。
- 不生成最终 handoff；只写 `runs/<id>/`。
