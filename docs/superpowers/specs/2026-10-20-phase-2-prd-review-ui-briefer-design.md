# Phase 2 · PRD Review + UI Briefer 设计（从 PRD 到已签核 UI Brief）

- 日期：2026-10-20
- 状态：Implemented (2026-10-20)
- 输入：Spec Engineer v0 完成（488 tests、真实 dsh M1 `awaiting_signoff` ¥0.2115、2 个 Page Spec / 0 blockers）
- 关联：
  - `docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md` §5.1 / §5.2 / §6.1–§6.3
  - `docs/superpowers/specs/2026-10-20-m1-agent-layer-design.md`
  - `docs/superpowers/specs/2026-10-20-agent-organization.md`
  - `docs/superpowers/specs/2026-10-20-phase-2-spec-engineer-design.md`
  - `pipeline/core/contracts/src/ui-brief.ts`
  - `pipeline/core/agents/src/signoff.ts`
  - `pipeline/samples/sample-prd.md`（8 页样本 PRD）

## 0. 结论

1. **PRD Review + UI Briefer 是 Phase 2 前半段的两个角色**，外加确定性 intake 与门禁；复用 M1 的 `AgentRunnerPort`、dsh/standalone 适配器、usage/pricing、脱敏与 signoff 解析，不新增 runtime。
2. **PRD Reviewer 是只读评审者**：只输出 findings、readiness 和结构化 PRD 抽取；不补需求、不改 PRD、不做技术/视觉设计。
3. **IA Agent 复用，但输入契约要前移**：从“完整 UI Brief”改为“PRD + 项目配置 + 可选 existing IA”；保留 `brief` 参数作为 M1 兼容路径，不破坏 `agent:run`。
4. **UI Briefer 只消费已签核 PRD/IA**：输出 UI Brief 草稿、questions、assumptions；缺信息时提问或记假设，不猜、不伪造。
5. **两道人工门禁**：`PRD/IA signoff` 与 `Brief signoff`。未签核不写最终 `ui-brief.json`；Agent 不能代签。
6. **Brief 是可冻结的事实源**：通过 `UiBriefSchema` + 语义门禁 + compiler dry-run 后才允许签核；签核绑定 brief hash，之后内容不可静默修改。
7. **v0 不改 Page Spec、compiler、renderer、Figma**：它只把 PRD 变成已签核 brief，交给现有 `agent:run` 与 `spec:engineer`。6–8 页 HTML 的完整验收属于本设计之后的 M1/渲染阶段。
8. **预算、重试、证据、失败隔离**沿用 M1：默认整 run 10 CNY；usage 不完整且未显式允许时 fail closed；所有 agent 原始输出与 prompt hash 留档。

## 1. 当前基线

| 项 | 现状 |
|---|---|
| 流水线起点 | 手写 `samples/projects/employee-app/ui-brief.json`；`project.yaml` 已有可选的 `prd` 字段 |
| PRD Reviewer / UI Briefer | 不存在；M1 spec 明确把它们列为 Phase 2 |
| IA Agent | 已实现（`core/agents/src/roles/ia.ts`），但当前把完整 `UiBrief` 作为输入 |
| UI Brief 契约 | `UiBriefSchema` 已存在；页面 `content` 仍是 employee-app 专用字段 |
| 编译器 | 支持 10 个 archetype：overview/list/detail/form/settings/feed/home/inventory-list/auth/onboarding；`home`/`inventory-list` 的内容字段是样本专用 |
| M1 | `agent:run`、`prd-ui-agents` profile、scripted/dsh runner、signoff/waiver、usage/pricing 已实现 |
| Spec Engineer | v0 已实现；消费 M1 run，输出增强 Page Spec |
| 回归基线 | 488 tests、`pnpm test:dsh` 2 passed、typecheck clean、phase1 `2 pages / 0 blockers`、standalone asset review `13/13` |
| 真实 run 证据 | 当前 brief 的 dsh M1：`awaiting_signoff`、三 gate passed、¥0.2115、`usageComplete=true`；Spec Engineer 0 blockers / 22 warnings |
| 8 页 PRD 样本 | `pipeline/samples/sample-prd.md`：8 页、角色/权限/页面清单/状态矩阵/字段表/验收示例/需求编号齐全 |

本设计要补的是 **PRD → UI Brief** 的上游半段，而不是重新实现 M1 或 Page Spec。

## 2. 目标与非目标

### 2.1 目标

- 新增 `pnpm intake:run`：输入 PRD 与项目配置，输出：
  - 规范化 PRD 与 hash；
  - PRD review findings/readiness；
  - IA map/findings（复用 IA Agent）；
  - 已签核的 `ui-brief.json`；
  - `questions.json`、`assumptions.json`、signoff 与 gate 证据。
- PRD Review 覆盖主设计 §5.1：required sections、severity、evidence、confidence、question budget、owner、waiver。
- UI Brief 覆盖主设计 §5.2：meta/product/ia/data/assets/designDirection/openQuestions/assumptions/traceability。
- 两道人工门禁：
  - PRD/IA：blocker 清零或有效 waiver；问题有回答或显式假设；
  - Brief：blocking questions 清零；brief schema/语义/dry-run 通过；签核绑定 brief hash。
- 全程可审计：原始 PRD、prompt hash、agent raw output、usage/cost、findings、签核、brief hash 都在 run 目录。
- 支持 **resume**：人工看 findings/签核后继续，不重复调用已完成的 agent。
- 输出可被现有 `agent:run` 直接消费；不改变 M1/Spec Engineer 的输入契约。
- 不回归 Phase 1、asset review、M1、Spec Engineer。

### 2.2 非目标

- 不做 PRD 自动修复、Jira/Notion 同步、需求写作。
- 不做技术架构、定价策略、视觉风格评审；Visual Style 仍由 M1 的 Visual Style Agent 负责。
- 不做 Figma、Studio、Handoff、6–8 页 HTML 渲染验收。
- 不做多用户/远程服务/权限系统；签核是本地 Markdown 文件。
- 不自动替人做 blocker waiver 或 brief 决策。
- 不重写 IA Agent 的检查逻辑；只改输入桥接与兼容性。
- 不为真实 PRD 做“任意格式”承诺；v0 要求 PRD 至少含页面清单、角色权限、状态矩阵、字段表、验收示例；缺失按 blocker/major 处理。

## 3. 架构

### 3.1 分层

```text
core/contracts
  新增 PRD review / brief draft / intake signoff 的共享 schema

core/agents
  现有 AgentRunnerPort、DshAgentRunner 契约、signoff/pricing/redaction
  新增 roles: prd-review、ui-briefer
  扩展 AgentRole union；保留 DESIGN_AGENT_ROLES 给 M1
  IA Agent 增加 PRD-only 输入路径（保留 brief 兼容）

core/intake                       ← 新包，runtime-neutral
  normalize     Markdown → NormalizedPrd（sections/hash/placeholders/tables）
  gates         PRD gate / brief gate / IA gate 复用
  run-intake    state machine、并行 review、signoff、resume、summary

runtimes/standalone
  intake-cli    `pnpm intake:run`
  brief-validator  compileProject + PageSpecSchema dry-run
  scripted fixtures for PRD Reviewer / UI Briefer

runtimes/dsh
  复用 DshAgentRunner；复用 prd-ui-agents profile；不新增 transport
```

- `core/intake` 只依赖 `@prd-ui/contracts` 与 `@prd-ui/agents`（端口/角色/signoff/usage）；不 import `node:fs`、`node:child_process`、`@deepseek-ai/*`。
- 文件系统、模型调用、compiler dry-run 都在 `runtimes/standalone`；core 通过端口接收。
- 不新增第三个 runtime。

### 3.2 端口

```ts
interface IntakeClock {
  now(): Date;
}

interface BriefValidatorPort {
  validate(brief: UiBrief): {
    ok: boolean;
    errors: string[];
  };
}

interface IntakeInput {
  runId: string;
  project: ProjectConfig;
  prdText: string;
  prdPath: string;
  existingBrief?: UiBrief;
  existingIa?: IaMap;
  signoffPrdIa?: string;       // Markdown 文本；CLI 读文件后传入
  signoffBrief?: string;       // Markdown 文本
  briefVersion?: string;
  maxCostCny: number;
  allowUnknownCost: boolean;
}
```

- `AgentRunnerPort` 与 `AgentArtifactStorePort` 复用 `core/agents` 定义。
- `BriefValidatorPort` 由 standalone CLI 用 `compileProject` 实现；测试用 stub。这样 core 不依赖编译器，但能在签核前阻断“schema 通过但编译器不支持”的 brief。

### 3.3 流程

```text
project.yaml + PRD.md
        │
        ▼
   normalize / hash
        │
        ├──────────────┬──────────────┐
        ▼              ▼              │
 PRD Reviewer      IA Agent           │  （并行）
 prd-review.json   ia-map.json        │
        │              │              │
        └──────┬───────┘              │
               ▼                      │
        PRD/IA Gate（确定性 + 人工签核）
               │ pass
               ▼
          UI Briefer
     ui-brief.draft.json + questions/assumptions
               │
               ▼
        Brief Gate（schema + 语义 + compile dry-run）
               │ pass + 人工签核
               ▼
        ui-brief.json（冻结，可 publish）
               │
               ▼
          agent:run（M1）
               │
               ▼
        spec:engineer
```

- PRD Reviewer 与 IA Agent 并行，互不写对方产物；Orchestrator 汇总。
- UI Briefer 必须等 PRD/IA gate 通过并签核后启动。
- Brief gate 失败时只写草稿、questions、findings，不写最终 `ui-brief.json`。

## 4. 数据契约

### 4.1 NormalizedPrd

```ts
interface NormalizedPrd {
  schemaVersion: "1.0";
  project: string;
  sourcePath: string;
  sourceHash: string;          // sha256:...，原始字节
  title: string;
  sections: Array<{
    id: string;                // sec-001
    heading: string;
    level: number;
    lineStart: number;
    lineEnd: number;
    text: string;
  }>;
  placeholders: Array<{
    kind: "bracket" | "tbd" | "todo" | "empty-section" | "ellipsis";
    location: string;          // sec-003:12
    text: string;
  }>;
  tables: Array<{
    id: string;
    sectionId: string;
    headers: string[];
    rows: string[][];
    lineStart: number;
  }>;
  terms: Array<{
    term: string;
    count: number;
    variants: string[];
  }>;
  generatedAt: string;
}
```

规则：

- `sourceHash` 是 PRD 原始字节的 sha256；任何 PRD 修改都会使已签核 review/brief 失效。
- section id 按出现顺序稳定生成；heading 保留原文。
- 占位符至少识别 `【】`、`TBD`、`TODO`、`待确认`、`待补充`、空章节、`...`。显式标“不阻塞”的章节/标题与省略号只记 warning；其余为 blocker。
- 表格解析失败不吞掉：记 `tables` 为空并产生 `PRD_TABLE_INVALID` warning；required 表格缺失按 §7 处理。
- 原始 PRD 复制到 `runs/<runId>/input/prd.md`，用于审计；不修改原文。
- 输入上限默认 200 KB（UTF-8 字节）；超出 `PRD_INPUT_INVALID`，不做静默截断。上限以常量为准，后续可做成项目配置。

### 4.2 PRD Review

```ts
type PrdSeverity = "blocker" | "major" | "minor" | "question";

interface PrdFinding {
  id: string;                  // PRD-001
  ruleId: string;              // PRD-PAGE-INVENTORY 等
  severity: PrdSeverity;
  category:
    | "scope"
    | "roles"
    | "ia"
    | "states"
    | "fields"
    | "flows"
    | "terminology"
    | "acceptance"
    | "format";
  location: string;            // sec-003 或 missing
  evidence: string;            // 原文引用或“缺失”声明
  issue: string;
  suggestedQuestion?: string;
  /** 仅 severity=question 时有意义；blocking question 必须回答或转假设。 */
  blocking?: boolean;
  owner: "product_owner" | "security_owner" | "data_owner" | "design_owner";
  confidence: number;          // 0..1
}

interface PrdExtract {
  pages: Array<{
    id: string;
    name: string;
    purpose?: string;
    route?: string;
    target?: "web" | "mobile";
    profile?: string;
    roles: string[];
    requiredStates?: string[];
    sourceLocation: string;
  }>;
  roles: Array<{ id: string; description?: string; sourceLocation: string }>;
  flows: Array<{ id: string; steps: string[]; sourceLocation: string }>;
  entities: Array<{
    name: string;
    fields: Array<{ name: string; type?: string; sourceLocation: string }>;
    sourceLocation: string;
  }>;
  acceptanceExamples: Array<{ pageId?: string; text: string; sourceLocation: string }>;
}

interface PrdReviewOutput {
  findings: PrdFinding[];
  readiness: {
    status: "ready" | "blocked";
    blockers: number;
    majors: number;
    questions: number;
    summary: string;
  };
  extract: PrdExtract;
  reviewMarkdown: string;
}
```

约束：

- 每条 blocker 必须有 `location + evidence`；缺失证据的 blocker 由 gate 判为 `PRD_FINDING_INVALID`。
- `confidence < 0.7` 只能输出 `question`；不能作为 blocker。
- `severity=question` 的 finding 用 `blocking` 区分是否阻断；blocking question 必须在 PRD/IA signoff 的 `answers` 中回答，或转为 brief 的 assumption，否则 `PRD_ANSWER_MISSING`。
- `scope: ui-ready`；技术架构、定价、视觉风格不在评审范围，出现时记为 warning 或丢弃。
- Reviewer 不补需求、不写页面、不替作者做决定；只提问、标记、给建议。
- 每轮最多 10 个 blocking questions；超出由 gate 阻断并提示拆分 PRD 或人工处理。3 轮是人工评审流程预算（写入 decision log），v0 不做跨 run 自动计数，因为 PRD 修改会生成新 hash/新 run。
- `extract.pages` 是 PRD 页面清单的结构化版本，供 UI Briefer 与 traceability 使用；不得新增 PRD 中没有的页面。PRD 页面清单没有 id 时，Reviewer 生成 kebab-case id 并在 `sourceLocation` 记录；这是结构归一化，不是新增页面。

### 4.3 PRD/IA Gate

```ts
interface IntakeGateIssue {
  code: string;
  severity: "blocker" | "warning";
  message: string;
  evidence?: string;
}

interface PrdIaGate {
  /** PRD/IA findings 与 waiver 均通过；不包含签核是否已提交。 */
  passed: boolean;
  status: "passed" | "awaiting_signoff" | "blocked";
  signoff: { required: true; valid: boolean; missing: string[] };
  issues: IntakeGateIssue[];
  readiness: PrdReviewOutput["readiness"];
  ia: {
    passed: boolean;
    issues: IntakeGateIssue[];
  };
}
```

- `passed = PRD 无 blocker 且 IA 无 blocker`；签核有效性与 `passed` 分开记录。
- `status = passed` 仅当 `passed && signoff.valid`；`passed && !signoff.valid` 为 `awaiting_signoff`；否则 `blocked`。
- IA gate 复用 M1 `runIaGates` 的结论；本层只增加 signoff 与 PRD hash 一致性。
- 一个 signoff 文件同时覆盖 PRD 与 IA findings；finding id 全局唯一（`PRD-*` / `IA-*`）。
- `waivers` 必须含 `findingId/owner/reason/expires`，过期无效；只有 blocker 需要 waiver。

### 4.4 UI Brief Draft

```ts
interface BriefQuestion {
  id: string;                  // BQ-001
  question: string;
  options?: string[];
  impact: string;
  owner: "product_owner" | "security_owner" | "data_owner" | "design_owner";
  blocking: boolean;
  sourceFindingId?: string;
}

interface BriefAssumption {
  id: string;                  // BA-001
  statement: string;
  source: string;              // PRD section / decision log
  confidence: number;
  blocking: boolean;
  acceptedBy?: string;
}

interface UiBriefDraft {
  brief: UiBrief;              // 候选；orchestrator 会重写 meta
  questions: BriefQuestion[];
  assumptions: BriefAssumption[];
  reviewMarkdown: string;
}

interface BriefGate {
  /** schema/语义/compile dry-run 通过；不包含签核是否已提交。 */
  passed: boolean;
  status: "passed" | "awaiting_signoff" | "blocked";
  signoff: { valid: boolean };
  issues: IntakeGateIssue[];
  compile: { ok: boolean; errors: string[] };
  briefHash?: string;
}
```

- `brief` 必须通过 `UiBriefSchema`；否则 `BRIEF_SCHEMA` blocker。
- `status = passed` 仅当 `passed && signoff.valid`；`passed && !signoff.valid` 为 `awaiting_signoff`；否则 `blocked`。
- `meta.project` 由 orchestrator 从 project config 注入；`meta.profile/platforms` 优先取 project config 的可选字段，缺失时从 PRD 页面清单（Profile/平台列）或已签核 IA map 推导；`meta.sourcePrdHash` 来自 normalized PRD；`meta.date` 来自 clock；`meta.version` 来自 `--brief-version`（默认 `0.1.0`）。Agent 输出中的这些字段被覆盖，不作为事实源。若 profile/platform 无法确定，brief gate 发 blocking question，不猜。
- `ProjectConfig` 增加可选 `profile?: string` 与 `platforms?: ("web" | "mobile")[]`（strict schema 同步扩展，向后兼容）；它们只是项目级默认值，不替代每页的 `profile`/`target`。
- `openQuestions`/`assumptions` 同时写入 brief 的 schema 字段和独立 `questions.json`/`assumptions.json`；独立文件保留 options/impact/source/confidence 等 schema 没有的审计字段。
- 最终 `ui-brief.json` 仍是 `UiBriefSchema` 的严格对象，不夹带草稿元数据。

### 4.5 签核

沿用 M1 的 `<!-- signoff {...} -->` 格式，并扩展可选字段：

```md
# PRD/IA signoff

<!-- signoff
{
  "signer": "张三",
  "date": "2026-10-20",
  "answers": [
    { "questionId": "PRD-004", "answer": "首版只读，不允许编辑", "source": "产品决策" }
  ],
  "waivers": [
    {
      "findingId": "PRD-003",
      "owner": "张三",
      "reason": "字段表在下一轮补，首版用现有字段",
      "expires": "2026-11-20"
    }
  ]
}
-->
```

Brief signoff 额外要求 `briefHash`：

```md
# Brief signoff

<!-- signoff
{
  "signer": "李四",
  "date": "2026-10-20",
  "briefHash": "sha256:...",
  "answers": [],
  "waivers": []
}
-->
```

- `signoff/prd-ia.md` 覆盖 PRD 与 IA 的 blocker waiver 和问题回答。
- 可选 `approvals` 数组用于按决策权矩阵分派：`[{ "owner": "product_owner", "signer": "张三", "date": "2026-10-20" }]`。v0 若省略，则单一 `signer` 视为覆盖所有 owner；若提供，则每个有 blocker/waiver 的 owner 必须有对应 approval，否则 `PRD_OWNER_APPROVAL_MISSING`。
- `signoff/brief.md` 必须匹配候选 brief 的 canonical hash；hash 不匹配 → `BRIEF_SIGNOFF_HASH_MISMATCH`。
- `briefHash` 是对 `UiBriefDraft.brief`（已注入 meta 的候选 brief 对象）做 canonical JSON 的 hash，不是对 `ui-brief.draft.json` 文件字节的 hash；CLI 在 awaiting 状态的 summary 中打印该 hash，供签核使用。
- 签核 schema 扩展保持向后兼容：M1 现有 `signer/date/waivers` 文件仍可解析；`answers`、`briefHash` 为可选。
- 签核文件缺失/无效 → 状态 `awaiting_signoff`，不是 `failed`。

## 5. 状态机与 Resume

### 5.1 状态

```text
init
  -> intake
  -> review ──┬─ prd_review
               └─ ia_review        （并行）
  -> prd_ia_gate
       blocked          -> blocked
       awaiting_signoff -> awaiting_signoff
       passed           -> brief
  -> brief
  -> brief_gate
       blocked          -> blocked
       awaiting_signoff -> awaiting_signoff
       passed + signed  -> done
```

| status | 含义 |
|---|---|
| `success` | PRD/IA 与 brief 均已签核，最终 `ui-brief.json` 已写 |
| `awaiting_signoff` | findings/brief 已就绪，缺有效签核 |
| `blocked` | 存在未 waiver 的 blocker，或 blocking questions 未回答 |
| `partial` | PRD Reviewer 或 IA Agent 一个失败，另一个产物保留；run 不能通过 gate |
| `failed` | intake 不可读、PRD 无效、两个 review 都失败、agent 不可用 |
| `budget_exceeded` | 超整 run 或单 agent 预算 |
| `usage_incomplete` | usage 不完整且未允许未知成本 |

- `degraded=true` 在 `--allow-unknown-cost` 时记录；brief gate 仍可通过，但 summary 明确标记。
- Agent 失败按角色隔离：PRD Reviewer 失败不删除 IA 产物，反之亦然；由于二者都是 gate 必需，最终只能是 `partial`/`failed`。
- 门禁修复：UI Briefer 允许最多 2 轮 schema/语义修复；PRD Reviewer 不自动“修复 PRD”，只重新评审新 hash 的 PRD。

```ts
interface IntakeState {
  schemaVersion: "1.0";
  runId: string;
  project: string;
  prdHash: string;
  stage: "init" | "intake" | "review" | "prd_ia_gate" | "brief" | "brief_gate" | "done";
  status:
    | "success"
    | "awaiting_signoff"
    | "blocked"
    | "partial"
    | "failed"
    | "budget_exceeded"
    | "usage_incomplete";
  signoff: { prdIa: boolean; brief: boolean };
  gates: {
    prd: "pending" | "passed" | "blocked";
    ia: "pending" | "passed" | "blocked";
    brief: "pending" | "passed" | "blocked";
  };
  briefRounds: number;
  briefHash?: string;
  usageComplete: boolean;
  costCny: number;
  degraded: boolean;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
}
```

### 5.2 Resume

```bash
pnpm intake:run --resume /tmp/intake-runs/<runId> \
  --signoff-prd-ia /tmp/signoff-prd-ia.md
```

- resume 读取 `state.json`，校验 PRD hash 与 run 记录一致；不一致 → `PRD_CHANGED`，必须新建 run。
- 已完成的 agent 产物直接复用；不重复调用模型。
- 缺签核时保持 `awaiting_signoff`；补齐签核后从对应 gate 继续。
- brief 阶段因 blocking question 停下后，可在 resume 时通过 brief signoff 的 `answers` 提供回答；UI Briefer 只在需要时重新运行一轮。
- 所有状态变化写入 `logs/intake.ndjson`；不修改已冻结的 `ui-brief.json`。

### 5.3 发布 Brief

- `--publish-brief <path>` 只在 `status=success` 时允许；写入采用临时文件 + rename，避免半成品。
- 目标文件已存在且内容不同：默认拒绝；`--force` 才覆盖，并在日志记录旧 brief hash。
- 发布前再次校验 brief hash 与 signoff 一致；发布后写 `brief-published.json` 审计记录。
- 不自动修改 `project.yaml`；用户可把 `brief` 指向发布路径。

## 6. 抽取与映射规则

### 6.1 PRD Review 规则

| 检查 | 规则 |
|---|---|
| 业务范围 | 必须有明确 in-scope / out-of-scope；缺失 blocker |
| 角色权限 | 角色表 + 页面可见性/操作矩阵；未定义角色引用 blocker |
| 页面清单 | 页面 id/名称/路由/角色/状态/需求编号；缺失 blocker |
| 状态矩阵 | default/loading/error 为基本要求；empty/disabled/success 按 PRD 状态矩阵声明；缺失 blocker |
| 字段表 | 核心实体字段、类型、枚举、必填；缺失 major |
| 流程 | 主流程/回程/异常路径；缺失 major |
| 验收示例 | 章节级缺失 major；单页缺示例 minor |
| 术语 | 同一对象多种叫法；major |
| 占位符 | `【】`/TBD/待确认/空章节；blocker |
| 越界 | 技术架构/定价/视觉风格；warning，不作为 blocker |

- Reviewer 只读 PRD + project metadata；不读现有 brief，避免被手写内容锚定。
- `prd-review.json` 同时写 `prd-findings.json`、`prd-readiness.json`、`prd-extract.json`、`prd-review.md`，方便人工 review 与下游消费。

### 6.2 IA Agent 输入桥接

当前 IA prompt 依赖 `brief.ia.pages`。本设计增加一条 PRD-only 路径：

```ts
interface IaPromptInput {
  prdText: string;
  project: { project: string; platforms: string[] };
  brief?: UiBrief;             // 兼容 M1；提供时沿用现有结构输入
  existingIa?: IaMap;
}
```

- 有 `brief`：行为与 M1 完全一致（回归保护）。
- 无 `brief`：IA Agent 从 PRD 的页面清单/角色/流程中建立 IA map，输出 `IaMapSchema`；页面 id 必须来自 PRD 页面清单，不得发明。
- IA 与 PRD Reviewer 可并行；IA 不依赖 PRD Reviewer 的 findings，但可参考 PRD 原文。
- IA gate 目前以 `UiBrief` 为 scope；intake 阶段还没有 brief，因此把 gate 输入解耦为：
  ```ts
  interface IaGateScope {
    pages: Array<{ id: string; roles: string[] }>;
    roles: string[];
  }
  ```
  M1 调用点用 `scopeFromBrief(brief)` 构造；intake 用 PRD `extract.pages` / `extract.roles` 构造。`runIaGate` 的检查逻辑不变。
- 本层追加 `IA_PRD_HASH_MISMATCH` 与 signoff 检查。

### 6.3 UI Briefer 映射

| PRD / 上游 | UI Brief |
|---|---|
| 页面清单 | `ia.pages[]`：id/name/purpose/route/target/profile/roles/requiredStates |
| 角色权限表 | `product.roles`、`pages[].roles`；未定义角色 → blocker |
| 状态矩阵 | `pages[].requiredStates`；默认补 default/loading/error，empty/disabled/success 按 PRD |
| 字段表 | `pages[].fields`、`data.entities[].fields` |
| 页面操作 | `pages[].actions` |
| 列表/搜索 | `pages[].filterFields` |
| 空态/错误态 | `pages[].emptyTitle`、`pages[].summaryTitle` 或通用空态字段 |
| 验收示例 | `traceability.reqMap`、`openQuestions`/`assumptions` 的证据来源 |
| 需求编号 | `pages[].reqRefs`、`traceability.reqMap` |
| 资产提及 | `assets.icons/illustrations/images` 的语义 id；不生成视觉 brief |
| 项目配置 / PRD 页面清单 | `meta.profile/platforms`、`designDirection.profile`（项目配置优先，缺失时按 PRD 的 Profile/平台列推导） |
| IA map | 页面集合/导航/层级；与 PRD 冲突时以签核 decision 为准，未解决则 blocking question |
| PRD review extract | 页面/角色/字段/流程的初始结构化输入 |

规则：

- **页面集合等于已签核 PRD 的页面清单**；不新增、不删除。IA `proposed` 的页面/导航变更在 v0 不直接写入 brief；需要人工修改 PRD 并重新 review（新 hash）。IA map 只用于校验页面集合/角色/导航一致性。
- `ia.navigation` 优先取 PRD 的导航章节；PRD 未给出时取已签核 IA map；两者冲突且未在 PRD/IA signoff 中解决时，发 blocking question。
- `id` 使用 PRD 页面 id；没有 id 时由页面名生成 kebab-case id，并记录 `assumptions`；重复 id → blocker。
- `archetype` 只能从已支持列表选择：overview/list/detail/form/settings/feed/home/inventory-list/auth/onboarding；无匹配 → `BRIEF_ARCHETYPE_UNSUPPORTED` blocking question，不硬套。
- 如果提供 `existingBrief`（例如迁移 employee-app 手写 brief），只作为对照/semantic regression，不作为事实源；页面/角色/状态仍以签核 PRD 为准，差异记问题或 assumption。
- `product.goals/users/scope/nonGoals/successMetrics` 从 PRD 的业务范围/角色/目标抽取；缺信息记 `assumptions`/questions，不伪造。`product.roles` 必须非空，且每个 role 至少有一个可见 page；否则 `BRIEF_ROLE_MATRIX_MISSING`。
- `fields`/`actions`/`filterFields` 只来自 PRD；无字段表时不要编造，记 blocker/major 并提问。
- `requiredStates` 至少包含 `default/loading/error`，再合并 PRD 状态矩阵（empty/disabled/success 按 PRD 声明）；缺失由 gate 阻断。
- `reqRefs` 必须来自 PRD 需求编号；PRD 没有编号时，生成稳定 `REQ-<MODULE>-NNN`，在 `traceability.reqMap` 记录来源 section，并写入 `assumptions`（这不是业务内容发明，只是追溯 id 归一化）。
- `content` 的 typed 字段（`appointments`、`products`、`quickActions` 等）只在 PRD 明确给出这些对象时使用；不得为了填满模板而伪造样例数据。
- `openQuestions` 的 `blocking` 只在“缺它就无法形成完整 brief/通过 gate”时为 true；其余转 `assumptions`，带 source/confidence。每轮最多 10 个 blocking questions、最多 3 轮；超出由 `BRIEF_QUESTION_OVERFLOW` / `BRIEF_ROUNDS_EXCEEDED` 阻断。
- 视觉颜色、字体、圆角、图标风格不写入 brief；`designDirection` 只使用项目配置的 profile/tone/motionLevel 默认值，具体视觉由 M1 Visual Style Agent 决定。`density`/`tone`/`motionLevel` 缺省用 `dense`/`neutral`/`low`（B 端基线），并写入 assumptions。
- 所有文本不得含 `TBD`/`待确认`/`【】`；需要保留的未知项进入 questions，不进入 brief 字符串。

### 6.4 Canonical 序列化与 hash

- `ui-brief.json` 按 schema 字段顺序稳定序列化；hash 计算使用递归 key 排序的 canonical JSON（`sha256:<hex>`）。
- `meta.date`/`version` 由 orchestrator 注入；agent 输出的同名字段被覆盖。
- 同一份 agent fixture + 同一份 signoff + 同一 `as-of` 时间 → 同一 brief hash；LLM 实时输出不承诺跨调用 byte-identical，但签核后内容冻结。
- `questions.json`/`assumptions.json` 按 id 排序；findings 按 severity + id 排序；gate issues 按 code + evidence 排序。

## 7. 门禁

### 7.1 PRD Gate

| code | severity | 条件 |
|---|---|---|
| `PRD_INPUT_INVALID` | blocker/fatal | 不可读、空文档、编码错误、超过输入上限 |
| `PRD_SECTION_MISSING` | blocker / warning | 缺业务范围/角色权限/页面清单/状态矩阵 → blocker；缺字段表/流程/验收示例 → warning（finding severity 为 major） |
| `PRD_SECTION_EMPTY` | blocker | required section 存在但无内容 |
| `PRD_PLACEHOLDER_UNRESOLVED` | blocker / warning | `【】`/TBD/待确认/空章节；显式“不阻塞”的章节/标题和省略号为 warning |
| `PRD_ROLE_UNDEFINED` | blocker | 页面/操作引用未定义角色 |
| `PRD_BUSINESS_RULE_NO_EXAMPLE` | blocker | 业务规则没有可测试示例 |
| `PRD_MISSING_EMPTY_STATE` / `PRD_MISSING_ERROR_STATE` | warning | 状态矩阵缺空态/错误态（major） |
| `PRD_MISSING_FLOW` | warning | 缺主流程/回程（major） |
| `PRD_TERMINOLOGY_INCONSISTENT` | warning | 同一对象多种叫法（major） |
| `PRD_FINDING_INVALID` | blocker | blocker 无 location/evidence，或 blocker 的 confidence <0.7 |
| `PRD_FINDING_DUPLICATE` | warning | 重复 finding |
| `PRD_QUESTION_OVERFLOW` | blocker | 单轮 blocking question >10 |
| `PRD_REVIEW_AGENT_UNAVAILABLE` | blocker/fatal | Reviewer 不可用；不接受自动通过 |
| `PRD_OUT_OF_SCOPE_FINDING` | warning | 技术/定价/视觉类 finding |
| `PRD_WAIVER_INVALID` | blocker | waiver 缺字段/过期/指向不存在 finding |
| `PRD_OWNER_APPROVAL_MISSING` | blocker | 提供 `approvals` 时，有 blocker/waiver 的 owner 没有对应 approval |
| `PRD_SIGNOFF_MISSING` | blocker（状态为 awaiting） | PRD/IA 签核缺失或无效 |
| `PRD_ANSWER_MISSING` | blocker | blocking question 未回答/未转假设 |
| `PRD_CHANGED` | blocker/fatal | resume 时 PRD hash 与 run 不一致 |

### 7.2 IA Gate

复用 M1 的 `IA_*` 门禁；本层追加：

| code | severity | 条件 |
|---|---|---|
| `IA_PRD_HASH_MISMATCH` | blocker | IA map 不是针对当前 PRD hash 生成 |
| `IA_SIGNOFF_MISSING` | blocker（状态为 awaiting） | PRD/IA 签核缺失或无效 |

### 7.3 Brief Gate

| code | severity | 条件 |
|---|---|---|
| `BRIEF_SCHEMA` | blocker | 候选 brief 不通过 `UiBriefSchema` |
| `BRIEF_PRD_HASH_MISMATCH` | blocker | `meta.sourcePrdHash` 与 normalized PRD 不一致 |
| `BRIEF_PAGE_MISSING` | blocker | 已签核页面在 brief 中缺失 |
| `BRIEF_PAGE_UNKNOWN` | blocker | brief 有签核页面之外的页面 |
| `BRIEF_DUPLICATE_PAGE` | blocker | 重复 page id |
| `BRIEF_ROLE_UNDEFINED` | blocker | 页面角色不在 `product.roles` |
| `BRIEF_ROLE_MATRIX_MISSING` | blocker | 某个 role 没有任何可见页面 |
| `BRIEF_PRODUCT_CONTEXT_MISSING` | warning | goals/users/scope/nonGoals/successMetrics 为空 |
| `BRIEF_ROUTE_CONFLICT` | blocker | 两个页面同 route |
| `BRIEF_ARCHETYPE_UNSUPPORTED` | blocker | archetype 不在支持列表 |
| `BRIEF_ARCHETYPE_TARGET_MISMATCH` | blocker | archetype target 与页面 target 冲突 |
| `BRIEF_PROFILE_UNKNOWN` | blocker | profile 不可用 |
| `BRIEF_STATE_MISSING` | blocker | requiredStates 缺 default/loading/error 或 PRD 要求的状态 |
| `BRIEF_REQ_MISSING` | blocker | page.reqRefs 为空或不在 reqMap |
| `BRIEF_TRACEABILITY_INCOMPLETE` | blocker | reqMap 缺页面/需求映射，或 unmapped 未解释 |
| `BRIEF_PLACEHOLDER` | blocker | brief 字符串含 TBD/待确认/【】 |
| `BRIEF_OPEN_QUESTION_BLOCKING` | blocker | blocking question 未清零 |
| `BRIEF_QUESTION_OVERFLOW` | blocker | 单轮 blocking question >10 |
| `BRIEF_ROUNDS_EXCEEDED` | blocker | 超过 3 轮仍无法形成可签核 brief |
| `BRIEF_ASSUMPTION_BLOCKING` | blocker | blocking assumption 未被签核接受 |
| `BRIEF_COMPILE_FAILED` | blocker | compiler dry-run 失败 |
| `BRIEF_CONTENT_INVALID` | blocker | typed content 出现在不支持的 archetype，或不通过 content schema |
| `BRIEF_SIGNOFF_MISSING` | blocker（状态为 awaiting） | brief 签核缺失/无效 |
| `BRIEF_SIGNOFF_HASH_MISMATCH` | blocker | 签核 briefHash 与候选不一致 |
| `BRIEF_WAIVER_INVALID` | blocker | brief signoff 携带非空 waivers（v0 不允许 brief waiver） |
| `BRIEF_PRD_QUESTION_UNANSWERED` | blocker | PRD blocking question 未回答/未转假设 |
| `BRIEF_DATA_ENTITY_UNKNOWN` | warning | 字段引用的实体不在 data.entities |
| `BRIEF_ASSET_UNKNOWN` | warning | 引用的资产不在 assets 列表 |

- `passed = 无 schema/语义/compile blocker`（签核类 issue 单独用 `signoff.valid` 表达，不计入 findings 的 `blockers` 计数）。
- warnings 写入 gate findings 和 summary，不阻断。
- 状态判定：`PRD_SIGNOFF_MISSING` / `IA_SIGNOFF_MISSING` / `BRIEF_SIGNOFF_MISSING` / `BRIEF_SIGNOFF_HASH_MISMATCH` 属于“签核未完成”，状态为 `awaiting_signoff`；其余 blocker 使状态为 `blocked`。这些签核类 issue 仍写入 findings 供审计，但不计入 findings 的 `blockers` 计数。
- 签核文件缺失时，不评估 `answers`/`waivers`，避免把“等人签”误判为“blocked”；只有签核存在但内容不完整（缺答案、waiver 过期、hash 不匹配）时才产生对应的 blocker。
- v0 只允许 PRD/IA blocker waiver；brief gate 的结构性 blocker 必须修复（改 brief 或回到 PRD 重新 review），不能 waiver。`signoff/brief.md` 的 `waivers` 必须为空。
- Brief gate 失败时只写 `ui-brief.draft.json`、`questions.json`、`assumptions.json` 和 findings；不写 `ui-brief.json`。

## 8. CLI 与产物

### 8.1 命令

```bash
cd pipeline

# 1) 8 页 sample PRD 评审：产出 PRD review + IA map；无 blocker 则停在 awaiting_signoff，否则 blocked
pnpm intake:run \
  --project samples/project.demo-orders.yaml \
  --prd samples/sample-prd.md \
  --runs /tmp/intake-runs

# 2) 人工看 findings 后，带 PRD/IA 签核继续到 brief 草稿
pnpm intake:run \
  --resume /tmp/intake-runs/<runId> \
  --signoff-prd-ia /tmp/signoff-prd-ia.md

# 3) 人工看 brief draft 后，带 brief 签核并发布
pnpm intake:run \
  --resume /tmp/intake-runs/<runId> \
  --signoff-brief /tmp/signoff-brief.md \
  --publish-brief /tmp/demo-orders-ui-brief.json
```

employee-app 的两页路径同理，把 `--project` / `--prd` 换成
`samples/projects/employee-app/project.yaml` 与
`samples/projects/employee-app/prd.md`。

参数：

| 参数 | 说明 |
|---|---|
| `--project <path>` | 项目 YAML；默认 employee-app |
| `--prd <path>` | PRD；默认取 `project.yaml` 的 `prd`；不存在则参数错误 |
| `--runs <dir>` | run 输出目录；默认 `runs` |
| `--resume <dir>` | 继续已有 run；校验 PRD hash |
| `--signoff-prd-ia <path>` | PRD/IA 签核 Markdown |
| `--signoff-brief <path>` | Brief 签核 Markdown |
| `--publish-brief <path>` | 成功后将签名 brief 原子写入目标路径 |
| `--brief-version <semver>` | 最终 brief 版本；默认 `0.1.0` |
| `--existing-brief <path>` | 可选；仅用于对照/回归，不作为事实源 |
| `--runtime standalone\|dsh` | 执行适配器；默认 standalone |
| `--fixtures <dir>` | standalone 的 PRD Reviewer/UI Briefer fixtures |
| `--pricing <path>` | 定价文件；默认 `pipeline/pricing.json` |
| `--max-cost-cny <n>` | 整 run 成本上限；默认 10 |
| `--allow-unknown-cost` | usage 不完整时继续并标记 degraded |
| `--force` | 允许覆盖已存在的不同 brief（需显式） |
| `--json` | stdout 只输出一个 JSON summary |
| `--help` | usage |

- 不提供 `--allow-unreviewed` 走最终 brief；离线测试用显式 signoff fixtures。
- `--existing-brief` 只用于把旧 brief 作为 semantic regression 对照（例如 employee-app 迁移）；不自动读取 `project.yaml` 的 `brief`，避免把旧手写内容当成事实源。
- 参数错误退出 2；其余失败退出 1；`success` 退出 0。

### 8.2 产物

```text
runs/<runId>/
  state.json
  intake.json                    # CLI summary
  input/prd.md                   # 原始 PRD 副本
  artifacts/
    normalized-prd.json
    prd-review.json
    prd-findings.json
    prd-readiness.json
    prd-extract.json
    prd-review.md
    ia-map.json
    ia-findings.json
    ia-proposed.json
    ia-review.md
    ui-brief.draft.json
    questions.json
    assumptions.json
    ui-brief.json                # 仅 status=success
    brief-published.json         # --publish-brief 时
  findings/
    prd-gate.json
    ia-gate.json
    brief-gate.json
  signoff/
    prd-ia.md
    brief.md
  agents/
    prd-review/{prompt.md,output.json,raw.json,stdout.txt,stderr.txt,session.json}
    ia/...
    ui-briefer/...
  logs/intake.ndjson
```

- 所有结构化 artifact 带 envelope（`schemaVersion/project/generatedAt/model/promptHash`）；`ui-brief.json` 例外，保持纯 `UiBrief`，便于现有消费者直接加载。
- raw output/stdout/stderr 统一脱敏；不写 key。
- `state.json` 是唯一状态源；agent 只写自己的 `agents/<role>/`。

### 8.3 `--json` summary

```json
{
  "runDir": "/tmp/intake-runs/run-...",
  "status": "success",
  "prd": {
    "sourceHash": "sha256:...",
    "readiness": "ready",
    "blockers": 0,
    "questions": 2
  },
  "ia": { "passed": true, "blockers": 0 },
  "brief": {
    "passed": true,
    "version": "0.1.0",
    "pages": 8,
    "hash": "sha256:...",
    "path": "/tmp/intake-runs/run-.../artifacts/ui-brief.json"
  },
  "signoff": { "prdIa": true, "brief": true },
  "cost": { "cny": 0.23, "usageComplete": true },
  "error": null
}
```

- `awaiting_signoff`/`blocked` 时 `brief.passed=false`，`brief.path` 为草稿路径或 null。
- 所有字符串经过脱敏。

## 9. 测试策略

### 9.1 测试 seam

- 最高 seam：`runIntake(input, ports)`；纯编排，无 fs/model。
- 单元：normalize、PRD gate、brief gate、signoff/waiver、canonical hash、state machine。
- 集成：`intake:run` CLI + 临时目录 + scripted agent fixtures + compiler dry-run。
- 真实 dsh 只做手工回归，不进默认 `pnpm test`。

### 9.2 测试矩阵

| ID | 层 | 断言 |
|---|---|---|
| T-P2B-01 | unit | Markdown → sections/hash/placeholders/tables；重复运行稳定 |
| T-P2B-02 | unit | PRD Reviewer schema；blocker 必须有 evidence；低 confidence 降级 question |
| T-P2B-03 | unit | required sections 缺失 → blocker/major；越界 finding → warning |
| T-P2B-04 | unit | PRD/IA signoff：waiver、过期、缺字段、answers、approvals、PRD hash |
| T-P2B-05 | unit | IA Agent PRD-only 路径与 brief 兼容路径 |
| T-P2B-06 | unit | 8 页 sample PRD → brief 页面/角色/状态/字段/reqRefs 完整；无伪造内容 |
| T-P2B-07 | unit | blocking question / 未定义角色 / role 无可见页面 / 未知 archetype / 重复 route → blocker |
| T-P2B-08 | unit | compiler dry-run 失败 → `BRIEF_COMPILE_FAILED`，不写最终 brief |
| T-P2B-09 | unit | brief hash 与 signoff 不一致 → blocker；签核后 brief 冻结 |
| T-P2B-10 | unit | canonical hash 稳定；questions/assumptions/findings 排序稳定 |
| T-P2B-11 | integration | CLI success/awaiting_signoff/blocked、exit code、`--json` 单对象 |
| T-P2B-12 | integration | resume 不重复调用已完成 agent；PRD 变更 → `PRD_CHANGED` |
| T-P2B-13 | integration | `--publish-brief` 原子写；冲突默认拒绝；`--force` 记录旧 hash |
| T-P2B-14 | contract | `UiBriefSchema` round-trip；M1 signoff 文件仍可解析 |
| T-P2B-15 | regression | M1 `agent:run`、Spec Engineer、phase1 `2/0`、asset review `13/13`、488+ tests、typecheck |
| T-P2B-16 | manual | 真实 dsh：`samples/sample-prd.md` 8 页 review + brief（真实 findings 以 sample waiver 处理）；employee-app 2 页 brief 与现有手写 brief 语义一致；成本在 10 CNY 内 |

## 10. 验收标准

- [x] `pnpm intake:run --project samples/project.demo-orders.yaml --prd samples/sample-prd.md` 能产出 8 页 PRD 的 review/IA/brief 草稿；PRD/IA gate 在 blocker 清零或有效 waiver 后进入 `awaiting_signoff`。
- [x] 带有效 `signoff/prd-ia.md` resume 后，UI Briefer 产出完整 brief 草稿；无 `TBD`/`待确认`/`【】`；blocking questions 为 0。
- [x] 带有效 `signoff/brief.md` resume 后，写出 `ui-brief.json`；`UiBriefSchema`、语义门禁、compiler dry-run 全部通过。
- [x] brief 页面集合与已签核 PRD/IA 一致；每页有 purpose/archetype/requiredStates/reqRefs；每个角色有可见页面。
- [x] 8 页 sample brief 通过 `UiBriefSchema` + compiler dry-run，并能被 `agent:run` 加载；完整的 8 页 M1 三 gate 属于后续阶段，不在本设计必测范围。
- [x] employee-app 2 页 PRD 生成的 brief 与现有手写 brief 在页面/角色/状态/操作/追溯上语义一致；不要求文本逐字相同。
- [x] 缺 PRD 章节、占位符、未定义角色、blocking question、未知 archetype、compile 失败均被确定性阻断，且不写最终 brief。
- [x] resume 不重复调用已完成 agent；PRD hash 变化会拒绝 resume。
- [x] `--publish-brief` 只在签核后写入，默认不覆盖冲突文件。
- [x] 488+ tests、`pnpm test:dsh` 2 passed、typecheck clean；phase1 `2 pages / 0 blockers`；asset review `13/13`；M1/Spec Engineer 不退化。
- [x] 真实 dsh 运行一次 8 页 PRD 的 review + brief（sample findings 以 waiver 处理），成本低于 10 CNY，`usageComplete=true`。
- [x] 不修改 PRD 原文、不调用模型补需求、不生成 Figma/Studio。

## 11. 实施顺序

1. **共享契约 + intake normalize**（0.5d）
   - `core/contracts/src/prd-review.ts`：`NormalizedPrd`、`PrdFinding`、`PrdReviewOutput`、`PrdExtract`。
   - `core/contracts/src/brief-draft.ts`：`UiBriefDraft`、`BriefQuestion`、`BriefAssumption`、gate issue。
   - `ProjectConfigSchema` 增加可选 `profile`/`platforms`。
   - `core/intake` 包：normalize、hash、sections/placeholders/tables；测试 T-P2B-01。
2. **Agent roles + prompts**（1d）
   - `core/agents`：扩展 `AgentRole`，保留 `DESIGN_AGENT_ROLES`；新增 `prd-review`、`ui-briefer` 角色与 schema/prompt。
   - IA prompt 增加 PRD-only 路径，保留 brief 兼容；IA gate 解耦为 `IaGateScope`，M1 调用点用 `scopeFromBrief` 包装；测试 T-P2B-02/05。
3. **Gates + 状态机**（1d）
   - PRD gate、brief gate、IA gate 复用、signoff/waiver/answers、resume；测试 T-P2B-03/04/06/07/09/10/12。
4. **CLI + 产物 + publish**（0.5d）
   - `intake-cli.ts`、`intake:run` script、BriefValidator（compileProject + PageSpecSchema）、`--json`、`--publish-brief`；测试 T-P2B-08/11/13。
5. **回归 + 真实 run + 文档**（1d）
   - 8 页 sample PRD、employee-app 2 页 PRD；为 employee-app 的 `project.yaml` 补可选 `profile: b-mobile` / `platforms: [mobile]`；`pipeline/docs/prd-review-briefer.md`；README/AGENTS/CHANGELOG；T-P2B-14/15/16。
6. **后续（不属于本设计）**
   - 用 8 页已签核 brief 跑 M1 + Spec Engineer + renderer，完成 Phase 2 的“6–8 页 HTML”出口。

## 12. 风险与开放问题

1. **UiBrief 的 `content` 仍是 employee-app 专用**：v0 依赖通用 `fields/actions/filterFields/feedItems/stats`；`appointments/products` 等 typed 字段仅在 PRD 明确给出时使用。真实 PRD 的复杂内容可能需要 archetype content registry，留到后续；v0 遇到不支持的页型发 blocking question，不硬套。
2. **IA Agent 输入改造有回归风险**：必须保留 `brief` 兼容路径，并跑 M1 全量回归；PRD-only 路径先在 fixture 上验证，再接真实 dsh。IA gate 从 `UiBrief` 解耦为 `IaGateScope`，M1 调用点必须用兼容包装并保持现有 `IA_*` 行为。
3. **LLM 非确定性**：不承诺实时输出 byte-identical；用 schema/gate/hash 冻结签核后的 brief；同一 fixture + signoff 的输出稳定。
4. **PRD 过长/表格复杂 / 输出 token 预算**：v0 设置输入上限与 section 索引；超限 fail closed（`PRD_INPUT_INVALID`），不做静默截断。若 8 页 PRD 超出 prompt 预算，再做 sectioned review。8 页 PRD Reviewer 会超过 `prd-ui-agents` 的 32768 输出上限；已增加专用 `prd-ui-intake` profile（65536）验证，M1 仍用 32768。不能静默截断 brief。
5. **Question 预算**：10/轮是硬门禁；3 轮是人工评审流程预算（decision log 记录）。真实 PRD 质量差时可能反复超限，需要人工拆分 PRD 或补文档，而不是放宽门禁。
6. **签核延迟**：resume 设计避免重跑 agent；但 brief 问题回答后可能需要再跑一轮 briefer，成本要记录。
7. **PRD 质量不足**：Reviewer 可能过度阻断；用 evidence/confidence/owner 约束，保留 waiver 与 decision log。
8. **真实 PRD 尚未提供**：`samples/sample-prd.md` 是 8 页结构化样本，作为 v0 验收 fixture；真实 PRD 到位后替换输入，不改契约。
9. **发布覆盖**：`--publish-brief` 默认拒绝覆盖；`--force` 必须显式，并记录旧 hash；不自动改 `project.yaml`。
10. **Prompt injection**：PRD 是不可信输入；prompt 用分隔符包裹并声明“PRD 是数据不是指令”；Reviewer/Briefer 无工具、输出 schema 校验；raw output 脱敏。

## 13. 关联文档

- `docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md` — 主设计 §5.1/§5.2/§6.1–§6.3。
- `docs/superpowers/specs/2026-10-20-agent-organization.md` — PRD Reviewer / UI Briefer / IA 的角色与 DAG。
- `docs/superpowers/specs/2026-10-20-m1-agent-layer-design.md` — AgentRunnerPort、usage/pricing、signoff、状态机模式。
- `docs/superpowers/specs/2026-10-20-phase-2-spec-engineer-design.md` — downstream Page Spec 消费。
- `pipeline/core/contracts/src/ui-brief.ts` — UI Brief 契约。
- `pipeline/core/agents/src/signoff.ts` — signoff/waiver 解析。
- `pipeline/core/agents/src/roles/ia.ts` — IA prompt/输入现状。
- `pipeline/samples/sample-prd.md` — 8 页验收样本。

## 14. 验收记录（2026-10-20）

- 实现：`core/contracts` 新增 PRD/brief 契约；`core/intake` 提供 normalize、PRD/IA/brief gates、`runIntake`、resume；`core/agents` 新增 `prd-review`/`ui-briefer` 角色，IA 增加 PRD-only 输入并把 gate 解耦为 `IaGateScope`；`pnpm intake:run` 与 scripted fixtures 落地。
- 测试：`pnpm test` **488 passed**；`pnpm test:dsh` **2 passed**；`pnpm typecheck` clean。
- 8 页 demo-orders 端到端：PRD Review + IA 通过；PRD/IA 签核后生成 8 页 brief 草稿；brief 签核（canonical hash 匹配）后 `success`，发布 `ui-brief.json`；scripted run `costCny=0.045144`，`usageComplete=true`。
- employee-app 两页切片：brief gate 通过，2 页草稿，停在 `awaiting_signoff`；PRD/IA 与 brief 分阶段签核。
- 回归：phase1 `2 pages / 0 blockers`；standalone asset review `13/13`；renderer HTML 与签入产物逐字节一致；M1/Spec Engineer 不退化。
- 实现中修正：
  - `requiredStates` 基线改为 `default/loading/error` + PRD 状态矩阵；8 页 sample PRD 对部分页面不要求 `empty`，不能一刀切。
  - 显式标“不阻塞”的 PRD 章节/标题与省略号只记 warning；父章节只含子章节时不算空章节。
  - Brief signoff 必须携带与候选 brief 一致的 canonical `briefHash`；缺失或不匹配停在 `awaiting_signoff`，不写最终 brief。
- 真实 dsh：employee-app 2 页完整跑通（PRD Review + IA + UI Briefer，success，发布 2 页 `ui-brief.json`，累计 **¥0.6948**，`usageComplete=true`）。
- 真实 dsh 8 页 sample：新增 `prd-ui-intake` profile（`maxTokens=65536`）后完整跑通；PRD Reviewer 的真实 findings（F-001）与 IA findings（IA-001/IA-002）以 sample waiver 通过 PRD/IA gate；brief gate 通过，`success` 并发布 8 页 `ui-brief.json`，累计 **¥0.90666**，`usageComplete=true`。
- 实现中修正：signoff 同时携带 PRD/IA waiver；PRD gate 只校验 PRD waiver，IA gate 只校验 `IA-*` waiver；PRD finding id 约定为 `PRD-*`（真实 sample 的 F-001 仍可 waiver）。
- 下游 8 页出口已验证：`samples/project.demo-orders-intake.yaml` 的 Phase 1 `8 pages / 0 blockers`；真实 dsh M1 8 页 `ia:waived / interaction:passed / visualStyle:passed`，`agent:sign` 复用现有 run 完成 visual-style 签核（不调用模型，`success`）；Spec Engineer 8 Page Specs / 0 blockers；renderer 8 页 + index。renderer 补齐 PageShell/MobileShell 全部 slot、通用组件、`mockData`/`fieldLabels`，8 页 Playwright 视觉巡检有真实内容与状态。
- v0 限制：8 页资产 brief 未产出（`SPEC_ASSET_BRIEFS_MISSING` warning）；8 页 asset review / 自动截图 diff 是后续阶段。M1 仍是单 catalog/motion token 输入；真实 UI Briefer 尚未稳定生成 `mockData`/`fieldLabels`。
