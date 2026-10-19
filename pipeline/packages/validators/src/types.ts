import type {
  AssetManifest,
  Catalog,
  Finding,
  Profile,
  SpecNode,
} from "@prd-ui/contracts";
import type { ArchetypeDef } from "@prd-ui/design-system";

/** Everything the validators need beyond the page spec itself. */
export interface ValidationContext {
  profile: Profile;
  catalog: Catalog;
  archetype: ArchetypeDef;
  manifest: AssetManifest;
}

export interface ValidationReport {
  pageId: string;
  findings: Finding[];
  blockers: number;
  major: number;
  minor: number;
  questions: number;
  passed: boolean;
}

/**
 * Root shell per platform. The compiler emits these as the page root; they are
 * catalog components, but archetype `allowedComponents` intentionally excludes
 * them because the shell is validated by the layout rules instead.
 */
export const ROOT_SHELL = {
  web: "PageShell",
  mobile: "MobileShell",
} as const;

export const rootShellComponents = new Set<string>(Object.values(ROOT_SHELL));

/**
 * A finding before report-level identifiers are assigned. Each validator
 * assigns locally unique ids; `validatePageSpec` renumbers them as F-001...N.
 */
export type FindingDraft = Omit<Finding, "id">;

export function finalizeFindings(drafts: FindingDraft[]): Finding[] {
  return drafts.map((draft, index) => ({
    id: `${draft.ruleId}-${index + 1}`,
    ...draft,
  }));
}

export interface NodeVisit {
  node: SpecNode;
  path: string;
}

/** Depth-first traversal of children and slots, with stable JSON-like paths. */
export function walkSpecNodes(root: SpecNode | undefined, basePath = "layout"): NodeVisit[] {
  const visits: NodeVisit[] = [];
  if (!root || typeof root !== "object") return visits;

  const visit = (node: SpecNode, path: string): void => {
    visits.push({ node, path });
    (node.children ?? []).forEach((child, index) => {
      visit(child, `${path}.children[${index}]`);
    });
    for (const [slot, nodes] of Object.entries(node.slots ?? {})) {
      nodes.forEach((child, index) => {
        visit(child, `${path}.slots.${slot}[${index}]`);
      });
    }
  };

  visit(root, basePath);
  return visits;
}

/** Recursively collect every string value from an unknown JSON-like value. */
export function collectStrings(value: unknown, strings: string[] = []): string[] {
  if (typeof value === "string") {
    strings.push(value);
    return strings;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, strings);
    return strings;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, strings);
  }
  return strings;
}

export function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
