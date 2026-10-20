import { z } from "zod";

export const AssetKindSchema = z.enum(["icon", "illustration", "poster"]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const SourceIdSchema = z.enum([
  "library",
  "commission",
  "ai-vector",
  "ai-raster",
  "upload",
]);
export type SourceId = z.infer<typeof SourceIdSchema>;

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
export type AssetConstraints = z.infer<typeof AssetConstraintsSchema>;

/**
 * Asset brief shared by the M1 Visual Style Agent and the M0 asset review.
 * `visualRef`/`sourceHint` were added for M1; both are optional so existing
 * M0 briefs remain valid.
 */
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
    visualRef: z.string().min(1).optional(),
    sourceHint: z.string().min(1).optional(),
  })
  .strict();
export type AssetBrief = z.infer<typeof AssetBriefSchema>;
