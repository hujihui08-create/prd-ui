# 会话交接：v0.4.1 → v0.5 签核，v0.6 Phase 3A 待 Figma 门禁

- 日期：2026-10-26
- 状态：**v0.4.1 Signed / v0.5 Signed / v0.6 Implemented（未签核）**
- 当前阻塞：Figma 插件没有在 Figma 文件内运行，Brio MCP `connected=false`（**后续：2026-10-26 10:32 桥已连通；下午插件已在真实 Figma 运行，customer-search scratch 通过 `figma:verify` 0/0/0 且视觉复核完成；剩 6 页、delivery、durable evidence、签核，见 [小债清理交接](2026-10-26-v05x-v06x-debt-cleanup.md) §9–§11**）
- 后续更新：v0.5.x/v0.6.x 小债已清理（3 修 + 1 复核不成立 + `studio:smoke`）；当前 `pnpm test` 694 passed。见 [小债清理交接](2026-10-26-v05x-v06x-debt-cleanup.md)；本文的 688 tests 与 v0.5.x 债务列表为 2026-10-26 早间快照。
- v0.6 详细进度：[v0.6 Phase 3A 实施交接](2026-10-25-v06-phase3a-progress-handoff.md)
- 上一版签核：[v0.5 交接](2026-10-23-v05-visual-a11y-closure-handoff.md)

## 1. 一句话状态

v0.4.1 和 v0.5 已由胡冀徽签核；v0.6 的 Figma plan/plugin/readback diff、Asset Compiler、只读 Studio 已实现并通过自动化测试（688 tests / typecheck clean），但真实 Figma scratch/delivery/readback 从未执行，因此 v0.6 仍未签核，不能标 `passed`。

## 2. 本次会话做了什么

| 阶段 | 结果 | 关键证据 |
|---|---|---|
| `/init` | 重写仓库级 `AGENTS.md`，删掉过期证据，保留命令、边界、规则 | 根目录 `AGENTS.md` |
| v0.4.1 spec | 基于主设计文档和路线图写出 6 项视觉补丁设计 | `docs/superpowers/specs/2026-10-23-v041-visual-patch-design.md` |
| v0.4.1 实施 | 6 项补丁、真机/截图人工复核、7 列周历偏差决策、签核 | 652 tests；baseline `341458e6…c4f4` |
| v0.5 spec + 计划 | loading / empty / mode / a11y / critic stop-rule 收口 | `...-v05-visual-a11y-closure-design.md`、同名 plan |
| v0.5 实施 | 4 个结构性 major 收口，真实 Critic 0 major / 4 minor / 0 blocker，签核 | 672 tests；baseline `6c900b29…c79f` |
| v0.6 spec + 计划 | Figma Renderer、readback diff、Asset Compiler、只读 Studio | `...-v06-figma-studio-asset-compiler-design.md`、同名 plan |
| v0.6 Phase 3A | 自动化部分全部实现；真实 Figma 门禁未跑 | 688 tests；8 个 plan；assets 13/13、4/4；Studio smoke 0 console |
| Figma 连接诊断 | Brio server 在 9500 监听、Figma 桌面版在跑，但插件未在文件内运行 | `figma_connection_status` 返回 `connected=false` |

## 3. 已签核版本

### v0.4.1

- 6 项补丁：today「查看全部」、日历可操作提示、改期上下文、datetime 中文占位/禁用态、选中日高亮、列表 error 内联面板。
- 真实 Critic 最终 run：`run-2026-10-23T03-01-28-979Z`，24/24、diff 24/0/0、0 blocker。
- 签核：胡冀徽，2026-10-23，`waivers=[]`。
- `manifestHash`：`sha256:341458e621be6911b0f5a21cf0442582f38239a54e56b1b2f210ec714c4fcb4a`
- `findingsHash`：`sha256:0b7829da3b490a75ab9c5a9766b4cdce9f760b511dd96f03d0448e95954c0b06`
- 偏差：批准 spec 写的是「3 天 + 滚动提示/渐隐」，真实 Critic 连续拒绝；最终采用 **390px 同屏 7 列紧凑周历**，理由见 spec §13.2。7 列是项目级视觉决策，不是通用结论。

### v0.5

- 结构性收口：mobile-list/detail 的 in-place loading skeleton；empty 改为 inline band（无 fixed overlay）；删除 mode pills，改为入口驱动「新增/改期」；a11y（AA token、`:focus-visible`、键盘行/块、drawer Escape + focus 返回、`required`）。
- 视觉债：取消 danger 右置、footer CTA 44px、gutter 16px、详情值对齐、16:30 日历块真实分钟偏移。
- 签核门禁：signoff 增加 `acceptedMajors` 与 `maxMajor=2`；超过 2 个 major 或缺 reason 时 `visual:sign` 拒绝。
- 真实 Critic：`run-2026-10-23T06-10-08-791Z`，24/24、diff 24/0/0、**0 major / 4 minor / 0 blocker**。
- 签核：胡冀徽，2026-10-23，`acceptedMajors=[]`，`waivers=[]`。
- `manifestHash`：`sha256:6c900b2913d4f96207272ed19d751c8fa6098fa53a7078d0856d3a45ef70c79f`
- `findingsHash`：`sha256:57c9a5b412610dafd5f251173dcbc33f2beed4b58009b78c82491c10a8bab623`

## 4. v0.6 已完成（自动化部分）

- `core/contracts/src/figma.ts`：`FigmaPlan` / `FigmaReadback` / `FigmaDiff` schema。
- `core/figma`：8 页 default plan compiler、Button 实例、glyph/vector/image、CalendarGrid 绝对定位、readback diff。
- `runtimes/figma`：插件 UI（plan 选择、scratch/delivery、readback 下载）、manifest、esbuild bundle（15.8kb，无 Node import）。
- `runtimes/standalone`：`figma:plan`、`figma:verify`、`asset:compile`、`studio:prepare`。
- `core/asset-compiler`：M0 13/13、phase2 4 个 frozen icons、LICENSES、hash/幂等。
- `studio`：Vite/React 19/Tailwind v4 + 本地 shadcn 风格原语；8 页页面树、iframe 状态预览、Spec/Catalog/Profile/Findings/Assets/Trace 面板；手动 Chromium smoke 0 console。

关键数字：

| 项 | 值 |
|---|---|
| `pnpm test` | **688 passed** |
| `pnpm typecheck` | clean |
| `pnpm test:dsh` | 4 passed |
| Phase 1 | `8 / 2 / 4 / 8` pages，全 0 blockers |
| Figma plans | 8 页；`appointment-list` 124 frames / 2 instances |
| Assets | M0 13/13；phase2 4/4 |
| Figma plugin bundle | `runtimes/figma/dist/{code.js,ui.html}`（gitignored） |
| Studio | `studio/public`（generated，gitignored）；`artifacts/employee-app-phase2/studio-v06.png` |

仓库内保留的证据：

- `pipeline/artifacts/employee-app-phase2/figma/plans/`：8 个 `figma-plan.<page>.json` + index，可直接给插件使用。
- `pipeline/artifacts/employee-app-phase2/asset-compiler/{m0,phase2}/`：manifest、LICENSES、README。
- `pipeline/artifacts/employee-app-phase2/studio-v06.png`。
- `pipeline/artifacts/employee-app-phase2/visual-review/`：v0.5 baseline/screenshots/findings/signoff。

**注意：** 本会话用过的 `/tmp/figma-v06`、`/tmp/spec-v05`、`/tmp/html-v05`、`/tmp/assets-*`、`/tmp/visual-v05d` 已经过期不存在。要复现完整链路必须重新跑 Spec Engineer / render / asset compile / Studio prepare；只做 Figma 结构门禁可以直接用仓库里的 8 个 plan。

## 5. 当前阻塞：Figma 人工门禁

### 已诊断

- `mcp__brio-mcp__figma_connection_status` → `{"connected":false,"wsPort":9500,...}`。
- `lsof -nP -iTCP:9500 -sTCP:LISTEN` → node 进程在监听（当时 PID 49385）。
- Figma 桌面版在运行（当时 PID 15305，版本 126.9.16）。
- Brio server 有多个 `brio-mcp/packages/server/dist/index.js` 进程。

结论：**bridge server 和 Figma 都活着，但 Brio MCP 插件没有在任何一个 Figma 文件里运行。** 这不是代码问题。

### 连接步骤

1. 在 Figma 里打开一个具体设计文件（不是文件列表页）。
2. `Plugins → Development → Brio MCP`。
3. 如果菜单里没有：导入 `/Users/jihui/brio-mcp/packages/figma-plugin/manifest.json`，再运行。
4. 运行后重新调用 `figma_connection_status`，应为 `connected=true`。

注意：Brio MCP 是连接/检查用的桥；**v0.6 的渲染器是另一个插件**，路径是 `pipeline/runtimes/figma/manifest.json`。真实 build 应使用我们的插件 UI，而不是把两者混为一个。

### 门禁执行顺序

1. `cd pipeline && pnpm --dir runtimes/figma build`（确保 `dist/` 是最新）。
2. 在 Figma 里导入 `pipeline/runtimes/figma/manifest.json` 并运行。
3. 逐页选择 `pipeline/artifacts/employee-app-phase2/figma/plans/figma-plan.<page>.json`，执行 **Scratch + readback**，下载 readback JSON。
4. 运行：

```bash
cd pipeline
pnpm figma:verify \
  --plan artifacts/employee-app-phase2/figma/plans/figma-plan.<page>.json \
  --readback <downloaded>.json \
  --out /tmp/figma-v06/diff.<page>.json
```

要求 **0 blocker**；major ≤2 且每个都有接受理由。

5. diff 通过后执行 **Delivery page**。delivery 页面同名会阻止，使用新空白文件或先清理 scratch。
6. 人工检查：
   - 中文字体（Noto Sans SC / PingFang SC fallback，不能 tofu）；
   - 颜色变量（`color/*`）和文本样式（`b-mobile/*`）已绑定；
   - Button 是组件实例，label 覆盖正确；
   - Material Symbols glyph / vector 图标存在；
   - CalendarGrid 16:30 块位置正确；
   - today / appointment-list / appointment-form 与 HTML 并排对比。
7. 证据保存到 `pipeline/artifacts/employee-app-phase2/figma/`（readback、diff、截图）。
8. 更新 v0.6 spec §15、roadmap、CHANGELOG、AGENTS、`pipeline/artifacts/employee-app-phase2/README.md`。
9. **签核只能由人执行**；不要把自动 diff 当成签核。签核后本地 commit，不 push。

## 6. 工作树与 Git

- 当前快照：**87 modified / 30 untracked**；本会话没有 commit，也没有 push。
- 大量 modified 是 v0.5 签核后的 baseline、screenshots、visual-review artifacts，属于预期变更，不要随意 revert。
- 新增且应保留的证据：`pipeline/artifacts/employee-app-phase2/figma/plans/`、`asset-compiler/`、`studio-v06.png`、各版本 spec/plan/handoff、`core/figma`、`core/asset-compiler`、`runtimes/figma`、`studio`。
- `pipeline/studio/public`、`pipeline/studio/dist`、`pipeline/runtimes/figma/dist` 是生成物，已 gitignore。
- `.zcode/`、`docs/research/` 仍未跟踪，**不要提交**。
- 本地 commit 需要用户明确授权；仓库规则是 no push。

## 7. 关键决策与不要踩的坑

1. **7 列周历不要改回 3 天滚动。** 已由两版 Critic + 人工接受；其他项目需重新评估，不能当通用结论。
2. **baseline 只由人更新。** `visual:baseline` 由人运行并签核；`visual:review` 不写 baseline。
3. **不要自签。** 视觉门禁的签核人是胡冀徽；agent 只准备证据、跑机械门禁、解释差异。
4. **签核 hash 必须绑定当次证据。** 改截图、改 spec、改 runtime/profile/model 都会让 cache/manifest 失效；不要复用旧 hash。
5. **v0.5 签核要求 0 blocker、≤2 major、每个 major 有 accepted reason。** 超限时 `visual:sign` 会拒绝，不要绕过。
6. **不要编辑已签核 brief：** `samples/projects/employee-app-phase2/ui-brief.json`。
7. **16:30 日历块要保留分钟。** `parseTime` 已保留分钟，renderer 用 `margin-top` / `height` 定位；不要退回整点截断。
8. **紧凑 7 列 CSS 必须限定在 `.app .calendar-grid`。** 只在 `@media (max-width:719px)` 里限定会导致宽视口又出现横向滚动（v0.4.1 人工反馈的真实 bug）。
9. **新增 catalog prop 要同步三个库契约。** 否则 validator 报 `CATALOG-PROP-UNKNOWN`。
10. **Figma 插件不能 headless。** 没有真实 build/readback 就不能签 v0.6；delivery 页面同名会阻止。
11. **Material Symbols 依赖本机字体。** 缺失会 fallback/tofu；完整矢量集是 v0.6.x 债。
12. **dsh 固定 `0.2.1-rc.2`，不要用 `@next`。** `.env` 不会自动加载；真实模型评审前先 `set -a; . ./.env; set +a`。
13. **`/tmp` 不是持久证据。** 本会话的 `/tmp` 目录已经清空；交接口只认仓库内 artifacts。

## 8. 剩余债务

### v0.5.x

1. disabled 状态下 datetime 字段容器视觉丢失。
2. loading 中选中日列是静态 tint，不是 skeleton。
3. 周日列灰色 tint（既有）。
4. treatment-notice 已确认时间 `2026/10/22 09:00:00` 格式不统一。

这些不阻塞 v0.6；需要清理时另开 v0.5.x 小补丁，不重开 v0.5。

### v0.6.x

1. Figma state frames（loading/empty/error/business state）。
2. 完整组件库（当前只做 Button 实例）。
3. Material Symbols 完整矢量集（当前 glyph text）。
4. Studio Playwright 正式接入 runner（当前手动 smoke）。
5. Figma readback/build 的自动化编排（插件不能 headless，需明确人工步骤）。

## 9. 下一步

1. **完成 v0.6 Figma 人工门禁**（见 §5），拿到 0 blocker 的结构 diff，再签 v0.6。
2. 签核后进入 **v0.7**：scratch 沙箱、Test Subagent、Handoff Packager。
3. 之后按路线图：v0.8 Phase 4 pilot、v0.9 RC、v1.0。

## 10. 推荐阅读顺序

1. 本交接。
2. [v0.6 设计](../superpowers/specs/2026-10-23-v06-figma-studio-asset-compiler-design.md) §15（实现进度）与 [v0.6 计划](../superpowers/plans/2026-10-23-v06-figma-studio-asset-compiler.md)。
3. [v0.6 Phase 3A 详细交接](2026-10-25-v06-phase3a-progress-handoff.md)。
4. [v0.5 设计](../superpowers/specs/2026-10-23-v05-visual-a11y-closure-design.md) 与 [v0.5 交接](2026-10-23-v05-visual-a11y-closure-handoff.md)。
5. [v0.4.1 设计](../superpowers/specs/2026-10-23-v041-visual-patch-design.md) §13.2（7 列偏差）与 [v0.4.1 交接](2026-10-23-v041-implementation-handoff.md)。
6. 主设计：`docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md`、`...-m1-agent-layer-design.md`、`...-phase-2-spec-engineer-design.md`、`...-phase-2-prd-review-ui-briefer-design.md`。
7. 根目录 `AGENTS.md`。
