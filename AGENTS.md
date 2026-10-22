# Repository AGENTS.md

This repository is a PRD → UI pipeline. The architecture is one core plus two runtime adapters.

## Layout

- `pipeline/` — the pnpm workspace; all commands run from here. The repo root has no package manifest.
- `pipeline/core/*` — runtime-neutral packages: `contracts`, `design-system`, `compiler`, `validators`, `renderer-html`, `orchestrator`, `asset-review`, `agents`, `spec-engineer`, `intake`, `visual-review`.
- `pipeline/runtimes/standalone` — file-system and model adapters plus the CLIs (`phase1:verify`, `render:html`, `asset:review`, `agent:run`, `agent:sign`, `spec:engineer`, `intake:run`, `visual:review`, `visual:baseline`, `visual:sign`).
- `pipeline/runtimes/dsh` — dsh Cordis plugin/tools/headless adapter plus the M1 agent runner; bundles to `dist/plugin.js` with esbuild.
- `pipeline/dsh/home/profiles/prd-ui-assets` — project-local dsh profile for asset review. `pipeline/dsh/home/profiles/prd-ui-agents` — M1 profile (base/headless/pi-ai, no tool plugin, 32768 maxTokens). `pipeline/dsh/home/profiles/prd-ui-intake` — intake profile (same bundles, 65536 maxTokens for 8-page PRD review). `pipeline/dsh/home/profiles/prd-ui-visual` — Visual Critic profile (vision provider, read/read_image/glob/grep only, 65536 maxTokens; no write/edit/bash/workflow/subagent/web). Profile definitions are versioned; `node_modules/`, sessions, attachments, and credentials are ignored. Never modify `~/.dsh`; `DSH_HOME` points here.
- `pipeline/samples/` — `employee-app` (2-page mobile slice), `projects/employee-app-appointments-03` (4-page real-PRD test slice from `03-预约与告知`), `projects/employee-app-phase2` (8-page Phase 2 exit slice from 00–04), `demo-crm`, `projects/demo-orders-intake` (8-page signed intake brief), M0 asset fixtures (`assets/m0`, `assets/m0-scenarios`), M1 agent fixtures (`agents/m1`), and intake fixtures (`agents/intake`, `agents/intake-employee-app`, `agents/intake-appointments-03`, `agents/intake-employee-app-phase2`). The 8-page sample acceptance project is `samples/project.demo-orders-intake.yaml`.
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
pnpm spec:engineer --project samples/projects/employee-app-phase2/project.yaml --agent-run /tmp/m1-final2/run-2026-10-22T03-16-05-257Z --runs /tmp/spec-v04 --strict-motion
pnpm render:html --run /tmp/spec-v04/<runId> --out /tmp/html-v04
pnpm visual:baseline --project samples/projects/employee-app-phase2/project.yaml --spec-run /tmp/spec-v04/<runId> --html /tmp/html-v04 --out baselines/employee-app-phase2
DSH_HOME="$PWD/dsh/home" pnpm visual:review --project samples/projects/employee-app-phase2/project.yaml --spec-run /tmp/spec-v04/<runId> --html /tmp/html-v04 --baseline baselines/employee-app-phase2 --runtime dsh --profile prd-ui-visual --runs /tmp/visual-v04 --max-cost-cny 3 --json
pnpm visual:sign --run /tmp/visual-v04/<runId> --signoff-visual /tmp/signoff-visual.md

# Real dsh: export .env first; the CLI does not auto-load it.
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm asset:review --project samples/projects/employee-app/project.yaml --assets samples/assets/m0 --runtime dsh --runs /tmp/m0-runs-dsh
DSH_HOME="$PWD/dsh/home" pnpm agent:run --project samples/projects/employee-app/project.yaml --runtime dsh --runs /tmp/m1-agent-dsh
```

- With no options, `pnpm phase1:verify` runs the 8-page `demo-orders` sample; the
  employee-app project is the current 2-page acceptance slice.
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
- `visual:baseline` never runs a model; only a human runs it and commits the
  PNGs + manifest. `visual:review` needs a baseline and never updates it;
  `--runtime dsh --profile prd-ui-visual` calls the real critic, whose timeout
  defaults to 900000ms. `visual:sign` binds `manifestHash` + `findingsHash`;
  waivers only apply to `VISUAL_CRITIC_BLOCKER`.
- `pnpm test:dsh` fails with an install hint if the pinned dsh binary is
  missing; only `SKIP_DSH=1` skips it.
- There is no lint or format script; `pnpm typecheck` is the static gate.

Current expected evidence: 632 tests passing, `pnpm test:dsh` 4 passed,
typecheck clean, `Phase 1A OK: 2 pages, 0 blockers` for employee-app,
`13 assets / 13 passed` standalone, scenarios `1 passed / 1 unresolved`, and
real dsh `deepseek-flash` `13 assets / 13 passed` with
`usageSource=json-events`, `usageComplete=true`, review cost ≈¥0.35
(10 CNY default cap). M1 real dsh: three agents, `success`,
`gates={ia:passed, interaction:passed, visualStyle:passed}`, 10 asset briefs,
¥0.1973, `usageComplete=true`, no waiver. Earlier waived runs were ¥0.2081 /
¥0.2487; the employee-app slice IA blockers (dead tabs, missing inventory entry,
warehouse dead-end, quick-action permission mismatch) are fixed.
Spec Engineer v0 on the clean M1 run: 2 Page Specs, 0 blockers, 28 expected
warnings (19 unresolved motion node ids, 9 unused asset briefs). Intake v0:
8-page sample PRD review/brief passes all gates and publishes a signed
`ui-brief.json`; employee-app 2-page fixture passes the brief gate and waits
for signoff. Real dsh intake: 2-page employee-app completes (success + publish,
¥0.6948); the 8-page sample uses the `prd-ui-intake` profile (65536 maxTokens),
waives its real F-001/IA-001/IA-002 sample gaps, and completes with publish
(¥0.90666). Phase 2 8-page exit: `phase1:verify` `8 pages / 0 blockers`;
real dsh M1 `ia:waived / interaction:passed / visualStyle:passed`, then
`agent:sign` finalized the visual-style signoff without a model call
(`status=success`, ¥0.3298); Spec Engineer 8 Page Specs, 0 blockers; renderer
8 HTML + index. `phase1:verify` is 8 / 2 / 4 / 8 pages with 0 blockers across
the demo-orders, employee-app, 03-slice, and phase2 projects. Renderer now
covers PageShell/MobileShell slots and generic
components, mock data, and localized labels; the 8-page visual scan renders
real content and states. M1 keeps `prd-ui-agents` at 32768; the 8-page M1 run
uses `prd-ui-intake`. Task 1 briefer data: scripted 8-page intake now produces
`fieldLabels`/`mockData`/`feedItems` and passes the brief gate; clean real dsh
8-page intake (sample PRD-001 waiver) produced 5 list rows, 5 detail values,
4 overview items, 4 feed items, 8 pages, brief gate passed, `awaiting_signoff`,
cost ¥0.5938, `usageComplete=true`. 03 real-PRD slice: 4 pages
(`appointment-detail`, `appointment-form`, `treatment-notice`,
`appointment-list`), real dsh intake ¥0.5147 and M1 ¥0.2746
(`ia:waived / interaction:passed / visualStyle:passed`), Spec Engineer
4 Page Specs / 0 blockers, `phase1:verify` 4 pages / 0 blockers. The
`mobile-list` and `mobile-form` archetypes and b-mobile form/list catalog
components were added for this slice. Visual v0.1 adds `CalendarGrid` (seven-day
grid), a fixed mobile action footer with primary/secondary split, single-CTA
mobile form with an alternate-mode note, and `noticeBlocks` per-project notice
cards. Phase 2 clean exit (v0.3.1): `employee-app-phase2` 8-page real PRD
slice, PRD readiness ready, **0 waivers and 0 manual brief patches**, brief hash
`sha256:b558b57a…b8335`, intake ¥0.8978; M1
`ia:passed / interaction:passed / visualStyle:passed` (0 waivers, ¥0.44),
Spec Engineer 8 Page Specs / 0 blockers / 36 warnings, assets missing=0,
asset review 4/4 passed (¥0.1698), render 8 HTML + index,
`phase1:verify` 8 pages / 0 blockers; Playwright
interaction checks (search idle/filter/clear/empty, calendar/list toggle,
empty-cell prefill, drawer, form new/reschedule with customer lock, detail
status actions, notice confirmation) with 19 screenshots checked in. The
earlier 2026-10-21 exit with sample IA waivers and one brief patch is
superseded. Per-profile M1 real run on the 8-page demo-orders
sample: prompt contains b-dense + c-expressive, interaction passed (¥0.5105).
Asset chain: 4 standard briefs, `asset:review --briefs` 4/4 passed. v0.4 completed the motion HTML, Visual Critic, screenshot diff, customer
picker, and full-date prefill work: Spec Engineer `--strict-motion` gives 8
Page Specs / 0 blockers / 0 motion unresolved, baseline is 24 cases, and the
final real-dsh review is `status=passed` with 24/24 screenshots, 0 console /
0 overflow / 0 diff failures, 10 findings (7 major / 3 minor / 0 blocker),
¥0.2939536224, signed with `waivers=[]`. The first 8-page critic attempt timed
out at 32768 maxTokens / 300s (¥0.9835, usage incomplete), so the visual
profile now uses 65536 maxTokens and `visual:review` defaults to a 900000ms
critic timeout; total v0.4 critic spend is ¥1.6415. Remaining visual debt is
the critic's 7 majors (disabled styling, reschedule debug chip, duplicate
check-in CTAs, premature notice action, search/list row affordances, calendar
loading/empty structure), plus deterministic critic replay, Studio/Asset
Compiler, Figma, and full a11y in Phase 3/4.

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
- `runtimes/dsh` is the only package that builds `dist/` (esbuild `prepare`);
  the other packages are consumed as TypeScript source via tsx/vitest.
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
- `README.md`'s Phase 1A section still shows the 8-page sample; use the
  employee-app commands above for the current slice.

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
- `docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md` — remaining Phase 2 work (briefer data, M1 profiles, assets, real PRD, motion, visual diff).
- `docs/handoffs/2026-10-21-8page-renderer-handoff.md` — current 8-page/renderer handoff.
- `docs/handoffs/2026-10-21-8page-renderer-handoff-dialogue.md` — Q&A handoff and next-agent prompt.
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
