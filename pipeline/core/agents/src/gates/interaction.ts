import type { UiBrief } from "@prd-ui/contracts";
import type { GateIssue, GateResult } from "../contracts.js";
import type { InteractionSpec, MotionSpec } from "../roles/interaction.js";

export interface InteractionGateInput {
  interactionSpec: InteractionSpec;
  motionSpec: MotionSpec;
  brief: UiBrief;
}

function blocker(code: string, message: string, evidence?: string): GateIssue {
  return {
    code,
    severity: "blocker",
    message,
    ...(evidence === undefined ? {} : { evidence }),
  };
}

const KNOWN_STATES = new Set(["default", "loading", "empty", "error", "disabled", "success"]);

function durationTokenValues(tokens: Record<string, string>): Set<number> {
  const values = new Set<number>();
  for (const value of Object.values(tokens)) {
    const match = /^(\d+)ms$/.exec(value.trim());
    if (match?.[1] !== undefined) values.add(Number(match[1]));
  }
  return values;
}

function easingTokens(tokens: Record<string, string>): Set<string> {
  return new Set([...Object.keys(tokens), ...Object.values(tokens)]);
}

/**
 * Interaction gate: action coverage, state matrix, transitions, and motion
 * tokens. Everything here is deterministic; the agent's prose review is not
 * a gate input.
 */
export function runInteractionGate(input: InteractionGateInput): GateResult {
  const issues: GateIssue[] = [];
  const specPageIds = new Set<string>();
  const briefPages = new Map(input.brief.ia.pages.map((page) => [page.id, page]));

  for (const page of input.interactionSpec.pages) {
    if (specPageIds.has(page.id)) {
      issues.push(blocker("INTERACTION_PAGE_DUPLICATE", `duplicate page ${page.id}`, page.id));
    }
    specPageIds.add(page.id);
    if (!briefPages.has(page.id)) {
      issues.push(blocker("INTERACTION_PAGE_UNKNOWN", `page ${page.id} is not in the brief`, page.id));
    }
  }

  for (const briefPage of input.brief.ia.pages) {
    if (!specPageIds.has(briefPage.id)) {
      issues.push(
        blocker("INTERACTION_PAGE_MISSING", `missing interaction page ${briefPage.id}`, briefPage.id)
      );
    }
  }

  for (const page of input.interactionSpec.pages) {
    const briefPage = briefPages.get(page.id);
    if (briefPage === undefined) continue;

    const actions = new Set(page.triggers.map((trigger) => trigger.action.trim()));
    for (const ref of briefPage.actions ?? []) {
      if (!actions.has(ref.id)) {
        issues.push(
          blocker(
            "INTERACTION_ACTION_MISSING",
            `page ${page.id} does not cover action ${ref.label} (${ref.id})`,
            ref.id
          )
        );
      }
    }

    for (const required of briefPage.requiredStates) {
      if (!KNOWN_STATES.has(required)) {
        issues.push(
          blocker(
            "INTERACTION_STATE_UNKNOWN",
            `brief page ${page.id} requires unsupported state ${required}`,
            required
          )
        );
        continue;
      }
      if (!Object.hasOwn(page.states, required)) {
        issues.push(
          blocker(
            "INTERACTION_STATE_MISSING",
            `page ${page.id} is missing required state ${required}`,
            required
          )
        );
      }
    }

    if (page.states.default.length === 0) {
      issues.push(
        blocker("INTERACTION_DEFAULT_EMPTY", `page ${page.id} has no default content`, page.id)
      );
    }

    if (page.focusOrder.length === 0 && page.triggers.length > 0) {
      issues.push(
        blocker(
          "INTERACTION_FOCUS_EMPTY",
          `page ${page.id} has actions but no focus order`,
          page.id
        )
      );
    }

    for (const transition of page.transitions) {
      if (!specPageIds.has(transition.from) || !specPageIds.has(transition.to)) {
        issues.push(
          blocker(
            "INTERACTION_TRANSITION_UNKNOWN",
            `page ${page.id} has a transition to/from an unknown page`,
            `${transition.from}->${transition.to}`
          )
        );
      }
    }
  }

  const { motionSpec } = input;
  const presetNames = new Set(Object.keys(motionSpec.presets));
  if (presetNames.size === 0) {
    issues.push(blocker("MOTION_PRESETS_EMPTY", "motion spec has no presets"));
  }
  const durationValues = durationTokenValues(motionSpec.tokens.duration);
  const easingValues = easingTokens(motionSpec.tokens.easing);
  if (Object.keys(motionSpec.tokens.duration).length === 0) {
    issues.push(blocker("MOTION_TOKENS_EMPTY", "motion duration tokens are empty"));
  }
  if (Object.keys(motionSpec.tokens.easing).length === 0) {
    issues.push(blocker("MOTION_TOKENS_EMPTY", "motion easing tokens are empty"));
  }

  for (const [name, preset] of Object.entries(motionSpec.presets)) {
    if (!durationValues.has(preset.durationMs)) {
      issues.push(
        blocker(
          "MOTION_DURATION_NOT_TOKEN",
          `preset ${name} uses ${preset.durationMs}ms, which is not a duration token`,
          `${preset.durationMs}`
        )
      );
    }
    if (!easingValues.has(preset.easing)) {
      issues.push(
        blocker(
          "MOTION_EASING_NOT_TOKEN",
          `preset ${name} uses easing ${preset.easing}, which is not an easing token`,
          preset.easing
        )
      );
    }
  }

  for (const binding of motionSpec.bindings) {
    if (!presetNames.has(binding.preset)) {
      issues.push(
        blocker(
          "MOTION_PRESET_UNKNOWN",
          `binding references unknown preset ${binding.preset}`,
          binding.preset
        )
      );
    }
    if (!specPageIds.has(binding.pageId)) {
      issues.push(
        blocker(
          "MOTION_PAGE_UNKNOWN",
          `binding references unknown page ${binding.pageId}`,
          binding.pageId
        )
      );
    }
  }

  const reduced = (motionSpec as { reducedMotion?: { fallback?: string } }).reducedMotion;
  if (
    reduced === undefined ||
    reduced.fallback === undefined ||
    !["none", "fade", "instant"].includes(reduced.fallback)
  ) {
    issues.push(
      blocker("MOTION_REDUCED_MISSING", "motion spec has no valid reducedMotion fallback")
    );
  }

  const passed = !issues.some((issue) => issue.severity === "blocker");
  return { passed, status: passed ? "passed" : "failed", issues };
}
