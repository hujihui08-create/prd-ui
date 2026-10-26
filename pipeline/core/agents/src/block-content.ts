import { BlockContentDraftSchema, type SpecNode } from "@prd-ui/contracts";
import type { AgentValidation } from "./contracts.js";

export const BLOCK_CONTENT_ROLE = "block-content" as const;

/**
 * Page chrome that may never appear in a regenerated block, at the root or
 * nested. The shell, top bar, tab bar, and bottom navigation stay owned by the
 * page assembly; a block only fills one content slot.
 */
const FORBIDDEN_BLOCK_TYPES = new Set([
  "MobileShell",
  "PageShell",
  "TopBar",
  "TabBar",
  "BottomNav",
]);

/**
 * `splitBlocks` names every block `<pageId>.<slot>.<index>`: at least three
 * dot-separated segments with a numeric index. A draft whose `blockId` does
 * not fit that shape cannot address a real block, so it fails closed instead
 * of being substituted into another slot.
 */
const BLOCK_ID_PATTERN = /^[^.\s]+(?:\.[^.\s]+){2,}$/;
const BLOCK_INDEX_PATTERN = /^\d+$/;

export interface BlockContentPromptInput {
  pageId: string;
  blockId: string;
  role: string;
  allowedComponents: string[];
  requiredStates: string[];
  baseline: unknown;
}

function contentComponents(allowedComponents: string[]): string[] {
  return allowedComponents.filter((type) => !FORBIDDEN_BLOCK_TYPES.has(type));
}

export function blockContentPrompt(input: BlockContentPromptInput): string {
  const allowed = contentComponents(input.allowedComponents);
  return [
    `You are filling one block of a mobile page. Page: ${input.pageId}. Block: ${input.blockId} (${input.role}).`,
    `Allowed component types: ${allowed.length === 0 ? "(none)" : allowed.join(", ")}.`,
    `Required states (metadata only): ${input.requiredStates.join(", ") || "(none)"}.`,
    "They are page-level overrides, not extra content. Do not add loading, empty, or error",
    "variants and do not render alternate states inline.",
    "Keep every baseline node that already represents those states exactly as it is;",
    "do not drop hidden state placeholders.",
    "Do not emit MobileShell, PageShell, TopBar, TabBar, BottomNav, or page-level actions,",
    "at the root or nested inside the block.",
    "Do not call tools. Do not read or write files; every input you need is in this prompt.",
    "Preserve every existing baseline node id exactly, including hidden state placeholders and",
    "nested children. Only nodes you newly create may use a `<blockId>.` prefix.",
    "Return only a BlockContentDraft JSON object with schemaVersion, blockId, and root.",
    `Baseline block JSON:\n${JSON.stringify(input.baseline, null, 2)}`,
  ].join("\n");
}

function isBlockId(value: string): boolean {
  if (!BLOCK_ID_PATTERN.test(value)) return false;
  return BLOCK_INDEX_PATTERN.test(value.slice(value.lastIndexOf(".") + 1));
}

function walk(node: SpecNode, visit: (node: SpecNode) => void): void {
  visit(node);
  (node.children ?? []).forEach((child) => walk(child, visit));
  for (const nodes of Object.values(node.slots ?? {})) {
    nodes.forEach((child) => walk(child, visit));
  }
}

function forbiddenType(node: SpecNode): string | undefined {
  let found: string | undefined;
  walk(node, (current) => {
    if (found === undefined && FORBIDDEN_BLOCK_TYPES.has(current.type)) {
      found = current.type;
    }
  });
  return found;
}

/**
 * Validate one block draft. The caller that knows the requested block binds
 * `expectedBlockId`, so a well-formed but different block id is rejected before
 * it can be substituted into another slot. Page chrome is rejected at any
 * depth, not only as the root.
 */
export function validateBlockContent(
  value: unknown,
  expectedBlockId?: string
): AgentValidation {
  const parsed = BlockContentDraftSchema.safeParse(value);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }
  if (!isBlockId(parsed.data.blockId)) {
    return {
      success: false,
      error: `BLOCK_CONTENT_BLOCK_ID_INVALID: ${parsed.data.blockId} is not a block id`,
    };
  }
  if (expectedBlockId !== undefined && parsed.data.blockId !== expectedBlockId) {
    return {
      success: false,
      error: `BLOCK_CONTENT_ID_MISMATCH: expected ${expectedBlockId}, got ${parsed.data.blockId}`,
    };
  }
  const chrome = forbiddenType(parsed.data.root);
  if (chrome !== undefined) {
    return {
      success: false,
      error: `BLOCK_CONTENT_CHROME: ${chrome} cannot appear in a block`,
    };
  }
  return { success: true, data: parsed.data };
}
