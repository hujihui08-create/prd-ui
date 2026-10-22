# Clean Phase 2 收尾设计（v0.3.1）

- 日期：2026-10-22
- 状态：Implemented（2026-10-22）
- 输入：Phase 2 出口（带 sample waiver + brief patch）、`employee-app-phase2` 8 页真实 PRD、上一轮遗留项
- 关联：[主设计文档](2026-10-19-prd-to-ui-pipeline-design.md)、[Phase 2 出口设计](2026-10-21-phase-2-exit-per-profile-assets-design.md)、[视觉 v0.1 设计](2026-10-21-visual-fidelity-v01-design.md)

## 0. 结论

Phase 2 出口已经达成，但它是**带 10 条 IA waiver + 一次手工 brief patch** 的验收。本设计把“带 waiver 通过”推进到“干净可复现”：

1. **0 手工 patch**：Briefer 直接生成合规 brief；gate 用 blocker 强制 home/host/state/form 规则，修复走模型 gate-repair，不再人工改 brief。
2. **只保留 ≤3 条真实切片边界 waiver**：工作台/我的/客户 Tab 根页、服务完成入口、库管宿主落地；其他 IA blocker 必须在 PRD/brief 层解决。
3. **三项真实交互**：detail 业务状态动作栏、form new/reschedule mode、日历/客户搜索交互；用轻量 vanilla JS，不引入框架。
4. **交付仍是单文件 HTML**：可直接打开、截图；不改变 Phase 2 的静态交付形态。

本设计**不重定义** Phase 2 出口；它是在原出口已达成的基础上做 v0.3.1 干净收尾。

## 1. 现状与问题

| 项 | 现状 | 问题 |
|---|---|---|
| Phase2 brief | intake 成功，但 today fields/actions、notice route、warehouse create、host create action 被手工 patch | brief hash 与签核不一致；不可复现 |
| IA | IA-001..IA-010 以 sample waiver 通过 | 角色/动作/路由/picker 上下文未真正解决 |
| detail | 默认展示“已登记”动作；状态不驱动动作栏 | 已到店只剩开单、爽约/取消只读不可验收 |
| form | 单主 CTA + “另一模式”提示 | 没有 new/reschedule、appointmentId、深链恢复 |
| list | 日历/列表同页静态展示 | 不能切换、点空格、点块 |
| search | 静态结果行 | 无 idle、无输入过滤 |
| 测试 | 510 tests，但无完整 Phase2 E2E 脚本 | 干净 intake 仍依赖手工 run |

## 2. 契约：显式交互元数据

### 2.1 `UiBriefPage` 新增可选字段

```ts
businessStates?: Array<{
  name: string;          // 业务状态名，例如 已登记 / 已到店 / 爽约 / 已取消
  actions: string[];     // 该状态允许的动作，必须是 page.actions 的子集
  note?: string;         // 只读说明，例如「本单已取消」
}>;

formModes?: Array<{
  name: "new" | "reschedule";
  label: string;         // 例如 新增预约 / 改期
  actions: string[];     // 必须是 page.actions 的子集
  customerLocked?: boolean;
}>;

views?: Array<"calendar" | "list">;
defaultView?: "calendar" | "list";
searchIdleTitle?: string;
```

约束：

- `businessStates` 只用于 `detail`（含 mobile detail）；`formModes` 只用于 `mobile-form`。
- `views` 只用于 `mobile-list`，且页面必须有 `time` 或 `date` 字段；`defaultView` 必须在 `views` 内。
- `businessStates[].actions` / `formModes[].actions` 必须是 `page.actions` 的子集；gate 发现未知 action 直接 blocker。
- 所有字段可选，旧 brief 不需要迁移。

### 2.2 确定性默认值（减少模型波动）

Briefer 应生成这些字段；但以下默认值由 compiler/gate 提供，避免因模型漏字段产生假 blocker：

| 页面条件 | 默认 |
|---|---|
| `mobile-list` 有 `time/date` 且未声明 `views` | `views=["calendar","list"]`，`defaultView="calendar"` |
| `mobile-form` 同时有 `保存` 和 `保存改期` 动作 | `formModes=[new: 保存, reschedule: 保存改期, customerLocked reschedule]` |
| 有 `keyword`/`search` filter 的 mobile-list | `searchIdleTitle="输入姓名或脱敏手机号搜索客户"` |

`businessStates` **没有默认值**：detail 页有 `status` 字段时，Briefer 必须从 PRD 状态矩阵生成；缺失是 blocker。

### 2.3 Briefer prompt

新增映射规则：

- detail 页：从 PRD 的“状态与动作”矩阵生成 `businessStates`；每个状态的 actions 必须是页面 actions 的子集；只读状态写 `note`。
- form 页：从新增/改期规则生成 `formModes`；reschedule 必须 `customerLocked=true`，并记录 `appointmentId` 查询参数契约。
- 双维度列表：生成 `views` / `defaultView`；日历页必须有 `time/date` 字段。
- 搜索页：生成 `searchIdleTitle`，并说明默认不返回客户列表。
- home 页：`fields` 必须为空，content 元数据只放 `content`；不要把 quick action 或行导航写进 `actions`。
- 不得生成宿主动作（“前往客户 Tab / 工作台 / 我的”）。
- 不得把 content 元数据（storeName/hasMessage/empty titles）写进 `fields`。

### 2.4 Brief gate 新增检查

| code | severity | 条件 |
|---|---|---|
| `BRIEF_HOME_FIELDS` | blocker | home 页 `fields` 非空或 `actions` 非空 |
| `BRIEF_HOST_ACTION` | blocker | action 含“前往客户 Tab/工作台/我的”等宿主跳转 |
| `BRIEF_BUSINESS_STATES_MISSING` | blocker | detail 页有 `status` 字段且 `actions` ≥2，但没有 `businessStates` |
| `BRIEF_BUSINESS_STATE_ACTION_UNKNOWN` | blocker | `businessStates[].actions` 不在 `page.actions` |
| `BRIEF_FORM_MODE_ACTION_UNKNOWN` | blocker | `formModes[].actions` 不在 `page.actions` |
| `BRIEF_VIEW_WITHOUT_TIME` | blocker | 声明 `views` 但页面没有 `time/date` |
| `BRIEF_SEARCH_IDLE_MISSING` | warning | 有 keyword/search 但未声明 idle 标题 |

Gate-repair 使用这些 finding 重新调用 Briefer；最多 2 轮。超过 2 轮仍是 blocker 时，停止并报告，不手工 patch。

### 2.5 Clean intake 与 waiver 政策

- 项目：`samples/projects/employee-app-phase2`，8 页，纯 mobile。
- “0 patch” = **不手工编辑 brief**；允许 Briefer 在 gate-repair 轮里模型重写，但最终产物必须由 intake 直接生成并签核。
- 重跑真实 dsh intake；**不手工编辑 brief**。
- 允许的 waiver 最多 3 条，且只能是宿主边界：
  1. 工作台/我的/客户 Tab 根页不在 8 页切片；
  2. 服务完成入口属于宿主流程；
  3. 库管宿主落地/工作台入口不在切片。
- 其他 IA blocker 必须在 PRD/brief 层修复；不允许用 waiver 掩盖角色/动作/路由/picker 问题。
- 成功标准：brief gate passed、当前 brief 的 hash 与 signoff 一致、0 手工 diff。

## 3. Renderer：轻量 vanilla JS

### 3.1 数据属性

Compiler 在 Page Spec 中保留 `businessStates` / `formModes` / `views` / `defaultView` / `searchIdleTitle`，并在 HTML 上写 `data-*`：

| 页面 | data 属性 |
|---|---|
| detail | `data-business-states`（JSON）、`data-current-status`、`data-customer-href`、`data-notice-href`、`data-form-href`、按钮 `data-action` |
| form | `data-form-modes`（JSON）、`data-current-mode`、`data-customer-field`、`data-appointment-id` |
| mobile-list | `data-views`、`data-default-view`、`data-view-toggle`（calendar/list）、`data-create-href`、`data-detail-href` |
| search | `data-search-input`、`data-search-idle`、行 `data-search-text` |

- `data-create-href` / `data-detail-href` / `data-customer-href` / `data-notice-href` / `data-form-href` 由 compiler 从 brief 中对应 archetype 的页面 route 推导；没有目标页时省略，JS 显示提示。
- 日历块点击使用只读详情抽屉；`data-detail-href` 只用于列表行/块的显式详情入口，不强制跳页。
- `data-view-toggle` 是日历/列表切换按钮；`data-views` 是允许的视图集合。

### 3.2 JS 行为

- **detail**：
  - 初始 status 取 `mockData.values.status`（缺省第一个 business state）。
  - 只渲染/显示当前状态允许的 actions；其他 action 隐藏。
  - 点“已到店确认/接单并确认到店” → status=已到店，更新徽标，收敛动作条。
  - 点“取消” → `confirm()` 后 status=已取消，隐藏操作栏，显示 note。
  - 点“改期” → 跳 `data-form-href?mode=reschedule&appointmentId=<id>`。
  - 点“术后告知”/“客户详情” → 使用 `data-notice-href` / `data-customer-href` 或提示。
- **form**：
  - 读 `?mode=new|reschedule`；缺省 new。
  - new/reschedule 切换 CTA 与客户字段锁定；reschedule 显示 appointmentId。
  - 提交仅做原型提示（不写后端）；不伪造成功数据。
- **mobile-list**：
  - 日历/列表切换按钮显示/隐藏两个视图。
  - 日历空格点击 → `appointment-form.html?mode=new&date=<date>&time=<time>`；无目标页时提示。
  - 日历块点击 → 打开只读详情抽屉（客户/项目/时间/状态），不伪造路由。
- **search**：
  - 输入过滤 `data-search-text`；无输入显示 idle；无匹配显示 empty；清空按钮复位。
- 脚本内联在 `renderDocument` 中，约 150 行，无第三方依赖；没有 data 属性的页面不执行任何逻辑。

### 3.3 兼容性

- PageShell 页面不注入交互逻辑；现有 8 页 Web 页面不受影响。
- 2 页 employee-app、4 页 03 切片保持现有行为；detail 有 businessStates 时才启用状态动作，否则回退当前动作栏。
- 现有 `?state=` 预览切换器继续保留；业务状态由页面内动作驱动，不替代 loading/error 预览。

## 4. 验收

### 4.1 Clean intake

- 真实 dsh intake：8 页、PRD readiness ready、brief gate passed。
- **0 手工 patch**；`ui-brief.json` 的 hash 与 brief signoff 一致。
- IA waiver ≤3，且只覆盖宿主边界；不得有角色/动作/路由/picker blocker。
- 成本记录：`--max-cost-cny 3`。

### 4.2 M1 / Spec / HTML

- M1：`ia:waived`（仅宿主边界）/ `interaction:passed` / `visualStyle:passed`；`agent:sign` 后 success。
- Spec Engineer：8 Page Specs、0 blockers；`businessStates/formModes/views` 出现在 Page Spec。
- `render:html`：8 页 + index；`phase1:verify` 8/0。
- Asset review：沿用 4 个标准图标，`4/4 passed`。

### 4.3 交互验收（Playwright）

- search：输入“张”过滤到张女士；清空恢复 idle；无匹配显示 empty。
- list：日历/列表切换；点空格跳到 form 并带 date/time；点块打开详情抽屉。
- form：new/reschedule 切换；reschedule 客户锁定并显示 appointmentId；CTA 文案变化。
- detail：已登记显示全部允许动作；点“已到店确认”后只剩开单/术后告知；点“取消”后只读说明；爽约/已取消无操作栏。
- 截图归档到 `pipeline/artifacts/employee-app-phase2/`。

### 4.4 回归

- `pnpm test` 510+ passed；typecheck clean；`test:dsh` 2 passed。
- Phase 1：8 页 / 2 页 / 4 页 / 8 页全部 0 blockers。
- 本地 commit；不 push。

## 5. 非目标

- motion 进 HTML、稳定 node id、Visual Critic、自动截图 diff/CI（v0.4）。
- Studio、Asset Compiler。
- Phase 3 Figma/沙箱/Handoff、Phase 4 真实项目验收。
- 品牌插画/图片资产。
- React 或前端框架迁移；交互只用轻量 vanilla JS。
- 真实后端提交；form/list 交互是原型行为，不伪造成功。

## 6. 风险与处理

| 风险 | 处理 |
|---|---|
| 模型仍生成 home fields/host action/缺 businessStates | gate blocker + 2 轮 gate-repair；仍失败则停止报告，不手工 patch |
| businessStates 与 PRD 状态矩阵不一致 | Briefer 必须引用 PRD；gate 校验 action 子集；人工 review brief |
| JS 与静态 state switcher 冲突 | 交互逻辑只在有 data 属性的页面启用；保留 `?state=` 预览 |
| 日期/块点击无目标页 | compiler 省略 href，JS 显示“当前切片无目标页”提示，不伪造跳转 |
| 0 patch 目标导致多次真实 run | 每次 `--max-cost-cny 3`；记录成本；最多 2 次 intake 重跑，超出则复盘 prompt/gate |
| 8 页切片仍有宿主边界 | 只允许 3 条 waiver；新增边界必须写进 PRD slice boundary，不扩大 waiver |

## 7. 实施顺序

1. 契约：`UiBriefPage` 新字段 + schema + gate 检查 + 单测。
2. Briefer prompt 规则 + 03/phase2 fixtures 更新。
3. Compiler：businessStates/formModes/views/search 的 data 属性 + 默认值 + 单测。
4. Renderer：内联 JS + data 属性 + renderer 测试。
5. 重跑 clean intake；0 patch，≤3 waiver。
6. M1 → Spec → HTML → Phase 1 → Playwright 交互验收。
7. 归档 artifacts、更新主文档/CHANGELOG/README/AGENTS/交接、全量回归、本地 commit。

## 8. 完成定义

本 spec 完成 = **v0.3.1 clean Phase 2 收尾**：

- 0 手工 brief patch；
- IA waiver ≤3 且仅宿主边界；
- 8 页 HTML 具备状态动作、form mode、日历/搜索真实交互；
- 510+ tests、typecheck、test:dsh、4 个项目 Phase 1 全绿；
- 文档与 artifacts 更新；
- 本地 commit（不 push）。

v0.4（motion/视觉回归）与 Phase 3/4 不在本 spec。

## 9. 实现结果（2026-10-22）

Clean intake 与后续链路全部在 `employee-app-phase2` 8 页真实 PRD 上跑通，**0 waiver、0 手工 brief patch**。

| 阶段 | Run | 结果 |
|---|---|---|
| intake | `run-2026-10-22T03-09-28-544Z` | `success`；8 页全 `b-mobile`；PRD/IA gate passed（0 blockers、0 waivers）、brief gate passed；brief hash `sha256:b558b57a5876bdabdd268f05d355876f84b1f675d668f561db253b3c3b0b8335`；0 手工 brief edits；一次 PRD/IA 答案（PRD-005：日历 09:00–20:00 / 60 分钟粒度）；¥0.8977902624，`usageComplete=true` |
| M1 | `run-2026-10-22T03-16-05-257Z` | `success`；`gates={ia:passed, interaction:passed, visualStyle:passed}`；0 waivers；visual-style 通过 `agent:sign` 签核（无模型调用）；¥0.4399832736（IA ¥0.1676724192 + interaction ¥0.2259093024 + visual-style ¥0.046401552），`usageComplete=true` |
| Spec Engineer | `run-2026-10-22T03-23-54-618Z` | 8 Page Specs、0 blockers、36 warnings（34 `SPEC_MOTION_NODE_UNRESOLVED` + 2 `SPEC_ASSET_UNUSED`）；assets missing 无，referenced `icon-plus` / `icon-search` |
| HTML | — | 8 页 + `index.html`；`phase1:verify` `8 pages / 0 blockers` |
| Playwright | — | 搜索 idle/张/清空/无匹配；日历/列表切换；空格 → form 带 date/time；抽屉 → 查看完整详情；列表行/查看完整详情 → detail；form new/reschedule CTA + 客户锁定；detail 已到店/取消/爽约；告知确认（确认人/确认时间）；19 张截图 |

- 回归：529 tests passed、typecheck clean、`pnpm test:dsh` 2 passed；Phase 1 `8/2/4/8` 全部 0 blockers。
- 成本：最终链路 ¥1.337773536（intake + M1）；含早前重试共 ¥2.935835885。
- 产物归档在 `pipeline/artifacts/employee-app-phase2/`，无 `/tmp` 或 `/Users` 绝对路径。

### v0.4 债务

- customer picker 未接入静态 renderer：PRD/brief 声明的 form → customer-search `mode=picker` 流程没有链接路由/绑定。
- 日历空格预填只有 day-of-month（`03 09:00`），不是 PRD 要求的完整 `YYYY-MM-DD`。
- M1 `interaction-spec.json` 的 `cd.new-appointment` 仍写“预填并锁定客户”，与已签核 brief/PRD/renderer（new 可编辑、仅 reschedule 锁定）冲突；按评审证据保留不改，留给 v0.4 对齐 prompt/schema。
- 34 条 motion node warning 是 v0 预期（compiler 无稳定 node id）；2 条 unused asset brief（`icon-home`、`icon-user`）。
- asset review 未在本轮重跑，`asset-review/` 仍是 2026-10-21 的项目资产证据（README 与 `evidenceScope` 已标注）。
- 爽约/已取消仍保留只读“客户详情”导航；底部业务动作栏已隐藏。
