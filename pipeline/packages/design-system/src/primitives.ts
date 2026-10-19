/**
 * Layout primitives are structural nodes the compiler may emit anywhere.
 * They are not catalog components: they have no contract entries, no
 * availability status, and are skipped by component availability validation.
 */
export const layoutPrimitives = new Set(["Text", "Grid", "Row", "Stack", "Icon"]);

export function isLayoutPrimitive(type: string): boolean {
  return layoutPrimitives.has(type);
}
