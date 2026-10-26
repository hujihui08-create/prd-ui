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
| v0.7 | Phase 3B：沙箱 + Test Subagent + Handoff | L | 未开始 |
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

**状态（2026-10-23）**：已完成并签核（胡冀徽，`acceptedMajors=[]`，`waivers=[]`）。真实 Critic 0 major / 4 minor / 0 blocker；baseline manifest `sha256:6c900b29…c79f`。4 个 minor 留 v0.5.x。见 [v0.5 交接](../../handoffs/2026-10-23-v05-visual-a11y-closure-handoff.md)。

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

**状态（2026-10-25）**：自动化部分已实现（Figma plan/plugin/readback diff、Asset Compiler、只读 Studio；688 tests）。真实 Figma scratch/delivery/readback 未执行，Brio MCP 未连接，**未签核**。见 [v0.6 进度交接](../../handoffs/2026-10-25-v06-phase3a-progress-handoff.md)。

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

## 5. v0.7 Phase 3B：沙箱 + Test Subagent + Handoff

**目标**：把验证和交付自动化，形成可独立实现的 Handoff。

范围：

- scratch 沙箱：HTML/Figma/Asset/Spec 四类验证。
- Test Subagent：Render & Layout、A11y & Interaction、Figma Verifier、Visual Critic；Contract/Asset Tester 保持确定性校验器。
- 失败处理：infra 失败不判 pass；flaky 指标与重跑。
- Handoff Packager：`HANDOFF.md`、`LICENSES.md`、切图包、规格包、评审包。
- 交付包可让开发独立实现。

退出标准：

- 沙箱测试通过；infra 失败被显式标记；
- Handoff 包完整、可离线阅读；
- 一次完整 8 页构建 + 验证 + 打包通过。

## 6. v0.8 Phase 4A：真实项目试点

**目标**：用真实项目验证流水线，不再只依赖 sample。

范围：

- 选 1 个真实项目/PRD，6–8 页；跑 intake → M1 → Spec → HTML/Figma → 沙箱 → Handoff。
- 记录成本、耗时、人工介入点、findings 收敛情况。
- 修复真实项目暴露的问题；更新 prompt/gate/catalog。

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

1. **v0.4.1 已完成并签核**（视觉补丁）。
2. **v0.5 已完成并签核**（结构视觉 + a11y + critic 停止规则；0 major / 4 minor，minor 留 v0.5.x）。
3. 下一步进入 **v0.6/v0.7**：Figma/Studio/Asset Compiler，再 sandbox/Test Subagent/Handoff。
4. **v0.8** 真实项目试点通过后，才进入 v0.9/v1.0。

每进入一个版本，单独写 spec → plan → 执行 → 验收；不要把多个版本合并成一个大 spec。
