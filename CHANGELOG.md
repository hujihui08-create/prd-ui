# Changelog

All notable changes to the PRD → UI pipeline are recorded here. Dates are local
(Asia/Shanghai) work dates; commits are local-only (no push).

## 2026-10-22 — Clean Phase 2 finish (v0.3.1)

### Added

- `UiBriefPage` interaction metadata (optional): `businessStates`,
  `formModes` (`new`/`reschedule`, `customerLocked`), `views`/`defaultView`, and
  `searchIdleTitle`; Briefer prompt rules and strict brief-gate checks (action
  subsets, detail/form/list scope, defaults).
- Renderer data attributes and a lightweight vanilla-JS controller: business
  states drive the detail summary/badge/status and action bar, form modes switch
  the CTA and lock the customer on reschedule, calendar/list toggle, search
  idle/filter/clear/empty, empty calendar cell prefill, and a read-only drawer.
- Compiler metadata defaults, `appointment-create` → `icon-plus` icon mapping,
  and a deterministic `清空关键词` action in the search empty state.
- Renderer linking fixes: calendar drawer and list 「查看完整详情」 navigate to
  appointment detail; search/list rows link through `linkedRoutes`; treatment
  notice confirmation fills 确认人/确认时间.

### Verification

- Clean real-dsh intake `run-2026-10-22T03-09-28-544Z`: `employee-app-phase2`
  8 pages, all `b-mobile`, PRD/IA gate passed, brief gate passed, 0 waivers,
  0 manual brief patches, brief hash
  `sha256:b558b57a5876bdabdd268f05d355876f84b1f675d668f561db253b3c3b0b8335`,
  ¥0.8977902624, `usageComplete=true`.
- Clean real-dsh M1 `run-2026-10-22T03-16-05-257Z`: `status=success`,
  `gates={ia:passed, interaction:passed, visualStyle:passed}`, 0 waivers,
  visual-style signoff via `agent:sign`, ¥0.4399832736.
- Spec Engineer `run-2026-10-22T03-23-54-618Z`: 8 Page Specs, 0 blockers,
  36 warnings (34 unresolved motion node ids, 2 unused asset briefs); assets
  missing none, referenced `icon-plus` / `icon-search`.
- `render:html`: 8 pages + `index.html`; `phase1:verify` `8 pages / 0 blockers`.
- Playwright at 390×844: search idle/张/clear/empty, calendar/list toggle,
  empty-cell prefill, drawer, detail 已到店/取消/爽约, form new/reschedule with
  customer lock, treatment notice confirmation; 19 screenshots under
  `pipeline/artifacts/employee-app-phase2/`.
- Clean asset review `run-2026-10-22T03-43-12-461Z`: the 4 standard icon briefs
  (`icon-home` / `icon-plus` / `icon-search` / `icon-user`) passed 4/4 with real
  dsh vision, 0 unresolved/degraded/reviewer errors, ¥0.1697866272.
- `pnpm test`: 529 passed; `pnpm test:dsh`: 2 passed; typecheck clean; Phase 1
  `8 / 2 / 4 / 8` pages all 0 blockers.
- Final chain cost ¥1.5075601632 (intake + M1 + asset review); ¥3.105622512
  including earlier retries.

### Limits

- Customer picker is declared by the brief but not wired in the static
  renderer; calendar prefill uses day-of-month (`03 09:00`) instead of a full
  `YYYY-MM-DD`.
- M1 `interaction-spec.json` node `cd.new-appointment` still says "prefill and
  lock", contradicting the signed brief (new is editable; only reschedule
  locks). The artifact is kept unchanged as v0.4 debt.
- Motion HTML, stable node ids, Visual Critic, screenshot diff, Studio, and
  Asset Compiler remain open.

## 2026-10-21 — Phase 2 exit: per-profile M1, asset chain, 8-page real PRD

### Added

- Per-profile M1: `catalogsByProfile` / `motionTokensByProfile` (optional maps),
  page→profile prompt map, catalog summaries, and a hard “do not mix” rule.
  Single-profile behavior is unchanged.
- Deterministic `deriveStandardAssetInventory(brief)` maps semantic icons to
  A-library ids and records unmapped icons as placeholders. Visual Style uses
  the inventory; the visual gate validates against the same effective set.
- `asset:review --briefs <dir>` consumes M1 `artifacts/asset-briefs/` directly.
- `samples/projects/employee-app-phase2/`: 8-page real PRD slice (today,
  customer-search, customer-detail, appointment-detail, appointment-form,
  treatment-notice, appointment-list, callback-register), plus scripted
  intake fixtures and an intake CLI regression test.
- `mobile-list` search variant (SearchBar + exact field label) and Briefer
  rules for `home` content, empty `fields`, and per-project `noticeBlocks`.

### Verification

- `pnpm test`: 510 passed; `pnpm test:dsh`: 2 passed; typecheck clean.
- Per-profile 8-page demo-orders run:
  `/tmp/m1-perprofile3/run-2026-10-21T10-06-55-674Z`,
  `ia:waived / interaction:passed / visualStyle:passed`, ¥0.5105.
- Phase2 real intake: 8 pages, PRD readiness ready, brief gate passed,
  publish `samples/projects/employee-app-phase2/ui-brief.json`, ¥0.5249.
  IA-001..IA-010 sample waivers and a deterministic brief patch (home fields,
  notice route, warehouse create role, host create action) were required.
- Phase2 M1: `/tmp/m1-phase2d/run-2026-10-21T10-46-02-038Z`,
  `ia:waived / interaction:passed / visualStyle:passed`, `agent:sign` success,
  ¥0.4355; 4 standard asset briefs, asset review 4/4 passed.
- Spec Engineer: 8 Page Specs, 8 motion pages, 0 blockers, 20 warnings,
  assets referenced=2 / unused=2 / missing=0.
- `render:html`: 8 pages + index; `phase1:verify`: `8 pages / 0 blockers`.
- Playwright: 8 pages + index captured under
  `pipeline/artifacts/employee-app-phase2/`; calendar, search results, detail,
  notice blocks, fixed action bar, and callback form render.
- Successful Phase2 chain cost ≈¥0.96 (intake + M1; asset review standalone
  has no model cost). Total exploration including failed review/gate attempts
  was higher; individual run costs are recorded in the run state.

### Limits

- Phase 2 exit relies on sample IA waivers and a patched brief; the next
  iteration should rerun intake so the Briefer generates the compliant
  home/route/permission shape directly and the brief is re-signed.
- Business-status action switching, real form mode, motion HTML, Visual Critic,
  screenshot diff, Studio, and Asset Compiler remain open.

## 2026-10-21 — Visual fidelity v0.1 (implemented)

### Added

- `CalendarGrid` in the b-mobile catalog and renderer: seven-day grid, hour
  axis, today column highlight, duration-height blocks, status tones, and
  horizontal scroll. `mobile-list` now renders a calendar above the list.
- `UiBriefPage.noticeBlocks`: per-project notice cards for treatment/handoff
  detail pages. The compiler hides the legacy single `notices` field when
  blocks are present and renders `告知内容` + one `Card` per project.
- Fixed mobile action footer: `MobileShell` renders its `actions` slot outside
  the scroll area. Detail pages split primary actions (`已到店确认`, `开单`)
  into the footer and secondary actions (`接单并确认到店`, `改期`, `取消`) into
  a ghost row above it.
- `mobile-form` renders one primary CTA plus a compact “另一模式” note for the
  alternate action, instead of two primary buttons.

### Verification

- `pnpm test`: 500 passed; `pnpm test:dsh`: 2 passed; typecheck clean.
- `phase1:verify`: 8 pages / 2 pages / 4 pages all `0 blockers`.
- 03 HTML refreshed under `pipeline/artifacts/employee-app-appointments-03/`:
  calendar, fixed action bar, single form CTA, per-project notice cards, and
  a clean list empty state.

### Limits

- Business status (已登记/已到店/爽约/已取消) still does not switch the action
  bar; the default state is 已登记.
- Form mode is expressed as a note, not a real mode switch.
- Motion is still not consumed by HTML; no Visual Critic or screenshot diff.

## 2026-10-21 — Real PRD slice: 03 预约与告知 (implemented)

### Added

- `samples/projects/employee-app-appointments-03/`: a four-page test slice
  derived from the real `03-预约与告知.md` plus shared rules from
  `00-总纲.md` (预约详情、新增/改期预约、术后告知、预约列表). The source PRD
  is not modified.
- `mobile-list` and `mobile-form` archetypes for mobile list and form pages.
  The `b-mobile` catalog now includes `FormField`/`Input`/`Select`/`List`/
  `ListItem`, plus `summary`/`fields`/`actions` slots on `MobileShell`, so
  mobile detail, list, and form pages compile and render.
- `samples/agents/intake-appointments-03/` scripted fixtures generated from the
  real run, and an intake CLI regression test for the four-page slice.

### Verification

- `pnpm test`: 500 passed; `pnpm test:dsh`: 2 passed; typecheck clean.
- Real dsh intake (`prd-ui-intake`): 4 pages, PRD/IA 0 blockers, brief gate
  passed, published `ui-brief.json`, **¥0.5147**, `usageComplete=true`.
- Real dsh M1 with sample IA waivers (IA-001 route precedence, IA-002 开单-only
  host entry): `gates={ia:waived, interaction:passed, visualStyle:passed}`,
  `agent:sign` finalized visual-style, status `success`, **¥0.2746**,
  `usageComplete=true`.
- Spec Engineer: 4 Page Specs, 4 motion pages, 0 blockers, 15 warnings.
- `render:html`: 4 pages + `index.html`; `phase1:verify`: `4 pages / 0 blockers`.
- Playwright: appointment-list/detail/form/notice render real labels and mock
  data; list empty state and state switcher work. Checked-in artifacts:
  `pipeline/artifacts/employee-app-appointments-03/` (4 HTML + 5 screenshots).
- Regression: 8-page Phase 1 `8 pages / 0 blockers`; employee-app
  `2 pages / 0 blockers`.

### Limits

- The test PRD is a four-page slice, not the full 6–8-page real PRD required by
  Task 4. Full PRD acceptance remains open.
- `appointment-form` is a static v0 form: both `保存` and `保存改期` actions are
  rendered because the brief has no page-mode switch. `mobile-list` secondary
  actions wrap on narrow mobile; both are recorded as v0 visual limits.

## 2026-10-21 — Briefer mock data and field labels (implemented)

### Added

- UI Briefer prompt now requires `fieldLabels` for every page field and
  archetype-specific example data: `mockData.rows` for list pages,
  `mockData.values` for detail pages, `mockData.listItems` for overview pages,
  and `feedItems` for feed pages. Example data must derive from PRD examples,
  be marked illustrative, and contain no real PII.
- Intake brief gate emits non-blocking warnings `BRIEF_FIELD_LABELS_MISSING`
  and `BRIEF_MOCK_DATA_MISSING` when a page would render skeleton content or
  raw field ids.
- Scripted intake fixtures now carry the same `fieldLabels` / `mockData` /
  `feedItems` data as the signed sample briefs (8-page demo-orders and
  employee-app).

### Fixed

- Settings pages now prefer `page.fieldLabels[field]` over the compiler's
  built-in label, so a briefer-supplied label such as `通知` is rendered and
  passes `SEMANTIC-FIELD` instead of failing against the hardcoded
  `通知设置`.

### Verification

- `pnpm test`: 493 passed; `pnpm test:dsh`: 2 passed; typecheck clean.
- Scripted intake: 8 pages / brief gate passed; `phase1:verify` 8 pages /
  0 blockers; employee-app 2 pages / 0 blockers.
- 8-page HTML re-render: no `请配置 feedItems`, no visible raw field ids,
  Chinese labels present.
- Clean real dsh 8-page intake (`prd-ui-intake`, sample waiver for PRD-001):
  brief gate passed, 8 pages, `orders-list` 5 rows, `order-detail` 5 values,
  overview 4 list items, feed 4 items, complete labels; status
  `awaiting_signoff` (no brief signoff); cost **¥0.5938**, `usageComplete=true`.
  Run: `/tmp/intake-task1-dsh-clean/run-2026-10-21T07-34-29-193Z`.
- Earlier real dsh attempt before the settings-label fix spent ¥1.2439 across
  three briefer attempts; its last draft passes after the fix when re-gated.

## 2026-10-21 — Phase 2 8-page exit slice (implemented)

### Added

- `agent:run --brief <path>` and `--profile <name>`: consume a signed brief
  independent of `project.yaml` and select the dsh profile (the 8-page M1 run
  uses `prd-ui-intake`, 65536 maxTokens).
- `samples/project.demo-orders-intake.yaml` + checked-in 8-page
  `samples/projects/demo-orders-intake/ui-brief.json` for the Phase 2 exit.
- Intake brief gate now runs Phase 1 semantic validators in addition to the
  compiler dry-run. This caught the real briefer's `orders-overview.fields`
  error (the PRD says overview has no fields).
- `agent:sign --run <dir> --signoff-visual-style <path>`: finalize an
  `awaiting_signoff` M1 run with human signoff without rerunning agents; it
  verifies gates/signoff and updates `state.json` to `success`.

### Renderer audit + visual pass

- Added the missing `PageShell` renderer and expanded `MobileShell` to render
  `title`/`illustration`/`body`/`summary`/`feed`/`fields`/`actions`/`content`
  slots. Before this, all six web pages and all three mobile pages rendered
  blank.
- Added renderers for `BottomNav`, `Stat`, `List`, `DataTable`, `FilterBar`,
  `Pagination`, `FormField`, `Input`, `Select`, `FeedCard`, and `Image`.
- Added generic `UiBriefPage.mockData` (`values`/`rows`/`listItems`) and
  `fieldLabels`; the compiler now carries mock rows/values and localized
  labels into Page Spec/HTML. `validateSemantic` accepts localized labels.
- Fixed page titles (`name · project`), index title/link styling, nav labels
  and icons, action-button layout, badge alignment, state switcher placement,
  and empty-state table remnants.
- 8-page visual scan now renders real stats, rows, detail values, feed cards,
  localized labels, empty/loading states, and mobile bottom navigation.
- Docs: implementation spec `2026-10-21-8page-renderer-mockdata-visual-fixes-design.md`,
  remaining-work plan `2026-10-21-phase-2-remaining-work.md`,
  handoff `2026-10-21-8page-renderer-handoff.md`, and
  Q&A handoff `2026-10-21-8page-renderer-handoff-dialogue.md`.

### Verification

- `pnpm test`: 488 passed; `pnpm test:dsh`: 2 passed; typecheck clean.
- `phase1:verify --project samples/project.demo-orders-intake.yaml`:
  `8 pages / 0 blockers`.
- Real dsh 8-page M1 (`prd-ui-intake`): IA waived (sample IA-001/002), interaction
  and visual-style passed, ¥0.3298; `agent:sign` finalized visual-style without a
  model call, so the run is `success`.
- `spec:engineer` on that run: 8 Page Specs, 8 motion pages, 0 blockers,
  27 expected warnings (26 unresolved motion node ids + asset-briefs-missing).
- `render:html`: 8 pages + `index.html`.
- 2-page employee-app Phase 1/M1/Spec Engineer/HTML regressions remain green.

### Limits

- 8-page asset briefs were not produced (M1 visual style returned none), so the
  27 warnings include `SPEC_ASSET_BRIEFS_MISSING`; asset review for 8 pages is
  the next asset-stage item.
- Motion is carried in Page Spec but not animated in HTML (v0.1).
- M1 receives one catalog/motion-token set (`brief.meta.profile`, b-dense) for
  mixed-profile briefs; the c-expressive mobile pages still pass but need a
  per-profile catalog/motion input for stronger grounding.
- The real UI Briefer does not yet emit `mockData`/`fieldLabels` reliably; the
  8-page sample brief was enriched manually. Prompt/schema hardening is next.
- Visual acceptance is manual (Playwright screenshots); there is no automated
  screenshot-diff gate yet.

## 2026-10-20 — Phase 2 PRD Review + UI Briefer (implemented)

### Added

- `core/intake`: deterministic PRD normalization/hash, PRD/IA/brief gates,
  `runIntake`, resume, signoff/waiver/answer/approval handling, and a
  compiler dry-run before brief signoff.
- `core/contracts`: `NormalizedPrd`, PRD findings/extract/readiness, UI Brief
  draft, and intake gate contracts; `ProjectConfig` gains optional
  `profile`/`platforms`.
- `core/agents`: `prd-review` and `ui-briefer` roles; IA gains a PRD-only input
  path and is decoupled from `UiBrief` via `IaGateScope`.
- `pnpm intake:run`: PRD review + IA + UI Briefer, two human signoffs,
  `--resume`, `--publish-brief`, `--json`; usage is `awaiting_signoff` until
  both signoffs are present.
- Offline fixtures for the 8-page `demo-orders` PRD and the 2-page
  `employee-app` slice.
- Usage: `pipeline/docs/prd-review-briefer.md`.

### Verification

- `pnpm test`: **488 tests**; `pnpm test:dsh`: 2 passed; typecheck clean.
- 8-page demo-orders: PRD/IA signoff -> 8-page brief -> brief-hash signoff ->
  `success` + published `ui-brief.json`; scripted cost 0.045144 CNY,
  `usageComplete=true`.
- employee-app 2-page: brief gate passed, awaits signoff.
- Regressions: phase1 `2 pages / 0 blockers`; standalone asset review `13/13`;
  renderer HTML byte-identical; M1/Spec Engineer unchanged.

### Limits

- Real dsh: the 2-page employee-app intake completed (PRD review + IA + briefer,
  success, published, ¥0.6948). The 8-page sample intake also completes with
  the new `prd-ui-intake` profile (65536 maxTokens); its real F-001/IA-001/
  IA-002 findings were waived as sample-PRD gaps, then the brief passed and was
  published (¥0.90666). M1 keeps `prd-ui-agents` at 32768.
- Full 8-page M1 + HTML rendering is the next stage.
- `home`/`inventory-list` typed content remains employee-app-specific; other
  page types use generic fields and unknown archetypes become blocking
  questions.

## 2026-10-20 — Phase 2 Spec Engineer v0 (implemented)

### Added

- `core/spec-engineer`: deterministic mapper that applies M1 interaction,
  motion, IA, and asset artifacts to Page Specs; no model calls.
- Backward-compatible Page Spec extensions: optional
  `interactions[].nodeId` and top-level `motion` (presets, page bindings,
  reducedMotion).
- `pnpm spec:engineer`: loads an M1 run and the project brief, writes
  `artifacts/page-spec/*.json` only when the gate passes, plus
  `findings/spec-engineer-gate.json`, `spec-engineer.json`, and run logs.
- Deterministic gates: page/action/state/transition coverage (including brief
  pages absent from the interaction spec), motion preset/token checks, asset
  brief linkage, optional IA drift warnings.
- M1 artifact schemas exported from `@prd-ui/agents` for consumers.
- Usage: `pipeline/docs/spec-engineer-v0.md`.

### Verification

- `pnpm test`: **453 tests**; `pnpm test:dsh`: 2 passed; typecheck clean.
- employee-app Phase 1: `2 pages / 0 blockers`; standalone asset review:
  `13/13 passed`.
- Real employee-app clean M1 run consumed: 2 enriched Page Specs,
  10 interactions per page, six states
  (default/empty/loading/error/disabled/success), motion on both pages,
  **0 blockers**, 28 expected warnings (19 unresolved motion node ids,
  9 unused asset briefs), `assets.missing=[]`.

### Limits

- Motion is carried in Page Spec but not yet animated by the HTML renderer
  (v0.1).
- Unresolved motion node ids are warnings until the compiler emits stable node
  ids.
- No Spec Repair, PRD Reviewer, or UI Briefer; the 6 non-blocking M1 slice
  findings remain out of scope.

## 2026-10-20 — Phase 2 Spec Engineer v0 spec (draft)

- Added the Phase 2 Spec Engineer v0 design: a deterministic mapper that
  consumes M1 interaction/motion/IA/asset artifacts and produces enriched Page
  Specs with interactions, states, motion bindings, and asset references.
- Defines backward-compatible `PageSpec.interactions[].nodeId` and optional
  `PageSpec.motion`, deterministic gates, a `pnpm spec:engineer` CLI, and the
  T-P2-01..15 test matrix.
- Status: superseded by the implemented entry above.
- Spec: `docs/superpowers/specs/2026-10-20-phase-2-spec-engineer-design.md`

## 2026-10-20 — employee-app slice IA blockers fixed

- Added optional `ui-brief.ia.landingByRole` (role → page id) so a role can have
  an explicit landing page; the M1 IA prompt surfaces it.
- Fixed the employee-app slice from the real IA findings: navigation is now
  `今日` + `库存查询` (both tabs reachable), 今日 has a 库存查询 quick action,
  inventory is read-only for all store roles, warehouse lands on inventory, and
  the unbacked 开单/预约 actions plus the orphan message entry are removed.
- PRD, brief assumptions, scripted IA/interaction fixtures, and the UAT record
  are aligned with the fixed slice.
- Real `deepseek-flash` IA now reports **0 blockers**; the final signed
  three-agent run is `success` with `gates={ia:passed, interaction:passed,
  visualStyle:passed}`, 10 asset briefs, **¥0.1973**, `usageComplete=true`, and
  no waiver.
- `pnpm test`: 423 tests (was 421); Phase 1 remains `2 pages / 0 blockers`.

## 2026-10-20 — M1 agent layer (implemented)

### Added

- `core/agents`: runtime-neutral IA / Interaction / Visual Style contracts,
  strict role schemas, prompt builders, deterministic gates, `M1RunState`, and
  the `runM1` orchestrator. IA runs first; Interaction and Visual Style run in
  parallel with failure isolation.
- `pnpm agent:run` (`runtimes/standalone`): project/PRD/brief intake, scripted
  fixtures for offline runs, real dsh runner, `--only-role`, `--json`,
  `--max-cost-cny`, `--allow-unknown-cost`, `--allow-unreviewed`, and signoff
  file copying.
- `prd-ui-agents` dsh profile (base + headless + pi-ai, no tool plugin) and
  `DshAgentRunner`: one call per attempt, `--json -` stdin, `final.text` output,
  `step_end` usage, one schema repair with merged usage.
- Human signoff contract: `signoff/ia.md` / `signoff/visual-style.md` with a
  `<!-- signoff {...} -->` block; IA waivers require owner/reason/expiry.
- Employee-app M1 sample inputs: `samples/projects/employee-app/prd.md`,
  `samples/agents/m1/{ia,interaction,visual-style}.json`.
- Artifacts: `ia-map`, `ia-findings`, `ia-proposed`, `interaction-spec`,
  `motion-spec`, `visual-style`, `asset-briefs/*`, gate findings, agent
  evidence, `state.json`, and `agent-run.json`.
- Shared `usage`/`pricing`/`redact`/`asset-brief` contracts moved into
  `core/contracts` so `core/agents` does not depend on `core/asset-review`;
  asset-review re-exports them unchanged.
- `ProjectConfigSchema` accepts optional `prd`.

### Verification

- `pnpm test`: 421 tests (was 350).
- `pnpm typecheck`: clean.
- `pnpm test:dsh`: 2 tests (asset review + M1 IA) through the real pinned dsh
  CLI with a local mock; no key or external network.
- `pnpm phase1:verify --project samples/projects/employee-app/project.yaml`:
  `2 pages / 0 blockers`.
- `pnpm asset:review --assets samples/assets/m0 --runtime standalone`:
  `13 assets / 13 passed`.
- Real `deepseek-flash`: three agents, one call each, no repair;
  `status=success`, `gates={ia:waived, interaction:passed, visualStyle:passed}`,
  10 asset briefs, **¥0.2081** (earlier run) / **¥0.2487** (final-code rerun),
  `usageComplete=true` (10 CNY cap). The same
  slice without signoffs stops at `awaiting_signoff` (¥0.2756).
- Real dsh asset review after the shared-contract refactor:
  `13 assets / 13 passed`, ¥0.3541, `usageComplete=true`.
- `pipeline/docs/agent-m1-uat.md` maps T-M1-01..20 to automated tests and real
  runs; edge coverage includes stage progression, full evidence files,
  per-agent budgets, CLI partial/budget/usage-incomplete paths, malformed
  signoffs, JSON redaction, and concurrent store writes.
- The IA agent found three real blockers in the employee-app slice (three dead
  tabs, missing inventory entry, warehouse dead-end). The real run used a
  development waiver to exercise Interaction/Visual; the blockers remain
  tracked slice issues.

### Limits

- No Page Spec/HTML/renderer changes; interaction spec consumption is Phase 2.
- No signoff UI; `--allow-unreviewed` never produces `success`.
- PRD Reviewer/UI Briefer/Spec Engineer, Figma/M3, and M2 suppliers remain out
  of scope.

## 2026-10-20 — M1 agent layer spec (draft, not implemented)

- Added the M1 design spec for the IA / Interaction Design / Visual Style
  agents: shared agent runner/ports, structured artifacts, deterministic
  orchestrator gates, budgets, human signoffs, and test matrix.
- Scope follows the core-runtime M1 definition; customer vertical slice,
  PRD Reviewer/UI Briefer, Figma/M3, and M2 suppliers are out of scope.
- Status: superseded by the implemented entry above.
- Spec: `docs/superpowers/specs/2026-10-20-m1-agent-layer-design.md`

## 2026-10-20 — M0.5 asset review hardening (H1–H15, implemented)

### Added

- `pnpm test:dsh`: a local OpenAI-compatible mock HTTP server plus the real
  pinned dsh CLI/profile runs `asset:review --only icon-home --runtime dsh` and
  asserts exit 0, a passed asset, `dsh/` evidence, and
  `summary.usageComplete === true`. It needs no real key or external network;
  the default `pnpm test` excludes it.
- `asset:review --json`: for review/preflight runs, exactly one machine-readable
  JSON summary on stdout (`runDir`, `summary`, `assets`, `batchGates`, `error`,
  `reviewCostCny`, `usageSource`, `usageComplete`; unavailable values are
  `null`). The human summary is suppressed in both stdout and stderr, so stdout
  stays one parseable JSON document. `--help` and argument errors are outside
  this contract.
- Set-level icon/illustration gates; `--only` records `PARTIAL_REVIEW` instead
  of claiming set consistency.
- 2x PNG evidence (`candidate.png` 48x48 for 24px icons, 240x160 for 120x80
  illustrations), raw reviewer evidence (`review.raw.json`), one schema repair,
  `manifest.review.json`, append-only `log.ndjson`, and usage/cost capture with
  a default 10 CNY dsh review cap.
- `--max-review-cost-cny`, `--allow-unknown-cost`, and `--fail-fast` CLI flags.
- Standalone asset CLI exports (`assetMain`, `parseAssetArgs`, `ASSET_USAGE`)
  and a comment on `normalizeSvg` clarifying it is XML re-serialization, not
  design normalization.

### Changed

- Strict `style.json`/`source-policy.json`/`pricing.json` validation fails fast
  with the offending path; provider base URL and model are required, with
  DeepSeek `deepseek-flash` as the documented default and no OpenAI fallback.
- Reviewer errors are isolated per asset; set-gate failures no longer swallow
  the reviewer's error.
- `normalizeSvg` and redaction behavior are documented; `.env` is explicitly
  not auto-loaded (`set -a; . ./.env; set +a`).
- The image-aware review initially rejected `illus-empty-inventory` as reading
  like a bar chart; the fixture was redesigned as a shelf with empty dashed
  compartments, after which all 13 real-dsh assets passed.

### Fixed (final whole-branch review)

- dsh `step_end.usage` no longer requires `cacheReadTokens`: absent cache fields
  are treated as zero, and only a missing `usage` object marks usage
  incomplete. The mock integration returns zero/absent cache fields and still
  asserts `usageComplete=true`.
- `--only` partial reviews now write `manifest.json` and
  `manifest.review.json` with `complete: false` because set gates were skipped.
- `review.json`, `asset-review.json`, and `--json` redact reviewer text with the
  shared `redactValue` before writing/printing, so a provider-echoed key or
  `Authorization:` header cannot reach canonical artifacts or CI logs.
- SVG gates reject SMIL (`animate`, `animateTransform`, `animateMotion`, `set`,
  `discard`), external processing instructions (`xml-stylesheet`), and
  non-fragment `url(...)` references with blocker codes `SVG_ANIMATION`,
  `SVG_PROCESSING_INSTRUCTION`, and `SVG_EXTERNAL_REF`.

### Verification

- `pnpm test`: 350 tests passed (offline; dsh mock integration excluded).
- `pnpm test:dsh`: 1 passed (real pinned dsh 0.2.1-rc.2 + local mock).
- `pnpm typecheck`: clean.
- `pnpm phase1:verify`: `2 pages, 0 blockers`.
- `pnpm asset:review --assets samples/assets/m0 --runtime standalone`:
  `13 assets, 13 passed`.
- `pnpm asset:review --assets samples/assets/m0-scenarios --runtime standalone`:
  `1 passed, 1 unresolved`, exit 1 as designed.
- dsh mock run: `1 assets, 1 passed`, `usageSource=json-events`,
  `usageComplete=true`, review cost below the 10 CNY cap.
- Real dsh `deepseek-flash` full run: `13 assets, 13 passed`, `0 retried`,
  `usageSource=json-events`, `usageComplete=true`, review cost ¥0.3467
  (10 CNY default cap). 13 `candidate.png` evidence files and 13 `read_image`
  calls; no key material in the run directory; both set gates passed and
  `manifest.json` / `manifest.review.json` report `complete: true`.

### Commit trail

| Commit | Change |
|---|---|
| `53466c0` | fix: reject external url paint fallbacks |
| `d8de24f` | docs: record final asset review fix |
| `7c95cc1` | fix: close final asset review review findings |
| `049ee19` | fix: make empty inventory fixture read as an empty shelf |
| `2fb1d5b` | docs: align asset review json contract |
| `f6d9f06` | test: add dsh mock integration and hardening docs |
| `b872535` | fix: keep redacted json parseable |
| `5c363be` | fix: complete raw review evidence and shared redaction |
| `a40d948` | feat: append logs, keep raw reviews and repair once |
| `fa0f62f` | fix: do not swallow reviewer errors in render fallback |
| `baf252a` | feat: add png evidence and manifest review sidecar |
| `53f70cc` | fix: correct repair usage accounting and preserve reviewer errors |
| `6e86702` | feat: capture usage/cost and stream dsh tasks over json stdin |
| `869dd3e` | fix: fail fast on invalid config and missing provider env |
| `3f3f508` | fix: isolate reviewer errors per asset |
| `beae2f2` | fix: preserve reviewer errors when set gates fail |
| `2861701` | feat: wire icon and illustration set-level gates |
| `4d261e0` | fix: reject inline styles and transforms in asset gates |

## 2026-10-20 — Asset review hardening docs

- Added the M0.5 hardening spec, test plan, and implementation checklist for
  H1–H15 (gate integrity, set-level gates, reviewer isolation, config/provider
  strictness, cost guard, image input, stdin, append log, raw output, schema
  repair, manifest sidecar, illustration set, dsh mock integration, DX).
- Reviewed on 2026-10-20: resolved the dsh `--json`/stdin/usage shape, corrected
  the H3 control flow, moved H7 rendering to standalone, added H5 validation for
  the standalone model reviewer, defined usage-complete fail-closed behavior,
  and made `--only` skip set gates with an explicit `PARTIAL_REVIEW` record.
- Status: implemented in the M0.5 hardening section above; the docs record the
  approved design, test plan, and checklist.
- Spec: `docs/superpowers/specs/2026-10-20-asset-review-hardening-design.md`
- Tests: `docs/superpowers/specs/2026-10-20-asset-review-hardening-test-plan.md`
- Checklist: `docs/superpowers/plans/2026-10-20-asset-review-hardening.md`

## 2026-10-20 — Core + dual runtime + M0 asset review

### Added

- `pipeline/core/asset-review`: runtime-neutral contracts, ports, deterministic
  hard gates, verdict thresholds, review prompt, retry/fallback/budget state
  machine, manifest builder, and dry-run preflight.
- `pipeline/runtimes/standalone`: filesystem artifact store, A-library source
  adapter, scripted reviewer, optional OpenAI-compatible model reviewer, and the
  `asset:review` CLI.
- `pipeline/runtimes/dsh`: Cordis plugin with `read_asset_brief`,
  `normalize_svg`, `validate_icon`, `score_asset`; headless review adapter;
  bundled plugin build; asset-reviewer preset/skill.
- `pipeline/dsh`: project-local pinned dsh profile
  (`@deepseek-ai/dsh@0.2.1-rc.2`) with a `dsh-llm-pi-ai` vision route; it does
  not modify `~/.dsh`.
- `pipeline/samples/assets/m0`: 10 Lucide icons (ISC, stroke-width 1.5) and 3
  local `test-fixture` illustrations.
- `pipeline/samples/assets/m0-scenarios`: retry-then-pass and
  three-fail → unresolved scenarios.
- `pipeline/docs/asset-review-m0.md`: M0 usage, artifacts, exit codes.
- `pipeline/dsh/README.md`: profile install, key configuration, headless smoke
  test.
- `README.md`, `AGENTS.md`, and this changelog.

### Changed

- Split the pipeline into `pipeline/core/*` and `pipeline/runtimes/*`; package
  names and imports are unchanged. The phase1 and render CLIs now live in
  `runtimes/standalone`.
- `normalizeSvg` uses `@xmldom/xmldom` XML serialization for M0 instead of
  `svgo`; this removes a `css-tree` dynamic `require` that broke the bundled dsh
  plugin load.
- The `.env` and dsh generated files (`sessions/`, `storages/`,
  `.anonymous-user-id`, credentials, node_modules) are gitignored; only the
  profile definition is versioned.

### Verification

- `pnpm test`: 233 tests passed.
- `pnpm typecheck`: clean.
- `pnpm phase1:verify --project samples/projects/employee-app/project.yaml`:
  `2 pages, 0 blockers`.
- `pnpm asset:review --assets samples/assets/m0 --runtime standalone`:
  `13 assets, 13 passed`.
- `pnpm asset:review --assets samples/assets/m0-scenarios --runtime standalone`:
  `1 passed, 1 unresolved`, exit 1 as designed.
- Conformance: standalone and dsh-like adapter produce the same decision trace;
  frozen deterministic assets are byte-identical.
- dsh profile spike: profile loads, plugin activates, and the headless CLI fails
  only with `MISSING_CREDENTIAL` for `PRD_UI_VISION_API_KEY` when no key is set.
- dsh end-to-end against a **local mock OpenAI-compatible endpoint**:
  `--only icon-home` passed, then all 13 assets passed (`13 assets, 13 passed`);
  one chat-completions request per asset, model `mock-vision`, dsh evidence under
  `runs/<id>/dsh/`.
- dsh end-to-end against the **real DeepSeek API** with `deepseek-flash`:
  `--only icon-home` passed, then all 13 assets passed (`13 assets, 13 passed`),
  scores 4–5, no degraded/unresolved. Session usage for the 13-asset run:
  79,607 input + 30,043 output + 727,552 cache-read tokens; estimated
  **¥0.463 peak / ¥0.232 off-peak**. Including the probe, a partially failed
  run, and the final rerun, total estimated spend was **≈¥0.78 peak**, below the
  10 CNY stop line.
- The reviewer occasionally emitted an extra `reason_note` key; core now strips
  unknown annotation keys instead of failing the asset, while still enforcing
  required fields and score thresholds.

### Known blockers / deferred

- A real vision key is configured only in the local, gitignored
  `pipeline/.env`; it is not committed. Without it the pipeline fails with
  `MISSING_CREDENTIAL` instead of faking a pass.
- Model cost was not yet written into `asset-review.json`; that gap was closed by
  the M0.5 usage/cost capture section above (the original estimate came from dsh
  session `usage` at DeepSeek Flash peak pricing, USD converted at 7.2).
- M0 only connects the A library; B/C adapter interfaces and state-machine
  branches exist, but real suppliers/accounts/licensing are M2.
- IA/Interaction/Visual Style agents are M1; Figma, screenshot diff, recording,
  and trace gates are M3.
- The dsh plugin/tool registration contract is still a release candidate; the
  CLI and bundles are pinned, and `@next` is not used.

### Commit trail

| Commit | Change |
|---|---|
| `612e6c9` | tolerate reviewer annotation keys + surface dsh output |
| `cd666c8` | dsh mock end-to-end verification docs |
| `464d1d9` | M0 implementation docs, conformance, changelog |
| `884e8d7` | b-mobile employee-app slice + HTML renderer |
| `e6569a8` | Phase 1C / agent organization / asset policy docs |
| `88efc68` | Buguxinsheng app icon pack |
| `cf07bc4` | core/runtime/M0 design spec |
| `2b4bb0c` | milestone rationale + B/C adapter scope |
| `f721b72` | M0 usage flow + result inspection |
| `b294eeb` | M0 implementation plan with checkboxes/tests |
| `bd2772b` | split pipeline into core + standalone runtime |
| `1640c15` | asset review contracts + verdict thresholds |
| `0bb342a` | SVG normalization + hard gates |
| `22512bd` | independent asset review state machine |
| `d1d8a6f` | manifest builder + dry-run preflight |
| `cb6dea5` | standalone asset adapters |
| `e4f1466` | M0 fixtures + review scenarios |
| `536200e` | asset:review CLI with standalone runtime |
| `c0a6b16` | dsh plugin + headless adapter |
| `62ee2db` | project-local dsh profile + vision key setup |

## 2026-10-20 — Phase 1B checkpoint

- `feat: add b-mobile employee-app slice and html renderer`
  (`884e8d7`)
- `docs: add phase 1c, agent organization and asset policy specs`
  (`e6569a8`)
- `chore(assets): add buguxinsheng app icon pack` (`88efc68`)
- Baseline at that checkpoint: 157 tests, typecheck clean, `2 pages / 0 blockers`.

## Historical note

Plans under `docs/superpowers/plans/2026-10-19-*` are historical. Their paths
reflect the pre-reorg layout (`pipeline/packages/*`, `pipeline/pipeline/orchestrator`)
and are intentionally not rewritten.
