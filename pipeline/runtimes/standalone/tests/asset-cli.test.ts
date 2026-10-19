import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const tsxCli = path.join(pipelineRoot, "node_modules", "tsx", "dist", "cli.mjs");
const cliPath = path.join(pipelineRoot, "runtimes", "standalone", "src", "asset-cli.ts");
const projectPath = path.join(pipelineRoot, "samples", "projects", "employee-app", "project.yaml");
const m0 = path.join(pipelineRoot, "samples", "assets", "m0");
const scenarios = path.join(pipelineRoot, "samples", "assets", "m0-scenarios");

const temporaryDirs: string[] = [];

async function tempRuns(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-asset-runs-"));
  temporaryDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCli, cliPath, ...args], {
      cwd: pipelineRoot,
      env,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

async function onlyRun(runsDir: string): Promise<string> {
  const { readdir } = await import("node:fs/promises");
  const entries = (await readdir(runsDir, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && entry.name.startsWith("run-")
  );
  expect(entries).toHaveLength(1);
  return path.join(runsDir, entries[0]!.name);
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
}

describe("asset:review CLI", () => {
  it("prints usage for --help", async () => {
    const result = await runCli(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("pnpm asset:review");
  });

  it("rejects an unknown argument with exit 2", async () => {
    const result = await runCli(["--nope"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown argument");
  });

  it("runs 13 A-library assets through standalone", async () => {
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      m0,
      "--runtime",
      "standalone",
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("13 assets, 13 passed");

    const runDir = await onlyRun(runs);
    const manifest = await readJson(path.join(runDir, "manifest.json"));
    expect(manifest.complete).toBe(true);
    expect((manifest.assets as unknown[]).length).toBe(13);
    const review = await readJson(path.join(runDir, "asset-review.json"));
    expect((review.summary as { passed: number }).passed).toBe(13);
  });

  it("runs a single asset with --only", async () => {
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      m0,
      "--only",
      "icon-home",
      "--runtime",
      "standalone",
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("1 assets, 1 passed");
  });

  it("dry-run writes gates but no frozen assets", async () => {
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      m0,
      "--dry-run",
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Asset preflight OK: 13 assets");
    const runDir = await onlyRun(runs);
    await expect(stat(path.join(runDir, "assets", "frozen"))).rejects.toThrow();
    const gate = await readJson(
      path.join(runDir, "assets", "attempts", "icon-home", "library-1", "gate.json")
    );
    expect(gate.passed).toBe(true);
  });

  it("exits 1 and records unresolved for the scenario fixture", async () => {
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      scenarios,
      "--runtime",
      "standalone",
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("1 unresolved");
    const runDir = await onlyRun(runs);
    const review = await readJson(path.join(runDir, "asset-review.json"));
    const assets = review.assets as Array<{ assetId: string; status: string }>;
    expect(assets.find((asset) => asset.assetId === "illus-unresolved")?.status).toBe("unresolved");
    expect(assets.find((asset) => asset.assetId === "icon-retry")?.status).toBe("passed");
  });

  it("fails fast when the model reviewer has no key", async () => {
    const runs = await tempRuns();
    const result = await runCli(
      [
        "--project",
        projectPath,
        "--assets",
        m0,
        "--reviewer",
        "model",
        "--runs",
        runs,
      ],
      { ...process.env, PRD_UI_VISION_API_KEY: "" }
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("PRD_UI_VISION_API_KEY");
  });

  it("surfaces a missing dsh binary without a fake pass", async () => {
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      m0,
      "--runtime",
      "dsh",
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("DSH_UNAVAILABLE");
  });
});
