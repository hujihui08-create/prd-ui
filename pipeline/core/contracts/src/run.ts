import { z } from "zod";

export type Stage = "intake" | "brief" | "compile" | "validate" | "report" | "done";
export type RunStatus = "pending" | "running" | "success" | "degraded" | "failed";
export type GateStatus = "pending" | "passed" | "failed" | "waived";

export interface RunState {
  runId: string;
  stage: Stage;
  status: RunStatus;
  attempts: Record<string, number>;
  degraded: boolean;
  gates: Record<string, GateStatus>;
  startedAt: string;
  updatedAt: string;
}

export const RunStateSchema = z
  .object({
    runId: z.string().min(1),
    stage: z.enum(["intake", "brief", "compile", "validate", "report", "done"]),
    status: z.enum(["pending", "running", "success", "degraded", "failed"]),
    attempts: z.record(z.string(), z.number().int().min(0)),
    degraded: z.boolean(),
    gates: z.record(z.string(), z.enum(["pending", "passed", "failed", "waived"])),
    startedAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
