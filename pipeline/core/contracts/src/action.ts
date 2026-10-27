import { z } from "zod";

/** Namespaced ASCII id: `form.submit`, `appointment.check-in`. */
export const ACTION_ID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;
export const ActionIdSchema = z
  .string()
  .regex(ACTION_ID_PATTERN, "invalid action id");

export const ACTION_PLACEMENTS = [
  "footer",
  "card-actions",
  "overflow",
  "inline",
] as const;
export const ActionPlacementSchema = z.enum(ACTION_PLACEMENTS);
export type ActionPlacement = z.infer<typeof ActionPlacementSchema>;
export type ActionId = z.infer<typeof ActionIdSchema>;

export const ActionRefSchema = z
  .object({
    id: ActionIdSchema,
    label: z.string().min(1),
    placement: ActionPlacementSchema.optional(),
  })
  .strict();
export type ActionRef = z.infer<typeof ActionRefSchema>;

/**
 * Behavior vocabulary. Identity is the id; labels are presentation only.
 * Extending the vocabulary requires an id, a behavior, a test, and docs —
 * never a per-project fork.
 */
export const ACTION_CAPABILITIES = {
  "form.submit": "submit the current form",
  "form.reschedule": "submit a reschedule form",
  "form.cancel": "cancel the current form",
  "appointment.create": "start a new appointment",
  "appointment.reschedule": "start rescheduling an appointment",
  "appointment.cancel": "cancel an appointment",
  "appointment.accept": "accept an appointment",
  "appointment.check-in": "confirm customer arrival",
  "appointment.view": "open appointment detail",
  "customer.view": "open customer detail",
  "customer.select": "pick a customer",
  "customer.create": "create a customer record",
  "customer.callback.create": "start a callback registration",
  "order.create": "create an order",
  "treatment.notice.view": "view the treatment notice",
  "treatment.confirm": "confirm the notice was delivered",
  "filter.clear": "clear filters",
  "search.submit": "run a search",
  "search.clear": "clear the search keyword",
  "view.toggle": "toggle calendar/list or my/all",
  "scope.toggle": "toggle scoping between my records and all records",
  "auth.login": "sign in",
  "nav.back": "return to the previous list",
} as const;
export type CapabilityId = keyof typeof ACTION_CAPABILITIES;
export const CAPABILITY_IDS = Object.keys(ACTION_CAPABILITIES) as CapabilityId[];
