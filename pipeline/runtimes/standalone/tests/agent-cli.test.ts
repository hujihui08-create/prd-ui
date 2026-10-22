import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
const iconIds = ["icon-home", "icon-package", "icon-search", "icon-user"];

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

interface FixtureFile {
  output: unknown;
  usageComplete?: boolean;
  [key: string]: unknown;
}

/** Copy the sample fixtures into a temp dir, optionally patching one role. */
async function fixtureCopy(
  dir: string,
  patch: (role: string, fixture: FixtureFile) => FixtureFile
): Promise<string> {
  const dest = path.join(dir, "fixtures");
  await mkdir(dest, { recursive: true });
  for (const role of ["ia", "interaction", "visual-style"] as const) {
    const raw = JSON.parse(
      await readFile(path.join(fixtureDir, `${role}.json`), "utf8")
    ) as FixtureFile;
    await writeFile(
      path.join(dest, `${role}.json`),
      JSON.stringify(patch(role, raw)),
      "utf8"
    );
  }
  return dest;
}

interface StateFile {
  status: string;
  degraded: boolean;
  signoff: Record<string, boolean>;
  agents: Record<string, { status: string }>;
}

async function readState(runDir: string): Promise<StateFile> {
  return JSON.parse(await readFile(path.join(runDir, "state.json"), "utf8")) as StateFile;
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
        path.join(runDir, "artifacts", "asset-briefs", "icon-home.json"),
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

  it("fails closed on incomplete usage unless explicitly allowed", async () => {
    const runsClosed = await runsDir();
    const fixturesClosed = await fixtureCopy(runsClosed, (role, fixture) =>
      role === "ia" ? { ...fixture, usageComplete: false } : fixture
    );
    const signsClosed = await signoffFiles(runsClosed);
    const closed = await runCli([
      "--project",
      projectPath,
      "--fixtures",
      fixturesClosed,
      "--runs",
      runsClosed,
      "--signoff-ia",
      signsClosed.ia,
      "--signoff-visual-style",
      signsClosed.visual,
    ]);

    expect(closed.code).toBe(1);
    expect(closed.stdout).toContain("USAGE_INCOMPLETE");
    expect((await readState(await singleRunDir(runsClosed))).status).toBe(
      "usage_incomplete"
    );

    const runsAllowed = await runsDir();
    const fixturesAllowed = await fixtureCopy(runsAllowed, (role, fixture) =>
      role === "ia" ? { ...fixture, usageComplete: false } : fixture
    );
    const signsAllowed = await signoffFiles(runsAllowed);
    const allowed = await runCli([
      "--project",
      projectPath,
      "--fixtures",
      fixturesAllowed,
      "--runs",
      runsAllowed,
      "--signoff-ia",
      signsAllowed.ia,
      "--signoff-visual-style",
      signsAllowed.visual,
      "--allow-unknown-cost",
    ]);

    expect(allowed.code).toBe(0);
    const allowedState = await readState(await singleRunDir(runsAllowed));
    expect(allowedState.status).toBe("success");
    expect(allowedState.degraded).toBe(true);
  });

  it("stops on budget and marks all roles budget_exceeded", async () => {
    const runs = await runsDir();
    const result = await runCli([...baseArgs(runs), "--max-cost-cny", "0.001"]);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("BUDGET_EXCEEDED");
    const state = await readState(await singleRunDir(runs));
    expect(state.status).toBe("budget_exceeded");
    expect(state.agents.ia?.status).toBe("budget_exceeded");
    expect(state.agents.interaction?.status).toBe("budget_exceeded");
    expect(state.agents["visual-style"]?.status).toBe("budget_exceeded");
  });

  it("reports budget_exceeded in the JSON summary", async () => {
    const runs = await runsDir();
    const result = await runCli([
      ...baseArgs(runs),
      "--max-cost-cny",
      "0.001",
      "--json",
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    const payload = JSON.parse(result.stdout) as {
      status: string;
      agents: Record<string, { status: string }>;
    };
    expect(payload.status).toBe("budget_exceeded");
    expect(payload.agents.ia?.status).toBe("budget_exceeded");
  });

  it("redacts secrets from the JSON summary", async () => {
    const runs = await runsDir();
    const secret = "sk-abcdefgh12345678";
    const fixtures = await fixtureCopy(runs, (role, fixture) =>
      role === "ia"
        ? { ...fixture, output: {}, error: `api_key=${secret}` }
        : fixture
    );
    const result = await runCli([
      "--project",
      projectPath,
      "--fixtures",
      fixtures,
      "--runs",
      runs,
      "--json",
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain(secret);
    const payload = JSON.parse(result.stdout) as {
      status: string;
      agents: { ia: { error: string } };
    };
    expect(payload.status).toBe("failed");
    expect(payload.agents.ia.error).toContain("***");
  });

  it("keeps the other design artifact when one agent fails", async () => {
    const runs = await runsDir();
    const fixtures = await fixtureCopy(runs, (role, fixture) =>
      role === "interaction" ? { ...fixture, output: { invalid: true } } : fixture
    );
    const result = await runCli([
      "--project",
      projectPath,
      "--fixtures",
      fixtures,
      "--runs",
      runs,
      "--allow-unreviewed",
    ]);

    expect(result.code).toBe(1);
    const runDir = await singleRunDir(runs);
    const state = await readState(runDir);
    expect(state.status).toBe("partial");
    expect(state.agents.interaction?.status).toBe("failed");
    expect(state.agents["visual-style"]?.status).toBe("passed");
    await expect(
      readFile(path.join(runDir, "artifacts", "interaction-spec.json"), "utf8")
    ).rejects.toThrow();
    await expect(
      readFile(path.join(runDir, "artifacts", "visual-style.json"), "utf8")
    ).resolves.toContain("neutral");
  });

  it("treats a malformed signoff as unsigned", async () => {
    const runs = await runsDir();
    const bad = path.join(runs, "bad-ia.md");
    await writeFile(bad, "# bad\n\n<!-- signoff {not json} -->\n", "utf8");
    const result = await runCli([
      ...baseArgs(runs),
      "--signoff-ia",
      bad,
      "--allow-unreviewed",
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("AWAITING_SIGNOFF");
    const state = await readState(await singleRunDir(runs));
    expect(state.status).toBe("awaiting_signoff");
    expect(state.signoff.ia).toBe(false);
    await expect(
      readFile(
        path.join(await singleRunDir(runs), "artifacts", "visual-style.json"),
        "utf8"
      )
    ).resolves.toContain("neutral");
  });

  it("returns exit 2 when the project has no PRD", async () => {
    const dir = await runsDir();
    const project = path.join(dir, "project.yaml");
    await writeFile(
      project,
      [
        "project: employee-app",
        `brief: ${path.join(pipelineRoot, "samples", "projects", "employee-app", "ui-brief.json")}`,
        "manifests:",
        `  b-mobile: ${path.join(pipelineRoot, "samples", "projects", "employee-app", "asset-manifest.b-mobile.json")}`,
      ].join("\n") + "\n",
      "utf8"
    );
    const runs = path.join(dir, "runs");
    const result = await runCli([
      "--project",
      project,
      "--runs",
      runs,
      "--allow-unreviewed",
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("missing PRD");
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
