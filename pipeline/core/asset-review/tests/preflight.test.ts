import { describe, expect, it } from "vitest";
import type { AssetBrief, AssetCandidate } from "../src/contracts.js";
import type { ArtifactStorePort, AssetProducerPort } from "../src/ports.js";
import { preflightAssetBriefs } from "../src/preflight.js";

const validIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5V21H3z"/></svg>`;

const brief: AssetBrief = {
  id: "icon-home",
  kind: "icon",
  scene: "home",
  styleRef: "b-mobile",
  size: { width: 24, height: 24 },
  format: "svg",
  constraints: { grid: 24, strokeWidth: 1.5 },
  sourceChain: ["library"],
};

class MemoryStore implements ArtifactStorePort {
  readonly files = new Map<string, string>();
  async writeJson(path: string, value: unknown): Promise<void> {
    this.files.set(path, JSON.stringify(value));
  }
  async writeText(path: string, value: string): Promise<void> {
    this.files.set(path, value);
  }
  async appendText(path: string, value: string): Promise<void> {
    this.files.set(path, `${this.files.get(path) ?? ""}${value}`);
  }
  async readText(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`missing ${path}`);
    return value;
  }
  async hash(): Promise<string> {
    return "sha256:x";
  }
}

function producer(store: MemoryStore, fail = false): AssetProducerPort {
  return {
    async produce({ brief: input, source, attempt }): Promise<AssetCandidate> {
      if (fail) throw new Error("library missing");
      const path = `assets/attempts/${input.id}/${source}-${attempt}/candidate.svg`;
      await store.writeText(path, validIcon);
      return {
        assetId: input.id,
        source,
        sourceTier: "A",
        attempt,
        file: { path, format: "svg", hash: "sha256:x" },
        producer: { tool: "test" },
        license: "ISC",
        producedAt: "2026-10-20T00:00:00.000Z",
      };
    },
  };
}

describe("preflightAssetBriefs", () => {
  it("passes a valid icon and writes gate.json", async () => {
    const store = new MemoryStore();
    const result = await preflightAssetBriefs({
      briefs: [brief],
      producer: producer(store),
      store,
      runDir: "/tmp/run",
    });
    expect(result.passed).toBe(true);
    expect(result.items[0]!.gate?.passed).toBe(true);
    expect(store.files.has("assets/attempts/icon-home/library-1/gate.json")).toBe(true);
  });

  it("records a producer failure without throwing", async () => {
    const store = new MemoryStore();
    const result = await preflightAssetBriefs({
      briefs: [brief],
      producer: producer(store, true),
      store,
      runDir: "/tmp/run",
    });
    expect(result.passed).toBe(false);
    expect(result.items[0]!.error).toContain("library missing");
  });
});
