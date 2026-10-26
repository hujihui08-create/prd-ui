import { BlockContentDraftSchema } from "@prd-ui/contracts";
import type { AgentValidation } from "./contracts.js";

export const BLOCK_CONTENT_ROLE = "block-content" as const;

/**
 * Page chrome that may never be the root of a regenerated block. The block
 * generator fills one content block; the shell, top bar, tab bar, and bottom
 * navigation stay owned by the page assembly.
 */
const FORBIDDEN_ROOT_TYPES = new Set([
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

export function blockContentPrompt(input: BlockContentPromptInput): string {
  return [
    `You are filling one block of a mobile page. Page: ${input.pageId}. Block: ${input.blockId} (${input.role}).`,
    `Allowed component types: ${input.allowedComponents.join(", ")}.`,
    `Required states: ${input.requiredStates.join(", ")}.`,
    "Do not emit MobileShell, PageShell, TopBar, TabBar, BottomNav, or page-level actions.",
    "Do not call tools. Do not read or write files; every input you need is in this prompt.",
    "Keep every node id under the block id prefix and preserve the baseline structure where possible.",
    "Return only a BlockContentDraft JSON object with schemaVersion, blockId, and root.",
    `Baseline block JSON:\n${JSON.stringify(input.baseline, null, 2)}`,
  ].join("\n");
}

function isBlockId(value: string): boolean {
  if (!BLOCK_ID_PATTERN.test(value)) return false;
  return BLOCK_INDEX_PATTERN.test(value.slice(value.lastIndexOf(".") + 1));
}

/**
 * Validate one block draft. The requested-block match is checked by the caller
 * that knows the requested `blockId`; this validator rejects a malformed block
 * id and any page chrome masquerading as block content.
 */
export function validateBlockContent(value: unknown): AgentValidation {
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
  if (FORBIDDEN_ROOT_TYPES.has(parsed.data.root.type)) {
    return {
      success: false,
      error: `BLOCK_CONTENT_SHELL_ROOT: ${parsed.data.root.type} cannot be a block root`,
    };
  }
  return { success: true, data: parsed.data };
}
