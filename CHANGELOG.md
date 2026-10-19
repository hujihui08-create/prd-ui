# Changelog

All notable changes to the PRD → UI pipeline are recorded here. Dates are local
(Asia/Shanghai) work dates; commits are local-only (no push).

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

- `pnpm test`: 231 tests passed.
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

### Known blockers / deferred

- A real vision provider key was **not** configured in this environment. The dsh
  runtime itself was verified end-to-end with a local mock OpenAI-compatible
  endpoint (13/13 passed); real model quality/cost is not measured. Without a
  key the pipeline fails with `MISSING_CREDENTIAL` instead of faking a pass.
- M0 only connects the A library; B/C adapter interfaces and state-machine
  branches exist, but real suppliers/accounts/licensing are M2.
- IA/Interaction/Visual Style agents are M1; Figma, screenshot diff, recording,
  and trace gates are M3.
- The dsh plugin/tool registration contract is still a release candidate; the
  CLI and bundles are pinned, and `@next` is not used.

### Commit trail

| Commit | Change |
|---|---|
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
