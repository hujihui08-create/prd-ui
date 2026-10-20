# Asset Review Hardening — Test Plan

- 日期：2026-10-20
- 对应 spec：`docs/superpowers/specs/2026-10-20-asset-review-hardening-design.md`
- 状态：Draft for review；未实现
- 原则：每个 H 需求至少一个失败测试；先写测试再实现；默认 `pnpm test` 不访问真实 dsh/网络。

## 0. 测试分层

| 层 | 命令 | 范围 | 是否消耗 key |
|---|---|---|---|
| Unit | `pnpm test` | gate、cost、config、state machine、adapter 纯函数 | 否 |
| CLI integration | `pnpm test` | `asset:review` standalone + scenarios | 否 |
| dsh contract | `pnpm test` | dsh-process/plugin/adapter 用 fake runner | 否 |
| dsh mock integration | `pnpm test:dsh` | 真实 dsh CLI + profile + 本地 mock HTTP | 否（mock key） |
| Real dsh manual | `pnpm asset:review --runtime dsh` | 真实 DeepSeek Flash | 是，需人工确认 ≤10 元 |

## 1. 测试矩阵

| ID | 需求 | 层 | 文件 | 关键断言 |
|---|---|---|---|---|
| T-H1-01 | H1 style 绕过 | unit | `core/asset-review/tests/gates.test.ts` | `style="fill:#f00"` → `SVG_INLINE_STYLE`，`passed=false` |
| T-H1-02 | H1 transform 绕过 | unit | 同上 | icon `transform` → `SVG_TRANSFORM` |
| T-H1-03 | H1 插画 transform | unit | 同上 | illustration `transform` → `SVG_TRANSFORM` |
| T-H1-04 | H1 现有 fixtures 回归 | unit | `runtimes/standalone/tests/fixtures.test.ts` | 13 个 m0 资产仍全通过 |
| T-H2-01 | H2 icon set 接线 | unit | `core/asset-review/tests/state-machine.test.ts` | 不一致 icon set → run.passed=false, error=ICON_SET_INCONSISTENT |
| T-H2-02 | H2 icon set 文件 | integration | `runtimes/standalone/tests/asset-cli.test.ts` | `assets/icon-set.json` 存在且 passed=false |
| T-H2-03 | H2 manifest incomplete | integration | 同上 | set gate 失败时 `manifest.complete=false` |
| T-H2-04 | H2 现有 10 图标 | integration | 现有 m0 run | icon set passed，run exit 0 |
| T-H3-01 | H3 默认继续 | unit | `core/asset-review/tests/state-machine.test.ts` | 第一个 reviewer throw、第二个 pass → 1 unresolved + 1 passed, run failed |
| T-H3-02 | H3 fail-fast | unit | 同上 | `continueOnReviewerError=false` → 第二个不调用 reviewer |
| T-H3-03 | H3 summary | unit | 同上 | `summary.reviewerErrors=1` |
| T-H4-01 | H4 invalid style | integration | `runtimes/standalone/tests/asset-cli.test.ts` | exit 1，stderr 含 `INVALID_STYLE` + 文件路径 |
| T-H4-02 | H4 invalid policy | integration | 同上 | exit 1，stderr 含 `INVALID_SOURCE_POLICY` |
| T-H4-03 | H4 missing style | unit | 同上 | 使用默认 style，不报错 |
| T-H4-04 | H4 missing policy | unit | 同上 | 使用 `DEFAULT_SOURCE_POLICY` |
| T-H5-01 | H5 missing base/model | unit | `runtimes/dsh/tests/adapter.test.ts` | `CONFIGURATION_ERROR`，列出变量名 |
| T-H5-02 | H5 dsh profile 无 OpenAI fallback | doc/unit | `pipeline/dsh/home/profiles/prd-ui-assets/cordis.patch.yml` | 不含 `api.openai.com` / `gpt-4o-mini` |
| T-H5-03 | H5 .env.example | doc | `pipeline/.env.example` | 含 `api.deepseek.com/v1` + `deepseek-flash` |
| T-H6-01 | H6 usage 汇总 | unit | `core/asset-review/tests/state-machine.test.ts` | fake reviewer usage → attempt/summary 字段正确 |
| T-H6-02 | H6 cost 计算 | unit | `core/asset-review/tests/pricing.test.ts` | 已知 tokens → 已知 USD/CNY |
| T-H6-03 | H6 预算停止 | unit | `state-machine.test.ts` | 超过 `maxReviewCostCny` → 剩余 unresolved，error=REVIEW_COST_BUDGET_EXCEEDED |
| T-H6-04 | H6 dsh usage 解析 | unit | `runtimes/dsh/tests/dsh-process.test.ts` | NDJSON usage → ReviewUsage |
| T-H6-05 | H6 usage 缺失 | unit | 同上 | `usageSource="unavailable"` + warning，不伪造 0 |
| T-H6-06 | H6 真实/mock run 记录 | integration | `test:dsh` | `asset-review.json` 含 usage/cost |
| T-H7-01 | H7 SVG→PNG | unit | `runtimes/standalone/tests/render.test.ts` | 120×80 SVG → 240×160 PNG |
| T-H7-02 | H7 prompt 引用 PNG | unit | `runtimes/dsh/tests/adapter.test.ts` | task 含 `candidate.png` 路径 |
| T-H7-03 | H7 渲染失败降级 | unit | 同上 | `RENDER_WARNING`，仍调用 dsh |
| T-H8-01 | H8 stdin | unit | `runtimes/dsh/tests/dsh-process.test.ts` | args 含 `-`，stdin 是完整 task |
| T-H8-02 | H8 真实 dsh 回归 | manual/test:dsh | `pnpm test:dsh` | 1 图标 pass |
| T-H9-01 | H9 append | unit | `runtimes/standalone/tests/artifact-store.test.ts` | append 两行，旧内容保留 |
| T-H9-02 | H9 CLI log | integration | `asset-cli.test.ts` | `log.ndjson` 行数 = 事件数，无全量重写 |
| T-H10-01 | H10 raw output | unit | `runtimes/dsh/tests/adapter.test.ts` | `review.raw.json` 含 `reason_note` |
| T-H10-02 | H10 ignoredKeys | unit | 同上 | `ignoredKeys=["reason_note"]` |
| T-H11-01 | H11 repair 成功 | unit | `runtimes/dsh/tests/adapter.test.ts` | 第一次 invalid、第二次 valid → pass，`repairAttempted=true` |
| T-H11-02 | H11 repair 失败 | unit | 同上 | 两次 invalid → `reviewer_error` |
| T-H11-03 | H11 usage 合并 | unit | 同上 | 两次 usage 相加 |
| T-H12-01 | H12 sidecar | unit | `core/asset-review/tests/manifest.test.ts` | degraded/unresolved/review 出现在 `manifest.review.json` |
| T-H12-02 | H12 manifest 不变 | unit | 同上 | `manifest.json` 仍通过 `AssetManifestSchema` |
| T-H13-01 | H13 插画 set 通过 | unit | `core/asset-review/tests/gates.test.ts` | 同 style/palette/size → pass |
| T-H13-02 | H13 palette 不一致 | unit | 同上 | `ILLUSTRATION_SET_INCONSISTENT` |
| T-H13-03 | H13 run 接线 | integration | `asset-cli.test.ts` | `illustration-set.json` 写入，run 失败 |
| T-H14-01 | H14 dsh mock | integration | `runtimes/dsh/tests/dsh-integration.test.ts` | exit 0，1 asset pass |
| T-H14-02 | H14 无 dsh skip | integration | 同上 | dsh 不存在时 skip，不 fail |
| T-H15-01 | H15 pricing | unit | `pricing.test.ts` | 默认 deepseek-flash 价格可解析 |
| T-H15-02 | H15 --json | integration | `asset-cli.test.ts` | stdout 是合法 JSON summary |
| T-H15-03 | H15 normalize 命名 | doc | `gates/svg.ts` | 注释明确 XML re-serialization |

## 2. 详细用例

### T-H1 · 硬门禁绕过

```ts
it("rejects an inline style on an icon", () => {
  const svg = validIcon.replace("<path", '<path style="fill:#ff0000"');
  const result = checkIcon(svg, iconBrief);
  expect(result.passed).toBe(false);
  expect(result.issues.map((i) => i.code)).toContain("SVG_INLINE_STYLE");
});

it("rejects transform on an icon", () => {
  const svg = validIcon.replace("<path", '<path transform="translate(100 0)"');
  expect(checkIcon(svg, iconBrief).issues.some((i) => i.code === "SVG_TRANSFORM")).toBe(true);
});

it("rejects transform on an illustration", () => {
  const svg = validIllustration.replace("<rect", '<rect transform="translate(200 0)"');
  expect(checkIllustration(svg, illustrationBrief).issues.some((i) => i.code === "SVG_TRANSFORM")).toBe(true);
});
```

### T-H2 · Set-level gate

Fake store/producer with two icon briefs; producer returns two SVGs with different `stroke-width`.
Assert:
- `result.batchGates?.iconSet?.passed === false`
- `result.error === "ICON_SET_INCONSISTENT"`
- `store.files.has("assets/icon-set.json")`
- `result.passed === false`

CLI:
- run with a temp fixture containing inconsistent icons; assert exit 1 and `manifest.complete === false`.

### T-H3 · Reviewer error isolation

Fake reviewer:
```ts
const reviewer = {
  async review({ brief }) {
    if (brief.id === "icon-home") throw new Error("model down");
    return passVerdict;
  },
};
```
- default: first unresolved, second passed; `summary.reviewerErrors=1`; `passed=false`.
- fail-fast: second `attempts[0].status === "reviewer_error"` and reviewer call count = 1.

### T-H4 · Config strictness

Temp assets dir:
- `style.json` = `{ bad json`
- run `--dry-run`; assert exit 1, stderr contains `INVALID_STYLE`.
- `source-policy.json` = `{ "chains": {} }`; assert `INVALID_SOURCE_POLICY`.
- delete both; assert dry-run uses defaults and passes.

### T-H5 · Provider fail fast

`new DshAssetReviewer({ baseUrl: "", model: "", ... })` or a `validateProviderEnv` function:
- missing `PRD_UI_VISION_BASE_URL` / `PRD_UI_VISION_MODEL` → throw `CONFIGURATION_ERROR` with both names.
- `.env.example` snapshot test: read file, assert DeepSeek URL/model, no `api.openai.com`.

### T-H6 · Usage/cost

```ts
const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0 };
// pricing deepseek-flash peak: input 0.30, output 1.20, fx 7.2
// expected usd = 1.5; cny = 10.8
```
- fake reviewer returns usage; assert attempt/summary fields.
- `maxReviewCostCny: 0.5` with two assets; after first review cost 0.54 → stop, second unresolved, error `REVIEW_COST_BUDGET_EXCEEDED`.
- dsh NDJSON fixture:
  ```jsonl
  {"type":"step/end","data":{"usage":{"inputTokens":100,"outputTokens":20,"cacheReadTokens":0}}}
  ```
  assert `ReviewUsage`.
- missing usage → `usageSource="unavailable"` and a warning event.

### T-H7 · Image input

- `renderSvgToPng(validIllustration, { scale: 2 })` returns PNG with width 240, height 160 (use `@resvg` or parse PNG header).
- `DshAssetReviewer` with fake runner: task includes `candidate.png`; fake runner captures stdin/task.
- `renderSvgToPng` throws → adapter logs `RENDER_WARNING` and still calls runner.

### T-H8 · stdin

Fake runner:
```ts
let captured: { args: string[]; stdin?: string };
const runner = async (_cmd, args, options) => {
  captured = { args, stdin: options.stdin };
  return { stdout: JSON.stringify(passVerdict), stderr: "" };
};
await runDshReview({ task: "review this", ..., runner });
expect(captured.args).toEqual(["--profile", "prd-ui-assets", "-"]);
expect(captured.stdin).toContain("review this");
```

### T-H9 · append log

`FileArtifactStore.appendText("log.ndjson", "a\n")` twice → file contains `a\na\n`; first line unchanged.
CLI run with `--only icon-home` → `log.ndjson` has at least `asset_started`, `source_selected`, `attempt_started`, `gate_result`, `review_result`, `asset_frozen`, `run_finished`.

### T-H10 · raw output

Fake runner returns `{...passVerdict, reason_note:"extra"}`.
- `review.raw.json` exists; `raw` contains `reason_note`; `ignoredKeys` includes `reason_note`.
- `review.json` does not contain `reason_note`.

### T-H11 · schema repair

Fake runner sequence:
1. `{"verdict":"pass"}` (missing scores) → invalid.
2. valid pass.
Assert `review` returns pass, `repairAttempted=true`, usage summed, runner called twice.
Second test: both invalid → throws `DSH_INVALID_VERDICT`; no third call.

### T-H12 · manifest sidecar

`toManifestReview` with:
- one passed/degraded record,
- one unresolved record,
- `batchGates.iconSet.passed=false`.
Assert sidecar assets include `degraded:true`, `status:"unresolved"`, `batchGates.iconSetPassed=false`, `complete=false`.
Assert `manifest.json` still parses with `AssetManifestSchema`.

### T-H13 · illustration set

`checkIllustrationSet` with three same style/palette → pass.
Change one palette → `ILLUSTRATION_SET_INCONSISTENT`.
CLI integration uses a temp fixture; assert `illustration-set.json` and run failure.

### T-H14 · dsh mock integration

`pnpm test:dsh`:
- Start HTTP server on ephemeral port; response JSON verdict.
- Env: `DSH_HOME=pipeline/dsh/home`, `PRD_UI_VISION_API_KEY=mock`, `BASE_URL=http://127.0.0.1:<port>/v1`, `MODEL=mock-vision`.
- Run `asset:review --only icon-home --runtime dsh --runs <temp>`.
- Assert exit 0, `asset-review.json` passed, `dsh/icon-home-library-1/stdout.txt` exists.
- If `pipeline/node_modules/.bin/dsh` missing → `describe.skip`.

### T-H15 · DX

- `pricing.json` parse and default key.
- `--json`: stdout parseable; includes `summary`, `runDir`, `assets`.
- `normalizeSvg` comment/test: input/output still parse; docs mention XML re-serialization.

## 3. 回归测试

- `pnpm test` ≥233 passed。
- `pnpm typecheck` clean。
- `pnpm phase1:verify --project samples/projects/employee-app/project.yaml` → `2 pages, 0 blockers`。
- `pnpm asset:review --assets samples/assets/m0 --runtime standalone` → `13/13`。
- `pnpm asset:review --assets samples/assets/m0-scenarios --runtime standalone` → `1 passed, 1 unresolved`，exit 1。
- `pnpm asset:review --assets samples/assets/m0 --runtime dsh`（真实 key，人工）→ `13/13`，usage/cost 写入，≤10 元。
- `git grep` 无 key；`git status` clean。

## 4. Manual real-dsh checklist

- [ ] 配 `pipeline/.env`（DeepSeek 默认）。
- [ ] `--only icon-home` 先跑，确认 verdict 和 usage。
- [ ] 跑全部 13 个，确认 `summary.reviewCostCny` ≤10。
- [ ] 检查 `runs/<id>/dsh/*/review.raw.json` 和 `candidate.png`。
- [ ] 检查 `manifest.review.json` 的 degraded/unresolved/set gate。
- [ ] 若成本接近 10 元，停止并记录。

## 5. 退出标准

- 所有 T-H1..T-H14 通过；T-H15 至少 pricing/--json 通过。
- 默认 `pnpm test` 不依赖网络/真实 key。
- 真实 dsh 回归有记录；key 不进入 git。
