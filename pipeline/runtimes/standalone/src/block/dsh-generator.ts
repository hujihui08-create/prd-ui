import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AgentRunnerError,
  BLOCK_CONTENT_ROLE,
  blockContentPrompt,
  validateBlockContent,
  type AgentResult,
  type AgentRunnerPort,
} from "@prd-ui/agents";
import {
  mergeAgentUsage,
  type AgentUsage,
  type BlockContentDraft,
} from "@prd-ui/contracts";
import { createDshAgentRunner } from "@prd-ui/runtime-dsh/agent-runner";
import type {
  BlockGenerateInput,
  BlockGenerationUsage,
  BlockGeneratorPort,
} from "./generator.js";

export interface DshBlockGeneratorOptions {
  /** Per-block evidence root: `<runId>/dsh/<pageId>/<blockId>`. */
  runDir: string;
  dshHome: string;
  profile: string;
  baseline: unknown;
  allowedComponents: string[];
  requiredStates: string[];
  role: string;
  /** Skip the schema repair when the remaining budget cannot afford it. */
  canRepair?: (firstUsage: AgentUsage | undefined) => boolean;
  /** Remaining whole-run budget, passed through as `AgentTask.maxCostCny`. */
  remainingBudgetCny?: () => number;
}

interface AttemptEvidence {
  pageId: string;
  blockId: string;
  attempt: number;
  usage?: AgentUsage;
  usageComplete: boolean;
  repairAttempted?: boolean;
  model?: string;
  error?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Model-backed block generator: one dsh call per block (plus at most one
 * schema repair inside the runner) that emits a shell-free `BlockContentDraft`.
 *
 * The experiment owns retries, page assembly, and the budget; this adapter
 * owns transport, the block-specific prompt, and per-call evidence. Usage from
 * every call, including failed attempts, is drained by the caller through
 * `takeUsage`, with `usageComplete` exposed so unknown usage is never free.
 */
export class DshBlockGenerator implements BlockGeneratorPort {
  private pendingUsage: AgentUsage | undefined;
  private pendingUsageComplete = true;
  private pendingCall = false;
  private attempts = 0;
  private readonly runner: AgentRunnerPort;

  constructor(private readonly options: DshBlockGeneratorOptions) {
    this.runner = createDshAgentRunner({
      dshHome: options.dshHome,
      profile: options.profile,
      cwd: process.cwd(),
    });
  }

  takeUsage(): BlockGenerationUsage | undefined {
    if (!this.pendingCall) return undefined;
    const result: BlockGenerationUsage = {
      usageComplete: this.pendingUsageComplete,
      ...(this.pendingUsage === undefined ? {} : { usage: this.pendingUsage }),
    };
    this.pendingUsage = undefined;
    this.pendingUsageComplete = true;
    this.pendingCall = false;
    return result;
  }

  private recordUsage(usage: AgentUsage | undefined, usageComplete: boolean): void {
    this.pendingUsage = mergeAgentUsage(this.pendingUsage, usage);
    this.pendingUsageComplete = this.pendingUsageComplete && usageComplete;
  }

  private async writeEvidence(dir: string, evidence: AttemptEvidence): Promise<void> {
    try {
      await writeFile(
        path.join(dir, "usage.json"),
        `${JSON.stringify({ schemaVersion: "1.0", role: BLOCK_CONTENT_ROLE, ...evidence }, null, 2)}\n`,
        "utf8"
      );
    } catch (error) {
      throw new Error(`BLOCK_EVIDENCE_WRITE_FAILED: ${errorMessage(error)}`);
    }
  }

  async generate(input: BlockGenerateInput): Promise<BlockContentDraft> {
    this.attempts += 1;
    const attempt = this.attempts;
    const attemptDir = path.join(
      this.options.runDir,
      `attempt-${String(attempt).padStart(2, "0")}`
    );
    const prompt = blockContentPrompt({
      pageId: input.pageId,
      blockId: input.blockId,
      role: this.options.role,
      allowedComponents: this.options.allowedComponents,
      requiredStates: this.options.requiredStates,
      baseline: this.options.baseline,
    });
    try {
      await mkdir(attemptDir, { recursive: true });
      await writeFile(path.join(attemptDir, "prompt.md"), `${prompt}\n`, "utf8");
    } catch (error) {
      throw new Error(`BLOCK_EVIDENCE_WRITE_FAILED: ${errorMessage(error)}`);
    }

    this.pendingCall = true;
    let result: AgentResult;
    try {
      result = await this.runner.run({
        role: BLOCK_CONTENT_ROLE,
        prompt,
        schema: "BlockContentDraft",
        validate: (value) => validateBlockContent(value, input.blockId),
        runDir: attemptDir,
        inputFiles: [],
        ...(this.options.canRepair === undefined
          ? {}
          : { canRepair: this.options.canRepair }),
        ...(this.options.remainingBudgetCny === undefined
          ? {}
          : { maxCostCny: Math.max(0, this.options.remainingBudgetCny()) }),
      });
    } catch (error) {
      const usage = error instanceof AgentRunnerError ? error.usage : undefined;
      const usageComplete =
        error instanceof AgentRunnerError && error.usageComplete === true;
      this.recordUsage(usage, usageComplete);
      await this.writeEvidence(attemptDir, {
        pageId: input.pageId,
        blockId: input.blockId,
        attempt,
        usageComplete,
        ...(usage === undefined ? {} : { usage }),
        error: errorMessage(error),
      });
      throw error;
    }

    this.recordUsage(result.usage, result.usageComplete === true);
    await this.writeEvidence(attemptDir, {
      pageId: input.pageId,
      blockId: input.blockId,
      attempt,
      usageComplete: result.usageComplete === true,
      ...(result.usage === undefined ? {} : { usage: result.usage }),
      ...(result.repairAttempted === undefined
        ? {}
        : { repairAttempted: result.repairAttempted }),
      ...(result.model === undefined ? {} : { model: result.model }),
    });

    const parsed = validateBlockContent(result.output, input.blockId);
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
