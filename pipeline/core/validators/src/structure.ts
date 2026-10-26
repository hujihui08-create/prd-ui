import type { Finding, PageSpec, SpecNode } from "@prd-ui/contracts";
import { DEFAULT_STRUCTURE_CONFIG, type StructureConfig } from "@prd-ui/contracts";
import type { ValidationContext } from "./types.js";

export type StructureContext = Pick<ValidationContext, "profile" | "catalog" | "archetype"> & {
  structure?: Partial<StructureConfig>;
};

function configFor(ctx: StructureContext): StructureConfig {
  return {
    maxRepeatedSections:
      ctx.structure?.maxRepeatedSections ?? DEFAULT_STRUCTURE_CONFIG.maxRepeatedSections,
    pageHeightBudget: {
      mobile:
        ctx.structure?.pageHeightBudget?.mobile ?? DEFAULT_STRUCTURE_CONFIG.pageHeightBudget.mobile,
      web: ctx.structure?.pageHeightBudget?.web ?? DEFAULT_STRUCTURE_CONFIG.pageHeightBudget.web,
    },
  };
}

type StructureVisitor = (
  node: SpecNode,
  path: string,
  parent?: SpecNode,
  parentPath?: string,
  slot?: string
) => void;

function walk(
  node: SpecNode | undefined,
  visit: StructureVisitor,
  path = "layout",
  parent?: SpecNode,
  parentPath?: string,
  slot?: string
): void {
  if (!node) return;
  visit(node, path, parent, parentPath, slot);
  (node.children ?? []).forEach((child, index) =>
    walk(child, visit, `${path}.children[${index}]`, node, path)
  );
  for (const [slotName, nodes] of Object.entries(node.slots ?? {})) {
    nodes.forEach((child, index) =>
      walk(child, visit, `${path}.slots.${slotName}[${index}]`, node, path, slotName)
    );
  }
}

const SPACING_KEYS = ["gap", "padding", "paddingX", "paddingY"] as const;

/** Section slots that legitimately host action buttons. */
const ACTION_SLOT_NAMES = new Set(["actions", "footer", "card-actions", "filter-row"]);

/**
 * Deterministic, approximate page-height estimate used by the warning-only
 * structure budget. It ignores text wrapping and viewport scaling on purpose:
 * the value only needs to be stable and directionally useful.
 */
export function estimatePageHeight(spec: PageSpec, _ctx: StructureContext): number {
  const base = spec.meta.target === "web" ? 900 : 844;
  let extra = 0;
  walk(spec.layout, (node) => {
    switch (node.type) {
      case "ListRow":
        extra += 64;
        break;
      case "Card":
        extra += 120;
        break;
      case "Section":
        extra += 24;
        break;
      case "CalendarGrid":
        extra += 36 + 44 * Math.max((node.props?.hours as unknown[] | undefined)?.length ?? 6, 1);
        break;
      case "DataTable":
        extra += 44 * Math.max((node.props?.rows as unknown[] | undefined)?.length ?? 3, 1);
        break;
      case "List": {
        const items = node.props?.items;
        if (Array.isArray(items)) extra += 40 * Math.max(items.length, 1);
        else extra += 40 * Math.min(Math.max(Number(items) || 3, 1), 6);
        break;
      }
      default:
        extra += 0;
    }
  });
  return base + extra;
}

/**
 * Deterministic structure lint. Findings are warnings in v0.7: they are
 * reported by `spec:engineer` in `findings/structure-lint.json` but never
 * change the spec gate's pass/fail.
 *
 * Rules:
 * - `STRUCTURE-EMPTY-SLOT`: an optional slot is present but empty. Required
 *   slots are excluded because `LAYOUT-SLOT` already blocks those.
 * - `STRUCTURE-REPEATED-SECTION`: the same section title + child-type pattern
 *   repeats more than the configured threshold.
 * - `STRUCTURE-PAGE-HEIGHT`: the approximate page height exceeds the target
 *   budget.
 * - `STRUCTURE-HEADING-SKIP`: consecutive heading roles (`textRole`, or the
 *   hand-written `props.role` fallback) jump by more than one.
 * - `STRUCTURE-ORPHAN-ACTION`: a Button sits directly in a Section outside an
 *   action-bearing slot (actions/filter-row/footer/card-actions).
 * - `STRUCTURE-REPEATED-ROWS`: three or more sibling ListRow nodes should be a
 *   List.
 * - `STRUCTURE-SPACING-SCALE`: a `space.*` token on gap/padding is outside the
 *   profile's space scale.
 */
export function validateStructure(spec: PageSpec, ctx: StructureContext): Finding[] {
  const config = configFor(ctx);
  const findings: Finding[] = [];
  const push = (ruleId: string, location: string, evidence: string, issue: string): void => {
    findings.push({
      id: `${ruleId}-${findings.length + 1}`,
      ruleId,
      severity: "warning",
      category: "structure",
      location,
      evidence,
      issue,
    });
  };

  const sectionSignatures = new Map<string, string[]>();
  const headingRoles: string[] = [];
  const siblingTypes = new Map<string, number>();

  walk(spec.layout, (node, path, parent, parentPath, slot) => {
    for (const [slotName, nodes] of Object.entries(node.slots ?? {})) {
      if (nodes.length === 0 && !ctx.archetype.requiredSlots.includes(slotName)) {
        push(
          "STRUCTURE-EMPTY-SLOT",
          `${path}.slots.${slotName}`,
          "[]",
          `Slot "${slotName}" is empty.`
        );
      }
    }
    if (node.type === "Section") {
      const title = String(node.props?.title ?? "").trim();
      const signature = `${title}|${(node.children ?? []).map((child) => child.type).join(",")}`;
      const locations = sectionSignatures.get(signature) ?? [];
      locations.push(path);
      sectionSignatures.set(signature, locations);
    }
    if (node.type === "Text") {
      // The compiler stores heading levels on `textRole`; `props.role` is
      // accepted for hand-written specs.
      const role = node.textRole ?? node.props?.role;
      if (typeof role === "string" && role.startsWith("heading.")) {
        headingRoles.push(role);
      }
    }
    if (
      node.type === "Button" &&
      parent?.type === "Section" &&
      (slot === undefined || !ACTION_SLOT_NAMES.has(slot))
    ) {
      push(
        "STRUCTURE-ORPHAN-ACTION",
        path,
        "Section > Button",
        "Button is not inside actions/filter-row/footer/card-actions."
      );
    }
    if (parentPath !== undefined) {
      const container = slot === undefined ? "children" : `slots.${slot}`;
      const key = `${parentPath}.${container}|${node.type}`;
      siblingTypes.set(key, (siblingTypes.get(key) ?? 0) + 1);
    }
    for (const key of SPACING_KEYS) {
      const value = node.props?.[key];
      if (typeof value === "string" && /^space[.-]/.test(value)) {
        const token = value.replace(/^space[.-]/, "");
        if (!(token in ctx.profile.space)) {
          push(
            "STRUCTURE-SPACING-SCALE",
            `${path}.props.${key}`,
            value,
            `"${value}" is not in the profile space scale.`
          );
        }
      }
    }
  });

  for (const [signature, locations] of sectionSignatures) {
    if (locations.length > config.maxRepeatedSections) {
      push(
        "STRUCTURE-REPEATED-SECTION",
        locations[0]!,
        signature,
        `Section signature repeats ${locations.length} times.`
      );
    }
  }

  const order = headingRoles
    .map((role) => Number(role.split(".")[1] ?? 0))
    .filter((level) => level > 0);
  for (let index = 1; index < order.length; index += 1) {
    if (order[index]! - order[index - 1]! > 1) {
      push(
        "STRUCTURE-HEADING-SKIP",
        "layout",
        order.join(","),
        "Heading levels jump by more than one."
      );
      break;
    }
  }

  for (const [key, count] of siblingTypes) {
    if (key.endsWith("|ListRow") && count >= 3) {
      push(
        "STRUCTURE-REPEATED-ROWS",
        key,
        String(count),
        `${count} sibling ListRow nodes are not expressed as a List.`
      );
    }
  }

  const estimatedHeight = estimatePageHeight(spec, ctx);
  const budget = config.pageHeightBudget[spec.meta.target];
  if (estimatedHeight > budget) {
    push(
      "STRUCTURE-PAGE-HEIGHT",
      "layout",
      `${estimatedHeight} > ${budget}`,
      `Estimated page height ${estimatedHeight}px exceeds the ${budget}px budget.`
    );
  }

  return findings;
}
