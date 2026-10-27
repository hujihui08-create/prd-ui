import { describe, expect, it } from "vitest";
import type { PageSpec, SpecNode } from "@prd-ui/contracts";
import { getProfile } from "@prd-ui/design-system";
import { renderDocument } from "../src/index.js";

/**
 * Every SpecNode type that renders a mapped root element must carry
 * `data-node-id`; otherwise conformance reports plan-only nodes. The two
 * overlays and the derived nav types are the only intentional exceptions.
 */
const TYPES = [
  "TopBar",
  "TabBar",
  "BottomNav",
  "Stat",
  "List",
  "DataTable",
  "FilterBar",
  "Pagination",
  "FormField",
  "Input",
  "Select",
  "FeedCard",
  "Image",
  "Section",
  "Card",
  "Row",
  "Stack",
  "Grid",
  "Text",
  "Icon",
  "QuickAction",
  "CalendarGrid",
  "ListRow",
  "Badge",
  "SearchBar",
  "CollapsedFilter",
  "Switch",
  "SummaryRow",
  "InventoryCard",
  "EmptyState",
  "Button",
] as const;

/** Derived-id or overlay types: no id of their own by design. */
const NO_OWN_ID = new Set(["TabBar", "BottomNav"]);

/**
 * Partial types render HTML but the plan only models structure, so coverage
 * marks them `skipped: PARTIAL_MAPPING` and conformance never looks for an id.
 */
const PARTIAL_TYPES = new Set([
  "Stat",
  "DataTable",
  "FilterBar",
  "Pagination",
  "FeedCard",
]);

function specWith(nodes: SpecNode[]): PageSpec {
  return {
    meta: {
      pageId: "p",
      project: "t",
      name: "P",
      target: "mobile",
      profile: "b-mobile",
      archetype: "mobile-list",
      purpose: "p",
      route: "/p",
      roles: ["r"],
      reqRefs: ["REQ-T-001"],
      version: "0.1.0",
    },
    layout: {
      type: "MobileShell",
      id: "p.root",
      slots: { content: nodes },
    },
    states: {
      default: {
        layout: { type: "MobileShell", id: "p.root", slots: { content: [] } },
      },
    },
    interactions: [],
    traceability: [],
  } as unknown as PageSpec;
}

describe("node id coverage", () => {
  it("emits exactly one data-node-id for every mapped type", () => {
    const nodes = TYPES.map((type) => ({ type, id: `p.${type}`, props: {} }));
    const html = renderDocument(specWith(nodes), getProfile("b-mobile"));
    const ids = [...html.matchAll(/data-node-id="([^"]+)"/g)].map((match) => match[1]);
    const missing: string[] = [];
    for (const type of TYPES) {
      if (NO_OWN_ID.has(type) || PARTIAL_TYPES.has(type)) continue;
      const count = ids.filter((id) => id === `p.${type}`).length;
      if (count !== 1) missing.push(`${type} (${count})`);
    }
    expect(missing).toEqual([]);
  });

  it("still renders the partial types", () => {
    const markers: Record<string, string> = {
      Stat: 'class="stat"',
      DataTable: 'class="data-table"',
      FilterBar: 'class="filter-bar"',
      Pagination: 'class="pagination"',
      FeedCard: 'class="feed-card"',
    };
    const nodes = [...PARTIAL_TYPES].map((type) => ({
      type,
      id: `p.${type}`,
      props: {},
    }));
    const html = renderDocument(specWith(nodes), getProfile("b-mobile"));
    for (const type of PARTIAL_TYPES) {
      expect(html, type).toContain(markers[type]!);
      expect(html, type).not.toContain(`data-node-id="p.${type}"`);
    }
  });
});
