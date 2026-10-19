# Agent 组织架构 · 角色、流程、产物与门禁

- 日期：2026-10-20
- 状态：组织方案定稿，待接入编排
- 关联：
  - 总体设计：`2026-10-19-prd-to-ui-pipeline-design.md` §7
  - 资产来源与评审：`2026-10-20-asset-source-fallback-policy.md`
  - 插画系统：`2026-10-20-illustration-system-research.md`
  - AI 资产：`2026-10-19-ai-asset-generation-research.md`

## 0. 结论

1. **仍然是角色型 + 确定性 Orchestrator**，不是管理型 Agent 层级；新增角色不改变这个原则。
2. **新增两个独立角色**：
   - **IA Agent（Information Architecture）**：检查 PRD 的页面清单、层级、导航、流程、角色、命名、断链/死路，输出 IA findings + 建议 IA。
   - **Interaction Design Agent**：负责交互模型、状态矩阵、动效规范、原型交互评审；包含 motion/动效，但不写 keyframes、不写代码。
3. **UI 结构不单独设 Agent**：Page Spec + 设计系统 + 确定性编译器/校验器负责；IA 和 Interaction 是产品设计层的两个独立视角，不与 Spec Engineer 抢职责。
4. **Visual Style Agent 继续独立**：品牌视觉方向、插画/图片/logo/海报风格、资产 brief；与 Interaction Design Agent 分工为“视觉” vs “行为/动效”。
5. **Agent 之间不聊天**，只交换结构化产物；Orchestrator 是纯函数 Router + 预算 + 门禁。
6. **人工门禁**：PRD/IA 确认、UI Brief 确认、最终视觉/动效签核；Agent 不能代签。

### 0.1 已确认决策（2026-10-20）

1. **IA Agent 有 blocker 权**：主链路断裂、孤儿页、权限死路、Tab 超限、命名/路由冲突可阻断 UI Brief；人可 waiver（owner/理由/有效期）。
2. **Interaction Spec 独立**：`interaction-spec.json` / `motion-spec.json` 独立产物，Page Spec 只引用 ID。
3. **动效评审证据**：录屏 + Playwright trace，两者都要。
4. **人工签核范围**：PRD/IA 与 Brief 全量签；最终视觉/动效关键页 + 抽检，其余依赖机器门禁。
5. **模型能力分开配置**：IA Agent 用长上下文/强文档推理；Interaction Agent 用视频/轨迹理解 + 强推理。
6. **资产预算**：A/B 自动生成每资产最多 9 次、$1.0、30 分钟；超预算或 C 委托不设硬金额上限，但必须人工 review/审批。
7. **资产通过线（最严）**：任一维 ≥4、平均 ≥4.5；品牌关键资产平均 ≥4.8。
8. **标准图标链**：A 库 → C 委托/补库 → B AI 矢量（质量优先）。
9. **品牌关键插画链**：C 委托 → B AI 矢量 → A 库（质量优先）。

## 1. 角色总表

| 阶段 | 角色 | 类型 | 核心职责 | 关键产物 |
|---|---|---|---|---|
| Intake | Intake | 确定性 | 解析 PRD/项目配置 | normalized PRD |
| PRD Review | **PRD Reviewer** | Agent | 独立评审 PRD 是否 UI-ready | `prd-review.json` |
| IA Review | **IA Agent** | Agent | 检查信息架构是否合理 | `ia-map.json`、`ia-findings.json` |
| PRD/IA Gate | Human | 人工 | 确认范围/IA，处理 blocker/waiver | `signoff/prd-ia.md` |
| UI Brief | **UI Briefer** | Agent | PRD → UI Brief + 追问 | `ui-brief.json`、`questions.json` |
| Brief Gate | Human | 人工 | 确认 Brief | `signoff/brief.md` |
| Interaction Design | **Interaction Design Agent** | Agent | 交互模型、状态矩阵、motion 规范、原型评审 | `interaction-spec.json`、`motion-spec.json`、`interaction-review.md` |
| Spec | **Spec Engineer / Repair** | Agent | UI Brief + Interaction Spec → Page Spec；修复校验 | `page-spec/*.json` |
| Spec Gate | Validators | 确定性 | schema/catalog/token/layout/state/asset/semantic | `validation.json` |
| Visual Style | **Visual Style Agent** | Agent | 品牌视觉方向、插画/图片/logo/海报风格、资产 brief | `visual-style.json`、`asset-briefs/*` |
| Asset | **Asset Producer** | Agent/工具 | 库检索 / AI 生成 / 上传，执行 brief | asset candidates |
| Asset Review | **Asset Reviewer** | Agent | 独立评审资产，pass/retry/fallback | `asset-review.json` |
| Render | HTML/Figma Renderer | 确定性 | Page Spec + RenderPlan + assets → HTML/Figma | renders |
| Visual Review | **Visual Critic** | Agent | 看截图做视觉评审 | `visual-findings.json` |
| Interaction Review | **Interaction Design Agent**（review 模式） | Agent | 看原型/录屏/轨迹评审交互与动效 | `interaction-review.md` |
| Test | Test Subagents | Agent | Render/Layout、A11y、Figma、Visual | `test-findings.json` |
| Final Gate | Human | 人工 | 最终视觉/动效签核 | `signoff/final.md` |
| Handoff | Handoff Packager | 确定性 | 打包交付 | handoff bundle |

## 2. 流程 DAG

```text
Intake
  ├── PRD Reviewer ──┐
  └── IA Agent ──────┤
                     ▼
              PRD/IA Gate（Human）
                     ▼
                UI Briefer
                     ▼
              Brief Gate（Human）
        ┌────────────┴─────────────┐
        ▼                          ▼
Interaction Design Agent     Visual Style Agent
  interaction-spec             visual-style
  motion-spec                  asset-briefs
        ▼                          ▼
   Spec Engineer              Asset Producer
        ▼                          ▼
   Validators                 Asset Reviewer
        └────────────┬─────────────┘
                     ▼
             HTML / Figma Renderer
                     ▼
   Visual Critic + Interaction Review + Test Subagents
                     ▼
              Final Gate（Human）
                     ▼
                Handoff
```

- PRD Reviewer 与 IA Agent 可并行，独立评审同一份 PRD；Orchestrator 汇总 findings，人一次性处理 blocker。
- Interaction Design Agent 与 Visual Style Agent 可并行：一个管行为/动效，一个管视觉/资产。
- Spec Engineer 消费 Interaction Spec；Renderer 等 Page Spec + assets 都就绪后启动。
- Visual Critic 只看截图；Interaction 评审看原型/录屏/轨迹；两者不互相替代。

## 3. IA Agent（信息架构）

### 3.1 目标

在 UI Brief 之前回答：**PRD 的页面、层级、导航、流程、角色和命名是否成立？** 不设计布局、不设计视觉。

### 3.2 检查项

| 维度 | 检查 |
|---|---|
| 范围 | 页面清单是否覆盖 PRD 范围；是否有多余/缺失页面 |
| 层级 | 一级/二级/三级深度；Tab / 二级页 / 浮层是否合理；层级是否过深 |
| 导航 | 底部 Tab 数量与语义；入口是否可达；是否存在重复入口 |
| 流程 | 主链路是否连续；预约/开单/回访/库存等跨模块衔接；是否有断点 |
| 角色 | 角色/权限是否影响页面可见性；是否存在“无权限即死路” |
| 命名 | 页面名、导航名、路由是否一致；同一对象是否多种叫法 |
| 关系 | 页面之间的跳转/返回/深链；孤儿页、死路页 |
| 内容分组 | 信息分类是否符合用户任务；搜索 vs 浏览；主次是否清晰 |
| 状态 | IA 层是否覆盖空态/错误态/无权限态的出口 |
| 一致性 | 与现有 Web/小程序 IA 是否同源；命名是否对齐 |

### 3.3 输出

```text
ia-map.json
  pages / hierarchy / navigation / routes / roles / flows / entryPoints / crossLinks
ia-findings.json
  findings[] { id, severity, area, evidence, issue, proposal }
ia-proposed.json
  proposed page tree / nav / flow changes
ia-review.md
  人类可读的评审摘要与待决策项
```

### 3.4 边界与门禁

- **不改 PRD 正文**：只提 findings 和 proposed IA；PRD Owner 决定是否采纳。
- **不做布局/视觉/动效**：不输出 Page Spec、组件、颜色、插画。
- **阻断条件**：主链路断裂、孤儿页、权限死路、Tab 超限、命名/路由冲突、关键状态无出口 → blocker；必须在 PRD/IA Gate 前解决或有 owner/理由/有效期的 waiver。
- **人工签核**：IA 是产品决策，Agent 只给建议，人签字。

## 4. Interaction Design Agent（交互与动效）

### 4.1 目标

把“页面/操作”变成**可实现的交互模型 + 动效规范**，并在原型完成后评审实际交互/动效；不写代码、不写 keyframes、不决定视觉风格。

### 4.2 输入

- 已签核的 UI Brief / IA map；
- design system 的 motion tokens（duration/easing/stagger/distance）；
- component contracts（Button/Input/Modal/Drawer/Toast/List 等）；
- 页面 archetype/状态矩阵；
- 原型/录屏/Playwright trace（评审阶段）。

### 4.3 输出

```text
interaction-spec.json
  pages[] {
    id, transitions, triggers, states, focusOrder, keyboard, destructiveActions,
    loading, empty, error, disabled, success
  }
motion-spec.json
  presets: page-enter/exit, list-stagger, card-hover, button-press,
           input-focus, skeleton-shimmer, empty-fade, modal/drawer/toast
  bindings: page/node -> preset
  tokens: duration/easing/stagger/distance
  reducedMotion: fallback
interaction-review.md
  原型评审 findings + 录屏/轨迹证据
```

### 4.4 必查项

- **每个 action 都有 reaction**：点击/提交/取消/删除/返回/切换；
- **状态矩阵完整**：default/hover/focus/pressed/disabled/loading/empty/error/success；
- **导航与返回**：Tab/二级页/深链/返回栈；
- **表单**：校验时机、错误定位、提交中、防重复、离开保护；
- **危险操作**：二次确认/撤销/不可逆提示；
- **动效**：页面转场、列表 stagger、卡片 hover、按钮 press、输入 focus、骨架 shimmer、空态 fade、弹层进出；
- **无障碍**：focus-visible、键盘顺序、aria、reduced-motion；
- **性能/克制**：不做无限循环、不阻塞关键操作、不同时堆叠多动效；
- **一致性**：同类交互跨页一致；动效时长/缓动来自 token，不写死。

### 4.5 边界

- 不决定视觉风格/颜色/插画（Visual Style Agent 负责）；
- 不写 keyframes/代码（Renderer 负责）；
- 不替代 Visual Critic：Visual Critic 看静态截图，Interaction 评审看行为/动效；
- 不替代 Human：最终动效/交互签核由人完成。

### 4.6 评审模式

- 输入：HTML 原型 + 录屏/Playwright trace + interaction-spec；
- 输出：findings（severity/证据/建议）、通过/不通过；
- 失败处理：回到 Spec/Renderer 修复，最多 2 轮；不收敛 → 人工；
- 证据：录屏时间点、DOM/state、动效参数；不只写“感觉不顺”。

### 4.7 动效到底由谁“生成”

**默认：没有任何 Agent 直接写 keyframes/动画代码。** 分工是：

| 环节 | 角色 | 产物 |
|---|---|---|
| 动效设计 | **Interaction Design Agent** | `motion-spec.json`：预设、触发、状态、时长/缓动 token、stagger、reduced-motion |
| 动效契约 | Spec Engineer | Page Spec / RenderPlan 里的 `motion` 绑定（引用预设，不写原始时长） |
| 动效实现 | **HTML Renderer（确定性）** | CSS transitions/animations、Framer Motion；按预设执行 |
| 自定义动效资产 | **Motion Producer（可选）** | Lottie/Rive/AE 资产；Interaction 定 brief，Producer 制作，Renderer 播放 |
| 动效验收 | Interaction Design Agent（review） | 录屏/trace + findings |
| 最终签核 | Human | 视觉/动效签核 |

- **标准 UI 动效**（转场、hover、press、focus、stagger、skeleton、empty、modal）：Interaction Design Agent 写规范，Renderer 实现；不让 Agent 生成代码。
- **自定义品牌动效**（角色动画、复杂转场、IP 动效）：Interaction Design Agent 出 storyboard/brief；Motion Producer 产出 Lottie/Rive；Renderer 播放；Interaction 评审。
- **Figma**：只做静态状态帧 + 动效标注；v1 不做 Smart Animate/原型连线（HTML 原型是动效事实源）。
- **为什么不让 Agent 写动效代码**：不可复现、跨端漂移、难审查、a11y/reduced-motion 容易漏；确定性 Renderer 更可控。
- **Interaction Design Agent 不“生成”动效像素**：它负责“设计 + 规范 + 评审”，不负责“实现”。

## 5. 与其他角色的边界

| 问题 | 归属 |
|---|---|
| 页面清单/导航/流程/命名是否合理 | IA Agent |
| 页面布局/组件/Page Spec | Spec Engineer + 设计系统 |
| 交互/状态/动效/原型行为 | Interaction Design Agent |
| 品牌视觉/插画/图片/logo/海报 | Visual Style Agent |
| 组件/tokens 是否有、是否可用 | Design System Ingestor + Validators |
| 截图视觉缺陷 | Visual Critic |
| 资产来源/降级/评审 | Asset Producer + Asset Reviewer |
| 最终签核 | Human |

## 6. 隔离与权限

| 项 | 规则 |
|---|---|
| 上下文 | 每个 Agent 独立 session；不共享聊天记录 |
| 产物 | 只通过 Orchestrator 交换；不直接调用另一个 Agent |
| IA Agent | 只读 PRD + 现有 IA/截图；不看 UI Brief/视觉 |
| Interaction Design Agent | 只读 IA/Brief/Page Spec/motion tokens/原型；不看 PRD 作者推理/视觉资产 |
| Visual Style Agent | 只读品牌资料/UI Brief/截图；不看 PRD 全文/Spec 细节 |
| Asset Reviewer | 只读候选 + brief + style pack；不看生成推理/成本 |
| 权限 | Agent 只能写 run 的 artifacts，不能写最终 handoff |

## 7. 门禁与预算

| 门禁 | 条件 | 失败处理 |
|---|---|---|
| PRD/IA Gate | PRD Reviewer + IA Agent 无 blocker，或 waiver 有 owner/理由/有效期 | 人工决策；禁止进 UI Brief |
| Brief Gate | 无阻塞问题、追溯完整 | Clarify；禁止编译 |
| Interaction Spec Gate | 每个 action 有 reaction；状态矩阵完整；motion 用 token；reduced-motion 有降级 | 回 Interaction Design；最多 2 轮 |
| Spec Gate | Validators 0 blocker | Spec Repair ≤2 轮；不收敛人工 |
| Asset Gate | A/B/C 3 次/来源；通过评分；授权/来源完整 | 切源；全失败人工 |
| Visual/Interaction Gate | runtime 断言 + 截图 diff + 交互评审 + a11y | 修复/豁免；不收敛人工 |
| Final Gate | 视觉/动效签核 | 阻断 handoff |

预算：

- IA review：2 轮；Interaction spec/review：2 轮；Spec repair：2 轮；资产：3 次/来源、9 次/资产、A/B 默认 $1.0/30 分钟；超预算或 C 委托需人工审批；
- 单 Agent token/时间上限；超限人工；
- 所有降级写 `degraded` + 原因。

## 8. RACI

| 事项 | R | C | A |
|---|---|---|---|
| PRD UI-ready | PRD Reviewer | IA Agent | Human |
| 信息架构 | IA Agent | PRD Reviewer | Human |
| UI Brief | UI Briefer | IA Agent | Human |
| 交互/动效 | Interaction Design Agent | Spec Engineer / Renderer | Human |
| Page Spec | Spec Engineer | Validators | Human（Brief） |
| 视觉风格/资产 | Visual Style Agent / Asset Producer | Asset Reviewer / Visual Critic | Human |
| 最终交付 | Orchestrator | 全部 Agent | Human |

## 9. 接入顺序

| 阶段 | 先接什么 | 理由 |
|---|---|---|
| 1C（当前） | Visual Style Agent + Asset Producer/Reviewer + HTML Renderer | 高保真产出最缺视觉/资产 |
| 1C 后 | Interaction Design Agent（spec + 原型评审） | 高保真动效/交互是下一层 |
| Phase 2 | PRD Reviewer + IA Agent + UI Briefer | PRD 入口；IA 必须先于 Brief |
| Phase 2 | Spec Engineer / Repair | 替换当前确定性模板，处理复杂页面 |
| Phase 3 | Visual Critic + Test Subagents + Figma Renderer | 完整验证/交付 |

## 10. 已确认与剩余

已确认决策见 §0.1。剩余待输入：

1. 真实切片的品牌色/字体/图标（Phase 1C 输入）。
2. 客户详情手机号口径（第三页前裁决）。
3. IA/Interaction Agent 的具体模型与工具选型（接入时确认）。
