# 员工端 · Phase 2 8 页出口（v0.5 已签核；v0.6 Figma 证据完成，待人工签核）

从 `samples/projects/employee-app-phase2/prd.md` 的真实 PRD 走完整链路：

```text
PRD → intake:run（PRD review + IA + UI Briefer + 两道签核）
    → ui-brief.json（0 waiver / 0 手工 patch）
    → agent:run（IA / Interaction / Visual Style）
    → spec:engineer --strict-motion（8 个 Page Spec，0 motion unresolved）
    → render:html（8 页 + index.html）
    → visual:baseline（24 张确定性截图）
    → visual:review --runtime dsh（确定性 gate + pixel diff + Visual Critic）
    → visual:sign（v0.5 signed；0 blocker / 0 major / 4 minor）
```

## 目录

```text
html/                       8 页渲染结果 + index.html（v0.5 收口后）
screenshots/                19 张 v0.3.1 人工 Playwright 截图（历史）
visual-review/              v0.5 最终证据（passed，已签核）
  visual-review.json        review 结果：status=passed，4 minor / 0 major / 0 blocker
  visual-sign.json          sign 结果：status=success，signer=胡冀徽，acceptedMajors=[]
  state.json                run 状态：success，signoff.visual=true
  screenshots/              24 张 390×844 矩阵截图 + manifest.json
  findings/visual-gate.json 确定性 gate + 全部 findings
  findings/visual-critic.json Visual Critic 原始 critique、usage、cost
  signoff/visual.md         人工签核（manifestHash + findingsHash，waivers=[]）
  critique-cache.json       signed critique cache entry
  baseline-manifest.json    与 pipeline/baselines/employee-app-phase2 一致
  diff/                     24 张与旧 baseline 的像素 diff 证据
run-summary/                intake / M1 / agent:sign / Spec / Visual Review / Phase 1 摘要
signoffs/                   PRD/IA、brief、visual-style 签核（历史）
gates/                      ia / interaction / visual-style gate 结果
m1-final-ia-blocked/        早前 blocked M1 IA 的证据（保留）
asset-review/               2026-10-22 clean M1 资产 brief 的 M0 评审（4/4 passed）
figma/                      v0.6 Figma 门禁证据（见 figma/README.md）
  spec-source/              从已签核 brief 编译的 8 份 PageSpec（plan 输入）
  plans/                    8 份 figma plan + index
  readback/                 8 份 scratch readback（delivery/ 下为 8 份 delivery readback）
  diff/                     16 份结构 diff（scratch + delivery，全部 0/0/0）
  screenshots/              16 张画布截图（figma.* 为 scratch，delivery.* 为交付页）
```

## v0.6 Figma 门禁（2026-10-26）

| 项 | 结果 |
|---|---|
| Scratch | 8/8 页在 Figma 桌面版构建；`figma:verify` 8/8 `passed`（0 blocker / 0 major / 0 findings） |
| Delivery | 新空白文件 8/8 页；diff 8/8 `passed`；readback 全部 `errors: []` |
| Figma 文件 | scratch `iL99qSPGhmh08BB9LketgF`；delivery `ne1JYKpfjDivRr0nK5jm4S` |
| 人工检查 | **待胡冀徽执行**；checklist 在 `figma/README.md` |

门禁暴露的 6 个真实 bug（dynamic-page `mainComponent`、INSTANCE 子节点、变量 fill 的 opacity、
`summary`/`fields` 槽位被丢弃、搜索行、view-panel padding）已在 `core/figma` 与
`runtimes/figma` 修复，`pnpm test` 697 passed。

## v0.5 数字

| 阶段 | Run | 结果 |
|---|---|---|
| Spec Engineer | `run-2026-10-23T06-07-48-403Z` | 8 Page Specs、8 motion pages、0 blockers、2 unused-asset warnings、**0 `SPEC_MOTION_NODE_UNRESOLVED`** |
| HTML / Phase 1 | 同上；`/tmp/html-v05` | 8 页 + index；`8 pages / 0 blockers` |
| Visual baseline | `pipeline/baselines/employee-app-phase2` | 24 cases / 24 PNG；manifest `sha256:6c900b29…c79f` |
| Visual review | `run-2026-10-23T06-10-08-791Z` | `status=passed`；24/24；diff 24/0/0；0 console/overflow；**0 major / 4 minor / 0 blocker**；`usageComplete=true`；¥0.4105417824 |
| Signoff | — | `胡冀徽`，2026-10-23，`acceptedMajors=[]`，`waivers=[]`；manifest `sha256:6c900b29…c79f`；findings `sha256:57c9a5b4…b623`；`state.json.status=success` |
| Tests | — | **672 passed**；typecheck clean；`test:dsh` 4 passed |
| A11y | — | 关键页面 WCAG AA 对比度、focus-visible、键盘 row/block/drawer、label/aria-required 通过 |

### 成本

- v0.5 共 2 次有效 Critic + 1 次 infra 失败（`VISUAL_CRITIC_UNAVAILABLE`）：¥0.5289561792 + ¥0.46525536 + ¥0.4105417824 ≈ **¥1.4048**。
- 每次均低于 ¥3 cap；infra 失败未伪造 pass。

## 页面

- `today.html`（今日）
- `customer-search.html`（客户搜索）
- `customer-detail.html`（客户详情）
- `appointment-detail.html`（预约详情）
- `appointment-form.html`（新增/改期）
- `treatment-notice.html`（术后告知）
- `appointment-list.html`（预约列表，日历/列表切换）
- `callback-register.html`（回访登记）
- `index.html`（入口）

## 截图覆盖（24 张，`visual-review/screenshots/`）

- `today.default`、`today.state.empty`
- `customer-search.default`、`.search.results`、`.search.empty`
- `customer-detail.default`
- `appointment-detail.default`、`.state.loading`、`.state.error`、`.business.已到店`、`.business.爽约`、`.business.已取消`
- `appointment-form.default`、`.state.disabled`、`.mode.reschedule`
- `treatment-notice.default`、`.business.已确认`
- `appointment-list.default`、`.state.loading`、`.state.error`、`.state.empty`、`.view.list`、`.drawer`
- `callback-register.default`

## v0.5 收口内容

- **Loading**：mobile-list/detail 改为 in-place skeleton；calendar 保留 7 列/12 行 grid、day header、time rail、筛选、切换、标题、图例和 footer；list 12 行 skeleton；detail summary 行 value shimmer，隐藏 loading 中的状态/动作/footer。
- **Empty**：inline empty band，保留网格/图例/清空筛选；无 fixed overlay；空态与日历面板有间距。
- **Mode**：删除 mode pills；入口决定模式，标题「新增预约/改期预约」+「正在改期」条 + CTA；无 record 的 reschedule 禁用保存。
- **a11y**：提高 text/status token 对比度；`:focus-visible`；row/block 键盘 Enter/Space；drawer Escape + focus 返回；search focus ring；input `required`/`aria-required`。
- **视觉债**：取消 danger（右侧独立、红描边）；footer CTA 44px；页面 gutter 16px；search placeholder；detail 摘要 value 列对齐；calendar 16:30 按 30 分钟偏移定位并显示真实时间。

## 剩余 minor（v0.5.x）

1. disabled 状态下 datetime 字段容器视觉丢失。
2. loading 中选中日列不是 skeleton（静态 tint）。
3. 周日列灰色 tint（既有）。
4. `treatment-notice` 已确认时间 `2026/10/22 09:00:00` 格式不统一。

这些不阻塞 v0.5 签核；作为 v0.5.x 视觉债记录。

## 重新生成

```bash
cd pipeline
pnpm phase1:verify --project samples/projects/employee-app-phase2/project.yaml --runs <runs-dir>
pnpm agent:run --project samples/projects/employee-app-phase2/project.yaml \
  --runtime dsh --profile prd-ui-intake --runs <m1-runs-dir>
pnpm spec:engineer --project samples/projects/employee-app-phase2/project.yaml \
  --agent-run <m1-run-dir> --runs <spec-runs-dir> --strict-motion
pnpm render:html --run <spec-run-dir> --out <html-out-dir>
pnpm visual:baseline --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run <spec-run-dir> --html <html-out-dir> \
  --out baselines/employee-app-phase2
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm visual:review \
  --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run <spec-run-dir> --html <html-out-dir> \
  --baseline baselines/employee-app-phase2 \
  --runtime dsh --profile prd-ui-visual \
  --runs <visual-runs-dir> --max-cost-cny 3 --json
pnpm visual:sign --run <visual-runs-dir>/<runId> \
  --signoff-visual <signoff.md>
```

真实 dsh 需要先 `set -a; . ./.env; set +a` 并设置 `DSH_HOME="$PWD/dsh/home"`。
`prd-ui-visual` 使用 65536 maxTokens；critic 超时默认 900000ms。

## v0.6 Phase 3A 证据（Figma gate pending）

- `figma/plans/`：8 页 `figma-plan.*.json` + index（`figma:plan` 生成）。
- `asset-compiler/m0/`：M0 library 13 assets + manifest/LICENSES。
- `asset-compiler/phase2/`：phase2 4 frozen icons + manifest/LICENSES。
- `studio-v06.png`：只读 Studio 8 页 smoke（Chromium，0 console）。
- 未包含真实 Figma readback/diff/delivery：Brio MCP 未连接，Figma 人工门禁待执行；v0.6 未签核。

