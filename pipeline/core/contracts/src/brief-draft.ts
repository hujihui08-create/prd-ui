import { z } from "zod";
import { PrdReadinessSchema } from "./prd-review.js";
import { UiBriefSchema } from "./ui-brief.js";

export const BriefQuestionSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1),
    options: z.array(z.string().min(1)).optional(),
    impact: z.string().min(1),
    owner: z.enum([
      "product_owner",
      "security_owner",
      "data_owner",
      "design_owner",
    ]),
    blocking: z.boolean(),
    sourceFindingId: z.string().min(1).optional(),
  })
  .strict();
export type BriefQuestion = z.infer<typeof BriefQuestionSchema>;

export const BriefAssumptionSchema = z
  .object({
    id: z.string().min(1),
    statement: z.string().min(1),
    source: z.string().min(1),
    confidence: z.number().min(0).max(1),
    blocking: z.boolean(),
    acceptedBy: z.string().min(1).optional(),
  })
  .strict();
export type BriefAssumption = z.infer<typeof BriefAssumptionSchema>;

export const UiBriefDraftSchema = z
  .object({
    brief: UiBriefSchema,
    questions: z.array(BriefQuestionSchema),
    assumptions: z.array(BriefAssumptionSchema),
    reviewMarkdown: z.string().min(1),
  })
  .strict();
export type UiBriefDraft = z.infer<typeof UiBriefDraftSchema>;

export const IntakeGateIssueSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["blocker", "warning"]),
    message: z.string().min(1),
    evidence: z.string().min(1).optional(),
  })
  .strict();
export type IntakeGateIssue = z.infer<typeof IntakeGateIssueSchema>;

export const IntakeGateStatusSchema = z.enum([
  "passed",
  "awaiting_signoff",
  "blocked",
]);
export type IntakeGateStatus = z.infer<typeof IntakeGateStatusSchema>;

export const PrdIaGateSchema = z
  .object({
    passed: z.boolean(),
    status: IntakeGateStatusSchema,
    signoff: z
      .object({
        required: z.literal(true),
        valid: z.boolean(),
        missing: z.array(z.string()),
      })
      .strict(),
    issues: z.array(IntakeGateIssueSchema),
    readiness: PrdReadinessSchema,
    ia: z
      .object({
        passed: z.boolean(),
        issues: z.array(IntakeGateIssueSchema),
      })
      .strict(),
  })
  .strict();
export type PrdIaGate = z.infer<typeof PrdIaGateSchema>;

export const BriefGateSchema = z
  .object({
    passed: z.boolean(),
    status: IntakeGateStatusSchema,
    signoff: z.object({ valid: z.boolean() }).strict(),
    issues: z.array(IntakeGateIssueSchema),
    compile: z
      .object({
        ok: z.boolean(),
        errors: z.array(z.string()),
      })
      .strict(),
    briefHash: z.string().min(1).optional(),
  })
  .strict();
export type BriefGate = z.infer<typeof BriefGateSchema>;
