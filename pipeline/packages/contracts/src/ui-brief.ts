import { z } from "zod";

export interface UiBriefPage {
  id: string;
  name: string;
  purpose: string;
  archetype: string;
  target: "web" | "mobile";
  profile: string;
  route: string;
  roles: string[];
  requiredStates: string[];
  reqRefs: string[];
  fields?: string[];
  actions?: string[];
}

export interface UiBrief {
  meta: {
    project: string;
    version: string;
    sourcePrdHash: string;
    date: string;
    profile: string;
    platforms: Array<"web" | "mobile">;
  };
  product: {
    name: string;
    type: string;
    goals: string[];
    users: string[];
    roles: string[];
    scope: string[];
    nonGoals: string[];
    successMetrics: string[];
  };
  ia: {
    pages: UiBriefPage[];
    navigation: { primary: string[] };
    flows: Array<{ id: string; steps: string[] }>;
  };
  data: {
    entities: Array<{
      name: string;
      fields: Array<{ name: string; type: string; required?: boolean; enum?: string[] }>;
    }>;
  };
  assets: { icons: string[]; illustrations: string[]; images: string[] };
  designDirection: { profile: string; density: string; tone: string; motionLevel: string };
  openQuestions: Array<{ id: string; question: string; blocking: boolean }>;
  assumptions: Array<{ id: string; statement: string }>;
  traceability: { reqMap: Record<string, string[]>; unmapped: string[] };
}

export const UiBriefPageSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    purpose: z.string().min(1),
    archetype: z.string().min(1),
    target: z.enum(["web", "mobile"]),
    profile: z.string().min(1),
    route: z.string().min(1),
    roles: z.array(z.string()).min(1),
    requiredStates: z.array(z.string()).min(1),
    reqRefs: z.array(z.string().regex(/^REQ-[A-Z0-9]+-\d+$/)).min(1),
    fields: z.array(z.string()).optional(),
    actions: z.array(z.string()).optional(),
  })
  .strict();

export const UiBriefSchema = z
  .object({
    meta: z
      .object({
        project: z.string().min(1),
        version: z.string().min(1),
        sourcePrdHash: z.string().min(1),
        date: z.string().min(1),
        profile: z.string().min(1),
        platforms: z.array(z.enum(["web", "mobile"])).min(1),
      })
      .strict(),
    product: z
      .object({
        name: z.string().min(1),
        type: z.string().min(1),
        goals: z.array(z.string()),
        users: z.array(z.string()),
        roles: z.array(z.string()).min(1),
        scope: z.array(z.string()),
        nonGoals: z.array(z.string()),
        successMetrics: z.array(z.string()),
      })
      .strict(),
    ia: z
      .object({
        pages: z.array(UiBriefPageSchema).min(1),
        navigation: z.object({ primary: z.array(z.string()) }).strict(),
        flows: z.array(z.object({ id: z.string(), steps: z.array(z.string()) }).strict()),
      })
      .strict(),
    data: z
      .object({
        entities: z.array(
          z
            .object({
              name: z.string().min(1),
              fields: z.array(
                z
                  .object({
                    name: z.string().min(1),
                    type: z.string().min(1),
                    required: z.boolean().optional(),
                    enum: z.array(z.string()).optional(),
                  })
                  .strict()
              ),
            })
            .strict()
        ),
      })
      .strict(),
    assets: z
      .object({
        icons: z.array(z.string()),
        illustrations: z.array(z.string()),
        images: z.array(z.string()),
      })
      .strict(),
    designDirection: z
      .object({
        profile: z.string().min(1),
        density: z.string().min(1),
        tone: z.string().min(1),
        motionLevel: z.string().min(1),
      })
      .strict(),
    openQuestions: z.array(
      z.object({ id: z.string(), question: z.string(), blocking: z.boolean() }).strict()
    ),
    assumptions: z.array(z.object({ id: z.string(), statement: z.string() }).strict()),
    traceability: z
      .object({ reqMap: z.record(z.string(), z.array(z.string())), unmapped: z.array(z.string()) })
      .strict(),
  })
  .strict();
