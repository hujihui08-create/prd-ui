# 交接对话 · Phase 2 8 页 / Renderer / 视觉修复

- 日期：2026-10-21
- 主交接文档：`docs/handoffs/2026-10-21-8page-renderer-handoff.md`
- 用途：用问答形式把“现在能做什么、哪里不能做、下一步做什么”讲给接手人/下一位 Agent。

> A = 出交接人；B = 接手人。事实以主交接文档和仓库为准。
>
> **2026-10-21 增量**：Task 1、03 四页切片、视觉 v0.1、per-profile M1、资产链、Phase 2 8 页真实 PRD 均已完成。Phase 2 出口：`employee-app-phase2` 8 页（brief gate passed，sample IA waiver）、M1 三 gate passed（¥0.4355）、Spec 8/0、HTML 8 页、Phase 1 8/0；per-profile 8 页 demo-orders run interaction passed（¥0.5105）；asset review 4/4；当前 510 tests。下一阶段是 v0.4（motion + 视觉回归）或 Phase 3（Figma/沙箱/Handoff）。
>
> **2026-10-22 增量（v0.3.1 clean 收尾，已提交）**：`employee-app-phase2` 8 页已干净跑通——intake 0 waiver / 0 手工 brief patch、brief hash `sha256:b558b57a…b8335`（¥0.8978）；M1 三 gate passed、0 waiver（¥0.43998）；Spec 8 Page Specs / 0 blockers / 36 warnings；HTML 8 页 + index，Phase 1 `8/0`；Playwright 交互验收（搜索、日历/列表、new/reschedule、状态动作栏、告知确认）19 张截图；当前 529 tests，Phase 1 `8/2/4/8` 全 0 blockers。下一步是 v0.4：motion 进 HTML、稳定 node id、Visual Critic/截图 diff、customer picker、完整日期预填。

---

**B：这条流水线现在到底能做什么？**

A：能跑通一条完整链路：

```text
PRD → intake:run（PRD review + IA + UI Briefer + 两道签核）
    → signed ui-brief.json
    → agent:run（IA / Interaction / Visual Style）
    → spec:engineer（8 个 Page Spec）
    → render:html（8 页 HTML + index）
```

8 页 demo-orders sample 已经跑通；employee-app 两页切片仍然是回归基线。

**B：这 8 页是写死的吗？换项目会不会还是这 8 页？**

A：不是写死的。8 页来自：

- `samples/project.demo-orders-intake.yaml`
- `samples/projects/demo-orders-intake/ui-brief.json`

换项目时换 `--project` 和 `--prd`，页面数量/页面 id/角色/字段由新 PRD 和新 brief 决定。当前支持 10 个 archetype、3 个 profile（b-dense / b-mobile / c-expressive）。新品牌、新页型、新资产需要扩展 profile/catalog/archetype。

**B：视觉 Agent 开发完了吗？**

A：分三层：

- **Visual Style Agent（M1）**：已完成，能产出 `visual-style.json`（direction / palette / typography / assetStrategy），8 页 run 的 visual gate passed，且已签核。
- **资产链路**：未完整。8 页 run 的 `assetBriefs=[]`，8 页 asset review 没跑，`SPEC_ASSET_BRIEFS_MISSING` 仍是 warning。
- **HTML 视觉验收/动效**：未完成。没有 Visual Critic、没有自动截图 diff，motion 也还没动画到 HTML。

所以“视觉 Agent”作为 M1 角色是完成了；“完整视觉系统”没有。

**B：8 页 HTML 现在能看吗？**

A：能。当前后台服务：

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory /tmp/html-8p
# http://127.0.0.1:8080/
```

页面：orders-overview / orders-list / order-detail / order-form / settings / home-feed / item-detail / auth。
8 页都有真实 mock 数据、中文标签、空/加载/错误态；mobile 页面有底部导航。原型级 Playwright 视觉巡检通过。

**B：这次到底修了什么？为什么之前是空白？**

A：之前 renderer 只支持 employee-app 的两页移动端：

- 没有 `PageShell` → 5 个 web 页空白；
- `MobileShell` 只渲染 `content/top-bar/bottom-nav` → home-feed/item-detail/auth 空白；
- `Stat/DataTable/FormField/List/FeedCard` 等没有 case；
- brief 没有 `mockData`/`fieldLabels` → 即使渲染也只有骨架/英文 id。

这次补了 PageShell/MobileShell 全 slot、11 个通用组件、mockData/fieldLabels、标题/索引/导航/按钮/徽标/空态，并让语义 validator 接受本地化标签。

**B：怎么验证现在是好的？**

A：

```bash
cd "/Users/jihui/Desktop/产品、ui/pipeline"
pnpm test        # 496 passed
pnpm typecheck   # clean
pnpm test:dsh    # 2 passed

pnpm phase1:verify \
  --project samples/project.demo-orders-intake.yaml \
  --runs /tmp/phase1-8p-mock
# 8 pages / 0 blockers
```

8 页 M1：

- `/tmp/m1-8p/run-2026-10-21T02-51-07-011Z`
- `status=success`
- `gates={ia:waived, interaction:passed, visualStyle:passed}`
- `costCny=0.3298461696`

Spec Engineer：

- `/tmp/spec-8p-mock/run-2026-10-21T06-27-19-458Z`
- 8 Page Specs，0 blockers。

HTML：

- `/tmp/html-8p/`，8 页 + index。

**B：真实 dsh 花了多少钱？**

A：

| 用途 | 成本 |
|---|---|
| 8 页真实 intake（PRD review + IA + brief） | ¥0.90666 |
| 2 页真实 intake（employee-app） | ¥0.6948 |
| 8 页真实 M1（IA + interaction + visual） | ¥0.3298 |
| intake 32k 截断调试（两次失败尝试） | 约 ¥0.90 |

key 只在本地 `pipeline/.env`，不提交；CLI 不自动加载 `.env`。

**B：下一步先做什么？**

A：按 P0 → P1 → P2：

1. 提交 Task 1 改动（Briefer mockData/fieldLabels，已完成，尚未提交）。
2. M1 per-profile catalog/motion 输入（混合 profile 项目质量）。
3. 8 页 asset briefs + asset review。
4. 真实 PRD 端到端验收。
5. motion HTML + 稳定 node id；自动截图 diff。
6. Figma/Studio/Handoff（Phase 3）。

详见 `docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md`。

**B：有哪些坑？**

A：

- `pipeline/.env` 不会自动加载：`set -a; . ./.env; set +a`。
- M1 默认 profile 是 `prd-ui-agents`（32768 maxTokens）；8 页/长输出用 `prd-ui-intake`（65536）。
- `--allow-unreviewed` 只做开发冒烟，never `success`。
- 8 页 M1 的 IA-001/002 是 sample waiver；真实 PRD 不要照抄 waiver。
- `agent:sign` 只复用已有 artifacts 完成签核，不重跑 Agent；不要手改 `state.json` 伪造签核。
- `mockData`/`fieldLabels` 目前是 8 页 sample 人工补齐，真实 briefer 还不稳定生成。
- M1 visual-style signoff 签的是视觉方向/资产策略，不是 HTML 最终视觉。
- `/tmp` 会丢；需要长期证据就复制到 `pipeline/artifacts/` 或重跑。
- 视觉巡检是手工 Playwright；没有自动截图 diff。

**B：我接手后的第一小时做什么？**

A：

1. `git status`，确认未提交范围（Task 1 改动）。
2. 读 `docs/handoffs/2026-10-21-8page-renderer-handoff.md`、本轮 spec、remaining plan。
3. 跑 `pnpm test` / `typecheck` / `test:dsh`，打开 `/tmp/html-task1` 或 8080。
4. 提交 Task 1 改动，冻结基线。
5. 从 P0 的 M1 per-profile catalog/motion 开始，不要先做 motion/视觉 diff。

---

## 可直接给下一位 Agent 的启动 Prompt

```text
你在 /Users/jihui/Desktop/产品、ui 仓库工作。先读 AGENTS.md、
docs/handoffs/2026-10-21-8page-renderer-handoff.md、
docs/handoffs/2026-10-21-8page-renderer-handoff-dialogue.md、
docs/superpowers/specs/2026-10-21-8page-renderer-mockdata-visual-fixes-design.md、
docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md。

当前状态：Phase 2 出口已达成；renderer 已泛化；510 tests；8 页 M1 success
（IA waived、interaction/visual passed）；Spec Engineer 8 Page Specs；8 页 HTML
已渲染并做过 Playwright 视觉巡检。per-profile M1 真实 run interaction passed
（¥0.5105）；资产链 4 个标准 briefs、asset review 4/4。Phase 2 8 页真实 PRD
（employee-app-phase2）intake ¥0.5249、M1 ¥0.4355、Spec 8/0、HTML 8 页、
Phase 1 8/0。视觉 v0.1：日历、固定操作栏、detail 主/次动作拆分、单主 CTA、
告知分块。Phase 2 出口依赖 sample IA waivers + 一次 brief patch，下一轮应重跑
intake 清理。改动尚未提交。

下一步：先提交当前基线；然后进入 v0.4（motion HTML、稳定 node id、
截图 diff/Visual Critic）或 Phase 3（Figma/沙箱/Handoff）。
不要提交 .env、key、node_modules、/tmp 产物；真实 dsh 跑之前先确认预算和 key。
```
