import type { Finding, PageSpec } from "@prd-ui/contracts";
import { isLayoutPrimitive } from "@prd-ui/design-system";
import {
  finalizeFindings,
  hasOwn,
  rootShellComponents,
  walkSpecNodes,
  type FindingDraft,
  type ValidationContext,
} from "./types.js";

/**
 * Catalog contract checks.
 *
 * - `CATALOG-UNKNOWN`: type is neither a layout primitive nor a catalog
 *   component. Root shells are catalog components and are checked here too.
 * - `CATALOG-UNAVAILABLE`: a known component is not fully available.
 * - `CATALOG-PROP-UNKNOWN`: a prop is not declared by the component contract.
 * - `CATALOG-PROP-ENUM`: a prop value falls outside its declared enum.
 * - `CATALOG-VARIANT`: `variant`/`emphasis` is not in the component variants.
 * - `CATALOG-ARCHETYPE`: a catalog component is not allowed by the archetype.
 * - `CATALOG-SLOT`: a slot child is not in the slot's allow-list and is not a
 *   layout primitive.
 * - `CATALOG-SLOT-UNKNOWN`: a component that declares slots is given an
 *   undeclared slot key.
 *
 * Layout primitives have no catalog contract and are skipped. Root shells are
 * checked as components (presence/availability/props/slots) but are skipped by
 * the archetype allow-list because archetypes intentionally exclude them.
 */
export function validateCatalog(spec: PageSpec, ctx: ValidationContext): Finding[] {
  const drafts: FindingDraft[] = [];
  const components = new Map(ctx.catalog.components.map((component) => [component.id, component]));
  const archetypeComponents = new Set(ctx.archetype.allowedComponents);

  const push = (
    ruleId: string,
    location: string,
    evidence: string,
    issue: string
  ): void => {
    drafts.push({
      ruleId,
      severity: "blocker",
      category: "catalog",
      location,
      evidence,
      issue,
    });
  };

  for (const { node, path } of walkSpecNodes(spec.layout)) {
    if (isLayoutPrimitive(node.type)) continue;

    const component = components.get(node.type);
    if (!component) {
      push(
        "CATALOG-UNKNOWN",
        `${path}.type`,
        node.type,
        `Component "${node.type}" is not in catalog "${ctx.catalog.meta.library}".`
      );
      continue;
    }

    if (component.availability !== "available") {
      push(
        "CATALOG-UNAVAILABLE",
        path,
        `${node.type}: ${component.availability}`,
        `Component "${node.type}" is ${component.availability}, not "available".`
      );
    }

    for (const [prop, value] of Object.entries(node.props ?? {})) {
      const propContract = component.props[prop];
      if (!propContract) {
        push(
          "CATALOG-PROP-UNKNOWN",
          `${path}.props.${prop}`,
          prop,
          `Prop "${prop}" is not declared on component "${component.id}".`
        );
        continue;
      }
      if (propContract.enum && !propContract.enum.includes(String(value))) {
        push(
          "CATALOG-PROP-ENUM",
          `${path}.props.${prop}`,
          String(value),
          `Value "${String(value)}" for "${component.id}.${prop}" is not one of: ${propContract.enum.join(", ")}.`
        );
      }
    }

    for (const variantProp of ["variant", "emphasis"] as const) {
      if (!hasOwn(node.props ?? {}, variantProp)) continue;
      if (component.variants.length === 0) continue;
      const value = node.props?.[variantProp];
      if (typeof value === "string" && !component.variants.includes(value)) {
        push(
          "CATALOG-VARIANT",
          `${path}.props.${variantProp}`,
          value,
          `Value "${value}" for "${component.id}.${variantProp}" is not a declared variant: ${component.variants.join(", ")}.`
        );
      }
    }

    if (!rootShellComponents.has(component.id) && !archetypeComponents.has(component.id)) {
      push(
        "CATALOG-ARCHETYPE",
        path,
        component.id,
        `Component "${component.id}" is not allowed by archetype "${ctx.archetype.id}".`
      );
    }

    // Components without a slots contract (for example Section) impose no
    // structural constraint on slot content; skip them entirely.
    if (!component.slots || !node.slots) continue;

    for (const [slot, children] of Object.entries(node.slots)) {
      const slotContract = component.slots[slot];
      if (!slotContract) {
        push(
          "CATALOG-SLOT-UNKNOWN",
          `${path}.slots.${slot}`,
          slot,
          `Slot "${slot}" is not declared on component "${component.id}".`
        );
        continue;
      }

      children.forEach((child, index) => {
        if (isLayoutPrimitive(child.type)) return;
        if (!slotContract.allowed.includes(child.type)) {
          push(
            "CATALOG-SLOT",
            `${path}.slots.${slot}[${index}]`,
            child.type,
            `Component "${child.type}" is not allowed in slot "${component.id}.${slot}".`
          );
        }
      });
    }
  }

  return finalizeFindings(drafts);
}
