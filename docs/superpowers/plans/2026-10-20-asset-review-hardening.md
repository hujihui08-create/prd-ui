# Asset Review Hardening (M0.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the hard-gate bypasses, wire set-level gates, isolate reviewer errors, enforce configuration and cost limits, and make the dsh review path reproducible in CI with a mock endpoint.

**Architecture:** Keep one core (`pipeline/core/asset-review`) and two adapters (`runtime-standalone`, `runtime-dsh`). The core owns gates, batch gates, review-result accounting, and the state machine. The adapters own rendering, dsh subprocesses, usage parsing, and evidence files. `runs/<runId>/` remains canonical.

**Tech Stack:** TypeScript strict, Zod 4, Vitest 5, pnpm workspace, `@xmldom/xmldom`, `@resvg/resvg-js` (image input), dsh `0.2.1-rc.2`, Node 24.

## Global Constraints

- Preserve `phase1:verify` = `2 pages / 0 blockers` and existing `pnpm test` behavior.
- Core must not import `@deepseek-ai/*`, `node:child_process`, `node:fs`, or `@resvg/resvg-js`.
- No secret in git, logs, prompts, `manifest.json`, or `asset-review.json`.
- Default `pnpm test` must not call the real dsh CLI or network.
- `--runtime dsh` defaults to a 10 CNY review-cost cap; do not silently exceed it.
- Keep `AssetReviewVerdictSchema` tolerant of extra annotation keys (strip, don't fail).
- No new runtime/version; no second business-logic implementation.
- Local commits only; no push.

## Checklist Summary

- [ ] Task 1: H1 — reject inline `style` and `transform`
- [ ] Task 2: H2 + H13 — icon/illustration set-level gates
- [ ] Task 3: H3 — reviewer error isolation + `--fail-fast`
- [ ] Task 4: H4 + H5 — strict config + provider fail-fast + docs
- [ ] Task 5: H6 + H15 — usage/cost capture + 10 CNY guard + pricing
- [ ] Task 6: H7 + H12 — PNG image input + `manifest.review.json`
- [ ] Task 7: H8/H9/H10/H11 — stdin, append log, raw output, schema repair
- [ ] Task 8: H14 + H15 — dsh mock integration + `--json`/DX
- [ ] Final: full regression + real dsh run + docs/changelog

---

### Task 1: H1 — reject inline `style` and `transform`

**Files:**
- Modify: `pipeline/core/asset-review/src/gates/svg.ts`
- Modify: `pipeline/core/asset-review/tests/gates.test.ts`
- Verify: `pipeline/runtimes/standalone/tests/fixtures.test.ts`
- Verify: `pipeline/core/asset-review/tests/gates.test.ts`

**Interfaces:**
- `checkSvgSafety(parsed, { allowText })` adds `SVG_INLINE_STYLE` and `SVG_TRANSFORM` blockers.
- Applies to both `checkIcon` and `checkIllustration` through the shared call.

- [ ] **Step 1: Write the failing tests**

Add to `gates.test.ts`:

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

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd pipeline
pnpm vitest run core/asset-review/tests/gates.test.ts
```

Expected: the three tests fail because `style`/`transform` are currently ignored.

- [ ] **Step 3: Implement the checks**

In `gates/svg.ts`, inside the attribute walk of `checkSvgSafety`:

```ts
if (attributeName === "style") {
  issues.push(
    issue("SVG_INLINE_STYLE", "SVG uses an inline style; convert it to presentation attributes.", elementName(element))
  );
}
if (attributeName === "transform") {
  issues.push(
    issue("SVG_TRANSFORM", "SVG uses a transform; flatten it before review.", value)
  );
}
```

Do not add an allow-list in M0.5; the producer/normalizer must flatten.

- [ ] **Step 4: Run gates + fixtures**

```bash
pnpm vitest run core/asset-review/tests/gates.test.ts
pnpm vitest run runtimes/standalone/tests/fixtures.test.ts
```

Expected: new tests pass; 13 m0 fixtures still pass.

- [ ] **Step 5: Commit**

```bash
git add pipeline/core/asset-review/src/gates/svg.ts pipeline/core/asset-review/tests/gates.test.ts
git commit -m "fix: reject inline styles and transforms in asset gates"
```

---

### Task 2: H2 + H13 — set-level gates

**Files:**
- Modify: `pipeline/core/asset-review/src/gates/icon.ts` (keep/extend `checkIconSet`)
- Create: `pipeline/core/asset-review/src/gates/illustration-set.ts`
- Create: `pipeline/core/asset-review/src/batch-gates.ts`
- Modify: `pipeline/core/asset-review/src/state-machine.ts`
- Modify: `pipeline/core/asset-review/src/index.ts`
- Modify: `pipeline/runtimes/standalone/src/asset-cli.ts`
- Test: `pipeline/core/asset-review/tests/batch-gates.test.ts`
- Test: `pipeline/runtimes/standalone/tests/asset-cli.test.ts`
- Test fixture: `pipeline/samples/assets/m0-bad-icons/` (new, test-only) or build in temp dir in the test.

**Interfaces:**

```ts
// batch-gates.ts
export interface BatchGateResult {
  iconSet?: HardGateResult;
  illustrationSet?: HardGateResult;
}

export interface RunBatchGatesInput {
  records: AssetReviewRecord[];
  store: ArtifactStorePort;
}

export async function runBatchGates(input: RunBatchGatesInput): Promise<BatchGateResult>;
```

`checkIllustrationSet`:

```ts
export function checkIllustrationSet(
  illustrations: Array<{ id: string; svg: string; brief: AssetBrief }>
): HardGateResult;
```

Rules: same `styleRef`, same sorted palette, same viewBox size. Any mismatch → `ILLUSTRATION_SET_INCONSISTENT`.

- [ ] **Step 1: Write the failing core test**

Create `batch-gates.test.ts` with two icon records whose frozen SVGs differ in `stroke-width`; assert:

```ts
const result = await runBatchGates({ records, store });
expect(result.iconSet?.passed).toBe(false);
expect(result.iconSet?.issues.some((i) => i.code === "ICON_SET_INCONSISTENT")).toBe(true);
```

Also assert `assets/icon-set.json` is written.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run core/asset-review/tests/batch-gates.test.ts
```

Expected: module not found / no set gate.

- [ ] **Step 3: Implement `runBatchGates`**

- Collect passed records by kind.
- For each icon: read `record.frozen.path` via `store.readText`.
- Call `checkIconSet`.
- For illustrations: call `checkIllustrationSet` with briefs.
- Write `assets/icon-set.json` and `assets/illustration-set.json`.
- Return `BatchGateResult`.

- [ ] **Step 4: Wire into the state machine**

After all assets are processed and before writing `asset-review.json`:

```ts
const batchGates = await runBatchGates({ records, store: input.ports.store });
const setFailed =
  batchGates.iconSet?.passed === false ||
  batchGates.illustrationSet?.passed === false;
const result = {
  // ...
  batchGates,
  passed: summary.unresolved === 0 && summary.total > 0 && !fatalError && !setFailed,
  ...(batchGates.iconSet?.passed === false ? { error: "ICON_SET_INCONSISTENT" } : {}),
  ...(batchGates.illustrationSet?.passed === false ? { error: "ILLUSTRATION_SET_INCONSISTENT" } : {}),
};
```

- [ ] **Step 5: Wire into `manifest.complete`**

In `asset-cli.ts`, after `runAssetReview`:

```ts
const manifest = toAssetManifest({ project, profile, records: result.assets });
const complete =
  manifest.complete &&
  result.batchGates?.iconSet?.passed !== false &&
  result.batchGates?.illustrationSet?.passed !== false;
await store.writeJson("manifest.json", { ...manifest, complete });
```

- [ ] **Step 6: Add CLI integration test**

Create a temp assets dir with two inconsistent icons (copy `home.svg`, change `stroke-width`), run `asset:review --assets <temp> --runtime standalone`, assert exit 1 and `manifest.complete === false`.

- [ ] **Step 7: Run tests + full suite**

```bash
pnpm vitest run core/asset-review/tests/batch-gates.test.ts
pnpm vitest run runtimes/standalone/tests/asset-cli.test.ts
pnpm test
```

- [ ] **Step 8: Commit**

```bash
git add pipeline/core/asset-review pipeline/runtimes/standalone
git commit -m "feat: wire icon and illustration set-level gates"
```

---

### Task 3: H3 — reviewer error isolation

**Files:**
- Modify: `pipeline/core/asset-review/src/state-machine.ts`
- Modify: `pipeline/core/asset-review/src/contracts.ts` (`reviewerErrors` in summary)
- Modify: `pipeline/runtimes/standalone/src/asset-cli.ts` (`--fail-fast`)
- Test: `pipeline/core/asset-review/tests/state-machine.test.ts`
- Test: `pipeline/runtimes/standalone/tests/asset-cli.test.ts` (usage string)

**Interfaces:**

```ts
interface RunAssetReviewInput {
  // existing...
  continueOnReviewerError?: boolean; // default true
}
```

- [ ] **Step 1: Write the failing tests**

Add a fake reviewer that throws for `icon-home` and passes `icon-search`:

```ts
const reviewer: AssetReviewerPort = {
  async review({ brief }) {
    if (brief.id === "icon-home") throw new Error("model down");
    return passVerdict;
  },
};
const result = await run(store, reviewer, {
  briefs: [iconBrief, { ...iconBrief, id: "icon-search" }],
});
expect(result.assets[0]!.status).toBe("unresolved");
expect(result.assets[1]!.status).toBe("passed");
expect(result.summary.reviewerErrors).toBe(1);
expect(result.passed).toBe(false);
```

Fail-fast:

```ts
let calls = 0;
const reviewer = { async review() { calls += 1; throw new Error("down"); } };
await run(store, reviewer, { briefs: [a, b], continueOnReviewerError: false });
expect(calls).toBe(1);
expect(result.assets[1]!.attempts[0]!.status).toBe("reviewer_error");
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: current code aborts and marks both unresolved; `reviewerErrors` missing.

- [ ] **Step 3: Implement**

- Replace `fatalError` reviewer branch with:
  ```ts
  reviewerErrors += 1;
  // record attempt; unresolved for this asset
  if (!input.continueOnReviewerError) {
    fatalError = `REVIEWER_ERROR: ${errorDetails(error)}`;
    break;
  }
  break; // next source/asset; do not switch source
  ```
- Add `reviewerErrors` to summary.
- At the end: `error = fatalError ?? (reviewerErrors > 0 ? \`REVIEWER_ERROR: ${reviewerErrors} asset(s)\` : undefined)`.
- Keep `passed=false` when `reviewerErrors > 0`.

- [ ] **Step 4: Add CLI `--fail-fast`**

`parseArgs` sets `failFast`; `runAssetReview` receives `continueOnReviewerError: !options.failFast`; usage text includes it.

- [ ] **Step 5: Run tests + full suite**

```bash
pnpm vitest run core/asset-review/tests/state-machine.test.ts
pnpm test
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add pipeline/core/asset-review pipeline/runtimes/standalone/src/asset-cli.ts
git commit -m "fix: isolate reviewer errors per asset"
```

---

### Task 4: H4 + H5 — strict config and provider fail-fast

**Files:**
- Modify: `pipeline/runtimes/standalone/src/asset-cli.ts`
- Create: `pipeline/core/asset-review/src/visual-style.ts` (or add `VisualStyleSchema` to contracts)
- Modify: `pipeline/runtimes/dsh/src/adapter.ts` (provider env validation)
- Modify: `pipeline/.env.example`
- Modify: `pipeline/dsh/home/profiles/prd-ui-assets/cordis.patch.yml`
- Modify: `pipeline/dsh/README.md`
- Modify: `README.md`
- Test: `pipeline/runtimes/standalone/tests/asset-cli.test.ts`
- Test: `pipeline/runtimes/dsh/tests/adapter.test.ts`

**Interfaces:**

```ts
export const VisualStyleSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  palette: z.array(z.string()).optional(),
  illustration: z.string().optional(),
  notes: z.string().optional(),
}).strict();
```

`validateDshProviderEnv(env = process.env)` throws `CONFIGURATION_ERROR` if `PRD_UI_VISION_BASE_URL` or `PRD_UI_VISION_MODEL` is empty.

- [ ] **Step 1: Write failing config tests**

Create a temp assets dir with malformed `style.json`; run CLI `--dry-run`; assert exit 1 and `INVALID_STYLE`. Repeat for malformed `source-policy.json` → `INVALID_SOURCE_POLICY`. Missing files → defaults, exit 0.

- [ ] **Step 2: Implement strict loaders**

```ts
async function readOptionalJson(file: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`INVALID_JSON: ${file}: ${errorMessage(error)}`);
  }
}
```

- `loadStyle`: if undefined → `{id:"b-mobile"}`; else `VisualStyleSchema.parse` with `INVALID_STYLE`.
- `loadPolicy`: if undefined → `DEFAULT_SOURCE_POLICY`; else `SourcePolicySchema.parse` with `INVALID_SOURCE_POLICY`.

- [ ] **Step 3: Provider fail-fast**

Add to `DshAssetReviewer.review` before building the task:

```ts
if (!process.env.PRD_UI_VISION_BASE_URL || !process.env.PRD_UI_VISION_MODEL) {
  throw new Error("CONFIGURATION_ERROR: PRD_UI_VISION_BASE_URL and PRD_UI_VISION_MODEL are required");
}
```

Better: inject env through options for tests:
```ts
constructor(options: DshAssetReviewerOptions & { env?: NodeJS.ProcessEnv })
```

- [ ] **Step 4: Update docs/config**

`.env.example`:
```
PRD_UI_VISION_API_KEY=
PRD_UI_VISION_BASE_URL=https://api.deepseek.com/v1
PRD_UI_VISION_MODEL=deepseek-flash
```

Profile `cordis.patch.yml`: remove `?? 'https://api.openai.com/v1'` and `?? 'gpt-4o-mini'`.

Update `README.md`/`pipeline/dsh/README.md` examples.

- [ ] **Step 5: Run tests + docs checks**

```bash
pnpm vitest run runtimes/standalone/tests/asset-cli.test.ts runtimes/dsh/tests/adapter.test.ts
grep -R "api.openai.com\|gpt-4o-mini" pipeline/.env.example pipeline/dsh/home/profiles README.md pipeline/dsh/README.md
```

Expected: no stale OpenAI defaults.

- [ ] **Step 6: Commit**

```bash
git add pipeline/.env.example pipeline/dsh pipeline/runtimes README.md
git commit -m "fix: fail fast on invalid config and missing provider env"
```

---

### Task 5: H6 + H15 — usage/cost capture and 10 CNY guard

**Files:**
- Modify: `pipeline/core/asset-review/src/contracts.ts` (`ReviewUsage`, attempt/summary fields)
- Modify: `pipeline/core/asset-review/src/ports.ts` (`review` returns `ReviewResult`)
- Create: `pipeline/core/asset-review/src/pricing.ts`
- Create: `pipeline/pricing.json`
- Modify: `pipeline/core/asset-review/src/state-machine.ts` (accumulate/guard)
- Modify: `pipeline/runtimes/standalone/src/asset/scripted-reviewer.ts` (return `{ verdict }`)
- Modify: `pipeline/runtimes/standalone/src/asset/model-reviewer.ts` (return `{ verdict, usage? }`)
- Modify: `pipeline/runtimes/dsh/src/adapter.ts` (usage/raw/repair later)
- Modify: `pipeline/runtimes/dsh/src/dsh-process.ts` (parse `--json` usage; see Task 7 for stdin)
- Modify: `pipeline/runtimes/standalone/src/asset-cli.ts` (`--max-review-cost-cny`, pricing load, summary)
- Test: `pipeline/core/asset-review/tests/pricing.test.ts`
- Test: `pipeline/core/asset-review/tests/state-machine.test.ts`
- Test: `pipeline/runtimes/dsh/tests/dsh-process.test.ts`
- Update all `AssetReviewerPort` fakes in tests.

**Interfaces:**

```ts
export interface ReviewUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface ReviewResult {
  verdict: AssetReviewVerdict;
  usage?: ReviewUsage;
  raw?: string;
  ignoredKeys?: string[];
  repairAttempted?: boolean;
}

export interface AssetReviewerPort {
  review(input: AssetReviewerInput): Promise<ReviewResult>;
}

export interface ReviewPricing {
  inputMissUsdPerMillion: number;
  inputCacheUsdPerMillion: number;
  outputUsdPerMillion: number;
  usdToCny: number;
}
```

- [ ] **Step 1: Write failing pricing/cost tests**

`pricing.test.ts`: parse `pipeline/pricing.json`; compute 1M input + 1M output for deepseek-flash → USD 1.5, CNY 10.8 (at 7.2).

`state-machine.test.ts`: fake reviewer returns `{ verdict: pass, usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0 } }`; assert attempt/summary cost fields. With `maxReviewCostCny: 0.5` and two assets, second is unresolved with `budget_exceeded`, error `REVIEW_COST_BUDGET_EXCEEDED`.

- [ ] **Step 2: Update the reviewer port and all implementations**

- `ScriptedReviewer.review` → `{ verdict }`.
- `DshAssetReviewer.review` → `{ verdict, usage, raw, ignoredKeys }`.
- `ModelReviewer.review` → `{ verdict, usage? }` (read `payload.usage.prompt_tokens/completion_tokens`).
- Update `state-machine` to use `result.verdict` and record `result.usage`.
- Update test fakes in `state-machine.test.ts`, `conformance.test.ts`, `adapter.test.ts`, `model-reviewer.test.ts`.

- [ ] **Step 3: Implement cost calculation**

```ts
export function reviewCost(usage: ReviewUsage, pricing: ReviewPricing): { usd: number; cny: number } {
  const usd =
    (usage.inputTokens / 1e6) * pricing.inputMissUsdPerMillion +
    (usage.cacheReadTokens / 1e6) * pricing.inputCacheUsdPerMillion +
    (usage.outputTokens / 1e6) * pricing.outputUsdPerMillion;
  return { usd, cny: usd * pricing.usdToCny };
}
```

- [ ] **Step 4: Add the guard**

In `runAssetReview`, keep `reviewCostCny` across assets. After each review:
```ts
totalReviewCostCny += cost.cny;
if (maxReviewCostCny !== undefined && totalReviewCostCny > maxReviewCostCny) {
  // current asset result stays; remaining assets unresolved with budget_exceeded
  costBudgetExceeded = true;
  break;
}
```
At the top of the asset loop, if `costBudgetExceeded`, push unresolved records with `BUDGET_EXCEEDED`.
At the end, `error = "REVIEW_COST_BUDGET_EXCEEDED"`, `passed=false`.

- [ ] **Step 5: CLI + pricing config**

- Load `pipeline/pricing.json` (or `assetsDir/pricing.json` override).
- `--max-review-cost-cny <n>`; default 10 for `--runtime dsh`, undefined for standalone scripted.
- Print `reviewCostCny` in the summary.
- `--pricing <path>` optional.

- [ ] **Step 6: dsh usage parsing**

Use `dsh --profile <name> --json` and parse NDJSON:
- Find events containing `usage`; dedupe by step id or usage JSON.
- Sum `inputTokens`, `outputTokens`, `cacheReadTokens`.
- If no usage, set `usageSource: "unavailable"` and log a warning; do not fabricate zero cost.

Exact event shape is a spike; add a fixture in `dsh-process.test.ts` once observed. The stdin transport is Task 7.

- [ ] **Step 7: Run tests**

```bash
pnpm vitest run core/asset-review/tests/pricing.test.ts core/asset-review/tests/state-machine.test.ts
pnpm vitest run runtimes/dsh/tests runtimes/standalone/tests
pnpm test
pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add pipeline/core/asset-review pipeline/runtimes pipeline/pricing.json
git commit -m "feat: capture reviewer usage/cost and enforce cny budget"
```

---

### Task 6: H7 + H12 — PNG image input and manifest review sidecar

**Files:**
- Create: `pipeline/runtimes/rendering/src/render-svg.ts` (or `runtimes/standalone/src/asset/render-svg.ts`)
- Create: `pipeline/runtimes/rendering/package.json`, `tsconfig.json`
- Modify: `pipeline/runtimes/dsh/package.json` (add `@prd-ui/rendering`, `@resvg/resvg-js`)
- Modify: `pipeline/runtimes/standalone/package.json` (add `@prd-ui/rendering`)
- Modify: `pipeline/runtimes/dsh/src/adapter.ts`
- Modify: `pipeline/core/asset-review/src/manifest.ts` (sidecar builder)
- Modify: `pipeline/runtimes/standalone/src/asset-cli.ts` (write sidecar)
- Test: `pipeline/runtimes/standalone/tests/render.test.ts`
- Test: `pipeline/runtimes/dsh/tests/adapter.test.ts`
- Test: `pipeline/core/asset-review/tests/manifest.test.ts`

**Interfaces:**

```ts
export async function renderSvgToPng(svg: string, options: { scale?: number }): Promise<Buffer>;
```

- [ ] **Step 1: Write failing render test**

Render `validIllustration` at scale 2; assert PNG dimensions 240×160 (parse PNG IHDR bytes).

- [ ] **Step 2: Implement render**

Use `@resvg/resvg-js`:
```ts
const resvg = new Resvg(svg, { fitTo: { mode: "zoom", value: scale } });
return resvg.render().asPng();
```
Write to `assets/attempts/<id>/<source>-<n>/candidate.png`.

- [ ] **Step 3: Include in dsh task**

`DshAssetReviewer.review`:
- Render before `runDshReview`.
- Write PNG.
- Task adds: `A rendered PNG is at ${pngPath}. Use read_image before scoring.`
- If render fails: log `RENDER_WARNING`, continue with SVG text.

- [ ] **Step 4: Manifest sidecar**

Add `toManifestReview`:
```ts
export interface ManifestReview {
  project: string;
  profile: string;
  assets: Array<{
    id: string;
    status: "passed" | "unresolved";
    sourceTier?: SourceTier;
    degraded: boolean;
    degradedReason?: string;
    fallbackFrom?: SourceTier;
    fallbackReason?: string;
    review?: AssetReviewRecord["review"];
  }>;
  batchGates?: BatchGateResult;
  complete: boolean;
}
```
CLI writes `manifest.review.json`.

- [ ] **Step 5: Run tests**

```bash
pnpm vitest run runtimes/standalone/tests/render.test.ts
pnpm vitest run runtimes/dsh/tests/adapter.test.ts
pnpm vitest run core/asset-review/tests/manifest.test.ts
pnpm test
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add pipeline/runtimes pipeline/core/asset-review
git commit -m "feat: add png evidence and manifest review sidecar"
```

---

### Task 7: H8 + H9 + H10 + H11 — stdin, append log, raw output, schema repair

**Files:**
- Modify: `pipeline/core/asset-review/src/ports.ts` (`appendText`)
- Modify: `pipeline/runtimes/standalone/src/asset/artifact-store.ts`
- Modify: `pipeline/runtimes/standalone/src/asset-cli.ts` (logger)
- Modify: `pipeline/runtimes/dsh/src/dsh-process.ts` (spawn + stdin)
- Modify: `pipeline/runtimes/dsh/src/adapter.ts` (raw, repair)
- Test: `pipeline/runtimes/standalone/tests/artifact-store.test.ts`
- Test: `pipeline/runtimes/dsh/tests/dsh-process.test.ts`
- Test: `pipeline/runtimes/dsh/tests/adapter.test.ts`
- Update `MemoryStore` fakes in `state-machine.test.ts`/`preflight.test.ts` with `appendText`.

**Interfaces:**

```ts
interface ArtifactStorePort {
  // existing...
  appendText(path: string, value: string): Promise<void>;
}

interface CommandRunner {
  (command: string, args: string[], options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    stdin?: string;
  }): Promise<CommandResult>;
}
```

- [ ] **Step 1: Write failing tests**

- Append: two `appendText` calls → both lines present.
- stdin: fake runner captures args `["--profile","prd-ui-assets","-"]` and `stdin` containing the task.
- raw: fake runner returns a verdict with `reason_note`; assert `review.raw.json` and `ignoredKeys`.
- repair: fake runner returns invalid first, valid second; assert `repairAttempted=true` and two calls.

- [ ] **Step 2: Implement append**

`FileArtifactStore.appendText`:
```ts
async appendText(relativePath, value) {
  const absolute = this.resolve(relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await appendFile(absolute, value, "utf8");
}
```
CLI logger:
```ts
await store.appendText("log.ndjson", `${redact(JSON.stringify(event))}\n`);
```
Remove the in-memory `lines` array.

- [ ] **Step 3: Implement stdin runner**

Use `node:child_process.spawn`:
```ts
const child = spawn(command, args, { cwd, env });
if (options.stdin !== undefined) child.stdin.end(options.stdin);
collect stdout/stderr; timeout kill with SIGTERM; resolve on close.
```
`runDshReview` uses args `["--profile", profile, "-"]` and `stdin: task`.

- [ ] **Step 4: Raw output**

`DshAssetReviewer` writes:
```ts
await writeFile(path.join(evidenceDir, "review.raw.json"), JSON.stringify({
  raw: result.raw,
  ignoredKeys: result.ignoredKeys,
  parsed: result.verdict,
}, null, 2));
```

Compute ignored keys in `runDshReview` / `extractVerdict`:
```ts
const known = new Set(["verdict","hardIssues","scores","suggestedChanges","reason"]);
const ignoredKeys = Object.keys(parsed).filter((key) => !known.has(key));
```

- [ ] **Step 5: Schema repair**

In `DshAssetReviewer.review`:
```ts
try {
  return await this.runOnce(task);
} catch (error) {
  if (error instanceof DshError && error.code === "DSH_INVALID_VERDICT") {
    const repairTask = `${task}\n\nPrevious answer was rejected:\n${error.message}\nReturn ONLY a valid JSON verdict; no extra keys.`;
    return await this.runOnce(repairTask, { repairAttempted: true });
  }
  throw error;
}
```
`runOnce` merges usage across attempts.

- [ ] **Step 6: Run tests**

```bash
pnpm vitest run runtimes/standalone/tests/artifact-store.test.ts
pnpm vitest run runtimes/dsh/tests
pnpm test
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add pipeline/core/asset-review/src/ports.ts pipeline/runtimes
git commit -m "feat: stream dsh tasks, append logs, keep raw reviews and repair once"
```

---

### Task 8: H14 + H15 — dsh mock integration and DX

**Files:**
- Create: `pipeline/runtimes/dsh/tests/dsh-integration.test.ts`
- Create: `pipeline/vitest.dsh.config.ts`
- Modify: `pipeline/package.json` (`test:dsh`)
- Modify: `pipeline/runtimes/standalone/src/asset-cli.ts` (`--json`)
- Modify: `pipeline/runtimes/standalone/src/index.ts` (exports)
- Modify: `pipeline/core/asset-review/src/gates/svg.ts` (clarify `normalizeSvg` is XML re-serialization)
- Modify: `README.md`, `pipeline/docs/asset-review-m0.md`, `CHANGELOG.md`

- [ ] **Step 1: Add the mock integration test**

- Start an HTTP server on an ephemeral port returning a valid verdict.
- Env: `DSH_HOME=pipeline/dsh/home`, `PRD_UI_VISION_API_KEY=mock`, `BASE_URL=http://127.0.0.1:<port>/v1`, `MODEL=mock-vision`.
- Run `asset:review --only icon-home --runtime dsh --runs <temp>` via `execFile`.
- Assert exit 0, `asset-review.json` pass, `dsh/` evidence.
- `describe.skipIf(!existsSync(dshBin))`.

- [ ] **Step 2: Add `test:dsh` script**

`package.json`:
```json
"test:dsh": "vitest run --config vitest.dsh.config.ts"
```
`vitest.dsh.config.ts` includes `runtimes/dsh/tests/dsh-integration.test.ts`.

- [ ] **Step 3: Add `--json` output**

`asset:review` prints a JSON summary with `runDir`, `summary`, `assets`, `batchGates`, `error` when `--json`.

- [ ] **Step 4: Export asset CLI**

`runtimes/standalone/src/index.ts`:
```ts
export { main as assetMain, parseArgs as parseAssetArgs, USAGE as ASSET_USAGE } from "./asset-cli.js";
```

- [ ] **Step 5: Docs**

- `README.md`: hardening status, test counts, cost guard.
- `pipeline/docs/asset-review-m0.md`: `--max-review-cost-cny`, `--fail-fast`, `--json`, `test:dsh`.
- `CHANGELOG.md`: new entries + commit trail.
- `normalizeSvg`: add a comment/alias clarifying it is XML re-serialization, not design normalization (T-H15-03).

- [ ] **Step 6: Run full regression**

```bash
cd pipeline
pnpm test
pnpm typecheck
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/final-phase1
pnpm asset:review --assets samples/assets/m0 --runtime standalone --runs /tmp/final-m0
pnpm asset:review --assets samples/assets/m0-scenarios --runtime standalone --runs /tmp/final-scenarios
pnpm test:dsh
```

- [ ] **Step 7: Real dsh regression (manual, key required)**

```bash
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 --runtime dsh --runs /tmp/final-real-dsh
```

Expected: 13/13, `summary.reviewCostCny` ≤10, no key in artifacts.

- [ ] **Step 8: Commit**

```bash
git add pipeline README.md CHANGELOG.md
git commit -m "test: add dsh mock integration and hardening docs"
```

---

## Self-Review

- **Spec coverage:** H1 (Task 1), H2/H13 (Task 2), H3 (Task 3), H4/H5 (Task 4), H6/H15 (Task 5), H7/H12 (Task 6), H8/H9/H10/H11 (Task 7), H14/H15 (Task 8).
- **Type consistency:** `ReviewResult`, `ReviewUsage`, `ReviewPricing`, `BatchGateResult`, `AssetReviewerPort.review`, `appendText`, `runDshReview.stdin` are used consistently across tasks.
- **Breaking-change inventory:** every `AssetReviewerPort` fake and every `ArtifactStorePort` fake must be updated; `AssetReviewSummary` new fields are optional for old run files.
- **No placeholders:** each task lists files, interfaces, failing test, implementation, verification command, and commit.
- **Not implemented yet:** this plan is a document; do not start coding until approved.
