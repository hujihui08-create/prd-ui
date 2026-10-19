import { describe, expect, it } from "vitest";
import type { AssetReviewerInput } from "@prd-ui/asset-review";
import { ModelReviewer, type FetchLike } from "../src/asset/model-reviewer.js";

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
  runDir: "/tmp/run",
};

const verdict = {
  verdict: "pass",
  hardIssues: [],
  scores: { brandFit: 5, semantics: 5, consistency: 4, editability: 4, composition: 5 },
  suggestedChanges: [],
  reason: "ok",
};

function response(content: string, ok = true, status = 200) {
  return {
    ok,
    status,
    async text() {
      return content;
    },
    async json() {
      return { choices: [{ message: { content } }] };
    },
  };
}

describe("ModelReviewer", () => {
  it("parses a fenced JSON verdict", async () => {
    const fetchImpl: FetchLike = async () => response(`\`\`\`json\n${JSON.stringify(verdict)}\n\`\`\``);
    const reviewer = new ModelReviewer({
      apiKey: "key",
      baseUrl: "https://example.test/v1",
      model: "vision",
      fetch: fetchImpl,
    });
    expect((await reviewer.review(input)).verdict).toBe("pass");
  });

  it("fails fast without a key", async () => {
    const reviewer = new ModelReviewer({
      apiKey: "",
      baseUrl: "https://example.test/v1",
      model: "vision",
      fetch: async () => response("{}"),
    });
    await expect(reviewer.review(input)).rejects.toThrow(/CONFIGURATION_ERROR/);
  });

  it("surfaces an HTTP error", async () => {
    const reviewer = new ModelReviewer({
      apiKey: "key",
      baseUrl: "https://example.test/v1",
      model: "vision",
      fetch: async () => response("boom", false, 500),
    });
    await expect(reviewer.review(input)).rejects.toThrow(/MODEL_HTTP_ERROR 500/);
  });

  it("rejects non-JSON content", async () => {
    const reviewer = new ModelReviewer({
      apiKey: "key",
      baseUrl: "https://example.test/v1",
      model: "vision",
      fetch: async () => response("not json"),
    });
    await expect(reviewer.review(input)).rejects.toThrow(/MODEL_INVALID_JSON/);
  });
});
