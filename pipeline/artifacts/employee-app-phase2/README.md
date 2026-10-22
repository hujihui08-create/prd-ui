# 员工端 · Phase 2 8 页 clean 收尾（v0.3.1）

从 `samples/projects/employee-app-phase2/prd.md` 的真实 PRD 走完整链路：

```text
PRD → intake:run（PRD review + IA + UI Briefer + 两道签核）
    → ui-brief.json（0 waiver / 0 手工 patch）
    → agent:run（IA / Interaction / Visual Style）
    → spec:engineer（8 个 Page Spec）
    → render:html（8 页 + index.html）
```

## 目录

```text
html/                       8 页渲染结果 + index.html
screenshots/                19 张 Playwright 截图（390×844）
run-summary/                intake / M1 / agent:sign / Spec / Phase 1 摘要
signoffs/                   PRD/IA、brief、visual-style 签核
gates/                      ia / interaction / visual-style gate 结果
m1-final-ia-blocked/        早前 blocked M1 IA 的证据（保留）
asset-review/               2026-10-21 的项目资产证据（非 clean run，见其 README）
```

## Clean run 数字

| 阶段 | Run | 结果 |
|---|---|---|
| intake | `run-2026-10-22T03-09-28-544Z` | success；8 页全 `b-mobile`；PRD/IA + brief gate passed；0 waivers、0 手工 brief edits；brief hash `sha256:b558b57a5876bdabdd268f05d355876f84b1f675d668f561db253b3c3b0b8335`；¥0.8977902624 |
| M1 | `run-2026-10-22T03-16-05-257Z` | success；`ia:passed / interaction:passed / visualStyle:passed`；0 waivers；¥0.4399832736 |
| Spec Engineer | `run-2026-10-22T03-23-54-618Z` | 8 Page Specs、0 blockers、36 warnings（34 motion node + 2 unused asset） |
| HTML / Phase 1 | — | 8 页 + index；`8 pages / 0 blockers` |

最终链路成本 ¥1.337773536；含早前重试共 ¥2.935835885。

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

- `00-index`、`01-today`：入口与首页。
- `02`–`05`：搜索 idle / 结果 / 空态、客户详情。
- `06`–`09`：预约详情默认 / 已到店 / 已取消 / 爽约。
- `10`–`12`：新增 / 改期 / 日历空格预填。
- `13`、`13b`：告知未确认 / 已确认。
- `14`：回访登记。
- `15`–`17`：预约列表日历 / 详情抽屉 / 列表视图。

## 重新生成

```bash
cd pipeline
pnpm phase1:verify --project samples/projects/employee-app-phase2/project.yaml --runs <runs-dir>
pnpm agent:run --project samples/projects/employee-app-phase2/project.yaml \
  --runtime dsh --profile prd-ui-intake --runs <m1-runs-dir>
pnpm spec:engineer --project samples/projects/employee-app-phase2/project.yaml \
  --agent-run <m1-run-dir> --runs <spec-runs-dir>
pnpm render:html --run <spec-run-dir> --out <html-out-dir>
```

真实 dsh 需要先 `set -a; . ./.env; set +a` 并设置 `DSH_HOME="$PWD/dsh/home"`。

## 已知限制（v0.4 债务）

- customer picker 未接入静态 renderer：form → customer-search 的 `mode=picker`
  流程没有链接路由/绑定。
- 日历空格预填只有 day-of-month（`03 09:00`），不是完整 `YYYY-MM-DD`。
- M1 `interaction-spec.json` 的 `cd.new-appointment` 仍写“预填并锁定客户”，
  与已签核 brief（new 可编辑、仅 reschedule 锁定）不一致；artifact 保留不改。
- 34 条 motion node warning 是 v0 预期；2 条 unused asset brief
  （`icon-home` / `icon-user`）。
- `asset-review/` 不是本轮产物，仍是 2026-10-21 的资产证据。
- 爽约/已取消保留只读“客户详情”导航；底部业务动作栏已隐藏。
- motion 尚未动画到 HTML；没有 Visual Critic / 自动截图 diff。
