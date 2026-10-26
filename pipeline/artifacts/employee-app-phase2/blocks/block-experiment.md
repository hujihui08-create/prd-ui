# 块级实验报告 — employee-app-phase2

> 本目录是 2026-10-26 公平试跑（run-2026-10-26T14-17-48-295Z）的证据副本；
> 本地绝对路径已改写为仓库相对路径，测量数据未改。原始运行发生在 v0.7
> conformance 修复之前，conformance baseline 当时为红。

- 结论：回滚 (`rollback`)
- 基线：`pipeline/artifacts/employee-app-phase2/figma/spec-source`
- 预算：¥3；实际成本：¥0.3302（fixture 模式为 ¥0）
- 原因：conformance failed；parity not evaluated

## 更正：页高门禁必须读 `contentHeight`（2026-10-26 终审修复）

原始运行（v0.7 实现提交时）只用页面级 `documentHeight` Δ 做高度门禁。
`documentHeight = max(documentElement.scrollHeight, scrollContainer.scrollHeight)`
且会被移动端视口 844px 抬升，因此短页面上的内容增长完全被掩盖：

| 页面 | 基线 contentHeight | 实验 contentHeight | contentHeight Δ | 旧 doc Δ | 旧门禁 | 更正后门禁 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| today | 732 | 732 | 0% | 0% | 通过 | 通过 |
| appointment-list | 760 | 804 | **+5.79%** | 0% | 通过（漏报） | **未通过（rollback）** |

本次运行的实际 `documentHeight` 在两页都是 844，`contentHeight` 才是原始滚动内容高度。
修复后的 `evaluateBlockExperiment` 同时检查两个 Δ，任一 |Δ| > 5% 都会写入
`heightDelta>5%` 并强制 `rollback`。该运行原本就因 conformance failed / parity
not evaluated 回滚，因此更正不改变结论，只补上被漏掉的高度回归证据。
本目录的 `block-experiment.json` / `measurements.json` 是原始运行的机器证据，
未改写；更正后的指标以本节和当前代码/测试为准。

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

> 2 页的基线 conformance 本身未通过（已知 plan/HTML 建模差异，v0.7 已修复为 0/0）。
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

以下路径均相对于仓库根目录：

- `pipeline/artifacts/employee-app-phase2/blocks/block-experiment.json`
- `pipeline/artifacts/employee-app-phase2/blocks/block-experiment.md`
- `pipeline/artifacts/employee-app-phase2/blocks/block-verify.json`
- `pipeline/artifacts/employee-app-phase2/blocks/validation.json`
- `pipeline/artifacts/employee-app-phase2/blocks/conformance/conformance.json`
- `pipeline/artifacts/employee-app-phase2/blocks/measurements.json`
- `pipeline/artifacts/employee-app-phase2/blocks/artifacts/block-manifest/`
- `pipeline/artifacts/employee-app-phase2/blocks/render-metrics.baseline.json`
- `pipeline/artifacts/employee-app-phase2/blocks/render-metrics.experiment.json`

实验生成的 HTML 未随证据提交（体积原因），不在此处链接。
