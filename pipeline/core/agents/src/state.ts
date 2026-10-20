import { z } from "zod";
import { AgentUsageSchema } from "@prd-ui/contracts";

export const M1StageSchema = z.enum([
  "init",
  "ia",
  "ia_gate",
  "design",
  "design_gate",
  "signoff",
  "done",
]);
export type M1Stage = z.infer<typeof M1StageSchema>;

export const M1StatusSchema = z.enum([
  "running",
  "awaiting_signoff",
  "success",
  "partial",
  "failed",
  "budget_exceeded",
  "usage_incomplete",
]);
export type M1Status = z.infer<typeof M1StatusSchema>;

export const AgentRunStatusSchema = z.enum([
  "pending",
  "running",
  "passed",
  "failed",
  "budget_exceeded",
  "usage_incomplete",
  "skipped",
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const AgentGateStatusSchema = z.enum([
  "pending",
  "passed",
  "failed",
  "waived",
]);
export type AgentGateStatus = z.infer<typeof AgentGateStatusSchema>;

export const AgentRunStateSchema = z
  .object({
    status: AgentRunStatusSchema,
    attempts: z.number().int().nonnegative(),
    repairAttempts: z.number().int().nonnegative(),
    gateRounds: z.number().int().nonnegative(),
    usage: AgentUsageSchema.optional(),
    usageComplete: z.boolean().optional(),
    costUsd: z.number().nonnegative().optional(),
    costCny: z.number().nonnegative().optional(),
    model: z.string().min(1).optional(),
    promptHash: z.string().min(1).optional(),
    error: z.string().min(1).optional(),
  })
  .strict();
export type AgentRunState = z.infer<typeof AgentRunStateSchema>;

export const M1RunStateSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    runId: z.string().min(1),
    project: z.string().min(1),
    stage: M1StageSchema,
    status: M1StatusSchema,
    agents: z
      .object({
        ia: AgentRunStateSchema,
        interaction: AgentRunStateSchema,
        "visual-style": AgentRunStateSchema,
      })
      .strict(),
    gates: z
      .object({
        ia: AgentGateStatusSchema,
        interaction: AgentGateStatusSchema,
        visualStyle: AgentGateStatusSchema,
      })
      .strict(),
    signoff: z
      .object({ ia: z.boolean(), visualStyle: z.boolean() })
      .strict(),
    usageComplete: z.boolean(),
    costCny: z.number().nonnegative(),
    degraded: z.boolean(),
    degradedReason: z.string().min(1).optional(),
    startedAt: z.string().min(1),
    updatedAt: z.string().min(1),
    finishedAt: z.string().min(1).optional(),
  })
  .strict();
export type M1RunState = z.infer<typeof M1RunStateSchema>;

export function emptyAgentRunState(): AgentRunState {
  return { status: "pending", attempts: 0, repairAttempts: 0, gateRounds: 0 };
}

export function createM1State(
  runId: string,
  project: string,
  now: string
): M1RunState {
  return {
    schemaVersion: "1.0",
    runId,
    project,
    stage: "init",
    status: "running",
    agents: {
      ia: emptyAgentRunState(),
      interaction: emptyAgentRunState(),
      "visual-style": emptyAgentRunState(),
    },
    gates: { ia: "pending", interaction: "pending", visualStyle: "pending" },
    signoff: { ia: false, visualStyle: false },
    usageComplete: true,
    costCny: 0,
    degraded: false,
    startedAt: now,
    updatedAt: now,
  };
}

/** Update one agent entry without dropping the others. */
export function withAgentState(
  state: M1RunState,
  role: "ia" | "interaction" | "visual-style",
  patch: Partial<AgentRunState>
): M1RunState {
  return {
    ...state,
    agents: { ...state.agents, [role]: { ...state.agents[role], ...patch } },
  };
}
