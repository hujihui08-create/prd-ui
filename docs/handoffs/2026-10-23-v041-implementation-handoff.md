# v0.4.1 实施交接

- 日期：2026-10-23
- 状态：Signed（2026-10-23；胡冀徽，`waivers=[]`）
- 设计：[v0.4.1 视觉小额补丁设计](../superpowers/specs/2026-10-23-v041-visual-patch-design.md)
- 计划：[v0.4.1 实施计划](../superpowers/plans/2026-10-23-v041-visual-patch.md)
- 上一版：[v0.4 交接](2026-10-23-v04-acceptance-handoff.md)

## 1. 一句话状态

v0.4.1 的 6 项视觉补丁已实现、通过机械门禁并完成人工签核。真实 Visual Critic 已不再报告这 6 项；剩余 v0.5 的 empty/loading/mode-pills major，以及一个既有 `appointment-detail`「取消」危险语义 major，作为后续债务记录。baseline 已更新并签核。

## 2. 关键数字

| 项 | 值 |
|---|---|
| `pnpm test` | **652 passed** |
| `pnpm typecheck` | clean |
| `pnpm test:dsh` | 4 passed |
| Phase 1 | `8 / 2 / 4 / 8` pages，全 0 blockers |
| Spec Engineer | 8 Page Specs / 0 blockers / 0 motion unresolved |
| Renderer | 8 HTML + index |
| Visual baseline（临时） | 24 cases；`/tmp/v041-baseline` |
| 最终 Critic run | `run-2026-10-23T03-01-28-979Z`；24/24、diff 24/0/0、0 blocker；签核后 `status=success` |
| 最终 Critic 成本 | ¥0.3970，`usageComplete=true` |
| 签核 | 胡冀徽，2026-10-23，`waivers=[]`；manifest `sha256:341458e6…c4f4`；findings `sha256:0b7829da…c0b06` |
| 6 轮 Critic 累计 | ≈¥2.29（前 5 轮用于 calendar/disabled/action-hierarchy 修复） |
| Spec run | `/tmp/spec-v041/run-2026-10-23T02-51-25-415Z` |

## 3. 已实现

- today「查看全部」链接（`linkedRoutes.list` + Card action + catalog 契约）。
- 390px 紧凑 7 日周历：短日期、选中日高亮、11px 时间/日期、12px 事件标题、10px 项目/开始时间 cue。
- 列表 error 内联面板：保留筛选/日期/切换/日历标题与图例；无游离「列表」标签。
- `datetime-local` 中文静止态显示；禁用态统一底色、隐藏原生日历图标。
- reschedule 静态截图：`VisualCase.storage` 注入详情摘要，字段 prefill + 「正在改期」上下文条。
- business state 下 footer 仅一个可见动作时提升为 primary（已到店「开单」）。

## 4. 与批准 spec 的偏差

真实 Critic 连续拒绝“3 天 + 滚动提示/渐隐”方案，最终采用其第一推荐方案：**390px 同屏 7 列紧凑周历**，取代 spec §5.2 的 3 天滚动，也推翻了 §2.2“压缩列宽留 v0.5”的非目标。偏差和理由见 spec §13.2。若产品不接受 7 列密度，需要回到 3 天 + 固定周条/日缩放方案，并重新走视觉评审。

## 5. Critic 结果

最终 run 的 6 项 v0.4.1 finding 全部消失。剩余 major：

- `appointment-list.state.empty`：floating overlay（v0.5 VC-004）。
- `appointment-list.state.loading`：骨架不保留结构（v0.5 VC-003）。
- `appointment-form`：mode pills 与主 CTA 同权重（v0.5 VC-005）。
- `appointment-detail.default`：`取消` 无危险语义（既有问题，本轮新暴露；不在 v0.4.1 范围）。

Minors 包括 customer-search 占位重复、detail 摘要标题、状态说明游离、footer CTA 高度不一致等，均未在 v0.4.1 处理。

## 6. 签核记录（已完成）

- 复核截图：`/tmp/v041-baseline/`（最终 24 张；仓库内已同步到 `pipeline/baselines/employee-app-phase2`）。
- baseline 已由 `visual:baseline` 更新；manifest `sha256:341458e6…c4f4`。
- 签核已执行：`visual:sign --run /tmp/visual-v041g/run-2026-10-23T03-01-28-979Z`，`status=success`，signer `胡冀徽`，`waivers=[]`。
- artifacts 证据已复制到 `pipeline/artifacts/employee-app-phase2/visual-review/`，README 已更新。
- `CHANGELOG.md`、版本路线、`AGENTS.md` 已更新为 signed。
- 尚未 commit；按仓库规则本地 commit、不 push。

复现签核（需要重签时）：

```bash
cd pipeline
pnpm visual:baseline --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v041/run-2026-10-23T02-51-25-415Z --html /tmp/html-v041 \
  --out baselines/employee-app-phase2

pnpm visual:sign --run /tmp/visual-v041g/run-2026-10-23T03-01-28-979Z \
  --signoff-visual /tmp/signoff-v041.md
```

签核 hash：

- `manifestHash`: `sha256:341458e621be6911b0f5a21cf0442582f38239a54e56b1b2f210ec714c4fcb4a`
- `findingsHash`: `sha256:0b7829da3b490a75ab9c5a9766b4cdce9f760b511dd96f03d0448e95954c0b06`


## 7. 坑与约束

- **不要编辑已签核 brief**：`samples/projects/employee-app-phase2/ui-brief.json`。
- **baseline 只由人更新**；`visual:review` 不写 baseline。
- **Critic 采样有波动**；本轮已经出现既有问题被新暴露（`取消` 危险语义）。不要无限重跑找“干净结果”；按 stopping rule 记录剩余 major。
- **7 列是项目级视觉决策**，不是通用结论；其他项目需重新评估。
- `.visual-cache/`、`runs/`、`.env` 不提交。
- 工作树有未跟踪的 `.zcode/`、`docs/research/` 和本次新增 spec/plan；不要误提交无关内容。

## 8. 推荐阅读顺序

1. 本交接。
2. spec §13（实施结果与偏差）。
3. 最终 Critic run `visual-review.json` / `findings/visual-critic.json`。
4. `core/renderer-html/src/index.ts` 的 CalendarGrid / applyCalendarScroll / applyFormModes。
5. v0.5 设计任务：loading/empty/mode-pills/a11y。
