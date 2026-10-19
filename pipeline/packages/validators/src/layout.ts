import type { Finding, PageSpec } from "@prd-ui/contracts";
import {
  ROOT_SHELL,
  finalizeFindings,
  walkSpecNodes,
  type FindingDraft,
  type ValidationContext,
} from "./types.js";

const ABSOLUTE_POSITION_KEYS = ["position", "top", "left", "right", "bottom"] as const;

/** Find absolute-positioning keys at any depth inside props. */
function findAbsoluteKeys(value: unknown, path: string, found: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findAbsoluteKeys(item, `${path}[${index}]`, found));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if ((ABSOLUTE_POSITION_KEYS as readonly string[]).includes(key)) {
      found.push(nestedPath);
    }
    findAbsoluteKeys(nested, nestedPath, found);
  }
}

/**
 * Structural layout checks.
 *
 * - `LAYOUT-ARCHETYPE`: root node is not the shell for the page target.
 * - `LAYOUT-ABSOLUTE`: any node carries absolute-positioning props.
 * - `LAYOUT-SLOT`: a slot required by the archetype is missing or empty.
 */
export function validateLayout(spec: PageSpec, ctx: ValidationContext): Finding[] {
  const drafts: FindingDraft[] = [];
  const root = spec.layout;

  const push = (ruleId: string, location: string, evidence: string, issue: string): void => {
    drafts.push({
      ruleId,
      severity: "blocker",
      category: "layout",
      location,
      evidence,
      issue,
    });
  };

  if (root) {
    const target = spec.meta?.target === "mobile" ? "mobile" : "web";
    const expectedRoot = ROOT_SHELL[target];
    if (root.type !== expectedRoot) {
      push(
        "LAYOUT-ARCHETYPE",
        "layout.type",
        root.type,
        `Root node must be "${expectedRoot}" for ${target} pages; found "${root.type}".`
      );
    }
  }

  for (const { node, path } of walkSpecNodes(root)) {
    const found: string[] = [];
    findAbsoluteKeys(node.props ?? {}, `${path}.props`, found);
    if (found.length > 0) {
      push(
        "LAYOUT-ABSOLUTE",
        `${path}.props`,
        found.join(", "),
        `Absolute positioning is not allowed; found ${found.join(", ")}.`
      );
    }
  }

  const rootSlots = root?.slots ?? {};
  for (const slot of ctx.archetype.requiredSlots) {
    const children = rootSlots[slot];
    if (!children || children.length === 0) {
      push(
        "LAYOUT-SLOT",
        `layout.slots.${slot}`,
        children ? "[]" : "(missing)",
        `Required slot "${slot}" of archetype "${ctx.archetype.id}" is missing or empty.`
      );
    }
  }

  return finalizeFindings(drafts);
}
