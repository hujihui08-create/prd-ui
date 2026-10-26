import { z } from "zod";

export interface ProjectStructureConfig {
  maxRepeatedSections?: number;
  pageHeightBudget?: { mobile?: number; web?: number };
}

export interface ProjectConfig {
  project: string;
  brief: string;
  /** Optional PRD text/summary consumed by the M1 IA Agent. */
  prd?: string;
  /** Optional project-level defaults for intake; pages may override them. */
  profile?: string;
  platforms?: Array<"web" | "mobile">;
  manifests: Record<string, string>;
  runsDir?: string;
  /** Optional structure-lint overrides; omitted keys use defaults. */
  structure?: ProjectStructureConfig;
}

/**
 * Project-level configuration file. Paths in `brief`, `manifests`, and
 * `runsDir` are resolved relative to the directory that contains the config.
 */
export const ProjectConfigSchema = z
  .object({
    project: z.string().min(1),
    brief: z.string().min(1),
    prd: z.string().min(1).optional(),
    profile: z.string().min(1).optional(),
    platforms: z.array(z.enum(["web", "mobile"])).min(1).optional(),
    manifests: z.record(z.string(), z.string().min(1)),
    runsDir: z.string().min(1).optional(),
    structure: z
      .object({
        maxRepeatedSections: z.number().int().positive().optional(),
        pageHeightBudget: z
          .object({
            mobile: z.number().int().positive().optional(),
            web: z.number().int().positive().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
