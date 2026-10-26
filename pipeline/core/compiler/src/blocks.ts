import { createHash } from "node:crypto";
import type {
  BlockManifest,
  BlockSpec,
  Finding,
  PageSpec,
  SpecNode,
} from "@prd-ui/contracts";
import type { ArchetypeDef } from "@prd-ui/design-system";
import { isLayoutPrimitive } from "@prd-ui/design-system";

/** Slots owned by the page shell; they never become blocks. */
const SHELL_SLOTS = new Set(["top-bar", "tab-bar", "bottom-nav", "actions", "footer", "header"]);
const SHELL_TYPES = new Set(["MobileShell", "PageShell"]);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${key}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashNode(node: SpecNode): string {
  return `sha256:${createHash("sha256").update(canonical(node)).digest("hex")}`;
}

function slug(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length === 0 ? fallback : text.replace(/\s+/g, "-").slice(0, 40);
}

/** The slots whose nodes become blocks, in page order. */
function contentSlots(spec: PageSpec): Array<[string, SpecNode[]]> {
  return Object.entries(spec.layout.slots ?? {}).filter(([slot]) => !SHELL_SLOTS.has(slot));
}

function findWrapper(
  manifest: BlockManifest,
  slot: string
): BlockManifest["shell"]["wrappers"][number] | undefined {
  return manifest.shell.wrappers.find((entry) => entry.slot === slot);
}

/**
 * Resolve the node a wrapper entry refers to. An id-less wrapper is recorded
 * with a synthetic specId, so fall back to the slot's single node — the same
 * rule `splitBlocks` used to detect the wrapper.
 */
function resolveWrapperTarget(
  nodes: SpecNode[],
  wrapper: BlockManifest["shell"]["wrappers"][number]
): SpecNode | undefined {
  return nodes.find((node) => node.id === wrapper.specId) ?? (nodes.length === 1 ? nodes[0] : undefined);
}

/** The Section shape that `splitBlocks` treats as an assembly wrapper. */
function isAssemblyWrapper(node: SpecNode | undefined): node is SpecNode {
  return node !== undefined && node.type === "Section" && (node.children?.length ?? 0) >= 2;
}

/**
 * Split a Page Spec into independently regenerable blocks.
 *
 * Every non-shell root slot contributes its children as blocks. A content slot
 * holding exactly one `Section` with two or more children treats that Section
 * as an assembly wrapper: the Section stays part of the shell and its children
 * become the blocks (so `today` yields one block per card).
 */
export function splitBlocks(spec: PageSpec, archetype: ArchetypeDef): BlockManifest {
  const blocks: BlockSpec[] = [];
  const wrappers: BlockManifest["shell"]["wrappers"] = [];

  for (const [slot, nodes] of contentSlots(spec)) {
    let candidates = nodes;
    if (nodes.length === 1 && isAssemblyWrapper(nodes[0])) {
      const wrapper = nodes[0];
      wrappers.push({
        slot,
        specId: wrapper.id ?? `${spec.meta.pageId}.${slot}.wrapper`,
        type: wrapper.type,
        padding: structuredClone(wrapper.props?.padding),
        gap: structuredClone(wrapper.props?.gap),
      });
      candidates = wrapper.children ?? [];
    }
    candidates.forEach((root, index) => {
      const blockId = `${spec.meta.pageId}.${slot}.${index}`;
      blocks.push({
        schemaVersion: "1.0",
        blockId,
        pageId: spec.meta.pageId,
        slot,
        index,
        role: slug(root.props?.title, root.type.toLowerCase()),
        allowedComponents: [...archetype.allowedComponents],
        tokenProfile: spec.meta.profile,
        requiredStates: [...archetype.requiredStates],
        root: structuredClone(root),
        hash: hashNode(root),
      });
    });
  }

  return {
    schemaVersion: "1.0",
    project: spec.meta.project,
    pageId: spec.meta.pageId,
    shell: {
      rootType: spec.layout.type,
      slots: Object.keys(spec.layout.slots ?? {}),
      wrappers,
    },
    blocks,
    skipped: [],
  };
}

/**
 * Rebuild a Page Spec from its blocks. Every block root is deep-cloned so the
 * result never shares nodes with the manifest.
 */
export function assembleBlocks(spec: PageSpec, manifest: BlockManifest): PageSpec {
  const assembled = structuredClone(spec);
  for (const [slot, nodes] of contentSlots(assembled)) {
    const slotBlocks = manifest.blocks
      .filter((block) => block.slot === slot)
      .sort((left, right) => left.index - right.index)
      .map((block) => structuredClone(block.root));
    const wrapper = findWrapper(manifest, slot);
    if (wrapper) {
      const target = resolveWrapperTarget(nodes, wrapper);
      if (target) target.children = slotBlocks;
    } else {
      assembled.layout.slots![slot] = slotBlocks;
    }
  }
  return assembled;
}

function walk(
  node: SpecNode,
  visit: (node: SpecNode, parent?: SpecNode) => void,
  parent?: SpecNode
): void {
  visit(node, parent);
  (node.children ?? []).forEach((child) => walk(child, visit, node));
  for (const nodes of Object.values(node.slots ?? {})) {
    nodes.forEach((child) => walk(child, visit, node));
  }
}

/** Ids owned by the page shell, including valid assembly wrappers. */
function shellNodeIds(spec: PageSpec, manifest: BlockManifest): Set<string> {
  const ids = new Set<string>();
  const collect = (node: SpecNode): void => {
    walk(node, (current) => {
      if (current.id) ids.add(current.id);
    });
  };
  if (spec.layout.id) ids.add(spec.layout.id);
  for (const [slot, nodes] of Object.entries(spec.layout.slots ?? {})) {
    if (SHELL_SLOTS.has(slot)) nodes.forEach(collect);
  }
  for (const wrapper of manifest.shell.wrappers) {
    const nodes = spec.layout.slots?.[wrapper.slot] ?? [];
    if (nodes.length === 1 && isAssemblyWrapper(nodes[0])) {
      const id = resolveWrapperTarget(nodes, wrapper)?.id;
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * Verify a block manifest against the page it was split from: no shell types,
 * no duplicate node ids (including shell ids), block order/count matches every
 * content slot, and split → assemble reproduces the page exactly.
 */
export function verifyBlockManifest(spec: PageSpec, manifest: BlockManifest): Finding[] {
  const findings: Finding[] = [];
  const counters = new Map<string, number>();
  const push = (ruleId: string, location: string, evidence: string, issue: string): void => {
    const next = (counters.get(ruleId) ?? 0) + 1;
    counters.set(ruleId, next);
    findings.push({
      id: `${ruleId}-${next}`,
      ruleId,
      severity: "blocker",
      category: "block",
      location,
      evidence,
      issue,
    });
  };

  if (manifest.pageId !== spec.meta.pageId) {
    push(
      "BLOCK_PAGE_MISMATCH",
      manifest.pageId,
      spec.meta.pageId,
      "Block manifest page does not match the Page Spec."
    );
  }

  const knownSlots = new Set(contentSlots(spec).map(([slot]) => slot));
  const ids = shellNodeIds(spec, manifest);
  for (const block of manifest.blocks) {
    if (!knownSlots.has(block.slot)) {
      push(
        "BLOCK_SLOT_UNKNOWN",
        block.blockId,
        block.slot,
        "A block must target a content slot of the page."
      );
    }
    walk(block.root, (node) => {
      if (SHELL_TYPES.has(node.type)) {
        push(
          "BLOCK_SHELL_TYPE",
          block.blockId,
          node.type,
          "A block must not contain the page shell."
        );
      }
      if (!node.id) return;
      if (ids.has(node.id)) {
        push("BLOCK_DUPLICATE_ID", block.blockId, node.id, `Duplicate node id ${node.id}.`);
      }
      ids.add(node.id);
    });
  }

  for (const [slot, nodes] of contentSlots(spec)) {
    const wrapper = findWrapper(manifest, slot);
    const roots = wrapper ? (resolveWrapperTarget(nodes, wrapper)?.children ?? []) : nodes;
    const actualIds = roots.map((node) => node.id ?? "");
    const blockIds = manifest.blocks
      .filter((block) => block.slot === slot)
      .sort((left, right) => left.index - right.index)
      .map((block) => block.root.id ?? "");
    if (actualIds.join("|") !== blockIds.join("|")) {
      push(
        "BLOCK_ORDER",
        slot,
        blockIds.join(","),
        "Block order or count does not match the page."
      );
    }
  }

  if (canonical(assembleBlocks(spec, manifest)) !== canonical(spec)) {
    push(
      "BLOCK_ROUNDTRIP_MISMATCH",
      manifest.pageId,
      "roundtrip",
      "split → assemble changed the page tree."
    );
  }

  return findings;
}

/**
 * Verify the block contract itself, independent of the assembly round-trip:
 *
 * - every non-primitive component in a block root is in that block's
 *   `allowedComponents` list (`BLOCK_COMPONENT_NOT_ALLOWED`);
 * - `allowedComponents` is not empty;
 * - every `requiredStates` entry exists on the assembled page
 *   (`BLOCK_REQUIRED_STATE_MISSING`), and the list itself is not empty.
 *
 * These checks run on the regenerated block, so a model that introduces an
 * undeclared component fails the block gate instead of being masked by a
 * successful round-trip.
 */
export function verifyBlockContracts(spec: PageSpec, manifest: BlockManifest): Finding[] {
  const findings: Finding[] = [];
  const push = (ruleId: string, location: string, evidence: string, issue: string): void => {
    findings.push({
      id: `${ruleId}-${findings.length + 1}`,
      ruleId,
      severity: "blocker",
      category: "block",
      location,
      evidence,
      issue,
    });
  };
  for (const block of manifest.blocks) {
    if (block.allowedComponents.length === 0) {
      push(
        "BLOCK_ALLOWED_COMPONENTS_EMPTY",
        block.blockId,
        block.root.type,
        "A block must declare the components it may contain."
      );
    }
    const allowed = new Set(block.allowedComponents);
    walk(block.root, (node) => {
      if (isLayoutPrimitive(node.type)) return;
      if (!allowed.has(node.type)) {
        push(
          "BLOCK_COMPONENT_NOT_ALLOWED",
          block.blockId,
          node.type,
          `Component "${node.type}" is not in the block's allowedComponents.`
        );
      }
    });
    if (block.requiredStates.length === 0) {
      push(
        "BLOCK_REQUIRED_STATES_EMPTY",
        block.blockId,
        block.blockId,
        "A block must declare its required page states."
      );
    }
    for (const state of block.requiredStates) {
      if (!(state in spec.states)) {
        push(
          "BLOCK_REQUIRED_STATE_MISSING",
          block.blockId,
          state,
          `Required state "${state}" is missing from the assembled page.`
        );
      }
    }
  }
  return findings;
}
