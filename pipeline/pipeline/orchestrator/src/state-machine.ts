import type { RunState, Stage } from "@prd-ui/contracts";

/** Canonical phase order for a Phase 1 run. */
const order: Stage[] = ["intake", "brief", "compile", "validate", "report", "done"];

export function createRunState(runId: string): RunState {
  const now = new Date().toISOString();
  return {
    runId,
    stage: "intake",
    status: "running",
    attempts: {},
    degraded: false,
    gates: { brief: "pending" },
    startedAt: now,
    updatedAt: now,
  };
}

/**
 * Advance exactly one stage. Skipping, repeating or rewinding throws; a run
 * reaches `done` only via the full ordered pipeline.
 */
export function transition(state: RunState, next: Stage): RunState {
  const current = order.indexOf(state.stage);
  const target = order.indexOf(next);
  if (target !== current + 1) {
    throw new Error(`invalid transition: ${state.stage} -> ${next}`);
  }
  const now = new Date().toISOString();
  return {
    ...state,
    stage: next,
    status: next === "done" ? "success" : "running",
    updatedAt: now,
  };
}

/** Mark a run failed without advancing its stage (used by the orchestrator). */
export function failRun(state: RunState): RunState {
  return {
    ...state,
    status: "failed",
    updatedAt: new Date().toISOString(),
  };
}

export function stageOrder(): readonly Stage[] {
  return order;
}
