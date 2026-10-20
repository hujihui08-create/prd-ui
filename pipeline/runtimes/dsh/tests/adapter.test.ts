import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetReviewerInput } from "@prd-ui/asset-review";
import {
  DshAssetReviewer,
  validateDshProviderEnv,
  type DshAssetReviewerOptions,
} from "../src/adapter.js";
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

function reviewerWith(
  runner: CommandRunner,
  overrides: Partial<DshAssetReviewerOptions> = {}
): DshAssetReviewer {
  return new DshAssetReviewer({
    dshHome: "/tmp/dsh-home",
    profile: "prd-ui-assets",
    dshBin: "/tmp/dsh",
    cwd: "/tmp",
    runner,
    warn: () => {},
    env: providerEnv,
    ...overrides,
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
      parsed: Record<string, unknown>;
      usageComplete: boolean;
      repairAttempted: boolean;
    };
    expect(raw.raw).toContain("reason_note");
    expect(raw.ignoredKeys).toEqual(["reason_note"]);
    expect(raw.parsed).toEqual(verdict);
    expect(JSON.stringify(raw.parsed)).not.toContain("reason_note");
    expect(raw.usageComplete).toBe(true);
    expect(raw.repairAttempted).toBe(false);
  });

  it("repairs one invalid verdict and merges both attempts' usage", async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-dsh-"));
    temporaryDirs.push(runDir);
    let calls = 0;
    const captured: string[] = [];
    const canRepair = vi.fn(() => true);
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

    const result = await reviewer.review({ ...input, runDir, canRepair });

    expect(calls).toBe(2);
    expect(canRepair).toHaveBeenCalledTimes(1);
    expect(canRepair).toHaveBeenCalledWith({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      totalTokens: 120,
    });
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

  it("does not repair when the budget callback denies it", async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-dsh-"));
    temporaryDirs.push(runDir);
    let calls = 0;
    const canRepair = vi.fn(() => false);
    const reviewer = reviewerWith(async () => {
      calls += 1;
      return {
        stdout: ndjson(
          stepEnd({ inputTokens: 100, outputTokens: 20, totalTokens: 120, cacheReadTokens: 0 }),
          final('{"verdict":"pass","reason":"Token: expired"}')
        ),
        stderr: "",
      };
    });

    await expect(
      reviewer.review({ ...input, runDir, canRepair })
    ).rejects.toMatchObject({
      code: "DSH_INVALID_VERDICT",
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 0,
        totalTokens: 120,
      },
    });
    expect(calls).toBe(1);
    expect(canRepair).toHaveBeenCalledTimes(1);
    expect(canRepair).toHaveBeenCalledWith({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      totalTokens: 120,
    });

    const evidence = path.join(runDir, "dsh", "icon-home-library-1");
    const raw = JSON.parse(await readFile(path.join(evidence, "review.raw.json"), "utf8")) as {
      repairAttempted: boolean;
    };
    expect(raw.repairAttempted).toBe(false);
    await expect(stat(path.join(evidence, "repair-prompt.md"))).rejects.toThrow();

    const errorJson = JSON.parse(
      await readFile(path.join(evidence, "error.json"), "utf8")
    ) as { message: string };
    expect(errorJson.message).toContain("Token: ***");
    expect(errorJson.message).not.toContain("expired");
  });

  it("redacts secrets from prompt, stdout, stderr and raw evidence", async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-dsh-"));
    temporaryDirs.push(runDir);
    const secrets = [
      "api-key-value",
      "tok_live_123456",
      "s3cr3t-value",
      "auth-token-value",
      "sk-abcdefgh12345678",
    ];
    const reviewer = reviewerWith(async () => ({
      stdout: ndjson(
        stepEnd({ inputTokens: 10, outputTokens: 5, totalTokens: 15, cacheReadTokens: 0 }),
        final(
          JSON.stringify({
            ...verdict,
            reason_note: "sk-abcdefgh12345678",
            token: "tok_live_123456",
            secret: "s3cr3t-value",
          })
        )
      ),
      stderr: "authorization: Bearer auth-token-value",
    }));

    const result = await reviewer.review({
      ...input,
      runDir,
      assetText: '<svg data-api-key="api-key-value"/>',
    });
    expect(result.verdict.verdict).toBe("pass");

    const evidence = path.join(runDir, "dsh", "icon-home-library-1");
    for (const file of ["prompt.md", "stdout.txt", "stderr.txt", "review.raw.json"]) {
      const content = await readFile(path.join(evidence, file), "utf8");
      for (const secret of secrets) {
        expect(content, `${file} leaks ${secret}`).not.toContain(secret);
      }
    }
    const raw = JSON.parse(await readFile(path.join(evidence, "review.raw.json"), "utf8")) as {
      raw: string;
    };
    expect(raw.raw).toContain("sk-***");
  });

  it("keeps raw evidence and stdout JSON parseable when the reason looks like a secret", async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-dsh-"));
    temporaryDirs.push(runDir);
    let calls = 0;
    const reviewer = reviewerWith(async () => {
      calls += 1;
      return {
        stdout: ndjson(
          stepEnd({ inputTokens: 100, outputTokens: 20, totalTokens: 120, cacheReadTokens: 0 }),
          final(
            calls === 1
              ? '{"verdict":"pass","reason":"Token: expired"}'
              : JSON.stringify({ ...verdict, reason: "Token: expired" })
          )
        ),
        stderr: "",
      };
    });

    const result = await reviewer.review({ ...input, runDir });

    expect(result.verdict.reason).toBe("Token: expired");

    const evidence = path.join(runDir, "dsh", "icon-home-library-1");
    const raw = JSON.parse(await readFile(path.join(evidence, "review.raw.json"), "utf8")) as {
      parsed: { reason: string };
    };
    expect(raw.parsed.reason).toBe("Token: ***");

    for (const file of ["stdout.txt", "first-stdout.txt", "repair-stdout.txt"]) {
      const lines = (await readFile(path.join(evidence, file), "utf8")).trimEnd().split("\n");
      const events = lines.map(
        (line) => JSON.parse(line) as { type: string; text?: string }
      );
      const finalEvent = events.find((event) => event.type === "final");
      expect(finalEvent?.text, `${file} missing final event`).toBeDefined();
      const verdictJson = JSON.parse(finalEvent!.text!) as { reason: string };
      expect(verdictJson.reason).toBe("Token: ***");
      expect(lines.join("\n")).not.toContain("expired");
    }
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
          final(`{"verdict":"pass","attempt":${calls}}`)
        ),
        stderr: `attempt ${calls}`,
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

    const evidence = path.join(runDir, "dsh", "icon-home-library-1");
    const raw = JSON.parse(await readFile(path.join(evidence, "review.raw.json"), "utf8")) as {
      usage: unknown;
      usageComplete: boolean;
      repairAttempted: boolean;
    };
    expect(raw.usage).toEqual({
      inputTokens: 200,
      outputTokens: 40,
      cacheReadTokens: 0,
      totalTokens: 240,
    });
    expect(raw.usageComplete).toBe(true);
    expect(raw.repairAttempted).toBe(true);
    const finalText = (stdout: string): string => {
      const line = stdout.trim().split("\n").at(-1)!;
      return (JSON.parse(line) as { text: string }).text;
    };
    expect(
      finalText(await readFile(path.join(evidence, "first-stdout.txt"), "utf8"))
    ).toContain('"attempt":1');
    expect(
      finalText(await readFile(path.join(evidence, "repair-stdout.txt"), "utf8"))
    ).toContain('"attempt":2');
    expect(await readFile(path.join(evidence, "repair-stderr.txt"), "utf8")).toBe("attempt 2");
  });

  it("points the task at the rendered PNG without importing a renderer", async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-dsh-"));
    temporaryDirs.push(runDir);
    const pngPath = path.join(
      runDir,
      "assets",
      "attempts",
      "icon-home",
      "library-1",
      "candidate.png"
    );
    const captured: string[] = [];
    const reviewer = reviewerWith(async (_command, _args, options) => {
      captured.push(options.stdin ?? "");
      return {
        stdout: ndjson(
          stepEnd({ inputTokens: 10, outputTokens: 5, totalTokens: 15, cacheReadTokens: 0 }),
          final(JSON.stringify(verdict))
        ),
        stderr: "",
      };
    });

    await reviewer.review({ ...input, runDir, candidateImagePath: pngPath });

    expect(captured[0]).toContain(
      `A rendered PNG is at ${pngPath}. Use read_image before scoring.`
    );
    expect(captured[0]).toContain("## Asset source");
  });

  it("warns and continues with SVG text when no rendered PNG is available", async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-dsh-"));
    temporaryDirs.push(runDir);
    const warnings: string[] = [];
    const captured: string[] = [];
    const reviewer = reviewerWith(
      async (_command, _args, options) => {
        captured.push(options.stdin ?? "");
        return {
          stdout: ndjson(
            stepEnd({ inputTokens: 10, outputTokens: 5, totalTokens: 15, cacheReadTokens: 0 }),
            final(JSON.stringify(verdict))
          ),
          stderr: "",
        };
      },
      { warn: (message) => warnings.push(message) }
    );

    const result = await reviewer.review({ ...input, runDir });

    expect(result.verdict.verdict).toBe("pass");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("RENDER_WARNING");
    expect(captured[0]).not.toContain("Use read_image before scoring.");
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
