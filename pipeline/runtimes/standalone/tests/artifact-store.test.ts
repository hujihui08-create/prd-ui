import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileArtifactStore } from "../src/asset/artifact-store.js";

const temporaryDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-store-"));
  temporaryDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("FileArtifactStore", () => {
  it("writes, reads and hashes text and JSON", async () => {
    const store = new FileArtifactStore(await tempDir());
    await store.writeText("assets/a.txt", "hello");
    expect(await store.readText("assets/a.txt")).toBe("hello");
    expect(await store.hash("assets/a.txt")).toMatch(/^sha256:[a-f0-9]{64}$/);

    await store.writeJson("assets/nested/b.json", { ok: true });
    expect(await store.readText("assets/nested/b.json")).toContain('"ok": true');
  });

  it("appends text without rewriting earlier lines", async () => {
    const store = new FileArtifactStore(await tempDir());
    await store.appendText("logs/run.ndjson", '{"event":1}\n');
    await store.appendText("logs/run.ndjson", '{"event":2}\n');
    expect(await store.readText("logs/run.ndjson")).toBe('{"event":1}\n{"event":2}\n');
  });

  it("rejects paths outside the run directory", async () => {
    const store = new FileArtifactStore(await tempDir());
    await expect(store.writeText("../escape.txt", "x")).rejects.toThrow(/escapes/);
    await expect(store.appendText("../escape.txt", "x")).rejects.toThrow(/escapes/);
  });

  it("reports existence without throwing on a missing file", async () => {
    const store = new FileArtifactStore(await tempDir());
    expect(await store.exists("missing.json")).toBe(false);
    await store.writeJson("present.json", { ok: true });
    expect(await store.exists("present.json")).toBe(true);
  });

  it("survives concurrent writes to the same path", async () => {
    const store = new FileArtifactStore(await tempDir());
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.writeJson("state.json", { index })
      )
    );
    const raw = await store.readText("state.json");
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(JSON.parse(raw)).toHaveProperty("index");
  });
});
