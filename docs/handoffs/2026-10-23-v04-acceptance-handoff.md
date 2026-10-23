# v0.4 动效与视觉回归 · 交接文档

- 日期：2026-10-23
- 交接对象：下一位接手 PRD → UI 流水线的 Agent/工程师
- 当前版本：**v0.4 已完成**（signed visual review `passed`，仍有 6 条 major 作为 v0.5 债务）
- 仓库：`main`，本地 commits only，**未 push**

## 1. 一句话状态

v0.4 的动效、视觉回归、picker/date、8 页保真修复已经落地并通过机械验收；真实 Visual Critic 的 verdict 仍是 `changes`，6 条 major 已明确转 v0.5。Phase 3/4 未开始。

## 2. 关键数字

| 项 | 值 |
|---|---|
| 测试 | **644 passed** |
| typecheck | clean（15 个 workspace package） |
| `pnpm test:dsh` | **4 passed** |
| Phase 1 | `8 / 2 / 4 / 8` 全 0 blockers |
| Spec Engineer `--strict-motion` | 8 Page Specs / 0 blockers / **0 motion unresolved** |
| Visual baseline | 24 cases / 24 PNG |
| Visual review | 24/24 截图；0 console / 0 overflow；diff 24/0/0 |
| 最终 review | `status=passed`；9 findings（6 major / 3 minor / **0 blocker**） |
| Critic cache | `cacheHit=true`；同 manifest/findings hash；¥0、0 次模型调用 |
| 累计 critic 成本 | Task 9 约 ¥3.395（含失败/重跑；最终 review ¥0） |

最终 commit：`7dbaf5b`（版本路线确认）。v0.4 实现主体在 `786f5b0`、`651e5f5`、`be0893f`、`fed3a05`、`e4e55f5`、`c06b68d`。

## 3. 已实现（v0.4）

### Motion

- `core/design-system/src/semantic-ids.ts`：语义 node id 注册表。
- Compiler 为每个节点写确定性 `node.id`；重复行带 `motionGroup`。
- Spec Engineer 解析 legacy alias / group / page-level binding；`--strict-motion` 对 clean 8 页把 unresolved 升级为 blocker。
- Renderer `core/renderer-html/src/motion.ts`：`data-motion-*`、CSS keyframes、stagger、`prefers-reduced-motion` fallback（none/fade/instant）。
- 支持 8 个 preset：`enter-fade`、`page-push`、`sheet-up`、`state-swap`、`list-stagger`、`press-feedback`、`confirm-collapse`、`toast-in`。

### Visual Review

- `core/visual-review`：24 项截图矩阵（default/representative states/search/businessStates/formModes/views/drawer/notice）、确定性 gate、`visualReviewStatus`。
- `visual:baseline`：只由人运行，写 baseline PNG + manifest。
- `visual:review`：Playwright 截图 + pixelmatch diff + console/overflow gate + Visual Critic。
- `visual:sign`：校验 `manifestHash` + `findingsHash`；支持 waived critic blocker。
- signed-critique cache：key = 视觉 manifest hash + Page Spec hash + runtime/profile/model；同输入 0 模型调用。
- 真实 Visual Critic：`core/agents/src/roles/visual-critic.ts`，dsh profile `prd-ui-visual`（vision、65536 maxTokens、900s timeout、只读工具面）。

### Picker / 日期

- 表单客户 picker：per-form draft、origin、return 标记；取消/返回/reload 保留草稿；保存/表单返回清理。
- 客户选择直接写回目标 form 的 `draft.customer`，不再使用全局 selected。
- 日历使用完整 `YYYY-MM-DD`；当前 clean brief 的 mock 行是 `11-05 周三`，所以周源是 `2025-11-03`，不是 2026。
- reschedule 点击流程会回填 customer/project/start/end/therapist，并锁定客户。

### 8 页保真

- 列表去掉裸字段标题 Row；detail/notice 去重，状态 badge 只出现一次。
- 今日底部两个 Tab（今日/预约列表）。
- 搜索页去掉底部「搜索」CTA；idle 隐藏「查看详情」；空态有「清空关键词」。
- 表单 `datetime-local`、行内客户选择、去掉重复「另一模式」。
- 日历图例、横向滚动、按 `周X` 落列。
- 不再使用隐藏 `.sr-only` 行过 Phase 1；validator 接受真实结构。

## 4. 关键文件

```text
core/design-system/src/semantic-ids.ts
core/compiler/src/compile-page-spec.ts
core/spec-engineer/src/motion-aliases.ts
core/spec-engineer/src/apply.ts
core/spec-engineer/src/gates.ts
core/renderer-html/src/motion.ts
core/renderer-html/src/index.ts
core/visual-review/*
core/agents/src/roles/visual-critic.ts
runtimes/standalone/src/visual/*
runtimes/standalone/src/visual-review-cli.ts
runtimes/standalone/src/visual-baseline-cli.ts
runtimes/standalone/src/visual-sign-cli.ts
dsh/home/profiles/prd-ui-visual/
```

## 5. 复现 / 验证

```bash
cd pipeline
pnpm install
pnpm test
pnpm typecheck
pnpm test:dsh

pnpm phase1:verify --project samples/project.demo-orders-intake.yaml --runs /tmp/final-8p
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/final-emp
pnpm phase1:verify --project samples/projects/employee-app-appointments-03/project.yaml --runs /tmp/final-03
pnpm phase1:verify --project samples/projects/employee-app-phase2/project.yaml --runs /tmp/final-phase2

# 用现有 clean M1 run（/tmp 可能已清理；没有就重跑 intake/M1）
pnpm spec:engineer --project samples/projects/employee-app-phase2/project.yaml \
  --agent-run /tmp/m1-final2/run-2026-10-22T03-16-05-257Z \
  --runs /tmp/spec-v04 --strict-motion
pnpm render:html --run /tmp/spec-v04/<runId> --out /tmp/html-v04

# baseline 只由人运行
pnpm visual:baseline --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v04/<runId> --html /tmp/html-v04 \
  --out pipeline/baselines/employee-app-phase2

# 真实 critic（需要 .env；CLI 不自动加载）
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm visual:review \
  --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v04/<runId> --html /tmp/html-v04 \
  --baseline pipeline/baselines/employee-app-phase2 \
  --runtime dsh --profile prd-ui-visual \
  --runs /tmp/visual-v04 --max-cost-cny 3 --json
```

缓存命中时 `costCny=0`、`cacheHit=true`，不需要 provider key。缓存实体在 `pipeline/.visual-cache/`（gitignored）；证据副本在 `pipeline/artifacts/employee-app-phase2/visual-review/critique-cache.json`。

## 6. 证据位置

- HTML：[`pipeline/artifacts/employee-app-phase2/html/index.html`](../../pipeline/artifacts/employee-app-phase2/html/index.html)
- 24 张截图 + 视觉证据：[`pipeline/artifacts/employee-app-phase2/visual-review/`](../../pipeline/artifacts/employee-app-phase2/visual-review/)
- Baseline：[`pipeline/baselines/employee-app-phase2/`](../../pipeline/baselines/employee-app-phase2/)
- 产物说明：[`pipeline/artifacts/employee-app-phase2/README.md`](../../pipeline/artifacts/employee-app-phase2/README.md)
- 设计：[`docs/superpowers/specs/2026-10-22-v04-motion-visual-regression-design.md`](../specs/2026-10-22-v04-motion-visual-regression-design.md)
- 计划：[`docs/superpowers/plans/2026-10-22-v04-motion-visual-regression.md`](../plans/2026-10-22-v04-motion-visual-regression.md)
- 版本路线：[`docs/superpowers/plans/2026-10-23-version-roadmap.md`](../plans/2026-10-23-version-roadmap.md)

## 7. 已知债务

### v0.4.1（小额补丁，建议下一步）

- today 缺「查看全部」。
- 390px 日历只显示 3 天，缺滚动提示/edge fade。
- reschedule 静态截图上下文（实际点击流程已回填；截图状态表达要补）。
- native `datetime-local` placeholder 文案。
- 日历选中日高亮。
- error 状态保留筛选/视图上下文。

### v0.5（结构视觉 + a11y）

- loading skeleton 完整 12 行 calendar/list 模板。
- empty 状态不要 floating overlay，保留网格/图例/清空筛选。
- form mode pills 与入口模式规则统一。
- a11y 基线：对比度、焦点、键盘、表单 label/错误提示。
- fresh Visual Critic 仍采样；明确“0 blocker + ≤2 major + 人工签核”的停止规则；signed cache 只负责同输入复现。

### Phase 3/4（未开始）

- v0.6：Figma Renderer、Studio、Asset Compiler。
- v0.7：scratch 沙箱、Test Subagent、Handoff Packager。
- v0.8：真实项目试点。
- v0.9：RC。
- v1.0：最终交付与用户视觉终审。

## 8. 坑与约束

- **不要编辑已签核的 clean brief**：`samples/projects/employee-app-phase2/ui-brief.json`。
- **不要提交 `.env`、key、`node_modules`、`/tmp` 产物**；`pipeline/.visual-cache/` 也 gitignored。
- **`--profile prd-ui-visual` 是 Agent runtime profile**，不是设计系统 profile；设计系统看 `page.profile`。
- **dsh profile 使用项目内 `pipeline/dsh/home`**；不要修改 `~/.dsh`。
- **Fresh Visual Critic 有采样波动**；同输入依赖 signed cache 稳定。不要用“再跑一次模型”当作确定性验证。
- **baseline 只由 `visual:baseline` 写**；`visual:review` 不更新 baseline。
- **visual:sign 绑定 manifest/findings hash**；换截图或换 Page Spec 后旧签核会失效。
- 工作树可能有一个无关的未跟踪 `.zcode/plans/...` 文件；不要提交它。
- 本地 commit；不要 push。

## 9. 推荐阅读顺序

1. 本交接文档。
2. `docs/superpowers/plans/2026-10-23-version-roadmap.md`。
3. `docs/superpowers/specs/2026-10-22-v04-motion-visual-regression-design.md`。
4. `pipeline/artifacts/employee-app-phase2/README.md`。
5. 需要改代码时再读 `core/visual-review`、`core/renderer-html/src/motion.ts`、`core/spec-engineer/src/motion-aliases.ts`。

## 10. 下一步建议

先做 **v0.4.1**：只清低风险视觉项，不新增能力；通过截图复核和全量回归后，再开 **v0.5**。v0.5 的 a11y 基线和 critic 停止规则确认后，才进入 Phase 3（v0.6/v0.7）。不要把 v0.4.1 和 v0.5 合并成一个大 spec。
