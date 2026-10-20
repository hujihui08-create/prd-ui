import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { ArtifactStorePort } from "@prd-ui/asset-review";
import { AssetManifestSchema } from "@prd-ui/contracts";
import { assertContract, createLogger, parseArgs } from "../src/asset-cli.js";

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
    expect(result.stdout).toContain("--json");
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

  it("writes manifest.review.json and 2x PNG evidence for every SVG", async () => {
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

    const runDir = await onlyRun(runs);
    const sidecar = await readJson(path.join(runDir, "manifest.review.json"));
    expect(sidecar).toMatchObject({
      project: "employee-app",
      profile: "b-mobile",
      usageSource: "unavailable",
      usageComplete: false,
      complete: true,
    });
    expect((sidecar.assets as unknown[]).length).toBe(13);
    expect(sidecar.batchGates).toEqual({
      iconSetPassed: true,
      illustrationSetPassed: true,
    });

    const png = await readFile(
      path.join(runDir, "assets", "attempts", "icon-home", "library-1", "candidate.png")
    );
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(48);
    expect(png.readUInt32BE(20)).toBe(48);
  });

  it("records the skipped set gates in manifest.review.json for --only", async () => {
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
    const sidecar = await readJson(path.join(runDir, "manifest.review.json"));
    expect(sidecar.batchGates).toEqual({ skipped: true, reason: "PARTIAL_REVIEW" });
    expect(sidecar.complete).toBe(true);
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

  it("appends one log line per state-machine event", async () => {
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

    const runDir = await onlyRun(runs);
    const log = await readFile(path.join(runDir, "log.ndjson"), "utf8");
    expect(log.endsWith("\n")).toBe(true);
    const types = log
      .trimEnd()
      .split("\n")
      .map((line) => (JSON.parse(line) as { type: string }).type);
    expect(types).toEqual([
      "asset_started",
      "source_selected",
      "attempt_started",
      "gate_result",
      "review_result",
      "asset_frozen",
      "batch_gates_skipped",
      "run_finished",
    ]);
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

  it("prints one parseable JSON summary on stdout with --json", async () => {
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
      "--json",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);

    const summary = JSON.parse(result.stdout) as {
      runDir: string;
      summary: { total: number; passed: number };
      assets: Array<{ assetId: string; status: string }>;
      batchGates: unknown;
      error: unknown;
      reviewCostCny: unknown;
      usageSource: unknown;
      usageComplete: unknown;
    };
    expect(summary.runDir).toBe(await onlyRun(runs));
    expect(summary.summary).toMatchObject({ total: 1, passed: 1 });
    expect(summary.assets).toHaveLength(1);
    expect(summary.assets[0]).toMatchObject({ assetId: "icon-home", status: "passed" });
    expect(summary.batchGates).toEqual({
      skipped: true,
      reason: "PARTIAL_REVIEW",
      scope: ["icon-home"],
    });
    expect(summary.error).toBeNull();
    expect(summary.reviewCostCny).toBeNull();
    expect(summary.usageSource).toBe("unavailable");
    expect(summary.usageComplete).toBe(false);
    expect(result.stdout).not.toContain("Asset review OK");
    expect(result.stderr).toBe("");
  });

  it("emits the preflight payload with --dry-run --json and suppresses the human summary", async () => {
    const runs = await tempRuns();
    const result = await runCli([
      "--project",
      projectPath,
      "--assets",
      m0,
      "--only",
      "icon-home",
      "--dry-run",
      "--runs",
      runs,
      "--json",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);

    const summary = JSON.parse(result.stdout) as {
      runDir: string;
      summary: unknown;
      assets: unknown[];
      batchGates: unknown;
      error: unknown;
      reviewCostCny: unknown;
      usageSource: unknown;
      usageComplete: unknown;
      preflight: { passed: boolean; items: Array<{ assetId: string; passed: boolean }> };
    };
    expect(summary.runDir).toBe(await onlyRun(runs));
    expect(summary.summary).toBeNull();
    expect(summary.assets).toEqual([]);
    expect(summary.batchGates).toBeNull();
    expect(summary.error).toBeNull();
    expect(summary.reviewCostCny).toBeNull();
    expect(summary.usageSource).toBeNull();
    expect(summary.usageComplete).toBeNull();
    expect(summary.preflight.passed).toBe(true);
    expect(summary.preflight.items).toHaveLength(1);
    expect(summary.preflight.items[0]).toMatchObject({ assetId: "icon-home", passed: true });
    expect(result.stderr).toBe("");
  });

  it("keeps help and argument errors outside the JSON contract", async () => {
    const help = await runCli(["--json", "--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("pnpm asset:review");
    expect(help.stdout).not.toContain('"runDir"');

    const usageError = await runCli(["--json", "--nope"]);
    expect(usageError.code).toBe(2);
    expect(usageError.stdout).toBe("");
    expect(usageError.stderr).toContain("unknown argument");
  });

  it("keeps the JSON summary machine-readable when the run fails", async () => {
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
      "--json",
    ]);
    expect(result.code).toBe(1);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);

    const summary = JSON.parse(result.stdout) as {
      runDir: string;
      summary: { total: number; passed: number };
      error: string;
      reviewCostCny: unknown;
      usageComplete: unknown;
    };
    expect(summary.runDir).toBe(await onlyRun(runs));
    expect(summary.summary).toMatchObject({ total: 1, passed: 1 });
    expect(summary.error).toBe("REVIEW_USAGE_INCOMPLETE");
    expect(summary.reviewCostCny).toBeNull();
    expect(summary.usageComplete).toBe(false);
    expect(result.stdout).not.toContain("Asset review FAILED");
    expect(result.stderr).toBe("");
  });
});

describe("createLogger", () => {
  it("appends one redacted JSON line per event and never rewrites the log", async () => {
    const appended: string[] = [];
    let rewrites = 0;
    const store: ArtifactStorePort = {
      async writeJson() {},
      async writeText() {
        rewrites += 1;
      },
      async appendText(path, value) {
        expect(path).toBe("log.ndjson");
        appended.push(value);
      },
      async readText() {
        return "";
      },
      async hash() {
        return "sha256:x";
      },
    };
    const logger = createLogger(store);

    await logger.log({
      type: "first",
      note: "token sk-abcdefgh12345678",
      apiKey: "api-key-value",
      token: "tok_live_123456",
      secret: "s3cr3t-value",
      authorization: "Bearer auth-token-value",
    });
    await logger.log({ type: "second" });
    await logger.log({ type: "third", inconsistencies: ["authorization: missing"] });

    expect(appended).toHaveLength(3);
    expect(appended.every((line) => line.endsWith("\n"))).toBe(true);
    expect(appended[0]).toContain("sk-***");
    expect(appended[0]).not.toContain("sk-abcdefgh12345678");
    for (const secret of [
      "api-key-value",
      "tok_live_123456",
      "s3cr3t-value",
      "auth-token-value",
    ]) {
      expect(appended[0]).not.toContain(secret);
    }
    expect(appended.map((line) => (JSON.parse(line) as { type: string }).type)).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(JSON.parse(appended[0]!)).toMatchObject({
      apiKey: "***",
      token: "***",
      secret: "***",
      authorization: "***",
    });
    expect(JSON.parse(appended[2]!)).toMatchObject({
      inconsistencies: ["authorization: ***"],
    });
    expect(rewrites).toBe(0);
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

  it("parses --json", () => {
    expect(parseArgs([]).json).toBe(false);
    expect(parseArgs(["--json"]).json).toBe(true);
  });
});

describe("package exports", () => {
  it("exports the asset CLI entry points without clobbering the phase1 ones", async () => {
    const module = await import("../src/index.js");
    expect(typeof module.assetMain).toBe("function");
    expect(typeof module.parseAssetArgs).toBe("function");
    expect(module.ASSET_USAGE).toContain("--json");
    expect(typeof module.phase1Main).toBe("function");
    expect(typeof module.parseArgs).toBe("function");
  });
});

describe("assertContract", () => {
  it("returns parsed data for a valid manifest", () => {
    const manifest = {
      project: "employee-app",
      profile: "b-mobile",
      assets: [],
      placeholders: [],
      complete: false,
    };
    expect(assertContract(AssetManifestSchema, manifest, "manifest.json")).toEqual(manifest);
  });

  it("throws CONTRACT_VIOLATION for an invalid manifest", () => {
    expect(() =>
      assertContract(AssetManifestSchema, { project: "", profile: "b" }, "manifest.json")
    ).toThrow(/CONTRACT_VIOLATION: manifest\.json/);
  });
});
