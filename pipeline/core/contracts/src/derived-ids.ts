/**
 * Derived ids for material nodes the renderer generates from a single spec
 * node (list rows, tabs, calendar days/cells/blocks). Both the HTML renderer
 * and the Figma plan compiler must use these helpers so plan and HTML nodes
 * pair up in conformance checks.
 */
export const MATERIAL_DERIVED_KINDS: ReadonlySet<string> = new Set([
  "row",
  "tab",
  "cell",
  "block",
  "day",
  "hour",
  "tr",
]);

/** Join a spec node id and the material segment(s) with dots. */
export function derivedNodeId(
  parentId: string,
  ...segments: Array<string | number>
): string {
  return [parentId, ...segments].join(".");
}

/**
 * True only for material derived ids ending in `.kind.N` or `.kind.N.M`.
 * Inner frames such as `day.0.frame` deliberately do not match.
 */
export function isMaterialDerivedId(id: string): boolean {
  const parts = id.split(".");
  const last = parts.at(-1) ?? "";
  const prev = parts.at(-2) ?? "";
  const prev2 = parts.at(-3) ?? "";
  if (MATERIAL_DERIVED_KINDS.has(prev) && /^\d+$/.test(last)) return true;
  return (
    MATERIAL_DERIVED_KINDS.has(prev2) && /^\d+$/.test(prev) && /^\d+$/.test(last)
  );
}
