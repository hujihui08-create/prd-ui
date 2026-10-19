import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import {
  AssetReviewVerdictSchema,
  type AssetReviewVerdict,
} from "@prd-ui/asset-review";

const execFileAsync = promisify(execFile);

export type DshErrorCode =
  | "DSH_UNAVAILABLE"
  | "DSH_TIMEOUT"
  | "DSH_EXIT_NONZERO"
  | "DSH_INVALID_VERDICT";

export class DshError extends Error {
  constructor(
    readonly code: DshErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "DshError";
  }
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }
) => Promise<CommandResult>;

export const defaultCommandRunner: CommandRunner = async (command, args, options) => {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as {
      code?: number | string;
      killed?: boolean;
      signal?: string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    if (failure.code === "ENOENT") {
      throw new DshError("DSH_UNAVAILABLE", `dsh binary not found: ${command}`, { cause: error });
    }
    if (failure.killed || failure.signal) {
      throw new DshError("DSH_TIMEOUT", `dsh timed out after ${options.timeoutMs}ms`, {
        cause: error,
      });
    }
    throw new DshError(
      "DSH_EXIT_NONZERO",
      `dsh exited with ${String(failure.code ?? "unknown")}: ${
        failure.stderr ?? failure.message ?? ""
      }`.trim(),
      { cause: error }
    );
  }
};

export interface DshReviewInput {
  task: string;
  dshHome: string;
  profile: string;
  dshBin: string;
  cwd: string;
  runDir: string;
  timeoutMs?: number;
  runner?: CommandRunner;
}

export interface DshSession {
  profile: string;
  command: string;
  exitCode: number;
  durationMs: number;
  stdoutHash: string;
}

export interface DshReviewResult {
  verdict: AssetReviewVerdict;
  stdout: string;
  stderr: string;
  session: DshSession;
}

function tryParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Extract the last JSON verdict from dsh stdout, tolerating markdown fences. */
export function extractVerdict(stdout: string): AssetReviewVerdict {
  const trimmed = stdout.trim();
  const candidates: string[] = [];
  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  candidates.push(trimmed);
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  let lastError: unknown;
  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed === undefined) continue;
    const result = AssetReviewVerdictSchema.safeParse(parsed);
    if (result.success) return result.data;
    lastError = result.error;
  }

  throw new DshError(
    "DSH_INVALID_VERDICT",
    `dsh did not return a valid asset verdict${lastError === undefined ? "" : `: ${String(lastError)}`}`
  );
}

/** Run one headless dsh review and parse its final assistant message. */
export async function runDshReview(input: DshReviewInput): Promise<DshReviewResult> {
  const timeoutMs = input.timeoutMs ?? 300_000;
  const runner = input.runner ?? defaultCommandRunner;
  const args = ["--profile", input.profile, input.task];
  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";

  try {
    const result = await runner(input.dshBin, args, {
      cwd: input.cwd,
      env: {
        ...process.env,
        DSH_HOME: input.dshHome,
        PRD_UI_RUN_DIR: input.runDir,
      },
      timeoutMs,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    if (error instanceof DshError) throw error;
    throw new DshError(
      "DSH_EXIT_NONZERO",
      `dsh failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  const verdict = extractVerdict(stdout);
  return {
    verdict,
    stdout,
    stderr,
    session: {
      profile: input.profile,
      command: "dsh --profile <profile> <task>",
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      stdoutHash: `sha256:${createHash("sha256").update(stdout).digest("hex")}`,
    },
  };
}
