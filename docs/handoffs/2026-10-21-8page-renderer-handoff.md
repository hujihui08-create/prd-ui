# 交接文档 · Phase 2 8 页出口 / Renderer 泛化 / 视觉修复

- 日期：2026-10-21
- 工作目录：`/Users/jihui/Desktop/产品、ui`
- 当前分支：`main`
- 当前 HEAD：`472fcb0 feat(renderer): generalize 8-page shells, mock data, and field labels`
- 状态：**8 页端到端已跑通；renderer 泛化、mock 数据、字段标签、8 页视觉巡检完成**；renderer 改动已提交，Task 1（Briefer 自动生成 mockData/fieldLabels）已完成但尚未提交
- 下一阶段：`docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md` 的 Task 2
- 对话式交接：`docs/handoffs/2026-10-21-8page-renderer-handoff-dialogue.md`

> **2026-10-21 增量**：Task 1、03 四页切片、视觉 v0.1、per-profile M1、资产链、Phase 2 8 页真实 PRD 均已完成。Phase 2 出口：`employee-app-phase2` 8 页（brief gate passed，sample IA waiver）、M1 三 gate passed（¥0.4355）、Spec 8/0、HTML 8 页、Phase 1 8/0；per-profile 8 页 demo-orders run interaction passed（¥0.5105）；asset review 4/4。当前 **510 tests**。下一阶段是 v0.4（motion + 视觉回归）或 Phase 3（Figma/沙箱/Handoff）；Phase 2 出口依赖 sample waiver + brief patch，下一轮应重跑 intake 清理。
>
> **2026-10-22 增量（v0.3.1 clean 收尾，已提交）**：`employee-app-phase2` 8 页真实 PRD 已干净跑通：intake `run-2026-10-22T03-09-28-544Z` success，PRD/IA gate + brief gate passed，**0 waiver / 0 手工 brief patch**，brief hash `sha256:b558b57a…b8335`（¥0.8978）；M1 `run-2026-10-22T03-16-05-257Z` `ia:passed / interaction:passed / visualStyle:passed`（0 waiver，¥0.43998，visual signoff 由 `agent:sign` 完成）；Spec Engineer `run-2026-10-22T03-23-54-618Z` 8 Page Specs / 0 blockers / 36 warnings；HTML 8 页 + index，Phase 1 `8/0`。Renderer 新增业务状态动作栏、new/reschedule 表单 mode、日历/列表切换、搜索过滤与详情抽屉；Playwright 交互验收 19 张截图。当前 **529 tests**、typecheck clean、`test:dsh` 2 passed；Phase 1 `8/2/4/8` 全 0 blockers。最终链路成本 ¥1.3378（含早前重试 ¥2.9358）。下一步是 v0.4：motion 进 HTML、稳定 node id、Visual Critic/截图 diff、customer picker、完整日期预填；Phase 3（Figma/沙箱/Handoff）仍未开始。v0.4 债务清单见 `docs/superpowers/specs/2026-10-22-clean-phase-2-finish-design.md` §9。

> **2026-10-22 增量（v0.4 动效 + 视觉回归，已完成）**：motion 语义 node id、Spec Engineer `--strict-motion`（8 Page Specs / 0 blockers / **0 motion unresolved**）、renderer CSS 动效 + reduced-motion、customer picker（select/cancel/back/reload）、完整日期 `datetime-local` 预填、24 项 visual baseline、`core/visual-review` 确定性 gate/pixel diff、真实 dsh Visual Critic（`prd-ui-visual`，65536 maxTokens，900s timeout）与 `visual:sign` 全部落地。最终视觉 run `run-2026-10-22T10-42-23-082Z`：`status=passed`，24/24 截图、0 console / 0 overflow、diff 24/0/0、10 findings（7 major / 3 minor / **0 blocker**）、¥0.2939536224；签核 `waivers=[]`。当前 **632 tests**、typecheck clean、`test:dsh` 4 passed、Phase 1 `8/2/4/8` 全 0 blockers。证据在 `pipeline/artifacts/employee-app-phase2/visual-review/`；baseline 在 `pipeline/baselines/employee-app-phase2/`。剩余是 critic major 视觉债（disabled 样式、reschedule 内部 chip、detail 双 CTA、术后告知时序、搜索/列表行 affordance、loading 结构）、确定性 critic replay，以及 Phase 3/4（Figma/Studio/Asset Compiler/a11y/真实项目验收）。

---

## 0. 快速摘要

已经完成的：

1. **Phase 2 8 页出口**：signed 8 页 brief → 真实 dsh M1 → Spec Engineer 8 Page Specs → 8 页 HTML + index。
2. **8 页 M1**：IA waived（sample IA-001/002）、Interaction passed、Visual Style passed；`agent:sign` 后 `success`，成本 **¥0.3298**。
3. **Spec Engineer**：8 Page Specs，0 blockers，27 warnings（26 motion node + asset briefs missing）。
4. **Renderer 泛化**：PageShell / MobileShell 全 slot，Stat/List/DataTable/FilterBar/Pagination/FormField/Input/Select/FeedCard/BottomNav/Image。
5. **Mock 数据与标签**：`UiBriefPage.mockData`（values/rows/listItems）、`fieldLabels`；compiler → Page Spec → HTML 全链路。
6. **视觉巡检**：8 页 + index 逐页 Playwright 截图；web/mobile 内容、状态切换、空/加载/错误态、底部导航均可见。
7. **employee-app 2 页**：HTML 与 6 张截图刷新；`2 pages / 0 blockers` 不退化。

还没做的：

- ~~UI Briefer 自动生成 `mockData`/`fieldLabels`~~（2026-10-21 已完成，见下方增量）；
- M1 per-profile catalog/motion 输入（当前只传 `brief.meta.profile`）；
- 8 页 asset briefs / asset review（`assetBriefs=[]`）；
- motion 动画到 HTML、稳定 node id；
- 自动截图 diff / Visual Critic；
- Figma/Studio/Handoff（Phase 3）。

---

## 1. 当前真实状态

### 1.1 验证

```bash
cd "/Users/jihui/Desktop/产品、ui/pipeline"
pnpm test        # 500 passed
pnpm typecheck   # clean
pnpm test:dsh    # 2 passed

pnpm phase1:verify \
  --project samples/project.demo-orders-intake.yaml \
  --runs /tmp/phase1-8p-mock
# Phase 1A OK: 8 pages, 0 blockers
```

真实 dsh 8 页 M1（已执行）：

- `/tmp/m1-8p/run-2026-10-21T02-51-07-011Z`
- `status=success`（`agent:sign` 后）
- `gates={ia:waived, interaction:passed, visualStyle:passed}`
- `signoff={ia:true, visualStyle:true}`
- `costCny=0.3298461696`，`usageComplete=true`

Spec Engineer：

- `/tmp/spec-8p-mock/run-2026-10-21T06-27-19-458Z`
- 8 Page Specs，0 blockers，27 warnings。

HTML：

- `/tmp/html-8p/`：8 个页面 + `index.html`。
- 本地预览：`http://127.0.0.1:8080/`（后台 Python server；新会话可能已停）。

employee-app：

- `pipeline/artifacts/employee-app/html/{index,today,inventory-query}.html`
- `pipeline/artifacts/employee-app/*.png`（6 张状态截图）

### 1.2 8 页 Project / Brief

- `pipeline/samples/project.demo-orders-intake.yaml`
- `pipeline/samples/projects/demo-orders-intake/ui-brief.json`

页面：

`orders-overview`、`orders-list`、`order-detail`、`order-form`、`settings`、`home-feed`、`item-detail`、`auth`。

---

## 2. 本轮改动

### 2.1 代码

| 模块 | 内容 |
|---|---|
| `core/renderer-html` | `PageShell`；`MobileShell` 全 slot；11 个组件；PageShell/MobileShell CSS；PageShell/MobileShell 状态面板；标题/索引/导航/按钮/徽标/空态修复；`RenderOptions.pageNames` |
| `core/contracts` | `UiBriefPage.mockData`、`fieldLabels`；`UiBriefMockDataSchema` |
| `core/compiler` | mock rows/values/listItems；fieldLabels 到表单/表格/筛选/摘要；status Badge tone；list extra actions 位置 |
| `core/validators` | `SEMANTIC-FIELD`/`SEMANTIC-FILTER` 接受 `fieldLabels` |
| `runtimes/standalone` | `agent:run --brief`/`--profile`；`agent:sign`；intake brief gate 跑 Phase 1 语义 validators；renderer CLI 传 pageNames |
| `pipeline/samples` | 8 页 brief mockData/fieldLabels/stats/feedItems；employee item-detail status；`project.demo-orders-intake.yaml` |
| `pipeline/dsh/home/profiles/prd-ui-intake` | 65536 maxTokens intake/M1 8-page profile |
| tests | renderer 7 tests；validators 负例调整；agent-sign 4 tests；intake CLI 6 tests；Task 1 与 03 切片新增 8 tests；总数 500 |

### 2.2 文档

- `docs/superpowers/specs/2026-10-21-8page-renderer-mockdata-visual-fixes-design.md`
- `docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md`
- `README.md` / `AGENTS.md` / `CHANGELOG.md` / `pipeline/docs/*` 更新
- `.gitignore` 增加 `.playwright-mcp/`

### 2.3 未提交

```bash
cd "/Users/jihui/Desktop/产品、ui"
git status --short
# 约 34 个文件（renderer/compiler/contracts/validators/samples/artifacts/docs/tests）
```

建议先提交：

```bash
git add -A
git commit -m "feat(renderer): generalize 8-page shells, mock data, and field labels"
```

不要提交 `.env`、`node_modules`、`.playwright-mcp`。

---

## 3. 如何运行

### 3.1 全量验证

```bash
cd "/Users/jihui/Desktop/产品、ui/pipeline"
pnpm install
pnpm test
pnpm typecheck
pnpm test:dsh
```

### 3.2 8 页 Phase 1

```bash
pnpm phase1:verify \
  --project samples/project.demo-orders-intake.yaml \
  --runs /tmp/phase1-8p-mock
```

### 3.3 8 页真实 dsh M1

```bash
cd "/Users/jihui/Desktop/产品、ui/pipeline"
set -a; . ./.env; set +a

DSH_HOME="$PWD/dsh/home" pnpm agent:run \
  --project samples/project.demo-orders-intake.yaml \
  --runtime dsh --profile prd-ui-intake \
  --signoff-ia /tmp/signoff-ia-8p.md \
  --runs /tmp/m1-8p-new \
  --max-cost-cny 3
```

说明：

- `--signoff-ia` 需包含 sample IA-001/002 waiver；如果没有，先跑一次 IA 看 findings，再生成 waiver。
- 8 页 M1 使用 `prd-ui-intake`（65536 maxTokens）；M1 默认 profile 仍是 `prd-ui-agents`（32768）。
- 不加 visual signoff 时状态是 `awaiting_signoff`；`spec:engineer` 接受该状态。

### 3.4 无模型调用完成 visual signoff

```bash
pnpm agent:sign \
  --run /tmp/m1-8p-new/<runId> \
  --signoff-visual-style /tmp/signoff-visual-style-8p.md
```

`agent:sign` 校验 gate/签核后把 `state.json` 推到 `success`，不重跑 Agent。

### 3.5 Spec Engineer + Renderer

```bash
pnpm spec:engineer \
  --project samples/project.demo-orders-intake.yaml \
  --agent-run /tmp/m1-8p-new/<runId> \
  --runs /tmp/spec-8p-new

pnpm render:html \
  --run /tmp/spec-8p-new/<runId> \
  --out /tmp/html-8p
```

### 3.6 本地查看 HTML

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory /tmp/html-8p
# http://127.0.0.1:8080/
```

employee-app 静态产物：

```bash
python3 -m http.server 8081 --bind 127.0.0.1 \
  --directory pipeline/artifacts/employee-app/html
```

---

## 4. 关键路径与产物

```text
samples/project.demo-orders-intake.yaml
  └─ samples/projects/demo-orders-intake/ui-brief.json
        │
        ▼
/tmp/m1-8p/run-.../                 # M1: IA/interaction/motion/visual/asset-briefs
  state.json                        # success
  signoff/ia.md
  signoff/visual-style.md
  agent-sign.json
        │
        ▼
/tmp/spec-8p-mock/run-.../          # 8 Page Specs
  artifacts/page-spec/*.json
  findings/spec-engineer-gate.json
        │
        ▼
/tmp/html-8p/                       # 8 HTML + index
```

注意：`/tmp` 不是持久产物；需要长期保留时复制到 `pipeline/artifacts/` 或重新跑。

---

## 5. 当前成本记录

| Run | 成本 | 说明 |
|---|---|---|
| 8 页真实 intake | ¥0.90666 | PRD review + IA + brief；sample F-001/IA-001/IA-002 waiver |
| 2 页真实 intake | ¥0.6948 | employee-app；success + publish |
| 8 页真实 M1 | ¥0.3298 | IA + interaction + visual；visual 用 `agent:sign` 完成 |
| intake 32k 截断调试 | 约 ¥0.90 | 两次失败尝试，仅记录，不是可复现验收 |

所有 run 的 usage/cost 在各自 `state.json`/`agent-*.json`。

---

## 6. 已知问题 / 下一步

详见 `docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md`。优先级：

1. **P0**：提交 Task 1 改动（briefer 自动生成 `mockData`/`fieldLabels`，已完成）。
2. **P0**：M1 per-profile catalog/motion 输入。
3. **P1**：8 页 asset briefs + asset review。
4. **P1**：真实 PRD 端到端验收。
5. ~~P2：motion HTML + 稳定 node id；自动截图 diff~~（v0.4 已完成）。
6. **Phase 3**：Figma/Studio/Handoff/a11y；critic major 视觉债与确定性 replay。

---

## 7. Gotchas

- **key**：只在 `pipeline/.env`，不提交；CLI 不自动加载，必须 `set -a; . ./.env; set +a`。
- **profile**：M1 默认 `prd-ui-agents`（32768）；8 页/长输出用 `prd-ui-intake`（65536）。不要把 `@next` 用到 dsh。
- **`--allow-unreviewed`**：只用于开发冒烟，never `success`；8 页验收用 IA/visual signoff + `agent:sign`。
- **签核**：`signoff/ia.md`、`signoff/visual-style.md` 的机器可读块是审计事实源；不要手改 `state.json` 伪造签核，用 `agent:sign`。
- **brief 数据**：`mockData`/`fieldLabels` 是可选字段；真实 briefer 尚未稳定生成，当前 8 页 sample 是人工补齐。
- **source of truth**：`ui-brief.json` / M1 `state.json` / Page Specs 分别是各阶段事实源；不要从 HTML 反推。
- **视觉验收**：v0.4 起是 `visual:baseline` + 24 项确定性截图/diff + Visual Critic + `visual:sign`；M1 visual-style signoff 签的是视觉方向/资产策略，不是 HTML 最终视觉。critic 是 advisory，blocker 才需要 waiver。
- **`/tmp`**：run 产物会丢失；需要证据时复制到 `pipeline/artifacts/` 或重新跑。
- **`.playwright-mcp/`**：已加入 `.gitignore`，截图/日志不要提交。

---

## 8. 交接检查清单

- [ ] `git status` 了解未提交范围。
- [ ] `pnpm install` 后 `pnpm test`/typecheck/test:dsh 全绿。
- [ ] 能打开 `/tmp/html-8p/index.html` 或启动 8080 server。
- [ ] 能复述 8 页 sample project 与 M1/Spec run 路径。
- [ ] 知道 `/tmp` 产物不持久、key 在本地 `.env`。
- [ ] 知道下一项是 P0 提交 + briefer mockData/fieldLabels。
