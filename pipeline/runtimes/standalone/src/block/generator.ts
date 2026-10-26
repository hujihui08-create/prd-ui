import { readFile } from "node:fs/promises";
import path from "node:path";
import { BlockContentDraftSchema, type BlockContentDraft } from "@prd-ui/contracts";

export interface BlockGenerateInput {
  pageId: string;
  blockId: string;
  prompt: string;
}

export interface BlockGeneratorPort {
  generate(input: BlockGenerateInput): Promise<BlockContentDraft>;
}

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
