/** Recursively sort object keys so signed brief hashes are stable. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortValue(entry)])
    );
  }
  return value;
}

export function briefHash(
  hashText: (text: string) => string,
  brief: unknown
): string {
  return hashText(canonicalJson(brief));
}

const PLACEHOLDER = /\bTBD\b|\bTODO\b|待确认|待补充|待定|【|】/i;

/** Return JSON-ish paths whose strings contain unresolved placeholders. */
export function findPlaceholders(value: unknown, path = "$"): string[] {
  if (typeof value === "string") {
    return PLACEHOLDER.test(value) ? [`${path}: ${value}`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findPlaceholders(entry, `${path}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
      findPlaceholders(entry, `${path}.${key}`)
    );
  }
  return [];
}
