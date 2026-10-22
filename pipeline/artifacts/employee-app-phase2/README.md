# 员工端 · Phase 2 8 页 clean 出口（v0.4 已签核；v0.5 视觉债）

从 `samples/projects/employee-app-phase2/prd.md` 的真实 PRD 走完整链路：

```text
PRD → intake:run（PRD review + IA + UI Briefer + 两道签核）
    → ui-brief.json（0 waiver / 0 手工 patch）
    → agent:run（IA / Interaction / Visual Style）
    → spec:engineer --strict-motion（8 个 Page Spec，0 motion unresolved）
    → render:html（8 页 + index.html）
    → visual:baseline（24 张确定性截图）
    → visual:review --runtime dsh（确定性 gate + pixel diff + Visual Critic）
    → visual:sign（按 stopping rule 签核；critic verdict 仍为 changes，残留 major 记为 v0.5 债）
```

## 目录

```text
html/                       8 页渲染结果 + index.html（v0.4 修复后）
screenshots/                19 张 v0.3.1 人工 Playwright 截图（历史）
visual-review/              本轮最终证据（passed，已签核）
  visual-review.json        review 结果：status=passed，9 findings，signoff valid，critic cacheHit=true
  state.json                run 状态：success，signoff.visual=true
  screenshots/              24 张 390×844 矩阵截图 + manifest.json
  findings/visual-gate.json 确定性 gate + 全部 findings（0 blocker）
  findings/visual-critic.json Visual Critic 原始 critique、usage、cost
  signoff/visual.md         人工签核（manifestHash + findingsHash，waivers=[]）
  critique-cache.json       最终 signed critique cache entry（key/manifest/spec/model/signoff）
  baseline-manifest.json    与 pipeline/baselines/employee-app-phase2 一致
run-summary/                intake / M1 / agent:sign / Spec / Visual Review / Phase 1 摘要
signoffs/                   PRD/IA、brief、visual-style 签核（历史）
gates/                      ia / interaction / visual-style gate 结果
m1-final-ia-blocked/        早前 blocked M1 IA 的证据（保留）
asset-review/               2026-10-22 clean M1 资产 brief 的 M0 评审（4/4 passed）
```

## 本轮数字

| 阶段 | Run | 结果 |
|---|---|---|
| intake | `run-2026-10-22T03-09-28-544Z` | success；8 页全 `b-mobile`；0 waivers、0 手工 brief edits；brief hash `sha256:b558b57a…b8335`；¥0.8977902624 |
| M1 | `run-2026-10-22T03-16-05-257Z` | success；`ia:passed / interaction:passed / visualStyle:passed`；0 waivers；¥0.4399832736 |
| Spec Engineer | `run-2026-10-22T12-10-44-917Z` | 8 Page Specs、8 motion pages、0 blockers、2 unused-asset warnings、**0 `SPEC_MOTION_NODE_UNRESOLVED`** |
| HTML / Phase 1 | `run-2026-10-22T13-59-42-062Z` | 8 页 + index；`8 pages / 0 blockers` |
| Visual baseline | `pipeline/baselines/employee-app-phase2` | 24 cases / 24 PNG（PNG 与上一版一致）；visual manifest `sha256:3321dd61e7acc59cd5670d5dbc44eb3c479c6085e4f3e90d4428c07d322ca5c6` |
| Visual review（最终，cache hit） | `run-2026-10-22T13-55-24-469Z` | `status=passed`；24/24 截图；diff 24/0/0；0 console / 0 overflow；9 findings（6 major / 3 minor / **0 blocker**）；`usageComplete=true`；¥0（signed-cache，0 次模型调用） |
| Signoff | — | `Sample Reviewer`，2026-10-22，`waivers=[]`；visual manifest `sha256:3321dd61…25c6`；findings `sha256:70a435f3…4455`；`signoff.valid=true`，`state.json.status=success` |
| Critique cache | `.visual-cache/critiques/93ae567d….json` | key `sha256:93ae567d…62f`（manifest visual hash + spec hash + dsh/prd-ui-visual/deepseek-flash）；cache hit，模型调用 0 |

### 成本

- 首轮 Task 9 critic：¥1.6415096768。
- concrete-major 轮：¥1.4273972928（含两次 fail-closed）。
- final focused 轮：¥0.3260564064。
- cache/final round: model calls ¥1.8082032192（含 1 次 max-tokens fail-closed），最终 cached review ¥0。
- 累计 critic 成本 **¥5.2031665952**，单次仍低于 ¥3 cap；失败调用计入成本。

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

## 截图覆盖

### v0.4 视觉矩阵（24 张，`visual-review/screenshots/`）

- `today.default`、`today.state.empty`
- `customer-search.default`、`.search.results`、`.search.empty`
- `customer-detail.default`
- `appointment-detail.default`、`.state.loading`、`.state.error`、`.business.已到店`、`.business.爽约`、`.business.已取消`
- `appointment-form.default`、`.state.disabled`、`.mode.reschedule`
- `treatment-notice.default`、`.business.已确认`
- `appointment-list.default`、`.state.loading`、`.state.error`、`.state.empty`、`.view.list`、`.drawer`
- `callback-register.default`

### v0.3.1 人工截图（19 张，`screenshots/`）

保留为历史；当前验收以 `visual-review/screenshots/` 为准。

## 本轮修复（critic concrete majors）

- **调试 route 字符串**：`referenceId` 只来自真实 `appointmentId`/`orderNo`；
  无真实 id 时 reschedule 不再渲染 `预约 appointment-form` chip。
- **disabled 状态**：`body[data-state="disabled"]` 下输入/选择/CTA/模式切换
  禁用并弱化，显示圆角只读 banner；选择客户按钮同样禁用。
- **重复 check-in**：移除详情页次级 `接单并确认到店`，只保留底部
  `已到店确认`；已到店状态只保留 `开单`。
- **术后告知时序**：`serviceCompleted=否` 时不渲染 `术后告知`；
  `serviceCompleted=是` 时保留（compiler 单测覆盖）。
- **搜索页**：移除页面级 `查看详情`；结果行整行可点并显示 chevron。
- **预约列表**：移除页面级 `查看完整详情`；保留行点击和抽屉内
  `查看完整详情`。
- **列表行降噪**：客户 + 状态 badge、项目 · 护理师、右侧时间段；
  删除门店/委派留痕；列表按 `11-05 周三` 分组。
- **只读 action 行**：详情次级动作改为有边框的 coherent action row。
- **告知分块**：移除可见 `告知分块`，保留 `告知内容`。
- **状态色**：今日、列表、详情统一 `已登记` warning / `已到店` success /
  `爽约·已取消` danger。
- **业务状态**：已取消/爽约渲染对应 badge、只读 note，只保留客户详情；
  已确认告知显示确认人/时间并隐藏确认 CTA。
- **VC-009 skeleton**：未实现 calendar-shaped skeleton，列为 v0.5 polish。

Playwright 复核见 `run-summary/playwright-checks-v04.json`：picker 选择/取消/
reload、完整日期预填、搜索行 chevron、列表日期分组、disabled、状态动作栏。

## 最终 critic findings（9，0 blocker；已按 stopping rule 签核）

Critic verdict 仍为 `changes`，但确定性 gate 全绿且无 blocker；按用户指定的
stopping rule 签核，并把残留 major 记为 v0.5 债。未声称 critic verdict 为 pass。

Major（6，v0.5 债）：

1. `today` 缺「我的预约」的「查看全部」入口（需要 brief/导航补充）。
2. `appointment-list` default：390px 下七日历只显示 3 天，无滚动提示/边缘 fade。
3. `appointment-list` loading：skeleton 仍是薄条网格，未完全匹配 12 行时间轴/页脚。
4. `appointment-list` empty：空态是悬浮卡片覆盖网格；grid/legend 保留但覆盖式呈现。
5. `appointment-form` default：新增/改期 mode pills 仍可见；reschedule 进入时已隐藏
   新增 pill 并锁定改期，但 critic 建议彻底移除切换控件。
6. `appointment-form` reschedule 的 **矩阵截图** 没有记录上下文（form 只在点击
   详情「改期」后恢复；静态 `?mode=reschedule` 截图无记录）。实际 Playwright
   流程已恢复 customer/project/start/end/therapist 并锁定 customer。

Minor（3）：datetime 原生 `mm/dd/yyyy` 占位、当前/选中日期列无高亮、
`appointment-list.state.error` 丢失筛选/视图上下文。

本轮修复的 concrete majors：reschedule prefill、mode pill 锁定、日历/日期/filter
一致性（2025-11-03 周、`日期 11-05 周三`、active date label）、loading calendar
skeleton、empty grid + legend + 清空筛选。另修复 disabled save 对比，并把截图
manifest 改成 visual hash（32px block / 4 levels），baseline PNG 未变（pixel diff 0）。

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

## 已知限制 / 后续

- 最终 review 已按 stopping rule 签核（`visual-review.json.status=passed`）；
  critic verdict 仍为 `changes`，6 major 记录为 v0.5 债：today 查看全部、
  三日历滚动提示、loading skeleton 完整度、empty 覆盖式呈现、mode pills、
  reschedule 静态截图上下文。
- 今日缺「查看全部」、空态样式不统一、disabled save 对比、native datetime
  占位、已到店 `开单` 主次样式为 minor。
- 真实 critic 有采样波动：本轮曾出现 console-error、max-tokens 两次失败；
  已记录成本，不伪造 pass。
- M1 `interaction-spec.json` 的 `cd.new-appointment` 仍写“预填并锁定客户”，
  与已签核 brief 不一致；`icon-home` / `icon-user` 仍为 unused asset。
- Studio/Asset Compiler、Figma Renderer、完整 a11y、真实项目 Phase 4 验收
  仍后置。
