import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
const cliPath = path.join(pipelineRoot, "pipeline", "orchestrator", "src", "cli.ts");
const samplesDir = path.join(pipelineRoot, "samples");

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(
  args: string[],
  options: { cwd?: string } = {}
): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsxCli, cliPath, ...args],
      { cwd: options.cwd ?? pipelineRoot, maxBuffer: 4 * 1024 * 1024 }
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

async function findRunDir(runsDir: string): Promise<string> {
  const entries = await readdir(runsDir, { withFileTypes: true });
  const runDirs = entries.filter(
    (entry) => entry.isDirectory() && entry.name.startsWith("run-")
  );
  expect(runDirs).toHaveLength(1);
  return path.join(runsDir, runDirs[0]!.name);
}

async function readLog(runDir: string): Promise<string> {
  return readFile(path.join(runDir, "logs", "run.log"), "utf8");
}

describe("phase1 CLI", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("--help prints usage, exits 0, and does not run", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));

    const result = await runCli(["--help"], { cwd: tmpDir });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: pnpm phase1:verify");
    expect(result.stdout).toContain("--manifest <profile>=<path>");
    expect(result.stdout).not.toContain("Phase 1A");
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("exits 2 for an unknown argument", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));

    const result = await runCli(["--unknown"], { cwd: tmpDir });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown argument: --unknown");
    expect(result.stderr).toContain("Usage: pnpm phase1:verify");
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("runs the default sample project with no arguments", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));

    const result = await runCli([], { cwd: tmpDir });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Phase 1A OK: 8 pages, 0 blockers");
    expect(result.stdout).toMatch(/Run: .*\/runs\/run-/);
    expect(await findRunDir(path.join(tmpDir, "runs"))).toBeDefined();
  });

  it("runs --project samples/project.demo-orders.yaml", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));
    const runsDir = path.join(tmpDir, "runs");

    const result = await runCli(
      ["--project", "samples/project.demo-orders.yaml", "--runs", runsDir],
      { cwd: pipelineRoot }
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Phase 1A OK: 8 pages, 0 blockers");
    expect(result.stdout).toContain(`Run: ${runsDir}/run-`);
  });

  it("runs a custom brief with repeated --manifest overrides", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));
    const runsDir = path.join(tmpDir, "runs");

    const result = await runCli(
      [
        "--brief",
        "samples/ui-brief.sample.json",
        "--manifest",
        "b-dense=samples/asset-manifest.b-dense.json",
        "--manifest",
        "c-expressive=samples/asset-manifest.c-expressive.json",
        "--runs",
        runsDir,
      ],
      { cwd: pipelineRoot }
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Phase 1A OK: 8 pages, 0 blockers");
    expect(result.stdout).toContain(`Run: ${runsDir}/run-`);
  });

  it("fails with a clear error when a custom brief has no manifests", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));
    const runsDir = path.join(tmpDir, "runs");

    const result = await runCli(
      ["--brief", "samples/ui-brief.sample.json", "--runs", runsDir],
      { cwd: pipelineRoot }
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("missing manifests");
    await expect(stat(runsDir)).rejects.toThrow();
  });

  it("fails when a page profile has no manifest", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));
    const runsDir = path.join(tmpDir, "runs");

    const result = await runCli(
      [
        "--brief",
        "samples/ui-brief.sample.json",
        "--manifest",
        "b-dense=samples/asset-manifest.b-dense.json",
        "--runs",
        runsDir,
      ],
      { cwd: pipelineRoot }
    );

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Phase 1A FAILED: 0 pages, 1 blockers");
    expect(result.stdout).toContain(`Run: ${runsDir}/run-`);
    const log = await readLog(await findRunDir(runsDir));
    expect(log).toContain("PROJECT-MANIFEST-MISSING");
    expect(log).toContain("c-expressive");
  });

  it("fails when the project config and brief projects disagree", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));
    const runsDir = path.join(tmpDir, "runs");
    const projectPath = path.join(tmpDir, "project.bad.yaml");
    await writeFile(
      projectPath,
      [
        "project: another-project",
        `brief: ${JSON.stringify(path.join(samplesDir, "ui-brief.sample.json"))}`,
        "manifests:",
        `  b-dense: ${JSON.stringify(path.join(samplesDir, "asset-manifest.b-dense.json"))}`,
        `  c-expressive: ${JSON.stringify(path.join(samplesDir, "asset-manifest.c-expressive.json"))}`,
        "",
      ].join("\n"),
      "utf8"
    );

    const result = await runCli(
      ["--project", projectPath, "--runs", runsDir],
      { cwd: pipelineRoot }
    );

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Phase 1A FAILED: 0 pages, 1 blockers");
    expect(result.stdout).toContain(`Run: ${runsDir}/run-`);
    const log = await readLog(await findRunDir(runsDir));
    expect(log).toContain("PROJECT-MISMATCH");
  });
});
