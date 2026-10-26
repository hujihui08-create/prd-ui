import type {
  FigmaCoverage,
  FigmaCoverageNode,
  FigmaPlan,
  FigmaPlanNode,
  PageSpec,
  SpecNode,
} from "@prd-ui/contracts";

/** Types the compiler intentionally does not render yet. They degrade, not silently drop. */
export const KNOWN_PARTIAL_TYPES = new Set([
  "BottomNav",
  "DataTable",
  "FeedCard",
  "FilterBar",
  "Pagination",
  "PageShell",
  "Stat",
  "Switch",
]);

/**
 * Props a mapped type accounts for. These are read by compile-plan.ts /
 * renderer-html, or are type-specific interaction data those consumers carry.
 * A prop not listed here and not in IGNORED_PROPS makes the node degraded.
 */
export const CONSUMED_PROPS: Record<string, readonly string[]> = {
  MobileShell: ["title", "tabs", "back", "activeTab", "storeName", "hasMessage", "showTabs"],
  TopBar: ["storeName", "hasMessage"],
  TabBar: ["items", "active"],
  Section: ["title", "padding", "gap", "viewPanel"],
  Card: ["title", "badge", "badgeTone", "subtitle", "padding", "gap", "actionLabel", "actionRoute"],
  Row: ["variant", "gap", "align", "title"],
  Stack: ["gap"],
  Grid: ["columns", "gap"],
  Text: ["text", "role", "align", "tone"],
  Button: ["label", "emphasis", "action", "viewToggle"],
  QuickAction: ["label", "icon", "tone"],
  Badge: ["label", "tone"],
  SearchBar: ["placeholder"],
  CollapsedFilter: ["label", "value", "options"],
  FormField: ["label", "value", "placeholder", "kind", "options", "required", "field", "readOnly"],
  Input: ["label", "value", "placeholder", "kind", "options", "required", "name", "inputType"],
  Select: ["label", "value", "placeholder", "options", "required"],
  ListRow: ["title", "subtitle", "meta", "status", "statusTone", "searchText", "action"],
  List: ["items", "label"],
  CalendarGrid: ["days", "hours", "blocks", "viewPanel"],
  EmptyState: ["title", "description", "icon", "emptyKind", "action", "variant"],
  SummaryRow: ["text"],
  InventoryCard: ["title", "value", "tone"],
  Image: ["alt"],
  Skeleton: [],
  ErrorState: [],
};

/** Props that are semantic/interaction-only and never affect the plan. */
export const IGNORED_PROPS = new Set<string>([
  "id",
  "nodeId",
  "reqRef",
  "action",
  "onPress",
  "disabled",
]);

export function skipReason(
  node: SpecNode,
  defaultView: string | undefined
): string | undefined {
  if (node.type === "Skeleton") return "SKIPPED_STATE:Skeleton";
  if (node.type === "ErrorState") return "SKIPPED_STATE:ErrorState";
  if (node.type === "EmptyState" && node.props?.emptyKind !== "idle") {
    return "SKIPPED_STATE:EmptyState";
  }
  // Search results stay hidden until the query matches (renderer-html applySearch).
  if (node.type === "ListRow" && typeof node.props?.searchText === "string") {
    return "SKIPPED_SEARCH_RESULT";
  }
  if (
    node.type === "Section" &&
    typeof node.props?.viewPanel === "string" &&
    node.props.viewPanel !== defaultView
  ) {
    return "SKIPPED_VIEW_PANEL";
  }
  return undefined;
}

function walkSpec(
  node: SpecNode,
  path: string,
  visit: (node: SpecNode, path: string) => void
): void {
  visit(node, path);
  (node.children ?? []).forEach((child, index) =>
    walkSpec(child, `${path}.children[${index}]`, visit)
  );
  for (const [slot, nodes] of Object.entries(node.slots ?? {})) {
    nodes.forEach((child, index) =>
      walkSpec(child, `${path}.slots.${slot}[${index}]`, visit)
    );
  }
}

function walkPlan(
  node: FigmaPlanNode,
  visit: (node: FigmaPlanNode) => void
): void {
  visit(node);
  if (node.child) walkPlan(node.child, visit);
  for (const child of node.children ?? []) walkPlan(child, visit);
}

function degradeReason(node: SpecNode): string | undefined {
  if (node.id === undefined || node.id.length === 0) return "SPEC_NODE_ID_MISSING";
  const consumed = CONSUMED_PROPS[node.type];
  if (!consumed) {
    return KNOWN_PARTIAL_TYPES.has(node.type)
      ? `PARTIAL_MAPPING:${node.type}`
      : `UNMAPPED_COMPONENT:${node.type}`;
  }
  const unknown = Object.keys(node.props ?? {}).filter(
    (key) => !consumed.includes(key) && !IGNORED_PROPS.has(key)
  );
  if (unknown.length > 0) return `UNMAPPED_PROP:${unknown.join(",")}`;
  return undefined;
}

export function buildCoverage(spec: PageSpec, plan: FigmaPlan): FigmaCoverage {
  const nodes: FigmaCoverageNode[] = [];
  const specIds = new Set<string>();

  walkSpec(spec.layout, "layout", (node, path) => {
    if (node.id) specIds.add(node.id);
    const skipped = skipReason(node, spec.defaultView);
    if (skipped) {
      nodes.push({
        specId: node.id ?? `${spec.meta.pageId}.${path}`,
        specType: node.type,
        path,
        status: "skipped",
        reason: skipped,
      });
      return;
    }
    const reason = degradeReason(node);
    if (reason === "SPEC_NODE_ID_MISSING") {
      nodes.push({
        specId: `${spec.meta.pageId}.${path}`,
        specType: node.type,
        path,
        status: "unmapped",
        reason,
      });
      return;
    }
    if (reason?.startsWith("UNMAPPED_COMPONENT")) {
      nodes.push({ specId: node.id!, specType: node.type, path, status: "unmapped", reason });
      return;
    }
    if (reason) {
      nodes.push({ specId: node.id!, specType: node.type, path, status: "degraded", reason });
      return;
    }
    nodes.push({ specId: node.id!, specType: node.type, path, status: "mapped" });
  });

  let derived = 0;
  walkPlan(plan.root, (node) => {
    if (!specIds.has(node.specId)) derived += 1;
  });

  return {
    nodes,
    summary: {
      spec: nodes.length,
      derived,
      // Derived plan nodes have no spec node to carry a status; applyCoverage
      // maps them, so count them as mapped to keep the conservation identity
      // `spec + derived === mapped + degraded + unmapped + skipped`.
      mapped: nodes.filter((node) => node.status === "mapped").length + derived,
      degraded: nodes.filter((node) => node.status === "degraded").length,
      unmapped: nodes.filter((node) => node.status === "unmapped").length,
      skipped: nodes.filter((node) => node.status === "skipped").length,
    },
  };
}

export function applyCoverage(plan: FigmaPlan, coverage: FigmaCoverage): void {
  const byId = new Map(coverage.nodes.map((node) => [node.specId, node]));
  walkPlan(plan.root, (node) => {
    const entry = byId.get(node.specId);
    if (entry === undefined) {
      node.origin = "derived";
      node.mapping = "mapped";
      return;
    }
    node.origin = "spec";
    node.mapping = entry.status === "skipped" ? "mapped" : entry.status;
    if (entry.reason !== undefined) node.reason = entry.reason;
  });
  plan.coverage = coverage;
}

export function coverageIndex(
  plans: FigmaPlan[],
  specRun: string,
  project: string
): Record<string, unknown> {
  return {
    schemaVersion: "1.0",
    project,
    specRun,
    pages: plans.map((plan) => ({
      pageId: plan.pageId,
      file: `figma-plan.${plan.pageId}.json`,
      summary: plan.coverage?.summary,
      nodes: plan.coverage?.nodes ?? [],
    })),
  };
}
