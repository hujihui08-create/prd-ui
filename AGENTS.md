# Repository AGENTS.md

This repository is a PRD → UI pipeline. The architecture is one core plus two runtime adapters.

## Layout

- `pipeline/core/*` — runtime-neutral contracts, design system, compiler, validators, renderer, orchestrator, asset-review.
- `pipeline/runtimes/standalone` — file-system and model adapters + CLIs.
- `pipeline/runtimes/dsh` — dsh Cordis plugin/tools/headless adapter.
- `pipeline/dsh` — project-local dsh profile (never modify `~/.dsh`); profile definition is versioned, `node_modules`/sessions/credentials are ignored.
- `pipeline/docs/asset-review-m0.md` — M0 asset-review usage.
- `README.md` — project overview and quick start.
- `CHANGELOG.md` — change record.
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

Current expected evidence: 231 tests, typecheck clean, `2 pages / 0 blockers`,
`13 assets / 13 passed`.

## Rules

- Do not import `@deepseek-ai/*` from `core/`.
- Do not write final handoff from agents; only `runs/<id>/`.
- Never commit keys or `.env`; only `.env.example`.
- Keep `pnpm phase1:verify` at 2 pages / 0 blockers.
- Local commits only; no push.
