import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AssetBrief } from "@prd-ui/asset-review";
import { FileArtifactStore } from "../src/asset/artifact-store.js";
import {
  LibrarySourceAdapter,
  loadLibraryIndex,
} from "../src/asset/library-source.js";

const temporaryDirs: string[] = [];

async function fixture(): Promise<{ libraryDir: string; runDir: string; store: FileArtifactStore }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "prd-ui-library-"));
  temporaryDirs.push(root);
  const libraryDir = path.join(root, "library");
  const runDir = path.join(root, "run");
  await mkdir(path.join(libraryDir, "icons"), { recursive: true });
  await writeFile(
    path.join(libraryDir, "index.json"),
    JSON.stringify({
      assets: [{ id: "icon-home", kind: "icon", file: "icons/home.svg", license: "ISC" }],
    })
  );
  await writeFile(
    path.join(libraryDir, "icons/home.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>'
  );
  return { libraryDir, runDir, store: new FileArtifactStore(runDir) };
}

const brief: AssetBrief = {
  id: "icon-home",
  kind: "icon",
  scene: "home",
  styleRef: "b-mobile",
  size: { width: 24, height: 24 },
  format: "svg",
  constraints: {},
  sourceChain: ["library"],
};

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("LibrarySourceAdapter", () => {
  it("copies a library asset into the run and returns a candidate", async () => {
    const { libraryDir, runDir, store } = await fixture();
    const adapter = new LibrarySourceAdapter({
      libraryDir,
      index: await loadLibraryIndex(libraryDir),
      store,
    });
    const candidate = await adapter.produce({ brief, source: "library", attempt: 1, runDir });
    expect(candidate.file.path).toBe("assets/attempts/icon-home/library-1/candidate.svg");
    expect(candidate.sourceTier).toBe("A");
    expect(candidate.license).toBe("ISC");
    expect(await store.readText(candidate.file.path)).toContain("<svg");
    expect(candidate.file.hash).toMatch(/^sha256:/);
  });

  it("fails loudly for a missing asset or an unimplemented source", async () => {
    const { libraryDir, runDir, store } = await fixture();
    const adapter = new LibrarySourceAdapter({
      libraryDir,
      index: await loadLibraryIndex(libraryDir),
      store,
    });
    await expect(
      adapter.produce({
        brief: { ...brief, id: "icon-missing" },
        source: "library",
        attempt: 1,
        runDir,
      })
    ).rejects.toThrow(/LIBRARY_MISSING/);
    await expect(
      adapter.produce({ brief, source: "ai-vector", attempt: 1, runDir })
    ).rejects.toThrow(/SOURCE_NOT_CONFIGURED/);
  });
});
