# Phase 2 · Spec Engineer v0 设计（消费 M1 设计与资产输入）

- 日期：2026-10-20
- 状态：Implemented (2026-10-20)
- 输入：M1 Agent 层完成（`agent:run`、IA/Interaction/Visual artifacts、423 tests、真实 dsh clean run ¥0.1973）
- 关联：
  - `docs/superpowers/specs/2026-10-20-m1-agent-layer-design.md`
  - `docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md` §14 Phase 2
  - `pipeline/docs/agent-m1.md`
  - `pipeline/docs/agent-m1-uat.md`
  - `pipeline/core/contracts/src/page-spec.ts`
  - `pipeline/core/compiler/src/compile-page-spec.ts`
  - `pipeline/core/validators/src/semantic.ts`

## 0. 结论

1. **Spec Engineer v0 是确定性 mapper，不是 LLM Agent**：它消费已确认的 UI Brief 与 M1 artifacts，编译并增强 Page Spec；v0 不调用模型、不自动改 brief、不重写布局。
2. **闭合 M1 的最大缺口**：把 `interaction-spec.json`、`motion-spec.json`、`visual-style.json`/`asset-briefs` 真正接到 Page Spec 上，让这些产物不再是旁路。
3. **Page Spec 只做向后兼容的增量**：新增可选 `interactions[].nodeId` 和可选 `motion` 字段；现有 Page Spec（无 `motion`）继续通过 schema 和 renderer。
4. **v0 不改布局/HTML 渲染结果**：interactions/states/motion 只写入 Page Spec；renderer 的 motion 消费是 v0.1，Figma/录屏是 M3。
5. **门禁是确定性的**：brief action 覆盖、interaction state 覆盖、transition 页面存在、motion preset/token、asset brief 引用；不依赖模型判断。
6. **不包含**：PRD Reviewer、UI Briefer、Spec Repair Agent、Figma Renderer、真实 A/B/C 供应商、Studio。

## 1. 当前基线

| 项 | 现状 |
|---|---|
| UI Brief | 手写；employee-app 两页切片已 IA-clean（0 blockers） |
| Page Spec | `compileProject` 按 archetype 生成；`interactions` 只有 `{trigger: action, action: "navigate"}`；`states` 只有名称 |
| M1 artifacts | `ia-map` / `interaction-spec` / `motion-spec` / `visual-style` / `asset-briefs` 已产出，但 Page Spec/HTML 不消费 |
| Renderer | 静态 HTML + 状态切换；不读取 interaction/motion spec |
| 回归 | 423 tests、typecheck clean、phase1 `2 pages / 0 blockers`、asset review `13/13` |

M1 spec §11.3 已明确：“Interaction Spec 尚未被 Page Spec 消费；Spec Engineer 接入是 Phase 2”。本 spec 就是这一接入的第一版。

## 2. 目标与非目标

### 2.1 目标

- 输入一个已完成的 M1 run（至少含 interaction/motion artifacts）和项目 brief，输出**增强后的 Page Spec**。
- Page Spec 的 `interactions` 能表达 M1 trigger 的 action/reaction/nodeId 与 transition 的 target。
- Page Spec 的 `states` 覆盖 interaction spec 的 default/loading/empty/error/disabled/success。
- Page Spec 的 `motion` 携带该页的 bindings、用到的 presets 与 reducedMotion；preset 只引用 M1 token。
- 扫描 Page Spec 中的 asset 引用，与 M1 asset briefs 对齐；缺失为 blocker，未被引用为 warning。
- 全程确定性：同一输入产生 byte-identical Page Specs；输出 `spec-engineer.json` 与 gate findings。
- 不回归 Phase 1、renderer、asset review、M1。

### 2.2 非目标

- 不做 PRD Reviewer、UI Briefer、Spec Repair Agent。
- 不把 `motion` 真正动画到 HTML（v0.1）。
- 不自动修改 UI Brief、不自动补页面/动作。
- 不做 Figma Renderer、截图 diff、录屏/trace、Handoff。
- 不做 M2 真实资产供应商、Studio、生产服务。
- 不解决 M1 UAT 里与 Spec Engineer 无关的 6 条 findings（搜索建模、forbidden 状态、在途字段、命名、回程 flow、空态文案）；这些属于 UI Briefer/Interaction schema/后续切片。

## 3. 架构

```text
runs/<m1-runId>/artifacts/               ui-brief.json
  ia-map.json                            project.yaml
  interaction-spec.json                       │
  motion-spec.json                            ▼
  visual-style.json                    compileProject(brief)
  asset-briefs/*.json                        │ base Page Specs
        │                                    │
        └──────────────┬─────────────────────┘
                       ▼
              core/spec-engineer
              - applyInteractions
              - mergeStates
              - attachMotion
              - collectAssets
              - runSpecEngineerGates
                       │
                       ▼
runs/<spec-runId>/
  artifacts/page-spec/<pageId>.json
  findings/spec-engineer-gate.json
  spec-engineer.json
  logs/spec-engineer.ndjson
```

- `core/spec-engineer` 是 runtime-neutral：只依赖 `@prd-ui/contracts`、`@prd-ui/compiler`、`@prd-ui/agents` 的 schema；不 import `node:fs`/`node:child_process`/`@deepseek-ai/*`。
- `runtimes/standalone` 负责读取 M1 run、brief、写文件；新增 `pnpm spec:engineer` CLI。
- 不新增第三个 runtime；dsh 不参与 v0（无模型调用）。

## 4. 数据契约

### 4.1 输入

```ts
interface SpecEngineerInput {
  brief: UiBrief;
  baseSpecs: PageSpec[];              // compileProject(brief)
  interactionSpec: InteractionSpec;   // M1 artifact content
  motionSpec: MotionSpec;             // M1 artifact content
  iaMap?: IaMap;                      // optional; page/route drift check
  assetBriefs?: AssetBrief[];         // plain M0 AssetBrief files
  generatedAt: string;                // ISO; summary only
}
```

- interaction/motion 的 schema 直接复用 `@prd-ui/agents` 的 `InteractionSpecSchema` / `MotionSpecSchema`；不在 spec-engineer 复制。
- M1 artifact 的 envelope 由 `ArtifactEnvelopeSchema` + content schema 解析；`core/agents` 导出 artifact schemas 供消费（见 §10 Task 1）。
- artifact envelope 的 `project` 必须等于 `brief.meta.project`；不一致 → `SPEC_INPUT_INVALID`。
- `assetBriefs` 可缺省；缺省时 asset gate 记 warning，不阻断 Page Spec 生成。

### 4.2 Page Spec 扩展

`core/contracts/src/page-spec.ts` 增加两个向后兼容字段。

```ts
interface Interaction {
  trigger: string;
  action: string;
  target?: string;
  reqRef?: ReqId;
  /** M1 interaction trigger 的 nodeId；用于重放/定位。 */
  nodeId?: string;
}

interface PageMotionPreset {
  durationMs: number;
  easing: string;
  staggerMs?: number;
  distance?: string;
}

interface PageMotion {
  /** 本页用到的 presets（从 motionSpec.presets 解析）。 */
  presets: Record<string, PageMotionPreset>;
  /** 只保留 pageId === 当前页的 bindings。 */
  bindings: Array<{ nodeId?: string; preset: string }>;
  reducedMotion: { fallback: "none" | "fade" | "instant" };
}

interface PageSpec {
  // ...existing fields
  /** 可选；v0 只携带，不驱动 HTML 动画。 */
  motion?: PageMotion;
}
```

- `PageSpecSchema` 的 `interactions` 增加可选 `nodeId`；`PageSpecSchema` 顶层增加可选 `motion`（strict 嵌套）。
- `motion.presets` 的 shape 与 M1 `MotionPreset` 一致，但定义在 contracts 中，避免 core/contracts 依赖 agents。
- 现有 Page Spec 不写 `motion`，继续通过 schema；renderer/validators 不读取 `motion` 也不报错。

### 4.3 输出

```ts
interface SpecEngineerResult {
  specs: PageSpec[];
  gate: SpecEngineerGateResult;
  summary: SpecEngineerSummary;
}

interface SpecEngineerSummary {
  schemaVersion: "1.0";
  runId: string;
  project: string;
  agentRunId?: string;
  generatedAt: string;
  pages: string[];
  motionPages: string[];
  assets: {
    referenced: string[];
    unusedBriefs: string[];
    missing: string[];
  };
  gate: SpecEngineerGateResult;
  passed: boolean;
  error?: string;
}
```

- Page Spec 文件本身不带 runId/generatedAt；`spec-engineer.json` 记录 run 元数据。
- 同一 brief + M1 artifacts → Page Spec 内容 byte-identical（字段顺序按 brief 页序、interaction 数组序、preset key 排序）。

## 5. 映射规则

### 5.1 Pages

- 以 `compileProject(brief)` 的 Page Spec 为 base；页序与 brief 一致。
- brief 页在 interaction spec 中缺失 → `SPEC_PAGE_MISSING`（blocker）；interaction spec 有 brief 外页面 → `SPEC_PAGE_UNKNOWN`（blocker）。
- 不新增/删除页面；v0 不根据 IA proposed patch 改 brief。

### 5.2 Interactions

对每个 Page Spec：

1. **Transitions**：按 `interactionSpec.pages[].transitions` 顺序生成
   ```ts
   {
     trigger: transition.trigger,
     action: "navigate",
     target: routeOf(transition.to),
     reqRef: page.reqRefs[0],
   }
   ```
   `transition.from` / `to` 必须是 brief 页面；否则 `SPEC_TRANSITION_PAGE_UNKNOWN`。
2. **Triggers**：按 `triggers[]` 顺序生成
   ```ts
   {
     trigger: trigger.action,
     action: trigger.reaction,
     nodeId: trigger.nodeId,
     reqRef: page.reqRefs[0],
   }
   ```
   trigger 的 `action` 为空或 `reaction` 为空由 M1 schema 拦截；v0 不重复校验。
3. **替换 base interactions**：用上述集合替换 compiler 生成的 `{trigger: action, action: "navigate"}`。base action 覆盖由 gate `SPEC_ACTION_MISSING` 保证。
4. **去重**：按 `JSON.stringify({trigger, action, target, nodeId})` 去重，保留首次出现；顺序为 transitions 后 triggers。
5. 不在 trigger 上强行推导 `target`：trigger.reaction 是 prose，不做字符串匹配；导航语义只来自 transitions。
6. trigger 数量可以多于 brief `actions`：M1 interaction spec 会建模 tab、刷新、筛选、错误重试等系统交互；gate 只要求 brief actions 被覆盖，不把额外 trigger 当作 orphan。

### 5.3 States

对每个 Page Spec：

- 以 compiler 的 `states`（archetype + brief requiredStates）为 base。
- 对 interaction spec 的每个 state key：
  - 若 Page Spec 无该 key，新增 `{ name: key }`。
  - 若有，保留现有字段；若没有 `description`，写入 `interaction.states[key].join("; ")`。
- `default` 必须存在（PageSpecSchema 已要求；interaction schema 也要求）。
- base 有、interaction 没有的 state（例如 archetype 自带 disabled）保留，记 warning `SPEC_STATE_UNMAPPED`。
- 不在 v0 生成 `overrides`：interaction states 是 prose，不是 node id；避免伪造。

### 5.4 Motion

对每个 Page Spec：

1. 过滤 `motionSpec.bindings`：`binding.pageId === spec.meta.pageId`。
2. 无 binding → 不写 `motion`（字段可选）。
3. 有 binding：
   - `usedPresets = unique(bindings.map(b => b.preset))`。
   - `presets = Object.fromEntries(usedPresets.sort().map(name => [name, motionSpec.presets[name]]))`。
   - `bindings = bindings.map(({nodeId, preset}) => ({...(nodeId ? {nodeId} : {}), preset}))`，保持原顺序。
   - `reducedMotion = motionSpec.reducedMotion`。
4. Gate：
   - binding 的 page 不存在 → `SPEC_MOTION_BINDING_PAGE_UNKNOWN`（blocker）。
   - preset 不在 `motionSpec.presets` → `SPEC_MOTION_PRESET_UNKNOWN`（blocker）。
   - preset 的 `durationMs` 不是 `tokens.duration` 的 `Nms` 值 → `SPEC_MOTION_TOKEN_MISMATCH`（blocker）。
   - preset 的 `easing` 不是 `tokens.easing` 的 key/value → `SPEC_MOTION_TOKEN_MISMATCH`（blocker）。
   - binding 的 `nodeId` 在 layout 中找不到 → `SPEC_MOTION_NODE_UNRESOLVED`（warning；v0 编译器还没有稳定 node id）。
5. v0 不把 motion 写入 HTML；renderer 继续使用 profile motion token。

### 5.5 Assets

- 建立 Page Spec 的 asset 引用索引：
  - `node.assetRef`
  - `node.props.assetRef`
  - `node.type === "QuickAction"` → `node.props.icon`
  - `node.type === "Icon"` → `node.props.name`（如果存在）
  - 不扫描 `EmptyState`/`TopBar` 的系统图标（`event_busy`、`call`、`search_off`、`notifications` 等不是 brief asset）。
- 每个引用 id 必须有同 id 的 `AssetBrief`；否则 `SPEC_ASSET_MISSING`（blocker）。
- `assetBriefs` 中没有被任何 Page Spec 引用的 id → `SPEC_ASSET_UNUSED`（warning）。两页切片只引用 `inventory`，其余 9 个 brief 是后续切片资产，warning 是预期。
- 不运行资产评审；asset briefs 仍交给 M0 `asset:review`。
- `SPEC_ASSET_BRIEFS_MISSING`（warning）：M1 run 没有 asset-briefs 目录或为空；Page Spec 仍生成。

### 5.6 Traceability

- 保留 `traceability.reqMap` / `unmapped`。
- `designDefaults` 追加可审计条目（去重、排序）：
  - `motion:<preset>` 每个本页用到的 preset
  - `asset:<id>` 每个本页引用且有 brief 的 asset
- 不改变 reqRef 语义；`interactions[].reqRef` 使用页面第一个 reqRef。

### 5.7 Determinism

- 页序：brief 页序。
- transitions：interaction spec 原顺序；triggers：原顺序。
- presets：key 排序；designDefaults：排序去重。
- Page Spec 不含时间戳；`spec-engineer.json` 的 `generatedAt` 来自 clock。
- 同一输入两次运行，`artifacts/page-spec/*.json` byte-identical。

## 6. 门禁

| code | severity | 条件 |
|---|---|---|
| `SPEC_INPUT_INVALID` | blocker/fatal | M1 run 不可读、state 为 `running`/`failed`/`budget_exceeded`/`usage_incomplete`、artifact `project` 与 brief 不一致、interaction/motion artifact 缺失或 schema 失败 |
| `SPEC_SCHEMA` | blocker | 增强后的 Page Spec 不通过 `PageSpecSchema` |
| `SPEC_PAGE_MISSING` | blocker | brief 页面在 interaction spec 中缺失 |
| `SPEC_PAGE_UNKNOWN` | blocker | interaction spec 有 brief 外页面 |
| `SPEC_ACTION_MISSING` | blocker | brief page action 没有被任何 trigger 覆盖 |
| `SPEC_STATE_MISSING` | blocker | interaction state key 没有进入 Page Spec states（映射后不应出现） |
| `SPEC_STATE_UNMAPPED` | warning | base state 没有 interaction 描述 |
| `SPEC_TRANSITION_PAGE_UNKNOWN` | blocker | transition from/to 不是 brief 页面 |
| `SPEC_MOTION_BINDING_PAGE_UNKNOWN` | blocker | motion binding 的 page 不是当前页/不存在 |
| `SPEC_MOTION_PRESET_UNKNOWN` | blocker | binding 引用不存在的 preset |
| `SPEC_MOTION_TOKEN_MISMATCH` | blocker | preset duration/easing 不是 token |
| `SPEC_MOTION_NODE_UNRESOLVED` | warning | binding nodeId 在 layout 中找不到 |
| `SPEC_ASSET_MISSING` | blocker | Page Spec 引用的 asset 没有 brief |
| `SPEC_ASSET_UNUSED` | warning | asset brief 没被任何 Page Spec 引用 |
| `SPEC_ASSET_BRIEFS_MISSING` | warning | M1 run 没有 asset briefs |
| `SPEC_IA_PAGE_MISSING` | warning | 提供 IA map 时，IA 页在 Page Spec 中缺失 |
| `SPEC_IA_PAGE_UNKNOWN` | warning | 提供 IA map 时，Page Spec 页不在 IA 中 |

- `passed = no blocker`。
- 不因为 warning 阻止输出 Page Spec；warning 写入 gate findings 和 summary。
- 失败时仍写 `findings/spec-engineer-gate.json` 和 `spec-engineer.json`；不写半成品 Page Spec（要么全部通过 schema，要么只写 findings）。

## 7. CLI 与产物

```bash
cd pipeline
pnpm spec:engineer \
  --project samples/projects/employee-app/project.yaml \
  --agent-run /tmp/m1-agent-runs/<runId> \
  --runs /tmp/spec-engineer-runs
```

参数：

| 参数 | 说明 |
|---|---|
| `--project <path>` | 项目 YAML；默认 employee-app |
| `--agent-run <dir>` | 必填；M1 run 目录（读 `artifacts/*`） |
| `--runs <dir>` | 输出目录；默认 `runs` |
| `--json` | stdout 只输出一个 JSON summary |
| `--help` | usage |

- CLI 读取 `ui-brief.json`（project 的 `brief`），`compileProject` 生成 base specs。
- 读取 M1 `state.json`：允许 `success` / `awaiting_signoff` / `partial`（artifact 齐全时）；拒绝 `running` / `failed` / `budget_exceeded` / `usage_incomplete`。
- 读取 `artifacts/interaction-spec.json`、`motion-spec.json`、可选 `ia-map.json`、`asset-briefs/*.json`。
- 写：
  ```text
  runs/<runId>/
    spec-engineer.json
    artifacts/page-spec/<pageId>.json
    findings/spec-engineer-gate.json
    logs/spec-engineer.ndjson
  ```
- 退出码：0 pass，1 gate failed/输入无效，2 参数错误。
- `--json` 输出 `{runDir, status, gate, pages, motionPages, assets, error}`，脱敏。

## 8. 测试策略

### 8.1 测试 seam

- 最高 seam：`runSpecEngineer(input)` + `SpecEngineerInput`；纯函数，无 fs/model。
- CLI 测试用临时目录和现成 M1 run fixture（`samples/agents/m1` 不够，需要完整 artifact envelope；测试可构造）。
- 真实 dsh 只做手工回归，不进默认 `pnpm test`。

### 8.2 测试矩阵

| ID | 层 | 断言 |
|---|---|---|
| T-P2-01 | unit | transition → `{trigger, action:"navigate", target:route}`；trigger → `{trigger:action, action:reaction, nodeId}` |
| T-P2-02 | unit | base interactions 被替换；brief action 全覆盖；去重与顺序稳定 |
| T-P2-03 | unit | states 合并 default/loading/empty/error/disabled/success；description 写入；default 保留 |
| T-P2-04 | unit | motion 只保留当前页 bindings；presets 解析；reducedMotion 写入 |
| T-P2-05 | unit | motion token 不匹配/未知 preset/未知 page → blocker |
| T-P2-06 | unit | assetRef/QuickAction icon 索引；缺失 → blocker；未用 → warning |
| T-P2-07 | unit | 未知页面/transition → blocker |
| T-P2-08 | unit | 增强后的 Page Spec 通过 `PageSpecSchema` |
| T-P2-09 | unit | 同一输入两次运行 Page Spec byte-identical |
| T-P2-10 | unit | IA map 页面漂移 → warning（提供时） |
| T-P2-11 | integration | CLI 读取 M1 run、写 artifacts、`--json` 单对象、退出码 |
| T-P2-12 | integration | M1 run 缺失/state failed/项目不一致 → `SPEC_INPUT_INVALID`，不写 Page Spec |
| T-P2-13 | regression | phase1 `2/0`、renderer HTML 不变、asset review `13/13`、`pnpm test`/`test:dsh`/typecheck |
| T-P2-14 | manual | employee-app 真实 M1 run（`success`/`awaiting_signoff`）→ 2 个增强 Page Spec，gate pass |
| T-P2-15 | contract | asset-briefs 用 M0 `AssetBriefSchema` 解析；motion/interaction artifact 用 agents schema 解析 |

## 9. 验收标准

- [x] `pnpm spec:engineer` 能消费一个 employee-app M1 run，产出 2 个增强 Page Spec。
- [x] 每个 brief action 在 Page Spec 中有 trigger/action；每个 interaction state 进入 Page Spec。
- [x] Page Spec 的 `motion` 只引用 M1 token；preset/binding/page 校验通过。
- [x] Page Spec 引用的 asset 都有 brief；未用 brief 记 warning。
- [x] 同一输入 byte-identical；`spec-engineer.json`/gate findings 齐全。
- [x] 现有 Phase 1 `2 pages / 0 blockers`、renderer、asset review、M1 回归不退化。
- [x] `pnpm test` ≥423；`pnpm test:dsh` 2 passed；typecheck clean。
- [x] 不修改 UI Brief、不调用模型、不做 Figma/Studio。

## 10. 实施顺序

1. **Contracts + artifact schemas**（0.5d）
   - `PageSpec.interaction.nodeId?`、`PageSpec.motion?` + schema。
   - `core/agents` 导出 `InteractionSpecArtifactSchema` / `MotionSpecArtifactSchema` / `VisualStyleArtifactSchema`（从 `run-m1.ts` 抽到 `artifacts.ts`）。
   - 测试：旧 Page Spec 解析不变；新字段 round-trip。
2. **Mapping**（1d）
   - `core/spec-engineer/src/apply.ts`：interactions、states、motion、assets、designDefaults。
   - 测试 T-P2-01..04/06/08/09。
3. **Gates**（0.5d）
   - `core/spec-engineer/src/gates.ts`；测试 T-P2-05/07/10。
4. **CLI + 产物**（0.5d）
   - `runtimes/standalone/src/spec-cli.ts`、`spec:engineer` script、artifact loading。
   - 测试 T-P2-11/12。
5. **回归 + 真实 run + 文档**（1d）
   - phase1/renderer/asset/M1 回归；employee-app 真实 M1 run 消费；`pipeline/docs/spec-engineer-v0.md`；CHANGELOG/README/AGENTS。
6. **v0.1（后续）**
   - renderer 消费 motion（data attributes/CSS vars）；稳定 node id；Spec Repair Agent。

## 11. 风险与开放问题

1. **Motion binding 的 nodeId 不稳定**：当前 compiler 只给部分节点 id；v0 把无法解析的 nodeId 记为 warning，不阻断。Phase 2.1 给 layout 节点稳定 id 后再升级为 blocker。
2. **Interaction 的 prose 映射是结构性的**：trigger.reaction 直接写入 Page Spec `action`，不做语义归一化；避免用字符串猜测导航目标。
3. **Renderer 在 v0 不消费 motion**：Page Spec 已携带，HTML 不变；v0.1 再接 CSS/JS。验收不能拿“页面动效变了”当 v0 通过标准。
4. **Asset briefs 大量未使用**：两页切片只引用 `inventory`；其余 brief 是后续页面资产，warning 是预期，不是缺陷。
5. **搜索/forbidden 等 M1 findings 不在 v0 范围**：搜索建模需要 UI Briefer/Interaction schema；forbidden 需要角色守卫；v0 只消费已有 interaction spec。
6. **IA map 只做页面漂移检查**：v0 不根据 IA proposed patch 改 brief；IA 的页面树/导航建议仍由人工处理。
7. **M1 run 状态**：`awaiting_signoff` 允许消费；`failed`/`budget_exceeded`/`usage_incomplete` 拒绝。若未来需要“先出 Page Spec 再签核”，可加 `--allow-unsigned`，v0 不做。

## 12. 关联文档

- `docs/superpowers/specs/2026-10-20-m1-agent-layer-design.md` — M1 契约、门禁、产物。
- `docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md` §14 — Phase 2 目标。
- `pipeline/docs/agent-m1.md` — M1 使用说明。
- `pipeline/docs/agent-m1-uat.md` — M1 验收矩阵与剩余 findings。
- `pipeline/core/contracts/src/page-spec.ts` — Page Spec 契约。
- `pipeline/core/compiler/src/compile-page-spec.ts` — base Page Spec 生成。
- `pipeline/core/validators/src/semantic.ts` — 现有语义门禁。

## 13. 验收记录（2026-10-20）

- 实现：`core/spec-engineer`（apply/gates/run）、`PageSpec.interactions[].nodeId`、`PageSpec.motion`、agents artifact schema 导出、`pnpm spec:engineer`、`pipeline/docs/spec-engineer-v0.md`。
- 测试：`pnpm test` **448 passed**（原 423）；`pnpm test:dsh` **2 passed**；`pnpm typecheck` clean。
- 回归：employee-app Phase 1 `2 pages / 0 blockers`；standalone asset review `13/13`；renderer HTML 不变；M1 回归不退化。
- 真实 employee-app clean M1 run 被消费：2 个增强 Page Spec；每页 10 条 interactions；states 覆盖 default/empty/loading/error/disabled/success；两页都有 motion；**0 blockers**；28 warnings（19 个 `SPEC_MOTION_NODE_UNRESOLVED`、9 个 `SPEC_ASSET_UNUSED`）；`assets.referenced=["inventory"]`，`missing=[]`。
- 实现中修正：移除 `SPEC_ACTION_ORPHAN` warning。M1 interaction spec 会合法地包含 tab/刷新/筛选/错误重试等系统 trigger；gate 只要求 brief actions 被覆盖，不把额外 trigger 当 orphan。
- 已知 v0 限制：motion 未动画到 HTML；未解析 nodeId 只记 warning；不做 Spec Repair；6 条 M1 非阻断 findings 不在范围。
