import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  AssetBriefSchema,
  DEFAULT_SOURCE_POLICY,
  runAssetReview,
  type AssetBrief,
  type AssetReviewRecord,
  type AssetReviewRunResult,
  type AssetReviewVerdict,
  type AssetReviewerInput,
  type AssetReviewerPort,
} from "@prd-ui/asset-review";
import { extractVerdict } from "../../dsh/src/dsh-process.js";
import { FileArtifactStore } from "../src/asset/artifact-store.js";
import { LibrarySourceAdapter, loadLibraryIndex } from "../src/asset/library-source.js";
import { ScriptedReviewer, loadScriptedReviews } from "../src/asset/scripted-reviewer.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const temporaryDirs: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-conformance-"));
  temporaryDirs.push(dir);
  return dir;
}

async function loadBriefs(assetsDir: string): Promise<AssetBrief[]> {
  const briefsDir = path.join(assetsDir, "briefs");
  const files = (await readdir(briefsDir)).filter((file) => file.endsWith(".json")).sort();
  const briefs: AssetBrief[] = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(briefsDir, file), "utf8")) as unknown;
    const items = Array.isArray(raw) ? raw : [raw];
    for (const item of items) briefs.push(AssetBriefSchema.parse(item));
  }
  return briefs;
}

class DshLikeReviewer implements AssetReviewerPort {
  constructor(private readonly reviews: Map<string, AssetReviewVerdict>) {}

  async review(input: AssetReviewerInput): Promise<AssetReviewVerdict> {
    const key = `${input.brief.id}/${input.candidate.source}/${input.candidate.attempt}`;
    const verdict = this.reviews.get(key);
    if (!verdict) throw new Error(`missing scripted review: ${key}`);
    return extractVerdict(JSON.stringify(verdict));
  }
}

interface TraceEntry {
  assetId: string;
  status: string;
  source?: string;
  sourceTier?: string;
  degraded: boolean;
  attempts: Array<{
    source: string;
    attempt: number;
    status: string;
    issues: string[];
    verdict?: string;
  }>;
}

function trace(records: AssetReviewRecord[]): TraceEntry[] {
  return records.map((record) => ({
    assetId: record.assetId,
    status: record.status,
    ...(record.source === undefined ? {} : { source: record.source }),
    ...(record.sourceTier === undefined ? {} : { sourceTier: record.sourceTier }),
    degraded: record.degraded,
    attempts: record.attempts.map((attempt) => ({
      source: attempt.source,
      attempt: attempt.attempt,
      status: attempt.status,
      issues: attempt.issues,
      ...(attempt.review === undefined ? {} : { verdict: attempt.review.verdict }),
    })),
  }));
}

async function runFixture(
  assetsDir: string,
  reviewer: AssetReviewerPort
): Promise<{ runDir: string; result: AssetReviewRunResult }> {
  const runDir = await tempDir();
  const store = new FileArtifactStore(runDir);
  const libraryDir = path.join(assetsDir, "library");
  const result = await runAssetReview({
    runId: "conformance",
    project: "employee-app",
    profile: "b-mobile",
    runDir,
    briefs: await loadBriefs(assetsDir),
    style: { id: "b-mobile" },
    policy: DEFAULT_SOURCE_POLICY,
    ports: {
      producer: new LibrarySourceAdapter({
        libraryDir,
        index: await loadLibraryIndex(libraryDir),
        store,
      }),
      reviewer,
      store,
      clock: { now: () => new Date("2026-10-20T00:00:00.000Z") },
      log: { async log() {} },
    },
  });
  return { runDir, result };
}

describe("standalone / dsh conformance", () => {
  it("produces the same decision trace for the happy-path fixture", async () => {
    const assetsDir = path.join(pipelineRoot, "samples", "assets", "m0");
    const reviews = await loadScriptedReviews(path.join(assetsDir, "scripted-reviews.json"));
    const standalone = await runFixture(assetsDir, new ScriptedReviewer(reviews));
    const dshLike = await runFixture(assetsDir, new DshLikeReviewer(reviews));
    expect(trace(dshLike.result.assets)).toEqual(trace(standalone.result.assets));
    expect(standalone.result.summary).toEqual(dshLike.result.summary);
  });

  it("produces the same retry/unresolved trace for the scenario fixture", async () => {
    const assetsDir = path.join(pipelineRoot, "samples", "assets", "m0-scenarios");
    const reviews = await loadScriptedReviews(path.join(assetsDir, "scripted-reviews.json"));
    const standalone = await runFixture(assetsDir, new ScriptedReviewer(reviews));
    const dshLike = await runFixture(assetsDir, new DshLikeReviewer(reviews));
    expect(trace(dshLike.result.assets)).toEqual(trace(standalone.result.assets));
    expect(standalone.result.summary.unresolved).toBe(1);
  });

  it("freezes byte-identical deterministic assets across runtimes", async () => {
    const assetsDir = path.join(pipelineRoot, "samples", "assets", "m0-scenarios");
    const reviews = await loadScriptedReviews(path.join(assetsDir, "scripted-reviews.json"));
    const standalone = await runFixture(assetsDir, new ScriptedReviewer(reviews));
    const dshLike = await runFixture(assetsDir, new DshLikeReviewer(reviews));
    const left = await readFile(path.join(standalone.runDir, "assets/frozen/icon-retry/asset.svg"), "utf8");
    const right = await readFile(path.join(dshLike.runDir, "assets/frozen/icon-retry/asset.svg"), "utf8");
    expect(right).toBe(left);
  });
});
