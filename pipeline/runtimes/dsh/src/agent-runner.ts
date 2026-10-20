import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentRunnerError,
  type AgentAttemptEvidence,
  type AgentResult,
  type AgentRunnerPort,
  type AgentTask,
} from "@prd-ui/agents";
import {
  mergeAgentUsage,
  type AgentUsage,
} from "@prd-ui/contracts";
import { validateProviderEnv, type ReviewUsage } from "@prd-ui/asset-review";
import {
  DshError,
  runDshTask,
  type CommandRunner,
  type DshTaskResult,
} from "./dsh-process.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export interface DshAgentRunnerOptions {
  dshHome: string;
  profile: string;
  dshBin: string;
  cwd: string;
  timeoutMs?: number;
  runner?: CommandRunner;
  env?: NodeJS.ProcessEnv;
  model?: string;
}

export function defaultDshAgentOptions(
  env: NodeJS.ProcessEnv = process.env
): DshAgentRunnerOptions {
  return {
    dshHome: path.join(pipelineRoot, "dsh", "home"),
    profile: "prd-ui-agents",
    dshBin: path.join(pipelineRoot, "node_modules", ".bin", "dsh"),
    cwd: pipelineRoot,
    env,
    ...(env.PRD_UI_VISION_MODEL === undefined
      ? {}
      : { model: env.PRD_UI_VISION_MODEL }),
  };
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];
  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // keep looking
    }
  }
  throw new Error("AGENT_INVALID_JSON: no JSON object found in dsh output");
}

function mapDshError(error: unknown): AgentRunnerError {
  if (error instanceof DshError) {
    const code =
      error.code === "DSH_TIMEOUT"
        ? "AGENT_TIMEOUT"
        : error.code === "DSH_UNAVAILABLE"
          ? "AGENT_UNAVAILABLE"
          : error.code === "DSH_INVALID_VERDICT"
            ? "AGENT_INVALID_OUTPUT"
            : "AGENT_EXIT_NONZERO";
    return new AgentRunnerError(code, error.message, {
      cause: error,
      ...(error.usage === undefined ? {} : { usage: error.usage }),
      ...(error.usageComplete === undefined
        ? {}
        : { usageComplete: error.usageComplete }),
      ...(error.raw === undefined ? {} : { raw: error.raw }),
      ...(error.stdout === undefined ? {} : { stdout: error.stdout }),
      ...(error.stderr === undefined ? {} : { stderr: error.stderr }),
    });
  }
  return new AgentRunnerError(
    "AGENT_EXIT_NONZERO",
    error instanceof Error ? error.message : String(error),
    { cause: error }
  );
}

function attemptEvidence(
  attempt: number,
  schemaRepair: boolean,
  task: DshTaskResult,
  error?: string
): AgentAttemptEvidence {
  return {
    attempt,
    schemaRepair,
    raw: task.answer ?? task.stdout,
    stdout: task.stdout,
    stderr: task.stderr,
    usageComplete: task.usageComplete,
    ...(task.usage === undefined ? {} : { usage: task.usage }),
    ...(error === undefined ? {} : { error }),
  };
}

/**
 * One model call per `run`, plus at most one schema repair. The transport is
 * `dsh --profile prd-ui-agents --json -`; core owns prompts, gates, budgets,
 * retries, and artifacts.
 */
export class DshAgentRunner implements AgentRunnerPort {
  readonly name = "dsh";
  readonly model: string;
  private readonly options: DshAgentRunnerOptions;

  constructor(options: DshAgentRunnerOptions) {
    validateProviderEnv(options.env ?? process.env);
    this.options = options;
    this.model = options.model ?? "unknown";
  }

  private call(task: string, runDir: string, timeoutMs?: number): Promise<DshTaskResult> {
    return runDshTask({
      task,
      dshHome: this.options.dshHome,
      profile: this.options.profile,
      dshBin: this.options.dshBin,
      cwd: this.options.cwd,
      runDir,
      ...(this.options.timeoutMs === undefined && timeoutMs === undefined
        ? {}
        : { timeoutMs: this.options.timeoutMs ?? timeoutMs }),
      ...(this.options.runner === undefined ? {} : { runner: this.options.runner }),
    });
  }

  async run(task: AgentTask): Promise<AgentResult> {
    const base = [
      task.prompt,
      "",
      "Return ONLY one JSON object that matches the schema. Do not add markdown fences or prose.",
    ].join("\n");

    let first: DshTaskResult;
    try {
      first = await this.call(base, task.runDir, task.timeoutMs);
    } catch (error) {
      throw mapDshError(error);
    }

    let firstError: string | undefined;
    try {
      const parsed = extractJson(first.answer ?? first.stdout);
      const checked = task.validate(parsed);
      if (checked.success) {
        return {
          output: checked.data,
          ...(first.usage === undefined ? {} : { usage: first.usage }),
          usageComplete: first.usageComplete,
          raw: first.answer ?? first.stdout,
          stdout: first.stdout,
          stderr: first.stderr,
          ignoredKeys: [],
          repairAttempted: false,
          attempts: [attemptEvidence(1, false, first)],
          model: this.model,
        };
      }
      firstError = checked.error;
    } catch (error) {
      firstError = error instanceof Error ? error.message : String(error);
    }

    const canRepair = task.canRepair?.(first.usage) ?? true;
    if (!canRepair) {
      throw new AgentRunnerError(
        "AGENT_INVALID_OUTPUT",
        `dsh output did not match the agent schema: ${firstError}`,
        {
          usage: first.usage,
          usageComplete: first.usageComplete,
          raw: first.answer ?? first.stdout,
          stdout: first.stdout,
          stderr: first.stderr,
          attempts: [attemptEvidence(1, false, first, firstError)],
        }
      );
    }

    const repairPrompt = `${base}\n\nYour previous response was invalid: ${firstError}\nReturn ONLY one JSON object that conforms to the schema. Do not add extra keys.`;
    let repair: DshTaskResult;
    try {
      repair = await this.call(repairPrompt, task.runDir, task.timeoutMs);
    } catch (error) {
      const mapped = mapDshError(error);
      throw new AgentRunnerError(mapped.code, mapped.message, {
        cause: mapped,
        usage: mergeAgentUsage(
          first.usage as AgentUsage | undefined,
          mapped.usage as AgentUsage | undefined
        ),
        usageComplete:
          first.usageComplete && (mapped.usageComplete ?? false),
        raw: mapped.raw ?? first.answer ?? first.stdout,
        stdout: `${first.stdout}${mapped.stdout ?? ""}`,
        stderr: `${first.stderr}${mapped.stderr ?? ""}`,
        attempts: [
          attemptEvidence(1, false, first, firstError),
          {
            attempt: 2,
            schemaRepair: true,
            raw: mapped.raw ?? "",
            usageComplete: mapped.usageComplete ?? false,
            ...(mapped.usage === undefined ? {} : { usage: mapped.usage }),
            error: mapped.message,
          },
        ],
      });
    }

    try {
      const parsed = extractJson(repair.answer ?? repair.stdout);
      const checked = task.validate(parsed);
      if (!checked.success) {
        throw new Error(`schema mismatch: ${checked.error}`);
      }
      return {
        output: checked.data,
        usage: mergeAgentUsage(
          first.usage as AgentUsage | undefined,
          repair.usage as AgentUsage | undefined
        ),
        usageComplete: first.usageComplete && repair.usageComplete,
        raw: repair.answer ?? repair.stdout,
        stdout: repair.stdout,
        stderr: repair.stderr,
        ignoredKeys: [],
        repairAttempted: true,
        attempts: [
          attemptEvidence(1, false, first, firstError),
          attemptEvidence(2, true, repair),
        ],
        model: this.model,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AgentRunnerError(
        "AGENT_INVALID_OUTPUT",
        `dsh schema repair did not produce valid output: ${message}`,
        {
          usage: mergeAgentUsage(
            first.usage as AgentUsage | undefined,
            repair.usage as AgentUsage | undefined
          ),
          usageComplete: first.usageComplete && repair.usageComplete,
          raw: repair.answer ?? repair.stdout,
          stdout: `${first.stdout}${repair.stdout}`,
          stderr: `${first.stderr}${repair.stderr}`,
          attempts: [
            attemptEvidence(1, false, first, firstError),
            attemptEvidence(2, true, repair, message),
          ],
        }
      );
    }
  }
}

export function createDshAgentRunner(
  overrides: Partial<DshAgentRunnerOptions> = {}
): DshAgentRunner {
  return new DshAgentRunner({ ...defaultDshAgentOptions(), ...overrides });
}

export type { ReviewUsage };
