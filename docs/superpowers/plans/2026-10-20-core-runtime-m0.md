# Core + Dual Runtime + dsh M0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a runtime-neutral core, add `@prd-ui/asset-review` with a deterministic state machine, run the same 13-asset A-library fixture through standalone and dsh runtimes, and leave the existing Phase 1A/1B pipeline green.

**Architecture:** One core under `pipeline/core/`, two thin adapters under `pipeline/runtimes/`. Core owns contracts, hard gates, prompt/schema, thresholds, retry/fallback/budget, and manifest. `runtime-standalone` owns fs/model adapters and the CLI. `runtime-dsh` owns the Cordis plugin, tools, and headless subprocess. `runs/<runId>/` is the canonical record; dsh session data is execution evidence only.

**Tech Stack:** TypeScript strict, Zod 4, pnpm workspace, Vitest 5, tsx, `svgo`, `@xmldom/xmldom`, Node 24, dsh `0.2.1-rc.2` (pinned).

## Global Constraints

- Work under `pipeline/`; do not touch `spike/`.
- Keep existing behavior: `pnpm test` 157+ green, `pnpm typecheck` clean, `pnpm phase1:verify` = 2 pages / 0 blockers for `employee-app`.
- Package names and imports do not change during the directory reorg.
- Core must not import `@deepseek-ai/*`, `node:child_process`, or `node:fs`.
- All new user-facing behavior has tests; run the full suite before each commit.
- No secrets in git, logs, prompts, manifests, or `asset-review.json`.
- Local commits only; do not push.
- Historical plans under `docs/superpowers/plans/2026-10-19-*` are history; do not rewrite their paths.
- M0 scope: A-library only for real files; B/C adapter interfaces and state-machine branches are implemented but stubbed.
- M0 does not implement IA/Interaction/Visual Style agents, Figma, screenshot diff, recording/trace, or phase1 `assets` stage.

## File Structure

```text
pipeline/
  core/
    contracts/            # existing, moved
    design-system/        # existing, moved
    compiler/             # existing, moved
    validators/           # existing, moved
    renderer-html/        # existing, moved (no CLI)
    orchestrator/         # existing, moved (no CLI)
    asset-review/         # new: contracts, ports, gates, verdict, prompt, state machine, manifest, preflight
  runtimes/
    standalone/           # new: phase1 CLI, render CLI, asset CLI, fs/library/scripted/model adapters
    dsh/                  # new: Cordis plugin, tools, headless adapter, preset
  dsh/
    home/profiles/prd-ui-assets/  # versioned profile definition; node_modules/.env ignored
    README.md
  samples/assets/
    m0/                   # happy path: 10 icons + 3 illustrations
    m0-scenarios/         # retry + unresolved scenarios
  package.json            # scripts + pinned dsh devDependency
  pnpm-workspace.yaml     # core/* + runtimes/* + dsh
  vitest.config.ts        # core/** + runtimes/** includes
AGENTS.md                 # ZCode adaptation: new layout, commands, constraints
CHANGELOG.md              # change record
```

---

### Task 1: Reorganize into core/runtimes and adapt ZCode/docs

**Files:**
- Move: `pipeline/packages/contracts` → `pipeline/core/contracts`
- Move: `pipeline/packages/design-system` → `pipeline/core/design-system`
- Move: `pipeline/packages/compiler` → `pipeline/core/compiler`
- Move: `pipeline/packages/validators` → `pipeline/core/validators`
- Move: `pipeline/packages/renderer-html` → `pipeline/core/renderer-html`
- Move: `pipeline/pipeline/orchestrator` → `pipeline/core/orchestrator`
- Move: `core/orchestrator/src/cli.ts` → `runtimes/standalone/src/phase1-cli.ts`
- Move: `core/renderer-html/src/cli.ts` → `runtimes/standalone/src/render-html-cli.ts`
- Move: `core/orchestrator/tests/cli.test.ts` → `runtimes/standalone/tests/phase1-cli.test.ts`
- Create: `pipeline/runtimes/standalone/package.json`
- Create: `pipeline/runtimes/standalone/tsconfig.json`
- Modify: `pipeline/pnpm-workspace.yaml`
- Modify: `pipeline/package.json`
- Modify: `pipeline/vitest.config.ts`
- Modify: `pipeline/README.md`
- Create: `AGENTS.md`
- Modify: `docs/handoffs/2026-10-20-prd-ui-agent-dsh-handoff.md` §8 path map

**Interfaces:**
- `@prd-ui/orchestrator` keeps exporting `runPhase1`, `Phase1RunError`, `createRunId`, `loadProjectConfig`, state-machine helpers.
- `runtimes/standalone/src/phase1-cli.ts` consumes `@prd-ui/orchestrator`.
- Root scripts: `phase1:verify` → `tsx runtimes/standalone/src/phase1-cli.ts`; `render:html` → `tsx runtimes/standalone/src/render-html-cli.ts`.

- [x] **Step 1: Move packages with git mv**

```bash
cd pipeline
mkdir -p core runtimes/standalone/src runtimes/standalone/tests
git mv packages/contracts core/contracts
git mv packages/design-system core/design-system
git mv packages/compiler core/compiler
git mv packages/validators core/validators
git mv packages/renderer-html core/renderer-html
git mv pipeline/orchestrator core/orchestrator
git mv core/orchestrator/src/cli.ts runtimes/standalone/src/phase1-cli.ts
git mv core/renderer-html/src/cli.ts runtimes/standalone/src/render-html-cli.ts
git mv core/orchestrator/tests/cli.test.ts runtimes/standalone/tests/phase1-cli.test.ts
rmdir packages pipeline 2>/dev/null || true
```

- [x] **Step 2: Fix CLI imports**

In `runtimes/standalone/src/phase1-cli.ts`, replace:

```ts
import { Phase1RunError, runPhase1, type Phase1Options } from "./run-phase1.js";
```

with:

```ts
import {
  Phase1RunError,
  runPhase1,
  type Phase1Options,
} from "@prd-ui/orchestrator";
```

In `runtimes/standalone/src/render-html-cli.ts`, replace local imports with:

```ts
import { PageSpecSchema, type PageSpec } from "@prd-ui/contracts";
import { getProfile } from "@prd-ui/design-system";
import { renderDocument, renderIndex } from "@prd-ui/renderer-html";
```

In `runtimes/standalone/tests/phase1-cli.test.ts`, replace `../src/cli.js` with `../src/phase1-cli.js`.

- [x] **Step 3: Create standalone package**

`pipeline/runtimes/standalone/package.json`:

```json
{
  "name": "@prd-ui/runtime-standalone",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": { "typecheck": "tsc -p tsconfig.json" },
  "dependencies": {
    "@prd-ui/asset-review": "workspace:*",
    "@prd-ui/contracts": "workspace:*",
    "@prd-ui/design-system": "workspace:*",
    "@prd-ui/orchestrator": "workspace:*",
    "@prd-ui/renderer-html": "workspace:*",
    "yaml": "^2.9.1"
  }
}
```

`pipeline/runtimes/standalone/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests"]
}
```

> `@prd-ui/asset-review` does not exist until Task 2. For Task 1, temporarily omit it from `dependencies`, run the suite, then add it back in Task 2. Do not leave a broken workspace link.

- [x] **Step 4: Update workspace, scripts, test config**

`pipeline/pnpm-workspace.yaml`:

```yaml
packages:
  - "core/*"
  - "runtimes/*"
allowBuilds:
  esbuild: true
```

`pipeline/package.json` scripts:

```json
"phase1:verify": "tsx runtimes/standalone/src/phase1-cli.ts",
"render:html": "tsx runtimes/standalone/src/render-html-cli.ts"
```

`pipeline/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["core/**/*.test.ts", "runtimes/**/*.test.ts"],
    environment: "node",
  },
});
```

- [x] **Step 5: Run install and full verification**

```bash
cd pipeline
pnpm install
pnpm test
pnpm typecheck
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/employee-app-runs
pnpm render:html --run /tmp/employee-app-runs/<runId> --out /tmp/employee-app-html
```

Expected: 157 tests pass, typecheck clean, `Phase 1A OK: 2 pages, 0 blockers`, renderer writes HTML.

- [x] **Step 6: Update docs and ZCode adaptation**

`pipeline/README.md`: replace `packages/...` with `core/...`; replace `pipeline/orchestrator` with `core/orchestrator`; add `runtimes/standalone` for CLI entries.

`docs/handoffs/2026-10-20-prd-ui-agent-dsh-handoff.md` §8: update the file map to `pipeline/core/*` and `pipeline/runtimes/*`; add a note that the 2026-10-20 reorg moved packages and old plans are historical.

Create `AGENTS.md` at repo root:

```markdown
# Repository AGENTS.md

This repository is a PRD → UI pipeline. The architecture is one core plus two runtime adapters.

## Layout

- `pipeline/core/*` — runtime-neutral contracts, design system, compiler, validators, renderer, orchestrator, asset-review.
- `pipeline/runtimes/standalone` — file-system and model adapters + CLIs.
- `pipeline/runtimes/dsh` — dsh Cordis plugin/tools/headless adapter.
- `pipeline/dsh` — project-local dsh profile (never modify `~/.dsh`).
- `docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md` — current design spec.
- `docs/superpowers/plans/2026-10-19-*` — historical plans; paths there are historical and should not be rewritten.

## Commands

Run from `pipeline/`:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/employee-app-runs
pnpm asset:review --project samples/projects/employee-app/project.yaml --assets samples/assets/m0 --runtime standalone --runs /tmp/m0-runs
```

## Rules

- Do not import `@deepseek-ai/*` from `core/`.
- Do not write final handoff from agents; only `runs/<id>/`.
- Never commit keys or `.env`; only `.env.example`.
- Keep `pnpm phase1:verify` at 2 pages / 0 blockers.
- Local commits only; no push.
```

- [x] **Step 7: Commit**

```bash
cd "/Users/jihui/Desktop/产品、ui"
git add pipeline AGENTS.md docs/handoffs/2026-10-20-prd-ui-agent-dsh-handoff.md
git commit -m "refactor: split pipeline into core and standalone runtime"
```

---

### Task 2: Asset-review contracts and verdict thresholds

**Files:**
- Create: `pipeline/core/asset-review/package.json`
- Create: `pipeline/core/asset-review/tsconfig.json`
- Create: `pipeline/core/asset-review/src/contracts.ts`
- Create: `pipeline/core/asset-review/src/verdict.ts`
- Create: `pipeline/core/asset-review/src/index.ts`
- Test: `pipeline/core/asset-review/tests/contracts.test.ts`
- Test: `pipeline/core/asset-review/tests/verdict.test.ts`
- Modify: `pipeline/runtimes/standalone/package.json` (add `@prd-ui/asset-review`)
- Modify: `pipeline/pnpm-workspace.yaml` (already covers `core/*`)

**Interfaces:**
- `AssetBriefSchema`, `AssetCandidateSchema`, `HardGateResultSchema`, `AssetReviewVerdictSchema`, `AssetAttemptSchema`, `AssetReviewRecordSchema`, `SourcePolicySchema`, `BudgetConfigSchema`.
- `validateVerdict(verdict: AssetReviewVerdict, options: { brandCritical: boolean }): VerdictCheck`.
- `VerdictCheck = { verdict: AssetReviewVerdict; inconsistencies: string[] }`.

- [x] **Step 1: Write the failing contract/verdict tests**

`tests/verdict.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateVerdict } from "../src/verdict.js";
import type { AssetReviewVerdict } from "../src/contracts.js";

const base: AssetReviewVerdict = {
  verdict: "pass",
  hardIssues: [],
  scores: { brandFit: 5, semantics: 5, consistency: 4, editability: 4, composition: 5 },
  suggestedChanges: [],
  reason: "ok",
};

describe("validateVerdict", () => {
  it("passes a 4.6 average with every dimension >= 4", () => {
    expect(validateVerdict(base, { brandCritical: false }).verdict.verdict).toBe("pass");
  });

  it("downgrades pass when any dimension is below 4", () => {
    const verdict = { ...base, scores: { ...base.scores, brandFit: 3 } };
    const result = validateVerdict(verdict, { brandCritical: false });
    expect(result.verdict.verdict).toBe("retry");
    expect(result.inconsistencies).toContain("SCORE_BELOW_MIN");
  });

  it("downgrades pass when the average is below 4.5", () => {
    const verdict = { ...base, scores: { brandFit: 4, semantics: 4, consistency: 4, editability: 4, composition: 4 } };
    const result = validateVerdict(verdict, { brandCritical: false });
    expect(result.verdict.verdict).toBe("retry");
    expect(result.inconsistencies).toContain("AVERAGE_BELOW_MIN");
  });

  it("requires 4.8 average for brand-critical assets", () => {
    const verdict = { ...base, scores: { brandFit: 5, semantics: 4, consistency: 4, editability: 4, composition: 5 } };
    const result = validateVerdict(verdict, { brandCritical: true });
    expect(result.verdict.verdict).toBe("retry");
    expect(result.inconsistencies).toContain("BRAND_AVERAGE_BELOW_MIN");
  });

  it("forces fallback when hardIssues are present", () => {
    const verdict = { ...base, hardIssues: ["embedded text"] };
    const result = validateVerdict(verdict, { brandCritical: false });
    expect(result.verdict.verdict).toBe("fallback");
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd pipeline && pnpm vitest run core/asset-review/tests/verdict.test.ts`
Expected: FAIL because `src/verdict.ts` does not exist.

- [x] **Step 3: Implement contracts and verdict**

`src/contracts.ts` must define Zod schemas with `.strict()` and export inferred types. Use `z.enum(["icon","illustration","poster"])`, `z.enum(["A","B","C"])`, `z.enum(["library","commission","ai-vector","ai-raster","upload"])`. Scores are `z.number().int().min(1).max(5)`.

`src/verdict.ts`:

```ts
import type { AssetReviewVerdict } from "./contracts.js";

export interface VerdictCheck {
  verdict: AssetReviewVerdict;
  inconsistencies: string[];
}

export function validateVerdict(
  verdict: AssetReviewVerdict,
  options: { brandCritical: boolean }
): VerdictCheck {
  const inconsistencies: string[] = [];
  const values = Object.values(verdict.scores);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  if (verdict.hardIssues.length > 0) {
    return {
      verdict: { ...verdict, verdict: "fallback" },
      inconsistencies: ["HARD_ISSUES_FORCE_FALLBACK"],
    };
  }

  if (values.some((value) => value < 4)) inconsistencies.push("SCORE_BELOW_MIN");
  if (average < 4.5) inconsistencies.push("AVERAGE_BELOW_MIN");
  if (options.brandCritical && average < 4.8) inconsistencies.push("BRAND_AVERAGE_BELOW_MIN");

  if (verdict.verdict === "pass" && inconsistencies.length > 0) {
    return { verdict: { ...verdict, verdict: "retry" }, inconsistencies };
  }

  return { verdict, inconsistencies };
}
```

- [x] **Step 4: Run tests**

Run: `cd pipeline && pnpm vitest run core/asset-review/tests`
Expected: PASS.

- [x] **Step 5: Add package wiring and typecheck**

`core/asset-review/package.json` dependencies: `@prd-ui/contracts`, `zod`, `svgo`, `@xmldom/xmldom` (gates arrive in Task 3). Add `@prd-ui/asset-review` to `runtimes/standalone` dependencies. Run `pnpm install && pnpm typecheck`.

- [x] **Step 6: Commit**

```bash
git add pipeline/core/asset-review pipeline/runtimes/standalone/package.json pipeline/pnpm-lock.yaml
git commit -m "feat: add asset review contracts and verdict thresholds"
```

---

### Task 3: SVG normalization and hard gates

**Files:**
- Create: `pipeline/core/asset-review/src/gates/svg.ts`
- Create: `pipeline/core/asset-review/src/gates/icon.ts`
- Create: `pipeline/core/asset-review/src/gates/illustration.ts`
- Create: `pipeline/core/asset-review/src/gates/index.ts`
- Test: `pipeline/core/asset-review/tests/gates.test.ts`

**Interfaces:**
- `normalizeSvg(svg: string): Promise<string>` (svgo).
- `checkIcon(svg: string, brief: AssetBrief): HardGateResult`.
- `checkIconSet(icons: Array<{ id: string; svg: string }>): HardGateResult`.
- `checkIllustration(svg: string, brief: AssetBrief): HardGateResult`.

- [ ] **Step 1: Write failing gate tests**

Use a valid 24×24 Lucide-like SVG and invalid variants. Assert codes:
`SVG_INVALID`, `SVG_NO_VIEWBOX`, `ICON_GRID`, `ICON_STROKE_WIDTH`, `ICON_HARDCODED_COLOR`, `ICON_TEXT`, `SVG_SCRIPT`, `SVG_EXTERNAL_REF`, `ICON_RASTER`, `ICON_SET_INCONSISTENT`, `ILLUSTRATION_TEXT`, `ILLUSTRATION_PALETTE`, `ILLUSTRATION_SIZE`, `ILLUSTRATION_SAFE_AREA`.

- [ ] **Step 2: Run to verify failure**

Run: `cd pipeline && pnpm vitest run core/asset-review/tests/gates.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement SVG parsing helpers**

Use `DOMParser` from `@xmldom/xmldom`. Implement:
- `parseSvg(svg): Document | null`
- `walkElements(doc, visit)`
- `attr(element, name): string | null`
- `collectColorValues(doc): string[]` (fill, stroke, stop-color)
- reject `on*` attributes and `javascript:` values.

`normalizeSvg` uses `optimize` from `svgo` with `{ plugins: ["preset-default"] }`; return `result.data`.

- [ ] **Step 4: Implement icon and illustration gates**

Icon gate rules from the spec §4.4. Icon set gate compares the first path's `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, and `fill` across all icons; any mismatch is `ICON_SET_INCONSISTENT`.

Illustration gate: viewBox >= 96×72 (from brief size), palette membership (allow `none`, `currentColor`, `url(#...)` and check gradient stop colors), no `<text>`, no external refs, and no element outside the viewBox.

- [ ] **Step 5: Run tests and typecheck**

Run: `cd pipeline && pnpm vitest run core/asset-review/tests/gates.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pipeline/core/asset-review
git commit -m "feat: add svg normalization and asset hard gates"
```

---

### Task 4: Review prompt and asset state machine

**Files:**
- Create: `pipeline/core/asset-review/src/prompt.ts`
- Create: `pipeline/core/asset-review/src/state-machine.ts`
- Create: `pipeline/core/asset-review/src/ports.ts`
- Test: `pipeline/core/asset-review/tests/state-machine.test.ts`
- Test: `pipeline/core/asset-review/tests/prompt.test.ts`

**Interfaces:**
- `buildReviewPrompt(input: ReviewPromptInput): string` — returns a JSON-only prompt with brief, style, candidate, gate result, schema, thresholds.
- `runAssetReview(input: RunAssetReviewInput): Promise<AssetReviewRunResult>`.
- `AssetReviewPorts` includes `producer`, `reviewer`, `store`, `clock`, `log`.
- `AssetReviewRunResult = { runId; assets: AssetReviewRecord[]; summary; passed: boolean }`.

- [ ] **Step 1: Write failing state-machine tests**

Use fake ports with scripted verdict arrays. Cover:
1. first pass → one frozen record, `passed: true`.
2. retry twice then pass → 3 attempts, `passed: true`.
3. three fails on A → next source B pass → `degraded: true` if tier lower.
4. all sources fail → `unresolved`, `passed: false`.
5. budget exceeded → `unresolved` with `BUDGET_EXCEEDED`.
6. reviewer throws → `reviewer_error`, no source switch.

- [ ] **Step 2: Run to verify failure**

Run: `cd pipeline && pnpm vitest run core/asset-review/tests/state-machine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement ports and state machine**

The state machine is pure orchestration: it calls ports, validates verdicts with `validateVerdict`, records each attempt, enforces 3 attempts/source and 9/asset, and calls `store.writeJson` for `asset-review.json` and `manifest.json`. It does not import `node:fs`; all IO goes through `store`.

Key result shape:

```ts
interface AssetReviewRunResult {
  runId: string;
  assets: AssetReviewRecord[];
  summary: {
    total: number;
    passed: number;
    retried: number;
    unresolved: number;
    degraded: number;
  };
  passed: boolean;
}
```

- [ ] **Step 4: Implement prompt builder and schema**

Use `z.toJSONSchema(AssetReviewVerdictSchema)` (Zod 4) to embed the schema. The prompt must include:
- role: independent asset reviewer
- what it sees: brief, style, candidate, hard gate
- what it must not see: producer reasoning/cost
- scoring dimensions and thresholds
- output: JSON only, no markdown fences
- `verdict` must be `pass|retry|fallback`

- [ ] **Step 5: Run tests and typecheck**

Run: `cd pipeline && pnpm vitest run core/asset-review/tests && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pipeline/core/asset-review
git commit -m "feat: add independent asset review state machine"
```

---

### Task 5: Manifest builder and dry-run preflight

**Files:**
- Create: `pipeline/core/asset-review/src/manifest.ts`
- Create: `pipeline/core/asset-review/src/preflight.ts`
- Test: `pipeline/core/asset-review/tests/manifest.test.ts`
- Test: `pipeline/core/asset-review/tests/preflight.test.ts`

**Interfaces:**
- `toAssetManifest(input: { project; profile; records; }): AssetManifest`.
- `preflightAssetBriefs(input: { briefs; producer; store; }): Promise<PreflightResult>` — resolves candidates and runs hard gates, no reviewer.

- [ ] **Step 1: Write failing tests**

Manifest: only frozen records become assets; `complete` is false if any record is unresolved; `degraded` is surfaced in the record, not the legacy manifest.

Preflight: returns per-brief `{ assetId, candidate, gate }`; missing library file produces a failure, not a throw.

- [ ] **Step 2: Implement and run**

Run: `cd pipeline && pnpm vitest run core/asset-review/tests && pnpm typecheck`.

- [ ] **Step 3: Commit**

```bash
git add pipeline/core/asset-review
git commit -m "feat: add asset manifest builder and dry-run preflight"
```

---

### Task 6: Standalone artifact store, library source, scripted reviewer

**Files:**
- Create: `pipeline/runtimes/standalone/src/asset/artifact-store.ts`
- Create: `pipeline/runtimes/standalone/src/asset/library-source.ts`
- Create: `pipeline/runtimes/standalone/src/asset/scripted-reviewer.ts`
- Create: `pipeline/runtimes/standalone/src/asset/model-reviewer.ts`
- Create: `pipeline/runtimes/standalone/src/asset/index.ts`
- Test: `pipeline/runtimes/standalone/tests/library-source.test.ts`
- Test: `pipeline/runtimes/standalone/tests/scripted-reviewer.test.ts`

**Interfaces:**
- `FileArtifactStore` implements `ArtifactStorePort` with sha256.
- `LibrarySourceAdapter` reads `library/index.json`, copies the candidate into the run attempt dir, returns `AssetCandidate`.
- `ScriptedReviewer` reads `scripted-reviews.json` keyed by `${assetId}/${source}/${attempt}`.
- `ModelReviewer` is optional; missing key → `CONFIGURATION_ERROR` with the env var name.

- [ ] **Step 1: Write failing tests**

Library: resolves `icon-home` from a temp index; missing id → `LIBRARY_MISSING`; hash matches file content.
Scripted: returns configured verdict; missing key → `SCRIPTED_REVIEW_MISSING`.

- [ ] **Step 2: Implement adapters**

All fs access uses `node:fs/promises`; paths resolve against `runDir`. Writes are atomic (write temp + rename) where practical.

- [ ] **Step 3: Run tests and typecheck**

Run: `cd pipeline && pnpm vitest run runtimes/standalone/tests && pnpm typecheck`.

- [ ] **Step 4: Commit**

```bash
git add pipeline/runtimes/standalone
git commit -m "feat: add standalone asset adapters"
```

---

### Task 7: M0 fixtures (10 icons + 3 illustrations + scenarios)

**Files:**
- Create: `pipeline/samples/assets/m0/briefs/icons.json`
- Create: `pipeline/samples/assets/m0/briefs/illustrations.json`
- Create: `pipeline/samples/assets/m0/library/icons/*.svg` (10)
- Create: `pipeline/samples/assets/m0/library/illustrations/*.svg` (3)
- Create: `pipeline/samples/assets/m0/library/index.json`
- Create: `pipeline/samples/assets/m0/scripted-reviews.json`
- Create: `pipeline/samples/assets/m0/LICENSE-lucide.txt`
- Create: `pipeline/samples/assets/m0-scenarios/**`

**Assets:**
- Icons from Lucide (ISC): `home`, `package`, `search`, `plus`, `minus`, `chevron-left`, `chevron-right`, `circle-alert`, `refresh-cw`, `user`. Copy the SVG files into the fixture and keep the license notice.
- Illustrations: local test SVGs, 120×80, palette from the brief, no text/logo; `license: "test-fixture"`.
- `scripted-reviews.json`: all 13 pass with scores `{brandFit:5, semantics:5, consistency:4, editability:4, composition:5}` (average 4.6).
- `m0-scenarios`: `icon-retry` (retry then pass) and `illustration-unresolved` (three fails, A-only).

- [ ] **Step 1: Download/copy Lucide icons and add license**

Use `curl -L https://unpkg.com/lucide-static@latest/icons/<name>.svg -o ...` or copy from a local `lucide-static` install. Verify each file starts with `<svg` and has `viewBox="0 0 24 24"`.

- [ ] **Step 2: Write 3 test illustrations**

Each must pass `checkIllustration`: viewBox `0 0 120 80`, palette values only, no text, elements inside viewBox. Use simple shapes/gradients-free SVGs.

- [ ] **Step 3: Write briefs/index/reviews**

`index.json` shape:

```json
{
  "assets": [
    {
      "id": "icon-home",
      "kind": "icon",
      "file": "icons/home.svg",
      "license": "ISC",
      "library": "lucide",
      "tone": "stroke"
    }
  ]
}
```

- [ ] **Step 4: Validate fixtures through preflight**

Run a vitest fixture test or a small tsx script to parse every brief and run `checkIcon`/`checkIllustration`; all must pass. Add `pipeline/runtimes/standalone/tests/fixtures.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add pipeline/samples/assets
git commit -m "test: add m0 asset fixtures and review scenarios"
```

---

### Task 8: `asset:review` CLI and integration tests

**Files:**
- Create: `pipeline/runtimes/standalone/src/asset-cli.ts`
- Create: `pipeline/runtimes/standalone/src/index.ts`
- Test: `pipeline/runtimes/standalone/tests/asset-cli.test.ts`
- Modify: `pipeline/package.json` (`asset:review` script)

**CLI:**
```bash
pnpm asset:review --project <yaml> --assets <dir> --runtime standalone|dsh \
  --runs <dir> [--only <id>]... [--dry-run] [--reviewer scripted|model] \
  [--budget-usd <n>] [--budget-minutes <n>] [--help]
```

- [ ] **Step 1: Write failing CLI tests**

Cover:
- `--help` → exit 0, prints usage.
- unknown arg → exit 2.
- `--runtime standalone` on `m0` → exit 0, summary 13/13, manifest complete.
- `--only icon-home` → 1 asset.
- `--dry-run` → no `frozen/`, gate files exist.
- `--runtime dsh` without adapter → clear `RUNTIME_UNAVAILABLE` (until Task 9 wires it).
- `--reviewer model` without key → exit 1 with `PRD_UI_VISION_API_KEY`.

- [ ] **Step 2: Implement CLI**

Parse args with the same style as `phase1-cli.ts`. Load project config via `loadProjectConfig`; load briefs from `briefs/*.json` (arrays) or `briefs.json`; load `library/index.json`; construct ports; call `runAssetReview` or `preflightAssetBriefs`. Print summary and run dir.

- [ ] **Step 3: Run tests and full suite**

```bash
cd pipeline
pnpm vitest run runtimes/standalone/tests
pnpm test
pnpm typecheck
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/employee-app-runs
pnpm asset:review --project samples/projects/employee-app/project.yaml --assets samples/assets/m0 --runtime standalone --runs /tmp/m0-runs
```

Expected: 13 assets pass, exit 0.

- [ ] **Step 4: Commit**

```bash
git add pipeline/runtimes/standalone pipeline/package.json
git commit -m "feat: add asset review CLI with standalone runtime"
```

---

### Task 9: dsh plugin, tools, and headless adapter

**Files:**
- Create: `pipeline/runtimes/dsh/package.json`
- Create: `pipeline/runtimes/dsh/tsconfig.json`
- Create: `pipeline/runtimes/dsh/src/plugin.ts`
- Create: `pipeline/runtimes/dsh/src/tools.ts`
- Create: `pipeline/runtimes/dsh/src/dsh-process.ts`
- Create: `pipeline/runtimes/dsh/src/adapter.ts`
- Create: `pipeline/runtimes/dsh/src/index.ts`
- Create: `pipeline/runtimes/dsh/cordis.patch.yml`
- Create: `pipeline/runtimes/dsh/preset/asset-reviewer/{preset.yml,agent.cordis.yml,skill.md}`
- Test: `pipeline/runtimes/dsh/tests/dsh-process.test.ts`
- Test: `pipeline/runtimes/dsh/tests/adapter.test.ts`
- Test: `pipeline/runtimes/dsh/tests/plugin.test.ts`

**Interfaces:**
- `DshAssetReviewer implements AssetReviewerPort`; constructor accepts `{ dshHome, profile, dshBin, cwd, timeoutMs, spawn? }`.
- `runDshReview(input): Promise<{ verdict; stdout; stderr; session }>`; strips markdown fences, parses JSON, validates with `AssetReviewVerdictSchema`.
- `apply(ctx, config)` registers `read_asset_brief`, `normalize_svg`, `validate_icon`, `score_asset` via `ctx.tools.register(defineTool(...))`.
- `defineTool` output: `{ schema: { type: "json" }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] }`.

- [ ] **Step 1: Write failing parser tests**

`dsh-process.test.ts`: input stdout with ` ```json ... ``` ` → parsed; non-zero exit → `DSH_EXIT_NONZERO`; timeout → `DSH_TIMEOUT`; invalid schema → `REVIEWER_SCHEMA_INVALID`.

- [ ] **Step 2: Write failing plugin tests**

Fake `ctx.tools.register` captures definitions; assert four tools registered; call `score_asset` with a pass verdict below threshold → returns `retry` + `VERDICT_INCONSISTENT`.

- [ ] **Step 3: Implement plugin, tools, adapter**

Use `defineTool` from `@deepseek-ai/dsh-tools` only in the bundled plugin source. To keep TypeScript typechecking without dsh installed, add a local type shim `src/dsh-tools.d.ts` with the minimal `defineTool`/`Context` types, or add `@deepseek-ai/dsh-tools` as a devDependency pinned. Prefer the devDependency if install is reliable; otherwise use the shim and bundle.

The plugin must import only Node builtins + core; esbuild bundles `@prd-ui/asset-review`.

- [ ] **Step 4: Build and test**

Add `esbuild` devDependency and scripts:

```json
"build": "esbuild src/plugin.ts --bundle --platform=node --format=esm --outfile=dist/plugin.js --external:@deepseek-ai/*",
"prepare": "pnpm build"
```

Run: `cd pipeline && pnpm vitest run runtimes/dsh/tests && pnpm --filter @prd-ui/runtime-dsh build`.

- [ ] **Step 5: Commit**

```bash
git add pipeline/runtimes/dsh
git commit -m "feat: add dsh asset reviewer plugin and headless adapter"
```

---

### Task 10: Project-local dsh profile, key docs, and spike

**Files:**
- Create: `pipeline/dsh/home/profiles/prd-ui-assets/package.json`
- Create: `pipeline/dsh/home/profiles/prd-ui-assets/cordis.yml`
- Create: `pipeline/dsh/home/profiles/prd-ui-assets/cordis.patch.yml`
- Create: `pipeline/dsh/home/.gitignore`
- Create: `pipeline/dsh/README.md`
- Create: `pipeline/.env.example`
- Modify: `pipeline/package.json` (pin `@deepseek-ai/dsh` devDependency)
- Modify: `pipeline/.gitignore` or root `.gitignore` (ignore `.env`, `pipeline/dsh/home/node_modules`, credentials)

**Profile:**
- `package.json` dependencies: `@prd-ui/runtime-dsh: "file:../../../../runtimes/dsh"`.
- `dsh.profile.bundles`: `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-headless`, `@deepseek-ai/dsh-llm-pi-ai`, `@prd-ui/runtime-dsh`.
- `cordis.patch.yml`: register `dsh-llm-pi-ai` vision provider with `apiKeyEnv: PRD_UI_VISION_API_KEY`, `defaultInput: [text, image]`, and `agent-default-model` pointing to it; insert `@prd-ui/runtime-dsh`.
- `.env.example`: `PRD_UI_VISION_API_KEY=`, `PRD_UI_VISION_BASE_URL=`, `PRD_UI_VISION_MODEL=`.

- [ ] **Step 1: Install pinned dsh**

```bash
cd pipeline
pnpm add -D @deepseek-ai/dsh@0.2.1-rc.2
```

If install fails, record the failure and keep the devDependency pin in `package.json`; do not add `@next`.

- [ ] **Step 2: Create profile and install**

```bash
cd pipeline/dsh/home/profiles/prd-ui-assets
pnpm install
```

Verify `node_modules/@prd-ui/runtime-dsh` and the dsh bundles resolve.

- [ ] **Step 3: Spike: headless profile**

Run:

```bash
cd pipeline
DSH_HOME="$PWD/dsh/home" ./node_modules/.bin/dsh --profile prd-ui-assets "Return the JSON {\"ok\":true} and nothing else."
```

Expected: stdout contains `{"ok":true}` and exit 0. If the profile/plugin loader fails, record the exact error in `pipeline/dsh/README.md` and try the fallback (direct `npx -y @deepseek-ai/dsh@0.2.1-rc.2` with the same `DSH_HOME`). Do not modify `~/.dsh`.

- [ ] **Step 4: Wire `--runtime dsh` in the CLI**

Add `DshAssetReviewer` to `asset-cli.ts` with dynamic import. `DSH_HOME` defaults to `pipeline/dsh/home`; `profile` defaults to `prd-ui-assets`; `dshBin` defaults to `pipeline/node_modules/.bin/dsh`; `cwd` defaults to `pipeline`. Missing key or binary → `configuration_error` with the exact env var/path.

- [ ] **Step 5: Run dsh smoke test**

```bash
cd pipeline
pnpm asset:review --project samples/projects/employee-app/project.yaml --assets samples/assets/m0 --only icon-home --runtime dsh --runs /tmp/m0-dsh-smoke
```

If no key: assert a clear `configuration_error`; do not fake a pass. Record the blocker in the changelog.

- [ ] **Step 6: Commit**

```bash
git add pipeline/dsh pipeline/.env.example pipeline/package.json pipeline/pnpm-lock.yaml .gitignore
git commit -m "feat: add project-local dsh profile and vision key setup"
```

---

### Task 11: Conformance tests, docs, changelog, ZCode memory

**Files:**
- Create: `pipeline/runtimes/standalone/tests/conformance.test.ts`
- Modify: `pipeline/README.md`
- Modify: `docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md` (status + implementation notes)
- Modify: `docs/handoffs/2026-10-20-prd-ui-agent-dsh-handoff.md` (status)
- Create/Modify: `CHANGELOG.md`
- Modify: `~/.zcode/cli/memories/projects/ui-fd66d504b43a0ab9/memory/dsh-single-core-dual-runtime.md` (implementation status)
- Modify: `~/.zcode/cli/memories/projects/ui-fd66d504b43a0ab9/memory/MEMORY.md` (hook update)

**Conformance:**
- Run the `m0-scenarios` fixture through the core state machine twice: once with `ScriptedReviewer`, once with a fake `DshAssetReviewer` that returns the same scripted verdicts (in-process, no subprocess).
- Normalize timestamps and run paths; compare the decision traces: `{assetId, source, attempt, verdict}` sequence and final statuses.
- Assert byte-identical `normalized.svg` and `gate.json` for deterministic tools.

- [ ] **Step 1: Write conformance test**

Use `vi.useFakeTimers()` or a fixed clock. Compare arrays with `expect(traceA).toEqual(traceB)`.

- [ ] **Step 2: Run full regression**

```bash
cd pipeline
pnpm test
pnpm typecheck
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/employee-app-runs
pnpm asset:review --project samples/projects/employee-app/project.yaml --assets samples/assets/m0 --runtime standalone --runs /tmp/m0-runs
pnpm asset:review --project samples/projects/employee-app/project.yaml --assets samples/assets/m0-scenarios --runtime standalone --runs /tmp/m0-scenarios
```

Expected: 157+ tests pass; phase1 2 pages/0 blockers; m0 13/13; m0-scenarios exits 1 with the expected retry/unresolved trace.

- [ ] **Step 3: Update docs and changelog**

`CHANGELOG.md` entries:
- 2026-10-20: checkpoint commits `884e8d7`, `e6569a8`, `88efc68`.
- 2026-10-20: core/runtimes reorg, asset-review, standalone runtime, dsh M0, tests, docs.
- Note any remaining blockers (vision key, real dsh profile spike).

`pipeline/README.md`: add core/runtimes layout, `asset:review` usage, link to `docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md`.

Spec/handoff: add an "Implementation status" section with commits and checklist results.

- [ ] **Step 4: Update ZCode memory**

Update `dsh-single-core-dual-runtime.md` with:
- implemented packages/paths;
- test counts and M0 status;
- blockers (vision key, dsh spike);
- link to `CHANGELOG.md`.
Update `MEMORY.md` hook line.

- [ ] **Step 5: Final commit**

```bash
git add pipeline docs CHANGELOG.md AGENTS.md
git commit -m "docs: record m0 implementation, tests and changelog"
```

---

## Self-Review

- Spec coverage: §3 reorg (Task 1), §4 contracts/ports/state machine/gates/verdict/manifest (Tasks 2–5), §5 standalone (Tasks 6–8), §6 dsh (Tasks 9–10), §7 credentials (Tasks 10–11), §8 fixtures/acceptance (Tasks 7–8, 11), §9 tests (every task + Task 11), §10 errors (Tasks 4, 9, 10), §11 migration (task order), §12 risks (recorded in Task 10/11), §13 open questions (changelog + memory).
- Type consistency: `AssetBrief`, `AssetCandidate`, `HardGateResult`, `AssetReviewVerdict`, `AssetAttempt`, `AssetReviewRecord`, `AssetReviewPorts`, `runAssetReview`, `validateVerdict`, `toAssetManifest`, `preflightAssetBriefs` are named consistently across tasks.
- No placeholders: every task has concrete files, interfaces, test cases, commands, and a commit. The only intentionally deferred item is the real dsh vision key/run, which is gated and recorded.
