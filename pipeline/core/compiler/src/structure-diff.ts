import type {
  PageSpec,
  SpecNode,
  StructureNodeChange,
  StructurePageDiff,
} from "@prd-ui/contracts";

interface Entry {
  node: SpecNode;
  path: string;
  parentId?: string;
  /** Slot key of the containing parent; absent for `children`. */
  slot?: string;
}

/**
 * Index every identified node by its spec id. Nodes without an id are skipped:
 * generated specs guarantee ids, and inventing a positional key would report
 * every reorder as remove+add.
 */
function collect(root: SpecNode): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  const visit = (node: SpecNode, path: string, parentId?: string, slot?: string): void => {
    if (node.id) {
      entries.set(node.id, {
        node,
        path,
        ...(parentId === undefined ? {} : { parentId }),
        ...(slot === undefined ? {} : { slot }),
      });
    }
    (node.children ?? []).forEach((child, index) =>
      visit(child, `${path}.children[${index}]`, node.id)
    );
    for (const [slotName, nodes] of Object.entries<SpecNode[]>(node.slots ?? {})) {
      nodes.forEach((child, index) =>
        visit(child, `${path}.slots.${slotName}[${index}]`, node.id, slotName)
      );
    }
  };
  visit(root, "layout");
  return entries;
}

function sortedSlotKeys(node: SpecNode): string[] {
  return Object.keys(node.slots ?? {}).sort();
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

  for (const [id, entry] of right) {
    const previous = left.get(id);
    if (!previous) {
      added.push({ specId: id, path: entry.path, type: entry.node.type });
      continue;
    }
    if (previous.node.type !== entry.node.type) {
      changed.push({
        specId: id,
        kind: "type",
        before: previous.node.type,
        after: entry.node.type,
      });
    }
    const beforeTitle =
      typeof previous.node.props?.title === "string" ? previous.node.props.title : undefined;
    const afterTitle =
      typeof entry.node.props?.title === "string" ? entry.node.props.title : undefined;
    if (beforeTitle !== afterTitle) {
      changed.push({
        specId: id,
        kind: "prop",
        property: "title",
        ...(beforeTitle === undefined ? {} : { before: beforeTitle }),
        ...(afterTitle === undefined ? {} : { after: afterTitle }),
      });
    }
    if (previous.parentId !== entry.parentId) {
      changed.push({
        specId: id,
        kind: "moved",
        ...(previous.parentId === undefined ? {} : { before: previous.parentId }),
        ...(entry.parentId === undefined ? {} : { after: entry.parentId }),
      });
    }
    // A parent change also reports its slot change: both before/after values
    // stay meaningful, so consumers see the full container move.
    if (previous.slot !== entry.slot) {
      changed.push({
        specId: id,
        kind: "slot",
        before: previous.slot ?? "children",
        after: entry.slot ?? "children",
      });
    }
  }
  for (const [id, entry] of left) {
    if (!right.has(id)) removed.push({ specId: id, path: entry.path, type: entry.node.type });
  }

  // An empty slot key that appears or disappears changes no node's container,
  // so it is reported on the matched parent as a slot-key list change.
  for (const [id, entry] of right) {
    const previous = left.get(id);
    if (!previous) continue;
    const beforeKeys = sortedSlotKeys(previous.node);
    const afterKeys = sortedSlotKeys(entry.node);
    const beforeSet = new Set(beforeKeys);
    const afterSet = new Set(afterKeys);
    const addedEmpty = afterKeys.some(
      (key) => !beforeSet.has(key) && (entry.node.slots?.[key]?.length ?? 0) === 0
    );
    const removedEmpty = beforeKeys.some(
      (key) => !afterSet.has(key) && (previous.node.slots?.[key]?.length ?? 0) === 0
    );
    if (addedEmpty || removedEmpty) {
      changed.push({
        specId: id,
        kind: "slot",
        property: "slots",
        ...(beforeKeys.length === 0 ? {} : { before: beforeKeys.join(",") }),
        ...(afterKeys.length === 0 ? {} : { after: afterKeys.join(",") }),
      });
    }
  }

  return { pageId: after.meta.pageId, added, removed, changed };
}
