import { z } from "zod";
import type { ReqId } from "./ids.js";
import { PageIdSchema, type PageId } from "./page-id.js";

export type Target = "web" | "mobile";

export interface SpecNode {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  slots?: Record<string, SpecNode[]>;
  states?: string[];
  textRole?: string;
  assetRef?: string;
  reqRef?: ReqId;
  designDefault?: string;
  children?: SpecNode[];
}

const rawValuePattern = /(#[0-9a-fA-F]{3,8}\b)|\brgba?\(|\bhsla?\(|\b\d+(\.\d+)?(px|rem|em)\b/;

const ReqIdSchema = z.custom<ReqId>(
  (value) => typeof value === "string" && /^REQ-[A-Z0-9]+-\d+$/.test(value),
  "invalid requirement id"
);

const SpecNodeSchema: z.ZodType<SpecNode> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1).optional(),
      type: z.string().min(1),
      props: z.record(z.string(), z.unknown()).optional(),
      slots: z.record(z.string(), z.array(SpecNodeSchema)).optional(),
      states: z.array(z.string().min(1)).optional(),
      textRole: z.string().min(1).optional(),
      assetRef: z.string().min(1).optional(),
      reqRef: ReqIdSchema.optional(),
      designDefault: z.string().min(1).optional(),
      children: z.array(SpecNodeSchema).optional(),
    })
    .strict()
    .superRefine((node, ctx) => {
      if (JSON.stringify(node.props ?? {}).match(rawValuePattern)) {
        ctx.addIssue({ code: "custom", message: "raw color/size value is not allowed" });
      }
      if (node.props && ("style" in node.props || "className" in node.props)) {
        ctx.addIssue({ code: "custom", message: "style/className is not allowed" });
      }
      if (node.props && ("position" in node.props || "top" in node.props || "left" in node.props)) {
        ctx.addIssue({ code: "custom", message: "absolute positioning is not allowed" });
      }
    })
);

export interface PageState {
  name: string;
  description?: string;
  overrides?: Array<{ nodeId?: string; component?: string; state: string }>;
}

export interface Interaction {
  trigger: string;
  action: string;
  target?: string;
  reqRef?: ReqId;
}

export interface PageTraceability {
  reqMap: Record<string, string[]>;
  designDefaults: string[];
  unmapped: string[];
}

export interface PageSpec {
  meta: {
    pageId: PageId;
    project: string;
    name: string;
    target: Target;
    profile: string;
    archetype: string;
    reqRefs: ReqId[];
    version: string;
  };
  layout: SpecNode;
  states: Record<string, PageState>;
  interactions: Interaction[];
  traceability: PageTraceability;
}

export const PageSpecSchema: z.ZodType<PageSpec> = z
  .object({
    meta: z
      .object({
        pageId: PageIdSchema,
        project: z.string().min(1),
        name: z.string().min(1),
        target: z.enum(["web", "mobile"]),
        profile: z.string().min(1),
        archetype: z.string().min(1),
        reqRefs: z.array(ReqIdSchema).min(1),
        version: z.string().min(1),
      })
      .strict(),
    layout: SpecNodeSchema,
    states: z
      .record(
        z.string(),
        z
          .object({
            name: z.string().min(1),
            description: z.string().optional(),
            overrides: z
              .array(
                z
                  .object({
                    nodeId: z.string().optional(),
                    component: z.string().optional(),
                    state: z.string().min(1),
                  })
                  .strict()
              )
              .optional(),
          })
          .strict()
      )
      .refine((states) => "default" in states, { message: "default state is required" }),
    interactions: z.array(
      z
        .object({
          trigger: z.string().min(1),
          action: z.string().min(1),
          target: z.string().optional(),
          reqRef: ReqIdSchema.optional(),
        })
        .strict()
    ),
    traceability: z
      .object({
        reqMap: z.record(z.string(), z.array(z.string())),
        designDefaults: z.array(z.string()),
        unmapped: z.array(z.string()),
      })
      .strict(),
  })
  .strict();
