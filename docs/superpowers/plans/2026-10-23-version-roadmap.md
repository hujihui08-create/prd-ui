# 版本路线（v0.4.1 → v1.0）

- 日期：2026-10-23
- 状态：Confirmed（用户确认整体拆分）
- 输入：v0.4 完成（signed `passed`，6 条 major 视觉债）、主设计 Phase 3/4
- 关联：[主设计文档](../specs/2026-10-19-prd-to-ui-pipeline-design.md)、[v0.4 设计](../specs/2026-10-22-v04-motion-visual-regression-design.md)

## 0. 版本规则

- `0.x`：能力里程碑，一个完整能力域完成后 +0.1。
- `0.x.y`：补丁/收尾，不新增能力。
- `1.0`：Phase 3 + Phase 4 完成，真实项目与用户视觉终审通过。
- 任务和 commit 不逐个升版本；版本只在里程碑验收时提升。
- `PageSpec.meta.version`、Profile/Catalog 的 `0.1.0` 是制品 schema 版本，不是发布版本。

## 1. 总览

| 版本 | 主题 | 规模 | 状态 |
|---|---|---|---|
| v0.1 | 视觉保真 | S | 已完成 |
| v0.2 | 多 profile + 资产链 | M | 已完成 |
| v0.3 | Phase 2 验收交付（sample waiver） | L | 已完成，被 v0.3.1 替代 |
| v0.3.1 | Clean Phase 2 收尾 | M | 已完成 |
| v0.4 | 动效 + 视觉回归 | L | 已完成，6 条 major 转入 v0.5 |
| **v0.4.1** | **视觉小额补丁** | **S** | **已完成（signed）** |
| **v0.5** | **视觉 + a11y 收口** | **M** | **已完成（signed）** |
| v0.6 | Phase 3A：Figma + Studio | L | Implemented（Figma gate pending） |
| v0.7 | 视觉门禁 + 结构优化 + 分块实验 + Handoff（原 Phase 3B 沙箱/Test Subagent 范围已重定义） | L | 已签核（2026-10-27） |
| v0.8 | Phase 4A：真实项目试点 | L | 未开始 |
| v0.9 | Release Candidate | M | 未开始 |
| v1.0 | 最终交付 | — | 未开始 |

## 2. v0.4.1 视觉小额补丁

**状态（2026-10-23）**：已完成并签核（胡冀徽，`waivers=[]`）。6 项目标 finding 已修复；剩余 v0.5 的 empty/loading/mode-pills major 和既有 `取消` 危险语义 major 作为 v0.5 债务。baseline 已更新。见 [实施交接](../../handoffs/2026-10-23-v041-implementation-handoff.md)。

**目标**：清掉“明显没收尾”的视觉项，不引入新能力。

范围：

- today「查看全部」入口。
- 390px 日历只显示 3 天时增加滚动提示/edge fade。
- reschedule 静态截图上下文（实际“改期”点击流程已回填 customer/project/time/therapist；补齐截图/状态表达）。
- native `datetime-local` placeholder 文案。
- 日历选中日高亮。
- error 状态保留筛选/视图上下文。

退出标准：

- 对应截图复核通过；不出现新的 major；
- `pnpm test` 644+、typecheck、`test:dsh` 4、Phase 1 `8/2/4/8` 全 0；
- 不重建 baseline；如视觉字节变化，才更新 baseline 并记录。

**不包含**：loading skeleton/empty overlay/mode pills 的结构改造；这些放 v0.5。

## 3. v0.5 视觉 + a11y 收口

**状态（2026-10-23）**：已完成并签核（胡冀徽，`acceptedMajors=[]`，`waivers=[]`）。真实 Critic 0 major / 4 minor / 0 blocker；baseline manifest `sha256:6c900b29…c79f`。4 个 minor 留 v0.5.x。**2026-10-26 已清 v0.5.x：3 项修复、周日 tint 复核不成立；CSS 变更使旧 baseline 过期，下一次视觉门禁需重新生成并签核。** 见 [v0.5 交接](../../handoffs/2026-10-23-v05-visual-a11y-closure-handoff.md) 与 [v0.5.x 清理交接](../../handoffs/2026-10-26-v05x-v06x-debt-cleanup.md)。

**目标**：把 Visual Critic 的剩余 major 和基础可访问性收口，作为 Phase 3 的视觉基线。

范围：

- appointment-list loading：完整 12 行 calendar/list skeleton，保留筛选与图例。
- appointment-list empty：网格/图例/清空筛选的稳定呈现，不做 floating overlay。
- form mode pills：new/reschedule 与入口模式一致；固定/可切换规则明确。
- a11y 基线：对比度、焦点可见、键盘操作、表单 label/错误提示；不做完整 axe/AA 全量（Phase 3 沙箱）。
- Visual Critic 收敛策略：fresh critique 仍采样；明确“0 blocker + ≤2 major + 人工签核”的停止规则，signed cache 只保证同输入复现。
- 可选：error/disabled 状态的统一视觉语言。

退出标准：

- fresh Visual Critic：0 blocker，≤2 major，且 major 有明确接受理由；
- 关键页面键盘/焦点/对比度检查通过；
- baseline 更新并人工签核；
- 全量回归绿。

## 4. v0.6 Phase 3A：Figma + Studio + Asset Compiler

**状态（2026-10-26）**：Figma 门禁结构证据已完成：8/8 scratch + 8/8 delivery 在 Figma 桌面版构建，`figma:verify` 全部 0 blocker / 0 major / 0 findings，16 份 readback `errors: []`；证据在 `pipeline/artifacts/employee-app-phase2/figma/`（含 `README.md` 与人工 checklist）。697 tests / typecheck clean；`pnpm studio:smoke` 为 Studio 的无头门禁。**仍差人工并排视觉检查与胡冀徽签核**，因此 v0.6 未签。Figma state frames、完整组件库、Material Symbols 矢量集、readback 编排仍留 v0.6.x。见 [v0.6 门禁证据交接](../../handoffs/2026-10-26-v06-figma-gate-evidence.md)。

**目标**：把 Page Spec 变成可交付的 Figma 源文件和可用工作台。

范围：

- Figma Renderer：原生图层、Auto Layout、Variables、Text Styles、Component Instance。
- Figma 结构回读 + diff（frame 数量、嵌套、文本样式、变量、实例、图标矢量）。
- Studio：页面选择、catalog/profile 查看、渲染入口。
- Asset Compiler：manifest → 切图包/资产目录；授权记录。
- 中文字体/图标家族一致性。

退出标准：

- Figma 结构 diff 0 blocker；中文字体正确；
- HTML 与 Figma 的关键页面视觉一致；
- Studio 可完成一次 8 页构建；
- 资产包与 LICENSES 完整。

## 5. v0.7：视觉门禁 + 结构优化 + 分块实验（原 Phase 3B 范围已重定义）

**状态（2026-10-27）**：**已签核**。设计输入见 [v0.7 输入：视觉门禁、结构优化与分块生成](../specs/2026-10-26-v07-visual-gates-structure-block-input.md)；实施记录见 [v0.7 实施交接](../../handoffs/2026-10-26-v07-implementation-handoff.md)。Figma delivery 8/8 verify passed；conformance 0/0；parity 8/8（校准阈值）；Visual Critic 0/0/3 minor；`visual:sign` + `figma:sign` 已签；`handoff:pack` 生成 114 files + zip。

**原 Phase 3B 范围（scratch 沙箱、Test Subagent、Handoff Packager）已被 2026-10-26 设计输入重定义/推迟**：

- 视觉保真门禁（A1–A4）与结构优化（B1–B3）→ 本版实现；确定性校验器承担原 Test Subagent 的自动部分，模型型子代理仍推迟。
- 分块生成（C）→ 本版只做实验（结论 rollback），推广推迟到 v0.8。
- Handoff Packager（`handoff:pack`）→ 已完成一次完整打包（114 files，zip sha256 `61b216bd…96eda1`）；缺失的 Figma state frames / delivery readback 目录作为 known gap 记录。

本版实际范围：

- fail-closed 映射 + `plan-coverage.json`；
- `figma:conformance`（plan ↔ 渲染 HTML）；
- `render:measure` + `structure:check --project` + `structure:diff`；
- `figma:parity` CLI + `figma:serve` / `figma:sign`；
- 分块：`block:verify` / `block:experiment`（真实试跑结论 rollback ¥0.3302，运行于 conformance 修复前，需 v0.8 重评）；
- `handoff:pack`（fail-closed；完整包未验证）；
- `v07:smoke`（顺序执行可无头门禁；parity 缺失时 `complete: false`，不冒充完整通过）。

已完成：`figma:conformance` 在 8 页 **0 blocker / 0 major**（233 checked，fresh HTML）；`render:measure` 8 页；`structure:check --project` 0 warning；缺陷注入（按钮高度、行分隔线、未知组件）均能变红；测试 **983 passed / 87 files**，`test:dsh` 4 passed，typecheck clean。终审修复（2026-10-26）已落地：签名/打包重算 diff 与 parity 哈希、块高门禁改读 `contentHeight`、handoff 绑定 HTML/spec 哈希并强制 render metrics、block 推广要求 Phase 1/token drift/parity、structure diff 覆盖文案与无 id 节点。

未完成（阻塞签核）：v0.6 人工签核 + baseline 重生成（Gate 0）；用修正后的 plan 重建 Figma 8 页并重跑 `figma:verify`（当前 3/8 对旧 readback 为红）；真实 `figma:parity`（文本注入未执行）；`figma:sign`；完整 `handoff:pack`（当前 23 blockers）。

退出标准（本版实际）：

- 可自动化门禁全绿并落盘（已满足）；
- 缺陷注入能变红（conformance 两例 + `UNMAPPED_COMPONENT` 已满足；parity 文本注入待 Figma PNG）；
- Figma 重建 + verify + parity + 签核，以及一次完整 8 页 `handoff:pack`（未满足，待 Gate 0）。

## 6. v0.8 Phase 4A：真实项目试点

**目标**：用真实项目验证流水线，不再只依赖 sample。

范围：

- 选 1 个真实项目/PRD，6–8 页；跑 intake → M1 → Spec → HTML/Figma → 沙箱 → Handoff。
- 记录成本、耗时、人工介入点、findings 收敛情况。
- 修复真实项目暴露的问题；更新 prompt/gate/catalog。
- **IA placement**：给 Brief/IA 增加动作位置语义（footer / card-actions / overflow），
  解决 `customer-detail` 次级动作被放进 filter-row、看起来像筛选 chip 的问题；
  Interaction schema 目前没有 placement 维度，需要先定契约再改 `detailLayout`。

退出标准：

- 真实项目端到端通过；
- 0 未处理 blocker；major 有 owner/理由/有效期；
- 用户走查通过；
- 成本/时间在预算内。

## 7. v0.9 Release Candidate

**目标**：冻结能力，只做稳定性、可复现性和文档。

范围：

- 全量回归、同输入重跑、signed cache/baseline 稳定；
- 性能与成本记录；
- 文档、LICENSES、HANDOFF 最终校对；
- 无 waiver 或仅保留有 owner/有效期的宿主边界 waiver；
- 验收标准逐项核对。

退出标准：

- 验收标准全部满足；
- 可复现构建；
- 无新增能力。

## 8. v1.0 最终交付

**目标**：最终交付与用户签核。

范围：

- HTML + Figma + Handoff + 资产 + 评审包；
- 用户视觉终审；
- 项目验收签核。

退出标准：

- Phase 3/4 全部完成；
- 用户签核；
- 交付包完整、可独立实现。

## 9. 当前建议

1. **v0.4.1 / v0.5 已完成并签核**（v0.5：0 major / 4 minor，minor 留 v0.5.x）。
2. **v0.6/v0.7 的自动门禁已实现**：conformance 0/0、measure、structure、block、handoff packager、`v07:smoke`；但 **v0.6 人工签核与 v0.5 baseline 重签（Gate 0）仍未完成，v0.7 未签核**。
3. **下一步先做 Gate 0**：人工并排检查 + 用当前 CSS 重新生成并签核 baseline；然后重建 8 页 Figma、跑 `figma:verify` + `figma:parity` + `figma:sign`，最后用完整 spec run 打包 `handoff:pack`。
4. **v0.8** 真实项目试点通过后，才进入 v0.9/v1.0。

每进入一个版本，单独写 spec → plan → 执行 → 验收；不要把多个版本合并成一个大 spec。
