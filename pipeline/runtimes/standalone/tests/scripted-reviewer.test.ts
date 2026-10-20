import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AssetReviewVerdict, AssetReviewerInput } from "@prd-ui/asset-review";
import { ScriptedReviewer, loadScriptedReviews, parseScriptedReviews } from "../src/asset/scripted-reviewer.js";

const verdict: AssetReviewVerdict = {
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
    constraints: {},
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
  runDir: "/tmp/run",
};

const temporaryDirs: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ScriptedReviewer", () => {
  it("parses a keyed review map", () => {
    const reviews = parseScriptedReviews({ "icon-home/library/1": verdict });
    expect(reviews.get("icon-home/library/1")?.verdict).toBe("pass");
  });

  it("returns the configured verdict and fails on a missing key", async () => {
    const reviewer = new ScriptedReviewer(parseScriptedReviews({ "icon-home/library/1": verdict }));
    expect((await reviewer.review(input)).verdict.verdict).toBe("pass");
    await expect(
      reviewer.review({ ...input, candidate: { ...input.candidate, attempt: 2 } })
    ).rejects.toThrow(/SCRIPTED_REVIEW_MISSING/);
  });

  it("loads reviews from a JSON file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-scripted-"));
    temporaryDirs.push(dir);
    const file = path.join(dir, "reviews.json");
    await writeFile(file, JSON.stringify({ "icon-home/library/1": verdict }));
    const reviews = await loadScriptedReviews(file);
    expect(reviews.get("icon-home/library/1")?.verdict).toBe("pass");
  });
});
