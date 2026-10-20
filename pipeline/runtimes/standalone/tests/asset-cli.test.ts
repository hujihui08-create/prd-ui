import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parseArgs } from "../src/asset-cli.js";

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

async function tempAssets(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-assets-"));
  temporaryDirs.push(dir);
  await cp(m0, dir, { recursive: true });
  return dir;
}

async function breakIconSet(assetsDir: string): Promise<string> {
  const search = path.join(assetsDir, "library", "icons", "search.svg");
  const svg = await readFile(search, "utf8");
  await writeFile(search, svg.replace('stroke-linecap="round"', 'stroke-linecap="square"'), "utf8");
  return assetsDir;
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

function withoutProviderEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const copy = { ...env };
  delete copy.PRD_UI_VISION_BASE_URL;
  delete copy.PRD_UI_VISION_MODEL;
  delete copy.PRD_UI_VISION_API_KEY;
  return copy;
}

const providerEnv: NodeJS.ProcessEnv = {
  PRD_UI_VISION_BASE_URL: "https://example.test/v1",
  PRD_UI_VISION_MODEL: "vision",
};

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
    expect(result.stdout).toContain("--fail-fast");
    expect(result.stdout).toContain("--max-review-cost-cny");
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
    expect(review.error).toBeUndefined();
    const iconSet = await readJson(path.join(runDir, "assets", "icon-set.json"));
    expect(iconSet.passed).toBe(true);
    const illustrationSet = await readJson(path.join(runDir, "assets", "illustration-set.json"));
    expect(illustrationSet.passed).toBe(true);
  });

  it("exits 1 and marks the manifest incomplete when the icon set disagrees", async () => {
    const assets = await breakIconSet(await tempAssets());
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      assets,
      "--runtime",
      "standalone",
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("13 assets, 13 passed");
    expect(result.stderr).toContain("ICON_SET_INCONSISTENT");

    const runDir = await onlyRun(runs);
    const manifest = await readJson(path.join(runDir, "manifest.json"));
    expect(manifest.complete).toBe(false);
    const iconSet = await readJson(path.join(runDir, "assets", "icon-set.json"));
    expect(iconSet.passed).toBe(false);
    const review = await readJson(path.join(runDir, "asset-review.json"));
    expect(review.error).toBe("ICON_SET_INCONSISTENT");
    expect(review.passed).toBe(false);
  });

  it("skips set gates for --only and records a partial review", async () => {
    const assets = await breakIconSet(await tempAssets());
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      assets,
      "--only",
      "icon-home",
      "--runtime",
      "standalone",
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(0);

    const runDir = await onlyRun(runs);
    const batchGates = await readJson(path.join(runDir, "assets", "batch-gates.json"));
    expect(batchGates).toEqual({
      skipped: true,
      reason: "PARTIAL_REVIEW",
      scope: ["icon-home"],
    });
    await expect(stat(path.join(runDir, "assets", "icon-set.json"))).rejects.toThrow();
    const manifest = await readJson(path.join(runDir, "manifest.json"));
    expect(manifest.complete).toBe(true);
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

  it("fails on malformed style.json with INVALID_STYLE and the file path", async () => {
    const assets = await tempAssets();
    const stylePath = path.join(assets, "style.json");
    await writeFile(stylePath, "{ bad json", "utf8");
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      assets,
      "--dry-run",
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("INVALID_STYLE");
    expect(result.stderr).toContain(stylePath);
  });

  it("fails on a style.json with unknown fields", async () => {
    const assets = await tempAssets();
    const stylePath = path.join(assets, "style.json");
    await writeFile(
      stylePath,
      JSON.stringify({ id: "b-mobile", unexpected: "strict schema must reject this" }),
      "utf8"
    );
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      assets,
      "--dry-run",
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("INVALID_STYLE");
    expect(result.stderr).toContain(stylePath);
  });

  it("fails on an invalid source-policy.json with INVALID_SOURCE_POLICY", async () => {
    const assets = await tempAssets();
    const policyPath = path.join(assets, "source-policy.json");
    await writeFile(policyPath, JSON.stringify({ chains: {} }), "utf8");
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      assets,
      "--dry-run",
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("INVALID_SOURCE_POLICY");
    expect(result.stderr).toContain(policyPath);
  });

  it("uses default style and policy when config files are missing", async () => {
    const assets = await tempAssets();
    await rm(path.join(assets, "style.json"), { force: true });
    await rm(path.join(assets, "source-policy.json"), { force: true });
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      assets,
      "--dry-run",
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Asset preflight OK: 13 assets");
  });

  it("runs the scripted reviewer without provider env", async () => {
    const runs = await tempRuns();
    const result = await runCli(
      ["--project", projectPath, "--assets", m0, "--runtime", "standalone", "--runs", runs],
      withoutProviderEnv()
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("13 assets, 13 passed");
  });

  it("fails fast when the dsh provider env is missing", async () => {
    const runs = await tempRuns();
    const result = await runCli(
      ["--project", projectPath, "--assets", m0, "--runtime", "dsh", "--runs", runs],
      withoutProviderEnv()
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CONFIGURATION_ERROR");
    expect(result.stderr).toContain("PRD_UI_VISION_BASE_URL");
    expect(result.stderr).toContain("PRD_UI_VISION_MODEL");
  });

  it("fails fast when the model reviewer provider env is missing", async () => {
    const runs = await tempRuns();
    const result = await runCli(
      ["--project", projectPath, "--assets", m0, "--reviewer", "model", "--runs", runs],
      withoutProviderEnv()
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("CONFIGURATION_ERROR");
    expect(result.stderr).toContain("PRD_UI_VISION_BASE_URL");
    expect(result.stderr).toContain("PRD_UI_VISION_MODEL");
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
      { ...process.env, ...providerEnv, PRD_UI_VISION_API_KEY: "" }
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("PRD_UI_VISION_API_KEY");
  });

  it("fails fast and surfaces a missing vision credential without a fake pass", async () => {
    const runs = await tempRuns();
    const result = await runCli(
      [
        "--project",
        projectPath,
        "--assets",
        m0,
        "--runtime",
        "dsh",
        "--fail-fast",
        "--runs",
        runs,
      ],
      { ...process.env, ...providerEnv, PRD_UI_VISION_API_KEY: "" }
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/MISSING_CREDENTIAL|PRD_UI_VISION_API_KEY/);
  });

  it("fails fast on malformed pricing with INVALID_PRICING", async () => {
    const assets = await tempAssets();
    const pricingPath = path.join(assets, "pricing.json");
    await writeFile(pricingPath, JSON.stringify({ default: "x", providers: {} }), "utf8");
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      assets,
      "--dry-run",
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("INVALID_PRICING");
    expect(result.stderr).toContain(pricingPath);
  });

  it("accepts an explicit --pricing file", async () => {
    const assets = await tempAssets();
    const pricingFile = path.join(assets, "custom-pricing.json");
    await writeFile(
      pricingFile,
      JSON.stringify({
        default: "custom",
        providers: {
          custom: {
            inputMissUsdPerMillion: 1,
            inputCacheUsdPerMillion: 0.1,
            outputUsdPerMillion: 2,
            usdToCny: 7,
          },
        },
      }),
      "utf8"
    );
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      assets,
      "--only",
      "icon-home",
      "--pricing",
      pricingFile,
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Review cost: reviewCostCny=unavailable");
  });

  it("fails closed when a review budget is set but usage is unavailable", async () => {
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      m0,
      "--only",
      "icon-home",
      "--max-review-cost-cny",
      "0.1",
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("REVIEW_USAGE_INCOMPLETE");

    const runDir = await onlyRun(runs);
    const review = await readJson(path.join(runDir, "asset-review.json"));
    expect(review.error).toBe("REVIEW_USAGE_INCOMPLETE");
    expect(review.usageComplete).toBe(false);
    expect((review.summary as { reviewCostCny?: number }).reviewCostCny).toBeUndefined();
  });

  it("continues past unknown review cost with --allow-unknown-cost", async () => {
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      m0,
      "--only",
      "icon-home",
      "--max-review-cost-cny",
      "0.1",
      "--allow-unknown-cost",
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "Review cost: reviewCostCny=unavailable usageSource=unavailable usageComplete=false"
    );
  });
});

describe("parseArgs", () => {
  it("defaults the global review budget to 10 CNY only for dsh", () => {
    expect(parseArgs([]).maxReviewCostCny).toBeUndefined();
    expect(parseArgs(["--runtime", "dsh"]).maxReviewCostCny).toBe(10);
    expect(
      parseArgs(["--runtime", "dsh", "--max-review-cost-cny", "2"]).maxReviewCostCny
    ).toBe(2);
    expect(parseArgs(["--runtime", "dsh", "--allow-unknown-cost"]).allowUnknownCost).toBe(
      true
    );
  });
});
