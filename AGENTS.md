# Repository AGENTS.md

This repository is a PRD → UI pipeline. The architecture is one core plus two runtime adapters.

## Layout

- `pipeline/` — the pnpm workspace; all commands run from here. The repo root has no package manifest.
- **Branch topology:** `main` carries the v0.7 docs only. The v0.7 code (43 commits) is on `v0.7-visual-gates`, checked out clean at `.worktrees/v0.7` (gitignored) and **not merged**. Run v0.7+ commands there; `main`'s `pipeline/` has none of the v0.7 CLIs.
- `pipeline/core/*` — runtime-neutral packages: `contracts`, `design-system`, `compiler`, `validators`, `renderer-html`, `orchestrator`, `asset-review`, `asset-compiler`, `agents`, `spec-engineer`, `intake`, `visual-review`, `figma`, `handoff`.
- `pipeline/runtimes/standalone` — file-system and model adapters plus the CLIs (`phase1:verify`, `render:html`, `render:measure`, `asset:review`, `asset:compile`, `agent:run`, `agent:sign`, `spec:engineer`, `structure:check`, `structure:diff`, `block:verify`, `block:experiment`, `intake:run`, `visual:review`, `visual:baseline`, `visual:sign`, `figma:plan`, `figma:verify`, `figma:conformance`, `figma:parity`, `figma:serve`, `figma:sign`, `handoff:pack`, `v07:smoke`, `studio:prepare`).
- `pipeline/runtimes/dsh` — dsh Cordis plugin/tools/headless adapter plus the M1 agent runner; bundles to `dist/plugin.js` with esbuild.
- `pipeline/runtimes/figma` — Figma sandbox plugin (`src/plugin.ts` + `src/ui.html`), bundled to gitignored `dist/` with esbuild; manual Figma gate.
- `pipeline/studio` — read-only Vite/React/Tailwind v4 + shadcn workbench; reads generated `public/studio-data.json` + copied HTML; never orchestrates.
- `pipeline/dsh/home/profiles/prd-ui-assets` — project-local dsh profile for asset review. `pipeline/dsh/home/profiles/prd-ui-agents` — M1 profile (base/headless/pi-ai, no tool plugin, 32768 maxTokens). `pipeline/dsh/home/profiles/prd-ui-intake` — intake profile (same bundles, 65536 maxTokens for 8-page PRD review). `pipeline/dsh/home/profiles/prd-ui-visual` — Visual Critic profile (vision provider, 65536 maxTokens; kept tools are `read`, `read_image`, `glob`, `grep`, `skill`, `working_directory`, and session-state tools; no write/edit/bash/workflow/subagent/web; see `pipeline/dsh/README.md`). Profile definitions are versioned; `node_modules/`, sessions, attachments, and credentials are ignored. Never modify `~/.dsh`; `DSH_HOME` points here.
- `pipeline/samples/` — `employee-app` (2-page mobile slice), `projects/employee-app-appointments-03` (4-page real-PRD test slice from `03-预约与告知`), `projects/employee-app-phase2` (8-page Phase 2 exit slice from 00–04), `demo-crm`, `projects/demo-orders-intake` (8-page signed intake brief), M0 asset fixtures (`assets/m0`, `assets/m0-scenarios`), M1 agent fixtures (`agents/m1`), intake fixtures (`agents/intake`, `agents/intake-employee-app`, `agents/intake-appointments-03`, `agents/intake-employee-app-phase2`), block fixtures (`agents/blocks`, v0.7 branch), plus Visual Critic fixtures (`agents/visual-critic`). The 8-page sample acceptance project is `samples/project.demo-orders-intake.yaml`.
- `pipeline/artifacts/employee-app/` — checked-in rendered HTML and screenshots. `pipeline/artifacts/employee-app-appointments-03/` — the 03 real-PRD slice's 4 HTML pages and Playwright screenshots. `pipeline/artifacts/employee-app-phase2/` — the 8-page exit evidence. On `main` it holds HTML/screenshots/asset review; on the v0.7 branch it also holds `figma/{spec-source,plans,readback,diff,parity,conformance,signoff,figma-files.json}`, `render/{metrics,structure}`, `blocks/`, `visual-review/`, `v07-smoke.json`, and the signed `handoff/` package.
- `spike/` — historical Phase 0 Figma spike with its own pnpm workspace; read-only context, do not rewrite.
- `pipeline/docs/asset-review-m0.md` — M0 asset-review usage; `pipeline/docs/agent-m1.md` — M1 agent-layer usage, artifacts, signoffs, exit codes; `pipeline/docs/spec-engineer-v0.md` — Page Spec consumption; `pipeline/docs/prd-review-briefer.md` — PRD review, UI Brief, signoffs, resume, publish.
- `README.md` and `CHANGELOG.md` — project overview and change record.
- `docs/superpowers/specs/` — design specs. `docs/superpowers/plans/` — historical plans; paths there are historical and should not be rewritten.

## Commands

Run from `pipeline/`:

```bash
pnpm install
pnpm test                 # vitest: core/** and runtimes/**; excludes dsh integration
pnpm test:dsh             # real pinned dsh + local mock; no real key/network
pnpm exec vitest run core/asset-review/tests/gates.test.ts   # focused test
pnpm typecheck             # tsc --noEmit for every workspace package

pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/employee-app-runs
pnpm render:html --run /tmp/employee-app-runs/<runId> --out /tmp/employee-app-html
pnpm asset:review --project samples/projects/employee-app/project.yaml --assets samples/assets/m0 --runtime standalone --runs /tmp/m0-runs
pnpm agent:run --project samples/projects/employee-app/project.yaml --runs /tmp/m1-agent-runs --allow-unreviewed
pnpm spec:engineer --project samples/projects/employee-app/project.yaml --agent-run /tmp/m1-agent-runs/<runId> --runs /tmp/spec-engineer-runs
pnpm intake:run --project samples/project.demo-orders.yaml --prd samples/sample-prd.md --runs /tmp/intake-runs --fixtures samples/agents/intake
pnpm intake:run --project samples/projects/employee-app/project.yaml --prd samples/projects/employee-app/prd.md --fixtures samples/agents/intake-employee-app --runs /tmp/intake-employee
pnpm phase1:verify --project samples/project.demo-orders-intake.yaml --runs /tmp/phase1-8p
DSH_HOME="$PWD/dsh/home" pnpm agent:run --project samples/project.demo-orders-intake.yaml --runtime dsh --profile prd-ui-intake --signoff-ia /tmp/signoff-ia-8p.md --runs /tmp/m1-8p
pnpm agent:sign --run /tmp/m1-8p/<runId> --signoff-visual-style /tmp/signoff-visual-style-8p.md
pnpm spec:engineer --project samples/project.demo-orders-intake.yaml --agent-run /tmp/m1-8p/<runId> --runs /tmp/spec-8p
pnpm render:html --run /tmp/spec-8p/<runId> --out /tmp/html-8p

# v0.4 visual acceptance: strict motion → render → baseline → real critic → sign
pnpm spec:engineer --project samples/projects/employee-app-phase2/project.yaml --agent-run /tmp/m1-final2/<runId> --runs /tmp/spec-v04 --strict-motion
pnpm render:html --run /tmp/spec-v04/<runId> --out /tmp/html-v04
pnpm visual:baseline --project samples/projects/employee-app-phase2/project.yaml --spec-run /tmp/spec-v04/<runId> --html /tmp/html-v04 --out baselines/employee-app-phase2
DSH_HOME="$PWD/dsh/home" pnpm visual:review --project samples/projects/employee-app-phase2/project.yaml --spec-run /tmp/spec-v04/<runId> --html /tmp/html-v04 --baseline baselines/employee-app-phase2 --runtime dsh --profile prd-ui-visual --runs /tmp/visual-v04 --max-cost-cny 3 --json
pnpm visual:sign --run /tmp/visual-v04/<runId> --signoff-visual /tmp/signoff-visual.md

# v0.6 Phase 3A: Figma plan/diff, asset package, read-only Studio
pnpm figma:plan --spec-run /tmp/spec-v05/run-2026-10-23T06-07-48-403Z --out /tmp/figma-v06
pnpm --dir runtimes/figma build
pnpm figma:verify --plan /tmp/figma-v06/figma-plan.<page>.json --readback <downloaded>.json
pnpm asset:compile --library samples/assets/m0/library/index.json --source samples/assets/m0/library --licenses samples/assets/m0 --out /tmp/assets-m0
pnpm studio:prepare --spec-run /tmp/spec-v05/run-2026-10-23T06-07-48-403Z --html /tmp/html-v05 --out studio/public
pnpm studio:build
pnpm studio:smoke --json

# v0.7: plan↔HTML conformance, render metrics, structure, parity, smoke, handoff
rm -rf /tmp/html-v07-final
pnpm render:html --run artifacts/employee-app-phase2/figma/spec-source --out /tmp/html-v07-final
pnpm figma:conformance --spec-run artifacts/employee-app-phase2/figma/spec-source --html /tmp/html-v07-final --plans artifacts/employee-app-phase2/figma/plans --out artifacts/employee-app-phase2/figma/conformance
pnpm render:measure --spec-run artifacts/employee-app-phase2/figma/spec-source --html /tmp/html-v07-final --out artifacts/employee-app-phase2/render/metrics
pnpm structure:check --spec-run artifacts/employee-app-phase2/figma/spec-source --metrics artifacts/employee-app-phase2/render/metrics/render-metrics.json --project samples/projects/employee-app-phase2/project.yaml --out artifacts/employee-app-phase2/render/structure
pnpm structure:diff --before <spec-run> --after <spec-run> --out /tmp/structure-diff.json
pnpm block:verify --spec-run <spec-run> --json
pnpm block:experiment --project samples/projects/employee-app-phase2/project.yaml --baseline artifacts/employee-app-phase2/figma/spec-source --pages today,appointment-list --fixtures samples/agents/blocks --runs /tmp/block-experiment
# parity needs real Figma PNGs (<figma>/parity/figma.<page>.png) + a signed baseline
pnpm figma:parity --figma artifacts/employee-app-phase2/figma/parity --baseline baselines/employee-app-phase2 --spec-run artifacts/employee-app-phase2/figma/spec-source --out artifacts/employee-app-phase2/figma/parity
# one smoke runs conformance → render:measure → structure:check → figma:parity (stops at the first failure)
pnpm v07:smoke --spec-run artifacts/employee-app-phase2/figma/spec-source --html /tmp/html-v07-final --project samples/projects/employee-app-phase2/project.yaml --figma artifacts/employee-app-phase2/figma --baseline baselines/employee-app-phase2 --out artifacts/employee-app-phase2 --json
# manual Figma gate: serve plans, build in the plugin, then verify/parity/sign
pnpm figma:serve --figma artifacts/employee-app-phase2/figma --port 9600
pnpm figma:verify --plan artifacts/employee-app-phase2/figma/plans/figma-plan.<page>.json --readback artifacts/employee-app-phase2/figma/readback/figma-readback.<page>.json --out artifacts/employee-app-phase2/figma/diff/figma-diff.<page>.json
pnpm figma:sign --figma artifacts/employee-app-phase2/figma --baseline baselines/employee-app-phase2 --signoff-figma /tmp/signoff-figma.md
pnpm handoff:pack --spec-run artifacts/employee-app-phase2/figma/spec-source --html /tmp/html-v07-final --figma artifacts/employee-app-phase2/figma --visual-run artifacts/employee-app-phase2/visual-review --assets artifacts/employee-app-phase2/asset-compiler/phase2 --baseline baselines/employee-app-phase2 --out artifacts/employee-app-phase2/handoff --zip

# Real dsh: export .env first; the CLI does not auto-load it.
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm asset:review --project samples/projects/employee-app/project.yaml --assets samples/assets/m0 --runtime dsh --runs /tmp/m0-runs-dsh
DSH_HOME="$PWD/dsh/home" pnpm agent:run --project samples/projects/employee-app/project.yaml --runtime dsh --runs /tmp/m1-agent-dsh
```

- With no options, `pnpm phase1:verify` runs `samples/project.demo-orders.yaml`
  (8 pages); `employee-app` is the 2-page acceptance slice and
  `project.demo-orders-intake.yaml` is the signed 8-page acceptance project.
- `--runtime dsh` for asset review needs a vision key; `standalone` with the
  scripted reviewer is the keyless path.
- `agent:run` defaults to `standalone` scripted fixtures; `--runtime dsh` uses
  the `prd-ui-agents` profile. `--brief` overrides the project brief and
  `--profile` overrides the dsh profile (the 8-page M1 run uses
  `prd-ui-intake`). `--allow-unreviewed` is a development smoke flag and never
  produces `success`.
- `spec:engineer` consumes an M1 run (`success`/`awaiting_signoff`/`partial`);
  it writes Page Specs only when the gate passes. The compiler now writes stable
  semantic node ids; `--strict-motion` makes unresolved bindings blockers for
  every brief page (clean 8 pages: 0 unresolved).
- `intake:run` produces PRD review + IA + UI Brief; PRD/IA and brief signoffs
  are separate. It writes `ui-brief.json` only on `success`; use `--resume`
  after signing. Brief signoff must carry the canonical `briefHash`. The brief
  gate runs compiler dry-run plus Phase 1 semantic validators.
- `visual:review` has a project-local signed-critique cache keyed by visual
  screenshot manifest hash + Page Spec hash + runtime/profile/model
  (`pipeline/.visual-cache/`, gitignored); a signed hit reuses findings/signoff
  with zero model calls, and any manifest/spec change misses.
- `visual:baseline` never runs a model; only a human runs it and commits the
  PNGs + manifest. `visual:review` needs a baseline and never updates it;
  `--runtime dsh --profile prd-ui-visual` calls the real critic, whose timeout
  defaults to 900000ms. `visual:sign` binds `manifestHash` + `findingsHash`;
  waivers only apply to `VISUAL_CRITIC_BLOCKER`.
- `pnpm test:dsh` fails with an install hint if the pinned dsh binary is
  missing; only `SKIP_DSH=1` skips it.
- `figma:conformance` compares each committed plan against the **rendered** HTML
  (Playwright computed styles) and exits 1 on blockers, 2 on infrastructure
  errors. It needs fresh HTML: `artifacts/employee-app-phase2/html` predates the
  v0.5.x colour tokens and the v0.7 `data-node-id` coverage, so re-render into
  `/tmp` first.
- `render:measure` writes `render-metrics.json`; `structure:check` consumes it
  and **requires `--project`** (project overrides live in the YAML). Measured
  structure findings are warnings in v0.7; the CLI only exits 1 on a blocker.
- `figma:parity` needs real `<figma>/parity/figma.<pageId>.png` files plus a
  signed baseline (`manifest.json`); it never updates the baseline. A committed
  `<out>/parity.config.json` pins thresholds for later runs; explicit flags still
  override them. Calibrated cross-renderer thresholds are pixel ≤2%, SSIM ≥0.92,
  cluster ≤250 (not the stricter defaults).
- `v07:smoke` runs conformance → render:measure → structure:check →
  figma:parity (only with both `--figma` and `--baseline` and every Figma PNG
  present) and stops at the first failure; it writes `<out>/v07-smoke.json` and
  prints one JSON summary line. A skipped parity sets `paritySkipped: true` and
  `complete: false` — a skip is never a full pass. It does **not** run
  `figma:verify`, which needs manual Figma readbacks.
- `figma:serve` serves plans and accepts readback/PNG saves from the plugin.
  Scratch readbacks save to `readback/`, delivery builds to `readback/delivery/`,
  and the exported PNG to `parity/figma.<page>.png`. `figma:sign` binds five
  evidence hashes, **re-derives every stored diff from the current plan +
  readback** (`FIGMA_DIFF_STALE`), and re-hashes the parity PNG + baseline PNG
  (`PARITY_HASH_STALE`). A stored `passed: true` is never trusted on its own.
- `handoff:pack` is fail-closed: it re-derives Figma diffs, re-hashes parity
  inputs, checks conformance + visual signoffs, the signed baseline, the
  spec-engineer gate, assets/licenses, and placeholders before staging; a failure
  leaves no output directory. It requires `render/metrics/render-metrics.json`
  (or `--metrics`), binds supplied HTML/Page Spec bytes to the conformance and
  visual inputs, and uses `figma/parity/figma.<page>.png` for
  `screenshots/figma/` (legacy manual crops go to `screenshots/figma-manual/`
  with a known-gap note).
- `block:verify` verifies `artifacts/block-manifest/<pageId>.json` (round-trip +
  allowedComponents/requiredStates); `block:experiment` is the block-generation
  pilot (`--fixtures` is the deterministic free path, `--runtime dsh` the real
  one). Promotion requires measured `contentHeight` **and** `documentHeight`
  deltas ≤5%, Phase 1 0 blockers, token drift ≤ baseline, conformance, and
  parity; without `--figma` + `--figma-baseline` it can only return
  `insufficient_evidence`.
- There is no lint or format script; `pnpm typecheck` is the static gate.

## Current state (v0.7 signed, 2026-10-27)

**Where the work is:** `main` has only the v0.7 design/plan docs. The v0.7
implementation is 43 commits on `v0.7-visual-gates`, checked out clean at
`.worktrees/v0.7` and **not merged**. All results below were produced there;
the v0.7 handoffs live there too and disappear from `main`'s tree until merge.

Verified in the worktree: `pnpm test` **987 passed** (87 files), `pnpm test:dsh`
**4 passed** (3 files), `pnpm typecheck` clean, `pnpm --dir runtimes/figma
typecheck` clean and build OK. `phase1:verify` is 8 / 2 / 4 / 8 pages with 0
blockers across demo-orders, employee-app, 03-slice, and phase2.

v0.7 exit (signed by 胡冀徽 on 2026-10-27): `figma:conformance` **0 blocker / 0
major / 233 checked** on fresh HTML; `render:measure` 8 pages with no overflow;
`structure:check --project` 0 warnings / 0 blockers; delivery `figma:verify`
**8/8 passed** in `fileKey Ccy4HCkRVOVM70LDeyi4ZP` (0 blocker; appointment-list
1 major within threshold); visual baseline regenerated (24 cases / 8 default),
Visual Critic **0 blocker / 0 major / 3 minor** (¥0.4406); `figma:parity` **8/8**
with calibrated thresholds (measured pixel 0.338–1.698%, SSIM 0.9306–0.9884,
cluster 99–235); `figma:sign` (five hashes) and `visual:sign` recorded;
`v07:smoke` `complete: true`; `handoff:pack` produced
`pipeline/artifacts/employee-app-phase2/handoff/` (114 files, `handoff.zip`
sha256 `61b216bd…96eda1`, five gates passed, both signoffs inside).

Next: merge `v0.7-visual-gates` locally, then v0.8 (real-project pilot + IA
`actionPlacement` contract). RC v0.9; final v1.0. Latest handoffs (on the v0.7
branch until merge): `docs/handoffs/2026-10-26-v07-final-review-fixes.md` and
`docs/handoffs/2026-10-26-v07-implementation-handoff.md` (the latter's §10 is
the debt list).

## Technical debt (v0.8 backlog, as of 2026-10-27)

> Design spec with the D1–D16 contract/acceptance details and the 2026-10-27
> decisions: `docs/superpowers/specs/2026-10-27-v08-debt-closure-design.md`
> (on `main`).

- **Action contract (D2, highest priority):** the brief has no action identity
  or placement. v0.8 replaces `actions: string[]` with `ActionRef[]`
  (`id`/`label`/`placement`) **end-to-end** — compiler `Button.action`, HTML
  `data-action`, inline JS dispatch, and gates — so label renames stop changing
  behavior. It also adds an `ActionMenu` for overflow and moves `detail`'s
  secondary actions from the `fields` filter-row to summary `card-actions`.
  Old briefs are rejected (schema major), and the 8-page brief is regenerated
  and re-signed.
- **Figma state frames (D16):** Figma carries only the default state. v0.8
  builds multi-state plans (`figma-plan.<page>.<variant>.json`), per-variant
  conformance/verify/parity, and pilots `today`; the 8-page 24-case rollout is
  v0.8.1.
- **Block generation:** the pilot concluded `rollback` at ¥0.3302, but it ran
  before the conformance remediation (baseline was then 19 / 708 blockers).
  Re-run `block:experiment` before treating that as final. Open issues:
  `requiredStates` semantics, preserving baseline node ids, conformance cost of
  new nodes.
- **Unmapped component types:** the `employee-app` sample's `inventory-query`
  uses `Switch` + `InventoryCard`; they exist in the compiler and validators but
  the renderer branches omit `data-node-id` and the plan renders empty frames,
  so conformance reports 6 `CONFORMANCE_NODE_MISSING`. Decision: complete both
  mappings (renderer id + Figma styles) in v0.8; genuinely unknown types are
  rejected in Phase 1.
- **Renderer/compiler pairing rule:** `checked` counts depend on renderer
  `data-node-id`. Adding a component type requires updating all five touchpoints
  (contract, catalogs, renderer, plan compiler/coverage, plugin/tests).
- **Parity thresholds:** the single 2% / 0.92 / 250 bound is 5× looser than the
  best page's measured score. v0.8 switches to per-case thresholds =
  measured + margin, capped at the current global values (tighten only), with
  `measured` and `baselineHash` recorded in `parity.config.json` and the config
  hash bound into signoff.
- **Visual Critic minors (v0.7.x):** appointment-list calendar block density /
  repeated times; appointment-form 选择 lacks ghost-button chrome; today's
  callback row lacks a chevron.
- **`figma/spec-source` is not a full spec run:** it has `artifacts/page-spec`
  but no `findings/spec-engineer-gate.json`. `spec-run-v07` is a real run whose
  8 page specs are byte-identical; v0.8 repacks from it and records `specRun`
  in the handoff manifest.
- **Handoff known gaps** (recorded in `handoff.manifest.json`): v0.8 closes
  delivery readback/diff, the Material Symbols font subset, the manual v0.6
  crops, and block manifests; state frames are D16; no `.fig` binary is a
  permanent gap (fileKey only).
- **v0.6.x leftovers:** full component library and the Material Symbols vector
  set were deferred to v0.9/v1.0 (the font subset lands in v0.8); readback
  orchestration folds into the smoke step.
- **`v07:smoke` excludes `figma:verify`** today; v0.8 adds it as a fifth step
  (headless on committed readbacks), so `complete` requires verify.

## Architecture boundaries

- `core/` is runtime-neutral: it must not import `@deepseek-ai/*` or any runtime adapter.
- Dependency direction: `contracts` ← `design-system` ← `compiler` / `validators` /
  `renderer-html`; `orchestrator` composes them; `asset-review` and `agents`
  depend only on `contracts`; `spec-engineer` consumes `contracts` + `agents`
  schemas, while the CLI uses `compiler` to build base Page Specs. `intake`
  consumes `contracts` + `agents` ports/roles; the CLI owns the compiler
  dry-run for the signed brief.
- Runtime adapters implement core ports. The core state machine owns retries,
  source fallback, budgets, and manifest freezing; dsh reviews one candidate per
  attempt. Do not duplicate state-machine logic in an adapter. M1 `runM1` owns
  design-agent retries, gate repair rounds, budgets, failure isolation, and
  signoffs; `runIntake` owns PRD/IA/brief retries, gates, resume, and the two
  human signoffs. `DshAgentRunner` owns one model call plus one schema repair.
- New runtime-neutral behavior belongs in `core/`; file-system, model, and
  process wiring belongs in `runtimes/`.
- `core/figma` consumes `contracts` + `design-system`; `core/asset-compiler` and
  `core/handoff` consume `contracts`; `studio` is an independent read-only app.
  `core/` must not import Playwright, pngjs, pixelmatch, fflate, or `node:fs` —
  browser/PNG/zip/filesystem work belongs to `runtimes/standalone`.
- `runtimes/dsh` and `runtimes/figma` build `dist/` with esbuild; the other
  packages are consumed as TypeScript source via tsx/vitest.
- SVG→PNG rendering lives in `runtimes/standalone`; `@resvg/resvg-js` must not
  be imported by `runtimes/dsh` or its esbuild bundle.
- dsh review tasks use `--json -` with the task on stdin; verdict comes from
  `final.text`, usage from `status(step_end)`. Do not add a second transport.

## Conventions

- ESM everywhere (`"type": "module"`). TypeScript is `strict` with
  `noUncheckedIndexedAccess`, `moduleResolution: Bundler`, and `noEmit`.
- Relative imports use an explicit `.js` extension in TS sources (e.g. `./ids.js`).
- Tests live in each package's `tests/` directory and are included in that
  package's `tsconfig`; vitest collects `core/**/*.test.ts` and
  `runtimes/**/*.test.ts`, but the default config excludes
  `runtimes/dsh/tests/*integration.test.ts` so `pnpm test` stays offline. Run
  `pnpm test:dsh` for those paths.
- Workspace packages are referenced as `@prd-ui/*` with `workspace:*`.

## Gotchas

- `pipeline/.env` (gitignored) holds `PRD_UI_VISION_API_KEY`, `_BASE_URL`, and
  `_MODEL`; `.env.example` is the template. Never commit keys.
- The CLI does not auto-load `.env`; run `set -a; . ./.env; set +a` before a
  real dsh/model review.
- Review pricing lives in `pipeline/pricing.json`; update it when the provider
  or peak/off-peak pricing changes. The default dsh review cap is 10 CNY.
- The dsh CLI and bundles are pinned to `0.2.1-rc.2`; do not use `@next`.
  Smoke test: `DSH_HOME="$PWD/dsh/home" ./node_modules/.bin/dsh --profile prd-ui-assets 'Return {"ok":true}'`.
- The M1 profile is `prd-ui-agents`; it mounts no project tool plugin. Its
  `maxTokens` is 32768 because `deepseek-flash` can spend 8K on reasoning before
  emitting JSON. The agent runner uses `--json -` and `final.text`.
- `runs/` is gitignored and is the only agent output location. The renderer
  consumes a completed `manifest.json` (`complete: true`). M1 outputs stay under
  `runs/<runId>/`; `asset-briefs/*.json` are plain `AssetBrief` objects so the
  M0 asset review can consume them.
- `.zcode/` holds local ZCode session/plan state; it is untracked today, so do
  not commit it.

## Rules

- Do not import `@deepseek-ai/*` from `core/`.
- Do not write final handoff from agents; only `runs/<id>/`.
- Never commit keys or `.env`; only `.env.example`.
- Keep the employee-app `pnpm phase1:verify` at 2 pages / 0 blockers.
- Local commits only; no push.

## Read before changing sensitive areas

- `docs/superpowers/specs/2026-10-20-core-runtime-m0-design.md` — current core/runtime design.
- `docs/superpowers/specs/2026-10-20-m1-agent-layer-design.md` — M1 agent layer contracts, gates, budgets, signoffs.
- `docs/superpowers/specs/2026-10-20-phase-2-spec-engineer-design.md` — Phase 2 Spec Engineer v0: consume M1 specs into Page Spec.
- `docs/superpowers/specs/2026-10-20-phase-2-prd-review-ui-briefer-design.md` — Phase 2 front half: PRD Review + UI Briefer.
- `docs/superpowers/specs/2026-10-21-8page-renderer-mockdata-visual-fixes-design.md` — 8-page renderer/slots/mockData/fieldLabels fixes.
- `docs/superpowers/specs/2026-10-21-visual-fidelity-v01-design.md` — calendar, fixed action footer, form CTA, notice blocks.
- `docs/superpowers/specs/2026-10-22-v04-motion-visual-regression-design.md` — motion presets, semantic node ids, visual review/gates/cache, picker/date.
- `docs/superpowers/specs/2026-10-23-v041-visual-patch-design.md` — v0.4.1 signed patch: today CTA, 7-column week, inline error, datetime display, reschedule storage.
- `docs/superpowers/specs/2026-10-23-v05-visual-a11y-closure-design.md` — v0.5 signed: loading/empty/mode/a11y/critic stop rule.
- `docs/superpowers/specs/2026-10-23-v06-figma-studio-asset-compiler-design.md` — v0.6 Figma plan/plugin/readback diff, Asset Compiler, read-only Studio (implemented and signed as part of the v0.6/v0.7 chain).
- `docs/superpowers/specs/2026-10-26-v07-visual-gates-structure-block-input.md` — v0.7 design input: fail-closed mapping, project-agnostic conformance/parity gates, structure lint, block generation experiment.
- `docs/superpowers/plans/2026-10-26-v07-visual-gates-structure-handoff.md` — v0.7 implementation plan (gates, structure, blocks, handoff).
- `docs/superpowers/specs/2026-10-27-v08-debt-closure-design.md` — v0.8 design input: D1–D16 debt contracts, the 2026-10-27 decisions (end-to-end actionId, ActionMenu, multi-state, per-case parity), batches, and v0.8/v0.8.1 exit criteria (on `main`).
- `docs/superpowers/plans/2026-10-23-v06-figma-studio-asset-compiler.md` — v0.6 implementation plan (Figma, Asset Compiler, Studio).
- `docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md` — remaining Phase 2 work (briefer data, M1 profiles, assets, real PRD, motion, visual diff).
- `docs/handoffs/2026-10-26-v07-final-review-fixes.md` — v0.7 final review fixes (stale diff recompute, parity hashes, contentHeight gate, handoff input binding, block C4, structure diff). On the `v0.7-visual-gates` branch / worktree.
- `docs/handoffs/2026-10-26-v07-implementation-handoff.md` — v0.7 gates/smoke/evidence, conformance 0/0, parity calibration, **§10 debt list**, manual Figma checklist. On the `v0.7-visual-gates` branch / worktree.
- `docs/handoffs/2026-10-26-v06-figma-gate-evidence.md` — v0.6 Figma gate evidence and fidelity pass (historical; its readbacks predate the v0.7 plans).
- `docs/handoffs/2026-10-26-v05x-v06x-debt-cleanup.md` — v0.5.x fixes, Sunday-tint recheck, Studio `studio:smoke` (historical: the stale-baseline caveat it records is resolved — v0.7 regenerated and signed the baseline).
- `docs/handoffs/2026-10-26-v041-v05-v06-session-handoff.md` — overall session handoff (v0.4.1/v0.5 signed, v0.6 Figma gate blocked, worktree/next steps).
- `docs/handoffs/2026-10-25-v06-phase3a-progress-handoff.md` — detailed v0.6 progress handoff (Figma gate pending, 688 tests at Phase 3A, Studio/Asset evidence).
- `docs/handoffs/2026-10-23-v05-visual-a11y-closure-handoff.md` — v0.5 signed handoff (loading/empty/mode/a11y/stop rule, v0.5.x minors).
- `docs/handoffs/2026-10-23-v041-implementation-handoff.md` — historical v0.4.1 signed handoff (7-column week, baseline/signoff).
- `docs/handoffs/2026-10-23-v04-acceptance-handoff.md` — historical v0.4 acceptance handoff (motion, visual review/cache, picker/date).
- `docs/handoffs/2026-10-21-8page-renderer-handoff.md` — historical 8-page/renderer handoff (v0.3.1/v0.4 increments).
- `docs/handoffs/2026-10-21-8page-renderer-handoff-dialogue.md` — Q&A handoff and next-agent prompt.
- `docs/superpowers/plans/2026-10-23-version-roadmap.md` — confirmed v0.4.1 → v1.0 release path.
- `pipeline/docs/prd-review-briefer.md` — intake usage, signoffs, resume, publish, gates.
- `pipeline/docs/spec-engineer-v0.md` — Spec Engineer usage, mapping, gates, v0 limits.
- `pipeline/docs/agent-m1.md` — M1 usage, artifacts, signoff format, exit codes.
- `pipeline/docs/agent-m1-uat.md` — M1 T-M1-01..20 matrix and real-run evidence.
- `pipeline/docs/asset-review-m0.md` — asset-review usage, artifacts, exit codes.
- `docs/superpowers/specs/2026-10-20-asset-source-fallback-policy.md` — source chain, verdict schema, hard gates vs soft scores.
- `docs/superpowers/specs/2026-10-20-agent-organization.md` — IA/Interaction/Visual Style roles.
- `docs/superpowers/specs/2026-10-20-asset-review-hardening-design.md` — asset-review hardening.
- `pipeline/dsh/README.md` — dsh profile, credentials, smoke test.
- `CHANGELOG.md` — change record.
