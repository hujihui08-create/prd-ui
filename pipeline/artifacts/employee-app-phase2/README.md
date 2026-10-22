# 员工端 · Phase 2 8 页 clean 出口（v0.4 视觉修复，待决策）

从 `samples/projects/employee-app-phase2/prd.md` 的真实 PRD 走完整链路：

```text
PRD → intake:run（PRD review + IA + UI Briefer + 两道签核）
    → ui-brief.json（0 waiver / 0 手工 patch）
    → agent:run（IA / Interaction / Visual Style）
    → spec:engineer --strict-motion（8 个 Page Spec，0 motion unresolved）
    → render:html（8 页 + index.html）
    → visual:baseline（24 张确定性截图）
    → visual:review --runtime dsh（确定性 gate + pixel diff + Visual Critic）
    → visual:sign（本轮未签核：critic 仍为 changes）
```

## 目录

```text
html/                       8 页渲染结果 + index.html（v0.4 修复后）
screenshots/                19 张 v0.3.1 人工 Playwright 截图（历史）
visual-review/              本轮最终证据（awaiting_signoff，未签核）
  visual-review.json        review 结果：status=awaiting_signoff，10 findings
  state.json                run 状态：awaiting_signoff，signoff.visual=false
  screenshots/              24 张 390×844 矩阵截图 + manifest.json
  findings/visual-gate.json 确定性 gate + 全部 findings（0 blocker）
  findings/visual-critic.json Visual Critic 原始 critique、usage、cost
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
| Spec Engineer | `run-2026-10-22T11-15-21-596Z` | 8 Page Specs、8 motion pages、0 blockers、2 unused-asset warnings、**0 `SPEC_MOTION_NODE_UNRESOLVED`** |
| HTML / Phase 1 | `run-2026-10-22T11-17-13-206Z` | 8 页 + index；`8 pages / 0 blockers` |
| Visual baseline | `pipeline/baselines/employee-app-phase2` | 24 cases / 24 PNG；manifest `sha256:4f43b2f39589b777366573918dd931fb3ce12854e39a4d2e4561c866a6158b0b` |
| Visual review（最终） | `run-2026-10-22T11-23-22-756Z` | `status=awaiting_signoff`；24/24 截图；diff 24/0/0；0 console / 0 overflow；10 findings（5 major / 5 minor / **0 blocker**）；`usageComplete=true`；¥0.3287296224 |
| Signoff | — | **未签核**。最终 review 仍为 `changes`，5 个新 major 需要设计决策；`signoff.visual=false` |

### 成本

- 本轮（用户要求修复 concrete majors 后）visual critic 真实调用：
  ¥0.3504589632（console-error blocked）+ ¥0.2169933408（旧 HTML critic）+
  ¥0.5312153664（max-tokens blocked）+ ¥0.3287296224（最终）=
  **¥1.4273972928**。
- 上一轮 Task 9 记录：¥1.6415096768。
- 累计 critic 成本 **¥3.0689069696**，单次仍低于 ¥3 cap；失败调用计入成本。

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

## 最终 critic findings（10，0 blocker）

Major（5，均为设计决策，未签核）：

1. `appointment-form` default：新增/改期 mode pills 是页面级交互控件，
   与 Page Spec/入口路由模式冲突；建议改为只读上下文或移除。
2. `appointment-list` default：日历周（11-02 起）、列表日期（11-05）与
   `日期 全部` 三个日期信号不一致，且无 today 高亮/当前日期标签。
3. `appointment-list` loading：仍是通用 skeleton，未保留筛选/图例/七列网格。
4. `appointment-list` empty：空态移除日历网格，图例悬空，无清空筛选 action。
5. `appointment-form` reschedule：锁定客户仍为空，项目/时间/护理师未恢复，
   与空白新增表单难以区分。

Minor（5）：今日缺「查看全部」、今日两个空态样式不一致、disabled 保存按钮
对比过低、datetime-local 原生 `mm/dd/yyyy` 占位、已到店只有 `开单` 时仍用
secondary 样式。

这些是本轮新增的主观/结构 major，未通过签核；需要产品/设计决定是否进入
v0.5。未伪造 `passed`，也未使用 waiver。

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

- 最终 review 未签核；5 个 major 需决定是否进入 v0.5：mode switcher、
  日历日期一致性/today 高亮、loading skeleton、empty calendar、reschedule
  记录上下文。
- 今日缺「查看全部」、空态样式不统一、disabled save 对比、native datetime
  占位、已到店 `开单` 主次样式为 minor。
- 真实 critic 有采样波动：本轮曾出现 console-error、max-tokens 两次失败；
  已记录成本，不伪造 pass。
- M1 `interaction-spec.json` 的 `cd.new-appointment` 仍写“预填并锁定客户”，
  与已签核 brief 不一致；`icon-home` / `icon-user` 仍为 unused asset。
- Studio/Asset Compiler、Figma Renderer、完整 a11y、真实项目 Phase 4 验收
  仍后置。
