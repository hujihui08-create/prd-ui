import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RunState } from "@prd-ui/contracts";
import type { ValidationReport } from "@prd-ui/validators";
import { runPhase1 } from "../src/run-phase1.js";

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

describe("runPhase1", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("compiles and validates the 8-page sample brief with zero blockers", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-phase1-"));
    const result = await runPhase1({ runsDir: tmpDir });

    expect(result.passed).toBe(true);
    expect(result.pages).toBe(8);
    expect(result.blockers).toBe(0);
    expect(result.runId).toMatch(/^run-\d{4}-\d{2}-\d{2}T/);

    const runDir = path.join(tmpDir, result.runId);
    expect(result.runDir).toBe(runDir);

    const state = await readJson<RunState>(path.join(runDir, "state.json"));
    expect(state.stage).toBe("done");
    expect(state.status).toBe("success");
    expect(state.runId).toBe(result.runId);

    const pageSpecFiles = (await readdir(path.join(runDir, "artifacts", "page-spec"))).filter(
      (file) => file.endsWith(".json")
    );
    expect(pageSpecFiles).toHaveLength(8);

    const reports = await readJson<ValidationReport[]>(
      path.join(runDir, "reports", "validation.json")
    );
    expect(reports).toHaveLength(8);
    expect(reports.every((report) => report.passed)).toBe(true);
    expect(reports.every((report) => report.blockers === 0)).toBe(true);

    await expect(stat(path.join(runDir, "artifacts", "ui-brief.json"))).resolves.toBeDefined();
    const log = await readFile(path.join(runDir, "logs", "run.log"), "utf8");
    expect(log).toContain(`run ${result.runId} started`);
    expect(log).toContain("compile complete: 8 page specs");
  });
});
