# Phase 2 Spec Engineer v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic Spec Engineer v0 that consumes M1 interaction/motion/IA/asset artifacts and produces enriched Page Specs with interactions, states, motion bindings, and asset references.

**Architecture:** A new runtime-neutral `core/spec-engineer` package applies M1 artifacts to Page Specs compiled from the brief, runs deterministic gates, and returns a summary. `runtimes/standalone` adds `pnpm spec:engineer` to load an M1 run, compile base specs, write enriched Page Specs, findings, and a summary. No model calls.

**Tech Stack:** TypeScript (strict, ESM), Zod 4, Vitest, tsx, pnpm workspaces.

## Global Constraints

- `core/spec-engineer` must not import `node:fs`, `node:child_process`, `@deepseek-ai/*`, or runtime adapters.
- The mapper is deterministic: same inputs produce byte-identical Page Specs; no timestamps inside Page Specs.
- Do not modify the UI Brief, layout, HTML output, renderer behavior, or M1 artifacts.
- Page Spec changes are backward compatible: `interactions[].nodeId` and top-level `motion` are optional.
- Gates block only blockers; warnings are recorded and do not prevent writing Page Specs.
- Preserve all existing regressions: `pnpm test` ≥423, `pnpm test:dsh` 2, typecheck clean, employee-app `2 pages / 0 blockers`, asset review `13/13`.
- Local commits only; no push.

---

## File Structure

```text
core/contracts/src/page-spec.ts          # add optional nodeId + motion
core/agents/src/artifacts.ts             # export M1 artifact schemas
core/agents/src/run-m1.ts                # import artifact schemas instead of local consts

core/spec-engineer/
  package.json
  tsconfig.json
  src/contracts.ts                       # input/result/gate/summary schemas
  src/apply.ts                           # interactions, states, motion, assets, designDefaults
  src/gates.ts                           # deterministic gate checks
  src/run-spec-engineer.ts               # orchestration + PageSpec validation
  src/index.ts
  tests/fixtures.ts                      # brief + compiled base specs + M1 artifacts
  tests/apply.test.ts
  tests/gates.test.ts
  tests/run.test.ts

runtimes/standalone/src/spec-cli.ts      # pnpm spec:engineer
runtimes/standalone/tests/spec-cli.test.ts
package.json                             # spec:engineer script
```

---

### Task 1: Page Spec extension + M1 artifact schema exports

**Files:**
- Modify: `pipeline/core/contracts/src/page-spec.ts`
- Create: `pipeline/core/agents/src/artifacts.ts`
- Modify: `pipeline/core/agents/src/run-m1.ts`, `pipeline/core/agents/src/index.ts`
- Test: `pipeline/core/contracts/tests/contracts.test.ts`

**Interfaces:**
- Produces: `Interaction.nodeId?: string`, `PageMotion`, `PageMotionPreset`, `PageSpec.motion?`.
- Produces: `IaMapArtifactSchema`, `IaFindingsArtifactSchema`, `IaProposedArtifactSchema`, `InteractionSpecArtifactSchema`, `MotionSpecArtifactSchema`, `VisualStyleArtifactSchema`, `AgentGateArtifactSchema` from `@prd-ui/agents`.

- [x] **Step 1: Add failing contract tests** for a Page Spec with `interactions[].nodeId` and `motion`, and for the old spec without `motion`.
- [x] **Step 2: Run `pnpm exec vitest run core/contracts/tests/contracts.test.ts`** — expect failure on unknown `motion`/`nodeId`.
- [x] **Step 3: Add the fields to the interfaces and Zod schemas** (`motion` strict, optional; `nodeId` optional).
- [x] **Step 4: Move the artifact schema constants from `run-m1.ts` to `artifacts.ts`; export from index; import in `run-m1.ts`.**
- [x] **Step 5: Run contracts + agents tests and typecheck.**
- [x] **Step 6: Commit `feat(contracts): add Page Spec motion and artifact schemas`.**

### Task 2: `core/spec-engineer` scaffold and apply mapping

**Files:**
- Create: `pipeline/core/spec-engineer/{package.json,tsconfig.json}`
- Create: `src/contracts.ts`, `src/apply.ts`, `src/index.ts`
- Test: `tests/fixtures.ts`, `tests/apply.test.ts`

**Interfaces:**
- `SpecEngineerInput { runId, project, agentRunId?, brief, baseSpecs, interactionSpec, motionSpec, iaMap?, assetBriefs?, generatedAt }`.
- `SpecIssue { code, severity, message, evidence? }`.
- `SpecEngineerGate { passed, issues }`.
- `SpecEngineerResult { specs, gate, summary }`.
- `applySpecs(input): PageSpec[]`; `collectAssetReferences(specs): AssetReference[]`.

- [x] **Step 1: Write failing tests** for: transition → navigate interaction; trigger → reaction/nodeId; base interactions replaced; states merged; motion filtered/resolved; designDefaults; asset references.
- [x] **Step 2: Run `pnpm exec vitest run core/spec-engineer/tests/apply.test.ts`** — fail.
- [x] **Step 3: Implement `apply.ts`** with deterministic ordering and no mutation of the input.
- [x] **Step 4: Run tests + typecheck.**
- [x] **Step 5: Commit `feat(spec-engineer): map M1 interactions, states, motion, assets`.**

### Task 3: Deterministic gates

**Files:**
- Create: `src/gates.ts`
- Test: `tests/gates.test.ts`

**Interfaces:**
- `runSpecEngineerGates({ brief, specs, interactionSpec, motionSpec, iaMap?, assetBriefs? }): SpecEngineerGate`.
- Codes from the spec §6.

- [x] **Step 1: Write failing tests** for page/action/state/transition/motion/asset/IA gates; warnings for unused assets and unresolved motion nodeIds.
- [x] **Step 2: Run the focused test** — fail.
- [x] **Step 3: Implement gates** using `PageSpecSchema.safeParse` for `SPEC_SCHEMA` and layout traversal for node ids.
- [x] **Step 4: Run tests + typecheck.**
- [x] **Step 5: Commit `feat(spec-engineer): add deterministic gates`.**

### Task 4: `runSpecEngineer` and summary

**Files:**
- Create: `src/run-spec-engineer.ts`
- Modify: `src/index.ts`
- Test: `tests/run.test.ts`

**Interfaces:**
- `runSpecEngineer(input): Promise<SpecEngineerResult>`.
- `SpecEngineerSummarySchema` includes `runId`, `project`, `agentRunId?`, `generatedAt`, `pages`, `motionPages`, `assets`, `gate`, `passed`, `error?`.

- [x] **Step 1: Write failing tests** for a full result, `SPEC_SCHEMA` failure, and byte-identical output across two runs.
- [x] **Step 2: Implement** apply → gates → summary; return specs even on gate failure so callers can inspect, but the CLI will not write them.
- [x] **Step 3: Run tests + typecheck.**
- [x] **Step 4: Commit `feat(spec-engineer): add run orchestration and summary`.**

### Task 5: `pnpm spec:engineer` CLI

**Files:**
- Create: `pipeline/runtimes/standalone/src/spec-cli.ts`
- Modify: `pipeline/runtimes/standalone/src/index.ts`, `pipeline/package.json`, `pipeline/runtimes/standalone/package.json` (add `@prd-ui/spec-engineer`, `@prd-ui/compiler`)
- Test: `pipeline/runtimes/standalone/tests/spec-cli.test.ts`

**Interfaces:**
- `main(argv, io?)`, `parseArgs(argv)`, `USAGE`.
- Flags: `--project`, `--agent-run` (required), `--runs`, `--json`, `--help`.
- Exit 0 pass, 1 gate/input failure, 2 usage.
- Reads M1 `state.json`; allows `success|awaiting_signoff|partial`; rejects others.
- Loads `interaction-spec.json`, `motion-spec.json`, optional `ia-map.json`, optional `asset-briefs/*.json`.
- Writes `artifacts/page-spec/*.json` only when the gate passes; always writes `findings/spec-engineer-gate.json` and `spec-engineer.json`.

- [x] **Step 1: Write failing CLI tests** using a temporary fixture M1 run: success path, `--json` one object, missing artifact -> exit 1, state failed -> exit 1, page specs absent on gate failure.
- [x] **Step 2: Implement the CLI** with `compileProject`, project/brief loading, envelope checks, and redacted summary.
- [x] **Step 3: Add the `spec:engineer` script and exports.**
- [x] **Step 4: Run focused tests + typecheck.**
- [x] **Step 5: Commit `feat(spec-engineer): add spec:engineer CLI`.**

### Task 6: Regression, real run, docs

**Files:**
- Create: `pipeline/docs/spec-engineer-v0.md`
- Modify: `README.md`, `AGENTS.md`, `CHANGELOG.md`
- Test: full suite + real employee M1 run.

- [x] **Step 1: Run `pnpm test`, `pnpm typecheck`, `pnpm test:dsh`, phase1 `2/0`, standalone asset review `13/13`.**
- [x] **Step 2: Run `pnpm spec:engineer --project samples/projects/employee-app/project.yaml --agent-run /tmp/slice-final-clean/<runId> --runs /tmp/spec-engineer-runs`; confirm gate pass and 2 page specs.**
- [x] **Step 3: Inspect the enriched Page Specs** for interactions/states/motion/assets; verify `spec-engineer.json` assets warnings are expected.
- [x] **Step 4: Write `pipeline/docs/spec-engineer-v0.md`** (usage, artifacts, gates, exit codes, v0 limits).
- [x] **Step 5: Update README/AGENTS/CHANGELOG.**
- [x] **Step 6: Commit `docs: record Spec Engineer v0 implementation`.**

## Self-Review

- Spec §4 contracts → Task 1; §5 mapping → Task 2; §6 gates → Task 3; §7 CLI/artifacts → Task 5; §8 tests → Tasks 1–5; §9 acceptance → Task 6.
- No model calls, no brief/layout/HTML changes.
- Names are consistent: `SpecEngineerInput`, `applySpecs`, `runSpecEngineer`, `SpecEngineerGate`, `SpecEngineerSummary`.
- Known v0 limits: motion carried but not animated; unresolved motion nodeIds are warnings; unused asset briefs are warnings.
