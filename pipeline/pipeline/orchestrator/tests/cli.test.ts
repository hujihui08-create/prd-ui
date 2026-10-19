import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { AssetManifest, PageSpec, UiBrief } from "@prd-ui/contracts";

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
    expect(result.stderr).toContain("Phase 1A FAILED: missing manifests");
    expect(result.stderr).not.toContain("Run:");
    await expect(stat(runsDir)).rejects.toThrow();
  });

  it("rejects an empty option value instead of falling back to the sample", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));

    const result = await runCli(["--project", "", "--runs", path.join(tmpDir, "runs")], {
      cwd: tmpDir,
    });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("missing value for --project");
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("prints the run directory when a post-intake failure is thrown", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));
    const runsDir = path.join(tmpDir, "runs");
    const briefPath = path.join(tmpDir, "invalid-brief.json");
    await writeFile(briefPath, JSON.stringify({ meta: { project: "broken" } }), "utf8");

    const result = await runCli(
      [
        "--brief",
        briefPath,
        "--manifest",
        "b-dense=samples/asset-manifest.b-dense.json",
        "--manifest",
        "c-expressive=samples/asset-manifest.c-expressive.json",
        "--runs",
        runsDir,
      ],
      { cwd: pipelineRoot }
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Phase 1A FAILED:");
    expect(result.stderr).toContain(`Run: ${runsDir}/run-`);
    const runDir = await findRunDir(runsDir);
    const state = JSON.parse(
      await readFile(path.join(runDir, "state.json"), "utf8")
    ) as { status: string; gates: { brief: string } };
    expect(state.status).toBe("failed");
    expect(state.gates.brief).toBe("failed");
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
    expect(result.stdout).toContain("Phase 1A FAILED: 0 pages, 1 blocker");
    expect(result.stdout).toContain(`Run: ${runsDir}/run-`);
    expect(result.stdout).toContain("- PROJECT-MANIFEST-MISSING:");
    expect(result.stdout).toContain("c-expressive");
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
    expect(result.stdout).toContain("Phase 1A FAILED: 0 pages, 1 blocker");
    expect(result.stdout).toContain(`Run: ${runsDir}/run-`);
    expect(result.stdout).toContain("- PROJECT-MISMATCH:");
    expect(result.stdout).toContain('"another-project"');
    const log = await readLog(await findRunDir(runsDir));
    expect(log).toContain("PROJECT-MISMATCH");
  });

  it("prints page validation blockers on stdout", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));
    const runsDir = path.join(tmpDir, "runs");
    const brief = JSON.parse(
      await readFile(path.join(samplesDir, "ui-brief.sample.json"), "utf8")
    ) as UiBrief;
    const ordersList = brief.ia.pages.find((page) => page.id === "orders-list")!;
    ordersList.emptyAssetRef = "missing-illustration";
    const briefPath = path.join(tmpDir, "brief.json");
    await writeFile(briefPath, JSON.stringify(brief), "utf8");

    const result = await runCli(
      [
        "--brief",
        briefPath,
        "--manifest",
        "b-dense=samples/asset-manifest.b-dense.json",
        "--manifest",
        "c-expressive=samples/asset-manifest.c-expressive.json",
        "--runs",
        runsDir,
      ],
      { cwd: pipelineRoot }
    );

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Phase 1A FAILED: 8 pages, 1 blocker");
    expect(result.stdout).toContain(`Run: ${runsDir}/run-`);
    expect(result.stdout).toContain("- ASSET-MISSING:");
    expect(result.stdout).toContain("missing-illustration");
  });

  it("runs a 9-page customers-list brief with --brief and --manifest", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));
    const workDir = tmpDir;
    const runsDir = path.join(workDir, "runs");
    const brief = JSON.parse(
      await readFile(path.join(samplesDir, "ui-brief.sample.json"), "utf8")
    ) as UiBrief;
    for (const page of brief.ia.pages) delete page.emptyAssetRef;
    brief.ia.pages.push({
      id: "customers-list",
      name: "客户列表",
      purpose: "查看和管理客户",
      archetype: "list",
      target: "web",
      profile: "b-dense",
      route: "/customers",
      roles: ["admin", "operator"],
      requiredStates: ["default", "empty", "loading", "error"],
      reqRefs: ["REQ-ORDER-009"],
      fields: ["customerName", "phone", "email"],
      filterFields: ["name", "phone"],
      actions: ["新建客户", "导出客户"],
      emptyTitle: "暂无客户",
    });
    brief.traceability.reqMap["REQ-ORDER-009"] = ["customers-list"];
    const briefPath = path.join(workDir, "brief.json");
    await writeFile(briefPath, JSON.stringify(brief), "utf8");

    const writeIconsOnly = async (profile: string): Promise<string> => {
      const manifest = JSON.parse(
        await readFile(
          path.join(samplesDir, `asset-manifest.${profile}.json`),
          "utf8"
        )
      ) as AssetManifest;
      manifest.assets = manifest.assets.filter((asset) => asset.kind === "icon");
      const manifestPath = path.join(workDir, `asset-manifest.${profile}.json`);
      await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
      return manifestPath;
    };
    const bDenseManifest = await writeIconsOnly("b-dense");
    const cExpressiveManifest = await writeIconsOnly("c-expressive");

    const result = await runCli(
      [
        "--brief",
        briefPath,
        "--manifest",
        `b-dense=${bDenseManifest}`,
        "--manifest",
        `c-expressive=${cExpressiveManifest}`,
        "--runs",
        runsDir,
      ],
      { cwd: pipelineRoot }
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Phase 1A OK: 9 pages, 0 blockers");
    expect(result.stdout).toContain(`Run: ${runsDir}/run-`);

    const runDir = await findRunDir(runsDir);
    const spec = JSON.parse(
      await readFile(
        path.join(runDir, "artifacts", "page-spec", "customers-list.json"),
        "utf8"
      )
    ) as PageSpec;
    const layout = JSON.stringify(spec.layout);
    expect(layout).toContain("新建客户");
    expect(layout).toContain("导出客户");
    expect(JSON.stringify(spec)).not.toContain("empty-orders");
  });

  it("resolves a project runsDir relative to the project file", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));
    const projectDir = path.join(tmpDir, "project");
    await mkdir(projectDir, { recursive: true });
    const projectPath = path.join(projectDir, "project.yaml");
    await writeFile(
      projectPath,
      [
        "project: demo-orders",
        `brief: ${JSON.stringify(path.join(samplesDir, "ui-brief.sample.json"))}`,
        "manifests:",
        `  b-dense: ${JSON.stringify(path.join(samplesDir, "asset-manifest.b-dense.json"))}`,
        `  c-expressive: ${JSON.stringify(
          path.join(samplesDir, "asset-manifest.c-expressive.json")
        )}`,
        "runsDir: out/runs",
        "",
      ].join("\n"),
      "utf8"
    );

    const result = await runCli(["--project", projectPath], { cwd: tmpDir });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Phase 1A OK: 8 pages, 0 blockers");
    await expect(
      findRunDir(path.join(projectDir, "out", "runs"))
    ).resolves.toBeDefined();
  });

  it("uses --brief to override a project's brief", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));
    const brief = JSON.parse(
      await readFile(path.join(samplesDir, "ui-brief.sample.json"), "utf8")
    ) as UiBrief;
    brief.ia.pages.find((page) => page.id === "orders-list")!.name = "订单列表（覆盖）";
    const briefPath = path.join(tmpDir, "override-brief.json");
    await writeFile(briefPath, JSON.stringify(brief), "utf8");
    const runsDir = path.join(tmpDir, "runs");

    const result = await runCli(
      [
        "--project",
        "samples/project.demo-orders.yaml",
        "--brief",
        briefPath,
        "--runs",
        runsDir,
      ],
      { cwd: pipelineRoot }
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Phase 1A OK: 8 pages, 0 blockers");
    const runDir = await findRunDir(runsDir);
    const spec = JSON.parse(
      await readFile(
        path.join(runDir, "artifacts", "page-spec", "orders-list.json"),
        "utf8"
      )
    ) as PageSpec;
    expect(spec.meta.name).toBe("订单列表（覆盖）");
  });

  it("applies --manifest overrides over project manifests", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));
    const runsDir = path.join(tmpDir, "runs");

    const result = await runCli(
      [
        "--project",
        "samples/projects/demo-crm/project.yaml",
        "--manifest",
        "b-dense=samples/asset-manifest.b-dense.json",
        "--runs",
        runsDir,
      ],
      { cwd: pipelineRoot }
    );

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Phase 1A FAILED: 0 pages, 1 blocker");
    expect(result.stdout).toContain("- PROJECT-MANIFEST-PROJECT:");
    expect(result.stdout).toContain("demo-orders");
  });

  it("runs the demo-crm project with its own brief and manifest", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-cli-"));
    const runsDir = path.join(tmpDir, "runs");

    const result = await runCli(
      ["--project", "samples/projects/demo-crm/project.yaml", "--runs", runsDir],
      { cwd: pipelineRoot }
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Phase 1A OK: 1 page, 0 blockers");
    expect(result.stdout).toContain(`Run: ${runsDir}/run-`);

    const runDir = await findRunDir(runsDir);
    const state = JSON.parse(
      await readFile(path.join(runDir, "state.json"), "utf8")
    ) as { stage: string; status: string };
    expect(state.stage).toBe("done");
    expect(state.status).toBe("success");
    await expect(
      stat(path.join(runDir, "artifacts", "page-spec", "contacts-list.json"))
    ).resolves.toBeDefined();
  });
});
