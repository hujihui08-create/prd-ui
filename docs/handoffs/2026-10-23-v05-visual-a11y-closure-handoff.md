# v0.5 视觉 + a11y 收口交接

- 日期：2026-10-23
- 状态：Signed（胡冀徽；`acceptedMajors=[]`，`waivers=[]`）
- 设计：[v0.5 设计](../superpowers/specs/2026-10-23-v05-visual-a11y-closure-design.md)
- 计划：[v0.5 实施计划](../superpowers/plans/2026-10-23-v05-visual-a11y-closure.md)
- 上一版：[v0.4.1 交接](2026-10-23-v041-implementation-handoff.md)

## 1. 一句话状态

v0.5 的 loading、empty、mode、a11y、critic stop-rule 和视觉债收口已完成并签核。真实 Critic 为 **0 major / 4 minor / 0 blocker**；baseline 已更新并签核。可以进入 v0.6（Figma + Studio + Asset Compiler）。

## 2. 关键数字

| 项 | 值 |
|---|---|
| `pnpm test` | **672 passed** |
| `pnpm typecheck` | clean |
| `pnpm test:dsh` | 4 passed |
| Phase 1 | `8 / 2 / 4 / 8` pages，全 0 blockers |
| Spec Engineer | `run-2026-10-23T06-07-48-403Z`，8 Page Specs / 0 blockers / 0 unresolved |
| Renderer | 8 HTML + index |
| Baseline | 24 cases，manifest `sha256:6c900b29…c79f` |
| 最终 Critic | `run-2026-10-23T06-10-08-791Z`，24/24、diff 24/0/0、0 major / 4 minor / 0 blocker |
| Signoff | 胡冀徽，2026-10-23，`acceptedMajors=[]`，`waivers=[]` |
| 成本 | 2 次有效 Critic + 1 次 infra 失败，≈¥1.4048 |

## 3. 已实现

- Loading：mobile-list/detail in-place skeleton；calendar 保留 7 列/12 行、day/time labels、筛选/切换/标题/图例/footer；list 12 行 skeleton；detail summary value shimmer，loading 隐藏状态/action/footer。
- Empty：inline band，保留网格/图例/清空筛选；无 fixed overlay。
- Mode：删除 mode pills；标题「新增预约/改期预约」；reschedule 上下文条/prefill/客户锁定；无 record 禁用保存。
- a11y：text/status token AA；`:focus-visible`；search focus ring；row/block 键盘；drawer Escape + focus 返回；`required`/`aria-required`。
- 视觉债：取消 danger 右置；footer CTA 44px；gutter 16px；search placeholder；detail value 对齐；calendar 16:30 偏移并显示真实时间。
- Signoff gate：`acceptedMajors` + max 2 major；`visual:sign` 拒绝超限/缺 reason 的 major。

## 4. 剩余 minor（v0.5.x）

1. disabled 状态下 datetime 字段容器视觉丢失。
2. loading 中选中日列是静态 tint，不是 skeleton。
3. 周日列灰色 tint（既有）。
4. treatment-notice 已确认时间 `2026/10/22 09:00:00` 格式不统一。

这些不阻塞 v0.6；如需清理，另开 v0.5.x 小补丁，不重开 v0.5。

## 5. 证据

- 最终 review/sign：`/tmp/visual-v05d/run-2026-10-23T06-10-08-791Z`
- 仓库 baseline：`pipeline/baselines/employee-app-phase2`
- artifacts：`pipeline/artifacts/employee-app-phase2/visual-review/`（v0.5 screenshots/findings/signoff/diff/cache）
- 失败尝试：`/tmp/visual-v05b/run-2026-10-23T05-54-55-351Z`（`VISUAL_CRITIC_UNAVAILABLE`，usage incomplete；未签核，成本已记录）
- 早期有效评审：`/tmp/visual-v05/run-2026-10-23T05-42-10-115Z`、`/tmp/visual-v05c/run-2026-10-23T06-00-28-764Z`

## 6. 坑与约束

- 不要改回 3 天滚动日历；7 列已由两版 Critic + 人工接受。
- baseline 只由人运行 `visual:baseline` 并签核；`visual:review` 不写 baseline。
- v0.5 签核要求 0 blocker、≤2 major、每个 major 有 accepted reason；v0.4.1 旧签核不回溯。
- fresh Critic 采样有波动；本次 1 次 infra 失败后只重试 1 次，不反复重跑找干净结果。
- `pipeline/artifacts/employee-app-phase2/README.md` 已更新为 v0.5。
- 本地 commit 尚未执行；按仓库规则不 push。
- 工作树还有未跟踪 `.zcode/`、`docs/research/`；不要误提交。

## 7. 下一步

v0.6 Phase 3A：Figma Renderer（原生图层/Auto Layout/Variables/Text Styles/Component Instance）、结构回读 + diff、Studio、Asset Compiler、中文字体/图标一致性。进入前先读主设计 §10、v0.5 spec §13、本交接。
