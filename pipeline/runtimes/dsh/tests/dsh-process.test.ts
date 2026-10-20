import { describe, expect, it } from "vitest";
import {
  DshError,
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

  it("runs the pinned binary, passes DSH_HOME and parses stdout", async () => {
    let captured: { command: string; args: string[]; env: NodeJS.ProcessEnv } | undefined;
    const runner: CommandRunner = async (command, args, options) => {
      captured = { command, args, env: options.env };
      return { stdout: `\`\`\`json\n${JSON.stringify(verdict)}\n\`\`\``, stderr: "" };
    };
    const result = await runDshReview({ ...base, runner });
    expect(result.verdict.verdict).toBe("pass");
    expect(captured?.command).toBe("/tmp/dsh");
    expect(captured?.args).toEqual(["--profile", "prd-ui-assets", "review this"]);
    expect(captured?.env.DSH_HOME).toBe("/tmp/dsh-home");
    expect(captured?.env.PRD_UI_RUN_DIR).toBe("/tmp/run");
    expect(result.session.stdoutHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("surfaces a non-zero exit", async () => {
    const runner: CommandRunner = async () => {
      throw new DshError("DSH_EXIT_NONZERO", "exit 1");
    };
    await expect(runDshReview({ ...base, runner })).rejects.toMatchObject({
      code: "DSH_EXIT_NONZERO",
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
});
