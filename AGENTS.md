# Repository AGENTS.md

This repository is a PRD → UI pipeline. The architecture is one core plus two runtime adapters.

## Layout

- `pipeline/` — the pnpm workspace; all commands run from here. The repo root has no package manifest.
- `pipeline/core/*` — runtime-neutral packages: `contracts`, `design-system`, `compiler`, `validators`, `renderer-html`, `orchestrator`, `asset-review`, `asset-compiler`, `agents`, `spec-engineer`, `intake`, `visual-review`, `figma`.
- `pipeline/runtimes/standalone` — file-system and model adapters plus the CLIs (`phase1:verify`, `render:html`, `asset:review`, `asset:compile`, `agent:run`, `agent:sign`, `spec:engineer`, `intake:run`, `visual:review`, `visual:baseline`, `visual:sign`, `figma:plan`, `figma:verify`, `studio:prepare`).
- `pipeline/runtimes/dsh` — dsh Cordis plugin/tools/headless adapter plus the M1 agent runner; bundles to `dist/plugin.js` with esbuild.
- `pipeline/runtimes/figma` — Figma sandbox plugin (`src/plugin.ts` + `src/ui.html`), bundled to gitignored `dist/` with esbuild; manual Figma gate.
- `pipeline/studio` — read-only Vite/React/Tailwind v4 + shadcn workbench; reads generated `public/studio-data.json` + copied HTML; never orchestrates.
- `pipeline/dsh/home/profiles/prd-ui-assets` — project-local dsh profile for asset review. `pipeline/dsh/home/profiles/prd-ui-agents` — M1 profile (base/headless/pi-ai, no tool plugin, 32768 maxTokens). `pipeline/dsh/home/profiles/prd-ui-intake` — intake profile (same bundles, 65536 maxTokens for 8-page PRD review). `pipeline/dsh/home/profiles/prd-ui-visual` — Visual Critic profile (vision provider, 65536 maxTokens; kept tools are `read`, `read_image`, `glob`, `grep`, `skill`, `working_directory`, and session-state tools; no write/edit/bash/workflow/subagent/web; see `pipeline/dsh/README.md`). Profile definitions are versioned; `node_modules/`, sessions, attachments, and credentials are ignored. Never modify `~/.dsh`; `DSH_HOME` points here.
- `pipeline/samples/` — `employee-app` (2-page mobile slice), `projects/employee-app-appointments-03` (4-page real-PRD test slice from `03-预约与告知`), `projects/employee-app-phase2` (8-page Phase 2 exit slice from 00–04), `demo-crm`, `projects/demo-orders-intake` (8-page signed intake brief), M0 asset fixtures (`assets/m0`, `assets/m0-scenarios`), M1 agent fixtures (`agents/m1`), and intake fixtures (`agents/intake`, `agents/intake-employee-app`, `agents/intake-appointments-03`, `agents/intake-employee-app-phase2`), plus Visual Critic fixtures (`agents/visual-critic`). The 8-page sample acceptance project is `samples/project.demo-orders-intake.yaml`.
- `pipeline/artifacts/employee-app/` — checked-in rendered HTML and screenshots. `pipeline/artifacts/employee-app-appointments-03/` — the 03 real-PRD slice's 4 HTML pages and Playwright screenshots. `pipeline/artifacts/employee-app-phase2/` — the 8-page Phase 2 exit HTML, screenshots, and asset review evidence.
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
- There is no lint or format script; `pnpm typecheck` is the static gate.

## Current state (v0.6 gate evidence complete, human signoff pending, 2026-10-26)

Verified: `pnpm test` 704 passed, `pnpm test:dsh` 4 passed, `pnpm typecheck`
clean. `phase1:verify` is 8 / 2 / 4 / 8 pages with 0 blockers across the
demo-orders, employee-app, 03-slice, and phase2 projects.

v0.5 remains the last signed milestone. v0.6 Phase 3A is implemented in the
automatable parts: `core/figma` plan compiler + readback diff, `runtimes/figma`
plugin/UI/bundle, `core/asset-compiler` + `asset:compile`, and a read-only
Studio (`studio/`, shadcn/Tailwind). `figma:plan` generates 8 plans; M0 assets
package 13/13 and phase2 frozen icons 4/4.

The real Figma gate ran on 2026-10-26: 8/8 scratch pages and 8/8 delivery pages
built in Figma desktop, all `figma:verify` runs **passed (0 blocker / 0 major /
0 findings)** with 16 `errors: []` readbacks. A second fidelity pass aligned
buttons (incl. a `ghost-chip` variant), row dividers, tab labels/icons, input
styles, select values, empty states and the calendar against the HTML
baselines. Durable evidence lives in
`pipeline/artifacts/employee-app-phase2/figma/` (`spec-source/`, `plans/`,
`readback/{,delivery}/`, `diff/{,delivery}/`, `screenshots/`, `README.md`);
Figma files are scratch `iL99qSPGhmh08BB9LketgF` and delivery
`ne1JYKpfjDivRr0nK5jm4S` (Drafts). The gate exposed and fixed six real bugs
(dynamic-page mainComponent, instance children, variable-paint opacity, dropped
summary/fields slots, search rows, view-panel padding); `pnpm studio:smoke` is
the headless Studio gate. v0.6 still needs the **human** side-by-side visual check
and signoff, so it is **not signed** and cannot be `passed`.

v0.5.x debt cleanup landed on 2026-10-26: disabled datetime container, loading
selected-column skeleton, and `YYYY-MM-DD HH:mm` confirmed time; the Sunday
column tint was not reproducible and needed no code change. **The v0.5 visual
baseline is stale after those CSS changes**; the next visual gate must regenerate
and re-sign it.

Next: run the manual Figma checklist in
`pipeline/artifacts/employee-app-phase2/figma/README.md`, sign v0.6, then start
v0.7 (sandbox/Test Subagent/Handoff). Phase 4 pilot is v0.8; RC v0.9; final v1.0.
Handoff: `docs/handoffs/2026-10-26-v06-figma-gate-evidence.md` (latest);
`docs/handoffs/2026-10-26-v05x-v06x-debt-cleanup.md` (v0.5.x/v0.6.x debt);
`docs/handoffs/2026-10-26-v041-v05-v06-session-handoff.md` (overall session
state); v0.6 details in
`docs/handoffs/2026-10-25-v06-phase3a-progress-handoff.md`.

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
- `core/figma` consumes `contracts` + `design-system`; `core/asset-compiler`
  consumes `contracts`; `studio` is an independent read-only app.
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
- `docs/superpowers/specs/2026-10-23-v06-figma-studio-asset-compiler-design.md` — v0.6 implemented (automatable parts): Figma plan/plugin/readback diff, Asset Compiler, read-only Studio; Figma gate pending.
- `docs/superpowers/specs/2026-10-26-v07-visual-gates-structure-block-input.md` — v0.7 design input: fail-closed mapping, project-agnostic conformance/parity gates, structure lint, block generation experiment.
- `docs/superpowers/plans/2026-10-23-v06-figma-studio-asset-compiler.md` — v0.6 implementation plan (Figma, Asset Compiler, Studio).
- `docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md` — remaining Phase 2 work (briefer data, M1 profiles, assets, real PRD, motion, visual diff).
- `docs/handoffs/2026-10-26-v05x-v06x-debt-cleanup.md` — latest: v0.5.x fixes, Sunday-tint recheck, Studio `studio:smoke`, stale baseline caveat.
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
