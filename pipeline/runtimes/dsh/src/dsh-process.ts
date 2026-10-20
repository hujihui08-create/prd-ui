import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  AssetReviewVerdictSchema,
  type AssetReviewVerdict,
  type ReviewUsage,
} from "@prd-ui/asset-review";

export type DshErrorCode =
  | "DSH_UNAVAILABLE"
  | "DSH_TIMEOUT"
  | "DSH_EXIT_NONZERO"
  | "DSH_INVALID_VERDICT";

export interface DshErrorOptions extends ErrorOptions {
  usage?: ReviewUsage;
  usageComplete?: boolean;
  raw?: string;
  ignoredKeys?: string[];
  stdout?: string;
  stderr?: string;
}

export class DshError extends Error {
  readonly usage?: ReviewUsage;
  readonly usageComplete?: boolean;
  readonly raw?: string;
  readonly ignoredKeys?: string[];
  readonly stdout?: string;
  readonly stderr?: string;

  constructor(
    readonly code: DshErrorCode,
    message: string,
    options: DshErrorOptions = {}
  ) {
    super(message, options);
    this.name = "DshError";
    if (options.usage !== undefined) this.usage = options.usage;
    if (options.usageComplete !== undefined) this.usageComplete = options.usageComplete;
    if (options.raw !== undefined) this.raw = options.raw;
    if (options.ignoredKeys !== undefined) this.ignoredKeys = options.ignoredKeys;
    if (options.stdout !== undefined) this.stdout = options.stdout;
    if (options.stderr !== undefined) this.stderr = options.stderr;
  }
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; stdin?: string }
) => Promise<CommandResult>;

/**
 * Spawn (never execFile) so the task can be streamed over stdin instead of
 * argv. Partial stdout/stderr are attached to failures for usage accounting.
 */
export const defaultCommandRunner: CommandRunner = (command, args, options) =>
  new Promise<CommandResult>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (killTimer !== undefined) clearTimeout(killTimer);
      action();
    };

    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 2_000);
    }, options.timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      finish(() => {
        if (error.code === "ENOENT") {
          reject(
            new DshError("DSH_UNAVAILABLE", `dsh binary not found: ${command}`, {
              cause: error,
              stdout,
              stderr,
            })
          );
          return;
        }
        reject(
          new DshError("DSH_EXIT_NONZERO", `dsh failed: ${error.message}`, {
            cause: error,
            stdout,
            stderr,
          })
        );
      });
    });

    child.on("close", (code, signal) => {
      finish(() => {
        if (timedOut) {
          reject(
            new DshError("DSH_TIMEOUT", `dsh timed out after ${options.timeoutMs}ms`, {
              stdout,
              stderr,
            })
          );
          return;
        }
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        reject(
          new DshError(
            "DSH_EXIT_NONZERO",
            `dsh exited with ${String(code ?? signal ?? "unknown")}: ${stderr}`.trim(),
            { stdout, stderr }
          )
        );
      });
    });

    if (child.stdin) {
      // A child that exits early can close the pipe before the write finishes.
      child.stdin.on("error", () => {});
      if (options.stdin !== undefined) child.stdin.write(options.stdin);
      child.stdin.end();
    }
  });

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
  usage?: ReviewUsage;
  usageComplete: boolean;
  usageSource: "json-events" | "unavailable";
  raw: string;
  ignoredKeys: string[];
  stdout: string;
  stderr: string;
  session: DshSession;
}

const VERDICT_KEYS = new Set(Object.keys(AssetReviewVerdictSchema.shape));

function tryParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function ignoredKeysOf(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => !VERDICT_KEYS.has(key));
}

interface VerdictDetails {
  verdict: AssetReviewVerdict;
  ignoredKeys: string[];
}

/** Extract the last JSON verdict from dsh output, tolerating markdown fences. */
function extractVerdictDetails(raw: string): VerdictDetails {
  const trimmed = raw.trim();
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
  let lastIgnoredKeys: string[] = [];
  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed === undefined) continue;
    lastIgnoredKeys = ignoredKeysOf(parsed);
    const result = AssetReviewVerdictSchema.safeParse(parsed);
    if (result.success) return { verdict: result.data, ignoredKeys: lastIgnoredKeys };
    lastError = result.error;
  }

  throw new DshError(
    "DSH_INVALID_VERDICT",
    `dsh did not return a valid asset verdict${
      lastError === undefined ? "" : `: ${String(lastError)}`
    }; raw output: ${trimmed.length > 800 ? `${trimmed.slice(0, 800)}...` : trimmed}`,
    { raw: trimmed, ignoredKeys: lastIgnoredKeys }
  );
}

export function extractVerdict(raw: string): AssetReviewVerdict {
  return extractVerdictDetails(raw).verdict;
}

interface DshEvent {
  type: string;
  phase?: unknown;
  usage?: unknown;
  text?: unknown;
}

interface ParsedDshOutput {
  usage?: ReviewUsage;
  usageComplete: boolean;
  usageSource: "json-events" | "unavailable";
  answer?: string;
}

function countOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function parseStepUsage(raw: unknown): ReviewUsage | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const candidate = raw as Record<string, unknown>;
  const inputTokens = countOf(candidate.inputTokens);
  const outputTokens = countOf(candidate.outputTokens);
  const cacheReadTokens = countOf(candidate.cacheReadTokens);
  if (
    inputTokens === undefined ||
    outputTokens === undefined ||
    cacheReadTokens === undefined
  ) {
    return undefined;
  }
  const totalTokens = countOf(candidate.totalTokens);
  const cacheWriteTokens = countOf(candidate.cacheWriteTokens);
  const reasoningTokens = countOf(candidate.reasoningTokens);
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
  };
}

function parseEvents(stdout: string): DshEvent[] {
  const events: DshEvent[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const parsed = tryParse(trimmed);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { type?: unknown }).type === "string"
    ) {
      events.push(parsed as DshEvent);
    }
  }
  return events;
}

/**
 * NDJSON contract: `status(step_end)` carries usage for each step; the last
 * `final.text` is the lossless answer (`text` events are capped at 8KB).
 */
function parseDshOutput(stdout: string): ParsedDshOutput {
  const events = parseEvents(stdout);
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let usageSeen = false;
  let stepEnds = 0;
  let stepsComplete = true;
  let answer: string | undefined;

  for (const event of events) {
    if (event.type === "status" && event.phase === "step_end") {
      stepEnds += 1;
      const usage = parseStepUsage(event.usage);
      if (usage === undefined) {
        stepsComplete = false;
        continue;
      }
      usageSeen = true;
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
      cacheReadTokens += usage.cacheReadTokens;
    }
    if (event.type === "final" && typeof event.text === "string") {
      answer = event.text;
    }
  }

  return {
    ...(usageSeen
      ? {
          usage: {
            inputTokens,
            outputTokens,
            cacheReadTokens,
            totalTokens: inputTokens + outputTokens + cacheReadTokens,
          },
        }
      : {}),
    usageComplete: stepEnds > 0 && stepsComplete,
    usageSource: events.length > 0 ? "json-events" : "unavailable",
    ...(answer === undefined ? {} : { answer }),
  };
}

function errorDetails(
  error: DshError,
  parsed: ParsedDshOutput,
  usageComplete: boolean
): DshErrorOptions {
  const raw = parsed.answer ?? error.raw;
  return {
    cause: error,
    ...(parsed.usage === undefined ? {} : { usage: parsed.usage }),
    usageComplete,
    ...(raw === undefined ? {} : { raw }),
    ...(error.ignoredKeys === undefined ? {} : { ignoredKeys: error.ignoredKeys }),
    ...(error.stdout === undefined ? {} : { stdout: error.stdout }),
    ...(error.stderr === undefined ? {} : { stderr: error.stderr }),
  };
}

/** Run one headless dsh review over stdin/NDJSON and parse its final answer. */
export async function runDshReview(input: DshReviewInput): Promise<DshReviewResult> {
  const timeoutMs = input.timeoutMs ?? 300_000;
  const runner = input.runner ?? defaultCommandRunner;
  const args = ["--profile", input.profile, "--json", "-"];
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
      stdin: input.task,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    if (error instanceof DshError) {
      const parsed = parseDshOutput(error.stdout ?? "");
      // A timeout/non-zero exit did not finish, so captured usage is billed
      // but never claimed complete.
      throw new DshError(error.code, error.message, errorDetails(error, parsed, false));
    }
    throw new DshError(
      "DSH_EXIT_NONZERO",
      `dsh failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  const parsed = parseDshOutput(stdout);
  const verdictSource =
    parsed.answer ?? (parsed.usageSource === "unavailable" ? stdout : "");

  let details: VerdictDetails;
  try {
    details = extractVerdictDetails(verdictSource);
  } catch (error) {
    if (error instanceof DshError) {
      throw new DshError("DSH_INVALID_VERDICT", error.message, {
        cause: error,
        ...(parsed.usage === undefined ? {} : { usage: parsed.usage }),
        usageComplete: parsed.usageComplete,
        raw: error.raw ?? verdictSource,
        ignoredKeys: error.ignoredKeys ?? [],
        stdout,
        stderr,
      });
    }
    throw error;
  }

  return {
    verdict: details.verdict,
    ...(parsed.usage === undefined ? {} : { usage: parsed.usage }),
    usageComplete: parsed.usageComplete,
    usageSource: parsed.usageSource,
    raw: verdictSource,
    ignoredKeys: details.ignoredKeys,
    stdout,
    stderr,
    session: {
      profile: input.profile,
      command: "dsh --profile <profile> --json -",
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      stdoutHash: `sha256:${createHash("sha256").update(stdout).digest("hex")}`,
    },
  };
}
