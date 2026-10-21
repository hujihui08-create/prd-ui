import { z } from "zod";
import type {
  AgentArtifactStorePort,
  AgentRunnerPort,
  IntakeRole,
  SignoffAnswer,
  SignoffApproval,
} from "@prd-ui/agents";
import type {
  AgentUsage,
  BriefGate,
  IntakeGateIssue,
  PrdIaGate,
  PrdReviewOutput,
  ProjectConfig,
  ReviewPricing,
  UiBrief,
  UiBriefDraft,
} from "@prd-ui/contracts";

export const IntakeStageSchema = z.enum([
  "init",
  "intake",
  "review",
  "prd_ia_gate",
  "brief",
  "brief_gate",
  "done",
]);
export type IntakeStage = z.infer<typeof IntakeStageSchema>;

export const IntakeStatusSchema = z.enum([
  "running",
  "success",
  "awaiting_signoff",
  "blocked",
  "partial",
  "failed",
  "budget_exceeded",
  "usage_incomplete",
]);
export type IntakeStatus = z.infer<typeof IntakeStatusSchema>;

export const IntakeGateStateSchema = z.enum(["pending", "passed", "blocked"]);
export type IntakeGateState = z.infer<typeof IntakeGateStateSchema>;

export const IntakeStateSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    runId: z.string().min(1),
    project: z.string().min(1),
    prdHash: z.string().min(1),
    stage: IntakeStageSchema,
    status: IntakeStatusSchema,
    signoff: z
      .object({ prdIa: z.boolean(), brief: z.boolean() })
      .strict(),
    gates: z
      .object({
        prd: IntakeGateStateSchema,
        ia: IntakeGateStateSchema,
        brief: IntakeGateStateSchema,
      })
      .strict(),
    briefRounds: z.number().int().nonnegative(),
    briefHash: z.string().min(1).optional(),
    usageComplete: z.boolean(),
    costCny: z.number().nonnegative(),
    degraded: z.boolean(),
    degradedReason: z.string().min(1).optional(),
    error: z.string().min(1).optional(),
    startedAt: z.string().min(1),
    updatedAt: z.string().min(1),
    finishedAt: z.string().min(1).optional(),
  })
  .strict();
export type IntakeState = z.infer<typeof IntakeStateSchema>;

export interface IntakeClock {
  now(): Date;
}

export interface IntakeLogger {
  log(event: Record<string, unknown>): Promise<void>;
}

export interface BriefValidation {
  ok: boolean;
  errors: string[];
}

export interface BriefValidatorPort {
  validate(brief: UiBrief): BriefValidation;
}

export type IntakeAgentRole = IntakeRole | "ia";

export interface IntakePorts {
  store: AgentArtifactStorePort;
  clock: IntakeClock;
  log: IntakeLogger;
  validateBrief: BriefValidatorPort["validate"];
  hashText(text: string): string;
  supportedProfiles: string[];
  supportedArchetypes?: readonly string[];
}

export interface RunIntakeInput {
  runId: string;
  project: string;
  runDir: string;
  prdText: string;
  prdPath: string;
  prdHash: string;
  projectConfig: ProjectConfig;
  runners: {
    ia: AgentRunnerPort;
    "prd-review": AgentRunnerPort;
    "ui-briefer": AgentRunnerPort;
  };
  ports: IntakePorts;
  pricing?: ReviewPricing;
  maxCostCny?: number;
  agentMaxCostCny?: Partial<Record<IntakeAgentRole, number>>;
  allowUnknownCost?: boolean;
  signoffPrdIa?: string;
  signoffBrief?: string;
  existingBrief?: UiBrief;
  existingIa?: unknown;
  briefVersion?: string;
  maxAgentAttempts?: number;
  maxGateRounds?: number;
  /** Continue an existing run instead of starting from intake. */
  resume?: boolean;
}

export interface IntakeRunResult {
  runId: string;
  runDir: string;
  project: string;
  status: IntakeStatus;
  state: IntakeState;
  review?: PrdReviewOutput;
  draft?: UiBriefDraft;
  brief?: UiBrief;
  briefHash?: string;
  gate?: BriefGate;
  error?: string;
}

export interface IntakeSummary {
  runDir: string | null;
  runId: string | null;
  project: string | null;
  status: IntakeStatus | "failed";
  prd: {
    sourceHash: string;
    readiness: "ready" | "blocked" | "unknown";
    blockers: number;
    questions: number;
  };
  ia: { passed: boolean; blockers: number };
  brief: {
    passed: boolean;
    version: string | null;
    pages: number;
    hash: string | null;
    path: string | null;
  };
  signoff: { prdIa: boolean; brief: boolean };
  cost: { cny: number; usageComplete: boolean };
  error: string | null;
}

export interface IntakeAgentInvocation {
  output: unknown;
  usage?: AgentUsage;
  usageComplete: boolean;
  model: string;
  promptHash: string;
}

export interface IntakeSignoffViews {
  prdIa?: {
    present: boolean;
    valid: boolean;
    answers: SignoffAnswer[];
    approvals: SignoffApproval[];
  };
  brief?: {
    present: boolean;
    valid: boolean;
    briefHash?: string;
  };
}

export type { IntakeGateIssue };
