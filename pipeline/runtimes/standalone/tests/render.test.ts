import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  AssetReviewVerdict,
  AssetReviewerInput,
  AssetReviewerPort,
  ReviewResult,
} from "@prd-ui/asset-review";
import { renderSvgToPng } from "../src/asset/render-svg.js";
import { RenderingReviewer } from "../src/asset/rendering-reviewer.js";

const validIllustration = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect x="0" y="0" width="120" height="80" fill="#E5E7EB"/><rect x="20" y="20" width="80" height="40" fill="#2563EB"/><circle cx="60" cy="40" r="8" fill="#111827"/></svg>`;

const passVerdict: AssetReviewVerdict = {
  verdict: "pass",
  hardIssues: [],
  scores: { brandFit: 5, semantics: 5, consistency: 4, editability: 4, composition: 5 },
  suggestedChanges: [],
  reason: "ok",
};

const input: AssetReviewerInput = {
  brief: {
    id: "illus-empty-inventory",
    kind: "illustration",
    scene: "empty inventory",
    styleRef: "b-mobile",
    size: { width: 120, height: 80 },
    format: "svg",
    constraints: {},
    sourceChain: ["library"],
  },
  style: { id: "b-mobile" },
  candidate: {
    assetId: "illus-empty-inventory",
    source: "library",
    sourceTier: "A",
    attempt: 1,
    file: {
      path: "assets/attempts/illus-empty-inventory/library-1/candidate.svg",
      format: "svg",
      hash: "sha256:x",
    },
    producer: { tool: "library" },
    license: "ISC",
    producedAt: "2026-10-20T00:00:00.000Z",
  },
  hardGate: { passed: true, issues: [] },
  assetText: validIllustration,
  runDir: "/tmp/run-test",
};

const temporaryDirs: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-render-"));
  temporaryDirs.push(dir);
  return dir;
}

function pngSize(png: Buffer): { width: number; height: number } {
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function recordingReviewer(): {
  reviewer: AssetReviewerPort;
  inputs: AssetReviewerInput[];
} {
  const inputs: AssetReviewerInput[] = [];
  return {
    inputs,
    reviewer: {
      async review(reviewInput): Promise<ReviewResult> {
        inputs.push(reviewInput);
        return { verdict: passVerdict };
      },
    },
  };
}

describe("renderSvgToPng", () => {
  it("renders the 120x80 illustration at 2x to a 240x160 PNG", async () => {
    const png = await renderSvgToPng(validIllustration, { scale: 2 });
    expect(pngSize(png)).toEqual({ width: 240, height: 160 });
  });

  it("defaults to 2x scale", async () => {
    const png = await renderSvgToPng(validIllustration);
    expect(pngSize(png)).toEqual({ width: 240, height: 160 });
  });

  it("reports a rendering error for invalid SVG", async () => {
    await expect(renderSvgToPng("<svg><unclosed", { scale: 2 })).rejects.toThrow(
      /RENDER_FAILED/
    );
  });
});

describe("RenderingReviewer", () => {
  it("writes candidate.png and passes its absolute path to the inner reviewer", async () => {
    const runDir = await tempDir();
    const { reviewer, inputs } = recordingReviewer();
    const rendering = new RenderingReviewer(reviewer);

    const result = await rendering.review({ ...input, runDir });

    const pngPath = path.join(
      runDir,
      "assets",
      "attempts",
      "illus-empty-inventory",
      "library-1",
      "candidate.png"
    );
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.candidateImagePath).toBe(pngPath);
    expect(pngSize(await readFile(pngPath))).toEqual({ width: 240, height: 160 });
    expect(result.renderWarning).toBeUndefined();
    expect(result.verdict.verdict).toBe("pass");
  });

  it("continues with SVG text and records RENDER_WARNING when rendering fails", async () => {
    const runDir = await tempDir();
    const { reviewer, inputs } = recordingReviewer();
    const rendering = new RenderingReviewer(reviewer, {
      render: async () => {
        throw new Error("unsupported filter");
      },
    });

    const result = await rendering.review({ ...input, runDir });

    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.candidateImagePath).toBeUndefined();
    expect(result.renderWarning).toContain("RENDER_WARNING");
    expect(result.renderWarning).toContain("unsupported filter");
    expect(result.verdict.verdict).toBe("pass");
  });

  it("passes non-SVG candidates through without rendering", async () => {
    const runDir = await tempDir();
    const { reviewer, inputs } = recordingReviewer();
    let renderCalls = 0;
    const rendering = new RenderingReviewer(reviewer, {
      render: async () => {
        renderCalls += 1;
        return Buffer.from("");
      },
    });

    await rendering.review({
      ...input,
      runDir,
      candidate: { ...input.candidate, file: { ...input.candidate.file, format: "png" } },
    });

    expect(renderCalls).toBe(0);
    expect(inputs[0]!.candidateImagePath).toBeUndefined();
  });
});
