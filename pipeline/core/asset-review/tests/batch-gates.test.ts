import { describe, expect, it } from "vitest";
import {
  AssetReviewRunSchema,
  DEFAULT_SOURCE_POLICY,
  SourceTierBySource,
  type AssetBrief,
  type AssetCandidate,
  type AssetReviewRecord,
  type AssetReviewVerdict,
} from "../src/contracts.js";
import { runBatchGates } from "../src/batch-gates.js";
import type {
  ArtifactStorePort,
  AssetProducerPort,
  AssetReviewerPort,
  AssetReviewPorts,
} from "../src/ports.js";
import { runAssetReview } from "../src/state-machine.js";

const validIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5V21H3z"/></svg>`;

const rootStrokeIcon = validIcon.replace('stroke-width="1.5"', 'stroke-width="2"');
const childStrokeIcon = validIcon.replace("<path", '<path stroke-width="2"');

const validIllustration = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect x="0" y="0" width="120" height="80" fill="#E5E7EB"/><rect x="20" y="20" width="80" height="40" fill="#2563EB"/><circle cx="60" cy="40" r="8" fill="#111827"/></svg>`;

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

const illustrationBrief: AssetBrief = {
  id: "illus-empty-inventory",
  kind: "illustration",
  scene: "empty inventory",
  styleRef: "b-mobile",
  size: { width: 120, height: 80 },
  format: "svg",
  constraints: {
    noText: true,
    palette: ["#2563EB", "#E5E7EB", "#111827"],
  },
  sourceChain: ["library"],
};

const passVerdict: AssetReviewVerdict = {
  verdict: "pass",
  hardIssues: [],
  scores: { brandFit: 5, semantics: 5, consistency: 4, editability: 4, composition: 5 },
  suggestedChanges: [],
  reason: "ok",
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

function frozenIconRecord(id: string): AssetReviewRecord {
  const frozen = `assets/frozen/${id}/asset.svg`;
  return {
    assetId: id,
    brief: { ...iconBrief, id },
    status: "passed",
    sourceTier: "A",
    source: "library",
    attempts: [],
    degraded: false,
    frozen: { path: frozen, format: "svg", hash: "sha256:test" },
    license: "test-fixture",
    files: [{ path: frozen, format: "svg" }],
    review: { agent: "asset-reviewer", status: "not-required" },
  };
}

function producerWith(store: MemoryStore, svgFor: (id: string) => string): AssetProducerPort {
  return {
    async produce({ brief, source, attempt }): Promise<AssetCandidate> {
      const path = `assets/attempts/${brief.id}/${source}-${attempt}/candidate.svg`;
      const svg = svgFor(brief.id);
      await store.writeText(path, svg);
      return {
        assetId: brief.id,
        source,
        sourceTier: SourceTierBySource[source],
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

function ports(
  store: MemoryStore,
  svgFor: (id: string) => string,
  reviewer: AssetReviewerPort
): AssetReviewPorts {
  const now = new Date("2026-10-20T00:00:00.000Z");
  return {
    producer: producerWith(store, svgFor),
    reviewer,
    store,
    clock: { now: () => new Date(now) },
    log: { async log() {} },
  };
}

describe("runBatchGates", () => {
  it("fails the icon set when passed icons disagree on stroke width", async () => {
    const store = new MemoryStore();
    store.files.set("assets/frozen/icon-home/asset.svg", validIcon);
    store.files.set("assets/frozen/icon-search/asset.svg", rootStrokeIcon);

    const result = await runBatchGates({
      records: [frozenIconRecord("icon-home"), frozenIconRecord("icon-search")],
      store,
    });

    expect(result.iconSet?.passed).toBe(false);
    expect(result.iconSet?.issues.some((entry) => entry.code === "ICON_SET_INCONSISTENT")).toBe(true);
    expect(store.files.has("assets/icon-set.json")).toBe(true);
    expect(JSON.parse(store.files.get("assets/icon-set.json")!) as { passed: boolean }).toMatchObject({
      passed: false,
    });
  });

  it("fails when roots agree but a child element differs", async () => {
    const store = new MemoryStore();
    store.files.set("assets/frozen/icon-home/asset.svg", validIcon);
    store.files.set("assets/frozen/icon-search/asset.svg", childStrokeIcon);

    const result = await runBatchGates({
      records: [frozenIconRecord("icon-home"), frozenIconRecord("icon-search")],
      store,
    });

    expect(result.iconSet?.passed).toBe(false);
    expect(result.iconSet?.issues.some((entry) => entry.code === "ICON_SET_INCONSISTENT")).toBe(true);
  });

  it("skips set gates for a partial review", async () => {
    const store = new MemoryStore();
    store.files.set("assets/frozen/icon-home/asset.svg", validIcon);

    const result = await runBatchGates({
      records: [frozenIconRecord("icon-home")],
      store,
      only: ["icon-home"],
    });

    expect(result).toEqual({ skipped: true, reason: "PARTIAL_REVIEW", scope: ["icon-home"] });
    expect(JSON.parse(store.files.get("assets/batch-gates.json")!)).toEqual({
      skipped: true,
      reason: "PARTIAL_REVIEW",
      scope: ["icon-home"],
    });
    expect(store.files.has("assets/icon-set.json")).toBe(false);
    expect(store.files.has("assets/illustration-set.json")).toBe(false);
  });

  it("keeps both set results and prefers the icon error when both fail", async () => {
    const store = new MemoryStore();
    const secondIconBrief: AssetBrief = {
      ...iconBrief,
      id: "icon-search",
      constraints: { ...iconBrief.constraints, strokeWidth: 2 },
    };
    const secondIllustrationBrief: AssetBrief = {
      ...illustrationBrief,
      id: "illus-network-error",
      constraints: {
        ...illustrationBrief.constraints,
        palette: ["#2563EB", "#E5E7EB", "#111827", "#F59E0B"],
      },
    };
    const svgs: Record<string, string> = {
      "icon-home": validIcon,
      "icon-search": rootStrokeIcon,
      "illus-empty-inventory": validIllustration,
      "illus-network-error": validIllustration,
    };
    const reviewer: AssetReviewerPort = {
      async review() {
        return passVerdict;
      },
    };

    const result = await runAssetReview({
      runId: "run-batch",
      project: "employee-app",
      profile: "b-mobile",
      runDir: "/tmp/run-batch",
      briefs: [iconBrief, secondIconBrief, illustrationBrief, secondIllustrationBrief],
      style: { id: "b-mobile" },
      policy: DEFAULT_SOURCE_POLICY,
      ports: ports(store, (id) => svgs[id]!, reviewer),
    });

    expect(result.batchGates?.iconSet?.passed).toBe(false);
    expect(result.batchGates?.illustrationSet?.passed).toBe(false);
    expect(result.error).toBe("ICON_SET_INCONSISTENT");
    expect(result.passed).toBe(false);
    expect(store.files.has("assets/icon-set.json")).toBe(true);
    expect(store.files.has("assets/illustration-set.json")).toBe(true);
    expect(() => AssetReviewRunSchema.parse(result)).not.toThrow();
  });
});
