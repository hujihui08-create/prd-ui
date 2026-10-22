# 员工端 · Phase 2 8 页 clean 出口（v0.4）

从 `samples/projects/employee-app-phase2/prd.md` 的真实 PRD 走完整链路：

```text
PRD → intake:run（PRD review + IA + UI Briefer + 两道签核）
    → ui-brief.json（0 waiver / 0 手工 patch）
    → agent:run（IA / Interaction / Visual Style）
    → spec:engineer --strict-motion（8 个 Page Spec，0 motion unresolved）
    → render:html（8 页 + index.html）
    → visual:baseline（24 张确定性截图）
    → visual:review --runtime dsh（确定性 gate + pixel diff + Visual Critic）
    → visual:sign（人工签核）
```

## 目录

```text
html/                       8 页渲染结果 + index.html（v0.4）
screenshots/                19 张 v0.3.1 人工 Playwright 截图（保留）
visual-review/              v0.4 证据
  visual-review.json        最终 review（status=passed，signoff valid）
  state.json                最终 run 状态（success）
  screenshots/              24 张 390×844 矩阵截图 + manifest.json
  findings/visual-gate.json 确定性 gate + 全部 findings
  findings/visual-critic.json Visual Critic 原始 critique、usage、cost
  signoff/visual.md         人工签核（manifestHash + findingsHash）
  baseline-manifest.json    与 pipeline/baselines/employee-app-phase2 一致
run-summary/                intake / M1 / agent:sign / Spec / Visual Review / Phase 1 摘要
signoffs/                   PRD/IA、brief、visual-style 签核
gates/                      ia / interaction / visual-style gate 结果
m1-final-ia-blocked/        早前 blocked M1 IA 的证据（保留）
asset-review/               2026-10-22 clean M1 资产 brief 的 M0 评审（4/4 passed）
```

## Clean run 数字

| 阶段 | Run | 结果 |
|---|---|---|
| intake | `run-2026-10-22T03-09-28-544Z` | success；8 页全 `b-mobile`；PRD/IA + brief gate passed；0 waivers、0 手工 brief edits；brief hash `sha256:b558b57a5876bdabdd268f05d355876f84b1f675d668f561db253b3c3b0b8335`；¥0.8977902624 |
| M1 | `run-2026-10-22T03-16-05-257Z` | success；`ia:passed / interaction:passed / visualStyle:passed`；0 waivers；¥0.4399832736 |
| Spec Engineer（v0.4） | `run-2026-10-22T10-22-51-461Z` | 8 Page Specs、8 motion pages、0 blockers、2 warnings（unused asset）、**0 `SPEC_MOTION_NODE_UNRESOLVED`** |
| Asset review | `run-2026-10-22T03-43-12-461Z` | clean M1 的 4 个标准图标 brief：4/4 passed、0 unresolved；真实 dsh vision；¥0.1697866272 |
| HTML / Phase 1 | — | 8 页 + index；`8 pages / 0 blockers` |
| Visual baseline | `pipeline/baselines/employee-app-phase2` | 24 cases / 24 PNG；manifest `sha256:6055996f30c1f6a8eee4521e7e4d134f5e8b524fc79384dc488169669ca24184` |
| Visual review（最终） | `run-2026-10-22T10-42-23-082Z` | `status=passed`；24/24 截图；diff 24 passed / 0 failed / 0 missing；0 console / 0 overflow；10 findings（7 major / 3 minor / **0 blocker**）；¥0.2939536224；`usageComplete=true` |
| Visual signoff | — | `Sample Reviewer`，2026-10-22，`waivers=[]`；manifest hash `sha256:7340ff7f…a0a885`；findings hash `sha256:55335024…fbccb1` |

v0.4 新增成本：visual critic 真实调用共 ¥1.6415 —— 第一次 `run-2026-10-22T10-24-11-704Z` 在 32768 maxTokens / 300s 下超时（¥0.9835，`usageComplete=false`，blocked）；调整 profile 为 65536 maxTokens + 900s 后，首次 review ¥0.3641、最终 review ¥0.2940。链路历史成本（intake + M1 + asset review）¥1.5075601632 不变。

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

直接打开 `html/index.html` 即可；页面右上角保留 `默认 / 空 / 加载 / 失败` 预览切换。

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

- `00-index`、`01-today`：入口与首页。
- `02`–`05`：搜索 idle / 结果 / 空态、客户详情。
- `06`–`09`：预约详情默认 / 已到店 / 已取消 / 爽约。
- `10`–`12`：新增 / 改期 / 日历空格预填。
- `13`、`13b`：告知未确认 / 已确认。
- `14`：回访登记。
- `15`–`17`：预约列表日历 / 详情抽屉 / 列表视图。

## v0.4 验收

- motion：Page Spec 8 页均带 `motion`；HTML 输出 `data-motion-preset` / `data-node-id`；`prefers-reduced-motion` 回退到 `fade`（`enter-fade` → `motion-state-swap`）。
- picker：form → 选择 → customer-search（`mode=picker`）→ 选择张女士 → 回表单，客户回填且其他字段保留；取消/返回与 reload 均保留草稿；reschedule 模式客户字段与选择按钮锁定。
- 日期：日历空格点击传入完整 `YYYY-MM-DD` + `HH:mm`，表单 `startTime` 预填 `YYYY-MM-DDTHH:mm`，`endTime` +60 分钟，字段为 `datetime-local`。
- 保真：列表无字段标题 Row；detail/notice 无重复客户/状态节点；首页底部 Tab 为「今日 / 预约列表」；搜索 idle 不显示「查看详情」和底部「搜索」，空态显示「清空关键词」；日历有 4 色图例、完整日期、390px 横向滚动（720px 内容宽 / 350px 视口）和详情抽屉。
- Playwright 结果见 `run-summary/playwright-checks-v04.json`。

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
`prd-ui-visual` 使用 65536 maxTokens；24 张截图需要更长输出预算，CLI critic 超时默认 900000ms。

## Visual Critic 结果与已知限制

最终 run 0 blocker，7 major / 3 minor 作为 warning 记录并签核（`waivers=[]`）。未修复的 major 进入 Phase 3/4 债：

- `appointment-form` disabled 预览没有字段/CTA 的禁用样式或权限说明（VC-001）。
- `appointment-form` reschedule 仍显示内部 `预约 appointment-form` chip（VC-002）。
- `appointment-detail` 同时出现「接单并确认到店」与「已到店确认」两个 check-in CTA（VC-003）。
- `appointment-detail` 已到店状态仍提供「术后告知」，而 `服务完成=否`（VC-004）。
- `customer-search` 的「查看详情」浮在结果上方，结果行没有卡片/chevron（VC-006）。
- `appointment-list` 仍有页面级「查看完整详情」且与视图切换并列（VC-007）；列表行 subtitle 被截断、护理师不可见（VC-008）。
- `appointment-list` loading 只显示通用 skeleton，不保留筛选/日历结构（VC-009）。
- minor：爽约/已取消的只读「客户详情」缺少按钮感（VC-005）；`告知分块` 内部标签（VC-010）；日期输入使用浏览器 native `mm/dd/yyyy` 占位。
- 真实 critic 有采样波动：首次 review 12 findings，签核后重跑得到另一组 10 findings；最终 run 以自身 findings 签核，因此 `visual-review.json.status=passed`、`state.json.status=success`。设计上的「同输入二次评审 findings 收敛」尚未实现为确定性 replay。
- M1 `interaction-spec.json` 的 `cd.new-appointment` 仍写“预填并锁定客户”，与已签核 brief（new 可编辑、仅 reschedule 锁定）不一致；artifact 保留不改。
- 2 条 unused asset brief（`icon-home` / `icon-user`）保留 warning。
- Studio/Asset Compiler、Figma Renderer、完整 a11y、真实项目 Phase 4 验收仍后置。
