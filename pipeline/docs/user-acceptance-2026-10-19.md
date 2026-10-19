# Phase 1A · 独立用户验收测试记录

- 日期：2026-10-19
- 方式：独立 agent，不参考开发者结论，按真实用户路径操作
- 代码状态：`phase-1-foundation`，`6e63b5b`
- 结论：**示例 demo 通过；真实用户路径不通过。Phase 1A 是验证 harness，不是可用的 PRD → UI 产品。**

## 场景结果

| 场景 | 结果 | 证据 |
|---|---|---|
| A. 官方 CLI `pnpm phase1:verify` | **通过** | 退出 0，输出 `Phase 1A OK: 8 pages, 0 blockers`；`state.json` 为 `done/success`；8 份 page-spec；8 份 validation report 全部 `passed: true`；日志完整。 |
| B. 在现有项目加第 9 页 `customers-list` | **部分通过** | 编译/校验 9 页、0 blocker、`passed: true`；但页面布局仍是订单文案：`FilterBar.action` 是“新建订单”、筛选字段是 `status/date/keyword`、空状态是“暂无订单”、`assetRef` 是 `empty-orders`；`新建客户` 只出现在 interactions，没有出现在布局里。校验仍然全绿。 |
| C. 新建项目 `demo-crm` | **失败（被阻塞）** | 1 个 blocker：`ASSET-PROJECT`，`manifest.project` 为 `demo-orders`，页面项目为 `demo-crm`。没有文档化的方式提供项目级 manifest；修改 sample manifest 又会影响 demo。 |
| D. 用户通过 CLI 传入自己的 PRD/UI Brief | **失败** | README 只记录 `pnpm phase1:verify`；`--help` 会真的跑一次 sample；传入 brief 路径被忽略，仍运行 `demo-orders` 的 8 页 sample。自定义 brief 必须写 TypeScript 脚本才能跑。 |

`pnpm test` 100/100，`pnpm typecheck` 通过；测试过程没有修改仓库文件。

## 用户级问题（按优先级）

1. **Blocker：只有 `demo-orders` 能通过。** `run-phase1.ts` 硬编码 `samples/asset-manifest.{b-dense,c-expressive}.json`；`runPhase1` 只暴露 `briefPath`/`runsDir`，没有项目 manifest 入口；CLI 没有参数。任何新项目都会 `ASSET-PROJECT`。
2. **High：自定义页面会静默生成订单文案。** `compile-page-spec.ts` 硬编码 Web nav、移动 tabs、列表筛选/动作/空状态、详情摘要；`customers-list` 校验 0 blocker，但显示的是订单内容。
3. **High：Validator 不检测 Brief 与布局的语义不一致。** 只检查 schema/catalog/token/layout/state/asset/traceability，不检查 `fields/actions/name/purpose` 是否真的进入布局。
4. **High：CLI 不支持自定义输入。** `phase1:verify` 无参数解析；传 brief 路径会被忽略；`--help` 会执行 sample。
5. **Medium：Page Spec 丢失 `purpose`/`route`/`roles`。** `PageSpec.meta` 没有这些字段，编译后只能在 `artifacts/ui-brief.json` 里找到。
6. **Medium：没有 PRD → UI Brief 路径。** `sample-prd.md` 只是示例，没有代码读取；用户必须手写严格 JSON，再写 TS 脚本运行。
7. **Low：`runPhase1` 在 validation blocker 时返回 `passed: false` 而不 throw。** 自定义脚本若只看函数是否抛错，会误以为成功；CLI 本身会 exit 1。
8. **Low：CLI 成功输出不打印 run 目录。** 用户需要自己在 `runs/` 里找。

## 结论与下一步

Phase 1A 的**技术出口**（8 页、0 blocker、100/100 测试、typecheck 干净）是真实的；但**用户出口**不成立。要让真实用户使用，需要按顺序补：

1. **项目级配置**：`project.yaml` / CLI `--brief`、`--manifest`、`--project`，按项目解析 manifest，不再硬编码 `demo-orders`。
2. **Brief 驱动的页面内容**：nav/tabs、filter fields、actions、empty state、summary 从 UI Brief/PRD 取值；或接入 Phase 2 的 Spec Engineer（LLM + 模板约束）。
3. **语义校验**：Brief 的 `fields/actions/route/roles` 与 Page Spec 布局对齐，发现不一致时 blocker。
4. **Page Spec 元数据**：补 `purpose`/`route`/`roles`，让下游可路由、可授权。
5. **PRD → UI Brief**：Phase 2 的解析与追问；当前只能手写 JSON。
6. **CLI/文档**：参数解析、`--help` 不执行真实 run、成功输出打印 run 目录，README 明确“Phase 1A 仅 sample harness”。

前 3 项属于 Phase 1B/1C 的用户可用性切片；第 4–6 项可以并行小步补。Phase 1A 不应被当作“可以直接交给用户跑自己 PRD”的版本。
