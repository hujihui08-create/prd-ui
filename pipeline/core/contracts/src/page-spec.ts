import { z } from "zod";
import type { ReqId } from "./ids.js";
import { PageIdSchema, type PageId } from "./page-id.js";

export type Target = "web" | "mobile";

export interface SpecNode {
  id?: string;
  /** Shared semantic group for repeated rows; motion targets resolve to it. */
  motionGroup?: string;
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

const PageMotionPresetSchema = z
  .object({
    durationMs: z.number().int().positive(),
    easing: z.string().min(1),
    staggerMs: z.number().int().nonnegative().optional(),
    distance: z.string().min(1).optional(),
  })
  .strict();

const PageMotionSchema = z
  .object({
    presets: z.record(z.string().min(1), PageMotionPresetSchema),
    bindings: z.array(
      z
        .object({
          nodeId: z.string().min(1).optional(),
          preset: z.string().min(1),
        })
        .strict()
    ),
    reducedMotion: z
      .object({ fallback: z.enum(["none", "fade", "instant"]) })
      .strict(),
  })
  .strict();

const SpecNodeSchema: z.ZodType<SpecNode> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1).optional(),
      motionGroup: z.string().min(1).optional(),
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
  /** M1 interaction trigger node id, carried for replay/location. */
  nodeId?: string;
}

export interface PageMotionPreset {
  durationMs: number;
  easing: string;
  staggerMs?: number;
  distance?: string;
}

export interface PageMotion {
  presets: Record<string, PageMotionPreset>;
  bindings: Array<{ nodeId?: string; preset: string }>;
  reducedMotion: { fallback: "none" | "fade" | "instant" };
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
    purpose: string;
    route: string;
    roles: string[];
    reqRefs: ReqId[];
    version: string;
  };
  layout: SpecNode;
  states: Record<string, PageState>;
  interactions: Interaction[];
  /** Optional; carried for Phase 2 renderer/Figma consumers. */
  motion?: PageMotion;
  /** Allowed actions per business status, carried from the signed brief. */
  businessStates?: Array<{ name: string; actions: string[]; note?: string }>;
  /** New/reschedule modes for mobile form pages. */
  formModes?: Array<{
    name: "new" | "reschedule";
    label: string;
    actions: string[];
    customerLocked?: boolean;
  }>;
  views?: Array<"calendar" | "list">;
  defaultView?: "calendar" | "list";
  searchIdleTitle?: string;
  /** Form page a customer-search page returns to after a picker selection. */
  pickerReturnTo?: PageId;
  /** Customer-search page a mobile form opens as a picker. */
  customerPicker?: PageId;
  /** ISO date (YYYY-MM-DD) for the Monday that starts the calendar week. */
  calendarWeekStart?: string;
  currentStatus?: string;
  referenceId?: string;
  linkedRoutes?: {
    create?: string;
    detail?: string;
    customer?: string;
    notice?: string;
    form?: string;
  };
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
        purpose: z.string().min(1),
        route: z.string().min(1),
        roles: z.array(z.string().min(1)).min(1),
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
          nodeId: z.string().min(1).optional(),
        })
        .strict()
    ),
    motion: PageMotionSchema.optional(),
    businessStates: z
      .array(
        z
          .object({
            name: z.string().min(1),
            actions: z.array(z.string().min(1)),
            note: z.string().min(1).optional(),
          })
          .strict()
      )
      .optional(),
    formModes: z
      .array(
        z
          .object({
            name: z.enum(["new", "reschedule"]),
            label: z.string().min(1),
            actions: z.array(z.string().min(1)),
            customerLocked: z.boolean().optional(),
          })
          .strict()
      )
      .optional(),
    views: z.array(z.enum(["calendar", "list"])).optional(),
    defaultView: z.enum(["calendar", "list"]).optional(),
    searchIdleTitle: z.string().min(1).optional(),
    pickerReturnTo: PageIdSchema.optional(),
    customerPicker: PageIdSchema.optional(),
    calendarWeekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    currentStatus: z.string().min(1).optional(),
    referenceId: z.string().min(1).optional(),
    linkedRoutes: z
      .object({
        create: z.string().min(1).optional(),
        detail: z.string().min(1).optional(),
        customer: z.string().min(1).optional(),
        notice: z.string().min(1).optional(),
        form: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    traceability: z
      .object({
        reqMap: z.record(z.string(), z.array(z.string())),
        designDefaults: z.array(z.string()),
        unmapped: z.array(z.string()),
      })
      .strict(),
  })
  .strict();
