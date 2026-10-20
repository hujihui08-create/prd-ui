import { describe, expect, it } from "vitest";
import { AgentRunnerError, type AgentTask, type AgentValidation } from "@prd-ui/agents";
import { DshError, type CommandRunner } from "../src/dsh-process.js";
import { DshAgentRunner } from "../src/agent-runner.js";

function validateOutput(value: unknown): AgentValidation {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { ok?: unknown }).ok === "boolean"
  ) {
    return { success: true, data: value };
  }
  return { success: false, error: 'expected { "ok": boolean }' };
}

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    role: "ia",
    prompt: "Return the JSON.",
    schema: { type: "object", properties: { ok: { type: "boolean" } } },
    validate: validateOutput,
    runDir: "/tmp/run",
    inputFiles: [],
    ...overrides,
  };
}

function ndjson(...events: unknown[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

function stepEnd(inputTokens = 100, outputTokens = 20) {
  return {
    type: "status",
    phase: "step_end",
    usage: { inputTokens, outputTokens, cacheReadTokens: 0 },
  };
}

function final(text: string) {
  return { type: "final", text };
}

function runnerOptions(runner: CommandRunner) {
  return {
    dshHome: "/tmp/dsh-home",
    profile: "prd-ui-agents",
    dshBin: "/tmp/dsh",
    cwd: "/tmp",
    runner,
    model: "mock-model",
    env: {
      PRD_UI_VISION_BASE_URL: "http://127.0.0.1/v1",
      PRD_UI_VISION_MODEL: "mock-model",
    } as NodeJS.ProcessEnv,
  };
}

describe("DshAgentRunner", () => {
  it("runs one dsh task and returns validated JSON plus usage", async () => {
    const calls: Array<{ args: string[]; stdin: string }> = [];
    const command: CommandRunner = async (_command, args, options) => {
      calls.push({ args, stdin: options.stdin ?? "" });
      return {
        stdout: ndjson(stepEnd(), final('```json\n{"ok":true}\n```')),
        stderr: "",
      };
    };
    const runner = new DshAgentRunner(runnerOptions(command));

    const result = await runner.run(task());

    expect(result.output).toEqual({ ok: true });
    expect(result.model).toBe("mock-model");
    expect(result.repairAttempted).toBe(false);
    expect(result.usage).toMatchObject({ inputTokens: 100, outputTokens: 20 });
    expect(result.usageComplete).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual(["--profile", "prd-ui-agents", "--json", "-"]);
    expect(calls[0]?.stdin).toContain("Return the JSON.");
  });

  it("repairs invalid JSON once and merges both usages", async () => {
    const calls: string[] = [];
    const command: CommandRunner = async (_command, _args, options) => {
      calls.push(options.stdin ?? "");
      return {
        stdout: ndjson(
          stepEnd(100, 20),
          final(calls.length === 1 ? "not json" : '{"ok":true}')
        ),
        stderr: "",
      };
    };
    const runner = new DshAgentRunner(runnerOptions(command));

    const result = await runner.run(task());

    expect(result.output).toEqual({ ok: true });
    expect(result.repairAttempted).toBe(true);
    expect(result.usage).toMatchObject({ inputTokens: 200, outputTokens: 40 });
    expect(result.usageComplete).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts?.[1]).toMatchObject({ attempt: 2, schemaRepair: true });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("previous response was invalid");
  });

  it("reports AGENT_INVALID_OUTPUT after the repair also fails", async () => {
    const command: CommandRunner = async () => ({
      stdout: ndjson(stepEnd(), final('{"ok":"not-a-boolean"}')),
      stderr: "",
    });
    const runner = new DshAgentRunner(runnerOptions(command));

    await expect(runner.run(task())).rejects.toMatchObject({
      name: "AgentRunnerError",
      code: "AGENT_INVALID_OUTPUT",
      usage: { inputTokens: 200, outputTokens: 40, cacheReadTokens: 0 },
      attempts: [
        expect.objectContaining({ attempt: 1 }),
        expect.objectContaining({ attempt: 2, schemaRepair: true }),
      ],
    });
  });

  it("skips the schema repair when the budget callback denies it", async () => {
    let calls = 0;
    const command: CommandRunner = async () => {
      calls += 1;
      return { stdout: ndjson(stepEnd(), final("not json")), stderr: "" };
    };
    const runner = new DshAgentRunner(runnerOptions(command));

    await expect(
      runner.run(task({ canRepair: () => false }))
    ).rejects.toBeInstanceOf(AgentRunnerError);
    expect(calls).toBe(1);
  });

  it("maps transport failures to agent error codes", async () => {
    const timeout: CommandRunner = async () => {
      throw new DshError("DSH_TIMEOUT", "timed out");
    };
    await expect(
      new DshAgentRunner(runnerOptions(timeout)).run(task())
    ).rejects.toMatchObject({ code: "AGENT_TIMEOUT" });

    const unavailable: CommandRunner = async () => {
      throw new DshError("DSH_UNAVAILABLE", "missing binary");
    };
    await expect(
      new DshAgentRunner(runnerOptions(unavailable)).run(task())
    ).rejects.toMatchObject({ code: "AGENT_UNAVAILABLE" });
  });
});
