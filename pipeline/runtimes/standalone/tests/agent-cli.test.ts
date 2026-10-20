import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { AssetBriefSchema } from "@prd-ui/asset-review";
import { main, parseArgs } from "../src/agent-cli.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const projectPath = path.join(pipelineRoot, "samples", "projects", "employee-app", "project.yaml");
const fixtureDir = path.join(pipelineRoot, "samples", "agents", "m1");
const iconIds = [
  "bell",
  "calendar",
  "chevron-down",
  "home",
  "inventory",
  "receipt",
  "search",
  "settings",
  "user",
  "workbench",
];

const temporaryDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function runsDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-agent-cli-"));
  temporaryDirs.push(dir);
  return dir;
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

async function singleRunDir(runs: string): Promise<string> {
  const entries = await readdir(runs, { withFileTypes: true });
  const runsFound = entries.filter(
    (entry) => entry.isDirectory() && entry.name.startsWith("run-")
  );
  expect(runsFound).toHaveLength(1);
  return path.join(runs, runsFound[0]!.name);
}

async function signoffFiles(dir: string): Promise<{ ia: string; visual: string }> {
  const ia = path.join(dir, "signoff-ia.md");
  const visual = path.join(dir, "signoff-visual.md");
  const block = (name: string) =>
    `# ${name} signoff\n\n<!-- signoff\n${JSON.stringify({
      signer: "tester",
      date: "2026-10-20",
      waivers: [],
    })}\n-->\n`;
  await writeFile(ia, block("IA"), "utf8");
  await writeFile(visual, block("Visual style"), "utf8");
  return { ia, visual };
}

function baseArgs(runs: string): string[] {
  return ["--project", projectPath, "--fixtures", fixtureDir, "--runs", runs];
}

describe("agent:run CLI", () => {
  it("parses flags and defaults", () => {
    const options = parseArgs([
      "--project",
      "custom/project.yaml",
      "--runtime",
      "dsh",
      "--only-role",
      "ia",
      "--only-role",
      "visual-style",
      "--max-cost-cny",
      "2.5",
      "--allow-unknown-cost",
      "--allow-unreviewed",
    ]);
    expect(options.projectPath).toBe(path.resolve("custom/project.yaml"));
    expect(options.runtime).toBe("dsh");
    expect(options.onlyRoles).toEqual(["ia", "visual-style"]);
    expect(options.maxCostCny).toBe(2.5);
    expect(options.allowUnknownCost).toBe(true);
    expect(options.allowUnreviewed).toBe(true);
    expect(parseArgs([])).toMatchObject({ runtime: "standalone", maxCostCny: 10 });
  });

  it("rejects unknown arguments and invalid roles with exit 2", async () => {
    const unknown = await runCli(["--nope"]);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("unknown argument");

    const role = await runCli(["--only-role", "reviewer"]);
    expect(role.code).toBe(2);
    expect(role.stderr).toContain("--only-role");
  });

  it("prints help and exits 0", async () => {
    const result = await runCli(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: pnpm agent:run");
    expect(result.stdout).toContain("--allow-unreviewed");
  });

  it("runs the scripted fixtures and stays awaiting_signoff", async () => {
    const runs = await runsDir();
    const result = await runCli([...baseArgs(runs), "--allow-unreviewed"]);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("AWAITING_SIGNOFF");
    const runDir = await singleRunDir(runs);
    const state = JSON.parse(await readFile(path.join(runDir, "state.json"), "utf8")) as {
      status: string;
      gates: Record<string, string>;
      signoff: Record<string, boolean>;
    };
    expect(state.status).toBe("awaiting_signoff");
    expect(state.gates).toEqual({
      ia: "passed",
      interaction: "passed",
      visualStyle: "passed",
    });
    expect(state.signoff).toEqual({ ia: false, visualStyle: false });
    for (const icon of iconIds) {
      await expect(
        readFile(path.join(runDir, "artifacts", "asset-briefs", `${icon}.json`), "utf8")
      ).resolves.toContain(icon);
    }
  });

  it("reaches success with both signoffs", async () => {
    const runs = await runsDir();
    const signs = await signoffFiles(runs);
    const result = await runCli([
      ...baseArgs(runs),
      "--signoff-ia",
      signs.ia,
      "--signoff-visual-style",
      signs.visual,
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Agent run OK: success");
    const runDir = await singleRunDir(runs);
    const summary = JSON.parse(
      await readFile(path.join(runDir, "agent-run.json"), "utf8")
    ) as {
      status: string;
      signoff: Record<string, boolean>;
      costCny: number;
      usageComplete: boolean;
    };
    expect(summary.status).toBe("success");
    expect(summary.signoff).toEqual({ ia: true, visualStyle: true });
    expect(summary.usageComplete).toBe(true);
    expect(summary.costCny).toBeGreaterThan(0);

    // The M1 acceptance criterion: asset briefs are directly consumable by M0.
    const receipt = JSON.parse(
      await readFile(
        path.join(runDir, "artifacts", "asset-briefs", "receipt.json"),
        "utf8"
      )
    ) as unknown;
    expect(() => AssetBriefSchema.parse(receipt)).not.toThrow();
  });

  it("emits exactly one JSON object in --json mode", async () => {
    const runs = await runsDir();
    const result = await runCli([...baseArgs(runs), "--allow-unreviewed", "--json"]);

    expect(result.code).toBe(1);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    const payload = JSON.parse(result.stdout) as {
      runDir: string;
      status: string;
      gates: Record<string, string>;
      error: string;
    };
    expect(payload.runDir).toContain(runs);
    expect(payload.status).toBe("awaiting_signoff");
    expect(payload.gates.ia).toBe("passed");
    expect(payload.error).toBe("ALLOW_UNREVIEWED");
  });

  it("runs only IA when requested and can succeed with an IA signoff", async () => {
    const runs = await runsDir();
    const signs = await signoffFiles(runs);
    const result = await runCli([
      ...baseArgs(runs),
      "--only-role",
      "ia",
      "--signoff-ia",
      signs.ia,
    ]);

    expect(result.code).toBe(0);
    const runDir = await singleRunDir(runs);
    const state = JSON.parse(await readFile(path.join(runDir, "state.json"), "utf8")) as {
      status: string;
      agents: Record<string, { status: string }>;
    };
    expect(state.status).toBe("success");
    expect(state.agents.interaction?.status).toBe("skipped");
    expect(state.agents["visual-style"]?.status).toBe("skipped");
    await expect(
      readFile(path.join(runDir, "artifacts", "ia-map.json"), "utf8")
    ).resolves.toContain("today");
    await expect(
      readFile(path.join(runDir, "artifacts", "interaction-spec.json"), "utf8")
    ).rejects.toThrow();
  });

  it("fails clearly when the fixture directory is missing", async () => {
    const runs = await runsDir();
    const result = await runCli([
      "--project",
      projectPath,
      "--fixtures",
      path.join(runs, "missing"),
      "--runs",
      runs,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Agent run FAILED");
    expect(result.stderr).toContain("ENOENT");
  });
});
