import type {
  PageSpec,
  SpecNode,
  StructureNodeChange,
  StructurePageDiff,
} from "@prd-ui/contracts";

interface Entry {
  node: SpecNode;
  path: string;
  /** `id:<id>` for identified nodes, `path:<path>#<type>` otherwise. */
  key: string;
  /** Key of the containing node; undefined at the page root. */
  parentKey?: string;
  /** Human-readable parent reference: node id, or the parent path if id-less. */
  parentRef?: string;
  /** Slot key of the containing parent; absent for `children`. */
  slot?: string;
  idless: boolean;
}

/**
 * Text-bearing props compared between matched nodes. They are the copy that a
 * regenerated or hand-edited Page Spec can change without touching structure.
 */
export const TEXT_PROPS = [
  "title",
  "text",
  "label",
  "subtitle",
  "description",
  "value",
  "caption",
  "placeholder",
  "message",
  "heading",
  "name",
  "meta",
  "actionLabel",
  "emptyText",
  "helpText",
] as const;

function propText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Index every node by a stable key. Identified nodes key on their spec id.
 * Id-less nodes fall back to a positional path key (`path:<path>#<type>`) so
 * copy/type changes on unlabelled nodes are still reported; inserting or
 * removing an earlier sibling shifts those paths, which is the documented
 * positional-fallback limitation.
 */
function collect(root: SpecNode): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  const visit = (
    node: SpecNode,
    path: string,
    parent?: Entry,
    slot?: string
  ): void => {
    const idless = node.id === undefined || node.id.length === 0;
    const key = idless ? `path:${path}#${node.type}` : `id:${node.id}`;
    const entry: Entry = {
      node,
      path,
      key,
      ...(parent === undefined
        ? {}
        : { parentKey: parent.key, parentRef: parent.node.id ?? parent.path }),
      ...(slot === undefined ? {} : { slot }),
      idless,
    };
    entries.set(key, entry);
    (node.children ?? []).forEach((child, index) =>
      visit(child, `${path}.children[${index}]`, entry)
    );
    for (const [slotName, nodes] of Object.entries<SpecNode[]>(node.slots ?? {})) {
      nodes.forEach((child, index) =>
        visit(child, `${path}.slots.${slotName}[${index}]`, entry, slotName)
      );
    }
  };
  visit(root, "layout");
  return entries;
}

function sortedSlotKeys(node: SpecNode): string[] {
  return Object.keys(node.slots ?? {}).sort();
}

function changeTarget(entry: Entry): { specId: string; idless?: true } {
  return entry.idless
    ? { specId: entry.path, idless: true }
    : { specId: entry.node.id! };
}

export function diffPageStructure(before: PageSpec, after: PageSpec): StructurePageDiff {
  if (before.meta.pageId !== after.meta.pageId) {
    throw new Error(
      `PAGE_ID_MISMATCH: before ${before.meta.pageId}, after ${after.meta.pageId}`
    );
  }
  const left = collect(before.layout);
  const right = collect(after.layout);
  const added: StructurePageDiff["added"] = [];
  const removed: StructurePageDiff["removed"] = [];
  const changed: StructureNodeChange[] = [];

  for (const [key, entry] of right) {
    const previous = left.get(key);
    if (!previous) {
      added.push({
        ...changeTarget(entry),
        path: entry.path,
        type: entry.node.type,
      });
      continue;
    }
    if (previous.node.type !== entry.node.type) {
      changed.push({
        ...changeTarget(entry),
        kind: "type",
        before: previous.node.type,
        after: entry.node.type,
      });
    }
    for (const property of TEXT_PROPS) {
      const beforeText = propText(previous.node.props?.[property]);
      const afterText = propText(entry.node.props?.[property]);
      if (beforeText !== afterText) {
        changed.push({
          ...changeTarget(entry),
          kind: "prop",
          property,
          ...(beforeText === undefined ? {} : { before: beforeText }),
          ...(afterText === undefined ? {} : { after: afterText }),
        });
      }
    }
    if (previous.parentKey !== entry.parentKey) {
      changed.push({
        ...changeTarget(entry),
        kind: "moved",
        ...(previous.parentRef === undefined ? {} : { before: previous.parentRef }),
        ...(entry.parentRef === undefined ? {} : { after: entry.parentRef }),
      });
    }
    // A parent change also reports its slot change: both before/after values
    // stay meaningful, so consumers see the full container move.
    if (previous.slot !== entry.slot) {
      changed.push({
        ...changeTarget(entry),
        kind: "slot",
        before: previous.slot ?? "children",
        after: entry.slot ?? "children",
      });
    }
  }
  for (const [key, entry] of left) {
    if (!right.has(key)) {
      removed.push({
        ...changeTarget(entry),
        path: entry.path,
        type: entry.node.type,
      });
    }
  }

  // An empty slot key that appears or disappears changes no node's container,
  // so it is reported on the matched parent as a slot-key list change.
  for (const [key, entry] of right) {
    const previous = left.get(key);
    if (!previous) continue;
    const beforeKeys = sortedSlotKeys(previous.node);
    const afterKeys = sortedSlotKeys(entry.node);
    const beforeSet = new Set(beforeKeys);
    const afterSet = new Set(afterKeys);
    const addedEmpty = afterKeys.some(
      (slot) => !beforeSet.has(slot) && (entry.node.slots?.[slot]?.length ?? 0) === 0
    );
    const removedEmpty = beforeKeys.some(
      (slot) => !afterSet.has(slot) && (previous.node.slots?.[slot]?.length ?? 0) === 0
    );
    if (addedEmpty || removedEmpty) {
      changed.push({
        ...changeTarget(entry),
        kind: "slot",
        property: "slots",
        ...(beforeKeys.length === 0 ? {} : { before: beforeKeys.join(",") }),
        ...(afterKeys.length === 0 ? {} : { after: afterKeys.join(",") }),
      });
    }
  }

  return { pageId: after.meta.pageId, added, removed, changed };
}
