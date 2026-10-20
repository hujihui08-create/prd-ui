import { describe, expect, it } from "vitest";
import {
  AssetReviewRunSchema,
  DEFAULT_SOURCE_POLICY,
  type AssetBrief,
  type AssetCandidate,
  type AssetReviewVerdict,
  type ReviewResult,
  type ReviewUsage,
  type SourceId,
  type SourceTier,
} from "../src/contracts.js";
import type { ReviewPricing } from "../src/pricing.js";
import type {
  ArtifactStorePort,
  AssetProducerPort,
  AssetReviewerPort,
  AssetReviewPorts,
} from "../src/ports.js";
import { buildReviewPrompt } from "../src/prompt.js";
import { runAssetReview } from "../src/state-machine.js";

const validIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5V21H3z"/></svg>`;

const iconBrief: AssetBrief = {
  id: "icon-home",
  kind: "icon",
  scene: "home",
  styleRef: "b-mobile",
  size: { width: 24, height: 24 },
  format: "svg",
  constraints: { grid: 24, strokeWidth: 1.5, currentColor: true, noText: true },
  sourceChain: ["library"],
};

const style = { id: "b-mobile", palette: ["#2563EB"] };

const passVerdict: AssetReviewVerdict = {
  verdict: "pass",
  hardIssues: [],
  scores: { brandFit: 5, semantics: 5, consistency: 4, editability: 4, composition: 5 },
  suggestedChanges: [],
  reason: "ok",
};

const retryVerdict: AssetReviewVerdict = { ...passVerdict, verdict: "retry", reason: "try again" };
const fallbackVerdict: AssetReviewVerdict = { ...passVerdict, verdict: "fallback", reason: "wrong source" };

const pricing: ReviewPricing = {
  inputMissUsdPerMillion: 0.3,
  inputCacheUsdPerMillion: 0.006,
  outputUsdPerMillion: 1.2,
  usdToCny: 7.2,
};

const oneMillionInput: ReviewUsage = {
  inputTokens: 1_000_000,
  outputTokens: 0,
  cacheReadTokens: 0,
};

class MemoryStore implements ArtifactStorePort {
  readonly files = new Map<string, string>();

  async writeJson(path: string, value: unknown): Promise<void> {
    this.files.set(path, JSON.stringify(value));
  }

  async writeText(path: string, value: string): Promise<void> {
    this.files.set(path, value);
  }

  async readText(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`missing ${path}`);
    return value;
  }

  async hash(path: string): Promise<string> {
    return `sha256:${Buffer.from(this.files.get(path) ?? "").toString("hex").slice(0, 12)}`;
  }
}

function tierOf(source: SourceId): SourceTier {
  if (source === "library") return "A";
  if (source === "ai-vector" || source === "ai-raster") return "B";
  return "C";
}

function producerWith(
  store: MemoryStore,
  svgFor: (id: string) => string = () => validIcon
): AssetProducerPort {
  return {
    async produce({ brief, source, attempt }): Promise<AssetCandidate> {
      const path = `assets/attempts/${brief.id}/${source}-${attempt}/candidate.svg`;
      await store.writeText(path, svgFor(brief.id));
      return {
        assetId: brief.id,
        source,
        sourceTier: tierOf(source),
        attempt,
        file: { path, format: "svg", hash: "sha256:test" },
        producer: { tool: "test-library" },
        license: "test-fixture",
        costUsd: 0,
        producedAt: "2026-10-20T00:00:00.000Z",
      };
    },
  };
}

function reviewerWith(
  results: Record<string, AssetReviewVerdict | ReviewResult | Error> = {},
  fallback: AssetReviewVerdict | ReviewResult = { verdict: passVerdict }
): AssetReviewerPort {
  return {
    async review({ brief, candidate }): Promise<ReviewResult> {
      const key = `${brief.id}/${candidate.source}/${candidate.attempt}`;
      const value = results[key] ?? fallback;
      if (value instanceof Error) throw value;
      return typeof value.verdict === "string" ? { verdict: value } : value;
    },
  };
}

function ports(store: MemoryStore, reviewer: AssetReviewerPort): AssetReviewPorts {
  const now = new Date("2026-10-20T00:00:00.000Z");
  return {
    producer: producerWith(store),
    reviewer,
    store,
    clock: { now: () => new Date(now) },
    log: { async log() {} },
  };
}

async function run(
  store: MemoryStore,
  reviewer: AssetReviewerPort,
  overrides: Partial<Parameters<typeof runAssetReview>[0]> = {}
) {
  return runAssetReview({
    runId: "run-test",
    project: "employee-app",
    profile: "b-mobile",
    runDir: "/tmp/run-test",
    briefs: [iconBrief],
    style,
    policy: DEFAULT_SOURCE_POLICY,
    ports: ports(store, reviewer),
    ...overrides,
  });
}

describe("runAssetReview", () => {
  it("freezes an asset on the first pass", async () => {
    const store = new MemoryStore();
    const result = await run(store, reviewerWith());
    expect(result.passed).toBe(true);
    expect(result.assets[0]!.status).toBe("passed");
    expect(result.assets[0]!.attempts).toHaveLength(1);
    expect(result.assets[0]!.frozen?.path).toBe("assets/frozen/icon-home/asset.svg");
    expect(store.files.has("assets/frozen/icon-home/asset.svg")).toBe(true);
    expect(store.files.has("asset-review.json")).toBe(true);
  });

  it("retries within a source and freezes on the third attempt", async () => {
    const store = new MemoryStore();
    const result = await run(
      store,
      reviewerWith({
        "icon-home/library/1": retryVerdict,
        "icon-home/library/2": retryVerdict,
        "icon-home/library/3": passVerdict,
      })
    );
    expect(result.passed).toBe(true);
    expect(result.assets[0]!.attempts).toHaveLength(3);
    expect(result.summary.retried).toBe(1);
  });

  it("falls back to the next source and marks degraded", async () => {
    const store = new MemoryStore();
    const brief = { ...iconBrief, sourceChain: ["library", "ai-vector"] as SourceId[] };
    const result = await run(store, reviewerWith({ "icon-home/library/1": fallbackVerdict }), {
      briefs: [brief],
    });
    expect(result.passed).toBe(true);
    expect(result.assets[0]!.status).toBe("passed");
    expect(result.assets[0]!.source).toBe("ai-vector");
    expect(result.assets[0]!.sourceTier).toBe("B");
    expect(result.assets[0]!.degraded).toBe(true);
    expect(result.assets[0]!.fallbackFrom).toBe("A");
  });

  it("marks the asset unresolved after three retries", async () => {
    const store = new MemoryStore();
    const result = await run(store, reviewerWith({
      "icon-home/library/1": retryVerdict,
      "icon-home/library/2": retryVerdict,
      "icon-home/library/3": retryVerdict,
    }));
    expect(result.passed).toBe(false);
    expect(result.assets[0]!.status).toBe("unresolved");
    expect(result.summary.unresolved).toBe(1);
  });

  it("stops at the budget and records budget_exceeded", async () => {
    const store = new MemoryStore();
    const result = await run(store, reviewerWith({ "icon-home/library/1": retryVerdict }), {
      policy: { ...DEFAULT_SOURCE_POLICY, maxAttemptsPerAsset: 1 },
    });
    expect(result.passed).toBe(false);
    expect(result.assets[0]!.attempts.some((attempt) => attempt.status === "budget_exceeded")).toBe(true);
  });

  it("does not fall back to the next source on reviewer error", async () => {
    const store = new MemoryStore();
    const brief = { ...iconBrief, sourceChain: ["library", "ai-vector"] as SourceId[] };
    const result = await run(store, reviewerWith({ "icon-home/library/1": new Error("model down") }), {
      briefs: [brief],
    });
    expect(result.passed).toBe(false);
    expect(result.error).toContain("REVIEWER_ERROR");
    expect(result.assets[0]!.attempts.some((attempt) => attempt.status === "reviewer_error")).toBe(true);
  });

  it("continues to the next asset after a reviewer error", async () => {
    const store = new MemoryStore();
    const reviewer: AssetReviewerPort = {
      async review({ brief }) {
        if (brief.id === "icon-home") throw new Error("model down");
        return { verdict: passVerdict };
      },
    };
    const result = await run(store, reviewer, {
      briefs: [iconBrief, { ...iconBrief, id: "icon-search" }],
    });
    expect(result.assets[0]!.status).toBe("unresolved");
    expect(result.assets[1]!.status).toBe("passed");
    expect(result.summary.reviewerErrors).toBe(1);
    expect(result.error).toBe("REVIEWER_ERROR: 1 asset(s)");
    expect(result.passed).toBe(false);
  });

  it("does not switch source when the reviewer errors", async () => {
    const store = new MemoryStore();
    const brief = { ...iconBrief, sourceChain: ["library", "ai-vector"] as SourceId[] };
    const produced: SourceId[] = [];
    const reviewed: SourceId[] = [];
    const reviewer: AssetReviewerPort = {
      async review({ candidate }) {
        reviewed.push(candidate.source);
        throw new Error("model down");
      },
    };
    const basePorts = ports(store, reviewer);
    const customPorts: AssetReviewPorts = {
      ...basePorts,
      producer: {
        async produce(input) {
          produced.push(input.source);
          return basePorts.producer.produce(input);
        },
      },
    };

    const result = await run(store, reviewer, { briefs: [brief], ports: customPorts });

    expect(produced).toEqual(["library"]);
    expect(reviewed).toEqual(["library"]);
    expect(result.assets[0]!.status).toBe("unresolved");
    expect(result.assets[0]!.attempts).toHaveLength(1);
    expect(result.assets[0]!.attempts[0]!.status).toBe("reviewer_error");
  });

  it("stops the batch on the first reviewer error when fail-fast is set", async () => {
    const store = new MemoryStore();
    let calls = 0;
    const reviewer: AssetReviewerPort = {
      async review() {
        calls += 1;
        throw new Error("down");
      },
    };
    const result = await run(store, reviewer, {
      briefs: [iconBrief, { ...iconBrief, id: "icon-search" }],
      continueOnReviewerError: false,
    });
    expect(calls).toBe(1);
    expect(result.assets[0]!.status).toBe("unresolved");
    expect(result.assets[1]!.status).toBe("unresolved");
    expect(result.assets[1]!.attempts[0]!.status).toBe("reviewer_error");
    expect(result.summary.reviewerErrors).toBe(1);
    expect(result.error).toBe("REVIEWER_ERROR: down");
    expect(result.passed).toBe(false);
  });

  it("filters with --only", async () => {
    const store = new MemoryStore();
    const result = await run(store, reviewerWith(), {
      briefs: [iconBrief, { ...iconBrief, id: "icon-search" }],
      only: ["icon-home"],
    });
    expect(result.summary.total).toBe(1);
    expect(result.assets[0]!.assetId).toBe("icon-home");
  });

  it("fails the run when the icon set is inconsistent", async () => {
    const store = new MemoryStore();
    const secondBrief: AssetBrief = {
      ...iconBrief,
      id: "icon-search",
      constraints: { ...iconBrief.constraints, strokeWidth: 2 },
    };
    const reviewer = reviewerWith();
    const customPorts: AssetReviewPorts = {
      ...ports(store, reviewer),
      producer: producerWith(store, (id) =>
        id === "icon-search" ? validIcon.replace('stroke-width="1.5"', 'stroke-width="2"') : validIcon
      ),
    };

    const result = await run(store, reviewer, { briefs: [iconBrief, secondBrief], ports: customPorts });

    expect(result.batchGates?.iconSet?.passed).toBe(false);
    expect(result.error).toBe("ICON_SET_INCONSISTENT");
    expect(result.passed).toBe(false);
  });

  it("preserves reviewer errors when set gates also fail", async () => {
    const store = new MemoryStore();
    const secondBrief: AssetBrief = {
      ...iconBrief,
      id: "icon-search",
      constraints: { ...iconBrief.constraints, strokeWidth: 2 },
    };
    const failingBrief: AssetBrief = { ...iconBrief, id: "icon-alert" };
    const reviewer = reviewerWith({ "icon-alert/library/1": new Error("model down") });
    const customPorts: AssetReviewPorts = {
      ...ports(store, reviewer),
      producer: producerWith(store, (id) =>
        id === "icon-search" ? validIcon.replace('stroke-width="1.5"', 'stroke-width="2"') : validIcon
      ),
    };

    const result = await run(store, reviewer, {
      briefs: [iconBrief, secondBrief, failingBrief],
      ports: customPorts,
    });

    expect(result.batchGates?.iconSet?.passed).toBe(false);
    expect(result.error).toContain("REVIEWER_ERROR");
    expect(result.passed).toBe(false);
  });

  it("records review usage and cost on the attempt and summary", async () => {
    const store = new MemoryStore();
    const result = await run(
      store,
      reviewerWith(
        {},
        { verdict: passVerdict, usage: oneMillionInput, usageComplete: true }
      ),
      { pricing }
    );

    const attempt = result.assets[0]!.attempts[0]!;
    expect(attempt.reviewUsage).toEqual(oneMillionInput);
    expect(attempt.reviewCostUsd).toBeCloseTo(0.3);
    expect(attempt.reviewCostCny).toBeCloseTo(2.16);
    expect(result.summary.reviewInputTokens).toBe(1_000_000);
    expect(result.summary.reviewOutputTokens).toBe(0);
    expect(result.summary.reviewCacheTokens).toBe(0);
    expect(result.summary.reviewCostUsd).toBeCloseTo(0.3);
    expect(result.summary.reviewCostCny).toBeCloseTo(2.16);
    expect(result.usageSource).toBe("json-events");
    expect(result.usageComplete).toBe(true);
    expect(() => AssetReviewRunSchema.parse(result)).not.toThrow();
  });

  it("stops the batch when the review cost exceeds the CNY budget", async () => {
    const store = new MemoryStore();
    const result = await run(
      store,
      reviewerWith(
        {},
        { verdict: passVerdict, usage: oneMillionInput, usageComplete: true }
      ),
      {
        briefs: [iconBrief, { ...iconBrief, id: "icon-search" }],
        pricing,
        maxReviewCostCny: 0.5,
      }
    );

    expect(result.assets[0]!.status).toBe("passed");
    expect(result.assets[1]!.status).toBe("unresolved");
    expect(result.assets[1]!.attempts[0]!.status).toBe("budget_exceeded");
    expect(result.assets[1]!.attempts[0]!.issues).toContain(
      "REVIEW_COST_BUDGET_EXCEEDED"
    );
    expect(result.error).toBe("REVIEW_COST_BUDGET_EXCEEDED");
    expect(result.passed).toBe(false);
    expect(() => AssetReviewRunSchema.parse(result)).not.toThrow();
  });

  it("fails closed when usage is incomplete and a review budget is set", async () => {
    const store = new MemoryStore();
    const result = await run(
      store,
      reviewerWith(
        {},
        {
          verdict: passVerdict,
          usage: { inputTokens: 10, outputTokens: 0, cacheReadTokens: 0 },
          usageComplete: false,
        }
      ),
      {
        briefs: [iconBrief, { ...iconBrief, id: "icon-search" }],
        pricing,
        maxReviewCostCny: 10,
      }
    );

    expect(result.assets[0]!.status).toBe("passed");
    expect(result.assets[1]!.status).toBe("unresolved");
    expect(result.assets[1]!.attempts[0]!.status).toBe("usage_incomplete");
    expect(result.assets[1]!.attempts[0]!.issues).toContain("REVIEW_USAGE_INCOMPLETE");
    expect(result.error).toBe("REVIEW_USAGE_INCOMPLETE");
    expect(result.usageComplete).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("continues past incomplete usage with allowUnknownCost", async () => {
    const store = new MemoryStore();
    const result = await run(
      store,
      reviewerWith(
        {},
        { verdict: passVerdict, usageComplete: false }
      ),
      {
        briefs: [iconBrief, { ...iconBrief, id: "icon-search" }],
        pricing,
        maxReviewCostCny: 10,
        allowUnknownCost: true,
      }
    );

    expect(result.assets[0]!.status).toBe("passed");
    expect(result.assets[1]!.status).toBe("passed");
    expect(result.error).toBeUndefined();
    expect(result.usageComplete).toBe(false);
    expect(result.summary.reviewCostCny).toBeUndefined();
    expect(result.passed).toBe(true);
  });

  it("records usage carried by a reviewer error", async () => {
    const store = new MemoryStore();
    const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0 };
    const error = Object.assign(new Error("invalid verdict"), {
      code: "DSH_INVALID_VERDICT",
      usage,
      usageComplete: true,
    });
    const result = await run(
      store,
      reviewerWith({ "icon-home/library/1": error }),
      { pricing }
    );

    const attempt = result.assets[0]!.attempts[0]!;
    expect(attempt.status).toBe("reviewer_error");
    expect(attempt.reviewUsage).toEqual(usage);
    expect(attempt.reviewCostUsd).toBeCloseTo((100 / 1e6) * 0.3 + (20 / 1e6) * 1.2);
    expect(attempt.reviewCostCny).toBeCloseTo(
      ((100 / 1e6) * 0.3 + (20 / 1e6) * 1.2) * 7.2
    );
    expect(result.summary.reviewInputTokens).toBe(100);
    expect(result.summary.reviewOutputTokens).toBe(20);
    expect(result.usageComplete).toBe(true);
  });

  it("does not invent zero cost when usage is unavailable", async () => {
    const store = new MemoryStore();
    const result = await run(store, reviewerWith(), { pricing });

    expect(result.assets[0]!.attempts[0]!.reviewUsage).toBeUndefined();
    expect(result.assets[0]!.attempts[0]!.reviewCostCny).toBeUndefined();
    expect(result.summary.reviewCostCny).toBeUndefined();
    expect(result.usageSource).toBe("unavailable");
    expect(result.usageComplete).toBe(false);
  });
});

describe("buildReviewPrompt", () => {
  it("includes the brief, schema and no producer cost", () => {
    const prompt = buildReviewPrompt({
      brief: iconBrief,
      style,
      candidate: {
        assetId: "icon-home",
        source: "library",
        sourceTier: "A",
        attempt: 1,
        file: { path: "a.svg", format: "svg", hash: "sha256:x" },
        producer: { tool: "test", prompt: "secret prompt", model: "m" },
        license: "ISC",
        costUsd: 0.42,
        producedAt: "2026-10-20T00:00:00.000Z",
      },
      hardGate: { passed: true, issues: [] },
      assetText: validIcon,
    });
    expect(prompt).toContain("icon-home");
    expect(prompt).toContain('"verdict"');
    expect(prompt).toContain("Return ONLY");
    expect(prompt).not.toContain("secret prompt");
    expect(prompt).not.toContain("0.42");
  });
});
