# v0.7 输入：视觉门禁、结构优化与分块生成

- 日期：2026-10-26
- 状态：**Draft（v0.7 设计输入，未实施）**
- 背景：v0.6 Figma 门禁出现「结构 diff 全绿、视觉全错」；当前处于项目试验期，每个项目
  的组件与内容都可能不同，不能靠固化组件库解决。
- 关联：[v0.6 门禁证据交接](../handoffs/2026-10-26-v06-figma-gate-evidence.md)、
  [v0.6 设计](2026-10-23-v06-figma-studio-asset-compiler-design.md)、
  [版本路线](../plans/2026-10-23-version-roadmap.md)

## 1. 问题陈述

v0.6 的真实 Figma 门禁暴露了三类系统性缺口：

1. **样式重复实现**：同一套视觉规则存在于 renderer CSS、`core/figma` plan 编译器、
   `runtimes/figma` 插件三处，彼此没有自动一致性校验。按钮、分隔线、输入框、TabBar、
   日历都是这样漂移的。
2. **门禁盲区**：`figma:verify` 只比较 plan ↔ readback，不比较 plan ↔ HTML。plan 本身
   写错时，readback 会忠实执行，diff 依然 0/0/0。
3. **结构只有校验、没有优化**：页面结构一次性由 archetype + slots 编译出来，之后只有
   门禁重试和人工看图；没有「页太长/太空/重复块/层级乱」的反馈环。

同时，试验期的现实约束是：**不能冻结组件清单**。因此方案必须与项目无关：固化验证流程，
不固化项目资产。

## 2. 目标与非目标

目标：

- 让「plan 与 HTML 的视觉漂移」在**不打开 Figma** 的情况下暴露。
- 让「交付物与 baseline 的视觉漂移」在签核前自动失败。
- 让未知组件/未知样式**显式失败**，而不是静默降级。
- 给页面结构提供确定性的优化环。
- 为长页面提供分块生成能力，且不引入接缝和页面级布局问题。

非目标：

- 不做全量组件库；不引入设计系统依赖（等客户提供时再谈接入）。
- 不替代人工签核；自动化只负责「把问题变红」。
- 不在 v0.6 回填；本文件是 v0.7 的输入。

## 3. 设计原则

1. **冻结验证，不冻结资产**：组件、变体、页面结构按项目生成；门禁与证据格式固定。
2. **Fail-closed**：编译器表达不了的东西必须报错，不能默认成空 frame。
3. **双轨验证**：块级 + 页面级、结构 + 视觉，任何一轨都不能单独作为签核依据。
4. **单一事实来源优先**：能从 HTML/CSSOM 或设计令牌派生，就不要手写常量。
5. **证据可复现**：每个门禁产出 JSON 证据，签核绑定证据 hash。

## 4. Part A — 视觉保真门禁

### A1. Fail-closed 映射

**问题**：`core/figma/src/compile-plan.ts` 的 `default` 分支把未知节点变成空 frame；
`summary`/`fields` 被丢弃就是这样发生的。

**做法**：

- 未知节点类型 → 产出带 `UNMAPPED_COMPONENT` 标记的节点，`figma:verify` 记为 blocker。
- 已知节点但无法表达的视觉属性（如某种 shadow/border 组合）→ `UNMAPPED_STYLE` finding。
- `figma:plan` 在生成阶段就输出 `plan-coverage.json`：每个 spec 节点的映射状态
  （mapped / degraded / unmapped）。
- 禁止 `default` 分支静默返回空内容；退化必须带 reason。

**验收**：构造一个含未知组件的 spec，`figma:plan` + `figma:verify` 必须失败并指出节点。

### A2. 派生样式清单 + conformance 测试

**问题**：plan 编译器对 HTML 样式的理解是手写的，靠人同步。

**做法**：

- 用 Playwright 渲染当前项目 HTML，按语义节点抽取计算样式（height、radius、
  border、font-size/weight、color、padding、gap），生成
  `build/conformance/style-manifest.json`。这是**每个项目自动生成**的，不维护组件表。
- `figma:conformance` 把 plan 声明与 manifest 逐项比对：
  - 尺寸/圆角/边框/字号/字重/颜色/间距不一致 → 失败；
  - plan 有、HTML 没有（或反之）的节点 → 失败；
  - 输出 `conformance.json`，按 pageId + specId 定位。
- 放在 `runtimes/standalone`（需要浏览器），与 `studio:smoke` 同级，不塞进离线
  `pnpm test`。

**验收**：

- 当前 8 页通过；
- 人为把 `ghost-chip` 的高度改回 36、或删掉列表行底边，`figma:conformance` 必须失败；
- 换一个新项目（组件不同）不需要改测试代码即可运行。

### A3. Figma parity 门禁

**问题**：结构 diff 看不见整页视觉，组合/节奏/颜色都需要图。

**做法**：

- 插件增加「导出当前页 frame 为 PNG」能力：`exportAsync` 后通过本地 server
  `POST /save` 落盘（与 readback 相同通道），或由 CLI 读取已导出的 PNG。
- `figma:parity` 把每页 PNG 与已签核的 HTML baseline 做像素/SSIM 对比：
  - 阈值可配置（建议 SSIM ≥ 0.98，或像素差 ≤ 0.5%）；
  - 输出 `parity.json`（每页得分 + diff 图路径）；
  - 字体/抗锯齿噪声用固定 viewport、禁用动画、等待字体加载来消除。
- 与 `figma:verify` 分工固定：verify = plan↔readback，parity = readback↔HTML。
- 签核证据必须同时包含 `verify` 与 `parity` 产物。

**验收**：

- 当前 delivery 8 页通过；
- 人为把按钮边框去掉、或把 tab 文案改成英文，parity 必须失败；
- parity 结果可复现（同输入两次运行分数一致）。

### A4. 扩展 readback/diff（可选但建议）

- readback 记录 border（含单边/宽度）、cornerRadius、fillAlpha、fontWeight、文本颜色。
- `figma:verify` 增加对应检查，减少「plan 与 readback 都错但一致」的概率。
- 注意：A4 不能替代 A2——它仍然只保证 plan↔readback。

## 5. Part B — 结构优化

### B1. 结构 lint（spec 级，确定性）

在 `core/validators` 增加结构规则，随 `spec:engineer` gate 运行：

- 空槽位 / 只有空状态的页面；
- 重复 Section（标题+内容模式相同）超过阈值；
- 页面高度预算（mobile 844、可滚动上限）与预估高度；
- 标题层级断裂（heading 跳级）；
- 孤立操作（Button 不在 actions/filter-row）；
- 应由 List 表达的重复行；
- 间距不在同一标尺（gap/padding 组合超出 profile 集合）。

输出 `structure-lint.json`；可配置 blocker/warning。试验期先 warning，稳定后升级。

### B2. 渲染测量回路

- `render:measure`（`runtimes/standalone`，Playwright）测量每页：总高、首屏内容、
  溢出、折叠位置、超宽元素。
- 结果回写 `render-metrics.json`，供结构 lint 与人工评审使用。
- 后续可做自动收敛（如合并/折叠），v0.7 先只测量、不自动改。

### B3. 结构 diff

- 对两次 spec/render 的页面树做结构 diff（节点增删、层级变化、槽位变化），输出
  `structure-diff.json`。
- 目的：结构变化可审阅，而不是靠人重新看图。

## 6. Part C — 分块生成

### C1. 块边界从规范来

- 块 = PageSpec 树中的 Section/Card（或 archetype 明确的分区），不是模型自由切分。
- 禁止跨块的绝对定位；块不拥有页面壳、header/footer/tab bar、固定 CTA。

### C2. 块契约

每个块声明：

- `blockId`、所属槽位、允许组件（catalog）、token profile；
- 目标高度区间（可选）、必需状态（default/empty/loading/error 中适用的）；
- 输出：带稳定 id 的 SpecNode 子树（不允许嵌套 MobileShell）。

### C3. 组装层拥有页面框架

组装层负责：

- 页面壳、header/footer/tab bar、固定 CTA；
- 块间距与垂直节奏（统一取自 profile）；
- 滚动/溢出、首屏、页面高度；
- id 唯一性与块顺序。

### C4. 双轨门禁与重试

- 块级：catalog/槽位/属性校验 + 结构 lint（块内）；
- 组装：id 唯一、顺序、总量、重复块；
- 页面级：Phase 1 语义校验、render-measure、Figma conformance + parity；
- 重试策略：块级失败只重试该块；组装失败才整体重试；infra 失败不判 pass。

### C5. 实验计划与指标

- 先在 2–3 种页面类型试点：`today`（多卡片）、`appointment-list`（筛选+日历+footer）、
  表单（字段组）。
- 量化：接缝缺陷数、重试次数、token 漂移（硬编码样式计数）、页高偏差、生成成本/时延。
- 达标后再推广；不达标则回到整页生成，只保留 B 部分的结构优化。

## 7. 版本与落地顺序

| 项 | 版本 | 理由 |
|---|---|---|
| A1 fail-closed | v0.7 第一批 | 改动小、直接防静默降级 |
| A2 conformance | v0.7 第一批 | 成本最低、覆盖本次 7/8 类问题 |
| A3 parity | v0.7 第二批 | 需要插件导出能力；是签核前的视觉兜底 |
| A4 verify 扩展 | v0.7 随 A2/A3 | 补 plan↔readback 的样式盲区 |
| B1 结构 lint | v0.7 第一批 | 纯确定性规则，随 spec gate |
| B2 render-measure | v0.7 第二批 | 依赖 Playwright，先测量后收敛 |
| B3 结构 diff | v0.7 第三批 | 评审辅助 |
| C 分块生成 | v0.7 实验 → v0.8 推广 | 先量化，不直接替换整页生成 |

与现有 v0.7 范围（sandbox / Test Subagent / Handoff Packager）的关系：

- A2/A3/B2 是 Test Subagent 的具体实现（确定性校验 + 视觉对比）。
- A1/B1 属于沙箱的契约/结构检查。
- C 是生成端的实验，不影响 Handoff 包格式。

## 8. 验收标准（v0.7 出口）

1. 8 页样例：`figma:conformance`、`figma:parity`、`figma:verify` 全绿，且证据落盘。
2. 人为注入 3 类缺陷（按钮样式、文本内容、行分隔线），三个门禁分别能抓到。
3. 新项目（不同组件/内容）不改测试代码即可运行 A2/A3。
4. 未知组件在 `figma:plan` 阶段即失败，并给出 specId。
5. 结构 lint 能报出空槽位、页高超预算、重复块。
6. 分块实验报告：接缝缺陷、重试、token 漂移、页高偏差有数字；给出推广/回退结论。
7. 门禁顺序接入文档与签核流程：verify + parity 缺一不可。

## 9. 风险与未决问题

风险：

- parity 受字体/抗锯齿影响 → 固定 viewport、等待字体、禁用动画；阈值先用像素差，再引入 SSIM。
- CSSOM manifest 噪声（伪元素、继承）→ 只取语义节点（`data-node-id` / specId 映射）。
- 插件导出 PNG 的落盘通道 → 复用 readback 的本地 server；不接受人工下载作为唯一路径。
- 分块接缝 → 组装层统一间距；块内禁止页面级定位。
- 结构 lint 误报 → 试验期 warning，收集样本后再升级。

未决：

- parity 阈值定多少？先用「像素差 ≤0.5% 且 SSIM ≥0.98」做基线。
- baseline 由谁更新？沿用「只有人跑 baseline 并签核」。
- 分块生成放在 M1 还是 spec-compiler？建议先做 spec 层（块=Section），M1 只产出块级内容。
- 是否把 conformance 纳入 CI？先本地门禁，稳定后进 CI。

## 10. 与架构边界

- A1/A2/B1/B3 属于 `core/`（runtime-neutral）：`core/figma` 覆盖率报告、`core/validators`
  结构 lint、`core/compiler` 结构 diff 输入。
- A2/A3/B2 的浏览器与导出实现属于 `runtimes/standalone` / `runtimes/figma`。
- `core/` 不引入 `@deepseek-ai/*`；Playwright 只出现在 runtime 层。
- 证据统一落在 `pipeline/artifacts/<project>/figma/` 与 `render/`，JSON 可校验。
