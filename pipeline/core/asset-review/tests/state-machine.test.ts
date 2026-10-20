import { describe, expect, it } from "vitest";
import {
  DEFAULT_SOURCE_POLICY,
  type AssetBrief,
  type AssetCandidate,
  type AssetReviewVerdict,
  type SourceId,
  type SourceTier,
} from "../src/contracts.js";
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
  verdicts: Record<string, AssetReviewVerdict | Error> = {}
): AssetReviewerPort {
  return {
    async review({ brief, candidate }) {
      const key = `${brief.id}/${candidate.source}/${candidate.attempt}`;
      const value = verdicts[key] ?? passVerdict;
      if (value instanceof Error) throw value;
      return value;
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

  it("aborts on reviewer error without falling back", async () => {
    const store = new MemoryStore();
    const brief = { ...iconBrief, sourceChain: ["library", "ai-vector"] as SourceId[] };
    const result = await run(store, reviewerWith({ "icon-home/library/1": new Error("model down") }), {
      briefs: [brief],
    });
    expect(result.passed).toBe(false);
    expect(result.error).toContain("REVIEWER_ERROR");
    expect(result.assets[0]!.attempts.some((attempt) => attempt.status === "reviewer_error")).toBe(true);
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
