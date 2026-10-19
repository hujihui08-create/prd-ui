import { z } from "zod";

export interface AssetEntry {
  id: string;
  kind: "icon" | "illustration" | "image";
  library?: string;
  style?: string;
  files: Array<{ path: string; scale?: number; format: string }>;
  license: string;
  hash?: string;
}

export interface AssetManifest {
  project: string;
  profile: string;
  assets: AssetEntry[];
  placeholders: string[];
  complete: boolean;
}

export const AssetManifestSchema = z
  .object({
    project: z.string().min(1),
    profile: z.string().min(1),
    assets: z.array(
      z
        .object({
          id: z.string().min(1),
          kind: z.enum(["icon", "illustration", "image"]),
          library: z.string().optional(),
          style: z.string().optional(),
          files: z.array(
            z.object({ path: z.string().min(1), scale: z.number().optional(), format: z.string().min(1) }).strict()
          ).min(1),
          license: z.string().min(1),
          hash: z.string().optional(),
        })
        .strict()
    ),
    placeholders: z.array(z.string()),
    complete: z.boolean(),
  })
  .strict();
