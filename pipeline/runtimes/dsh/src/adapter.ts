import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildReviewPrompt,
  type AssetReviewVerdict,
  type AssetReviewerInput,
  type AssetReviewerPort,
} from "@prd-ui/asset-review";
import { runDshReview, type CommandRunner } from "./dsh-process.js";

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

export function defaultDshOptions(): DshAssetReviewerOptions {
  return {
    dshHome: path.join(pipelineRoot, "dsh", "home"),
    profile: "prd-ui-assets",
    dshBin: path.join(pipelineRoot, "node_modules", ".bin", "dsh"),
    cwd: pipelineRoot,
  };
}

/**
 * Reviewer adapter: core owns the prompt and schema; dsh owns the model
 * session. Evidence is written under the run directory, never into a final
 * handoff.
 */
export class DshAssetReviewer implements AssetReviewerPort {
  private readonly options: DshAssetReviewerOptions;

  constructor(options: DshAssetReviewerOptions) {
    this.options = options;
  }

  async review(input: AssetReviewerInput): Promise<AssetReviewVerdict> {
    const prompt = buildReviewPrompt(input);
    const task = `${prompt}\n\nReturn ONLY the JSON verdict. The run directory is ${input.runDir}.`;
    const result = await runDshReview({
      task,
      dshHome: this.options.dshHome,
      profile: this.options.profile,
      dshBin: this.options.dshBin,
      cwd: this.options.cwd,
      runDir: input.runDir,
      ...(this.options.timeoutMs === undefined ? {} : { timeoutMs: this.options.timeoutMs }),
      ...(this.options.runner === undefined ? {} : { runner: this.options.runner }),
    });

    const evidenceDir = path.join(
      input.runDir,
      "dsh",
      `${input.candidate.assetId}-${input.candidate.source}-${input.candidate.attempt}`
    );
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, "prompt.md"), task, "utf8");
    await writeFile(path.join(evidenceDir, "stdout.txt"), result.stdout, "utf8");
    await writeFile(path.join(evidenceDir, "stderr.txt"), result.stderr, "utf8");
    await writeFile(
      path.join(evidenceDir, "session.json"),
      `${JSON.stringify(result.session, null, 2)}\n`,
      "utf8"
    );

    return result.verdict;
  }
}

export function createDshAssetReviewer(
  overrides: Partial<DshAssetReviewerOptions> = {}
): DshAssetReviewer {
  return new DshAssetReviewer({ ...defaultDshOptions(), ...overrides });
}
