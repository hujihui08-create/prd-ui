import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  BlockContentDraftSchema,
  type AgentUsage,
  type BlockContentDraft,
  type BlockSpec,
} from "@prd-ui/contracts";

export interface BlockGenerateInput {
  pageId: string;
  blockId: string;
  prompt: string;
}

export interface BlockGeneratorPort {
  generate(input: BlockGenerateInput): Promise<BlockContentDraft>;
  /**
   * Drain the model usage accumulated since the last call. Fixture mode does
   * not implement this (it makes no model calls), so cost stays 0.
   */
  takeUsage?(): AgentUsage | undefined;
}

export interface BlockGeneratorContext {
  /** Run directory handed to the model transport (`<runId>/dsh/<pageId>/<blockId>`). */
  runDir: string;
}

/**
 * A model generator is configured per block (role, allowed components,
 * required states, baseline root), so the experiment asks for a generator
 * instance per block instead of sharing one mutable instance.
 */
export type BlockGeneratorFactory = (
  block: BlockSpec,
  context: BlockGeneratorContext
) => BlockGeneratorPort;

/**
 * Deterministic block generator backed by committed JSON fixtures.
 *
 * Fixture layout: `<fixturesDir>/<pageId>/<blockId>.json`, each file a plain
 * `BlockContentDraft`. The path is the source of truth; a draft whose
 * `blockId` disagrees with the requested block is rejected rather than
 * silently substituted into another slot.
 */
export class FixtureBlockGenerator implements BlockGeneratorPort {
  constructor(private readonly fixturesDir: string) {}

  async generate(input: BlockGenerateInput): Promise<BlockContentDraft> {
    const file = path.join(this.fixturesDir, input.pageId, `${input.blockId}.json`);
    const draft = BlockContentDraftSchema.parse(JSON.parse(await readFile(file, "utf8")));
    if (draft.blockId !== input.blockId) {
      throw new Error(
        `BLOCK_FIXTURE_ID_MISMATCH: ${file} declares ${draft.blockId}, expected ${input.blockId}`
      );
    }
    return draft;
  }
}
