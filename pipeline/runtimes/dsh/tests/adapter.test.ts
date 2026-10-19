import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AssetReviewerInput } from "@prd-ui/asset-review";
import { DshAssetReviewer } from "../src/adapter.js";
import type { CommandRunner } from "../src/dsh-process.js";

const verdict = {
  verdict: "pass",
  hardIssues: [],
  scores: { brandFit: 5, semantics: 5, consistency: 4, editability: 4, composition: 5 },
  suggestedChanges: [],
  reason: "ok",
};

const input: AssetReviewerInput = {
  brief: {
    id: "icon-home",
    kind: "icon",
    scene: "home",
    styleRef: "b-mobile",
    size: { width: 24, height: 24 },
    format: "svg",
    constraints: { grid: 24, strokeWidth: 1.5 },
    sourceChain: ["library"],
  },
  style: { id: "b-mobile" },
  candidate: {
    assetId: "icon-home",
    source: "library",
    sourceTier: "A",
    attempt: 1,
    file: { path: "a.svg", format: "svg", hash: "sha256:x" },
    producer: { tool: "test" },
    license: "ISC",
    producedAt: "2026-10-20T00:00:00.000Z",
  },
  hardGate: { passed: true, issues: [] },
  assetText: "<svg/>",
  runDir: "",
};

const temporaryDirs: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("DshAssetReviewer", () => {
  it("runs a headless review and writes evidence", async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-dsh-"));
    temporaryDirs.push(runDir);
    const runner: CommandRunner = async () => ({
      stdout: JSON.stringify(verdict),
      stderr: "",
    });
    const reviewer = new DshAssetReviewer({
      dshHome: "/tmp/dsh-home",
      profile: "prd-ui-assets",
      dshBin: "/tmp/dsh",
      cwd: "/tmp",
      runner,
    });
    const result = await reviewer.review({ ...input, runDir });
    expect(result.verdict).toBe("pass");
    const evidence = path.join(runDir, "dsh", "icon-home-library-1");
    expect((await stat(path.join(evidence, "prompt.md"))).isFile()).toBe(true);
    expect(await readFile(path.join(evidence, "stdout.txt"), "utf8")).toContain('"verdict"');
    expect(await readFile(path.join(evidence, "session.json"), "utf8")).toContain("prd-ui-assets");
  });
});
