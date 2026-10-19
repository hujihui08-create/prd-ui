# Asset Review M0 — 使用说明

M0 是资产评审的最小闭环：`asset:review` 读取 brief 和 A 库候选，走确定性硬门禁，再由独立 reviewer 给出 verdict，最后冻结并生成 manifest。M0 不生成 IA/Interaction/Visual Style 产物，不接真实 B/C 供应商，不做 Figma/截图 diff/录屏。

## 快速开始

```bash
cd pipeline
pnpm install
pnpm test
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
```

预期输出：

```text
Asset review OK: 13 assets, 13 passed, 0 retried, 0 unresolved, 0 degraded
Run: /tmp/m0-runs/run-...
```

## dsh 真评审

dsh 需要 vision 模型 key；配置见 [`pipeline/dsh/README.md`](../dsh/README.md)。

```bash
cd pipeline
DSH_HOME="$PWD/dsh/home" \
  pnpm asset:review \
    --project samples/projects/employee-app/project.yaml \
    --assets samples/assets/m0 \
    --runtime dsh \
    --runs /tmp/m0-runs-dsh
```

先用 `--only icon-home` 验证 key 和 profile，再跑全部资产。

本地已用 mock OpenAI-compatible endpoint 跑通 dsh 端到端（1 个图标 smoke + 13 个资产全通过）；真实 provider 的视觉质量/成本仍需配置 key 后测量。

## 结果

| 路径 | 内容 |
|---|---|
| `run.json` / `asset-review.json` | run 状态、summary、每个资产每次 attempt 的 source/verdict/scores/issues/cost/timestamp、fallback/degraded |
| `manifest.json` | 冻结后的资产清单；`complete: true` 才能交给 renderer |
| `assets/briefs/<id>.json` | 实际使用的 brief |
| `assets/attempts/<id>/<source>-<n>/` | candidate、`candidate.meta.json`、`normalized.svg`、`gate.json`、`review.json` |
| `assets/frozen/<id>/` | 最终冻结文件 |
| `log.ndjson` | 事件流；key 已脱敏 |
| `dsh/<sessionId>/` | dsh 的 prompt/stdout/stderr/session 元数据（不含 key） |

常用检查：

```bash
RUN=/tmp/m0-runs/run-...
jq '.summary' "$RUN/asset-review.json"
jq '.assets[] | select(.status != "passed")' "$RUN/asset-review.json"
jq '.complete, (.assets | length)' "$RUN/manifest.json"
```

退出码：

- `0`：全部冻结，`manifest.json complete`。
- `1`：有 `unresolved`、`reviewer_error`、`configuration_error` 或预算超限。
- `2`：CLI 参数错误。

## Fixtures

- `samples/assets/m0/`：happy path，10 个 Lucide 图标（ISC，stroke-width 已统一为 1.5）+ 3 个本地 `test-fixture` 插画。
- `samples/assets/m0-scenarios/`：1 个 retry-then-pass、1 个三次失败 → unresolved，用于验证状态机。
- 插画是测试 fixture，不是最终品牌资产；真实 A/B/C 采购在 M2。

## 参数

| 参数 | 作用 |
|---|---|
| `--runtime standalone\|dsh` | 执行层；默认 standalone |
| `--reviewer scripted\|model` | standalone 的 reviewer；默认 scripted |
| `--only <assetId>` | 只跑指定资产，可重复 |
| `--dry-run` | 只做 brief/source/hard gate；不调模型、不冻结 |
| `--budget-usd` / `--budget-minutes` | 覆盖每资产预算 |
| `--profile` | 设计 profile；默认取项目唯一的 manifest profile |

## 当前限制

- 只接 A 库真实文件；B/C adapter 接口和状态机已实现，真实供应商在 M2。
- `--runtime dsh` 需要 vision key；没有 key 时 standalone + scripted 是 CI 路径。
- 不把 `asset:review` 接进 phase1 主状态机；M0 是独立命令。
- 不生成最终 handoff；只写 `runs/<id>/`。
