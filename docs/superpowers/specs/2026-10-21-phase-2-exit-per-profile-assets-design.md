# Phase 2 出口设计：per-profile M1 + 资产链 + 8 页真实 PRD

- 日期：2026-10-21
- 状态：Implemented（Phase 2 出口达成；sample waiver）
- 输入：[主设计文档](2026-10-19-prd-to-ui-pipeline-design.md)、[Phase 2 剩余工作计划](../plans/2026-10-21-phase-2-remaining-work.md)、03 真实 PRD 切片、00–09 员工端 PRD 十册
- 范围决定：
  - 出口 = **Phase 2 出口**；Studio、Asset Compiler 明确后置，不阻塞本出口。
  - 真实 PRD = 从 00–04 拼 **8 页**，纯 mobile。
  - 资产 = **标准图标 + 占位**；不引入品牌插画/图片。
  - per-profile = 用现有 8 页 demo-orders sample（b-dense + c-expressive）验收；真实 PRD 保持纯 mobile。

实现证据（2026-10-21）：

- per-profile 8 页 demo-orders 真实 run：prompt 含 b-dense + c-expressive，interaction passed，¥0.5105。
- Phase2 intake：8 页、PRD readiness ready、brief gate passed、publish，¥0.5249；IA-001..IA-010 sample waivers。
- Phase2 M1：`ia:waived / interaction:passed / visualStyle:passed`，`agent:sign` success，¥0.4355；4 个标准 asset briefs。
- Asset review：`asset:review --briefs` `4/4 passed`。
- Spec Engineer：8 Page Specs / 0 blockers / 20 warnings；assets referenced=2 / unused=2 / missing=0。
- HTML 8 页 + index；Phase 1 `8 pages / 0 blockers`；Playwright 截图归档。
- 限制：Phase 2 出口依赖 sample IA waivers 和一次确定性 brief patch（home fields、notice route、warehouse create role、host create action）；下一轮应重跑 intake 让 briefer 直接生成合规 brief 并重新签核。

## 0. 结论

本设计把 Phase 2 从“8 页 sample 能跑 + 03 四页切片”推进到“真实 PRD 8 页可重复跑通、per-profile 有真实证据、资产链有 pass/degraded 记录”：

1. **per-profile M1** 只做输入增强：新增两个可选 map，保留单 profile 路径；不改 `runM1` 状态机。
2. **资产链** 用确定性 inventory 从 brief 推导标准图标，再交给 Visual Style 生成 `AssetBrief`；A 库覆盖不到的图标记录 placeholder/degraded。
3. **8 页真实 PRD** 新建独立 sample，补齐 `mobile-list` SearchBar 和 Briefer 的 `home` content 生成。
4. **Phase 2 出口** 同时验收 per-profile（demo-orders）和真实 PRD（employee-app-phase2）；不把 Studio/Asset Compiler 算进本出口。

## 1. per-profile M1

### 1.1 契约

```ts
interface InteractionPromptInput {
  // existing
  catalog?: unknown;
  motionTokens?: unknown;
  // new, optional
  catalogsByProfile?: Record<string, unknown>;
  motionTokensByProfile?: Record<string, unknown>;
}

interface M1RunInput {
  // existing
  catalog?: unknown;
  motionTokens?: unknown;
  // new, optional
  catalogsByProfile?: Record<string, unknown>;
  motionTokensByProfile?: Record<string, unknown>;
}
```

- `catalog` / `motionTokens` 继续表示 `brief.meta.profile` 的单 profile 输入。
- 两个 map 只在 brief 使用多个 profile 时由 CLI 传入；单 profile 时保持现有行为。
- CLI 只传 **catalog 摘要**，不传完整 catalog，避免 prompt 膨胀。

### 1.2 prompt

`buildInteractionPrompt` 在 map 存在且 profile 数 > 1 时增加：

- `## Page profiles (data)`：`{ pageId, profile }`。
- `## Profile catalogs (data)`：每个 profile 的摘要：
  - `meta.library`
  - `components: [{ id, category, props: keys, slots: keys, variants, states }]`
- `## Motion tokens by profile (data)`：每个 profile 的 `duration` / `easing`。
- 硬规则：**“For each page, use only the components and motion tokens from that page's profile. Do not mix profile catalogs or tokens.”**

单 profile / 未传 map 时，继续输出现有 `## Component contracts` 和 `## Motion tokens` 段，保证回归。

### 1.3 CLI

`runtimes/standalone/src/agent-cli.ts`：

```ts
const profiles = [...new Set(brief.ia.pages.map((page) => page.profile))];
const catalogsByProfile = Object.fromEntries(
  profiles.map((profile) => [profile, getCatalog(profile)])
);
const motionTokensByProfile = Object.fromEntries(
  profiles.map((profile) => {
    const definition = getProfile(profile);
    return [profile, {
      duration: definition.motion,
      easing: { standard: "ease-out", emphasized: "cubic-bezier(0.2, 0, 0, 1)" },
    }];
  })
);
```

- 同时保留 `catalog` / `motionTokens`（`brief.meta.profile`）以兼容单 profile。
- 任一页面 profile 不存在时，`getProfile` / `getCatalog` 在启动阶段抛错，不静默回退。

### 1.4 验收

- prompt 单测：mixed brief 的输出包含两个 profile 名、page-profile 映射、两套 catalog 摘要和“不得混用”规则；单 profile 输出仍含原有 catalog/tokens 段。
- `runM1` 单测：捕获 Interaction runner 收到的 prompt，断言包含两个 profile。
- 真实 dsh：现有 8 页 `samples/project.demo-orders-intake.yaml`（b-dense + c-expressive），interaction gate passed；成本记录。
- employee-app 2 页单 profile 回归不退化。
- 限制：per-profile 由 prompt 约束；现有 Interaction gate 仍校验 action/state/motion 语法，不校验组件/token 的 profile 归属。后续可加确定性 provenance gate，本 spec 不把它算作已实现。

## 2. 资产链

### 2.1 确定性 inventory

新增 `deriveStandardAssetInventory(brief)`（放在 `core/agents`）：

- 从页面 archetype、actions、navigation、`content.quickActions`、`emptyAssetRef` 推导标准图标语义 id。
- 合并 brief 已有的 `assets.icons`，去重。
- 只输出 `icons`；`illustrations` / `images` 保持空，由 Visual Style 明确 placeholder。
- 不修改已签核 brief；inventory 只作为 Visual Style 的输入副本。

### 2.2 A 库能力映射

| 语义 | A 库 id |
|---|---|
| home / today | icon-home |
| package / inventory | icon-package |
| search | icon-search |
| plus / add / new | icon-plus |
| minus / remove | icon-minus |
| back | icon-chevron-left |
| next / forward | icon-chevron-right |
| alert / error | icon-circle-alert |
| refresh / retry | icon-refresh-cw |
| user / customer | icon-user |

- 映射不到的语义图标不进入 asset briefs，记录到 `placeholders` / degraded。
- Standard inventory 只承诺这套 A 库图标；8 页真实 PRD 不引入品牌插画。

### 2.3 Visual Style 与 asset review

- Visual Style prompt 接收 enriched `assets.icons`，对每个 id 输出一个 `AssetBrief`：
  - `kind=icon`、24x24、svg、currentColor、noText。
  - `sourceChain` 以 `library` 开头；`sourceHint` 使用 A 库语义。
  - 无品牌素材时在 constraints 记录 neutral baseline。
- `asset:review` 增加 `--briefs <dir>`（默认 `<assets>/briefs`），直接消费 M1 的 `asset-briefs/`；A 库/风格/policy 仍来自 `--assets samples/assets/m0`。
- `asset:review` 对映射图标跑 A 库硬门禁：
  - 映射图标必须 pass。
  - placeholder 记录为 degraded，不算 pass，也不伪造 pass。
- 验收产物：`asset-review.json` + manifest 中能看到 pass 与 degraded 的明确记录。

### 2.4 验收

- inventory 单测：8 页 demo-orders/真实 PRD 的图标推导稳定、去重、顺序确定。
- Visual Style prompt 单测：enriched icons 全部出现在 prompt。
- asset review 单测：mapped icon 通过；未知/placeholder 走 degraded，不产生假 pass。
- 真实 dsh：8 页真实 PRD 的 asset briefs 至少覆盖标准图标；asset review 有 pass/degraded 记录。

## 3. 8 页真实 PRD

### 3.1 项目

新建 `samples/projects/employee-app-phase2/`：

```text
project.yaml
prd.md                 # 00–04 拼 8 页的真实 PRD 摘要，原文件不改
asset-manifest.b-mobile.json
ui-brief.json          # intake 发布
```

### 3.2 页面矩阵

| # | 页面 | id | archetype | 来源 |
|---|---|---|---|---|
| 1 | 今日 | `today` | home | 01 §1 |
| 2 | 客户搜索 | `customer-search` | mobile-list + SearchBar | 02 §2 |
| 3 | 客户详情 | `customer-detail` | detail | 02 §3 |
| 4 | 预约详情 | `appointment-detail` | detail | 03 §8 |
| 5 | 新增/改期预约 | `appointment-form` | mobile-form | 03 §11 |
| 6 | 术后告知 | `treatment-notice` | detail + noticeBlocks | 03 §9 |
| 7 | 预约列表 | `appointment-list` | mobile-list + CalendarGrid | 03 §11 |
| 8 | 回访登记 | `callback-register` | mobile-form | 04 §6 |

- 全部 b-mobile；角色沿用 store_manager / beautician / front_desk / warehouse 的按人勾选口径。
- `customer-search` 用 mobile-list 的搜索变体，不新增独立 archetype；页面默认显示搜索框与结果/空态。
- `today` 的 `content`（quickActions/appointments/callbacks/storeName/hasMessage）由 Briefer 从 PRD 验收示例生成。

### 3.3 需要补的能力

1. **`mobile-list` SearchBar**：当 `filterFields` 包含 `keyword` 或 `search` 时，在列表上方渲染 `SearchBar`，并渲染该字段的精确标签（如「关键词」）供语义 validator 命中；`mobile-list.allowedComponents` 增加 `SearchBar`，不放宽 validator。
2. **Briefer `home` content**：prompt 增加规则，对 `home` 页从 PRD 的快捷操作/预约/回访示例生成 `content`；缺失时不编造业务规则，写 assumption。
3. **真实 PRD 摘要**：从 00–04 提取业务范围、角色权限、页面清单、状态矩阵、字段表、验收示例、流程、导航；不修改原始 Markdown。

### 3.4 真实 run

```text
intake:run --runtime dsh（真实 PRD 8 页）
  -> PRD/IA gate（0 blockers 或有效 waiver）
  -> Briefer + brief gate + 两次签核
  -> agent:run --runtime dsh --profile prd-ui-intake
  -> Spec Engineer（8 Page Specs）
  -> render:html（8 页 + index）
  -> Playwright 巡检 + asset review
```

- IA/visual 的切片边界问题只用带 owner/reason/expiry 的 waiver；不伪造通过。
- 成本上限：intake `--max-cost-cny 3`，M1/asset review 各自默认 10 CNY 内。

## 4. Phase 2 出口验收

| 门槛 | 通过条件 |
|---|---|
| per-profile | 8 页 demo-orders 真实 run prompt 含 b-dense + c-expressive；interaction gate passed |
| 真实 PRD | 8 页、PRD/IA 0 blockers 或有效 waiver、brief gate passed、M1 三 gate 通过、Spec 8/0、HTML 8 页 |
| 资产 | 映射图标 asset review pass；placeholder 有显式 degraded 记录 |
| 回归 | 500+ tests、typecheck clean、`test:dsh` 2 passed、8 页/2 页/4 页 Phase 1 全绿 |
| 视觉 | 8 页 Playwright 截图；日历、固定操作栏、告知分块、表单 CTA 可见 |
| 文档 | 主设计文档 §14.1、本 spec、CHANGELOG、README、AGENTS、交接文档同步 |

预计真实成本：per-profile M1 ≈¥0.3；真实 intake ≈¥0.6–1；真实 M1 ≈¥0.3–0.6；asset review ≈¥0.35；合计约 **¥2–3**。

## 5. 实施顺序

1. Task 2：per-profile contracts/prompt/CLI + 单测 + 8 页 demo-orders 真实 run。
2. Task 3：inventory + Visual Style prompt + asset review + 单测。
3. Task 4：8 页真实 PRD 项目 + Briefer home content + mobile-list SearchBar。
4. 真实 intake/M1/Spec/render/视觉/资产全部跑通。
5. 更新主文档/CHANGELOG/README/AGENTS/交接文档。
6. 全量回归（tests/typecheck/test:dsh/Phase 1）。

每一步先补失败测试/验收用例，再实现；不把多个任务混成一个 commit。

## 6. 非目标

- Studio、Asset Compiler。
- motion 动画到 HTML、稳定 node id、自动截图 diff / Visual Critic。
- Figma / 沙箱 / Handoff（Phase 3）。
- 品牌插画、自定义图片资产。
- 生产级前端代码导出。

## 7. 风险与处理

| 风险 | 处理 |
|---|---|
| 真实 PRD 的 home content / 客户搜索暴露新 brief 边界 | 记录扩展需求；必要时拆小步，不硬套 archetype |
| A 库图标只有 10 个 | 映射不到的图标显式 placeholder/degraded，不伪造 pass |
| 模型波动导致 gate repair 轮次/成本上升 | 每 run 设 `--max-cost-cny`；保留失败证据，不洗成成功 |
| 真实 PRD IA/visual 切片边界 | 用 owner/reason/expiry 的 waiver；不伪造通过 |
| per-profile prompt 变长 | 只传 catalog 摘要；保留单 profile 路径 |

## 8. 版本与出口

- 本 spec 完成 = **v0.2 技术项 + Phase 2 出口（v0.3）**。
- v0.3 是 Phase 2 验收交付，不是项目最终交付。
- v1.0 仍需 Phase 3（Figma/Studio/Handoff）+ Phase 4（真实项目验收）；不在本 spec。
