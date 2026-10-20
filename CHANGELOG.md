# Changelog

All notable changes to the PRD → UI pipeline are recorded here. Dates are local
(Asia/Shanghai) work dates; commits are local-only (no push).

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

- `pnpm test`: 349 tests passed (offline; dsh mock integration excluded).
- `pnpm test:dsh`: 1 passed (real pinned dsh 0.2.1-rc.2 + local mock).
- `pnpm typecheck`: clean.
- `pnpm phase1:verify`: `2 pages, 0 blockers`.
- `pnpm asset:review --assets samples/assets/m0 --runtime standalone`:
  `13 assets, 13 passed`.
- `pnpm asset:review --assets samples/assets/m0-scenarios --runtime standalone`:
  `1 passed, 1 unresolved`, exit 1 as designed.
- dsh mock run: `1 assets, 1 passed`, `usageSource=json-events`,
  `usageComplete=true`, review cost below the 10 CNY cap.
- Real dsh `deepseek-flash` full run: `13 assets, 13 passed`, `1 retried`,
  `usageSource=json-events`, `usageComplete=true`, review cost ¥0.3379
  (10 CNY default cap). 14 `candidate.png` evidence files and 14 `read_image`
  calls; no key material in the run directory; both set gates passed and
  `manifest.json` / `manifest.review.json` report `complete: true`.

### Commit trail

| Commit | Change |
|---|---|
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
