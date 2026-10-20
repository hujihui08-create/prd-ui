import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReviewPrompt,
  validateProviderEnv,
  type AssetReviewerInput,
  type AssetReviewerPort,
  type ReviewResult,
  type ReviewUsage,
} from "@prd-ui/asset-review";
import {
  DshError,
  runDshReview,
  type CommandRunner,
  type DshReviewResult,
} from "./dsh-process.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export interface DshAssetReviewerOptions {
  dshHome: string;
  profile: string;
  dshBin: string;
  cwd: string;
  timeoutMs?: number;
  runner?: CommandRunner;
}

/** Dsh-specific entry point; the provider contract is shared with standalone. */
export function validateDshProviderEnv(env: NodeJS.ProcessEnv = process.env): void {
  validateProviderEnv(env);
}

export function defaultDshOptions(): DshAssetReviewerOptions {
  return {
    dshHome: path.join(pipelineRoot, "dsh", "home"),
    profile: "prd-ui-assets",
    dshBin: path.join(pipelineRoot, "node_modules", ".bin", "dsh"),
    cwd: pipelineRoot,
  };
}

function mergeUsage(
  left: ReviewUsage | undefined,
  right: ReviewUsage | undefined
): ReviewUsage | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  const total = (a: number | undefined, b: number | undefined): number | undefined =>
    a === undefined || b === undefined ? undefined : a + b;
  const totalTokens = total(left.totalTokens, right.totalTokens);
  const cacheWriteTokens = total(left.cacheWriteTokens, right.cacheWriteTokens);
  const reasoningTokens = total(left.reasoningTokens, right.reasoningTokens);
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
  };
}

function mergeIgnoredKeys(left?: string[], right?: string[]): string[] {
  return Array.from(new Set([...(left ?? []), ...(right ?? [])]));
}

/**
 * Reviewer adapter: core owns the prompt and schema; dsh owns the model
 * session. Evidence is written under the run directory, never into a final
 * handoff.
 */
export class DshAssetReviewer implements AssetReviewerPort {
  private readonly options: DshAssetReviewerOptions;

  constructor(options: DshAssetReviewerOptions & { env?: NodeJS.ProcessEnv }) {
    validateDshProviderEnv(options.env ?? process.env);
    this.options = options;
  }

  private run(input: AssetReviewerInput, task: string): Promise<DshReviewResult> {
    return runDshReview({
      task,
      dshHome: this.options.dshHome,
      profile: this.options.profile,
      dshBin: this.options.dshBin,
      cwd: this.options.cwd,
      runDir: input.runDir,
      ...(this.options.timeoutMs === undefined ? {} : { timeoutMs: this.options.timeoutMs }),
      ...(this.options.runner === undefined ? {} : { runner: this.options.runner }),
    });
  }

  async review(input: AssetReviewerInput): Promise<ReviewResult> {
    const prompt = buildReviewPrompt(input);
    const task = `${prompt}\n\nReturn ONLY the JSON verdict. The run directory is ${input.runDir}.`;
    let firstError: DshError | undefined;
    let repairTask: string | undefined;
    let result: DshReviewResult;

    try {
      result = await this.run(input, task);
    } catch (error) {
      if (!(error instanceof DshError) || error.code !== "DSH_INVALID_VERDICT") {
        throw error;
      }
      firstError = error;
      repairTask = `${task}\n\nYour previous response was invalid: ${error.message}\nReturn ONLY one JSON object that conforms to the verdict schema. Do not add extra keys.`;
      try {
        result = await this.run(input, repairTask);
      } catch (repairError) {
        if (!(repairError instanceof DshError)) throw repairError;
        // `merged.usage` already contains both attempts; evidence must use it
        // as-is instead of merging the first attempt a second time.
        const merged = new DshError(repairError.code, repairError.message, {
          cause: repairError,
          usage: mergeUsage(firstError.usage, repairError.usage),
          usageComplete:
            firstError.usageComplete !== false && repairError.usageComplete !== false,
          raw: repairError.raw ?? firstError.raw,
          ignoredKeys: mergeIgnoredKeys(firstError.ignoredKeys, repairError.ignoredKeys),
          stdout: `${firstError.stdout ?? ""}${repairError.stdout ?? ""}`,
          stderr: `${firstError.stderr ?? ""}${repairError.stderr ?? ""}`,
        });
        await this.writeEvidence(input, task, {
          firstError,
          repairTask,
          repairError,
          error: merged,
        });
        throw merged;
      }
    }

    await this.writeEvidence(input, task, { result, firstError, repairTask });

    const repairAttempted = firstError !== undefined;
    const usage = mergeUsage(firstError?.usage, result.usage);
    const usageComplete =
      firstError === undefined
        ? result.usageComplete
        : firstError.usageComplete !== false && result.usageComplete;
    return {
      verdict: result.verdict,
      ...(usage === undefined ? {} : { usage }),
      usageComplete,
      raw: result.raw,
      ignoredKeys: result.ignoredKeys,
      repairAttempted,
    };
  }

  private async writeEvidence(
    input: AssetReviewerInput,
    task: string,
    outcome: {
      result?: DshReviewResult;
      firstError?: DshError;
      repairTask?: string;
      repairError?: DshError;
      error?: DshError;
    }
  ): Promise<void> {
    const evidenceDir = path.join(
      input.runDir,
      "dsh",
      `${input.candidate.assetId}-${input.candidate.source}-${input.candidate.attempt}`
    );
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, "prompt.md"), task, "utf8");

    if (outcome.result !== undefined) {
      await writeFile(path.join(evidenceDir, "stdout.txt"), outcome.result.stdout, "utf8");
      await writeFile(path.join(evidenceDir, "stderr.txt"), outcome.result.stderr, "utf8");
      await writeFile(
        path.join(evidenceDir, "session.json"),
        `${JSON.stringify(outcome.result.session, null, 2)}\n`,
        "utf8"
      );
    }

    if (outcome.repairTask !== undefined) {
      await writeFile(path.join(evidenceDir, "repair-prompt.md"), outcome.repairTask, "utf8");
    }
    if (outcome.firstError !== undefined) {
      await writeFile(
        path.join(evidenceDir, "first-stdout.txt"),
        outcome.firstError.stdout ?? "",
        "utf8"
      );
      await writeFile(
        path.join(evidenceDir, "first-stderr.txt"),
        outcome.firstError.stderr ?? "",
        "utf8"
      );
    }
    if (outcome.result !== undefined && outcome.firstError !== undefined) {
      await writeFile(
        path.join(evidenceDir, "repair-stdout.txt"),
        outcome.result.stdout,
        "utf8"
      );
      await writeFile(
        path.join(evidenceDir, "repair-stderr.txt"),
        outcome.result.stderr,
        "utf8"
      );
    } else if (outcome.repairError !== undefined) {
      await writeFile(
        path.join(evidenceDir, "repair-stdout.txt"),
        outcome.repairError.stdout ?? "",
        "utf8"
      );
      await writeFile(
        path.join(evidenceDir, "repair-stderr.txt"),
        outcome.repairError.stderr ?? "",
        "utf8"
      );
    }

    const finalError = outcome.error;
    const repairAttempted = outcome.firstError !== undefined;
    const raw = outcome.result?.raw ?? finalError?.raw ?? outcome.firstError?.raw ?? "";
    const ignoredKeys =
      outcome.result?.ignoredKeys ??
      finalError?.ignoredKeys ??
      outcome.firstError?.ignoredKeys ??
      [];
    const usage =
      outcome.result !== undefined
        ? mergeUsage(outcome.firstError?.usage, outcome.result.usage)
        : (finalError?.usage ?? outcome.firstError?.usage);
    const usageComplete = outcome.result
      ? outcome.firstError === undefined
        ? outcome.result.usageComplete
        : outcome.firstError.usageComplete !== false && outcome.result.usageComplete
      : (finalError?.usageComplete ?? false);
    await writeFile(
      path.join(evidenceDir, "review.raw.json"),
      `${JSON.stringify(
        {
          raw,
          ignoredKeys,
          ...(usage === undefined ? {} : { usage }),
          usageComplete,
          repairAttempted,
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    if (finalError !== undefined) {
      await writeFile(
        path.join(evidenceDir, "error.json"),
        `${JSON.stringify({ code: finalError.code, message: finalError.message }, null, 2)}\n`,
        "utf8"
      );
    }
  }
}

export function createDshAssetReviewer(
  overrides: Partial<DshAssetReviewerOptions & { env?: NodeJS.ProcessEnv }> = {}
): DshAssetReviewer {
  return new DshAssetReviewer({ ...defaultDshOptions(), ...overrides });
}
