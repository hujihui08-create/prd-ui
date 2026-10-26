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
}

/**
 * Index every identified node by its spec id. Nodes without an id are skipped:
 * generated specs guarantee ids, and inventing a positional key would report
 * every reorder as remove+add.
 */
function collect(root: SpecNode): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  const visit = (node: SpecNode, path: string, parentId?: string): void => {
    if (node.id) {
      entries.set(node.id, { node, path, ...(parentId === undefined ? {} : { parentId }) });
    }
    (node.children ?? []).forEach((child, index) =>
      visit(child, `${path}.children[${index}]`, node.id)
    );
    for (const [slot, nodes] of Object.entries<SpecNode[]>(node.slots ?? {})) {
      nodes.forEach((child, index) =>
        visit(child, `${path}.slots.${slot}[${index}]`, node.id)
      );
    }
  };
  visit(root, "layout");
  return entries;
}

export function diffPageStructure(before: PageSpec, after: PageSpec): StructurePageDiff {
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
  }
  for (const [id, entry] of left) {
    if (!right.has(id)) removed.push({ specId: id, path: entry.path, type: entry.node.type });
  }

  return { pageId: after.meta.pageId, added, removed, changed };
}
