import type { Finding, PageSpec } from "@prd-ui/contracts";
import {
  finalizeFindings,
  walkSpecNodes,
  type FindingDraft,
  type ValidationContext,
} from "./types.js";

/**
 * Page-state checks.
 *
 * - `STATE-REQUIRED`: a state required by the archetype or the page's brief
 *   entry is absent.
 * - `STATE-DEFAULT`: the default state is absent (also caught by the schema,
 *   kept here so the report always names the state rule).
 * - `STATE-OVERRIDE`: an override targets an unknown node id or a component
 *   that exists neither in the layout nor in the catalog.
 */
export function validateState(spec: PageSpec, ctx: ValidationContext): Finding[] {
  const drafts: FindingDraft[] = [];
  const states = spec.states ?? {};

  const push = (
    ruleId: string,
    location: string,
    evidence: string,
    issue: string,
    severity: FindingDraft["severity"] = "blocker"
  ): void => {
    drafts.push({
      ruleId,
      severity,
      category: "state",
      location,
      evidence,
      issue,
    });
  };

  for (const required of ctx.archetype.requiredStates) {
    if (!Object.prototype.hasOwnProperty.call(states, required)) {
      push(
        "STATE-REQUIRED",
        "states",
        required,
        `Archetype "${ctx.archetype.id}" requires state "${required}".`
      );
    }
  }

  const archetypeStates = new Set(ctx.archetype.requiredStates);
  for (const required of ctx.requiredStates ?? []) {
    if (archetypeStates.has(required)) continue;
    if (!Object.prototype.hasOwnProperty.call(states, required)) {
      push(
        "STATE-REQUIRED",
        "states",
        required,
        `Page brief requires state "${required}".`
      );
    }
  }

  if (!Object.prototype.hasOwnProperty.call(states, "default")) {
    push("STATE-DEFAULT", "states", "(missing)", 'A "default" state is required.');
  }

  const visits = walkSpecNodes(spec.layout);
  const nodeIds = new Set(
    visits.map(({ node }) => node.id).filter((id): id is string => typeof id === "string")
  );
  const nodeTypes = new Set(visits.map(({ node }) => node.type));
  const catalogIds = new Set(ctx.catalog.components.map((component) => component.id));

  for (const [stateName, state] of Object.entries(states)) {
    (state.overrides ?? []).forEach((override, index) => {
      const location = `states.${stateName}.overrides[${index}]`;
      if (override.nodeId !== undefined && !nodeIds.has(override.nodeId)) {
        push(
          "STATE-OVERRIDE",
          location,
          override.nodeId,
          `Override in state "${stateName}" targets unknown node id "${override.nodeId}".`,
          "major"
        );
      }
      if (
        override.component !== undefined &&
        !nodeTypes.has(override.component) &&
        !catalogIds.has(override.component)
      ) {
        push(
          "STATE-OVERRIDE",
          location,
          override.component,
          `Override in state "${stateName}" targets unknown component "${override.component}".`,
          "major"
        );
      }
    });
  }

  return finalizeFindings(drafts);
}
