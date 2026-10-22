import type { PageSpec, SpecNode } from "@prd-ui/contracts";

/**
 * Legacy M1 fixture ids mapped to the semantic node ids assigned by the
 * compiler. Aliases keep older agent artifacts consumable while new runs
 * emit semantic ids directly.
 */
export const LEGACY_MOTION_ALIASES: Record<string, string> = {
  "today.quick-new-appointment": "today.quick.new-appointment",
  "today.appointment-row": "today.row.appointment",
  "today.callback-row": "today.row.callback",
  "today.appointments-view-all": "today.card.appointments",
  "today.error-retry": "today.page.root",
  "cs.result-row": "customer-search.row.result",
  "cs.clear-keyword": "customer-search.action.clear",
  "cs.error-retry": "customer-search.page.root",
  "cs.back": "customer-search.page.root",
  "cd.view-appointment": "customer-detail.action.view-appointment",
  "cd.new-appointment": "customer-detail.action.new-appointment",
  "cd.callback-register": "customer-detail.action.callback",
  "cd.error-retry": "customer-detail.page.root",
  "ad.footer-checkin": "appointment-detail.action.checkin",
  "ad.footer-order": "appointment-detail.action.open-order",
  "ad.footer-reschedule": "appointment-detail.action.reschedule",
  "ad.footer-cancel": "appointment-detail.action.cancel",
  "ad.customer-link": "appointment-detail.action.customer",
  "ad.error-retry": "appointment-detail.page.root",
  "af.customer-field": "appointment-form.field.customer",
  "af.pick-customer": "appointment-form.action.pick-customer",
  "af.save": "appointment-form.action.save",
  "af.save-reschedule": "appointment-form.action.save",
  "tn.confirm": "treatment-notice.action.confirm",
  "tn.error-retry": "treatment-notice.page.root",
  "tn.back": "treatment-notice.page.root",
  "al.view-toggle": "appointment-list.action.toggle-view",
  "al.new-appointment": "appointment-list.action.new-appointment",
  "al.calendar-block": "appointment-list.row.appointment",
  "al.list-row": "appointment-list.row.appointment",
  "al.error-retry": "appointment-list.page.root",
  "cr.pick-customer": "callback-register.action.pick-customer",
  "cr.save": "callback-register.action.save",
  "cr.error-retry": "callback-register.page.root",
};

/**
 * Resolve a motion binding target against a compiled Page Spec. Exact node ids
 * win over motion groups so a binding can target one repeated row. Returns
 * `undefined` when neither the id (or its legacy alias) nor the group exists.
 */
export function resolveMotionTarget(
  spec: PageSpec,
  nodeId: string
): { id: string; group: boolean } | undefined {
  const target = LEGACY_MOTION_ALIASES[nodeId] ?? nodeId;
  const ids = new Set<string>();
  const groups = new Set<string>();
  const walk = (node: SpecNode): void => {
    if (node.id !== undefined) ids.add(node.id);
    if (node.motionGroup !== undefined) groups.add(node.motionGroup);
    for (const children of Object.values(node.slots ?? {})) children.forEach(walk);
    (node.children ?? []).forEach(walk);
  };
  walk(spec.layout);
  if (ids.has(target)) return { id: target, group: false };
  if (groups.has(target)) return { id: target, group: true };
  return undefined;
}
