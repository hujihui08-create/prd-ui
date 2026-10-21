import { redactSecrets, redactValue } from "@prd-ui/contracts";
import type {
  AgentArtifactStorePort,
  AgentResult,
  AgentTaskRole,
  AgentRunnerError,
} from "./contracts.js";

interface Parser<T> {
  parse(value: unknown): T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Validate before writing: a schema drift must never reach disk. */
export async function writeArtifact<T>(
  store: AgentArtifactStorePort,
  schema: Parser<T>,
  path: string,
  value: unknown
): Promise<T> {
  let parsed: T;
  try {
    parsed = schema.parse(value);
  } catch (error) {
    throw new Error(`CONTRACT_VIOLATION: ${path}: ${errorMessage(error)}`, { cause: error });
  }
  await store.writeJson(path, parsed);
  return parsed;
}

/** Write a prompt redacted and return its sha256 hash. */
export async function writePrompt(
  store: AgentArtifactStorePort,
  path: string,
  prompt: string
): Promise<string> {
  await store.writeText(path, redactSecrets(prompt));
  return store.hash(path);
}

export async function readOptionalText(
  store: AgentArtifactStorePort,
  path: string
): Promise<string | undefined> {
  if (!(await store.exists(path))) return undefined;
  return store.readText(path);
}

export type EvidencePhase = "initial" | "gate-repair";

export interface EvidenceInput {
  role: AgentTaskRole;
  phase: EvidencePhase;
  attempt: number;
  prompt: string;
  runner: { name: string; model: string };
  result?: AgentResult;
  error?: unknown;
}

function errorFields(error: unknown): {
  code?: string;
  message: string;
  usage?: unknown;
  usageComplete?: unknown;
  raw?: string;
  stdout?: string;
  stderr?: string;
} {
  const candidate = error as Partial<AgentRunnerError> & { message?: unknown };
  return {
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
    message: errorMessage(error),
    ...(candidate.usage === undefined ? {} : { usage: candidate.usage }),
    ...(candidate.usageComplete === undefined
      ? {}
      : { usageComplete: candidate.usageComplete }),
    ...(typeof candidate.raw === "string" ? { raw: candidate.raw } : {}),
    ...(typeof candidate.stdout === "string" ? { stdout: candidate.stdout } : {}),
    ...(typeof candidate.stderr === "string" ? { stderr: candidate.stderr } : {}),
  };
}

/**
 * Persist one agent call. Top-level files mirror the latest call; the
 * per-attempt directory keeps the full trail (including gate repairs).
 */
export async function writeAgentEvidence(
  store: AgentArtifactStorePort,
  input: EvidenceInput
): Promise<void> {
  const base = `agents/${input.role}`;
  const attemptDir = `${base}/attempts/${String(input.attempt).padStart(2, "0")}`;
  const error = input.error === undefined ? undefined : errorFields(input.error);

  for (const dir of [base, attemptDir]) {
    await store.writeText(`${dir}/prompt.md`, redactSecrets(input.prompt));
  }

  if (input.result !== undefined) {
    const result = input.result;
    const raw = {
      raw: result.raw ?? "",
      usage: result.usage ?? null,
      usageComplete: result.usageComplete ?? false,
      repairAttempted: result.repairAttempted ?? false,
      ignoredKeys: result.ignoredKeys ?? [],
      attempts: result.attempts ?? [],
    };
    for (const dir of [base, attemptDir]) {
      await store.writeJson(`${dir}/output.json`, redactValue(result.output));
      await store.writeJson(`${dir}/raw.json`, redactValue(raw));
      await store.writeText(`${dir}/stdout.txt`, redactSecrets(result.stdout ?? ""));
      await store.writeText(`${dir}/stderr.txt`, redactSecrets(result.stderr ?? ""));
      await store.writeText(
        `${dir}/session.json`,
        `${JSON.stringify(
          redactValue({
            runner: input.runner.name,
            model: input.runner.model,
            role: input.role,
            phase: input.phase,
            attempt: input.attempt,
            usage: result.usage ?? null,
            usageComplete: result.usageComplete ?? false,
          }),
          null,
          2
        )}\n`
      );
    }
    return;
  }

  if (error !== undefined) {
    for (const dir of [base, attemptDir]) {
      await store.writeText(
        `${dir}/error.json`,
        `${JSON.stringify(
          redactValue({
            code: error.code,
            message: error.message,
            usage: error.usage ?? null,
            usageComplete: error.usageComplete ?? false,
          }),
          null,
          2
        )}\n`
      );
      if (error.stdout !== undefined) {
        await store.writeText(`${dir}/stdout.txt`, redactSecrets(error.stdout));
      } else {
        await store.writeText(`${dir}/stdout.txt`, "");
      }
      if (error.stderr !== undefined) {
        await store.writeText(`${dir}/stderr.txt`, redactSecrets(error.stderr));
      } else {
        await store.writeText(`${dir}/stderr.txt`, "");
      }
    }
  }
}

export interface HistoryEntry {
  phase: EvidencePhase;
  attempt: number;
  timestamp: string;
  usage?: unknown;
  usageComplete?: boolean;
  costCny?: number;
  repairAttempted?: boolean;
  error?: string;
}

export async function writeHistory(
  store: AgentArtifactStorePort,
  role: AgentTaskRole,
  history: HistoryEntry[]
): Promise<void> {
  await store.writeText(
    `agents/${role}/history.json`,
    `${JSON.stringify(redactValue(history), null, 2)}\n`
  );
}
