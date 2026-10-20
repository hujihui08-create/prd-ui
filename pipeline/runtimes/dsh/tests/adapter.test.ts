import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AssetReviewerInput } from "@prd-ui/asset-review";
import { DshAssetReviewer, validateDshProviderEnv } from "../src/adapter.js";
import type { CommandRunner } from "../src/dsh-process.js";

const providerEnv: NodeJS.ProcessEnv = {
  PRD_UI_VISION_BASE_URL: "https://example.test/v1",
  PRD_UI_VISION_MODEL: "vision",
};

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

function ndjson(...events: unknown[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

function stepEnd(usage: unknown) {
  return { type: "status", phase: "step_end", turn: 1, step: 1, usage };
}

function final(text: string) {
  return { type: "final", text };
}

const temporaryDirs: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function reviewerWith(runner: CommandRunner): DshAssetReviewer {
  return new DshAssetReviewer({
    dshHome: "/tmp/dsh-home",
    profile: "prd-ui-assets",
    dshBin: "/tmp/dsh",
    cwd: "/tmp",
    runner,
    env: providerEnv,
  });
}

describe("DshAssetReviewer", () => {
  it("runs a headless review, returns usage and writes raw evidence", async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-dsh-"));
    temporaryDirs.push(runDir);
    const reviewer = reviewerWith(async () => ({
      stdout: ndjson(
        stepEnd({ inputTokens: 100, outputTokens: 20, totalTokens: 120, cacheReadTokens: 5 }),
        final(JSON.stringify({ ...verdict, reason_note: "extra" }))
      ),
      stderr: "",
    }));

    const result = await reviewer.review({ ...input, runDir });

    expect(result.verdict.verdict).toBe("pass");
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 5,
      totalTokens: 125,
    });
    expect(result.usageComplete).toBe(true);
    expect(result.repairAttempted).toBe(false);
    expect(result.ignoredKeys).toEqual(["reason_note"]);
    expect(result.raw).toContain("reason_note");

    const evidence = path.join(runDir, "dsh", "icon-home-library-1");
    expect((await stat(path.join(evidence, "prompt.md"))).isFile()).toBe(true);
    expect(await readFile(path.join(evidence, "stdout.txt"), "utf8")).toContain(
      '"type":"final"'
    );
    expect(await readFile(path.join(evidence, "session.json"), "utf8")).toContain("prd-ui-assets");
    const raw = JSON.parse(await readFile(path.join(evidence, "review.raw.json"), "utf8")) as {
      raw: string;
      ignoredKeys: string[];
      usageComplete: boolean;
      repairAttempted: boolean;
    };
    expect(raw.raw).toContain("reason_note");
    expect(raw.ignoredKeys).toEqual(["reason_note"]);
    expect(raw.usageComplete).toBe(true);
    expect(raw.repairAttempted).toBe(false);
  });

  it("repairs one invalid verdict and merges both attempts' usage", async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-dsh-"));
    temporaryDirs.push(runDir);
    let calls = 0;
    const captured: string[] = [];
    const reviewer = reviewerWith(async (_command, _args, options) => {
      calls += 1;
      captured.push(options.stdin ?? "");
      if (calls === 1) {
        return {
          stdout: ndjson(
            stepEnd({ inputTokens: 100, outputTokens: 20, totalTokens: 120, cacheReadTokens: 0 }),
            final('{"verdict":"pass"}')
          ),
          stderr: "",
        };
      }
      return {
        stdout: ndjson(
          stepEnd({ inputTokens: 200, outputTokens: 40, totalTokens: 250, cacheReadTokens: 10 }),
          final(JSON.stringify(verdict))
        ),
        stderr: "",
      };
    });

    const result = await reviewer.review({ ...input, runDir });

    expect(calls).toBe(2);
    expect(captured[1]).toContain("previous response");
    expect(result.verdict.verdict).toBe("pass");
    expect(result.repairAttempted).toBe(true);
    expect(result.usage).toEqual({
      inputTokens: 300,
      outputTokens: 60,
      cacheReadTokens: 10,
      totalTokens: 370,
    });
    expect(result.usageComplete).toBe(true);

    const evidence = path.join(runDir, "dsh", "icon-home-library-1");
    expect((await stat(path.join(evidence, "repair-prompt.md"))).isFile()).toBe(true);
    expect((await stat(path.join(evidence, "first-stdout.txt"))).isFile()).toBe(true);
  });

  it("throws with merged usage when the repair is also invalid", async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-dsh-"));
    temporaryDirs.push(runDir);
    let calls = 0;
    const reviewer = reviewerWith(async () => {
      calls += 1;
      return {
        stdout: ndjson(
          stepEnd({ inputTokens: 100, outputTokens: 20, totalTokens: 120, cacheReadTokens: 0 }),
          final('{"verdict":"pass"}')
        ),
        stderr: "",
      };
    });

    await expect(reviewer.review({ ...input, runDir })).rejects.toMatchObject({
      code: "DSH_INVALID_VERDICT",
      usage: {
        inputTokens: 200,
        outputTokens: 40,
        cacheReadTokens: 0,
        totalTokens: 240,
      },
      usageComplete: true,
    });
    expect(calls).toBe(2);
  });

  it("rejects missing provider env when constructed", () => {
    expect(
      () =>
        new DshAssetReviewer({
          dshHome: "/tmp/dsh-home",
          profile: "prd-ui-assets",
          dshBin: "/tmp/dsh",
          cwd: "/tmp",
          env: {},
        })
    ).toThrow(
      /CONFIGURATION_ERROR: missing PRD_UI_VISION_BASE_URL, PRD_UI_VISION_MODEL/
    );
  });

  it("lists only the missing provider variable", () => {
    expect(() =>
      validateDshProviderEnv({ PRD_UI_VISION_BASE_URL: "https://example.test/v1" })
    ).toThrow(/CONFIGURATION_ERROR: missing PRD_UI_VISION_MODEL$/);
    expect(() => validateDshProviderEnv(providerEnv)).not.toThrow();
  });
});
