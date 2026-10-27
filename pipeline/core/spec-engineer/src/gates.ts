import {
  PageSpecSchema,
  type AssetBrief,
  type PageSpec,
  type UiBrief,
} from "@prd-ui/contracts";
import type { IaMap, InteractionSpec, MotionSpec } from "@prd-ui/agents";
import type { SpecEngineerGate, SpecIssue } from "./contracts.js";
import { collectAssetReferences, uniqueAssetReferences } from "./apply.js";
import { resolveMotionTarget } from "./motion-aliases.js";

export interface SpecEngineerGateInput {
  brief: UiBrief;
  specs: PageSpec[];
  interactionSpec: InteractionSpec;
  motionSpec: MotionSpec;
  iaMap?: IaMap;
  assetBriefs?: AssetBrief[];
  /** Pages whose unresolved motion bindings are blockers instead of warnings. */
  strictMotionPages?: string[];
}

function issue(
  code: string,
  severity: SpecIssue["severity"],
  message: string,
  evidence?: string
): SpecIssue {
  return {
    code,
    severity,
    message,
    ...(evidence === undefined ? {} : { evidence }),
  };
}

function durationValues(tokens: Record<string, string>): Set<number> {
  const values = new Set<number>();
  for (const value of Object.values(tokens)) {
    const match = /^(\d+)ms$/.exec(value.trim());
    if (match?.[1] !== undefined) values.add(Number(match[1]));
  }
  return values;
}

function easingValues(tokens: Record<string, string>): Set<string> {
  return new Set([...Object.keys(tokens), ...Object.values(tokens)]);
}

/**
 * Deterministic Spec Engineer gates. Blockers prevent Page Spec output;
 * warnings are recorded and do not.
 */
export function runSpecEngineerGates(
  input: SpecEngineerGateInput
): SpecEngineerGate {
  const issues: SpecIssue[] = [];
  const briefPages = new Map(input.brief.ia.pages.map((page) => [page.id, page]));
  const briefIds = new Set(briefPages.keys());
  const specById = new Map(input.specs.map((spec) => [spec.meta.pageId, spec]));
  const interactionPageIds = new Set(
    input.interactionSpec.pages.map((page) => page.id)
  );

  // Schema integrity: the output must always be a valid Page Spec.
  for (const spec of input.specs) {
    const parsed = PageSpecSchema.safeParse(spec);
    if (!parsed.success) {
      issues.push(
        issue(
          "SPEC_SCHEMA",
          "blocker",
          `enriched Page Spec ${spec.meta.pageId} failed schema validation`,
          parsed.error.message
        )
      );
    }
  }

  // Page coverage.
  for (const page of input.brief.ia.pages) {
    if (!specById.has(page.id)) {
      issues.push(
        issue("SPEC_PAGE_MISSING", "blocker", `brief page ${page.id} has no Page Spec`, page.id)
      );
    }
    if (!interactionPageIds.has(page.id)) {
      issues.push(
        issue(
          "SPEC_PAGE_MISSING",
          "blocker",
          `brief page ${page.id} is missing from the interaction spec`,
          page.id
        )
      );
    }
  }
  for (const spec of input.specs) {
    if (!briefIds.has(spec.meta.pageId)) {
      issues.push(
        issue(
          "SPEC_PAGE_UNKNOWN",
          "blocker",
          `Page Spec ${spec.meta.pageId} is not in the brief`,
          spec.meta.pageId
        )
      );
    }
  }
  for (const page of input.interactionSpec.pages) {
    if (!briefIds.has(page.id)) {
      issues.push(
        issue(
          "SPEC_PAGE_UNKNOWN",
          "blocker",
          `interaction page ${page.id} is not in the brief`,
          page.id
        )
      );
    }
  }

  // Action coverage and orphan triggers.
  for (const page of input.brief.ia.pages) {
    const spec = specById.get(page.id);
    if (spec === undefined) continue;
    const triggers = new Set(spec.interactions.map((interaction) => interaction.trigger));
    for (const action of page.actions ?? []) {
      if (!triggers.has(action.id)) {
        issues.push(
          issue(
            "SPEC_ACTION_MISSING",
            "blocker",
            `page ${page.id} has no Page Spec interaction for action ${action.label} (${action.id})`,
            action.id
          )
        );
      }
    }
  }

  // State coverage.
  for (const interactionPage of input.interactionSpec.pages) {
    const spec = specById.get(interactionPage.id);
    if (spec === undefined) continue;
    const interactionStates = new Set(Object.keys(interactionPage.states));
    const specStates = new Set(Object.keys(spec.states));
    for (const state of interactionStates) {
      if (!specStates.has(state)) {
        issues.push(
          issue(
            "SPEC_STATE_MISSING",
            "blocker",
            `page ${spec.meta.pageId} is missing interaction state ${state}`,
            state
          )
        );
      }
    }
    for (const state of specStates) {
      if (!interactionStates.has(state)) {
        issues.push(
          issue(
            "SPEC_STATE_UNMAPPED",
            "warning",
            `page ${spec.meta.pageId} state ${state} has no interaction description`,
            state
          )
        );
      }
    }
    const briefPage = briefPages.get(interactionPage.id);
    for (const state of briefPage?.requiredStates ?? []) {
      if (!specStates.has(state)) {
        issues.push(
          issue(
            "SPEC_STATE_MISSING",
            "blocker",
            `page ${spec.meta.pageId} is missing required state ${state}`,
            state
          )
        );
      }
    }
  }

  // Transition endpoints.
  for (const interactionPage of input.interactionSpec.pages) {
    for (const transition of interactionPage.transitions) {
      if (!briefIds.has(transition.from) || !briefIds.has(transition.to)) {
        issues.push(
          issue(
            "SPEC_TRANSITION_PAGE_UNKNOWN",
            "blocker",
            `page ${interactionPage.id} has a transition to/from an unknown page`,
            `${transition.from}->${transition.to}`
          )
        );
      }
    }
  }

  // Motion.
  const presets = new Set(Object.keys(input.motionSpec.presets));
  const durations = durationValues(input.motionSpec.tokens.duration);
  const easings = easingValues(input.motionSpec.tokens.easing);
  for (const binding of input.motionSpec.bindings) {
    if (!briefIds.has(binding.pageId)) {
      issues.push(
        issue(
          "SPEC_MOTION_BINDING_PAGE_UNKNOWN",
          "blocker",
          `motion binding references unknown page ${binding.pageId}`,
          binding.pageId
        )
      );
    }
    const preset = input.motionSpec.presets[binding.preset];
    if (!presets.has(binding.preset) || preset === undefined) {
      issues.push(
        issue(
          "SPEC_MOTION_PRESET_UNKNOWN",
          "blocker",
          `motion binding references unknown preset ${binding.preset}`,
          binding.preset
        )
      );
    } else {
      if (!durations.has(preset.durationMs)) {
        issues.push(
          issue(
            "SPEC_MOTION_TOKEN_MISMATCH",
            "blocker",
            `preset ${binding.preset} duration ${preset.durationMs}ms is not a duration token`,
            binding.preset
          )
        );
      }
      if (!easings.has(preset.easing)) {
        issues.push(
          issue(
            "SPEC_MOTION_TOKEN_MISMATCH",
            "blocker",
            `preset ${binding.preset} easing ${preset.easing} is not an easing token`,
            binding.preset
          )
        );
      }
    }
    if (binding.nodeId !== undefined) {
      const spec = specById.get(binding.pageId);
      if (spec !== undefined) {
        const target = resolveMotionTarget(spec, binding.nodeId);
        if (target === undefined) {
          const strict = input.strictMotionPages?.includes(binding.pageId) === true;
          issues.push(
            issue(
              "SPEC_MOTION_NODE_UNRESOLVED",
              strict ? "blocker" : "warning",
              `motion binding node ${binding.nodeId} is not present in the layout`,
              `${binding.pageId}#${binding.nodeId}`
            )
          );
        }
      }
    }
  }

  // Assets.
  const references = uniqueAssetReferences(collectAssetReferences(input.specs));
  if (input.assetBriefs === undefined || input.assetBriefs.length === 0) {
    issues.push(
      issue(
        "SPEC_ASSET_BRIEFS_MISSING",
        "warning",
        "no asset briefs supplied; asset linkage was skipped"
      )
    );
  } else {
    const briefById = new Map(input.assetBriefs.map((brief) => [brief.id, brief]));
    const referencedIds = new Set(references.map((reference) => reference.assetId));
    for (const reference of references) {
      if (!briefById.has(reference.assetId)) {
        issues.push(
          issue(
            "SPEC_ASSET_MISSING",
            "blocker",
            `page ${reference.pageId} references asset ${reference.assetId} without a brief`,
            `${reference.pageId}:${reference.assetId}`
          )
        );
      }
    }
    for (const brief of input.assetBriefs) {
      if (!referencedIds.has(brief.id)) {
        issues.push(
          issue(
            "SPEC_ASSET_UNUSED",
            "warning",
            `asset brief ${brief.id} is not referenced by any Page Spec`,
            brief.id
          )
        );
      }
    }
  }

  // Optional IA drift check.
  if (input.iaMap !== undefined) {
    const iaIds = new Set(input.iaMap.pages.map((page) => page.id));
    for (const id of iaIds) {
      if (!briefIds.has(id)) {
        issues.push(
          issue("SPEC_IA_PAGE_UNKNOWN", "warning", `IA page ${id} is not in the brief`, id)
        );
      }
    }
    for (const id of briefIds) {
      if (!iaIds.has(id)) {
        issues.push(
          issue("SPEC_IA_PAGE_MISSING", "warning", `brief page ${id} is missing from the IA map`, id)
        );
      }
    }
  }

  const passed = !issues.some((entry) => entry.severity === "blocker");
  return { passed, issues };
}
