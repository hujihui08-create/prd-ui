import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/figma-cli.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const specRun = path.join(
  pipelineRoot,
  "artifacts/employee-app-phase2/figma/spec-source"
);
const temporaryDirs: string[] = [];
const silent = { stdout: () => undefined, stderr: () => undefined };

afterEach(async () => {
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-figma-plan-"));
  temporaryDirs.push(dir);
  return dir;
}

/** Every string in the JSON must be a relative path or a non-path value. */
function expectNoAbsolutePaths(value: unknown, repoRoot: string): void {
  if (typeof value === "string") {
    expect(path.isAbsolute(value), value).toBe(false);
    expect(value.startsWith(repoRoot), value).toBe(false);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) expectNoAbsolutePaths(entry, repoRoot);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) expectNoAbsolutePaths(entry, repoRoot);
  }
}

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
}

describe("figma:plan portable provenance", () => {
  it("writes a repo-relative specRun for a run inside the repo", async () => {
    const out = await tempDir();
    const code = await main(["plan", "--spec-run", specRun, "--out", out], silent);
    expect(code).toBe(0);

    const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: pipelineRoot,
      encoding: "utf8",
    }).trim();
    const expected = path.relative(repoRoot, specRun).split(path.sep).join("/");

    const index = await readJson(path.join(out, "figma-plan.index.json"));
    const coverage = await readJson(path.join(out, "plan-coverage.json"));
    expect(index.specRun).toBe(expected);
    expect(coverage.specRun).toBe(expected);
    expectNoAbsolutePaths(index, repoRoot);
    expectNoAbsolutePaths(coverage, repoRoot);
  }, 120_000);

  it("writes only the run basename when the run is outside the repo", async () => {
    const run = await tempDir();
    const specDir = path.join(run, "artifacts/page-spec");
    await mkdir(specDir, { recursive: true });
    await copyFile(
      path.join(specRun, "artifacts/page-spec/today.json"),
      path.join(specDir, "today.json")
    );
    const out = path.join(run, "out");

    const code = await main(["plan", "--spec-run", run, "--out", out], silent);
    expect(code).toBe(0);

    const index = await readJson(path.join(out, "figma-plan.index.json"));
    const coverage = await readJson(path.join(out, "plan-coverage.json"));
    expect(index.specRun).toBe(path.basename(run));
    expect(coverage.specRun).toBe(path.basename(run));
    expectNoAbsolutePaths(index, os.tmpdir());
    expectNoAbsolutePaths(coverage, os.tmpdir());
  }, 120_000);
});
