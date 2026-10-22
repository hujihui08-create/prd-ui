import type { PageSpec, SpecNode } from "@prd-ui/contracts";

export interface MotionTarget {
  preset: string;
  durationMs: number;
  easing: string;
  staggerMs?: number;
}

export interface MotionContext {
  pagePreset?: MotionTarget;
  byNode: Map<string, MotionTarget>;
  byGroup: Map<string, MotionTarget>;
  groupCounts: Map<string, number>;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Collect every motion target the page can address. Resolved M1 bindings may
 * contain duplicates for one node or group (for example two row aliases), so
 * later bindings for an already-bound target are ignored: the first binding
 * wins and renderer output does not depend on Map overwrite order.
 */
export function createMotionContext(spec: PageSpec): MotionContext {
  const ctx: MotionContext = { byNode: new Map(), byGroup: new Map(), groupCounts: new Map() };
  const motion = spec.motion;
  if (motion === undefined) return ctx;
  const ids = new Set<string>();
  const groups = new Set<string>();
  const walk = (node: SpecNode): void => {
    if (node.id !== undefined) ids.add(node.id);
    if (node.motionGroup !== undefined) groups.add(node.motionGroup);
    for (const children of Object.values(node.slots ?? {})) children.forEach(walk);
    (node.children ?? []).forEach(walk);
  };
  walk(spec.layout);
  for (const binding of motion.bindings) {
    const preset = motion.presets[binding.preset];
    if (preset === undefined) continue;
    const entry: MotionTarget = {
      preset: binding.preset,
      durationMs: preset.durationMs,
      easing: preset.easing,
      ...(preset.staggerMs === undefined ? {} : { staggerMs: preset.staggerMs }),
    };
    if (binding.nodeId === undefined) {
      if (ctx.pagePreset === undefined) ctx.pagePreset = entry;
    } else if (ids.has(binding.nodeId)) {
      if (!ctx.byNode.has(binding.nodeId)) ctx.byNode.set(binding.nodeId, entry);
    } else if (groups.has(binding.nodeId)) {
      if (!ctx.byGroup.has(binding.nodeId)) ctx.byGroup.set(binding.nodeId, entry);
    }
  }
  return ctx;
}

/**
 * Render the data attributes and custom-property style for one node. The
 * returned `style` is a bare declaration list so callers can append it to an
 * existing inline style instead of emitting a second `style` attribute.
 */
export function motionAttrs(
  node: SpecNode,
  ctx: MotionContext | undefined,
  root = false
): { attrs: string; style: string } {
  if (ctx === undefined) return { attrs: "", style: "" };
  const attrs: string[] = [];
  let style = "";
  if (node.id !== undefined) attrs.push(`data-node-id="${esc(node.id)}"`);
  if (node.motionGroup !== undefined) attrs.push(`data-motion-group="${esc(node.motionGroup)}"`);
  const entry = root
    ? ctx.pagePreset
    : (node.id === undefined ? undefined : ctx.byNode.get(node.id)) ??
      (node.motionGroup === undefined ? undefined : ctx.byGroup.get(node.motionGroup));
  if (entry !== undefined) {
    attrs.push(`data-motion-preset="${esc(entry.preset)}"`);
    style = `--motion-duration:${entry.durationMs}ms;--motion-ease:${esc(entry.easing)}`;
    if (entry.staggerMs !== undefined) style += `;--motion-stagger:${entry.staggerMs}ms`;
    if (node.motionGroup !== undefined) {
      const index = ctx.groupCounts.get(node.motionGroup) ?? 0;
      ctx.groupCounts.set(node.motionGroup, index + 1);
      attrs.push(`data-motion-index="${index}"`);
    }
  }
  return { attrs: attrs.length === 0 ? "" : ` ${attrs.join(" ")}`, style };
}

/**
 * Motion CSS uses only transform/opacity so presets never change layout. Under
 * prefers-reduced-motion every preset is disabled first; a `fade` fallback
 * re-enables opacity-only swaps at 120ms while `none`/`instant` stay static.
 */
export function renderMotionCss(): string {
  return `
@keyframes motion-enter-fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes motion-page-push{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
@keyframes motion-sheet-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes motion-state-swap{from{opacity:0}to{opacity:1}}
@keyframes motion-confirm-collapse{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.98)}}
@keyframes motion-toast-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
[data-motion-preset]{animation-duration:var(--motion-duration,200ms);animation-timing-function:var(--motion-ease,ease-out);animation-fill-mode:both;}
[data-motion-preset="enter-fade"]{animation-name:motion-enter-fade}
[data-motion-preset="page-push"]{animation-name:motion-page-push}
[data-motion-preset="sheet-up"]{animation-name:motion-sheet-up}
[data-motion-preset="state-swap"]{animation-name:motion-state-swap}
[data-motion-preset="toast-in"]{animation-name:motion-toast-in}
[data-motion-preset="confirm-collapse"]{animation-name:motion-confirm-collapse}
[data-motion-preset="list-stagger"]{animation-name:motion-enter-fade;animation-delay:calc(var(--motion-stagger,40ms) * var(--motion-index,0))}
[data-motion-preset="press-feedback"]:active{transform:scale(.98)}
@media (prefers-reduced-motion: reduce){
  [data-motion-preset]{animation:none!important;transition:none!important}
  [data-motion-fallback="fade"] [data-motion-preset]{animation-name:motion-state-swap!important;animation-duration:120ms!important}
}
`;
}
