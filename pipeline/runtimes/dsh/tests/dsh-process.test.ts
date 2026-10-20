import { describe, expect, it } from "vitest";
import {
  DshError,
  defaultCommandRunner,
  extractVerdict,
  runDshReview,
  type CommandRunner,
} from "../src/dsh-process.js";

const verdict = {
  verdict: "pass",
  hardIssues: [],
  scores: { brandFit: 5, semantics: 5, consistency: 4, editability: 4, composition: 5 },
  suggestedChanges: [],
  reason: "ok",
};

function ndjson(...events: unknown[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

function stepEnd(usage?: unknown) {
  return {
    type: "status",
    phase: "step_end",
    turn: 1,
    step: 1,
    ...(usage === undefined ? {} : { usage }),
  };
}

function final(text: string) {
  return { type: "final", text };
}

describe("extractVerdict", () => {
  it("parses a fenced JSON verdict", () => {
    expect(extractVerdict(`\`\`\`json\n${JSON.stringify(verdict)}\n\`\`\``).verdict).toBe("pass");
  });

  it("parses a bare JSON verdict", () => {
    expect(extractVerdict(JSON.stringify(verdict)).verdict).toBe("pass");
  });

  it("strips an extra reason_note annotation", () => {
    const parsed = extractVerdict(JSON.stringify({ ...verdict, reason_note: "extra" }));
    expect(parsed.verdict).toBe("pass");
    expect(parsed).not.toHaveProperty("reason_note");
  });

  it("rejects invalid JSON", () => {
    expect(() => extractVerdict("not json")).toThrow(DshError);
  });
});

describe("runDshReview", () => {
  const base = {
    task: "review this",
    dshHome: "/tmp/dsh-home",
    profile: "prd-ui-assets",
    dshBin: "/tmp/dsh",
    cwd: "/tmp",
    runDir: "/tmp/run",
  };

  it("streams the task over stdin with --json and parses usage plus final.text", async () => {
    let captured:
      | { command: string; args: string[]; env: NodeJS.ProcessEnv; stdin?: string }
      | undefined;
    const runner: CommandRunner = async (command, args, options) => {
      captured = {
        command,
        args,
        env: options.env,
        ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
      };
      return {
        stdout: ndjson(
          stepEnd({ inputTokens: 100, outputTokens: 20, totalTokens: 120, cacheReadTokens: 0 }),
          final(`\`\`\`json\n${JSON.stringify(verdict)}\n\`\`\``)
        ),
        stderr: "",
      };
    };

    const result = await runDshReview({ ...base, runner });

    expect(result.verdict.verdict).toBe("pass");
    expect(captured?.command).toBe("/tmp/dsh");
    expect(captured?.args).toEqual(["--profile", "prd-ui-assets", "--json", "-"]);
    expect(captured?.stdin).toContain("review this");
    expect(captured?.env.DSH_HOME).toBe("/tmp/dsh-home");
    expect(captured?.env.PRD_UI_RUN_DIR).toBe("/tmp/run");
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      totalTokens: 120,
    });
    expect(result.usageComplete).toBe(true);
    expect(result.usageSource).toBe("json-events");
    expect(result.raw).toContain("```json");
    expect(result.session.stdoutHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("sums usage across step_end events and prefers final over capped text events", async () => {
    const runner: CommandRunner = async () => ({
      stdout: ndjson(
        { type: "text", text: '{"verdict":"pass"}' },
        stepEnd({ inputTokens: 100, outputTokens: 20, totalTokens: 120, cacheReadTokens: 5 }),
        stepEnd({ inputTokens: 50, outputTokens: 10, totalTokens: 60, cacheReadTokens: 7 }),
        final(JSON.stringify(verdict))
      ),
      stderr: "",
    });

    const result = await runDshReview({ ...base, runner });

    expect(result.verdict.verdict).toBe("pass");
    expect(result.usage).toEqual({
      inputTokens: 150,
      outputTokens: 30,
      cacheReadTokens: 12,
      totalTokens: 192,
    });
    expect(result.usageComplete).toBe(true);
  });

  it("marks usage incomplete when any step_end lacks usage", async () => {
    const runner: CommandRunner = async () => ({
      stdout: ndjson(
        stepEnd({ inputTokens: 100, outputTokens: 20, totalTokens: 120, cacheReadTokens: 0 }),
        stepEnd(),
        final(JSON.stringify(verdict))
      ),
      stderr: "",
    });

    const result = await runDshReview({ ...base, runner });

    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      totalTokens: 120,
    });
    expect(result.usageComplete).toBe(false);
    expect(result.usageSource).toBe("json-events");
  });

  it("reports usage as unavailable when there are no events", async () => {
    const runner: CommandRunner = async () => ({
      stdout: JSON.stringify(verdict),
      stderr: "",
    });

    const result = await runDshReview({ ...base, runner });

    expect(result.verdict.verdict).toBe("pass");
    expect(result.usage).toBeUndefined();
    expect(result.usageComplete).toBe(false);
    expect(result.usageSource).toBe("unavailable");
  });

  it("surfaces a non-zero exit", async () => {
    const runner: CommandRunner = async () => {
      throw new DshError("DSH_EXIT_NONZERO", "exit 1");
    };
    await expect(runDshReview({ ...base, runner })).rejects.toMatchObject({
      code: "DSH_EXIT_NONZERO",
    });
  });

  it("carries partial usage from a non-zero exit", async () => {
    const runner: CommandRunner = async () => {
      throw new DshError("DSH_EXIT_NONZERO", "exit 1", {
        stdout: ndjson(
          stepEnd({ inputTokens: 100, outputTokens: 20, totalTokens: 120, cacheReadTokens: 0 })
        ),
        stderr: "boom",
      });
    };

    await expect(runDshReview({ ...base, runner })).rejects.toMatchObject({
      code: "DSH_EXIT_NONZERO",
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 0,
        totalTokens: 120,
      },
      usageComplete: false,
    });
  });

  it("surfaces a timeout", async () => {
    const runner: CommandRunner = async () => {
      throw new DshError("DSH_TIMEOUT", "timed out");
    };
    await expect(runDshReview({ ...base, runner, timeoutMs: 1 })).rejects.toMatchObject({
      code: "DSH_TIMEOUT",
    });
  });

  it("attaches usage, raw output and ignored keys to an invalid verdict", async () => {
    const runner: CommandRunner = async () => ({
      stdout: ndjson(
        stepEnd({ inputTokens: 100, outputTokens: 20, totalTokens: 120, cacheReadTokens: 0 }),
        final(JSON.stringify({ ...verdict, reason_note: "extra", verdict: "invalid" }))
      ),
      stderr: "",
    });

    await expect(runDshReview({ ...base, runner })).rejects.toMatchObject({
      code: "DSH_INVALID_VERDICT",
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 0,
        totalTokens: 120,
      },
      usageComplete: true,
      ignoredKeys: expect.arrayContaining(["reason_note"]),
    });
  });
});

describe("defaultCommandRunner", () => {
  it("writes stdin through spawn", async () => {
    const script =
      "let d='';process.stdin.setEncoding('utf8');" +
      "process.stdin.on('data',(c)=>{d+=c});" +
      "process.stdin.on('end',()=>process.stdout.write(JSON.stringify({type:'final',text:d})))";
    const result = await defaultCommandRunner(
      process.execPath,
      ["-e", script],
      { cwd: process.cwd(), env: process.env, timeoutMs: 5_000, stdin: "hello stdin" }
    );
    expect((JSON.parse(result.stdout) as { text: string }).text).toBe("hello stdin");
  });

  it("kills a timed-out child and reports DSH_TIMEOUT", async () => {
    await expect(
      defaultCommandRunner(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        cwd: process.cwd(),
        env: process.env,
        timeoutMs: 300,
      })
    ).rejects.toMatchObject({ code: "DSH_TIMEOUT" });
  });

  it("reports DSH_UNAVAILABLE when the binary is missing", async () => {
    await expect(
      defaultCommandRunner("/definitely/not/a/dsh-binary", [], {
        cwd: process.cwd(),
        env: process.env,
        timeoutMs: 1_000,
      })
    ).rejects.toMatchObject({ code: "DSH_UNAVAILABLE" });
  });
});
