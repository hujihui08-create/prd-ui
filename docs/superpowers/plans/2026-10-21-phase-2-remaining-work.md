# Phase 2 剩余工作实施计划

- 日期：2026-10-21
- 状态：Planned（未开始）
- 输入：8 页 Renderer/Mock Data/视觉修复已完成（`docs/superpowers/specs/2026-10-21-8page-renderer-mockdata-visual-fixes-design.md`）
- 目标：把“8 页 sample 能跑 + 手工视觉巡检通过”推进到“真实 PRD 可重复跑通、资产/视觉/动效可验收”。

> **For agentic workers:** 按任务顺序执行；每个任务先补失败测试/验收用例，再实现。不要把多个任务混成一个 commit。

## 0. 当前基线

- 488 tests、typecheck clean、`pnpm test:dsh` 2 passed。
- `samples/project.demo-orders-intake.yaml`：Phase 1 `8 pages / 0 blockers`。
- 真实 dsh 8 页 M1：`ia:waived / interaction:passed / visualStyle:passed`，`agent:sign` 后 `success`，成本 ¥0.3298。
- Spec Engineer：8 Page Specs，0 blockers，27 warnings（26 motion node + asset briefs missing）。
- Renderer：8 页 + index；PageShell/MobileShell/通用组件/mockData/fieldLabels 已实现。
- 手工 Playwright 视觉巡检通过；employee-app 2 页产物已刷新。

## 1. 优先级

| 优先级 | 任务 | 是否阻塞真实 PRD |
|---|---|---|
| P0 | 0. 提交当前 audit 修复 | 否，但必须先冻结 |
| P0 | 1. Briefer 自动生成 mockData/fieldLabels | 是（否则新项目仍是骨架/英文） |
| P0 | 2. M1 per-profile catalog/motion 输入 | 是（混合 profile 项目质量） |
| P1 | 3. 8 页 asset briefs + asset review | Phase 2 完整度 |
| P1 | 4. 真实 PRD 端到端验收 | Phase 2 出口 |
| P2 | 5. Motion HTML + 稳定 node id | v0.1，不阻塞静态 HTML |
| P2 | 6. 自动截图 diff / 视觉回归 | CI 质量 |
| 后续 | 7. Figma/Studio/Handoff | Phase 3 |

---

## Task 0: 提交当前 audit 修复

**原因**：renderer/compiler/contracts/validators/sample/文档改动约 34 个文件未提交，必须与后续任务分开。

- [ ] `git status` 确认无 `.env`/密钥/`node_modules`/`.playwright-mcp` 进入暂存。
- [ ] `pnpm test`、`pnpm typecheck`、`pnpm test:dsh` 再跑一次。
- [ ] 提交一个 commit：`feat(renderer): generalize 8-page shells, mock data, and field labels`。
- [ ] 按需 push；不要改写已推送历史。

**验收**：工作区干净；commit 包含 renderer/compiler/contracts/validators/sample/artifacts/docs/tests。

---

## Task 1: UI Briefer 自动生成 mockData/fieldLabels

**问题**：真实 briefer 只生成字段 id、状态、页面结构；不生成 `mockData`/`fieldLabels`。8 页 sample 是人工补齐，换真实 PRD 会退回骨架/英文标签。

**Files:**
- Modify: `pipeline/core/agents/src/roles/ui-briefer.ts`
- Modify: `pipeline/samples/agents/intake/ui-briefer.json`
- Modify: `pipeline/samples/agents/intake-employee-app/ui-briefer.json`
- Test: `pipeline/runtimes/standalone/tests/intake-cli.test.ts`（或新增 briefer contract test）
- Docs: `pipeline/docs/prd-review-briefer.md`

**Prompt 规则：**

- 对 list/detail/detail-mobile 页面，从 PRD 的验收示例/字段表/示例数据生成 `mockData.rows`/`mockData.values`；
- 对 overview 页面生成 `mockData.listItems`；
- 对 feed 页面生成 `feedItems`；
- 所有字段生成 `fieldLabels`（中文优先；PRD 没有中文名时用自然英文标题）；
- 明确标注 mock 数据是示例，不得包含真实 PII/手机号；
- 不因为缺少示例数据而编造业务规则；缺失时写 question/assumption。

**验收：**

- 8 页 scripted briefer fixture 产出非空 rows/values/listItems/feedItems/fieldLabels；
- `phase1:verify` 8/0；
- 8 页 HTML 不再出现 “请配置 feedItems”/纯英文标签；
- 真实 dsh briefer 一次 8 页 run 产出至少 orders-list rows、order-detail values、fieldLabels；成本 <¥1；
- 新增 `BRIEF_MOCK_DATA_MISSING` warning（可选）：list/detail 页面没有 mockData 时提示，不阻断；如果决定阻断，需同步设计文档。

**风险：**

- LLM 编造订单/客户数据：要求从 PRD 示例派生，统一用“示例客户/示例订单”或 PRD 原文值。
- 输出变大：8 页 briefer 已在 65536 profile 下运行；如超限，按页分组生成。

---

## Task 2: M1 per-profile catalog/motion 输入

**问题**：`agent:run` 只传 `brief.meta.profile` 一个 catalog 和 motion token 集。8 页 brief 同时使用 `b-dense`/`c-expressive`，移动页实际拿到 b-dense 的 catalog/motion；本次通过但有质量风险。

**Files:**
- Modify: `pipeline/runtimes/standalone/src/agent-cli.ts`
- Modify: `pipeline/core/agents/src/roles/interaction.ts`
- Modify: `pipeline/core/agents/tests/run-m1.test.ts`（或新增 prompt test）
- Docs: `pipeline/docs/agent-m1.md`

**接口建议：**

```ts
interface InteractionPromptInput {
  // ...existing
  catalogs?: Record<string, unknown>;      // profile -> catalog
  motionTokensByProfile?: Record<string, unknown>;
}
```

- CLI 收集 brief 页面使用到的 profiles，传 `catalogs`/`motionTokensByProfile`；
- prompt 中按 profile 展示 catalog 摘要，要求 interaction spec 按页面 profile 取组件/动效；
- 保持单 profile 兼容：只有 `catalog`/`motionTokens` 时行为不变。

**验收：**

- 单 profile employee-app 回归不变；
- 8 页 mixed-profile run 的 interaction prompt 含 b-dense + c-expressive 两套 catalog/motion；
- 真实 dsh 8 页 M1 可重跑，interaction gate passed；成本记录；
- 新增测试断言 prompt 包含多个 profile。

**风险：**

- Prompt 变长：只传 profile 摘要，不传完整 catalog。
- 重跑成本：约 ¥0.33；可在 Task 1 之后一起跑一次。

---

## Task 3: 8 页 asset briefs + asset review

**问题**：8 页 M1 的 `assetBriefs=[]`；Spec Engineer 报 `SPEC_ASSET_BRIEFS_MISSING`；8 页 asset review 未跑。当前图标走 Material Symbols/占位图，视觉可看但不是完整资产链路。

**Files:**
- Modify: `pipeline/core/agents/src/roles/visual-style.ts`（如需强制 asset briefs）
- Modify: `pipeline/samples/projects/demo-orders-intake/ui-brief.json`（assets 清单）
- Use: `pipeline/runtimes/standalone/src/asset-cli.ts`（asset:review）
- Tests: `pipeline/core/agents/tests/run-m1.test.ts`、`pipeline/runtimes/standalone/tests/asset-cli.test.ts`
- Docs: `pipeline/docs/asset-review-m0.md` / `agent-m1.md`

**步骤：**

1. 明确 8 页需要哪些资产：标准图标（订单、列表、设置、首页、商品、登录等）走 A 库；插画/图片按 PRD 是否需要。
2. Visual Style Agent 输出对应 `assetBriefs`；如果 brief 没有 assets，则显式记录“无自定义资产”并允许 gate pass。
3. 用 M0 `asset:review` 对 8 页 asset briefs 跑 standalone，再跑真实 dsh（如果 key/资产可用）。
4. 把 asset briefs 接到 Spec Engineer；验证 `assets.referenced/missing` 和 `SPEC_ASSET_UNUSED`。
5. 如果资产缺失，走 placeholder/降级，记录 degraded，不伪造通过。

**验收：**

- 8 页 M1 输出非空 asset briefs（或显式“无自定义资产”记录）；
- `asset:review` 8 页 briefs 全部 pass/waived；
- Spec Engineer 不再报 `SPEC_ASSET_BRIEFS_MISSING`，或该 warning 有明确理由；
- 8 页 HTML 使用真实资产或明确 placeholder；
- 真实 dsh 成本/usage 记录。

**风险：**

- 8 页 sample 没有真实品牌资产；A 库能覆盖标准图标，插画可能需要 placeholder。
- 资产评审会引入真实成本；默认 10 CNY 上限。

---

## Task 4: 真实 PRD 端到端验收

**问题**：目前所有 8 页验收都基于 sample PRD；Phase 2 出口要求真实 PRD 生成 6–8 页 HTML。

**前提：**

- 拿到一份真实 PRD（至少包含页面清单、角色权限、状态矩阵、字段表、验收示例）；
- 或明确用 sample PRD 作为替代，并在验收记录中标注。

**步骤：**

1. 新建项目配置/PRD；`pnpm intake:run` 产出 PRD review + IA + brief；人工处理 blocker/waiver。
2. PRD/IA 与 brief 签核；发布 `ui-brief.json`。
3. `agent:run --runtime dsh --profile prd-ui-intake`；处理 IA/visual signoff。
4. `spec:engineer` → Page Specs。
5. `render:html` → 6–8 页 HTML + index。
6. Phase 1/语义校验、视觉巡检、资产评审、成本记录。
7. 更新 README/AGENTS/CHANGELOG 的“真实 PRD 证据”。

**验收：**

- 真实 PRD 产出 6–8 页 HTML；
- 0 blockers 或全部 waiver 有 owner/reason/expiry；
- 视觉巡检通过（web/mobile、空/加载/错误态）；
- 成本低于 10 CNY，usageComplete=true；
- 不修改 PRD 原文、不伪造数据/资产。

**风险：**

- 真实 PRD 质量不足：按主设计 PRD Review Gate 阻断/追问，不放宽。
- 真实 PRD 页型超出 10 个 archetype：记录扩展需求，不硬套。

---

## Task 5: Spec Engineer v0.1 — motion HTML + 稳定 node id

**问题**：Page Spec 已携带 `motion`，renderer 尚未消费；motion binding node id 未解析，26 个 `SPEC_MOTION_NODE_UNRESOLVED` warning。

**Files:**
- Modify: `pipeline/core/compiler/src/compile-page-spec.ts`（稳定 node id）
- Modify: `pipeline/core/renderer-html/src/index.ts`（motion presets → CSS vars/classes/data attributes）
- Modify: `pipeline/core/spec-engineer/src/gates.ts`（node unresolved 升级为 blocker）
- Tests: renderer/spec-engineer/compiler

**步骤：**

1. 给 compiler 产出的关键节点稳定 id（pageId + semantic path），与 M1 nodeId 对齐策略明确。
2. renderer 读取 `spec.motion.presets/bindings/reducedMotion`，生成 CSS variables/classes；`prefers-reduced-motion` 走 fallback。
3. 无法解析的 binding 从 warning 升级为 blocker（在稳定 id 落地后）。
4. 8 页 HTML 动效巡检；确认 reduced-motion。

**验收：**

- 8 页 HTML 至少有 page-enter/list/press/state 动效；
- `SPEC_MOTION_NODE_UNRESOLVED` 降为 0 或明确剩余原因；
- reduced-motion fallback 正确；
- 现有 2 页/8 页回归不退化。

**风险：**

- 稳定 id 是跨 compiler/agents 的契约变更，需谨慎；可先保留 warning 兼容一轮。

---

## Task 6: 自动截图 diff / 视觉回归

**问题**：视觉验收是手工 Playwright；没有 CI 门禁。

**步骤：**

1. 固定 viewport/字体/设备像素比（1440×1000 web，390×844 mobile）。
2. 对 8 页 + index + default/empty/loading/error 生成 baseline PNG。
3. 用 Playwright 截图 + pixel diff（阈值/忽略区域）；输出 diff 图和报告。
4. 接入 `pnpm test:visual`（默认不跑，CI/手动）；失败 exit 1。
5. 明确 flaky 策略：字体加载等待、网络关闭、动画禁用。

**验收：**

- 一条命令生成/比较 8 页截图；
- 默认 baseline 与当前 HTML 一致；
- 有意变更需显式更新 baseline；
- 不把视觉 diff 混入默认 `pnpm test`。

---

## Task 7: Phase 3（不在本计划）

- Figma Renderer / 写回 / 结构 diff；
- scratch 沙箱 / 测试 Subagent / 录屏 + trace；
- Handoff bundle；
- Studio / 多用户 / 远程服务。

---

## 推荐执行顺序

1. Task 0（提交）
2. Task 1（briefer mockData/fieldLabels）
3. Task 2（M1 per-profile）
4. Task 3（asset briefs/review）
5. Task 4（真实 PRD 全链路）
6. Task 5（motion v0.1）
7. Task 6（视觉回归）
8. Task 7（Phase 3）

## 总体验收

- 真实 PRD 6–8 页 HTML，0 blockers/有效 waiver；
- brief 自动带 mockData/fieldLabels；
- M1 支持 mixed profile；
- 8 页 asset review 通过；
- 视觉巡检/自动 diff 通过；
- 488+ tests、typecheck、test:dsh、2 页/8 页回归不退化；
- 所有真实 dsh 成本与 usage 有记录，key 不提交。
