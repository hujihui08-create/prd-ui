import { z } from "zod";

/** A normalized PRD is the deterministic intake artifact. */
export const NormalizedPrdSectionSchema = z
  .object({
    id: z.string().min(1),
    heading: z.string().min(1),
    level: z.number().int().min(1).max(6),
    lineStart: z.number().int().nonnegative(),
    lineEnd: z.number().int().nonnegative(),
    text: z.string(),
  })
  .strict();
export type NormalizedPrdSection = z.infer<typeof NormalizedPrdSectionSchema>;

export const NormalizedPrdPlaceholderSchema = z
  .object({
    kind: z.enum(["bracket", "tbd", "todo", "empty-section", "ellipsis"]),
    location: z.string().min(1),
    text: z.string().min(1),
    /** False when the PRD explicitly marks the item as non-blocking. */
    blocking: z.boolean().optional(),
  })
  .strict();
export type NormalizedPrdPlaceholder = z.infer<
  typeof NormalizedPrdPlaceholderSchema
>;

export const NormalizedPrdTableSchema = z
  .object({
    id: z.string().min(1),
    sectionId: z.string().min(1),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    lineStart: z.number().int().nonnegative(),
  })
  .strict();
export type NormalizedPrdTable = z.infer<typeof NormalizedPrdTableSchema>;

export const NormalizedPrdTermSchema = z
  .object({
    term: z.string().min(1),
    count: z.number().int().nonnegative(),
    variants: z.array(z.string()),
  })
  .strict();
export type NormalizedPrdTerm = z.infer<typeof NormalizedPrdTermSchema>;

export const NormalizedPrdSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    project: z.string().min(1),
    sourcePath: z.string().min(1),
    sourceHash: z.string().min(1),
    title: z.string().min(1),
    sections: z.array(NormalizedPrdSectionSchema).min(1),
    placeholders: z.array(NormalizedPrdPlaceholderSchema),
    tables: z.array(NormalizedPrdTableSchema),
    terms: z.array(NormalizedPrdTermSchema),
    generatedAt: z.string().min(1),
  })
  .strict();
export type NormalizedPrd = z.infer<typeof NormalizedPrdSchema>;

export const PrdSeveritySchema = z.enum(["blocker", "major", "minor", "question"]);
export type PrdSeverity = z.infer<typeof PrdSeveritySchema>;

export const PrdCategorySchema = z.enum([
  "scope",
  "roles",
  "ia",
  "states",
  "fields",
  "flows",
  "terminology",
  "acceptance",
  "format",
]);
export type PrdCategory = z.infer<typeof PrdCategorySchema>;

export const PrdOwnerSchema = z.enum([
  "product_owner",
  "security_owner",
  "data_owner",
  "design_owner",
]);
export type PrdOwner = z.infer<typeof PrdOwnerSchema>;

export const PrdFindingSchema = z
  .object({
    id: z.string().min(1),
    ruleId: z.string().min(1),
    severity: PrdSeveritySchema,
    category: PrdCategorySchema,
    location: z.string().min(1),
    evidence: z.string().min(1),
    issue: z.string().min(1),
    suggestedQuestion: z.string().min(1).optional(),
    blocking: z.boolean().optional(),
    owner: PrdOwnerSchema,
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type PrdFinding = z.infer<typeof PrdFindingSchema>;

export const PrdExtractPageSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, "page id must be kebab-case"),
    name: z.string().min(1),
    purpose: z.string().min(1).optional(),
    route: z.string().min(1).optional(),
    target: z.enum(["web", "mobile"]).optional(),
    profile: z.string().min(1).optional(),
    roles: z.array(z.string().min(1)),
    requiredStates: z.array(z.string().min(1)).optional(),
    sourceLocation: z.string().min(1),
  })
  .strict();
export type PrdExtractPage = z.infer<typeof PrdExtractPageSchema>;

export const PrdExtractSchema = z
  .object({
    pages: z.array(PrdExtractPageSchema).min(1),
    roles: z.array(
      z
        .object({
          id: z.string().min(1),
          description: z.string().min(1).optional(),
          sourceLocation: z.string().min(1),
        })
        .strict()
    ),
    flows: z.array(
      z
        .object({
          id: z.string().min(1),
          steps: z.array(z.string().min(1)).min(1),
          sourceLocation: z.string().min(1),
        })
        .strict()
    ),
    entities: z.array(
      z
        .object({
          name: z.string().min(1),
          fields: z.array(
            z
              .object({
                name: z.string().min(1),
                type: z.string().min(1).optional(),
                sourceLocation: z.string().min(1),
              })
              .strict()
          ),
          sourceLocation: z.string().min(1),
        })
        .strict()
    ),
    acceptanceExamples: z.array(
      z
        .object({
          pageId: z.string().min(1).optional(),
          text: z.string().min(1),
          sourceLocation: z.string().min(1),
        })
        .strict()
    ),
  })
  .strict();
export type PrdExtract = z.infer<typeof PrdExtractSchema>;

export const PrdReadinessSchema = z
  .object({
    status: z.enum(["ready", "blocked"]),
    blockers: z.number().int().nonnegative(),
    majors: z.number().int().nonnegative(),
    questions: z.number().int().nonnegative(),
    summary: z.string().min(1),
  })
  .strict();
export type PrdReadiness = z.infer<typeof PrdReadinessSchema>;

export const PrdReviewOutputSchema = z
  .object({
    findings: z.array(PrdFindingSchema),
    readiness: PrdReadinessSchema,
    extract: PrdExtractSchema,
    reviewMarkdown: z.string().min(1).optional(),
  })
  .strict();
export type PrdReviewOutput = z.infer<typeof PrdReviewOutputSchema>;
