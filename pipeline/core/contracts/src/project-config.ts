import { z } from "zod";

export interface ProjectConfig {
  project: string;
  brief: string;
  /** Optional PRD text/summary consumed by the M1 IA Agent. */
  prd?: string;
  manifests: Record<string, string>;
  runsDir?: string;
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
    manifests: z.record(z.string(), z.string().min(1)),
    runsDir: z.string().min(1).optional(),
  })
  .strict();
