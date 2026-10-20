import { z } from "zod";

/** Style pack passed to the reviewer; unknown keys are configuration errors. */
export const VisualStyleSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    palette: z.array(z.string()).optional(),
    illustration: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

export type VisualStyle = z.infer<typeof VisualStyleSchema>;
