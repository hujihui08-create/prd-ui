# core + 双运行时 + dsh M0 设计

- 日期：2026-10-20
- 状态：待用户审阅（设计稿，未实现）
- 决策输入：2026-10-20 讨论，用户选择「全做 / dsh 项目内 headless / 3 个 checkpoint commit / 本地 test-fixture 插画」
- 关联：
  - 交接文档：`docs/handoffs/2026-10-20-prd-ui-agent-dsh-handoff.md` §12
  - Agent 组织：`docs/superpowers/specs/2026-10-20-agent-organization.md`
  - 资产降级：`docs/superpowers/specs/2026-10-20-asset-source-fallback-policy.md`
  - 总体设计：`docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md`

## 0. 结论

1. **一个 core + 两个 runtime adapter**：`pipeline/core/` 是唯一事实源；`runtimes/standalone` 和 `runtimes/dsh` 只做执行层适配，不复制状态机、契约、prompt 或阈值。
2. **core 不 import dsh**：core 只依赖 `AssetProducerPort` / `AssetReviewerPort` 窄接口；dsh 的 session、插件、模型调用全部关在 `runtimes/dsh` 里。
3. **现在不造通用 `AgentRuntime`**：M0 只有 Asset Reviewer 一个 agent，先用窄端口；M1 接 IA/Interaction、有第二个 agent 时再抽 `runAgent/runTool`。
4. **dsh 不拥有状态机**：重试、切源、预算、`unresolved`、`degraded` 全部在 core 的纯状态机里；dsh 只执行“评审一个候选”和确定性工具。
5. **凭据只存引用，值不进仓库**：dsh 配置写 `apiKeyEnv` 引用名；值来自环境变量或 `$DSH_HOME/.credentials.yaml`。Asset Reviewer 必须用 vision 模型，DeepSeek text-only adapter 不够。
6. **目录重排分两步**：先做纯路径的 `core/` + `runtimes/` 重排（包名和 import 不变），再在新 layout 里增加 `asset-review` 和两个 runtime；重排单独 commit，可回滚。
7. **M0 独立于 phase1**：新增 `asset:review` 命令，不改 `Stage`、不改 `run-phase1`；现有 157 测试和 `2 pages / 0 blockers` 保持不变。

## 1. 目标与非目标

### 1.1 目标

- 把当前确定性管线正式划成 **core**，补上 runtime 端口。
- 用 **Asset Reviewer** 做第一个 agent 闭环：13 个资产（10 图标 + 3 插画）走 A 库，产出可审计的 manifest。
- 证明 **standalone 与 dsh 共用同一 core**：同 fixtures、同 decision trace、同 verdict schema。
- 建立 **凭据配置规范**：本地、CI、dsh 桌面、项目 profile 各自怎么配，key 放哪，什么不能进 git。
- 为 M1（IA/Interaction/Visual Style）留下清晰的扩展点，但不提前实现。

### 1.2 非目标

- M0 不实现 IA Agent、Interaction Design Agent、Visual Style Agent；它们的角色契约和端口在 M1 接入，M0 只留扩展点，不复制一套缩小版。
- M0 只接 A 库真实文件；**B/C 的 adapter 接口、source chain、预算、降级、审计在 M0 就实现**，真实供应商的连接、账号/授权/成本在 M2 落地。
- M0 不做 Figma Renderer、截图 diff、录屏/trace 门禁；HTML 渲染和资产 manifest 稳定后再加，避免 baseline 反复重建。
- 不把 `asset:review` 接进 phase1 主状态机（M2 再接）。
- 不做 dsh 桌面端 UX 适配；M0 只做 headless。
- 不把 `@next` 当默认依赖；只锁精确版本。

### 1.3 为什么这样分层

分层不是“功能重要性”，是 **依赖顺序 + 风险隔离**。M0 的目标是用最小的 agent 面验证运行时底座；底座没跑通之前，不要同时叠主观 agent、外部供应商和视觉门禁。

| 推迟项 | 为什么不放 M0 | 什么时候可以提前 |
|---|---|---|
| IA / Interaction / Visual Style Agent | 输出是文档/主观判断，依赖稳定的 UI Brief / Page Spec 契约；dsh headless、vision、工具链没跑通时，会把运行时问题和 prompt/评审问题混在一起，难定位。 | 如果 M0 的 core 契约提前冻结，可以在 M1 让三个 agent 并行；Visual Style 也可以单独提前到 M0.5，但先产出 style pack fixture 即可让资产评审跑起来。 |
| 真实 B/C 供应商 | 阻塞不是代码，是账号、API key、授权、成本、人工签核。M0 已经实现 B/C 的 adapter 接口和状态机，缺的是外部输入；先接 A 库能把闭环、审计、切源逻辑跑通。 | 有 Recraft/Firefly/IconScout key 时，随时加一个 B/C adapter 到 M0.5；core 不需要改。 |
| Figma Renderer / 截图 diff / 录屏 trace | 验证层依赖稳定的 Page Spec + RenderPlan + asset manifest + HTML 渲染；契约还在变时做门禁，每次改动都要重建 baseline。Figma 只做静态帧，HTML 是行为/动效事实源，两套 renderer 同时改会漂移。 | 截图 diff 可以早加一个最小 Playwright + pixelmatch harness（便宜、不依赖 Figma）；Figma/录屏/trace 留到 M3。 |

一句话：**M0 少做的是“外部依赖和主观判断”，不是“架构能力”**。B/C 的状态机、降级、审计、adapter 接口在 M0 就写；IA/Interaction/Visual Style 的端口和契约在 M1 接；视觉门禁在契约稳定后加。

### 1.4 里程碑关系

| 里程碑 | 内容 | 前置条件 | 可并行 |
|---|---|---|---|
| M0（当前） | core + runtime + Asset Reviewer + A 库 13 资产 | 无 | — |
| M0.5（可选） | 一个 B/C 真实 adapter（有 key 才做）；最小 Playwright 截图 harness | M0 闭环绿 | 与 M1 并行 |
| M1 | IA Agent + Interaction Design Agent + Visual Style Agent | M0 的 core 契约冻结；dsh headless 跑通 | 三个 agent 可并行，但每个独立 session |
| M2 | 真实 A/B/C 链 + HTML motion + degraded 审计 | M1 的 style pack 和 interaction spec | 资产链与动效可并行 |
| M3 | Figma Renderer + 截图 diff + 录屏/trace + handoff | M0–M2 契约稳定 | Figma 与视觉门禁可并行 |

> 交接文档内部有一处口径差异：`agent-organization.md` §9 把 Visual Style 放在“1C 当前”，而 `handoff` §4.4 把 Visual Style 放在 M2。本 spec 采用“M0 先用 style pack fixture 让资产评审跑通，M1 再接 Visual Style Agent”的折中；如果希望严格按 §9，可把 Visual Style 提前到 M0.5，但仍然先产出 fixture，不阻塞 M0。

## 2. 现状与约束

### 2.1 现有包已经是干净的 DAG

```text
@prd-ui/contracts
  ├── @prd-ui/design-system
  ├── @prd-ui/compiler      ← contracts + design-system
  ├── @prd-ui/validators    ← contracts + design-system
  └── @prd-ui/renderer-html ← contracts + design-system + compiler
        └── @prd-ui/orchestrator ← 以上全部
```

结论：core 的“抽取”不是搬业务代码，而是补齐 **runtime 边界** 和 **asset-review 领域**。

### 2.2 dsh 的真实状态（2026-10-20 核实）

- npm 最新 `@deepseek-ai/dsh@0.2.1-rc.2`；`latest` 与 `next` 当前同版本，仍是 rc。
- 本机 `dsh` 不在 PATH；桌面版 `2.0.19-next`，`~/.dsh/` 下有 profiles、credentials、agent-presets。
- dsh 是 plugin-first Cordis；`@deepseek-ai/dsh-headless` 提供 one-shot：
  `dsh --profile <name> "<task>"`，最后一条 assistant 文本写到 stdout，完成退出 0，否则 1。
- **第三方插件不能从自己的目录 resolve `@deepseek-ai/*`**（`dsh-superpowers` 源码注释明确说明），只能通过 loader 注入的 `ctx` 或把依赖打包进插件。
- `@deepseek-ai/dsh-llm-deepseek` 是 **text-only**，源码明确拒绝 core image blocks；Asset Reviewer 需要 vision 模型，必须走 `@deepseek-ai/dsh-llm-pi-ai`（多 provider）或自定义 OpenAI-compatible gateway。
- dsh 凭据解析顺序（`dsh-credentials-local` 源码）：
  1. 继承的进程环境（只读，最高优先）
  2. `$DSH_HOME/.credentials.yaml`（dsh 管理，可写）
  3. 启动目录 `.env`（只读 fallback）
  4. `$DSH_HOME/.env`（只读 fallback）
  `$DSH_HOME` 默认 `~/.dsh`。

### 2.3 仓库现状

- `employee-app` 的 asset manifest 是空数组；仓库里没有插画资产。
- `pipeline/runs/` 被 gitignore；`pipeline/artifacts/employee-app/` 是已提交的渲染样例。
- 当前分支 `phase-1b-usability`，checkpoint 已提交为 3 个 commit，未 push。

## 3. 目标结构

### 3.1 目录

```text
pipeline/
  core/                          # 运行时无关，单一事实源
    contracts/
    design-system/
    compiler/
    validators/
    renderer-html/
    orchestrator/                # state machine + run-phase1，不含 CLI
    asset-review/                # 新增：资产领域 + 状态机 + 门禁 + ports
  runtimes/
    standalone/                  # 现有 CLI + 文件系统/模型适配
      src/phase1-cli.ts
      src/render-html-cli.ts
      src/asset-cli.ts
      src/asset/*.ts
    dsh/                         # dsh 插件 + headless adapter
      src/plugin.ts
      src/tools/*.ts
      src/adapter.ts
      preset/asset-reviewer/
      cordis.patch.yml
  dsh/                           # 项目内 dsh profile（不污染 ~/.dsh）
    home/                        # DSH_HOME；profile 定义提交，node_modules/sessions/credentials/.env 忽略
    .env.example
    README.md
  samples/
    assets/m0/                   # 10 图标 + 3 插画 + briefs + scripted reviews
    assets/m0-scenarios/         # retry / unresolved 场景
  artifacts/
  runs/                          # gitignored
  pnpm-workspace.yaml            # core/* + runtimes/* + dsh
```

### 3.2 包名不变

| 目录 | 包名 |
|---|---|
| `core/contracts` | `@prd-ui/contracts` |
| `core/design-system` | `@prd-ui/design-system` |
| `core/compiler` | `@prd-ui/compiler` |
| `core/validators` | `@prd-ui/validators` |
| `core/renderer-html` | `@prd-ui/renderer-html` |
| `core/orchestrator` | `@prd-ui/orchestrator` |
| `core/asset-review` | `@prd-ui/asset-review` |
| `runtimes/standalone` | `@prd-ui/runtime-standalone` |
| `runtimes/dsh` | `@prd-ui/runtime-dsh` |
| `dsh` | `prd-ui-dsh-profile`（private） |

重排只改目录和 workspace globs，不改包名、不改 import、不改业务代码。

### 3.3 依赖方向

```text
core/contracts
  ↑
core/design-system
  ↑
core/compiler / core/validators / core/renderer-html
  ↑
core/orchestrator
  ↑
runtime-standalone        runtime-dsh
  ↑                          ↑
  └────── dsh profile ───────┘
```

- `core/*` 不 import `runtimes/*`，也不 import 任何 `@deepseek-ai/*`。
- `runtime-dsh` 可以 import `core/asset-review` 和 `core/contracts`；构建时打包成单文件，避免 dsh loader 的解析限制。
- `runtime-standalone` 可以 import 所有 core 包。

## 4. Core：`@prd-ui/asset-review`

### 4.1 契约

```ts
type AssetKind = "icon" | "illustration" | "poster";
type SourceTier = "A" | "B" | "C";
type SourceId = "library" | "commission" | "ai-vector" | "ai-raster" | "upload";

interface AssetBrief {
  id: string;
  kind: AssetKind;
  scene: string;
  styleRef: string;
  size: { width: number; height: number };
  format: "svg" | "png" | "jpg";
  constraints: {
    grid?: 16 | 20 | 24;
    strokeWidth?: number;
    currentColor?: boolean;
    noText?: boolean;
    noLogo?: boolean;
    noScreenshot?: boolean;
    safeArea?: number;
    palette?: string[];
  };
  sourceChain: SourceId[];
  brandCritical?: boolean;
  humanSignoffRequired?: boolean;
}

interface AssetCandidate {
  assetId: string;
  source: SourceId;
  sourceTier: SourceTier;
  attempt: number;
  file: { path: string; format: string; hash: string };
  producer: {
    tool: string;
    model?: string;
    prompt?: string;
    seed?: number;
    references?: string[];
  };
  license: string;
  costUsd?: number;
  producedAt: string;
}

interface HardGateResult {
  passed: boolean;
  issues: Array<{
    code: string;
    severity: "blocker" | "warning";
    message: string;
    evidence?: string;
  }>;
}

interface AssetReviewVerdict {
  verdict: "pass" | "retry" | "fallback";
  hardIssues: string[];
  scores: {
    brandFit: number;
    semantics: number;
    consistency: number;
    editability: number;
    composition: number;
  };
  suggestedChanges: string[];
  reason: string;
}
```

`AssetReviewVerdict` 用 Zod 校验；`scores` 为 1–5 整数。Core 还必须校验 verdict 与阈值一致：

- 任一维 `< 4` → 不允许 `pass`；不一致时降级为 `retry` 并记录 `VERDICT_INCONSISTENT`。
- 平均 `< 4.5` → 不允许 `pass`。
- `brandCritical` 平均 `< 4.8` → 不允许 `pass`。
- `hardIssues` 非空 → 不允许 `pass`。

### 4.2 Ports（窄接口）

```ts
interface AssetProducerPort {
  produce(input: {
    brief: AssetBrief;
    source: SourceId;
    attempt: number;
    runDir: string;
  }): Promise<AssetCandidate>;
}

interface AssetReviewerPort {
  review(input: {
    brief: AssetBrief;
    style: VisualStyle;
    candidate: AssetCandidate;
    hardGate: HardGateResult;
    runDir: string;
  }): Promise<AssetReviewVerdict>;
}

interface ArtifactStorePort {
  writeJson(path: string, value: unknown): Promise<void>;
  writeText(path: string, value: string): Promise<void>;
  readText(path: string): Promise<string>;
  hash(path: string): Promise<string>;
}

interface AssetReviewPorts {
  producer: AssetProducerPort;
  reviewer: AssetReviewerPort;
  store: ArtifactStorePort;
  clock: { now(): Date };
}
```

不定义 `runAgent(role, ...)` / `runTool(name, ...)`。等 M1 有 IA/Interaction 两个 agent 后，再把 `AssetReviewerPort` 包装成通用接口；现在造通用层没有第二个消费者。

### 4.3 状态机

```text
ASSET_STARTED
  → SOURCE_SELECTED（按 kind + project 覆盖取链）
  → 对每个 source：
       attempt = 1
       while attempt <= 3:
          ATTEMPT_STARTED
          PRODUCED
          NORMALIZED
          if normalize 失败：
             若可重试且 attempt < 3 → attempt += 1；否则 RECORD_FAILURE → 下一个 source
          HARD_GATE
          if gate blocker 且不可重试：RECORD_FAILURE → 下一个 source
          if gate blocker 且可重试且 attempt < 3：attempt += 1
          REVIEWED
          if verdict pass 且阈值通过：
             FREEZE → MANIFEST → DONE
          if verdict retry 且 attempt < 3：
             attempt += 1（带 suggestions）
          else：
             RECORD_FAILURE → 下一个 source
  → 全部 source 失败：
     UNRESOLVED（run blocked，exit 1）
```

默认链：

| 类型 | 链 |
|---|---|
| 标准 UI 图标 | `A → C → B` |
| 自定义/品牌图标 | `B → C → A` |
| 通用插画 | `A → B → C` |
| 品牌关键插画 | `C → B → A` |
| 海报图像层 | `B → C → A` |
| 产品截图/Logo | 不生成 |

预算：

- 每 source 最多 3 次；每资产最多 9 次。
- A/B 默认 `$1.0` / 30 分钟；C 或超预算人工审批。
- 每次尝试前检查预算；超限 → 停止，`UNRESOLVED` + 人工升级。
- 每次尝试都落盘，不只记最后一次。

降级：

- 最终使用的 source tier 低于默认链的首选 → `degraded: true` + `degradedReason`。
- 全部失败 → `unresolved`，最终 handoff 阻断。
- 不允许静默替换。

### 4.4 硬门禁

Icon：

- XML 合法、SVG root、`viewBox` 存在。
- 24px 网格（`viewBox="0 0 24 24"`；允许 16/20 的显式变体）。
- 线宽 1.5（允许 brief 覆盖）；圆角/端点一致。
- `currentColor`：不写死 fill/stroke 颜色（`none`、`currentColor` 除外）。
- 无 `<text>`、`<script>`、`<foreignObject>`、外链 `href`、位图 `<image>`。
- 整套并排一致性：10 个图标同 stroke/cap/join/grid。
- AI 图标额外挡位：不可位图、不可自动入库，必须人工审校。

Illustration：

- SVG/PNG/JPG；M0 用 SVG。
- 无文字、logo、UI 截图。
- 色板来自 style pack/token；不在 SVG 里写死品牌外颜色。
- 安全区；画布至少 96×72，建议 120×80。
- 三张同风格包；并排一致性检查。
- 不接受“图标拼贴”当插画。

Poster：M2 再做；M0 只保留类型和空实现。

License gate：

- 每个候选必须有 `license`。
- unDraw 等素材不得用于 AI 训练；只用作用户选择的库资产。
- Storyset 等需署名的来源，manifest 记录 attribution。
- 授权不明 → `fallback`，不得 pass。

### 4.5 审计产物

```text
runs/<runId>/
  run.json
  log.ndjson
  assets/
    briefs/<assetId>.json
    attempts/<assetId>/<source>-<n>/
      candidate.<ext>
      candidate.meta.json
      normalized.svg
      gate.json
      review.json
      prompt.md
    frozen/<assetId>/
      asset.svg
      record.json
  asset-review.json
  manifest.json
  dsh/<sessionId>/
    stdout.txt
    stderr.txt
    session.json          # provider/model/trajectory hash，不含 key
```

`asset-review.json` 是完整审计记录；`manifest.json` 是兼容现有 `AssetManifestSchema` 的渲染输入（`project/profile/assets/placeholders/complete`）。M0 不扩展 `AssetManifestSchema`，避免破坏现有 sample；M2 再以可选字段扩展。

### 4.6 Prompt 与 schema 归属

- `core/asset-review` 拥有 `review-prompt.md` 和 `verdict.schema.json`。
- standalone 的 model reviewer 直接读 core 的 prompt/schema。
- dsh 插件构建时把 core 的 prompt/schema 打进包；不在 dsh 目录复制一份。
- 两边都不允许在 runtime 里改阈值或评分维度。

## 5. StandaloneRuntime

### 5.1 组成

```text
runtimes/standalone/
  src/phase1-cli.ts          # 从 core/orchestrator/src/cli.ts 移入
  src/render-html-cli.ts     # 从 renderer-html/src/cli.ts 移入
  src/asset-cli.ts           # 新增 asset:review
  src/asset/artifact-store.ts
  src/asset/library-source.ts
  src/asset/scripted-reviewer.ts
  src/asset/model-reviewer.ts
  src/asset/index.ts
```

- `LibrarySourceAdapter`：读 `samples/assets/m0/library/index.json`，按 brief/scene 解析文件、license、metadata；M0 的 A 库。
- `AiVectorSourceAdapter` / `CommissionSourceAdapter`：M0 只注册，调用时抛 `SOURCE_NOT_CONFIGURED`；用于 M2 和 fallback 测试。
- `ScriptedReviewer`：读 `scripted-reviews.json`，按 `assetId/source/attempt` 返回 verdict；测试和 golden 用。
- `ModelReviewer`：可选；OpenAI-compatible vision 调用，读 `PRD_UI_VISION_*`；无 key 时明确报错，不静默走 scripted。
- `FileArtifactStore`：原子写、hash、目录创建。
- CLI：

```bash
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --runtime standalone \
  --runs /tmp/m0-runs
```

CLI 参数：

| 参数 | 作用 |
|---|---|
| `--runtime standalone\|dsh` | 选择执行层；默认 `standalone` |
| `--assets <dir>` | briefs + library 的目录 |
| `--runs <dir>` | run 产物目录 |
| `--only <assetId>` | 只跑指定资产，可重复；用于先试一个图标/插画 |
| `--dry-run` | 只做 brief 解析、source 解析、hard gate；不调模型、不写 frozen |
| `--reviewer scripted\|model` | standalone 的评审后端；默认 `scripted` |
| `--budget-usd <n>` / `--budget-minutes <n>` | 覆盖默认预算（默认 $1.0 / 30 分钟） |

`--only` 和 `--dry-run` 是 M0 的“先试一个”入口：先跑 `--only icon-home --dry-run` 看 brief/gate 是否成立，再跑 scripted，最后跑 dsh。

### 5.2 与 dsh 的关系

- Standalone 是 **CI/离线的执行层**，不是第二个产品版本。
- 它跑同一 core 状态机、同一 fixtures、同一 schema。
- 测试用 `ScriptedReviewer`；真实视觉评审优先走 dsh；`ModelReviewer` 只是可选的本地路径。
- 任何 standalone 特有的逻辑（fs、env、模型 HTTP）都不得进入 core。

## 6. DshRuntime

### 6.1 项目内 headless profile

不修改 `~/.dsh/profiles/desktop`。在仓库内建：

```text
pipeline/
  .env.example                    # 共享的 key 模板（不提交真实值）
  dsh/
    home/                         # DSH_HOME（gitignored）
      profiles/prd-ui-assets/
        package.json
        cordis.yml                # []
        cordis.patch.yml
        node_modules/
    README.md
```

profile 的 `package.json` 在 `pipeline/dsh/home/profiles/prd-ui-assets/package.json`，相对 `pipeline/runtimes/dsh` 是 `../../../../runtimes/dsh`。关键内容：

```json
{
  "name": "prd-ui-dsh-profile",
  "private": true,
  "dependencies": {
    "@prd-ui/runtime-dsh": "file:../../../../runtimes/dsh"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-headless",
        "@deepseek-ai/dsh-llm-pi-ai",
        "@prd-ui/runtime-dsh"
      ]
    }
  }
}
```

说明：

- `@deepseek-ai/dsh-base`、`dsh-headless`、`dsh-llm-pi-ai` 由锁定的 dsh CLI 安装提供，不在 profile 里重复声明版本；如果 loader 要求显式依赖，以 CLI lockfile 里的精确版本为准，不手写猜测版本。
- dsh CLI 钉在 `pipeline/package.json` 的 devDependencies：`"@deepseek-ai/dsh": "0.2.1-rc.2"`，由 `pnpm-lock.yaml` 锁定。
- 具体 profile 创建/安装命令（`dsh profile init` 还是手写 package.json + pnpm install）是 M0 spike 项；上面的目录形状来自现有 `~/.dsh/profiles/*` 的真实结构。

运行（在仓库根目录）：

```bash
DSH_HOME="$PWD/pipeline/dsh/home" \
  npx -y @deepseek-ai/dsh@0.2.1-rc.2 \
  --profile prd-ui-assets "<task>"
```

`headless` runner 把最后一条 assistant 文本写到 stdout；adapter 解析 stdout 中的 JSON verdict（允许 markdown fence，解析前剥离）。

### 6.2 插件与工具

`@prd-ui/runtime-dsh` 是 Cordis 插件：

```ts
export const name = "prd-ui-assets";
export const inject = ["tools"];
export function apply(ctx, config) { /* register tools */ }
```

工具：

| 工具 | 作用 |
|---|---|
| `read_asset_brief` | 读 brief JSON，返回规范化 brief |
| `normalize_svg` | 调 core 的 SVG 规范化，写回 run 目录 |
| `validate_icon` | 调 core 的 icon hard gate，返回 `HardGateResult` |
| `score_asset` | 校验并规范化 agent 给出的 verdict；不调用模型 |

- `score_asset` 只做 schema/阈值校验，**不生成评分**；评分由 agent 给出，避免“生成方自评”。
- 插件只读 candidate + brief + style + gate；不读 producer 的 prompt/成本/推理。
- 插件不写最终 handoff；只写 `runs/<id>/assets/**`。
- 工具注册 API（`ctx.tools` / `ctx.tools.register` / `defineTool` 的具体形态）以锁定版本的 dsh 源码为准；spike 先用一个最小 tool 验证注册和调用，再写四个工具。

### 6.3 评审协议

每次 attempt：

1. Core 状态机生成 review task：
   - brief（场景/约束/尺寸）
   - style pack（色板/风格）
   - candidate（SVG 源码 + 渲染 PNG；图标 16/20/24px contact sheet）
   - hard gate 结果
   - verdict schema + 评分规则
2. `DshAssetReviewer` 以 `DSH_HOME` + `--profile prd-ui-assets` 启动 headless：
   - 使用 `pipeline/node_modules/.bin/dsh`（锁定版本），不用全局 `dsh`。
   - `cwd = pipeline`，让 `<cwd>/.env` = `pipeline/.env` 生效，和 standalone 共用一份 key 配置。
   - 超时、并发、重试由 core 控制；dsh 只跑一次评审。
3. 解析 stdout 的最后一条 assistant 文本为 JSON；`score_asset` 校验；写入 `review.json`。
4. 保存 `stdout.txt`、`stderr.txt`、`session.json`（provider/model/trajectory hash）；不保存 key。
5. 非 0 退出 / 无 JSON / schema 失败 → `reviewer_error`。

**Reviewer error 不与 asset fallback 混为一谈**：reviewer 坏了，换 source 也修不好。规则：

- JSON 解析失败：1 次 schema-repair（把错误和 schema 回给 agent），不算候选 attempt。
- 仍失败 / 超时 / dsh 崩溃：`reviewer_error`，run 失败，人工处理；不自动切 source。
- 只有 verdict 本身是 `retry`/`fallback` 才走 source 状态机。

### 6.4 插件打包

dsh loader 不能保证从插件目录 resolve workspace 包。做法：

- `runtimes/dsh` 用 esbuild 把 `src/plugin.ts` + `@prd-ui/asset-review` + `@prd-ui/contracts` 打成单文件 ESM `dist/plugin.js`。
- `dist/` 是否提交：不提交；profile 安装时 `pnpm build`。若 dsh loader 对 `file:` 包支持良好，也可以直接引用 workspace 包；两种方式在 spike 里二选一。
- 插件只 import Node builtins 和打包进去的 core；不 import `@deepseek-ai/*`。

### 6.5 Vision 模型配置

Asset Reviewer 必须看图。`dsh-llm-deepseek` 明确拒绝 image blocks，所以 profile 必须注册 `dsh-llm-pi-ai` 的 vision provider：

```yaml
- insert:
    - id: llm-pi-ai
      name: '@deepseek-ai/dsh-llm-pi-ai'
      config:
        providers:
          prd-ui-vision:
            displayName: PRD UI Vision
            apiKeyEnv: PRD_UI_VISION_API_KEY
            api: openai-completions
            baseURL: https://api.example.com/v1   # 按供应商填
            defaultInput: [text, image]
            models:
              - id: vision-model-id
                name: Vision Model
                contextWindow: 128000
                maxTokens: 8192

- id: agent-default-model
  config:
    provider: prd-ui-vision
    model: vision-model-id
    reasoningEffort: high
```

- 如果供应商在 pi-ai catalog 里（如 `openai` / `anthropic`），可以省略 `api`/`baseURL`/`models`，只写 `apiKeyEnv` 和必要的 `modelOverrides`。
- `defaultInput: [text, image]` 只对 catalog 未声明 modalities 的模型生效；catalog 模型以自己的声明为准。
- M0 的模型选择由用户提供；没有 vision key 时，M0 只能用 `--runtime standalone` + scripted reviewer 验证状态机，dsh 真评审留到 key 配好。

## 7. 凭据与密钥配置

### 7.1 dsh 侧

dsh 的 credential seam 只持有 **引用名**（POSIX 环境变量名），值由 provider 管理。解析顺序：

```text
继承的进程环境（read-only，最高优先）
  > $DSH_HOME/.credentials.yaml（dsh 管理，可写）
  > <启动目录>/.env（read-only fallback）
  > $DSH_HOME/.env（read-only fallback）
```

`$DSH_HOME` 默认 `~/.dsh`。因此有四种配置方式：

1. **dsh 桌面版 UI**：Settings → Models，添加 provider、粘贴 key。UI 会把值写入 `~/.dsh/.credentials.yaml`，并按 `${PROVIDER}_API_KEY` 派生引用名（源码 `deriveKeyRef`）。适合日常桌面使用。
2. **shell / CI secret**：`export PRD_UI_VISION_API_KEY=...`，dsh 继承环境，优先级最高。适合 CI、临时运行。
3. **项目 `.env`**：`pipeline/.env`（dsh 以 `cwd=pipeline` 启动，因此是 `<启动目录>/.env`），只读 fallback；适合本仓库本地开发。已被 gitignore。
4. **dsh home `.env`**：`pipeline/dsh/home/.env`；适合固定 profile 的默认值。

本仓库的选择：

- 默认 `DSH_HOME=pipeline/dsh/home`，不碰 `~/.dsh`。
- key 放 `pipeline/.env`（gitignored），或 shell 里 export；standalone 和 dsh 共用这一份。
- 如果 spike 确认 `dsh` 支持 `--profile <path>` 指向仓库外 profile，可以复用 `~/.dsh/.credentials.yaml`；否则就用项目 `.env`。
- 配置里只写 `apiKeyEnv: PRD_UI_VISION_API_KEY`，不写 key 本身。

### 7.2 Standalone 侧

- 同一组变量：`PRD_UI_VISION_API_KEY`、`PRD_UI_VISION_BASE_URL`、`PRD_UI_VISION_MODEL`。
- 来源：shell env，或 `pipeline/.env`（gitignored）；CLI 启动时可选加载。
- 测试默认 `ScriptedReviewer`，不需要 key；显式 `--reviewer model` 才要求 key，缺失时 fail fast 并提示变量名。
- Standalone 不读 dsh 的 credentials；它不 import dsh。

### 7.3 资产源 key（M2）

| 来源 | 引用名示例 | 用途 |
|---|---|---|
| Recraft | `RECRAFT_API_KEY` | B AI 矢量/图像 |
| Adobe Firefly | `FIREFLY_CLIENT_ID` / `FIREFLY_CLIENT_SECRET` | B AI 图像 |
| IconScout / Envato | `ICONSCOUT_API_KEY` / `ENVATO_TOKEN` | C 付费包 |
| 插画师/委托 | 无 API key | C 人工 |

- 这些引用写在 `source-policy.yaml` 的 `apiKeyEnv` 字段，由 runtime adapter 解析。
- M0 A 库不需要任何资产源 key。

### 7.4 安全规则

- `.env`、`pipeline/dsh/home/`、`node_modules/`、`runs/` 全部 gitignore；只提交 `.env.example`。
- 配置/日志/artifacts 不出现 key 值；`log.ndjson` 写入前做 key 模式脱敏。
- 不把 key 放进 prompt、manifest、`asset-review.json`、review task。
- 不把 `~/.dsh/.credentials.yaml` 复制进仓库。
- CI 用 secret 注入环境变量，不用文件。
- key 泄露时：轮换 provider key；检查 `runs/` 和 git history；不依赖删除文件。

## 8. M0 fixtures 与验收

### 8.1 Fixtures

```text
pipeline/samples/assets/m0/
  briefs/
    icons.json            # 10 个图标 brief
    illustrations.json    # 3 个插画 brief
  library/
    icons/*.svg           # Lucide，ISC
    illustrations/*.svg   # 本地 test-fixture，license: test-fixture
    index.json            # id → file/license/style/metadata
  scripted-reviews.json   # standalone 测试 verdict
  LICENSE-lucide.txt
```

- 10 图标：`home`、`package`、`search`、`plus`、`minus`、`chevron-left`、`chevron-right`、`circle-alert`、`refresh-cw`、`user`（对应员工端导航/库存/状态）。
- 3 插画：`empty-inventory`、`network-error`、`sync-loading`；120×80，色板来自风格 token，无文字；明确 `license: test-fixture`，不是最终品牌资产。
- 真实 A 库插画（unDraw/Storyset）放到 M2；M0 先证明闭环和审计，不把测试 fixture 当交付。
- `m0-scenarios/` 放 1 个 retry-then-pass、1 个 3 次失败 → unresolved 的 fixture，用于集成测试；主 `m0` 是 happy path。

### 8.2 命令

```bash
cd pipeline
pnpm test
pnpm typecheck
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/employee-app-runs

pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --runtime standalone \
  --runs /tmp/m0-runs
```

dsh：

```bash
cd pipeline
DSH_HOME="$PWD/dsh/home" \
  pnpm asset:review ... --runtime dsh --runs /tmp/m0-runs-dsh
```

### 8.3 验收清单

- [ ] `m0` standalone：13 个资产全部 `pass`（scripted reviewer），`manifest.json` complete，exit 0。
- [ ] `m0` dsh：13 个资产都得到合法 verdict，非 pass 有记录和原因，无崩溃；通过率由人工确认，不强制 13/13。
- [ ] `m0-scenarios` standalone：retry 与 unresolved 的 decision trace 符合预期，unresolved 时 exit 1。
- [ ] 同一 fixtures + 同一 scripted verdict 下，standalone 与 fake dsh adapter 产出相同 decision trace（时间/路径归一化后）；真实 dsh 只做 schema 校验，不比较 LLM 文本。
- [ ] `asset-review.json` 每次 attempt 都有 source/attempt/verdict/scores/issues/cost/timestamp。
- [ ] `degraded` 在 manifest 和 report 可见；`unresolved` 阻断 handoff。
- [ ] 现有 157 测试 + typecheck + phase1 verify 全部保持。
- [ ] 没有 key 进入 git、日志、artifacts；`.env` 被忽略。
- [ ] dsh CLI 版本锁定在 `pipeline/package.json` + `pnpm-lock.yaml`；profile 目录不重复钉内部包版本；`@next` 不在默认链路。
- [ ] 文档：`pipeline/dsh/README.md`（key 配置）、`pipeline/docs/asset-review-m0.md`（运行与产物）。

### 8.4 第一次使用：从 0 到 13 个资产

```bash
cd pipeline
pnpm install
pnpm test
pnpm typecheck

# 1. 先看一个图标：只解析 brief、source、hard gate，不调模型
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --only icon-home --dry-run \
  --runs /tmp/m0-smoke

# 2. 一个图标走完整状态机（scripted reviewer，无 key、无成本）
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --only icon-home --runtime standalone \
  --runs /tmp/m0-smoke

# 3. 13 个资产全跑（scripted）
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --runtime standalone \
  --runs /tmp/m0-runs

# 4. 配置 vision key 后，先用一个图标验证 dsh
#    pipeline/.env: PRD_UI_VISION_API_KEY / PRD_UI_VISION_BASE_URL / PRD_UI_VISION_MODEL
cd pipeline
DSH_HOME="$PWD/dsh/home" \
  pnpm asset:review \
    --project samples/projects/employee-app/project.yaml \
    --assets samples/assets/m0 \
    --only icon-home --runtime dsh \
    --runs /tmp/m0-dsh-smoke

# 5. 13 个资产真实评审
DSH_HOME="$PWD/dsh/home" \
  pnpm asset:review \
    --project samples/projects/employee-app/project.yaml \
    --assets samples/assets/m0 \
    --runtime dsh \
    --runs /tmp/m0-runs-dsh
```

顺序的理由：先 `--dry-run` 排除 brief/source/gate 问题，再 scripted 排除状态机问题，最后 dsh 只看模型/凭据/评审问题。每次只引入一个变量。

### 8.5 结果怎么看

CLI 结束会打印一行摘要和 run 目录：

```text
Asset review OK: 13 assets, 13 passed, 0 retried, 0 unresolved, 0 degraded
Run: /tmp/m0-runs/run-2026-10-20T....
```

看总账：

```bash
RUN=/tmp/m0-runs/run-2026-10-20T....
jq '.summary' "$RUN/asset-review.json"
jq '.assets[] | {id, status, sourceTier, degraded, attempts: (.attempts | length)}' "$RUN/asset-review.json"
jq '.complete, (.assets | length)' "$RUN/manifest.json"
```

看单个失败/重试：

```bash
jq '.assets[] | select(.status != "passed")' "$RUN/asset-review.json"
# 每次 attempt 的候选、normalized、gate、review 都在：
find "$RUN/assets/attempts" -maxdepth 3 -type f | sort
```

目录语义：

| 路径 | 内容 |
|---|---|
| `run.json` | run 状态、stage、预算、时间；失败原因 |
| `asset-review.json` | 完整审计：每个资产每次 attempt 的 source/verdict/scores/issues/cost/timestamp、fallback/degraded |
| `manifest.json` | 冻结后的资产清单；`complete: true` 才能交给 renderer |
| `assets/briefs/<id>.json` | 实际使用的 brief |
| `assets/attempts/<id>/<source>-<n>/` | candidate、`candidate.meta.json`、`normalized.svg`、`gate.json`、`review.json`、`prompt.md` |
| `assets/frozen/<id>/` | 最终冻结文件 + record |
| `log.ndjson` | 事件流；key 已脱敏 |
| `dsh/<sessionId>/` | dsh stdout/stderr/session 元数据（provider/model/trajectory hash） |

退出码：

- `0`：所有资产 frozen，`manifest.json complete`。
- `1`：有 `unresolved`、`reviewer_error`、`configuration_error` 或预算超限；看 `run.json` 的 `error` 和 `log.ndjson`。
- `--dry-run` 不写 frozen，只看 gate；适合改 brief/SVG 时快速迭代。

常见处理：

- `gate.json` 有 blocker → 先修 SVG 或 brief 的尺寸/网格/currentColor/文字；不要先怀疑模型。
- `review.json` verdict=retry → 看 `suggestedChanges`；同一 source 内重试，最多 3 次。
- `review.json` verdict=fallback → 该 source 不适合，状态机会切下一个 source；M0 A-only 时可能直接 `unresolved`。
- `unresolved` → manifest 不完整，handoff 阻断；人工决定补资产、换 source 或降级 waiver。
- dsh 报错但 standalone 正常 → 先查 key/model/profile，不要改 core。

## 9. 测试策略

### 9.1 单元

- 状态机：首次 pass；第 3 次 pass；3 次 fail → 切源；全 fail → unresolved；预算超限；超时；reviewer error 不切源。
- verdict：单维 <4、平均 <4.5、品牌关键 <4.8、hardIssues 非空、pass 不一致降级。
- 硬门禁：网格/线宽/currentColor/无文字/无 script/无外链；插画无文字/logo/安全区/色板。
- manifest/audit：attempts 完整、fallback/degraded/review 字段完整。

### 9.2 集成 / 合同

- `m0` standalone + scripted reviewer：13 资产 happy path。
- `m0-scenarios`：retry / unresolved。
- `runtime-conformance`：同一 fixtures 跑 standalone 和 fake dsh adapter（进程内），比较 decision trace。
- 真实 dsh：schema 校验通过；不比较 LLM 文本；确定性工具输出 byte-identical。
- SVG 安全：script/foreignObject/外部 href 拒绝；log 脱敏。

### 9.3 回归

- `pnpm test` 157+；`pnpm typecheck`；`pnpm phase1:verify` 2 pages / 0 blockers。
- 目录重排前后各跑一次全量；重排 commit 可单独回滚。

## 10. 错误处理

| 场景 | 行为 |
|---|---|
| 缺 vision key | fail fast，报变量名和配置位置；run `configuration_error` |
| dsh 未安装/版本不符 | fail fast，提示 pinned 版本与安装命令 |
| dsh 非 0 退出 | `reviewer_error`，保存 stderr，不切 source |
| stdout 非 JSON | 1 次 schema-repair；仍失败 → `reviewer_error` |
| verdict schema 不合法 | 同上 |
| reviewer 超时 | 重试 2 次（指数退避）；仍失败 → `reviewer_error` |
| hard gate blocker | 记录 attempt，按可修复性 retry 或切 source |
| 预算超限 | 停止，`unresolved`，人工升级 |
| 全 source 失败 | `unresolved`，exit 1，handoff 阻断 |
| 部分资产失败 | 成功的冻结；失败的 `unresolved`；整体 exit 1 |
| dsh 插件加载失败 | `runtime_error`；不静默回退 standalone |
| 日志写入失败 | run 失败；不能假装成功 |

所有错误写 `log.ndjson` + `run.json`，包含 ruleId/assetId/source/attempt/evidence，不包含 key。

## 11. 迁移与提交顺序

1. **checkpoint**（已完成，3 commits，未 push）：
   - `feat: add b-mobile employee-app slice and html renderer`
   - `docs: add phase 1c, agent organization and asset policy specs`
   - `chore(assets): add buguxinsheng app icon pack`
2. **core 目录重排**：
   - `pipeline/packages/{contracts,design-system,compiler,validators,renderer-html}` → `pipeline/core/*`
   - `pipeline/pipeline/orchestrator` → `pipeline/core/orchestrator`
   - `orchestrator/src/cli.ts` → `pipeline/runtimes/standalone/src/phase1-cli.ts`
   - `renderer-html/src/cli.ts` → `pipeline/runtimes/standalone/src/render-html-cli.ts`
   - 新建 `runtimes/standalone` 的 package.json/tsconfig；更新 `pnpm-workspace.yaml`、根 scripts、README。
   - 跑全量测试。单独 commit，可回滚。
3. **`core/asset-review`**：契约、ports、状态机、门禁、verdict 校验、prompt/schema；单测。commit。
4. **`runtimes/standalone`（资产部分）**：artifact store、library source、scripted reviewer、asset CLI；`m0` fixtures；集成测试。commit。
5. **`runtimes/dsh` + `pipeline/dsh`**：插件、工具、profile、headless adapter；spike 验证 profile 安装与 vision provider；`m0` dsh 跑通。commit。
6. **合同测试 + 文档**：双运行时 decision trace、key 文档、M0 报告。commit。

每个 commit 都必须 `pnpm test` + `pnpm typecheck` 绿；第 2 步之后额外跑 `phase1:verify`。

## 12. 风险与 spike 项

| 风险 / 未知 | 影响 | 处理 |
|---|---|---|
| dsh profile 创建/安装命令不明确 | M0 卡住 | 先 spike：用 `DSH_HOME` + 手写 profile 目录 + `npx dsh --profile ...`；读 `dsh` CLI `--help` |
| headless 只输出最后一条 assistant 文本 | 解析失败 | 任务 prompt 要求“只输出 JSON”；parser 剥离 markdown fence；失败走 schema-repair |
| dsh 插件 loader 不能解析 workspace 包 | 插件加载失败 | esbuild 打成单文件；或用 `file:` 依赖 + `pnpm install`；spike 二选一 |
| 没有 vision key / 模型不支持 image | 无法真评审 | M0 允许 standalone scripted 验证状态机；dsh 真评审需要用户配 key；文档写清 |
| 模型评分不稳定 | 通过率漂移 | 固定模型/seed（provider 支持时）；评分校准集；阈值可调；人工抽检 |
| 插件 API 0.2.x 变动 | 适配层重写 | 锁 `0.2.1-rc.2`；adapter 隔离；`@next` 只做 canary |
| 目录重排破坏 import | 测试红 | 包名不变；`pnpm install` 更新 workspace 链接；重排单独 commit；全量回归 |
| 测试 fixture 被当成真实资产 | 交付误导 | `license: test-fixture`；manifest/report 标注；M2 换真实 A/B/C |
| 成本/时间失控 | 预算超支 | 每 source 3 次、每资产 9 次、$1.0/30 分钟；超限人工 |
| 静默降级 | 品牌风险 | `degraded` 强制可见；`unresolved` 阻断 handoff |

## 13. 开放问题

1. dsh profile 的创建/安装命令，以及 `--profile` 是否支持仓库外路径（决定能否复用 `~/.dsh` 凭据）。
2. Vision provider/model 选型与 key：用户提供；M0 先不绑定具体供应商。
3. 真实 A 库插画（unDraw/Storyset）的授权/署名策略，M2 落地。
4. A 库插画是否也需要人工签核（标准图标只抽检）；M0 test fixture 明确豁免。
5. 是否在 M2 把 `assets` 阶段并入 phase1 `Stage`；M0 保持独立命令。
6. dsh headless 的并发/超时/成本上限是否需要单独的 wrapper 限流。

## 14. 一句话总结

**一份 core 状态机 + 两个薄 adapter**：standalone 负责 CI/离线，dsh 负责真实 vision 评审；`runs/<id>/` 是唯一事实源，key 只以引用名出现，M0 先用 10 图标 + 3 个 test-fixture 插画把 A 库闭环和审计跑通。

## 15. Implementation status（2026-10-20）

M0 已实现并完成本地验证；真实 dsh 视觉评审仍阻塞在 vision key。

### 15.1 已完成

- `pipeline/core/*` + `pipeline/runtimes/*` 目录重排，包名/import 不变。
- `@prd-ui/asset-review`：契约、ports、硬门禁、verdict 阈值、prompt、状态机、manifest、preflight。
- `@prd-ui/runtime-standalone`：fs artifact store、A 库 adapter、scripted/model reviewer、`asset:review` CLI。
- `@prd-ui/runtime-dsh`：Cordis 插件、四个工具、headless adapter、esbuild 单文件构建。
- `pipeline/dsh`：项目内 pinned profile（`@deepseek-ai/dsh@0.2.1-rc.2`），不修改 `~/.dsh`。
- `samples/assets/m0`（10 图标 + 3 插画）与 `m0-scenarios`（retry / unresolved）。
- `README.md`、`CHANGELOG.md`、`AGENTS.md`、`pipeline/docs/asset-review-m0.md`、`pipeline/dsh/README.md`。

### 15.2 验证证据

| 检查 | 结果 |
|---|---|
| `pnpm test` | 231 passed |
| `pnpm typecheck` | clean |
| `pnpm phase1:verify`（employee-app） | `2 pages, 0 blockers` |
| `pnpm asset:review --assets samples/assets/m0 --runtime standalone` | `13 assets, 13 passed` |
| `pnpm asset:review --assets samples/assets/m0-scenarios --runtime standalone` | `1 passed, 1 unresolved`，exit 1 |
| standalone vs dsh-like conformance | 相同 decision trace；确定性资产 byte-identical |
| dsh profile spike | profile 加载、插件激活；无 key 时报 `MISSING_CREDENTIAL: PRD_UI_VISION_API_KEY` |
| dsh end-to-end（本地 mock OpenAI-compatible endpoint） | `--only icon-home` 通过；13 个资产 `13 passed`；每个资产一次 chat-completions 请求；证据在 `runs/<id>/dsh/` |

### 15.3 当前阻塞 / 后续

- 真实 dsh 评审需要用户配置 `PRD_UI_VISION_API_KEY`（及 base URL/model）；未配置时不会伪造 pass。dsh 运行时已用本地 mock OpenAI-compatible endpoint 跑通 13 资产，但真实模型质量/成本尚未测量。
- B/C 真实供应商、IA/Interaction/Visual Style Agent、Figma、截图 diff、录屏/trace 仍按 §1.4 的 M1–M3 顺序。
- dsh 仍是 rc；CLI 与 bundle 版本锁定，`@next` 不作为默认依赖。

### 15.4 提交记录

见 [`CHANGELOG.md`](../../../CHANGELOG.md) 的 “2026-10-20 — Core + dual runtime + M0 asset review”。
