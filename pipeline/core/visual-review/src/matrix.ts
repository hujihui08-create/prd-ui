import type { PageSpec } from "@prd-ui/contracts";
import type { VisualCase } from "./contracts.js";

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const WEB_VIEWPORT = { width: 1440, height: 900 } as const;

/**
 * Builds the deterministic screenshot matrix for a set of Page Specs.
 * Cases are emitted in Page Spec order, default state first.
 */
export function buildVisualMatrix(specs: PageSpec[]): VisualCase[] {
  const cases: VisualCase[] = [];
  for (const spec of specs) {
    const viewport =
      spec.meta.target === "mobile" ? { ...MOBILE_VIEWPORT } : { ...WEB_VIEWPORT };
    const pageId = spec.meta.pageId;
    cases.push({ id: `${pageId}.default`, pageId, state: "default", viewport });
    for (const state of Object.keys(spec.states)) {
      if (state !== "default") {
        cases.push({
          id: `${pageId}.state.${state}`,
          pageId,
          state,
          query: { state },
          viewport,
        });
      }
    }
    for (const state of spec.businessStates ?? []) {
      cases.push({
        id: `${pageId}.business.${state.name}`,
        pageId,
        state: `business:${state.name}`,
        query: { status: state.name },
        viewport,
      });
    }
    for (const mode of spec.formModes ?? []) {
      cases.push({
        id: `${pageId}.mode.${mode.name}`,
        pageId,
        state: `mode:${mode.name}`,
        query: { mode: mode.name },
        viewport,
      });
    }
    for (const view of spec.views ?? []) {
      cases.push({
        id: `${pageId}.view.${view}`,
        pageId,
        state: `view:${view}`,
        query: { view },
        viewport,
      });
    }
    if (spec.searchIdleTitle !== undefined) {
      cases.push({ id: `${pageId}.search.idle`, pageId, state: "search:idle", viewport });
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
    if (pageId === "appointment-list") {
      cases.push({
        id: `${pageId}.drawer`,
        pageId,
        state: "drawer",
        actions: [{ kind: "open-drawer" }],
        viewport,
      });
    }
    if (pageId === "treatment-notice") {
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
