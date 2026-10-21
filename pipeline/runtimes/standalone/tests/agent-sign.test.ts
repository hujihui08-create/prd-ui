import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { main } from "../src/agent-sign-cli.js";

const now = "2026-10-21T00:00:00.000Z";
const temporaryDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function tempRun(options: {
  status?: string;
  visualStyleGate?: string;
  signoffVisualStyle?: boolean;
} = {}): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-agent-sign-"));
  temporaryDirs.push(dir);
  await mkdir(path.join(dir, "signoff"), { recursive: true });
  const state = {
    schemaVersion: "1.0",
    runId: "run-sign-test",
    project: "demo-orders",
    stage: options.status === "success" ? "done" : "signoff",
    status: options.status ?? "awaiting_signoff",
    agents: {
      ia: { status: "passed", attempts: 1, repairAttempts: 0, gateRounds: 0 },
      interaction: { status: "passed", attempts: 1, repairAttempts: 0, gateRounds: 0 },
      "visual-style": { status: "passed", attempts: 1, repairAttempts: 0, gateRounds: 0 },
    },
    gates: {
      ia: "waived",
      interaction: "passed",
      visualStyle: options.visualStyleGate ?? "passed",
    },
    signoff: { ia: true, visualStyle: options.signoffVisualStyle ?? false },
    usageComplete: true,
    costCny: 0.3,
    degraded: false,
    startedAt: now,
    updatedAt: now,
    ...(options.status === "success" ? { finishedAt: now } : {}),
  };
  await writeFile(path.join(dir, "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(dir, "signoff", "ia.md"),
    `<!-- signoff\n{"signer":"Test","date":"2026-10-21","waivers":[]}\n-->\n`,
    "utf8"
  );
  return dir;
}

async function signoffFile(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-agent-signoff-"));
  temporaryDirs.push(dir);
  const file = path.join(dir, "visual-style.md");
  await writeFile(
    file,
    `# Visual style signoff\n\n<!-- signoff\n{"signer":"Test","date":"2026-10-21","waivers":[]}\n-->\n`,
    "utf8"
  );
  return file;
}

async function runCli(args: string[]): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await main(args, {
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

describe("agent:sign", () => {
  it("finalizes an awaiting run with a valid visual signoff", async () => {
    const runDir = await tempRun();
    const result = await runCli([
      "--run",
      runDir,
      "--signoff-visual-style",
      await signoffFile(),
      "--json",
    ]);
    expect(result.code).toBe(0);
    const state = JSON.parse(await readFile(path.join(runDir, "state.json"), "utf8")) as {
      status: string;
      signoff: { ia: boolean; visualStyle: boolean };
    };
    expect(state.status).toBe("success");
    expect(state.signoff).toEqual({ ia: true, visualStyle: true });
    await expect(
      readFile(path.join(runDir, "signoff", "visual-style.md"), "utf8")
    ).resolves.toContain("Visual style signoff");
    await expect(
      readFile(path.join(runDir, "agent-sign.json"), "utf8")
    ).resolves.toContain("signedAt");
    await expect(
      readFile(path.join(runDir, "logs", "agent.ndjson"), "utf8")
    ).resolves.toContain("signoff_finalized");
  });

  it("rejects a missing visual signoff", async () => {
    const runDir = await tempRun();
    const result = await runCli(["--run", runDir, "--json"]);
    expect(result.code).toBe(1);
    const state = JSON.parse(await readFile(path.join(runDir, "state.json"), "utf8")) as {
      status: string;
    };
    expect(state.status).toBe("awaiting_signoff");
  });

  it("refuses to finalize when the visual gate did not pass", async () => {
    const runDir = await tempRun({ visualStyleGate: "failed" });
    const result = await runCli([
      "--run",
      runDir,
      "--signoff-visual-style",
      await signoffFile(),
      "--json",
    ]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("VISUAL_STYLE_GATE_NOT_PASSED");
  });

  it("is a no-op for an already successful run", async () => {
    const runDir = await tempRun({ status: "success", signoffVisualStyle: true });
    const result = await runCli(["--run", runDir, "--json"]);
    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout) as { status: string };
    expect(payload.status).toBe("success");
  });
});
