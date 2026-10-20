# Asset Review Hardening (M0.5) — Design Spec

- 日期：2026-10-20（2026-10-20 实施评审后更新）
- 状态：Implemented（2026-10-20）
- 输入：真实 `deepseek-flash` 13/13、233 tests、M0 审计清单、2026-10-20 实施评审
- 关联：
  - `docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md`
  - `docs/superpowers/specs/2026-10-20-asset-review-hardening-test-plan.md`
  - `docs/superpowers/plans/2026-10-20-asset-review-hardening.md`
  - `pipeline/docs/asset-review-m0.md`
  - `CHANGELOG.md`

## 0. 结论

### 0.1 本次评审已钉死的决策

- **D1 dsh 传输**：统一使用 `dsh --profile <name> --json -`，task 走 stdin；verdict 取 `final.text`，usage 取 `status(step_end).usage`。
- **D2 成本**：无效 verdict、非零退出、重试 step 也要记账；usage 不完整且设置了预算时默认 fail closed，不伪造 0 成本。
- **D3 H7 渲染**：SVG→PNG 在 standalone 侧完成，通过路径注入 dsh reviewer；`@resvg/resvg-js` 不进入 dsh 插件 bundle。
- **D4 H5 provider**：dsh 和 standalone model reviewer 都要校验 base/model；删除所有 OpenAI 默认值。
- **D5 H3 隔离**：reviewer error 用资产级 `reviewerFailed` 标志，不切 source；只有 `--fail-fast` 才中断整批。
- **D6 H2 范围**：`--only` 是部分评审，跳过 set gates 并记录；`checkIconSet` 收集所有元素签名，不只看根元素。
- **D7 契约**：新增字段必须同步更新 Zod schema；`asset-review.json` 写出前用 `AssetReviewRunSchema` 自校验。

### 0.2 已核实的事实

- dsh headless 支持 `--json` 和 `-` 读 stdin；`--json` 输出 NDJSON 事件流。
- `--json` 事件中，`status.phase === "step_end"` 带 `usage`，最终 `final.text` 是无损答案；`text` 事件有 8KB 上限。
- 真实 usage shape：`{inputTokens, outputTokens, totalTokens, cacheReadTokens}`，且 `inputTokens + cacheReadTokens + outputTokens = totalTokens`；与 H6 的成本公式一致。
- `@deepseek-ai/dsh-tool-fs` 提供 `read_image`；profile 模型声明了 `[text, image]`。路径/沙箱行为仍需 H7 spike 确认。

### 0.3 总体结论

1. **先修正确性与成本，再谈扩展**：P0 六项必须在批量资产/真实品牌资产之前完成；P1 提升质量与可运维性；P2 是 DX/清理。
2. **不改变 M0 的架构**：仍然是一个 core + standalone/dsh 两个薄 adapter；不新增第二套业务逻辑。
3. **硬门禁不允许绕过**：内联 `style` 和 `transform` 是已验证的绕过路径，必须关闭。
4. **reviewer 错误按资产隔离**：一次模型输出错误不能让整批资产“未评审即 unresolved”。
5. **成本必须可审计、可硬停**：model usage/cost 写入 run record；`--runtime dsh` 默认 10 元上限，超过即停止。
6. **配置不允许静默回退**：策略/风格文件损坏必须 fail fast；provider 缺失必须明确报错，不默认 OpenAI。
7. 所有新行为必须有测试；`pnpm test` 在现有 233 基础上只增不减；`phase1:verify` 保持 `2 pages / 0 blockers`。
8. **dsh 传输只保留一种**：`--json -`；M0.5 不实现 session-log 回退，`usageSource` 只取 `json-events | unavailable`。
9. **H7 不把原生依赖带进 dsh**：渲染在 standalone 侧完成，dsh 只读 PNG 路径。
10. **部分评审不冒充整套一致**：`--only` 时 set gates 跳过，并在 run record 中标记 `skipped: "PARTIAL_REVIEW"`。

## 1. 当前基线

| 项 | 证据 |
|---|---|
| 真实 dsh | `deepseek-flash`，13/13 passed，scores 4–5 |
| 成本 | 13 资产约 ¥0.463 峰值；累计探针/重跑约 ¥0.78 |
| 测试 | 233 passed，typecheck clean |
| 未覆盖 | `style`/`transform` 绕过；set-level gate 未接线；reviewer error 全局中断；成本在 run 外；配置静默回退；`.env.example` 仍是 OpenAI 默认 |
| 安全 | key 未进 git/run 日志；`.env` chmod 600 |
| dsh 能力 | headless 支持 `--json` 与 stdin；真实 usage 可从 `status(step_end)` 读取；`read_image` 可用 |
| 本次评审新增缺口 | `checkIconSet` 只看根元素；`modelReviewerFromEnv` 仍有 OpenAI 默认；`--only` 的 set gate 语义未定义；无效 verdict/非零退出的 usage 未捕获 |

## 2. 优先级与范围

| ID | 内容 | 级别 | 理由 |
|---|---|---|---|
| H1 | 硬门禁关闭 `style` / `transform` 绕过 | P0 | 已验证可绕过 currentColor / 安全区 |
| H2 | 图标 + 插画 set-level gate 接线；`--only` 时跳过；`checkIconSet` 改为全元素签名 | P0 | `checkIconSet` 只在测试里用；整套一致性是策略要求 |
| H3 | reviewer error 按资产隔离；不切 source | P0 | 真实首跑 1 个错误导致 4 个资产未送模型 |
| H4 | 配置解析 fail fast | P0 | `loadStyle`/`loadPolicy` 吞错会静默绕过策略/预算 |
| H5 | provider 默认值 / 缺失 fail fast（dsh + standalone model reviewer） | P0 | DeepSeek key + OpenAI 默认会 401 |
| H6 | model usage/cost 进入 run + 10 元硬预算；usage 不完整 fail closed | P0 | 目前成本只能外部核算 |
| H7 | SVG → PNG 图像输入（standalone 渲染，路径注入 dsh） | P1 | 当前只评审 SVG 文本，插画视觉质量弱 |
| H8 | dsh task 走 stdin | P1 | 避免 ARG_MAX / prompt 出现在进程列表 |
| H9 | `log.ndjson` append | P1 | 当前每事件全量重写，O(n²) |
| H10 | 保留 reviewer raw output / ignored keys | P1 | `reason_note` 被静默丢弃 |
| H11 | schema-repair 1 次 | P1 | spec 已要求，未实现 |
| H12 | `manifest.review.json` sidecar | P1 | manifest 看不到 degraded/review |
| H13 | 插画 set-level 一致性 | P1 | 目前只有单张 palette 检查 |
| H14 | 自动化 dsh mock 集成测试 | P1 | 手工 mock 未进 CI |
| H15 | DX / 安全清理 | P2 | pricing 配置、`--json`、命名、导出、脱敏、`.env` 文档 |

## 3. 需求

### H1 · 关闭 `style` / `transform` 绕过

**证据**：以下两个用例当前都 `passed: true`：

```svg
<path style="fill:#ff0000" ... />
```

```svg
<rect x="20" y="20" width="80" height="40" transform="translate(200 0)" />
```

**决策**：

- `checkSvgSafety` 拒绝任何内联 `style` 属性，错误码 `SVG_INLINE_STYLE`。
- `checkSvgSafety` 拒绝任何 `transform` 属性，错误码 `SVG_TRANSFORM`。
- 生产方/规范化器如需保留样式，必须先把 `style` 展开为 presentation attributes、把 transform 扁平化；M0.5 不接受。
- 这条规则对 icon 和 illustration 都生效；poster 在 M2 再单独定义。

**为什么是拒绝而不是解析**：CSS 级联、优先级、`url()`、`var()`、transform 矩阵的边界计算很容易出现新的绕过；M0.5 选择“明确拒绝 + 明确错误”，把复杂度推给规范化器，门禁本身保持可证明。

**接口**：

```ts
checkSvgSafety(parsed, { allowText: false }): HardGateIssue[]
// new codes: SVG_INLINE_STYLE, SVG_TRANSFORM
```

**测试**：见 test plan `T-H1-01..04`。

**验收**：含内联 style 的图标/插画失败；含 transform 的图标/插画失败；现有 13 个 fixture 仍全通过。

**边界**：M0.5 只拒绝，不提供 `style` 展开或 `transform` 扁平化；真实 A 库资产若含这些属性，需先在 M2 规范化器或手工清洗后重试。现有 13 个 fixture 均不含 `style`/`transform`。

### H2 · set-level gates 接线

**证据**：`checkIconSet` 只在 `gates.test.ts` 和 `fixtures.test.ts` 调用；`runAssetReview`/CLI 从未调用。

**决策**：

- 新增 `runBatchGates({ records, store, only })`，在所有资产处理完后执行：
  - 收集 `status === "passed"` 且 `brief.kind === "icon"` 的 frozen SVG，调用 `checkIconSet`。
  - 收集 `status === "passed"` 且 `brief.kind === "illustration"` 的 frozen SVG + brief，调用 `checkIllustrationSet`（H13）。
  - 写 `assets/icon-set.json`、`assets/illustration-set.json`。
- `checkIconSet` 改为收集每个图标**所有元素**的签名，而不是只读根元素；根元素一致但子元素 `stroke-width` 不一致也必须失败。
- `only` 非空时（`--only`）：不执行 set gates，写 `assets/batch-gates.json`，内容为 `{ skipped: true, reason: "PARTIAL_REVIEW", scope: only }`，并记录 `batch_gates_skipped` 事件。部分评审不能宣称整套一致。
- 任一 set gate 失败：
  - `run.passed = false`
  - `run.error`：图标优先 `ICON_SET_INCONSISTENT`，其次 `ILLUSTRATION_SET_INCONSISTENT`；两项结果都保留在 `batchGates`。
  - `manifest.complete = false`
  - CLI exit 1
- 单资产仍保留 `passed` 状态；set gate 是 run-level blocker，不回写单资产 verdict。

**接口**：

```ts
interface BatchGateResult {
  iconSet?: HardGateResult;
  illustrationSet?: HardGateResult;
  skipped?: boolean;
  reason?: "PARTIAL_REVIEW";
  scope?: string[];
}

interface RunBatchGatesInput {
  records: AssetReviewRecord[];
  store: ArtifactStorePort;
  only?: string[];
}

interface AssetReviewRunResult {
  // existing fields...
  batchGates?: BatchGateResult;
}
```

**测试**：`T-H2-01..07`。

**验收**：构造一个 stroke-width 不一致的 icon 集合（含根元素一致、子元素不一致的情况），run 失败并写 `icon-set.json`；`--only` 时跳过 set gate 并记录 `PARTIAL_REVIEW`；现有 10 图标仍通过。

### H3 · reviewer error 按资产隔离

**证据**：首跑 `reason_note` 错误后，状态机设置 `fatalError`，后续 4 个资产未调用 dsh 就被标成 unresolved。

**决策**：

- 每个资产维护局部 `reviewerFailed` 标志。reviewer 抛错时：
  - 记录当前 attempt 为 `reviewer_error`，当前资产 unresolved。
  - `reviewerErrors += 1`。
  - 同时退出 attempt 循环和 source 循环（`reviewerFailed = true`），**不切 source**。
  - 默认继续下一个资产，不设置 `fatalError`。
- 全部结束后：`run.passed = false`，`run.error = "REVIEWER_ERROR: N asset(s)"`。
- CLI `--fail-fast`（`continueOnReviewerError: false`）：
  - 第一个 reviewer error 后设置 `fatalError`，中断外层资产循环。
  - 剩余资产以合成 `reviewer_error` attempt 标记 unresolved（保持现有行为）。
- `summary.reviewerErrors` 记录数量。
- 注意：Checklist 原先的 `break; // next source/asset` 是错的；实现必须用资产级标志退出两层循环。

**接口**：

```ts
interface RunAssetReviewInput {
  // existing...
  continueOnReviewerError?: boolean; // default true
}
```

**测试**：`T-H3-01..03`。

**验收**：两个资产，第一个 reviewer 抛错，第二个正常；默认第一个 unresolved、第二个 passed、exit 1；`--fail-fast` 时第二个不送模型。

### H4 · 配置解析 fail fast

**证据**：`loadStyle`/`loadPolicy` 的 `catch` 捕获所有错误，JSON/schema 错误也会静默使用默认值。

**决策**：

- 只在文件不存在（`ENOENT`）时使用默认值。
- JSON 解析失败 / schema 校验失败 → 抛 `INVALID_STYLE` / `INVALID_SOURCE_POLICY`，带文件路径。
- `VisualStyle` 增加 Zod schema（`.strict()`）：`id` 必填，`palette` 可选字符串数组；现有 `samples/assets/m0/style.json` 字段必须继续通过。
- `source-policy.json` 继续用 `SourcePolicySchema`。
- `pricing.json` 用 `ReviewPricingSchema` 校验（H6）；malformed pricing 同样 fail fast，错误码 `INVALID_PRICING`。
- `--dry-run` 也执行这些校验，避免“dry-run 通过了但正式跑才报配置错”。

**接口**：

```ts
loadStyle(assetsDir): Promise<VisualStyle> // throws INVALID_STYLE
loadPolicy(assetsDir): Promise<SourcePolicy> // throws INVALID_SOURCE_POLICY
```

**测试**：`T-H4-01..04`。

**验收**：损坏的 `style.json` / `source-policy.json` 退出 1，stderr 含文件路径；缺失文件仍使用默认值。

### H5 · provider 默认值与 fail fast

**证据**：`pipeline/.env.example` 是 OpenAI 默认；当前验证的是 DeepSeek。`cordis.patch.yml` 的 baseURL/model 也有 OpenAI fallback。

**决策**：

- `.env.example` 改为 DeepSeek 默认，并注释其他 provider：
  ```
  PRD_UI_VISION_API_KEY=
  PRD_UI_VISION_BASE_URL=https://api.deepseek.com/v1
  PRD_UI_VISION_MODEL=deepseek-flash
  ```
- `--runtime dsh` 启动前检查 `PRD_UI_VISION_BASE_URL` 与 `PRD_UI_VISION_MODEL`；缺失 → `CONFIGURATION_ERROR`，列出缺失变量。校验在 CLI 启动、构造 reviewer 时执行，不等到第一个资产。
- `cordis.patch.yml` 去掉 OpenAI fallback；baseURL/model 直接读 env。
- **standalone `modelReviewerFromEnv` 同样校验**：`PRD_UI_VISION_BASE_URL` / `_MODEL` 缺失 → `CONFIGURATION_ERROR`，不再默认 `api.openai.com` / `gpt-4o-mini`。
- 删除 `README.md`、`pipeline/dsh/README.md`、`.env.example`、`cordis.patch.yml`、`model-reviewer.ts` 中所有 OpenAI 默认值。
- `PRD_UI_VISION_API_KEY` 仍由 dsh credentials 解析；缺失行为保持 `MISSING_CREDENTIAL`。standalone model reviewer 的 key 校验保持现有 `CONFIGURATION_ERROR`。

**测试**：`T-H5-01..05`（adapter 单测 + model reviewer 单测 + 文档检查）。

**验收**：没有 base/model 时 CLI 给出 `CONFIGURATION_ERROR`；`.env.example` 不再指向 OpenAI。

### H6 · model usage/cost 进入 run + 10 元硬预算

**证据**：`AssetAttempt.costUsd` 只来自 producer（A 库为 0）；真实 run 的 usage 从 dsh session 外部核算，`asset-review.json` 没有记录。

**决策**：

- `AssetReviewerPort.review` 返回 `ReviewResult`：

```ts
interface ReviewUsage {
  inputTokens: number;      // cache-miss input
  outputTokens: number;
  cacheReadTokens: number;
  totalTokens?: number;     // 仅审计；等于前三者之和
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

interface ReviewResult {
  verdict: AssetReviewVerdict;
  usage?: ReviewUsage;
  usageComplete?: boolean;  // false: 至少一个 step 没有 usage
  raw?: string;
  ignoredKeys?: string[];
  repairAttempted?: boolean;
}
```

- `AssetAttempt` 增加 `reviewUsage?`、`reviewCostUsd?`、`reviewCostCny?`。
- `AssetReviewSummary` 增加 `reviewInputTokens`、`reviewOutputTokens`、`reviewCacheTokens`、`reviewCostUsd`、`reviewCostCny`、`reviewerErrors`（可选，兼容旧 run）。
- `AssetReviewRun` 增加 `usageSource?: "json-events" | "unavailable"`、`usageComplete?: boolean`。
- 价格配置 `pipeline/pricing.json`，用 `ReviewPricingSchema`（`.strict()`）校验；malformed pricing → `INVALID_PRICING`：

```json
{
  "default": "deepseek-flash",
  "providers": {
    "deepseek-flash": {
      "inputMissUsdPerMillion": 0.30,
      "inputCacheUsdPerMillion": 0.006,
      "outputUsdPerMillion": 1.20,
      "usdToCny": 7.2
    }
  }
}
```

- 成本计算（保守用峰值价，**不使用 totalTokens**）：
  `input/1e6*inputMiss + cache/1e6*inputCache + output/1e6*output`，再乘 `usdToCny`。
  真实 13 资产 run 的 usage 已验证该公式与约 ¥0.463 一致。
- CLI：`--max-review-cost-cny <n>`，`--runtime dsh` 默认 10；standalone scripted 不启用。`--budget-usd` 仍是 **per-asset producer** 预算，两者在 help 和 summary 中明确区分。
- 状态机在每次 review 后累加全局 `totalReviewCostCny`；超过上限：
  - 保留当前资产结果（若已 pass 则冻结）。
  - 剩余资产标 unresolved，`attempt.status: "budget_exceeded"`。
  - `run.passed = false`，`run.error = "REVIEW_COST_BUDGET_EXCEEDED"`。
- dsh usage 获取（与 H8 一起实现）：
  - 命令：`dsh --profile <name> --json -`，task 走 stdin。
  - 解析 NDJSON：`status(step_end).usage` 逐 step 累加；`final.text` 作为 verdict 来源。
  - 每个 step 的 usage 只加一次；`totalTokens` 不参与计费。
  - 无效 verdict：`DshError` 必须携带已解析的 usage、raw、ignoredKeys；repair attempt 的 usage 也要合并。
  - 非零退出：尽量从 partial stdout 解析 usage；失败则 `usageComplete=false`。
  - 任一 step 缺少 usage、或 partial 解析失败 → `usageComplete=false`；`usageSource="json-events"`（有事件）或 `"unavailable"`（完全没有）。
  - **fail closed**：设置了 `maxReviewCostCny` 且 `usageComplete=false` 时，停止并报 `REVIEW_USAGE_INCOMPLETE`；只有显式 `--allow-unknown-cost` 才继续。未设置预算时继续，但 summary 明确 warning。
  - M0.5 不实现 session-log 回退；`usageSource` 不再包含 `"session-log"`。

**接口**：

```ts
interface RunAssetReviewInput {
  pricing?: ReviewPricing;
  maxReviewCostCny?: number;
  allowUnknownCost?: boolean;
}
```

**测试**：`T-H6-01..08`。

**验收**：真实/mock dsh run 的 `asset-review.json` 有 usage/cost；累计成本超 10 元时停止且 exit 1；usage 不完整且设置预算时明确失败，不伪造 0 成本。

### H7 · SVG → PNG 图像输入

**证据**：当前 `buildReviewPrompt` 把 SVG 放在 ```svg 代码块；模型支持 image，但没有 image block。

**决策**：

- 新增 `renderSvgToPng(svg, { scale }): Promise<Buffer>`，使用 `@resvg/resvg-js`；放在 `runtimes/standalone`（或独立 `runtimes/rendering`），**只由 standalone CLI 引入**。
- 渲染发生在 standalone CLI 的资产评审循环里：
  - 渲染 `assets/attempts/<id>/<source>-<n>/candidate.png`（2x）。
  - 通过 `AssetReviewerInput.candidateImagePath?: string`（或等价的 `renderCandidate` port）传给 reviewer。
  - `DshAssetReviewer` 只把路径写进 task，不 import resvg，保证 `dist/plugin.js` 不包含原生依赖。
- task prompt 增加：`A rendered PNG is at <path>. Use read_image to inspect it before scoring.`
- dsh 已提供 `read_image`（`@deepseek-ai/dsh-tool-fs`），profile 模型声明了 `[text, image]`；仍需 spike 确认 run dir 在沙箱内可读。若不可读，把 PNG 复制到 `pipeline/dsh/workspace/<runId>/` 再引用，或由插件提供 `read_candidate_image` 工具。
- 模型仍收到 SVG 源码；PNG 是额外证据。评分规则不变。
- 如果渲染失败：记录 `RENDER_WARNING`，仍用 SVG 文本评审，不阻断；summary 记录 `renderWarnings`。

**测试**：`T-H7-01..04`（渲染尺寸、路径注入、dsh bundle 不含 resvg、渲染失败降级）。

**验收**：真实 dsh run 的 evidence 目录有 `candidate.png`，prompt 引用它；verdict 仍通过 schema；`dist/plugin.js` 不包含 `@resvg`。

### H8 · dsh task 走 stdin

**证据**：`runDshReview` 把完整 prompt 作为 argv；大图/大 SVG 可能撞 ARG_MAX，也会出现在进程列表。

**决策**：

- `CommandRunner` 增加 `stdin?: string`；默认 runner 改为 `spawn`，写入 stdin，并保留 timeout / SIGTERM / partial stdout。
- 调用：`dsh --profile <name> --json -`，task 从 stdin 读；**与 H6 一起实现**，避免 `CommandRunner` 改两次。
- `--json` 是必需的：没有它就拿不到 usage。`-` 表示 stdin；两者同时使用。
- 测试 fake runner 捕获 stdin；断言 args 为 `["--profile", <name>, "--json", "-"]`，且不含完整 prompt。

**测试**：`T-H8-01..02`。

**验收**：真实 dsh 仍 13/13；进程列表不再包含 prompt；`--json` 事件可解析出 usage。

### H9 · `log.ndjson` append

**决策**：

- `ArtifactStorePort` 增加 `appendText(path, value)`；`FileArtifactStore` 用 `appendFile`（先 mkdir）。
- CLI logger 每事件 append 一行，不再 `lines.join` 全量重写。
- 所有测试 fake store 实现 `appendText`。

**测试**：`T-H9-01..02`。

**验收**：两条事件产生两行；文件内容随事件增长，不重写旧行。

### H10 · 保留 reviewer raw output

**决策**：

- `ReviewResult` 增加 `raw?: string`、`ignoredKeys?: string[]`。
- dsh adapter 在 attempt 目录写 `review.raw.json`：
  ```json
  { "raw": "...", "ignoredKeys": ["reason_note"], "parsed": { ... } }
  ```
- `review.raw.json` 额外记录 `usage`、`usageComplete`、`repairAttempted`，并与 `review.json` 一样做 key 脱敏。
- `review.json` 仍写规范化 verdict；raw 作为审计 sidecar。
- `ignoredKeys` 从原始对象键减去 schema 键得到。
- 解析失败（`DSH_INVALID_VERDICT`）也要写 raw sidecar；此时 attempt 的 `review` 为空，但 raw 保留。

**测试**：`T-H10-01..02`。

**验收**：带 `reason_note` 的响应在 `review.raw.json` 可见，`ignoredKeys` 包含它。

### H11 · schema-repair 1 次

**决策**：

- `DshAssetReviewer.review` 捕获 `DSH_INVALID_VERDICT`：
  - 组装 repair task：原 prompt + 上次错误 + “只返回符合 schema 的 JSON，不要额外字段”。
  - 再调用一次 `runDshReview`；合并两次 usage。
  - 第二次仍失败 → 抛 `reviewer_error`。
- `ReviewResult` 增加 `repairAttempted: boolean`（写入 `review.raw.json`）。
- 第一次无效输出已经消耗 token；`DshError` 必须携带 usage，repair 合并后再交给状态机。
- repair 也计入 `maxReviewCostCny`；预算不足时不应发起 repair。
- 最多 1 次，不允许无限重试。

**测试**：`T-H11-01..03`。

**验收**：首次无效、第二次有效 → pass + `repairAttempted=true`；两次无效 → reviewer_error；usage 累加。

### H12 · `manifest.review.json` sidecar

**决策**：

- 保持 `manifest.json` 兼容现有 `AssetManifestSchema`。
- 新增 `manifest.review.json`：
  ```ts
  {
    project, profile,
    assets: [{
      id, status, sourceTier, degraded, degradedReason,
      fallbackFrom, fallbackReason, review
    }],
    batchGates: { iconSetPassed, illustrationSetPassed, skipped?, reason? },
    usageSource, usageComplete,
    complete: boolean
  }
  ```
- CLI 同时写两个文件；下游 visual gate/renderer 可读 sidecar。
- 写出前自校验：`manifest.json` 用 `AssetManifestSchema`，`asset-review.json` 用 `AssetReviewRunSchema`；失败按 `CONTRACT_VIOLATION` 退出 1。

**测试**：`T-H12-01..02`。

**验收**：degraded/unresolved/set gate 在 sidecar 可见；`manifest.json` schema 不变。

### H13 · 插画 set-level 一致性

**决策**：

- 新增 `checkIllustrationSet(illustrations)`：
  - 必须同一 `styleRef`。
  - 必须同一 palette（排序后比较）。
  - canvas size 必须一致。
  - 违反 → `ILLUSTRATION_SET_INCONSISTENT`（blocker）。
- 接入 H2 的 `runBatchGates`，写 `illustration-set.json`。

**测试**：`T-H13-01..03`。

**验收**：三张 fixture 通过；改一张 palette 后 run 失败。

### H14 · 自动化 dsh mock 集成测试

**决策**：

- 新增 `pipeline/runtimes/dsh/tests/dsh-integration.test.ts`（或 `scripts/test-dsh-mock.mjs`）：
  - 启动本地 HTTP mock，返回合法 verdict。
  - 使用现有 profile + `DSH_HOME` + mock base/model/key。
  - 跑 `asset:review --only icon-home --runtime dsh`。
  - 断言 exit 0、`asset-review.json` pass、`dsh/` evidence 存在。
- 标记为 `pnpm test:dsh`，不进入默认 `pnpm test`；dsh 是 devDependency，缺失时**失败并提示安装**，不静默 skip。只有显式设置 `SKIP_DSH=1` 才跳过。

**验收**：新环境执行 `pnpm test:dsh` 可复现 dsh 路径，不消耗真实 key。

### H15 · DX / 安全清理

- `pricing.json` 由 H6 引入；CLI 输出 cost summary。
- `asset:review --json` 输出机器可读摘要（`runDir`、`summary`、`assets`、`batchGates`、`error`、`reviewCostCny`、`usageSource`、`usageComplete`）。
- `normalizeSvg` 加注释说明它只是 XML 重序列化；真正设计规范化在 M2。
- `runtimes/standalone/src/index.ts` 导出 asset CLI 的 `main`/`parseArgs`。
- dsh profile 缺失 provider env 时 fail fast（H5）。
- 文档明确：CLI 不会自动加载 `pipeline/.env`；使用前需 `set -a; . ./.env; set +a` 或 export。自动加载留到后续（不在 M0.5）。
- `redact` 扩展为常见 key/token/secret 字段和 `sk-` 前缀；日志、prompt、stdout、raw sidecar 都经过同一个脱敏函数。
- `asset-review.json` / `manifest.json` 写出前做 schema 自校验（见 H12）。

## 4. 数据模型变更汇总

```ts
// contracts.ts
interface ReviewUsage {
  inputTokens: number;      // cache-miss input
  outputTokens: number;
  cacheReadTokens: number;
  totalTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

interface ReviewResult {
  verdict: AssetReviewVerdict;
  usage?: ReviewUsage;
  usageComplete?: boolean;
  raw?: string;
  ignoredKeys?: string[];
  repairAttempted?: boolean;
}

interface AssetAttempt {
  // existing...
  reviewUsage?: ReviewUsage;
  reviewCostUsd?: number;
  reviewCostCny?: number;
}

interface AssetReviewSummary {
  // existing...
  reviewInputTokens?: number;
  reviewOutputTokens?: number;
  reviewCacheTokens?: number;
  reviewCostUsd?: number;
  reviewCostCny?: number;
  reviewerErrors?: number;
}

interface BatchGateResult {
  iconSet?: HardGateResult;
  illustrationSet?: HardGateResult;
  skipped?: boolean;
  reason?: "PARTIAL_REVIEW";
  scope?: string[];
}

interface AssetReviewRunResult {
  // existing...
  batchGates?: BatchGateResult;
  usageSource?: "json-events" | "unavailable";
  usageComplete?: boolean;
}
```

`AssetReviewVerdictSchema` 保持“剥离未知注解字段”；不恢复 `.strict()`。

**Schema 同步**：`AssetAttemptSchema`、`AssetReviewSummarySchema`、`AssetReviewRunSchema` 都是 `.strict()`，新增字段必须同时加进 schema；写出前用 `AssetReviewRunSchema.parse` 自校验。

## 5. 测试策略

- 单元：gate 绕过、set gate（含子元素签名、`--only` 跳过）、cost 计算、usage 完整性、config 解析、error 隔离。
- 集成：`asset:review` standalone 13/13、scenarios、dsh mock、cost guard。
- 真实 dsh：手工/可选，不进默认 CI；保持 13/13 的回归记录。
- 回归：233+ tests、typecheck、phase1 2 pages/0 blockers。
- 测试分层：
  - `pnpm test`：core + standalone + dsh unit/contract，不调用真实 dsh/网络。
  - `pnpm test:dsh`：本地 mock + 真实 dsh CLI/profile，不消耗真实 key；dsh 缺失时失败（`SKIP_DSH=1` 才跳过）。

详细用例见 `2026-10-20-asset-review-hardening-test-plan.md`。

## 6. 验收标准

- [ ] H1–H14 的实现测试全部通过。
- [ ] `pnpm test` ≥233 passed；typecheck clean；phase1 `2 pages/0 blockers`。
- [ ] standalone `13/13`；scenarios `1 passed/1 unresolved`。
- [ ] `pnpm test:dsh` 通过（mock，无真实 key）；dsh 缺失时明确失败。
- [ ] 真实 dsh 回归：13/13，usage/cost 写入 `asset-review.json`，且 ≤10 元；`usageComplete=true`。
- [ ] 含 `style`/`transform` 的资产被拒绝；set-level 不一致（含子元素 stroke-width）导致 run 失败。
- [ ] `--only` 时 set gates 跳过并记录 `PARTIAL_REVIEW`，不宣称整套一致。
- [ ] 损坏的 style/policy/pricing 文件 fail fast；provider 缺失（dsh 和 standalone model reviewer）给出 `CONFIGURATION_ERROR`。
- [ ] `manifest.review.json` 显示 degraded/unresolved/set gate。
- [ ] `dsh` 调用使用 `--json -` 和 stdin；进程列表不含完整 prompt。
- [ ] `dist/plugin.js` 不包含 `@resvg`；PNG 由 standalone 渲染并注入路径。
- [ ] `asset-review.json` / `manifest.json` 写出前通过 schema 自校验。
- [ ] 没有 key 进入 git/日志/artifacts。

## 7. 非目标

- 不实现 M1 IA/Interaction/Visual Style Agent。
- 不接 B/C 真实供应商；不实现 Figma/截图 diff/录屏 trace。
- 不做真实品牌资产采购/授权。
- 不把 `asset:review` 并入 phase1 主状态机；不把 frozen `manifest.json` 自动接回 phase1/renderer，`assetRef` 渲染留到后续。
- 不引入第二套运行时/业务逻辑。
- 不做 resume/checkpoint；失败后整批重跑。
- 不实现 CSS/`transform` 规范化器；H1 只拒绝，修复留到 M2。
- 不做插画 `<path>` 坐标边界分析（单资产安全区仍只覆盖基本图元）；留到 M2。
- 不实现 session-log usage 回退；M0.5 只用 `--json`。
- 不自动加载 `.env`；只更新文档。
- 不引入 REST 服务或 Go 重写。
- 不新增 lint/CI；本阶段只保证测试和 typecheck。

## 8. Spike / 开放问题

**已解决（2026-10-20 评审）**

1. `dsh --json` 的 usage shape：已从 `dsh-headless` 实现和真实 session 确认。`status(step_end).usage` + `final.text`；`usage = { inputTokens, outputTokens, totalTokens, cacheReadTokens }`，且 `total = input + cacheRead + output`。
2. DeepSeek Flash 计费：真实 13 资产 run 的 usage 与 `pricing.json` 默认值吻合（约 ¥0.463 峰值），公式正确。
3. `read_image` 存在：`@deepseek-ai/dsh-tool-fs` 提供该工具，profile 模型声明 text+image。

**仍需 spike**

4. dsh 沙箱是否能直接 `read_image` run dir 下的 `candidate.png`；不行则复制到 `pipeline/dsh/workspace/<runId>/` 或加插件工具。
5. `@resvg/resvg-js` 在 macOS arm64 / CI 的安装与 bundle 体积；确认它只进 standalone，不进 dsh bundle。
6. `transform` 严格拒绝是否会影响真实 A 库插画；M2 引入规范化器后放宽。
7. `style` 严格拒绝是否会影响真实 A 库图标；如果是，规范化器先展开 presentation attributes。

**已决策**

8. usage 不完整且设置预算 → fail closed（`REVIEW_USAGE_INCOMPLETE`），除非 `--allow-unknown-cost`。
9. `--only` → 跳过 set gates，记录 `PARTIAL_REVIEW`。
10. M0.5 不实现 session-log 回退；`usageSource` 只取 `json-events | unavailable`。
