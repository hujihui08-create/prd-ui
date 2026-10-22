import type { PageSpec, SpecNode } from "@prd-ui/contracts";
import type { VisualCase } from "./contracts.js";

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const WEB_VIEWPORT = { width: 1440, height: 900 } as const;

/**
 * Page states worth capturing beyond `default`. Loading/error are sampled on
 * two representative pages; disabled is only meaningful on the form page.
 */
const REPRESENTATIVE_STATES: Readonly<Record<string, readonly string[]>> = {
  "appointment-list": ["loading", "error"],
  "appointment-detail": ["loading", "error"],
  "appointment-form": ["disabled"],
};

function isConfirmedBusinessState(name: string): boolean {
  return name === "已确认" || name.trim().toLowerCase() === "confirmed";
}

function hasNode(
  node: SpecNode,
  predicate: (node: SpecNode) => boolean
): boolean {
  if (predicate(node)) return true;
  for (const slot of Object.values(node.slots ?? {})) {
    for (const child of slot) {
      if (hasNode(child, predicate)) return true;
    }
  }
  for (const child of node.children ?? []) {
    if (hasNode(child, predicate)) return true;
  }
  return false;
}

/**
 * True when the page has a designed generic empty state. `emptyTitle` is the
 * brief marker; content-driven empty states (for example today's appointment
 * and callback blocks) are recognised through their layout EmptyState node.
 * The mobile-list fallback title is not a designed empty state.
 */
function hasGenericEmptyState(spec: PageSpec): boolean {
  if (spec.searchIdleTitle !== undefined) return false;
  if (spec.emptyTitle !== undefined) return true;
  const fallbackTitle = `暂无${spec.meta.name}`;
  return hasNode(spec.layout, (node) => {
    if (node.type !== "EmptyState") return false;
    const { emptyKind, title } = node.props ?? {};
    return (
      emptyKind === undefined &&
      typeof title === "string" &&
      title.length > 0 &&
      title !== fallbackTitle
    );
  });
}

/**
 * Builds the deterministic screenshot matrix for a set of Page Specs.
 *
 * Cases are emitted in Page Spec order, default state first. Loading/error,
 * disabled, generic empty, business, form-mode, view, search, drawer, and
 * notice cases are filtered so the clean 8-page brief stays in the 19-24
 * screenshot budget.
 */
export function buildVisualMatrix(specs: PageSpec[]): VisualCase[] {
  const cases: VisualCase[] = [];
  for (const spec of specs) {
    const viewport =
      spec.meta.target === "mobile" ? { ...MOBILE_VIEWPORT } : { ...WEB_VIEWPORT };
    const pageId = spec.meta.pageId;
    cases.push({ id: `${pageId}.default`, pageId, state: "default", viewport });

    for (const state of REPRESENTATIVE_STATES[pageId] ?? []) {
      if (spec.states[state] === undefined) continue;
      cases.push({
        id: `${pageId}.state.${state}`,
        pageId,
        state,
        query: { state },
        viewport,
      });
    }

    // Search pages already have idle/empty visuals via the search cases below.
    if (hasGenericEmptyState(spec)) {
      cases.push({
        id: `${pageId}.state.empty`,
        pageId,
        state: "empty",
        query: { state: "empty" },
        viewport,
      });
    }

    const businessStates = spec.businessStates ?? [];
    const currentStatus = spec.currentStatus;
    const skippedBusinessState =
      currentStatus !== undefined &&
      businessStates.some((state) => state.name === currentStatus)
        ? currentStatus
        : businessStates[0]?.name;
    for (const state of businessStates) {
      if (state.name === skippedBusinessState) continue;
      cases.push({
        id: `${pageId}.business.${state.name}`,
        pageId,
        state: `business:${state.name}`,
        query: { status: state.name },
        viewport,
      });
    }

    // The first form mode is the page default; only alternates need a case.
    for (const mode of (spec.formModes ?? []).slice(1)) {
      cases.push({
        id: `${pageId}.mode.${mode.name}`,
        pageId,
        state: `mode:${mode.name}`,
        query: { mode: mode.name },
        viewport,
      });
    }

    // The default view is the page default; only alternates need a case.
    const views = spec.views ?? [];
    const defaultView = spec.defaultView ?? views[0];
    for (const view of views) {
      if (view === defaultView) continue;
      cases.push({
        id: `${pageId}.view.${view}`,
        pageId,
        state: `view:${view}`,
        query: { view },
        viewport,
      });
    }

    if (spec.searchIdleTitle !== undefined) {
      // Idle is covered by `<pageId>.default`; results and no-match need actions.
      cases.push({
        id: `${pageId}.search.results`,
        pageId,
        state: "search:results",
        actions: [{ kind: "search", value: "张" }],
        viewport,
      });
      cases.push({
        id: `${pageId}.search.empty`,
        pageId,
        state: "search:empty",
        actions: [{ kind: "search", value: "zzz" }],
        viewport,
      });
    }

    if (views.length > 0) {
      cases.push({
        id: `${pageId}.drawer`,
        pageId,
        state: "drawer",
        actions: [{ kind: "open-drawer" }],
        viewport,
      });
    }

    const hasNoticeBlocks = (spec.noticeBlocks ?? []).length > 0;
    const hasConfirmedBusinessState = businessStates.some((state) =>
      isConfirmedBusinessState(state.name)
    );
    if (hasNoticeBlocks && !hasConfirmedBusinessState) {
      cases.push({
        id: `${pageId}.confirmed`,
        pageId,
        state: "confirmed",
        actions: [{ kind: "confirm-notice" }],
        viewport,
      });
    }
  }
  return cases;
}
