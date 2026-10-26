import { z } from "zod";
import type { AgentUsage } from "@prd-ui/contracts";

export const AgentRoleSchema = z.enum(["ia", "interaction", "visual-style"]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const AGENT_ROLES: readonly AgentRole[] = ["ia", "interaction", "visual-style"];

/** Phase 2 front-half roles; they reuse the same runner transport. */
export const IntakeRoleSchema = z.enum(["prd-review", "ui-briefer"]);
export type IntakeRole = z.infer<typeof IntakeRoleSchema>;

export const INTAKE_ROLES: readonly IntakeRole[] = ["prd-review", "ui-briefer"];

export const AgentTaskRoleSchema = z.enum([
  "ia",
  "interaction",
  "visual-style",
  "prd-review",
  "ui-briefer",
  "visual-critic",
  "block-content",
]);
export type AgentTaskRole = z.infer<typeof AgentTaskRoleSchema>;

export type AgentValidation =
  | { success: true; data: unknown }
  | { success: false; error: string };

/**
 * One agent call. Core owns the prompt and the output schema; the runtime
 * adapter owns transport, JSON extraction, one schema repair, and evidence.
 */
export interface AgentTask {
  role: AgentTaskRole;
  prompt: string;
  /** JSON Schema (or Zod schema) describing the expected output. */
  schema: unknown;
  /** Core's validator; the runner uses it before and after a repair. */
  validate: (value: unknown) => AgentValidation;
  runDir: string;
  inputFiles: string[];
  timeoutMs?: number;
  maxCostCny?: number;
  /**
   * Core supplies this when a cost budget is active. A runner that can retry
   * internally must skip the repair when the callback returns false.
   */
  canRepair?: (firstUsage: AgentUsage | undefined) => boolean;
}

export interface AgentAttemptEvidence {
  attempt: number;
  schemaRepair: boolean;
  raw: string;
  stdout?: string;
  stderr?: string;
  usage?: AgentUsage;
  usageComplete: boolean;
  error?: string;
}

export interface AgentResult {
  output: unknown;
  usage?: AgentUsage;
  usageComplete?: boolean;
  raw?: string;
  ignoredKeys?: string[];
  repairAttempted?: boolean;
  stdout?: string;
  stderr?: string;
  attempts?: AgentAttemptEvidence[];
  model?: string;
}

export interface AgentRunnerPort {
  readonly name: string;
  readonly model: string;
  run(task: AgentTask): Promise<AgentResult>;
}

/**
 * Paths are relative to the run directory. The runtime adapter owns the
 * filesystem; core only reads/writes through this port.
 */
export interface AgentArtifactStorePort {
  writeJson(path: string, value: unknown): Promise<void>;
  writeText(path: string, value: string): Promise<void>;
  appendText(path: string, value: string): Promise<void>;
  readText(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  hash(path: string): Promise<string>;
}

export type AgentErrorCode =
  | "AGENT_TIMEOUT"
  | "AGENT_UNAVAILABLE"
  | "AGENT_EXIT_NONZERO"
  | "AGENT_INVALID_OUTPUT";

export interface AgentRunnerErrorOptions {
  cause?: unknown;
  usage?: AgentUsage;
  usageComplete?: boolean;
  raw?: string;
  stdout?: string;
  stderr?: string;
  attempts?: AgentAttemptEvidence[];
}

export class AgentRunnerError extends Error {
  readonly code: AgentErrorCode;
  readonly usage?: AgentUsage;
  readonly usageComplete?: boolean;
  readonly raw?: string;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly attempts?: AgentAttemptEvidence[];

  constructor(
    code: AgentErrorCode,
    message: string,
    options: AgentRunnerErrorOptions = {}
  ) {
    super(message);
    this.name = "AgentRunnerError";
    this.code = code;
    if (options.cause !== undefined) this.cause = options.cause;
    if (options.usage !== undefined) this.usage = options.usage;
    if (options.usageComplete !== undefined) this.usageComplete = options.usageComplete;
    if (options.raw !== undefined) this.raw = options.raw;
    if (options.stdout !== undefined) this.stdout = options.stdout;
    if (options.stderr !== undefined) this.stderr = options.stderr;
    if (options.attempts !== undefined) this.attempts = options.attempts;
  }
}

/** Every M1 artifact starts with these fields. */
export const ArtifactEnvelopeSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    project: z.string().min(1),
    generatedAt: z.string().min(1),
    model: z.string().min(1),
    promptHash: z.string().min(1),
    degraded: z.boolean().optional(),
    degradedReason: z.string().min(1).optional(),
  })
  .strict();
export type ArtifactEnvelope = z.infer<typeof ArtifactEnvelopeSchema>;

export const GateIssueSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["blocker", "warning"]),
    message: z.string().min(1),
    evidence: z.string().min(1).optional(),
  })
  .strict();
export type GateIssue = z.infer<typeof GateIssueSchema>;

export const GateResultSchema = z
  .object({
    passed: z.boolean(),
    status: z.enum(["passed", "failed", "waived"]),
    issues: z.array(GateIssueSchema),
    waivedFindings: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type GateResult = z.infer<typeof GateResultSchema>;

/**
 * Append deterministic gate feedback to the original prompt. The agent gets
 * the same inputs plus the exact issues; a schema repair only fixes format.
 */
export function buildGateRepairPrompt(prompt: string, issues: GateIssue[]): string {
  return [
    prompt,
    "",
    "## Gate feedback",
    "Your previous output failed the deterministic gate. Fix only these issues and return the complete JSON again:",
    ...issues.map((issue) => `- ${issue.code}: ${issue.message}`),
    "",
    "Do not change scope, do not add commentary, and do not omit required keys.",
  ].join("\n");
}
