# Phase 1A Pipeline — Contracts & Validators

Deterministic PRD → UI pipeline foundation. Phase 1A turns the sample UI Brief
into eight Page Specs, validates each page against its design profile, catalog,
archetype, and asset manifest, and writes a complete run record under
`runs/<runId>/`.

Phase 1B adds project configuration (`project.yaml`), CLI overrides for custom
briefs and manifests, brief-driven page content, Brief → Page Spec semantic
validation, and a second end-to-end project, `samples/projects/demo-crm`.

## Current limitations

- There is no PRD → UI Brief ingestion. `samples/sample-prd.md` is illustrative
  only; users author a `UiBrief` JSON (and project config) by hand until
  Phase 2.
- There is no real design-system ingestion. `b-dense` and `c-expressive` are
  built-in baselines; custom profiles and catalogs cannot be registered yet.
- The `onboarding` archetype is implemented but not exercised by a sample
  project.
- Some compiler fallback copy is generic, for example `暂无${page.name}` when a
  `list` page omits `emptyTitle`.
- Asset manifests declare file paths, formats, licenses, and optional hashes,
  but real asset files and hashes are not ingested or verified.

The original independent user-acceptance findings are in
[`docs/user-acceptance-2026-10-19.md`](docs/user-acceptance-2026-10-19.md).

## Commands

Run from `pipeline/`:

```bash
pnpm install
pnpm test            # vitest: contracts, design system, compiler, validators, orchestrator
pnpm typecheck       # tsc --noEmit for every workspace package
pnpm phase1:verify   # Phase 1A exit check
```

`pnpm phase1:verify` must print:

```text
Phase 1A OK: 8 pages, 0 blockers
```

and exit 0. Any blocking finding exits 1 and leaves a failed run behind.

## Using your own project

A project is a directory containing a `project.yaml`, a `UiBrief` JSON file, and
one asset manifest per design profile:

```text
my-project/
  project.yaml
  ui-brief.json
  asset-manifest.b-dense.json
```

`project.yaml`:

```yaml
project: my-project        # must match ui-brief.json meta.project
brief: ui-brief.json       # resolved relative to this file
manifests:                 # resolved relative to this file
  b-dense: asset-manifest.b-dense.json
# runsDir: runs            # optional; resolved relative to this file
```

Every page `profile` used by the brief must have a manifest entry, and each
manifest must declare the same `project` and `profile`. Run the project with:

```bash
pnpm phase1:verify --project <path/to/project.yaml>
```

The project's brief and manifests are loaded from the config, so `--brief` and
`--manifest` are not needed. The runs directory defaults to `./runs` unless
`--runs` or the project's `runsDir` is set.

`demo-crm` is a complete second example (one `contacts-list` page with its own
brief and manifest):

```bash
pnpm phase1:verify --project samples/projects/demo-crm/project.yaml --runs /tmp/demo-crm-runs
```

### Employee-app mobile slice

`samples/projects/employee-app/` is a two-page mobile B-end slice generated from
the employee mini-program PRD (`今日` + `库存查询`). It uses the `b-mobile`
profile (mobile B-end baseline) and demonstrates the HTML renderer:

```bash
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/employee-app-runs
pnpm render:html --run /tmp/employee-app-runs/<runId> --out /tmp/employee-app-html
open /tmp/employee-app-html/index.html
```

The renderer uses the Page Spec + `b-mobile` tokens; `?state=empty|loading|error`
switches states. A checked-in copy of the rendered slice and screenshots is under
`artifacts/employee-app/`.

### Asset review (M0)

M0 adds a runtime-neutral asset review core and two execution adapters. It reads
A-library candidates, runs deterministic hard gates, gets an independent verdict,
and freezes the assets into `manifest.json`:

```bash
# 13 assets, scripted reviewer, no model key
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0 \
  --runtime standalone \
  --runs /tmp/m0-runs

# retry / unresolved scenarios
pnpm asset:review \
  --project samples/projects/employee-app/project.yaml \
  --assets samples/assets/m0-scenarios \
  --runtime standalone \
  --runs /tmp/m0-scenarios
```

For a real dsh review, configure `pipeline/.env` and see
[`dsh/README.md`](dsh/README.md); the full usage guide is
[`docs/asset-review-m0.md`](docs/asset-review-m0.md).

### CLI options

```text
pnpm phase1:verify [options]

Options:
  --project <path>              Load a project config (YAML)
  --brief <path>                Override the brief path
  --manifest <profile>=<path>   Add or override an asset manifest (repeatable)
  --runs <dir>                  Directory that receives run artifacts
  -h, --help                    Print this help and exit
```

- With no options, `samples/project.demo-orders.yaml` runs.
- `--brief` and `--manifest` paths are resolved against the working directory;
  repeat `--manifest` once per profile. A custom brief requires manifests.
- `--help` prints usage, exits 0, and does not run the pipeline.
- On success the CLI prints `Phase 1A OK: <n> pages, <n> blockers` and the run
  directory (`Run: <path>`). All artifacts live under that directory. Counts
  are singular when 1 (`1 page, 1 blocker`).
- Pipeline failures (brief gate, project/manifest mismatch, page validation)
  print `Phase 1A FAILED: ...`, the run directory, and up to ten reasons
  (`- <RULE-ID>: <message>`) to stdout, so the fix is visible without opening
  the run log.
- Pre-run argument or configuration errors (an empty option value, a custom
  brief without manifests, an unreadable project config) print
  `Phase 1A FAILED: ...` to stderr and create no run directory.

## Workspace

| Path | Package | Responsibility |
|---|---|---|
| `core/contracts` | `@prd-ui/contracts` | Zod schemas and shared types (`PageSpec`, `UiBrief`, catalogs, manifests, findings, run state) |
| `core/design-system` | `@prd-ui/design-system` | `b-dense` and `c-expressive` profiles/catalogs, eight archetypes, layout primitives |
| `core/compiler` | `@prd-ui/compiler` | Deterministic brief page → Page Spec templates |
| `core/validators` | `@prd-ui/validators` | Pure-function rule checks; no content generation, no file writes |
| `core/renderer-html` | `@prd-ui/renderer-html` | Page Spec + profile tokens → HTML |
| `core/orchestrator` | `@prd-ui/orchestrator` | Run state machine, brief gate, artifacts, `runPhase1` |
| `runtimes/standalone` | `@prd-ui/runtime-standalone` | File-system/CLI adapters: `phase1:verify`, `render:html`, `asset:review` |

`pipeline/` is isolated from `spike/`.

## Run artifacts

Each run writes:

```text
runs/<runId>/state.json
runs/<runId>/artifacts/ui-brief.json
runs/<runId>/artifacts/page-spec/<pageId>.json
runs/<runId>/reports/validation.json
runs/<runId>/logs/run.log
```

Failures are recorded, not lost: intake/compile/schema errors write
`state.json` with `status: "failed"` and a failed `gates.brief` when the brief
never passed, append the error to `logs/run.log`, and then propagate to the
CLI for exit 1.

## Gates

The brief gate runs after parsing and before compilation:

- `BRIEF-BLOCKING-QUESTION` — any `openQuestions` entry has `blocking: true`.
- `BRIEF-UNMAPPED` — `traceability.unmapped` is non-empty.
- `BRIEF-REQ-UNMAPPED` — a page `reqRefs` entry is absent from
  `traceability.reqMap`.

Only after all three checks pass does `state.gates.brief` become `"passed"`.

Per-page validators cover schema, catalog, tokens, layout, states, assets,
traceability, and Brief → Page Spec semantics (`SEMANTIC-*`). A page passes
when it has zero blockers; major/minor findings are reported but do not fail
the page.

## Asset manifests

Assets are resolved per profile. Each project supplies its own manifests via
`project.yaml` (or `--manifest`); the built-in sample uses:

- `samples/asset-manifest.b-dense.json` — icons plus `empty-orders`.
- `samples/asset-manifest.c-expressive.json` — icons plus `empty-feed`.

The orchestrator passes each page the manifest for its profile. Validators
block `ASSET-PROFILE` when `manifest.profile` does not match the page's resolved
profile and `ASSET-PROJECT` when `manifest.project` does not match the brief
project.

`emptyAssetRef` on a `list` or `feed` page is optional: when it is present, the
page's `EmptyState` references that illustration id, and the manifest must
contain it. When it is omitted, the empty state renders without an illustration
and no asset is required — there is no implicit `empty-orders`/`empty-feed`
default. The sample `orders-list` declares `empty-orders`, `home-feed` declares
`empty-feed`, and the `demo-crm` project declares `empty-contacts`; each project
ships the matching entry in its own manifest.

Phase 1A does not require the referenced SVG/PNG files to exist; the manifest
entries are the contract. Real files and hashes arrive when asset ingestion is
connected.

## Page ids

Page ids are path-safe lowercase kebab-case (`^[a-z][a-z0-9-]*$`) in both
`PageSpec.meta.pageId` and `UiBriefPage.id`, so they can be used directly as
artifact filenames. `UiBriefSchema` also rejects duplicate page ids; the
orchestrator re-checks defensively.

## Resolved design decisions

- **Layout primitives are non-catalog.** `Text`, `Grid`, `Row`, `Stack`, and
  `Icon` have no catalog contracts and no availability status. They are allowed
  as structural nodes and listed in root-shell slot allow-lists instead.
- **Root shells are catalog components.** `PageShell` and `MobileShell` must
  exist in the selected profile's catalog and are checked by `CATALOG-UNKNOWN`.
  The compiler also refuses to compile a page whose profile catalog does not
  provide its target's root shell. Root shells remain excluded from archetype
  `allowedComponents` because they are validated as the page root.
- **`detail` targets `any`.** One archetype serves both web (`PageShell`) and
  mobile (`MobileShell`) detail pages; the compiler picks the shell from
  `page.target`.
- **Required slots simplified.** Archetypes require only the slots their
  templates emit (`content`, `summary`/`fields`/`actions`, `groups`, `feed` /
  `bottom-nav`, `title`/`fields`/`actions`, `illustration`/`title`/`body`/
  `actions`). `PageShell` subsumes `Sidebar`/`Header` through its `nav` prop.
- **Asset placeholder severity.** `ASSET-PLACEHOLDER` is a blocker (the
  final-delivery gate). Phase 1A sample manifests contain no placeholders, so
  the exit stays green.
- **Page-required states are enforced.** `ValidationContext.requiredStates`
  carries the brief page's `requiredStates`, so `STATE-REQUIRED` checks both the
  archetype set and page-specific states such as `filtered`.

## Sample pages

| Target | Page id | Archetype | Profile |
|---|---|---|---|
| web | `orders-overview` | overview | b-dense |
| web | `orders-list` | list | b-dense |
| web | `order-detail` | detail | b-dense |
| web | `order-form` | form | b-dense |
| web | `settings` | settings | b-dense |
| mobile | `home-feed` | feed | c-expressive |
| mobile | `item-detail` | detail | c-expressive |
| mobile | `auth` | auth | c-expressive |

`samples/projects/demo-crm` is a second, independent project: one
`contacts-list` page (list archetype, b-dense) with contact fields, filters,
action, empty state, navigation, and asset manifest. It proves the
custom-project workflow end to end and that no order copy leaks into another
project's pages.
