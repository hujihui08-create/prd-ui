# 块级实验报告 — employee-app-phase2

- 结论：回滚 (`rollback`)
- 基线：`/Users/jihui/Desktop/产品、ui/.worktrees/v0.7/pipeline/artifacts/employee-app-phase2/figma/spec-source`
- 运行目录：`/tmp/block-experiment-fair2/run-2026-10-26T14-17-48-295Z`
- 预算：¥3；实际成本：¥0.3302（fixture 模式为 ¥0）
- 原因：conformance failed；parity not evaluated

## 页面指标

| 页面 | 块数 | 新接缝 | token 漂移 | 块重试 | 页重试 | 页高 Δ | 页高门禁 | conformance | parity |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| today | 3 | 0 | 0 | 0 | 0 | 0% | 通过 | 失败 | 未评估 |
| appointment-list | 4 | 0 | 0 | 0 | 0 | 0% | 通过 | 失败 | 未评估 |

> 页高门禁以页面级 `documentHeight` Δ 为准：|Δ| > 5% 是硬性 rollback 原因（`heightDelta>5%`），
> 与块级 root id 是否保留无关；块级 Δ 只作为附加诊断。
> `durationMs` 在 fixture 模式只覆盖块生成/组装/校验，不含浏览器测量与 conformance 捕获；
> dsh 模式下还包含模型调用，但同样不含浏览器测量与 conformance 捕获。

## 接缝

| 页面 | 基线 countSeams | 实验 countSeams | 新增 seam 类型 | 净 Δ |
| --- | ---: | ---: | ---: | ---: |
| today | 0 | 0 | 0 | 0 |
| appointment-list | 1 | 1 | 0 | 0 |

> `countSeams` 在每条块边界分别计数：padding seam 与 duplicate-title seam 各算 1。
> “新增 seam 类型”是逐边界正增量之和，`metrics.seams` 使用同一值；“净 Δ”是实验总数减基线总数。
> 基线已有的接缝（例如 appointment-list 的 calendar/list 互斥视图面板）会显示在基线列，不会被隐藏。

## Conformance gate

| 页面 | 基线 blocker | 实验 blocker | 新增 blocker | id 可比 | 基线 gate | conformance |
| --- | ---: | ---: | ---: | --- | --- | --- |
| today | 19 | 19 | 0 | 可比 | 未通过 | 失败 |
| appointment-list | 708 | 710 | 2 | 可比 | 未通过 | 失败 |

> 2 页的基线 conformance 本身未通过（已知 plan/HTML 建模差异，见 v0.7 SDD ledger 的 Task 6 记录）。
> 这些页面按 fail-closed 记录为 `failed`，结论回滚；新增 blocker 只是回归诊断，不能抵消基线红灯。

> `conformance` 是 tri-state：`passed` 仅当 gate 运行且 0 blocker；`failed` 表示 gate 运行且有 blocker；
> `not_evaluated` 表示 gate 未运行。`新增 blocker` / `修复 blocker` 只在 `id 可比` 时具有证据意义：
> 如果模型重命名 baseline 节点 id，gate 会按不同 key 比较，新增/修复数不可引用，也不能据此 promote。


## 页面校验与块校验

| 页面 | Phase 1 blockers | Phase 1 major | 块校验 |
| --- | ---: | ---: | --- |
| today | 0 | 0 | 通过 |
| appointment-list | 5 | 0 | 通过 |

## 页高实测

| 页面 | 基线高度 | 实验高度 | Δ | 5% 门禁 |
| --- | ---: | ---: | ---: | --- |
| today | 844px | 844px | 0% | 通过 |
| appointment-list | 844px | 844px | 0% | 通过 |

> 上表 Δ 是机器门禁输入；`|Δ| > 5%` 会写入 `reasons` 并强制 `rollback`。


## 证据路径

- `/tmp/block-experiment-fair2/run-2026-10-26T14-17-48-295Z/block-experiment.json`
- `/tmp/block-experiment-fair2/run-2026-10-26T14-17-48-295Z/block-experiment.md`
- `/tmp/block-experiment-fair2/run-2026-10-26T14-17-48-295Z/block-verify.json`
- `/tmp/block-experiment-fair2/run-2026-10-26T14-17-48-295Z/validation.json`
- `/tmp/block-experiment-fair2/run-2026-10-26T14-17-48-295Z/conformance/conformance.json`
- `/tmp/block-experiment-fair2/run-2026-10-26T14-17-48-295Z/measurements.json`
- `/tmp/block-experiment-fair2/run-2026-10-26T14-17-48-295Z/artifacts/block-manifest`
- `/tmp/block-experiment-fair2/run-2026-10-26T14-17-48-295Z/html`
