# Asset Review Hardening (M0.5) — Design Spec

- 日期：2026-10-20
- 状态：Draft for review；未实现
- 输入：真实 `deepseek-flash` 13/13、233 tests、M0 审计清单
- 关联：
  - `docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md`
  - `pipeline/docs/asset-review-m0.md`
  - `CHANGELOG.md`

## 0. 结论

1. **先修正确性与成本，再谈扩展**：P0 六项必须在批量资产/真实品牌资产之前完成；P1 提升质量与可运维性；P2 是 DX/清理。
2. **不改变 M0 的架构**：仍然是一个 core + standalone/dsh 两个薄 adapter；不新增第二套业务逻辑。
3. **硬门禁不允许绕过**：内联 `style` 和 `transform` 是已验证的绕过路径，必须关闭。
4. **reviewer 错误按资产隔离**：一次模型输出错误不能让整批资产“未评审即 unresolved”。
5. **成本必须可审计、可硬停**：model usage/cost 写入 run record；`--runtime dsh` 默认 10 元上限，超过即停止。
6. **配置不允许静默回退**：策略/风格文件损坏必须 fail fast；provider 缺失必须明确报错，不默认 OpenAI。
7. 所有新行为必须有测试；`pnpm test` 在现有 233 基础上只增不减；`phase1:verify` 保持 `2 pages / 0 blockers`。

## 1. 当前基线

| 项 | 证据 |
|---|---|
| 真实 dsh | `deepseek-flash`，13/13 passed，scores 4–5 |
| 成本 | 13 资产约 ¥0.463 峰值；累计探针/重跑约 ¥0.78 |
| 测试 | 233 passed，typecheck clean |
| 未覆盖 | `style`/`transform` 绕过；set-level gate 未接线；reviewer error 全局中断；成本在 run 外；配置静默回退；`.env.example` 仍是 OpenAI 默认 |
| 安全 | key 未进 git/run 日志；`.env` chmod 600 |

## 2. 优先级与范围

| ID | 内容 | 级别 | 理由 |
|---|---|---|---|
| H1 | 硬门禁关闭 `style` / `transform` 绕过 | P0 | 已验证可绕过 currentColor / 安全区 |
| H2 | 图标 + 插画 set-level gate 接线 | P0 | `checkIconSet` 只在测试里用；整套一致性是策略要求 |
| H3 | reviewer error 按资产隔离 | P0 | 真实首跑 1 个错误导致 4 个资产未送模型 |
| H4 | 配置解析 fail fast | P0 | `loadStyle`/`loadPolicy` 吞错会静默绕过策略/预算 |
| H5 | provider 默认值 / 缺失 fail fast | P0 | DeepSeek key + OpenAI 默认会 401 |
| H6 | model usage/cost 进入 run + 10 元硬预算 | P0 | 目前成本只能外部核算 |
| H7 | SVG → PNG 图像输入 | P1 | 当前只评审 SVG 文本，插画视觉质量弱 |
| H8 | dsh task 走 stdin | P1 | 避免 ARG_MAX / prompt 出现在进程列表 |
| H9 | `log.ndjson` append | P1 | 当前每事件全量重写，O(n²) |
| H10 | 保留 reviewer raw output / ignored keys | P1 | `reason_note` 被静默丢弃 |
| H11 | schema-repair 1 次 | P1 | spec 已要求，未实现 |
| H12 | `manifest.review.json` sidecar | P1 | manifest 看不到 degraded/review |
| H13 | 插画 set-level 一致性 | P1 | 目前只有单张 palette 检查 |
| H14 | 自动化 dsh mock 集成测试 | P1 | 手工 mock 未进 CI |
| H15 | DX 清理 | P2 | pricing 配置、`--json`、命名、导出 |

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

### H2 · set-level gates 接线

**证据**：`checkIconSet` 只在 `gates.test.ts` 和 `fixtures.test.ts` 调用；`runAssetReview`/CLI 从未调用。

**决策**：

- 新增 `runBatchGates(records, store)`，在所有资产处理完后执行：
  - 收集 `status === "passed"` 且 `brief.kind === "icon"` 的 frozen SVG，调用 `checkIconSet`。
  - 收集 `status === "passed"` 且 `brief.kind === "illustration"` 的 frozen SVG + brief，调用 `checkIllustrationSet`（H13）。
  - 写 `assets/icon-set.json`、`assets/illustration-set.json`。
- 任一 set gate 失败：
  - `run.passed = false`
  - `run.error = "ICON_SET_INCONSISTENT" | "ILLUSTRATION_SET_INCONSISTENT"`
  - `manifest.complete = false`
  - CLI exit 1
- 单资产仍保留 `passed` 状态；set gate 是 run-level blocker，不回写单资产 verdict。

**接口**：

```ts
interface BatchGateResult {
  iconSet?: HardGateResult;
  illustrationSet?: HardGateResult;
}

interface AssetReviewRunResult {
  // existing fields...
  batchGates?: BatchGateResult;
}
```

**测试**：`T-H2-01..04`。

**验收**：构造一个 stroke-width 不一致的 icon 集合，run 失败并写 `icon-set.json`；现有 10 图标仍通过。

### H3 · reviewer error 按资产隔离

**证据**：首跑 `reason_note` 错误后，状态机设置 `fatalError`，后续 4 个资产未调用 dsh 就被标成 unresolved。

**决策**：

- 默认 `continueOnReviewerError: true`：
  - 当前资产记录 `reviewer_error`，标记 unresolved。
  - 继续处理下一个资产。
  - 全部结束后 `run.passed = false`，`run.error = "REVIEWER_ERROR: N asset(s)"`。
- 新增 CLI `--fail-fast`：
  - 保持旧行为：第一个 reviewer error 后停止，剩余资产标记 unresolved。
- 不因 reviewer error 切 source；reviewer 坏了不是资产问题。
- `summary.reviewerErrors` 记录数量。

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
- `VisualStyle` 增加 Zod schema：`id` 必填，`palette` 可选字符串数组。
- `source-policy.json` 继续用 `SourcePolicySchema`。

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
- `--runtime dsh` 启动前检查 `PRD_UI_VISION_BASE_URL` 与 `PRD_UI_VISION_MODEL`；缺失 → `CONFIGURATION_ERROR`，列出缺失变量。
- `cordis.patch.yml` 去掉 OpenAI fallback；baseURL/model 直接读 env。
- `PRD_UI_VISION_API_KEY` 仍由 dsh credentials 解析；缺失行为保持 `MISSING_CREDENTIAL`。

**测试**：`T-H5-01..03`（adapter 单测 + 文档检查）。

**验收**：没有 base/model 时 CLI 给出 `CONFIGURATION_ERROR`；`.env.example` 不再指向 OpenAI。

### H6 · model usage/cost 进入 run + 10 元硬预算

**证据**：`AssetAttempt.costUsd` 只来自 producer（A 库为 0）；真实 run 的 usage 从 dsh session 外部核算，`asset-review.json` 没有记录。

**决策**：

- `AssetReviewerPort.review` 返回 `ReviewResult`：

```ts
interface ReviewUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

interface ReviewResult {
  verdict: AssetReviewVerdict;
  usage?: ReviewUsage;
  raw?: string;
  ignoredKeys?: string[];
}
```

- `AssetAttempt` 增加 `reviewUsage?`、`reviewCostUsd?`、`reviewCostCny?`。
- `AssetReviewSummary` 增加 `reviewInputTokens`、`reviewOutputTokens`、`reviewCacheTokens`、`reviewCostUsd`、`reviewCostCny`（可选，兼容旧 run）。
- 价格配置 `pipeline/pricing.json`：

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

- 成本计算（保守用峰值价）：
  `input/1e6*inputMiss + cache/1e6*inputCache + output/1e6*output`，再乘 `usdToCny`。
- CLI：`--max-review-cost-cny <n>`，`--runtime dsh` 默认 10；standalone scripted 不启用。
- 状态机在每次 review 后累加；超过上限：
  - 保留当前资产结果（若已 pass 则冻结）。
  - 剩余资产标 unresolved，`status: "budget_exceeded"`。
  - `run.passed = false`，`run.error = "REVIEW_COST_BUDGET_EXCEEDED"`。
- dsh usage 获取：
  - 使用 `dsh --profile <name> --json`，解析 NDJSON 事件中的 `usage`。
  - 每个 step 的 usage 去重后累加；取不到 usage 时记录 warning，不伪造 0 成本。
  - 具体事件 shape 是 spike（见 §8）；失败则回退到解析 session log，但必须记录 `usageSource: "session-log" | "json-events"`。

**接口**：

```ts
interface RunAssetReviewInput {
  pricing?: ReviewPricing;
  maxReviewCostCny?: number;
}
```

**测试**：`T-H6-01..06`。

**验收**：真实/mock dsh run 的 `asset-review.json` 有 usage/cost；累计成本超 10 元时停止且 exit 1；没有 usage 时明确 warning。

### H7 · SVG → PNG 图像输入

**证据**：当前 `buildReviewPrompt` 把 SVG 放在 ```svg 代码块；模型支持 image，但没有 image block。

**决策**：

- 新增 `renderSvgToPng(svg, { width }): Promise<Buffer>`，使用 `@resvg/resvg-js`；放在 `runtimes/standalone` 或独立 `runtimes/rendering`，不放进 dsh 插件 bundle。
- `DshAssetReviewer` 在调用 dsh 前：
  - 渲染 `assets/attempts/<id>/<source>-<n>/candidate.png`（2x）。
  - task prompt 增加：`A rendered PNG is at <path>. Use read_image to inspect it.`
  - 若 run dir 在 dsh 沙箱外，先把 PNG 复制到 `pipeline/dsh/workspace/<runId>/` 再引用；或由插件提供 `read_candidate_image` 工具。
- 模型仍收到 SVG 源码；PNG 是额外证据。评分规则不变。
- 如果渲染失败：记录 `RENDER_WARNING`，仍用 SVG 文本评审，不阻断；连续失败在 summary 可见。

**测试**：`T-H7-01..03`（渲染尺寸、task 包含路径、真实 mock dsh 不崩）。

**验收**：真实 dsh run 的 evidence 目录有 `candidate.png`，prompt 引用它；verdict 仍通过 schema。

### H8 · dsh task 走 stdin

**证据**：`runDshReview` 把完整 prompt 作为 argv；大图/大 SVG 可能撞 ARG_MAX，也会出现在进程列表。

**决策**：

- `CommandRunner` 增加 `stdin?: string`；默认 runner 改为 `spawn`，写入 stdin。
- 调用：`dsh --profile <name> -`，task 从 stdin 读（dsh help 支持 `-`）。
- 测试 fake runner 捕获 stdin；断言 args 含 `-`，不含完整 prompt。

**测试**：`T-H8-01..02`。

**验收**：真实 dsh 仍 13/13；进程列表不再包含 prompt。

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
- `review.json` 仍写规范化 verdict；raw 作为审计 sidecar。
- `ignoredKeys` 从原始对象键减去 schema 键得到。

**测试**：`T-H10-01..02`。

**验收**：带 `reason_note` 的响应在 `review.raw.json` 可见，`ignoredKeys` 包含它。

### H11 · schema-repair 1 次

**决策**：

- `DshAssetReviewer.review` 捕获 `DSH_INVALID_VERDICT`：
  - 组装 repair task：原 prompt + 上次错误 + “只返回符合 schema 的 JSON，不要额外字段”。
  - 再调用一次 `runDshReview`；合并两次 usage。
  - 第二次仍失败 → 抛 `reviewer_error`。
- `ReviewResult` 增加 `repairAttempted: boolean`（写入 `review.raw.json`）。
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
    batchGates: { iconSetPassed, illustrationSetPassed },
    complete: boolean
  }
  ```
- CLI 同时写两个文件；下游 visual gate/renderer 可读 sidecar。

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
- 标记为 `pnpm test:dsh`，不进入默认 `pnpm test`；若 dsh 未安装则 skip。

**验收**：新环境执行 `pnpm test:dsh` 可复现 dsh 路径，不消耗真实 key。

### H15 · DX 清理

- `pricing.json` 由 H6 引入；CLI 输出 cost summary。
- `asset:review --json` 输出机器可读摘要。
- `normalizeSvg` 改名/加注释说明它只是 XML 重序列化；真正设计规范化在 M2。
- `runtimes/standalone/src/index.ts` 导出 asset CLI 的 `main`/`parseArgs`。
- dsh profile 缺失 provider env 时 fail fast（H5）。

## 4. 数据模型变更汇总

```ts
// contracts.ts
interface ReviewUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
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

interface AssetReviewRunResult {
  // existing...
  batchGates?: BatchGateResult;
  usageSource?: "json-events" | "session-log" | "unavailable";
}
```

`AssetReviewVerdictSchema` 保持“剥离未知注解字段”；不恢复 `.strict()`。

## 5. 测试策略

- 单元：gate 绕过、set gate、cost 计算、config 解析、error 隔离。
- 集成：`asset:review` standalone 13/13、scenarios、dsh mock、cost guard。
- 真实 dsh：手工/可选，不进默认 CI；保持 13/13 的回归记录。
- 回归：233+ tests、typecheck、phase1 2 pages/0 blockers。
- 测试分层：
  - `pnpm test`：core + standalone + dsh unit/contract，不调用真实 dsh/网络。
  - `pnpm test:dsh`：本地 mock + 真实 dsh CLI/profile，不消耗真实 key。

详细用例见 `2026-10-20-asset-review-hardening-test-plan.md`。

## 6. 验收标准

- [ ] H1–H14 的实现测试全部通过。
- [ ] `pnpm test` ≥233 passed；typecheck clean；phase1 `2 pages/0 blockers`。
- [ ] standalone `13/13`；scenarios `1 passed/1 unresolved`。
- [ ] `pnpm test:dsh` 通过（mock，无真实 key）。
- [ ] 真实 dsh 回归：13/13，usage/cost 写入 `asset-review.json`，且 ≤10 元。
- [ ] 含 `style`/`transform` 的资产被拒绝；set-level 不一致导致 run 失败。
- [ ] 损坏的 style/policy 文件 fail fast；provider 缺失给出 `CONFIGURATION_ERROR`。
- [ ] `manifest.review.json` 显示 degraded/unresolved/set gate。
- [ ] 没有 key 进入 git/日志/artifacts。

## 7. 非目标

- 不实现 M1 IA/Interaction/Visual Style Agent。
- 不接 B/C 真实供应商；不实现 Figma/截图 diff/录屏 trace。
- 不做真实品牌资产采购/授权。
- 不把 `asset:review` 并入 phase1 主状态机。
- 不引入第二套运行时/业务逻辑。

## 8. Spike / 开放问题

1. `dsh --json` 的 usage 事件 shape：需要一次真实/mock 运行确认；如果不可用，回退到 session log，并记录 `usageSource`。
2. dsh 图像输入：`read_image` 在 `pipeline/runs` 下是否可用；如果沙箱阻止，插件提供 `read_candidate_image` 工具或复制到 workspace。
3. DeepSeek Flash 的实际计费（峰值/低谷、缓存）与 `pricing.json` 默认值；首次真实 run 后校准。
4. `transform` 严格拒绝是否会影响真实 A 库插画；M2 引入规范化器后放宽。
5. `style` 严格拒绝是否会影响真实 A 库图标；如果是，规范化器先展开 presentation attributes。
