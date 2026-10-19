import { z } from "zod";

export type Availability = "available" | "code-only" | "figma-only" | "generated" | "missing";

export interface ComponentContract {
  id: string;
  library: string;
  source: "code" | "figma" | "baseline" | "generated";
  availability: Availability;
  category: string;
  props: Record<string, { type: string; required?: boolean; enum?: string[] }>;
  variants: string[];
  states: string[];
  slots?: Record<string, { allowed: string[] }>;
  mapping?: { code?: string; figma?: string };
  rules?: string[];
  version: string;
}

export interface Catalog {
  meta: { library: string; version: string };
  components: ComponentContract[];
}

export const ComponentContractSchema = z
  .object({
    id: z.string().min(1),
    library: z.string().min(1),
    source: z.enum(["code", "figma", "baseline", "generated"]),
    availability: z.enum(["available", "code-only", "figma-only", "generated", "missing"]),
    category: z.string().min(1),
    props: z.record(
      z.string(),
      z
        .object({
          type: z.string().min(1),
          required: z.boolean().optional(),
          enum: z.array(z.string()).optional(),
        })
        .strict()
    ),
    variants: z.array(z.string()),
    states: z.array(z.string()),
    slots: z.record(z.string(), z.object({ allowed: z.array(z.string()) }).strict()).optional(),
    mapping: z.object({ code: z.string().optional(), figma: z.string().optional() }).strict().optional(),
    rules: z.array(z.string()).optional(),
    version: z.string().min(1),
  })
  .strict();

export const CatalogSchema = z
  .object({
    meta: z.object({ library: z.string().min(1), version: z.string().min(1) }).strict(),
    components: z.array(ComponentContractSchema),
  })
  .strict();
