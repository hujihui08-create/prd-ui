import { z } from "zod";

export const AssetKindSchema = z.enum(["icon", "illustration", "poster"]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const SourceTierSchema = z.enum(["A", "B", "C"]);
export type SourceTier = z.infer<typeof SourceTierSchema>;

export const SourceIdSchema = z.enum([
  "library",
  "commission",
  "ai-vector",
  "ai-raster",
  "upload",
]);
export type SourceId = z.infer<typeof SourceIdSchema>;

const ScoreSchema = z.number().int().min(1).max(5);

export const AssetConstraintsSchema = z
  .object({
    grid: z.union([z.literal(16), z.literal(20), z.literal(24)]).optional(),
    strokeWidth: z.number().positive().optional(),
    currentColor: z.boolean().optional(),
    noText: z.boolean().optional(),
    noLogo: z.boolean().optional(),
    noScreenshot: z.boolean().optional(),
    safeArea: z.number().nonnegative().optional(),
    palette: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const AssetBriefSchema = z
  .object({
    id: z.string().min(1),
    kind: AssetKindSchema,
    scene: z.string().min(1),
    styleRef: z.string().min(1),
    size: z
      .object({
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .strict(),
    format: z.enum(["svg", "png", "jpg"]),
    constraints: AssetConstraintsSchema.default({}),
    sourceChain: z.array(SourceIdSchema).min(1),
    brandCritical: z.boolean().optional(),
    humanSignoffRequired: z.boolean().optional(),
  })
  .strict();
export type AssetBrief = z.infer<typeof AssetBriefSchema>;

export const AssetCandidateSchema = z
  .object({
    assetId: z.string().min(1),
    source: SourceIdSchema,
    sourceTier: SourceTierSchema,
    attempt: z.number().int().min(1).max(3),
    file: z
      .object({
        path: z.string().min(1),
        format: z.string().min(1),
        hash: z.string().min(1),
      })
      .strict(),
    producer: z
      .object({
        tool: z.string().min(1),
        model: z.string().min(1).optional(),
        prompt: z.string().optional(),
        seed: z.number().int().optional(),
        references: z.array(z.string()).optional(),
      })
      .strict(),
    license: z.string().min(1),
    costUsd: z.number().nonnegative().optional(),
    producedAt: z.string().min(1),
  })
  .strict();
export type AssetCandidate = z.infer<typeof AssetCandidateSchema>;

export const HardGateIssueSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["blocker", "warning"]),
    message: z.string().min(1),
    evidence: z.string().optional(),
  })
  .strict();
export type HardGateIssue = z.infer<typeof HardGateIssueSchema>;

export const HardGateResultSchema = z
  .object({
    passed: z.boolean(),
    issues: z.array(HardGateIssueSchema),
  })
  .strict();
export type HardGateResult = z.infer<typeof HardGateResultSchema>;

export const BatchGateResultSchema = z
  .object({
    iconSet: HardGateResultSchema.optional(),
    illustrationSet: HardGateResultSchema.optional(),
    skipped: z.boolean().optional(),
    reason: z.literal("PARTIAL_REVIEW").optional(),
    scope: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type BatchGateResult = z.infer<typeof BatchGateResultSchema>;

/**
 * Reviewer output. Unknown annotation keys are stripped rather than rejected:
 * models sometimes add a `reason_note`; that is harmless, while a missing or
 * invalid required field still fails. Threshold enforcement happens in
 * `validateVerdict`.
 */
export const AssetReviewVerdictSchema = z.object({
  verdict: z.enum(["pass", "retry", "fallback"]),
  hardIssues: z.array(z.string()),
  scores: z
    .object({
      brandFit: ScoreSchema,
      semantics: ScoreSchema,
      consistency: ScoreSchema,
      editability: ScoreSchema,
      composition: ScoreSchema,
    })
    .strict(),
  suggestedChanges: z.array(z.string()),
  reason: z.string().min(1),
});
export type AssetReviewVerdict = z.infer<typeof AssetReviewVerdictSchema>;

export const AttemptStatusSchema = z.enum([
  "passed",
  "retry",
  "fallback",
  "gate_failed",
  "normalize_failed",
  "reviewer_error",
  "budget_exceeded",
]);
export type AttemptStatus = z.infer<typeof AttemptStatusSchema>;

export const AssetAttemptSchema = z
  .object({
    assetId: z.string().min(1),
    source: SourceIdSchema,
    sourceTier: SourceTierSchema,
    attempt: z.number().int().min(1),
    status: AttemptStatusSchema,
    candidate: AssetCandidateSchema.optional(),
    gate: HardGateResultSchema.optional(),
    review: AssetReviewVerdictSchema.optional(),
    issues: z.array(z.string()),
    costUsd: z.number().nonnegative().optional(),
    timestamp: z.string().min(1),
  })
  .strict();
export type AssetAttempt = z.infer<typeof AssetAttemptSchema>;

export const FrozenFileSchema = z
  .object({
    path: z.string().min(1),
    format: z.string().min(1),
    hash: z.string().min(1),
  })
  .strict();
export type FrozenFile = z.infer<typeof FrozenFileSchema>;

export const AssetReviewRecordSchema = z
  .object({
    assetId: z.string().min(1),
    brief: AssetBriefSchema,
    status: z.enum(["passed", "unresolved"]),
    sourceTier: SourceTierSchema.optional(),
    source: SourceIdSchema.optional(),
    attempts: z.array(AssetAttemptSchema),
    fallbackFrom: SourceTierSchema.optional(),
    fallbackReason: z.string().optional(),
    degraded: z.boolean(),
    degradedReason: z.string().optional(),
    frozen: FrozenFileSchema.optional(),
    review: z
      .object({
        agent: z.string().min(1),
        human: z.string().optional(),
        status: z.enum(["approved", "pending", "not-required"]),
      })
      .strict()
      .optional(),
    license: z.string().optional(),
    files: z.array(z.object({ path: z.string(), format: z.string() }).strict()).optional(),
  })
  .strict();
export type AssetReviewRecord = z.infer<typeof AssetReviewRecordSchema>;

export const AssetReviewSummarySchema = z
  .object({
    total: z.number().int().min(0),
    passed: z.number().int().min(0),
    retried: z.number().int().min(0),
    unresolved: z.number().int().min(0),
    degraded: z.number().int().min(0),
    reviewerErrors: z.number().int().min(0).default(0),
  })
  .strict();
export type AssetReviewSummary = z.infer<typeof AssetReviewSummarySchema>;

export const AssetReviewRunSchema = z
  .object({
    runId: z.string().min(1),
    runDir: z.string().min(1),
    project: z.string().min(1),
    profile: z.string().min(1),
    startedAt: z.string().min(1),
    finishedAt: z.string().min(1),
    assets: z.array(AssetReviewRecordSchema),
    summary: AssetReviewSummarySchema,
    batchGates: BatchGateResultSchema.optional(),
    passed: z.boolean(),
    error: z.string().optional(),
  })
  .strict();
export type AssetReviewRun = z.infer<typeof AssetReviewRunSchema>;

export const SourcePolicySchema = z
  .object({
    chains: z
      .object({
        icon: z.array(SourceIdSchema).min(1),
        illustration: z.array(SourceIdSchema).min(1),
        poster: z.array(SourceIdSchema).min(1),
      })
      .strict(),
    maxAttemptsPerSource: z.number().int().min(1).max(3),
    maxAttemptsPerAsset: z.number().int().min(1).max(9),
    maxCostUsd: z.number().nonnegative(),
    maxMinutes: z.number().positive(),
  })
  .strict();
export type SourcePolicy = z.infer<typeof SourcePolicySchema>;

export const DEFAULT_SOURCE_POLICY: SourcePolicy = {
  chains: {
    icon: ["library", "commission", "ai-vector"],
    illustration: ["library", "ai-vector", "commission"],
    poster: ["ai-raster", "commission"],
  },
  maxAttemptsPerSource: 3,
  maxAttemptsPerAsset: 9,
  maxCostUsd: 1,
  maxMinutes: 30,
};

export const SourceTierBySource: Record<SourceId, SourceTier> = {
  library: "A",
  commission: "C",
  "ai-vector": "B",
  "ai-raster": "B",
  upload: "C",
};
