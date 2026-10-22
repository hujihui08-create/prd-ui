import type {
  Interaction,
  PageMotion,
  PageMotionPreset,
  PageSpec,
  PageState,
  ReqId,
  SpecNode,
  UiBrief,
  UiBriefPage,
} from "@prd-ui/contracts";
import type {
  InteractionPage,
  InteractionSpec,
  MotionSpec,
} from "@prd-ui/agents";
import type { AssetReference, SpecEngineerInput } from "./contracts.js";
import { resolveMotionTarget } from "./motion-aliases.js";

function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T;
}

function routeOf(brief: UiBrief, pageId: string): string | undefined {
  return brief.ia.pages.find((page) => page.id === pageId)?.route;
}

function dedupeInteractions(interactions: Interaction[]): Interaction[] {
  const seen = new Set<string>();
  return interactions.filter((interaction) => {
    const key = JSON.stringify(interaction);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildInteractions(
  brief: UiBrief,
  briefPage: UiBriefPage,
  interactionPage: InteractionPage
): Interaction[] {
  const reqRef = briefPage.reqRefs[0] as ReqId | undefined;
  const interactions: Interaction[] = [];

  for (const transition of interactionPage.transitions) {
    const target = routeOf(brief, transition.to);
    interactions.push(
      compact({
        trigger: transition.trigger,
        action: "navigate",
        ...(target === undefined ? {} : { target }),
        ...(reqRef === undefined ? {} : { reqRef }),
      })
    );
  }

  for (const trigger of interactionPage.triggers) {
    interactions.push(
      compact({
        trigger: trigger.action,
        action: trigger.reaction,
        ...(trigger.nodeId === undefined ? {} : { nodeId: trigger.nodeId }),
        ...(reqRef === undefined ? {} : { reqRef }),
      })
    );
  }

  return dedupeInteractions(interactions);
}

function mergeStates(
  base: Record<string, PageState>,
  interactionPage: InteractionPage
): Record<string, PageState> {
  const states = structuredClone(base);
  for (const [name, items] of Object.entries(interactionPage.states)) {
    const description = items.length > 0 ? items.join("; ") : undefined;
    const existing = states[name];
    if (existing === undefined) {
      states[name] = compact({ name, ...(description === undefined ? {} : { description }) });
    } else if (existing.description === undefined && description !== undefined) {
      states[name] = { ...existing, description };
    }
  }
  return states;
}

function buildMotion(
  spec: PageSpec,
  bindings: MotionSpec["bindings"] | undefined,
  motionSpec: MotionSpec
): PageMotion | undefined {
  if (bindings === undefined || bindings.length === 0) return undefined;

  const used = [...new Set(bindings.map((binding) => binding.preset))].sort();
  const presets: Record<string, PageMotionPreset> = {};
  for (const name of used) {
    const preset = motionSpec.presets[name];
    if (preset !== undefined) {
      // Page Specs carry CSS values, while M1 presets may name an easing token.
      const easing = motionSpec.tokens.easing[preset.easing] ?? preset.easing;
      presets[name] = { ...preset, easing };
    }
  }

  return {
    presets,
    bindings: bindings.map((binding) => {
      if (binding.nodeId === undefined) return { preset: binding.preset };
      const target = resolveMotionTarget(spec, binding.nodeId);
      return target === undefined
        ? { nodeId: binding.nodeId, preset: binding.preset }
        : { nodeId: target.id, preset: binding.preset };
    }),
    reducedMotion: motionSpec.reducedMotion,
  };
}

function walkAssets(node: SpecNode, pageId: string, out: AssetReference[]): void {
  const path = `${pageId}:${node.type}${node.id === undefined ? "" : `#${node.id}`}`;
  if (node.assetRef !== undefined) {
    out.push({ pageId, path, assetId: node.assetRef });
  }
  const props = node.props ?? {};
  if (typeof props.assetRef === "string" && props.assetRef.length > 0) {
    out.push({ pageId, path, assetId: props.assetRef });
  }
  if (
    node.type === "QuickAction" &&
    typeof props.icon === "string" &&
    props.icon.length > 0
  ) {
    out.push({ pageId, path, assetId: props.icon });
  }
  if (node.type === "Icon" && typeof props.name === "string" && props.name.length > 0) {
    out.push({ pageId, path, assetId: props.name });
  }

  for (const children of Object.values(node.slots ?? {})) {
    for (const child of children) walkAssets(child, pageId, out);
  }
  for (const child of node.children ?? []) walkAssets(child, pageId, out);
}

export function collectAssetReferences(specs: PageSpec[]): AssetReference[] {
  const references: AssetReference[] = [];
  for (const spec of specs) walkAssets(spec.layout, spec.meta.pageId, references);
  return references;
}

/** Deduplicate by page + asset id; keep the first path for evidence. */
export function uniqueAssetReferences(references: AssetReference[]): AssetReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.pageId}:${reference.assetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Apply M1 artifacts to compiled Page Specs. The mapper is deterministic and
 * does not mutate the base specs or the brief.
 */
export function applySpecs(input: SpecEngineerInput): PageSpec[] {
  const briefPages = new Map(input.brief.ia.pages.map((page) => [page.id, page]));
  const interactionPages = new Map(
    input.interactionSpec.pages.map((page) => [page.id, page])
  );
  const motionByPage = new Map<string, MotionSpec["bindings"]>();
  for (const binding of input.motionSpec.bindings) {
    const list = motionByPage.get(binding.pageId) ?? [];
    list.push(binding);
    motionByPage.set(binding.pageId, list);
  }

  return input.baseSpecs.map((base) => {
    const spec = structuredClone(base);
    const briefPage = briefPages.get(spec.meta.pageId);
    if (briefPage === undefined) return spec;

    const interactionPage = interactionPages.get(spec.meta.pageId);
    if (interactionPage !== undefined) {
      spec.interactions = buildInteractions(input.brief, briefPage, interactionPage);
      spec.states = mergeStates(spec.states, interactionPage);
    }

    const motion = buildMotion(
      spec,
      motionByPage.get(spec.meta.pageId),
      input.motionSpec
    );
    if (motion !== undefined) spec.motion = motion;

    const defaults = new Set(spec.traceability.designDefaults);
    if (motion !== undefined) {
      for (const preset of Object.keys(motion.presets)) {
        defaults.add(`motion:${preset}`);
      }
    }
    for (const reference of collectAssetReferences([spec])) {
      defaults.add(`asset:${reference.assetId}`);
    }
    spec.traceability.designDefaults = [...defaults].sort();

    return spec;
  });
}
