import { z } from "zod";
import { PageIdSchema, type PageId } from "./page-id.js";
import {
  ActionIdSchema,
  ActionRefSchema,
  type ActionId,
  type ActionRef,
} from "./action.js";

export interface UiBriefPageContent {
  storeName?: string;
  hasMessage?: boolean;
  quickActions?: Array<{ label: string; icon: string; tone?: "neutral" | "customer" | "inventory" }>;
  appointments?: Array<{
    customer: string;
    item: string;
    time: string;
    status: string;
    statusTone?: string;
  }>;
  callbacks?: Array<{ customer: string; item: string; daysAgo: string }>;
  appointmentsEmptyTitle?: string;
  callbacksEmptyTitle?: string;
  inventorySummary?: string;
  inventoryEmptyTitle?: string;
  products?: Array<{
    name: string;
    spec?: string;
    badge?: string;
    badgeTone?: string;
    attributes?: Array<{ label: string; value: string }>;
    currentStock?: string;
    availableStock?: string;
    inTransit?: string;
  }>;
}

export interface UiBriefMockData {
  /** Read-only field values for detail pages. */
  values?: Record<string, string>;
  /** Rows for list/detail tables; keys are the page's field names. */
  rows?: Array<Record<string, string>>;
  /** Rows for the overview "recent data" list. */
  listItems?: string[];
}

export interface UiBriefPage {
  id: PageId;
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
  /** Display labels keyed by field id; defaults to the field id. */
  fieldLabels?: Record<string, string>;
  actions?: ActionRef[];
  /** Overflow trigger label; defaults to 更多 when overflow actions exist. */
  overflowLabel?: string;
  filterFields?: string[];
  emptyTitle?: string;
  emptyAssetRef?: string;
  summaryTitle?: string;
  /** Per-project notice blocks for treatment/handoff detail pages. */
  noticeBlocks?: Array<{ title: string; items: string[] }>;
  /** Allowed actions per business status; ids must be a subset of `actions`. */
  businessStates?: Array<{ name: string; actions: ActionId[]; note?: string }>;
  /** New/reschedule modes for mobile form pages. */
  formModes?: Array<{
    name: "new" | "reschedule";
    label: string;
    actions: ActionId[];
    /** Display labels parallel to `actions`; keeps copy out of the id. */
    actionLabels?: string[];
    customerLocked?: boolean;
  }>;
  /** Calendar/list views for two-dimensional mobile list pages. */
  views?: Array<"calendar" | "list">;
  defaultView?: "calendar" | "list";
  /** Idle hint shown before a customer keyword is entered. */
  searchIdleTitle?: string;
  /** Form page a customer-search page returns to after a picker selection. */
  pickerReturnTo?: PageId;
  /** Customer-search page a mobile form opens as a picker. */
  customerPicker?: PageId;
  /** ISO date (YYYY-MM-DD) for the Monday that starts the calendar week. */
  calendarWeekStart?: string;
  feedItems?: Array<{ title: string; body: string }>;
  stats?: Array<{ label: string; value: string }>;
  mockData?: UiBriefMockData;
  content?: UiBriefPageContent;
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
    navigation: { primary: string[]; tabs?: string[] };
    flows: Array<{ id: string; steps: string[] }>;
    /** Optional role -> page id landing rule, used by the M1 IA review. */
    landingByRole?: Record<string, string>;
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

export const UiBriefPageContentSchema = z
  .object({
    storeName: z.string().min(1).optional(),
    hasMessage: z.boolean().optional(),
    quickActions: z
      .array(
        z
          .object({
            label: z.string().min(1),
            icon: z.string().min(1),
            tone: z.enum(["neutral", "customer", "inventory"]).optional(),
          })
          .strict()
      )
      .optional(),
    appointments: z
      .array(
        z
          .object({
            customer: z.string().min(1),
            item: z.string().min(1),
            time: z.string().min(1),
            status: z.string().min(1),
            statusTone: z.string().min(1).optional(),
          })
          .strict()
      )
      .optional(),
    callbacks: z
      .array(
        z
          .object({
            customer: z.string().min(1),
            item: z.string().min(1),
            daysAgo: z.string().min(1),
          })
          .strict()
      )
      .optional(),
    appointmentsEmptyTitle: z.string().min(1).optional(),
    callbacksEmptyTitle: z.string().min(1).optional(),
    inventorySummary: z.string().min(1).optional(),
    inventoryEmptyTitle: z.string().min(1).optional(),
    products: z
      .array(
        z
          .object({
            name: z.string().min(1),
            spec: z.string().min(1).optional(),
            badge: z.string().min(1).optional(),
            badgeTone: z.string().min(1).optional(),
            attributes: z
              .array(
                z.object({ label: z.string().min(1), value: z.string().min(1) }).strict()
              )
              .optional(),
            currentStock: z.string().min(1).optional(),
            availableStock: z.string().min(1).optional(),
            inTransit: z.string().min(1).optional(),
          })
          .strict()
      )
      .optional(),
  })
  .strict();

export const UiBriefMockDataSchema = z
  .object({
    values: z.record(z.string().min(1), z.string()).optional(),
    rows: z
      .array(z.record(z.string().min(1), z.string()))
      .optional(),
    listItems: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const UiBriefPageSchema = z
  .object({
    id: PageIdSchema,
    name: z.string().min(1),
    purpose: z.string().min(1),
    archetype: z.string().min(1),
    target: z.enum(["web", "mobile"]),
    profile: z.string().min(1),
    route: z.string().min(1),
    roles: z.array(z.string().min(1)).min(1),
    requiredStates: z.array(z.string().min(1)).min(1),
    reqRefs: z.array(z.string().regex(/^REQ-[A-Z0-9]+-\d+$/)).min(1),
    fields: z.array(z.string().min(1)).optional(),
    fieldLabels: z.record(z.string().min(1), z.string().min(1)).optional(),
    actions: z.array(ActionRefSchema).optional(),
    overflowLabel: z.string().min(1).optional(),
    filterFields: z.array(z.string().min(1)).optional(),
    emptyTitle: z.string().min(1).optional(),
    emptyAssetRef: z.string().min(1).optional(),
    summaryTitle: z.string().min(1).optional(),
    noticeBlocks: z
      .array(
        z
          .object({
            title: z.string().min(1),
            items: z.array(z.string().min(1)).min(1),
          })
          .strict()
      )
      .optional(),
    businessStates: z
      .array(
        z
          .object({
            name: z.string().min(1),
            actions: z.array(ActionIdSchema),
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
            actions: z.array(ActionIdSchema),
            actionLabels: z.array(z.string().min(1)).optional(),
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
    feedItems: z
      .array(z.object({ title: z.string().min(1), body: z.string().min(1) }).strict())
      .optional(),
    stats: z
      .array(z.object({ label: z.string().min(1), value: z.string().min(1) }).strict())
      .optional(),
    mockData: UiBriefMockDataSchema.optional(),
    content: UiBriefPageContentSchema.optional(),
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
        roles: z.array(z.string().min(1)).min(1),
        scope: z.array(z.string()),
        nonGoals: z.array(z.string()),
        successMetrics: z.array(z.string()),
      })
      .strict(),
    ia: z
      .object({
        pages: z.array(UiBriefPageSchema).min(1),
        navigation: z
          .object({
            primary: z.array(z.string().min(1)),
            tabs: z.array(z.string().min(1)).optional(),
          })
          .strict(),
        flows: z.array(z.object({ id: z.string(), steps: z.array(z.string()) }).strict()),
        landingByRole: z
          .record(z.string().min(1), z.string().min(1))
          .optional(),
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
  .strict()
  .superRefine((brief, ctx) => {
    const seen = new Set<string>();
    brief.ia.pages.forEach((page, index) => {
      if (seen.has(page.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["ia", "pages", index, "id"],
          message: `duplicate page id "${page.id}"`,
        });
      }
      seen.add(page.id);
    });
  });
