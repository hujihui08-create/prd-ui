# M1 Agent Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the M1 agent layer — IA, Interaction Design, and Visual Style agents with a shared runner port, strict schemas, deterministic gates, budgets, retries, evidence, and human signoff — without changing Page Spec or the renderer.

**Architecture:** A new runtime-neutral `core/agents` package owns role schemas, prompts, gates, and the `runM1` orchestrator. `runtimes/standalone` provides a scripted runner and the `agent:run` CLI; `runtimes/dsh` provides the real model runner over `dsh --json -`. Shared usage/pricing/redaction/asset-brief contracts move into `core/contracts` so `core/agents` does not depend on `core/asset-review`.

**Tech Stack:** TypeScript (strict, ESM), Zod 4, Vitest, tsx, dsh 0.2.1-rc.2, pnpm workspaces.

## Global Constraints

- `core/` must not import `@deepseek-ai/*`, `node:fs`, or `node:child_process`.
- `core/agents` must not import `@prd-ui/asset-review`; shared contracts live in `@prd-ui/contracts`.
- ESM relative imports use explicit `.js` extensions.
- All agent outputs use strict Zod schemas; unknown fields are rejected.
- Artifacts carry `schemaVersion`, `project`, `generatedAt`, `model`, `promptHash`.
- Agent output is written only under `runs/<runId>/`; no final handoff.
- Default run budget is 10 CNY; `usageComplete=false` with a budget fails closed unless `--allow-unknown-cost`.
- `--allow-unreviewed` never produces `success`; it produces `awaiting_signoff`.
- Existing regressions must stay green: `pnpm test` (350+), `pnpm typecheck`, `pnpm test:dsh`, employee-app `2 pages / 0 blockers`, asset review `13/13`.
- No Page Spec, HTML, Figma, or renderer changes in M1.

---

## File Structure

```text
core/contracts/src/
  usage.ts                 # AgentUsageSchema (shared token usage shape)
  pricing.ts               # pricing config + reviewCost (shared)
  redact.ts                # redactSecrets / redactValue (shared)
  asset-brief.ts           # AssetBriefSchema (shared with asset-review)
  project-config.ts        # add optional `prd`
  index.ts                 # export new modules

core/agents/
  package.json
  tsconfig.json
  src/contracts.ts         # AgentTask/AgentResult/AgentRunnerPort/envelope
  src/roles/ia.ts          # IA output schema + prompt
  src/roles/interaction.ts # Interaction + motion schemas + prompt
  src/roles/visual-style.ts# Visual style + asset brief output schema + prompt
  src/roles/index.ts
  src/gates/ia.ts
  src/gates/interaction.ts
  src/gates/visual-style.ts
  src/gates/index.ts
  src/signoff.ts
  src/state.ts
  src/run-m1.ts
  src/index.ts
  tests/contracts.test.ts
  tests/gates.test.ts
  tests/run-m1.test.ts

runtimes/standalone/src/
  agent/scripted-runner.ts
  agent-cli.ts
  index.ts                 # export agentMain

runtimes/dsh/src/
  agent-runner.ts
  dsh-process.ts           # add generic runDshTask; keep runDshReview
  index.ts                 # export agent runner
dsh/home/profiles/prd-ui-agents/{package.json,cordis.yml,cordis.patch.yml}

samples/projects/employee-app/prd.md
samples/agents/m1/{ia.json,interaction.json,visual-style.json}

pipeline/docs/agent-m1.md
```

---

### Task 1: Shared usage, pricing, redaction, asset brief contracts

**Files:**
- Create: `core/contracts/src/usage.ts`, `core/contracts/src/pricing.ts`, `core/contracts/src/redact.ts`, `core/contracts/src/asset-brief.ts`
- Modify: `core/contracts/src/index.ts`, `core/contracts/src/project-config.ts`
- Modify: `core/asset-review/src/contracts.ts`, `core/asset-review/src/pricing.ts`, `core/asset-review/src/redact.ts`
- Test: `core/contracts/tests/contracts.test.ts`

**Interfaces:**
- Produces: `AgentUsageSchema`/`AgentUsage`, `ReviewPricingSchema`/`PricingConfigSchema`, `parsePricingConfig`, `resolvePricing`, `reviewCost`, `redactSecrets`, `redactValue`, `AssetBriefSchema`/`AssetBrief`, `AssetKindSchema`, `SourceIdSchema`, `AssetConstraintsSchema`.
- `ProjectConfigSchema` gains optional `prd: string`.

- [ ] **Step 1:** Add a contracts test asserting `AssetBriefSchema` accepts a brief with optional `visualRef`/`sourceHint` and rejects unknown keys; assert `AgentUsageSchema` rejects negative tokens.
- [ ] **Step 2:** Run `pnpm exec vitest run core/contracts/tests/contracts.test.ts` — expect failure (missing exports).
- [ ] **Step 3:** Move the four modules into contracts; re-export from asset-review so existing imports are unchanged.
- [ ] **Step 4:** Run the focused test + `pnpm typecheck`; existing asset-review tests must still pass.
- [ ] **Step 5:** Commit `refactor: share usage, pricing, redaction, asset-brief contracts`.

### Task 2: `core/agents` contracts and role schemas

**Files:**
- Create: `core/agents/package.json`, `core/agents/tsconfig.json`, `core/agents/src/contracts.ts`, `core/agents/src/roles/{ia,interaction,visual-style,index}.ts`, `core/agents/src/index.ts`
- Test: `core/agents/tests/contracts.test.ts`

**Interfaces:**
- `AgentRole = "ia" | "interaction" | "visual-style"`.
- `AgentTask { role, prompt, schema, validate?, runDir, inputFiles, timeoutMs?, maxCostCny?, canRepair? }`.
- `AgentResult { output, usage?, usageComplete?, raw?, ignoredKeys?, repairAttempted?, stdout?, stderr?, attempts?, model? }`.
- `AgentRunnerPort { readonly name: string; readonly model: string; run(task): Promise<AgentResult> }`.
- `AgentRunnerError` with `code: "AGENT_TIMEOUT" | "AGENT_UNAVAILABLE" | "AGENT_EXIT_NONZERO" | "AGENT_INVALID_OUTPUT"`.
- `ArtifactEnvelopeSchema` = `{ schemaVersion: "1.0", project, generatedAt, model, promptHash, degraded?, degradedReason? }` strict.
- `IaOutputSchema = { map, findings, proposed, reviewMarkdown }` strict.
- `InteractionOutputSchema = { interactionSpec, motionSpec, reviewMarkdown }` strict.
- `VisualStyleOutputSchema = { visualStyle, assetBriefs }` strict.

- [ ] **Step 1:** Write tests: valid fixture parses; unknown key rejects; IA output containing `visualStyle`/`pageSpec` rejects; interaction states require default/loading/empty/error; visual asset briefs must be valid `AssetBrief`.
- [ ] **Step 2:** Run the focused test — fail.
- [ ] **Step 3:** Implement the schemas exactly as the M1 spec §5.
- [ ] **Step 4:** Run focused test + typecheck.
- [ ] **Step 5:** Commit `feat(agents): add M1 contracts and role schemas`.

### Task 3: IA gate + signoff contract

**Files:**
- Create: `core/agents/src/gates/ia.ts`, `core/agents/src/signoff.ts`
- Test: `core/agents/tests/gates.test.ts`

**Interfaces:**
- `IaWaiverSchema = { findingId, owner, reason, expires }` strict.
- `SignoffBlockSchema = { signer, date, waivers: IaWaiver[] }`.
- `parseSignoffMarkdown(text): { present, signer?, waivers, valid, error? }` reads a fenced `<!-- signoff {json} -->` block.
- `runIaGate({ map, findings, brief, waivers, now }): GateResult`.
- `GateResult = { passed, status: "passed" | "failed" | "waived", issues: GateIssue[] }`.
- Blocker codes: `IA_SCHEMA`, `IA_DUPLICATE_PAGE`, `IA_PAGE_MISSING`, `IA_PAGE_UNKNOWN`, `IA_FLOW_STEP_UNKNOWN`, `IA_BLOCKER_UNWAIVED`, `IA_WAIVER_INVALID`, `IA_DUPLICATE_FINDING`.
- Waived blocker still passes when the waiver is valid and unexpired; gate status is `waived`.

- [ ] **Step 1:** Tests: clean map passes; unwaived blocker fails; valid waiver → `waived`; expired waiver → fails; missing brief page → fails; duplicate finding id → fails.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run + typecheck.
- [ ] **Step 5:** Commit `feat(agents): add IA gate and signoff parsing`.

### Task 4: Interaction gate

**Files:**
- Create: `core/agents/src/gates/interaction.ts`
- Test: `core/agents/tests/gates.test.ts`

**Interfaces:**
- `runInteractionGate({ interactionSpec, motionSpec, brief, motionTokens? }): GateResult`.
- Codes: `INTERACTION_PAGE_MISSING`, `INTERACTION_PAGE_UNKNOWN`, `INTERACTION_ACTION_MISSING`, `INTERACTION_STATE_MISSING`, `INTERACTION_STATE_UNKNOWN`, `INTERACTION_DEFAULT_EMPTY`, `INTERACTION_FOCUS_EMPTY`, `MOTION_PRESET_UNKNOWN`, `MOTION_PAGE_UNKNOWN`, `MOTION_EASING_NOT_TOKEN`, `MOTION_DURATION_NOT_TOKEN`, `MOTION_TOKENS_EMPTY`.
- Every brief page action must appear in that page's triggers with a reaction.
- Every brief `requiredStates` entry must be a key in `states`.
- Motion preset easing must be a key or value in `tokens.easing`; `durationMs` must equal a `\d+ms` token value.
- Reduced motion is schema-required; a missing fallback is a schema failure.

- [ ] **Step 1:** Tests for each code above (one fixture per failure).
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run + typecheck.
- [ ] **Step 5:** Commit `feat(agents): add interaction and motion gate`.

### Task 5: Visual Style gate

**Files:**
- Create: `core/agents/src/gates/visual-style.ts`
- Test: `core/agents/tests/gates.test.ts`

**Interfaces:**
- `runVisualStyleGate({ visualStyle, assetBriefs, brief }): GateResult`.
- Codes: `VISUAL_PALETTE_EMPTY`, `VISUAL_TYPOGRAPHY_EMPTY`, `VISUAL_ASSET_STRATEGY_MISSING`, `ASSET_BRIEF_MISSING`, `ASSET_BRIEF_DUPLICATE`, `ASSET_BRIEF_KIND_MISMATCH`, `ASSET_SOURCE_STRATEGY_MISMATCH`, `ASSET_BRIEF_EXTRA`.
- Every id in `brief.assets.icons` must have an `icon` brief; every illustration an `illustration` brief; images may be `illustration` or `poster`.
- Icon strategy `library|commission|ai-vector` must appear in the brief's `sourceChain`.
- Extra briefs are warnings, not blockers.

- [ ] **Step 1:** Tests for missing palette/typography/strategy, missing brief, kind mismatch, source mismatch, duplicate, extra warning.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run + typecheck.
- [ ] **Step 5:** Commit `feat(agents): add visual style gate`.

### Task 6: `runM1` orchestrator

**Files:**
- Create: `core/agents/src/state.ts`, `core/agents/src/run-m1.ts`
- Test: `core/agents/tests/run-m1.test.ts`

**Interfaces:**
- `M1RunStateSchema` with stages `init|ia|ia_gate|design|design_gate|signoff|done`; statuses `running|awaiting_signoff|success|partial|failed|budget_exceeded|usage_incomplete`; per-role `pending|running|passed|failed|budget_exceeded|usage_incomplete|skipped`; gates `pending|passed|failed|waived`; signoff booleans; usage/cost totals.
- `runM1(input: RunM1Input): Promise<M1RunResult>`.
- `M1RunInput`: `runId`, `project`, `runDir`, `brief`, `prdText`, `runners: Record<AgentRole, AgentRunnerPort>`, `ports: { store, clock, log }`, `pricing?`, `maxCostCny?` (default 10), `agentMaxCostCny?`, `allowUnknownCost?`, `allowUnreviewed?`, `maxAgentAttempts?` (3), `maxGateRounds?` (2), `onlyRoles?`, `waivers?`.
- `AgentArtifactStorePort` extends file ops with `exists(path)`.
- Artifacts: `artifacts/ia-*.json|.md`, `artifacts/interaction-spec.json`, `artifacts/motion-spec.json`, `artifacts/interaction-review.md`, `artifacts/visual-style.json`, `artifacts/asset-briefs/<id>.json`; `agents/<role>/{prompt.md,output.json,raw.json,stdout.txt,stderr.txt,session.json,history.json}`; `findings/<role>-gate.json`; `signoff/`; `logs/agent.ndjson`; `state.json`.

- [ ] **Step 1:** Build a `ScriptedAgentRunner` test double and tests for: IA first then design; full artifact set; `awaiting_signoff`; `--allow-unreviewed` still awaiting; IA blocker stops downstream; one agent failure leaves the other artifact intact (`partial`); budget exceeded marks remaining skipped; `usageComplete=false` fails closed; `--allow-unknown-cost` continues; retry max 3; gate repair max 2 rounds; repair usage merged; promptHash/model written; raw/log redacted.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement the state machine and orchestrator.
- [ ] **Step 4:** Run focused tests + typecheck.
- [ ] **Step 5:** Commit `feat(agents): add runM1 orchestrator`.

### Task 7: Standalone scripted runner + agent CLI

**Files:**
- Create: `runtimes/standalone/src/agent/scripted-runner.ts`, `runtimes/standalone/src/agent-cli.ts`
- Modify: `runtimes/standalone/src/index.ts`, `package.json` (script `agent:run`)
- Test: `runtimes/standalone/tests/agent-cli.test.ts`

**Interfaces:**
- `ScriptedAgentRunner` implements `AgentRunnerPort`; `name="scripted"`, `model="scripted"`; fixtures keyed by role, each `{ output, usage?, usageComplete?, error? }` or an array consumed per call.
- `parseAgentArgs(argv): AgentCliOptions`; `main(argv, io?)`.
- CLI flags: `--project`, `--prd`, `--runs`, `--runtime standalone|dsh`, `--fixtures <dir>`, `--max-cost-cny`, `--allow-unknown-cost`, `--allow-unreviewed`, `--signoff-ia`, `--signoff-visual-style`, `--only-role`, `--json`, `--help`.
- Exit 0 only for `success`; 1 for `awaiting_signoff`/`partial`/`failed`; 2 for usage errors.
- `--json` prints exactly one redacted object: `{ runDir, status, gates, agents, signoff, costCny, usageComplete, error }`.

- [ ] **Step 1:** Tests: parse args; scripted run produces artifacts; missing fixture fails; `--allow-unreviewed` exits 1 with awaiting_signoff; malformed run config exits 2; `--json` is one parseable object; redaction.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement and add `"agent:run": "tsx runtimes/standalone/src/agent-cli.ts"`.
- [ ] **Step 4:** Run focused + typecheck.
- [ ] **Step 5:** Commit `feat(agents): add agent:run CLI and scripted runner`.

### Task 8: Sample PRD + M1 fixtures

**Files:**
- Create: `samples/projects/employee-app/prd.md`, `samples/agents/m1/{ia,interaction,visual-style}.json`
- Modify: `samples/projects/employee-app/project.yaml` (add `prd: prd.md`)

**Interfaces:** fixtures are valid `IaOutput`, `InteractionOutput`, `VisualStyleOutput` for the employee-app brief. Visual briefs cover all 10 `brief.assets.icons`.

- [ ] **Step 1:** Add the PRD summary (today + inventory scope, roles, navigation, states).
- [ ] **Step 2:** Add fixtures; parse them with the role schemas in a test.
- [ ] **Step 3:** Run `pnpm agent:run --project samples/projects/employee-app/project.yaml --fixtures samples/agents/m1 --runs /tmp/m1-agent-runs --allow-unreviewed` and confirm `awaiting_signoff`.
- [ ] **Step 4:** Commit `feat(agents): add employee-app M1 sample inputs`.

### Task 9: dsh generic task runner + agent runner

**Files:**
- Modify: `runtimes/dsh/src/dsh-process.ts`, `runtimes/dsh/src/index.ts`
- Create: `runtimes/dsh/src/agent-runner.ts`
- Test: `runtimes/dsh/tests/dsh-process.test.ts` (extend), `runtimes/dsh/tests/agent-runner.test.ts`

**Interfaces:**
- `runDshTask(input): Promise<DshTaskResult>` returns `{ answer?, usage?, usageComplete, usageSource, stdout, stderr, session }`; `runDshReview` keeps its current behavior and verdict validation.
- `DshAgentRunner implements AgentRunnerPort`; `name="dsh"`; `model = env.PRD_UI_VISION_MODEL`; parses `final.text`, validates via `task.validate`, one schema repair merged into usage, writes attempts evidence.
- Default profile: `prd-ui-agents`; default home/bin/cwd mirror `defaultDshOptions`.

- [ ] **Step 1:** Tests with a fake `CommandRunner`: stdin task, `--json -`, `final.text` JSON, `step_end` usage; invalid JSON → one repair; repair failure → `AgentRunnerError("AGENT_INVALID_OUTPUT")`; timeout maps to `AGENT_TIMEOUT`.
- [ ] **Step 2:** Run — fail.
- [ ] **Step 3:** Implement refactor + runner.
- [ ] **Step 4:** Run focused + typecheck.
- [ ] **Step 5:** Commit `feat(agents): add dsh agent runner`.

### Task 10: dsh agent profile + mock integration

**Files:**
- Create: `dsh/home/profiles/prd-ui-agents/{package.json,cordis.yml,cordis.patch.yml}`
- Create: `runtimes/dsh/tests/agent-integration.test.ts`
- Modify: `vitest.dsh.config.ts` include pattern, `package.json` if install needed

**Interfaces:** the `prd-ui-agents` profile mounts only `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-headless`, and `@deepseek-ai/dsh-llm-pi-ai`; no asset-plugin tools.

- [ ] **Step 1:** Add the profile.
- [ ] **Step 2:** Add a mock HTTP + real pinned dsh test that runs `agent:run --runtime dsh --only-role ia --signoff-ia <fixture>` and asserts artifacts, `usageSource=json-events`, `usageComplete=true`, and no asset tools in the prompt.
- [ ] **Step 3:** Run `pnpm install` if the workspace links the new profile, then `pnpm test:dsh`.
- [ ] **Step 4:** Commit `feat(agents): add dsh agent profile and mock integration`.

### Task 11: Regression, docs, real dsh manual run

**Files:**
- Create: `pipeline/docs/agent-m1.md`
- Modify: `README.md`, `CHANGELOG.md`, `AGENTS.md` (commands/expected evidence), `pipeline/dsh/README.md`

- [ ] **Step 1:** Run `pnpm test` (≥350 + new), `pnpm typecheck`, `pnpm test:dsh`.
- [ ] **Step 2:** Run employee-app phase1 (`2 pages / 0 blockers`) and standalone asset review (`13/13`).
- [ ] **Step 3:** If `pipeline/.env` exists, run the three agents through real dsh for employee-app, record model/usage/cost (≤10 CNY), and note `usageComplete`.
- [ ] **Step 4:** Write `pipeline/docs/agent-m1.md` with usage, artifacts, signoff format, exit codes, and the real-run record; update README/CHANGELOG/AGENTS.
- [ ] **Step 5:** Commit `docs: record M1 agent layer implementation`.

## Self-Review

- Spec §4.2 runner port → Task 2/9. §4.3 layout → Task 6. §5 contracts → Tasks 1/2. §6 gates/budget/signoff → Tasks 3–6. §7 prompt boundaries → Tasks 3–5/9. §8 test matrix → Tasks 2–10. §9 acceptance → Task 11.
- No Page Spec/HTML/renderer files are touched.
- Type names are consistent across tasks (`AgentResult`, `GateResult`, `M1RunState`, `AgentRunnerPort`).
