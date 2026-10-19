# Phase 1A Pipeline — Contracts & Validators

Deterministic PRD → UI pipeline foundation. Phase 1A turns the sample UI Brief
into eight Page Specs, validates each page against its design profile, catalog,
archetype, and asset manifest, and writes a complete run record under
`runs/<runId>/`.

## Current limitations (Phase 1A)

**Phase 1A is a sample harness, not a general user-facing pipeline.** Independent
user testing on 2026-10-19 confirmed:

- Only the `demo-orders` sample can pass. Asset manifests are hardcoded per
  profile; a new project fails `ASSET-PROJECT` and has no supported manifest
  configuration path.
- `pnpm phase1:verify` accepts no custom brief or PRD. Extra arguments are
  ignored; a custom brief requires importing `runPhase1` in a script.
- Compiler templates are sample-specific. A custom `list` page can validate with
  0 blockers while still rendering order-specific navigation, filters, empty
  state, and actions.
- Validators do not detect Brief-to-layout semantic mismatches.
- `PageSpec.meta` does not carry `purpose`, `route`, or `roles`.
- There is no PRD → UI Brief ingestion; `sample-prd.md` is illustrative only.

Full findings and the recommended next steps are in
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

## Workspace

| Path | Package | Responsibility |
|---|---|---|
| `packages/contracts` | `@prd-ui/contracts` | Zod schemas and shared types (`PageSpec`, `UiBrief`, catalogs, manifests, findings, run state) |
| `packages/design-system` | `@prd-ui/design-system` | `b-dense` and `c-expressive` profiles/catalogs, eight archetypes, layout primitives |
| `packages/compiler` | `@prd-ui/compiler` | Deterministic brief page → Page Spec templates |
| `packages/validators` | `@prd-ui/validators` | Pure-function rule checks; no content generation, no file writes |
| `pipeline/orchestrator` | `@prd-ui/orchestrator` | Run state machine, brief gate, artifacts, `phase1:verify` entry point |

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

Per-page validators cover schema, catalog, tokens, layout, states, assets, and
traceability. A page passes when it has zero blockers; major/minor findings are
reported but do not fail the page.

## Asset manifests

Assets are resolved per profile:

- `samples/asset-manifest.b-dense.json` — icons plus `empty-orders`.
- `samples/asset-manifest.c-expressive.json` — icons plus `empty-feed`.

The orchestrator passes each page the manifest for its profile. Validators
block `ASSET-PROFILE` when `manifest.profile` does not match the page's resolved
profile and `ASSET-PROJECT` when `manifest.project` does not match the brief
project. The b-dense `list` template references `empty-orders`; the
c-expressive `feed` template references `empty-feed`, so both asset paths are
exercised by the sample run.

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
