import {
  AgentRunnerError,
  BLOCK_CONTENT_ROLE,
  blockContentPrompt,
  validateBlockContent,
  type AgentRunnerPort,
} from "@prd-ui/agents";
import {
  mergeAgentUsage,
  type AgentUsage,
  type BlockContentDraft,
} from "@prd-ui/contracts";
import { createDshAgentRunner } from "@prd-ui/runtime-dsh/agent-runner";
import type { BlockGenerateInput, BlockGeneratorPort } from "./generator.js";

export interface DshBlockGeneratorOptions {
  runDir: string;
  dshHome: string;
  profile: string;
  baseline: unknown;
  allowedComponents: string[];
  requiredStates: string[];
  role: string;
  /** Skip the schema repair when the remaining budget cannot afford it. */
  canRepair?: (firstUsage: AgentUsage | undefined) => boolean;
}

/**
 * Model-backed block generator: one dsh call per block (plus at most one
 * schema repair inside the runner) that emits a shell-free `BlockContentDraft`.
 *
 * The experiment owns retries, page assembly, and the budget; this adapter
 * owns only transport plus the block-specific prompt. Usage from every call,
 * including failed attempts, is drained by the caller through `takeUsage` so
 * cost is never silently dropped.
 */
export class DshBlockGenerator implements BlockGeneratorPort {
  private pendingUsage: AgentUsage | undefined;
  private readonly runner: AgentRunnerPort;

  constructor(private readonly options: DshBlockGeneratorOptions) {
    this.runner = createDshAgentRunner({
      dshHome: options.dshHome,
      profile: options.profile,
      cwd: process.cwd(),
    });
  }

  takeUsage(): AgentUsage | undefined {
    const usage = this.pendingUsage;
    this.pendingUsage = undefined;
    return usage;
  }

  private recordUsage(usage: AgentUsage | undefined): void {
    this.pendingUsage = mergeAgentUsage(this.pendingUsage, usage);
  }

  async generate(input: BlockGenerateInput): Promise<BlockContentDraft> {
    let output: unknown;
    try {
      const result = await this.runner.run({
        role: BLOCK_CONTENT_ROLE,
        prompt: blockContentPrompt({
          pageId: input.pageId,
          blockId: input.blockId,
          role: this.options.role,
          allowedComponents: this.options.allowedComponents,
          requiredStates: this.options.requiredStates,
          baseline: this.options.baseline,
        }),
        schema: "BlockContentDraft",
        validate: validateBlockContent,
        runDir: this.options.runDir,
        inputFiles: [],
        ...(this.options.canRepair === undefined
          ? {}
          : { canRepair: this.options.canRepair }),
      });
      this.recordUsage(result.usage);
      output = result.output;
    } catch (error) {
      this.recordUsage(error instanceof AgentRunnerError ? error.usage : undefined);
      throw error;
    }

    const parsed = validateBlockContent(output);
    if (!parsed.success) {
      throw new Error(`BLOCK_CONTENT_INVALID: ${parsed.error}`);
    }
    const draft = parsed.data as BlockContentDraft;
    if (draft.blockId !== input.blockId) {
      throw new Error(`BLOCK_CONTENT_ID_MISMATCH: ${draft.blockId} != ${input.blockId}`);
    }
    return draft;
  }
}
