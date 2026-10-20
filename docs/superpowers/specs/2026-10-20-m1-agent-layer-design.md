# M1 Agent 层设计（IA / Interaction / Visual Style）

- 日期：2026-10-20
- 状态：Implemented (2026-10-20)
- 输入：M0.5 资产评审硬化完成（350 tests、真实 dsh 13/13、usage/cost、PNG 输入、raw evidence、共享脱敏）
- 关联：
  - `docs/superpowers/specs/2026-10-20-agent-organization.md`
  - `docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md`
  - `docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md`
  - `docs/superpowers/specs/2026-10-20-asset-source-fallback-policy.md`
  - `pipeline/dsh/README.md`

## 0. 结论

1. **M1 只做三个 Agent**：IA Agent、Interaction Design Agent、Visual Style Agent；外加共享的 Agent Runner/Ports 和确定性编排。
2. **不改 Page Spec / HTML 模板**：M1 的产物是结构化 spec 与 findings，供人工决策和 Phase 2 的 Spec Engineer 消费；M1 不自动改 brief、不改页面模板、不改 renderer。
3. **复用 M0.5 的运行时能力**：dsh `--json -`、usage/cost、schema repair、raw evidence、共享脱敏、fail-closed、预算与失败隔离，不另造一套模型调用。
4. **Agent 之间不聊天**：只通过 Orchestrator 交换磁盘上的结构化产物；每个 Agent 独立 session。
5. **人工门禁是状态**：IA 结论、Brief 确认、最终视觉/动效签核都必须有人签；Agent 不能代签。
6. **M1 不包含**：客户模块、PRD 自动摄取/UI Briefer、Spec Engineer、Figma/M3、M2 真实供应商、生产服务。

> 口径说明：本 spec 采用 `2026-10-20-core-runtime-m0-design.md` 的 M1 定义（IA + Interaction + Visual）。`2026-10-20-agent-organization.md` §9 的“1C 先接 Visual Style”是接入顺序建议，不是 M1 的范围定义；本 spec 按 IA → Interaction/Visual 的顺序，因为 IA gate 是下游输入。

## 1. 当前基线

| 项 | 现状 |
|---|---|
| 主链路 | Phase 1A/1B + Phase 1C 的 2 页 employee-app 切片；`2 pages / 0 blockers` |
| 资产评审 | M0/M0.5 完成；13/13、真实 dsh 13/13、350 tests |
| Agent 层 | 无；只有 Asset Reviewer 一个 agent 端口 |
| UI Brief | 手写；没有 PRD Reviewer / UI Briefer |
| Page Spec | 编译器按 archetype 模板生成；不消费 interaction/visual spec |
| Figma | 未实现（M3）；Phase 0 spike 插件是历史参考 |
| 客户模块 | 挂起，不在 M1 |

M1 的输入假设：

- 已有一份人工确认的 `ui-brief.json`（Phase 2 的 UI Briefer 未实现，M1 不阻塞在该依赖上）。
- 有 PRD 原文/摘要（用于 IA Agent 的页面、导航、流程、角色检查）。
- 有现有 `project.yaml`、`page-spec/*.json`、design profile/catalog、asset manifest（可为空）。

## 2. 目标与非目标

### 2.1 目标

- 用独立 Agent 产出三份可审计的设计输入：
  - IA：页面/层级/导航/流程/角色/命名是否成立。
  - Interaction：交互模型、状态矩阵、动效规范与原型评审。
  - Visual Style：品牌视觉方向、资产 brief、来源策略。
- 把 Agent 输出接入确定性 Orchestrator：预算、重试、门禁、状态、证据、人工 signoff。
- 保持“一个 core + 两个 runtime adapter”的架构；不新增 runtime，不复制状态机。
- 保持现有 phase1/asset-review 回归不退化。
- 所有 Agent 输出可 schema 校验、可追溯、可重放；失败按 Agent 隔离，不互相污染。

### 2.2 非目标

- 不做 PRD Reviewer、UI Briefer、Spec Engineer/Repair。
- 不做客户模块页面模板。
- 不做 Figma Renderer、截图 diff、录屏/trace、Handoff（M3）。
- 不做 M2 真实 A/B/C 供应商、HTML motion、degraded 审计。
- 不让 Agent 直接写 Page Spec、HTML、Figma 或生产代码。
- 不做 Agent 之间的自由对话/群聊式编排。
- 不做多用户/远程服务/生产部署。

## 3. 角色与范围

| 角色 | M1 是否实现 | 输入 | 输出 | 门禁 |
|---|---|---|---|---|
| **IA Agent** | 是 | PRD 原文/摘要、现有 IA/导航、`ui-brief.json` | `ia-map.json`、`ia-findings.json`、`ia-proposed.json`、`ia-review.md` | IA Gate：blocker/waiver + 人工签核 |
| **Interaction Design Agent** | 是 | 已签核 UI Brief/IA、component contracts、motion tokens、Page Spec/原型（评审模式） | `interaction-spec.json`、`motion-spec.json`、`interaction-review.md` | Interaction Spec Gate：action/状态/motion/reduced-motion |
| **Visual Style Agent** | 是 | 品牌资料、参考截图、UI Brief/IA | `visual-style.json`、`asset-briefs/*.json` | Visual Style Gate：schema/完整性 + 人工确认 |
| **Agent Runner** | 是（共享） | `AgentTask`：role、prompt、input files、schema、budget | `AgentResult`：output、usage、usageComplete、raw、evidence | schema/usage/cost |
| **Orchestrator** | 是（扩展） | project/brief/PRD、agent results | run state、artifacts、signoff、usage/cost | 状态机 + 预算 + 人工门禁 |
| PRD Reviewer / UI Briefer | 否（Phase 2） | — | — | — |
| Spec Engineer / Repair | 否（Phase 2） | — | — | — |
| Asset Producer / Reviewer | 已有 M0，不重写 | brief/style pack | candidates/verdicts | 已有 M0.5 门禁 |
| Visual Critic / Test Subagents | 否（M3） | — | — | — |

## 4. 架构

### 4.1 分层

```text
core/agents
  contracts       AgentTask / AgentResult / role schemas / findings
  roles           IA / Interaction / Visual Style 的 prompt 与输出契约
  gates           IA / Interaction / Visual Style 的确定性门禁
  orchestrator    runM1 状态机、预算、重试、signoff、artifact 写入

core/orchestrator
  复用现有 run/state/logger/artifact 习惯；不把 agent 逻辑塞进 phase1

runtimes/standalone
  agent-cli       `pnpm agent:run`（M1 CLI）
  scripted-runner 测试/离线用，按 fixture 返回结构化输出
  artifact-store  复用现有 FileArtifactStore

runtimes/dsh
  dsh-agent-runner 复用 `--json -`、usage、stdout/stderr、session 证据
```

- **core 不 import `@deepseek-ai/*`、`node:fs`、`node:child_process`**。
- dsh 只负责“一次 agent 调用”的传输与证据；重试、预算、门禁、状态在 core orchestrator。
- 不新增第三个 runtime；standalone 与 dsh 是同一 port 的两个实现。
- 复用 M0.5 的 usage/pricing/`redactValue`/dsh `--json -` 模式；但 `core/agents` 不 import `@prd-ui/asset-review`，usage 形状与 pricing 算法通过共享契约/helper 复用，避免 agent 层耦合资产评审包。

### 4.2 Agent Runner Port

```ts
interface AgentTask {
  role: "ia" | "interaction" | "visual-style";
  prompt: string;
  schema: unknown;              // JSON Schema / Zod-derived
  runDir: string;
  inputFiles: string[];
  timeoutMs?: number;
  maxCostCny?: number;
}

interface AgentUsage {
  inputTokens: number;      // cache-miss input
  outputTokens: number;
  cacheReadTokens: number;
  totalTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

interface AgentResult {
  output: unknown;              // schema-validated
  usage?: AgentUsage;
  usageComplete?: boolean;
  raw?: string;
  ignoredKeys?: string[];
  repairAttempted?: boolean;
  stdout?: string;
  stderr?: string;
}

interface AgentRunnerPort {
  run(task: AgentTask): Promise<AgentResult>;
}
```

- 默认 dsh runner：`dsh --profile <name> --json -`，task 走 stdin；verdict/output 从 `final.text`；usage 从 `step_end`。
- 测试 runner：ScriptedAgentRunner 按 role + fixture 返回；不访问网络。
- 一次 agent 调用可以带 1 次 schema repair；repair 的 usage 必须合并。
- `usageComplete=false` 且设置了预算 → fail closed；`--allow-unknown-cost` 才能继续。
- 原始输出、usage、repair、ignoredKeys 写入 `agents/<role>/`；不写 key。

### 4.3 Run 产物布局

```text
runs/<runId>/
  state.json                     # 阶段、attempts、gates、degraded、usage/cost
  artifacts/
    ia-map.json
    ia-findings.json
    ia-proposed.json
    interaction-spec.json
    motion-spec.json
    visual-style.json
    asset-briefs/<assetId>.json
  agents/
    ia/{prompt.md,output.json,raw.json,stdout.txt,stderr.txt,session.json}
    interaction/...
    visual-style/...
  findings/
    ia-gate.json
    interaction-gate.json
    visual-style-gate.json
  signoff/
    ia.md
    visual-style.md
  logs/
    agent.ndjson
```

- `state.json` 是唯一状态源；agent 只写自己的 `agents/<role>/`，不写最终 handoff。
- 所有产物带 `schemaVersion`、`project`、`generatedAt`、`model`、`promptHash`；usage/cost 写入 state/summary，不混进业务 JSON。
- M1 不运行资产评审；`asset-briefs/*` 供后续 M0 资产评审流程消费。

## 5. 数据契约

### 5.1 IA

`ia-map.json`：

```ts
{
  schemaVersion: "1.0",
  project: string,
  pages: Array<{
    id: string,
    name: string,
    route?: string,
    parentId?: string,
    level: number,
    roles: string[],
    entryPoints: string[]
  }>,
  navigation: { primary: string[], tabs?: string[] },
  flows: Array<{ id: string, steps: string[], status: "ok" | "broken" | "orphan" }>,
  crossLinks: Array<{ from: string, to: string, kind: string }>
}
```

`ia-findings.json`：

```ts
{
  schemaVersion: "1.0",
  findings: Array<{
    id: string,
    severity: "blocker" | "major" | "minor",
    area: "scope" | "hierarchy" | "navigation" | "flow" | "roles" | "naming" | "states",
    evidence: string,
    issue: string,
    proposal?: string
  }>
}
```

`ia-proposed.json`：可选的页面树/导航/流程 patch，不直接改 PRD 或 brief。
`ia-review.md`：人类可读摘要 + 待决策项。

### 5.2 Interaction

`interaction-spec.json`：

```ts
{
  schemaVersion: "1.0",
  pages: Array<{
    id: string,
    transitions: Array<{ from: string, to: string, trigger: string }>,
    triggers: Array<{ nodeId?: string, action: string, reaction: string }>,
    states: {
      default: string[],
      loading: string[],
      empty: string[],
      error: string[],
      disabled?: string[],
      success?: string[]
    },
    focusOrder: string[],
    keyboard: Array<{ key: string, action: string }>,
    destructiveActions: Array<{ action: string, confirmation: string }>
  }>
}
```

`motion-spec.json`：

```ts
{
  schemaVersion: "1.0",
  presets: Record<string, {
    durationMs: number,
    easing: string,
    staggerMs?: number,
    distance?: string
  }>,
  bindings: Array<{ pageId: string, nodeId?: string, preset: string }>,
  tokens: { duration: Record<string, string>, easing: Record<string, string> },
  reducedMotion: { fallback: "none" | "fade" | "instant" }
}
```

`interaction-review.md`：评审 findings + 录屏/trace 证据（M1 只定义结构，不实现 M3 的录屏门禁）。

### 5.3 Visual Style

`visual-style.json`：

```ts
{
  schemaVersion: "1.0",
  direction: {
    tone: string,
    density: string,
    palette: string[],
    typography: { heading: string, body: string },
    radius: string,
    motionLevel: "low" | "medium" | "high"
  },
  references: string[],
  constraints: string[],
  assetStrategy: {
    icons: "library" | "commission" | "ai-vector",
    illustrations: "library" | "commission" | "ai-vector",
    images: "upload" | "placeholder"
  }
}
```

`asset-briefs/<assetId>.json`：复用 M0 的 `AssetBrief` 结构，增加 `visualRef`/`styleRef` 与来源提示；不直接生成资产。

### 5.4 共享字段

所有 artifacts：

- `schemaVersion`、`project`、`generatedAt`、`model`、`promptHash`。
- 可选 `degraded: boolean` + `degradedReason`。
- 不写 key、token、secret；统一走 `redactValue`。
- 严格 Zod schema；未知字段拒绝；版本升级需迁移说明。

## 6. 流程与门禁

### 6.1 M1 流程

```text
load project + ui-brief + PRD
        │
        ▼
IA Agent ──→ ia artifacts
        │
        ▼
IA Gate（deterministic）
  ├─ blocker → 人工处理 / waiver；禁止进入下一步
  └─ pass → signoff/ia.md
        │
        ├──────────────┐
        ▼              ▼
Interaction Agent   Visual Style Agent   （并行）
        │              │
        ▼              ▼
Interaction Gate   Visual Style Gate
        │              │
        └──────┬───────┘
               ▼
        state.json + usage/cost + artifacts
```

- IA 必须先于 Interaction/Visual；后两者可并行。
- Agent 之间没有调用关系；Orchestrator 只传文件路径与结构化输入。
- 任一步失败：当前 agent 重试/修复；不污染其他 agent 的产物；run 标记 `partial`/`failed`。
- M1 不编译 Page Spec、不渲染 HTML；产物供人工/Phase 2 消费。

### 6.2 门禁

| 门禁 | 条件 | 失败处理 |
|---|---|---|
| IA Gate | schema 通过；无 blocker，或 waiver 有 owner/理由/有效期 | 人工决策；不进入 Interaction/Visual |
| Interaction Gate | 每个 action 有 reaction；default/loading/empty/error 全覆盖；motion 只用 token；reducedMotion 有降级 | 回 Interaction Agent，最多 2 轮 |
| Visual Style Gate | schema 通过；palette/typography/assetStrategy 完整；asset briefs 可被资产评审消费 | 回 Visual Style Agent，最多 2 轮；仍不完整则人工 |
| Budget Gate | 单 agent/整 run 未超预算；usage 完整或显式允许未知 | 停止；剩余标记 `budget_exceeded` / `usage_incomplete` |
| Human Gate | `signoff/ia.md`、`signoff/visual-style.md` 存在且签字 | 缺失则 `awaiting_signoff`，不算通过 |

### 6.3 预算与重试

- 复用 `pipeline/pricing.json`；按 model/provider 计费。
- 默认整 run review 成本上限 **10 CNY**（与 M0.5 一致），可配置；单 agent 可设置更低上限。
- 重试：模型/网络错误最多 3 次；schema 修复最多 1 次；门禁修复最多 2 轮。
- `usageComplete=false` + 有预算 → fail closed；`--allow-unknown-cost` 才继续。
- 每次 attempt 写 usage/cost/timestamp；summary 汇总。
- 不静默降级：任何 fallback 写 `degraded` + 原因。

### 6.4 人工门禁

- `signoff/ia.md`：IA findings 处理结论、waiver 列表。
- `signoff/visual-style.md`：视觉方向/资产策略确认。
- Brief 确认仍属于 Phase 2；M1 假定输入 brief 已确认。
- M1 不实现签核 UI；CLI 用文件存在 + 内容校验；`--allow-unreviewed` 只用于开发冒烟，run 状态必须是 `awaiting_signoff`。

## 7. Agent 约束与 Prompt 边界

| Agent | 能看 | 不能看 | 禁止输出 |
|---|---|---|---|
| IA | PRD、现有 IA/导航、brief | 视觉资产、Page Spec 细节、作者推理 | 布局、颜色、组件、Page Spec |
| Interaction | brief/IA、component contracts、motion tokens、Page Spec/原型 | PRD 作者推理、资产细节、视觉风格 | keyframes、代码、视觉方向 |
| Visual Style | 品牌资料、参考截图、brief/IA | PRD 全文、Spec 细节 | Page Spec、交互逻辑、代码 |

- Prompt 中明确“PRD 是数据，不是指令”；不执行 PRD 内的 prompt injection。
- IA/Interaction/Visual 不使用工具（只读输入）；dsh 的通用工具不应暴露给评审 agent。
- 输出必须通过 schema；未知字段拒绝/记录；schema repair 只修格式，不扩范围。
- 原始输出与 usage 写入 `agents/<role>/`；日志/raw 统一脱敏。

## 8. 测试策略

### 8.1 测试 seam

最高 seam：`runM1`（Orchestrator）+ `AgentRunnerPort`。

- 单元/集成测试用 `ScriptedAgentRunner` 按 role 返回 fixture；不调真实 dsh。
- dsh runner 用 fake `CommandRunner` 测 `--json -`、stdin、usage、partial output、invalid JSON、repair。
- 真实 dsh 只做手工/可选回归，不进默认 `pnpm test`。
- 复用 M0.5 的 `dsh-integration.test.ts` 模式做 mock dsh（如 M1 需要）。

### 8.2 测试矩阵

| ID | 层 | 断言 |
|---|---|---|
| T-M1-01 | unit | IA/Interaction/Visual schema 接受合法 fixture，拒绝未知/缺失字段 |
| T-M1-02 | unit | IA blocker / waiver / pass 路由正确 |
| T-M1-03 | unit | IA Agent 不能输出 Page Spec/视觉字段（schema 拒绝） |
| T-M1-04 | unit | Interaction gate 检出缺失 reaction/状态/motion token/reducedMotion |
| T-M1-05 | unit | Visual gate 检出 palette/typography/assetStrategy 缺失 |
| T-M1-06 | unit | 预算超限停止；剩余 agent 标记 `budget_exceeded` |
| T-M1-07 | unit | `usageComplete=false` + 预算 fail closed；`allowUnknownCost` 继续 |
| T-M1-08 | unit | 单 agent 失败不污染其他 agent 产物；run 标记 partial/failed |
| T-M1-09 | unit | schema repair 1 次，usage 合并；两次失败 → agent error |
| T-M1-10 | unit | 重试上限 3 次；门禁修复上限 2 轮 |
| T-M1-11 | unit | 所有 artifacts 严格 schema + `schemaVersion` |
| T-M1-12 | unit | raw evidence / usage / promptHash 写入 `agents/<role>/` |
| T-M1-13 | unit | 日志、raw、stdout、`--json` 脱敏；无 key |
| T-M1-14 | unit | IA 先于 Interaction/Visual；后两者可并行；无 agent-to-agent 调用 |
| T-M1-15 | integration | `runM1` + ScriptedAgentRunner 生成完整 artifacts + signoff 状态 |
| T-M1-16 | integration | `--allow-unreviewed` 只产生 `awaiting_signoff`，不算 pass |
| T-M1-17 | integration | 现有 phase1 `2 pages / 0 blockers` 与 asset review 13/13 不回归 |
| T-M1-18 | dsh contract | `dsh --json -` + stdin + `final.text` + `step_end.usage` 解析 |
| T-M1-19 | dsh integration | 本地 mock dsh 跑一个 IA fixture；不消耗真实 key |
| T-M1-20 | manual | 真实 dsh 三 agent 跑通；usage/cost ≤10 CNY；记录 prompt/model |

### 8.3 回归

- `pnpm test`：现有 350+，只增不减。
- `pnpm typecheck` clean。
- `pnpm phase1:verify --project samples/projects/employee-app/project.yaml`：`2 pages / 0 blockers`。
- `pnpm asset:review --assets samples/assets/m0 --runtime standalone`：13/13。
- `pnpm test:dsh`：仍通过。
- 真实 dsh：M1 三 agent 各一次；usage/cost；无 key。

## 9. 验收标准

- [x] `agent:run` 能对现有 employee-app sample 产出 IA/Interaction/Visual 三类 artifacts。
- [x] 所有 artifacts 通过严格 schema；带 `schemaVersion`/`project`/`generatedAt`/`model`/`promptHash`（`asset-briefs/*` 为兼容 M0 保持纯 `AssetBrief`，envelope 在 `visual-style.json`/`session.json`）。
- [x] IA blocker/waiver 路由正确；`signoff/ia.md` 缺失时 run 为 `awaiting_signoff`。
- [x] Interaction gate 覆盖 action/reaction、状态矩阵、motion token、reducedMotion。
- [x] Visual Style gate 覆盖 palette/typography/assetStrategy；asset briefs 可被资产评审读取。
- [x] 预算、usage、重试、失败隔离、schema repair 有测试。
- [x] `usageComplete=false` 有预算时 fail closed；`--allow-unknown-cost` 可显式继续。
- [x] 日志/raw/stdout/`--json` 无 key；共享脱敏。
- [x] M1 不修改 Page Spec/HTML；phase1 与 asset review 回归不退化。
- [x] `pnpm test` ≥350；`pnpm test:dsh` pass；真实 dsh 手工回归有记录。
- [x] 客户模块、Figma、M2 供应商不在 M1 验收范围。

## 10. 非目标

- 客户模块 4 页模板。
- PRD 自动摄取、PRD Reviewer、UI Briefer、Spec Engineer/Repair。
- Figma Renderer、截图 diff、录屏/trace、Handoff。
- M2 真实 A/B/C 供应商、HTML motion、degraded 审计。
- Agent 直接写 Page Spec/HTML/Figma/生产代码。
- Agent 之间自由对话/群聊。
- 多用户、远程服务、生产部署。

## 11. 风险与开放问题

1. **模型选型**：IA 需要长上下文/强推理；Interaction 需要状态/动效理解；Visual Style 需要 vision。M1 先复用 dsh 的 `deepseek-flash` 还是为角色分开配置？建议 M1 用同一 provider、按 role 配 model/temperature；不引入新 provider。
2. **IA 的阻断权**：blocker 是否默认阻断，还是只提示？按 agent-organization §0.1，默认阻断，人可 waiver；M1 按此实现。
3. **Interaction Spec 尚未被 Page Spec 消费**：M1 只产出 spec；Spec Engineer 接入是 Phase 2。验收不能拿“页面动效变了”当通过标准。
4. **Visual Style 缺少品牌资产**：M1 可用参考截图/现有资产/placeholder；真实品牌输入在 Phase 1C/2 提供。
5. **人类签核的载体**：M1 用 `signoff/*.md` 文件；没有 Studio UI。需要定义签字格式/校验规则。
6. **预算口径**：整 run 10 CNY 是否足够三 agent？M1 先复用 10 CNY 上限，按 agent 记录；真实 run 后校准。
7. **PRD 输入形态**：M1 接受 PRD 原文/摘要 + 手写 brief；PRD 自动摄取是 Phase 2。
8. **Prompt injection**：PRD 当数据，IA/Interaction/Visual 不给工具；仍需在 prompt 和输出 schema 上做防护。

## 12. 实施顺序

1. **Phase A：Contracts + Runner**
   - `core/agents` contracts、role schemas、`AgentRunnerPort`；
   - ScriptedAgentRunner + fake CommandRunner；
   - 复用 usage/pricing/redaction/repair。
2. **Phase B：IA Agent**
   - prompt、schema、findings、blocker/waiver、IA gate；
   - `signoff/ia.md`。
3. **Phase C：Interaction Agent**
   - interaction-spec/motion-spec schema、gate、review fixture。
4. **Phase D：Visual Style Agent**
   - visual-style/asset-briefs schema、gate；与现有 asset review 的 brief 结构对齐。
5. **Phase E：Orchestrator + CLI**
   - `runM1` 状态机、预算、重试、失败隔离、artifact/state；
   - `agent:run` CLI、`--json`、signoff 参数。
6. **Phase F：dsh + regression**
   - dsh agent runner、mock 集成、真实 dsh 手工；
   - 回归 phase1 2/0、asset review 13/13、350+ tests；
   - 文档/CHANGELOG。

## 13. 关联文档

- `docs/superpowers/specs/2026-10-20-agent-organization.md` — 角色、DAG、门禁、RACI。
- `docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md` — M0/M1 边界、runtime 分层。
- `docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md` — Phase 2/3 与数据契约。
- `docs/superpowers/specs/2026-10-20-asset-source-fallback-policy.md` — 资产 brief/来源/评审。
- `pipeline/dsh/README.md` — dsh profile、`--json -`、usage。
- `pipeline/docs/agent-m1.md` — 实现后的使用说明、产物、签核、退出码。

## 14. 验收记录（2026-10-20）

- 实现：`core/agents`（契约/role schemas/prompts/gates/`runM1`）、`agent:run` CLI、
  ScriptedAgentRunner、DshAgentRunner、`prd-ui-agents` dsh profile、employee-app
  M1 sample inputs 与 fixtures。
- 测试：`pnpm test` **423 passed**（原 350）；`pnpm test:dsh` **2 passed**（asset review
  + M1 IA，真实 pinned dsh + 本地 mock）；`pnpm typecheck` clean。
- 回归：employee-app `Phase 1A OK: 2 pages, 0 blockers`；standalone asset review
  `13 assets / 13 passed`。
- 真实 dsh（`deepseek-flash`）：三 Agent 各 1 次调用，无 schema repair、无门禁修复；
  `status=success`，`gates={ia:passed, interaction:passed, visualStyle:passed}`，
  10 个 asset briefs，**¥0.1973**，`usageComplete=true`，无需 waiver。
- IA 初次发现 3 个切片 blocker（死 Tab、库存无入口、库管死路），随后又发现快捷入口
  权限错配；已通过 brief/PRD 修复（见 `pipeline/docs/agent-m1-uat.md` §4）。
  最终 IA-only run `IA gate=passed`、0 blockers。
- 已知边界：Interaction spec 尚未被 Page Spec 消费；没有签核 UI；`--allow-unreviewed`
  永不产生 `success`；asset briefs 为兼容 M0 不带 envelope。
