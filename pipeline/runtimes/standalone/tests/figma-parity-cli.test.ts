import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import type { ParityReport, ParityThresholds } from "@prd-ui/contracts";
import { main, parseArgs } from "../src/figma-parity-cli.js";
import { maxDiffCluster } from "../src/visual/clusters.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function sha256(buffer: Buffer): string {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function solidPng(width: number, height: number, value: number): Buffer {
  const png = new PNG({ width, height });
  for (let index = 0; index < width * height; index += 1) {
    png.data[index * 4] = value;
    png.data[index * 4 + 1] = value;
    png.data[index * 4 + 2] = value;
    png.data[index * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

function linePng(
  width: number,
  height: number,
  line: { y: number; x: number; length: number; value: number }
): Buffer {
  const png = PNG.sync.read(solidPng(width, height, 255));
  for (let x = line.x; x < line.x + line.length; x += 1) {
    const index = (line.y * width + x) * 4;
    png.data[index] = line.value;
    png.data[index + 1] = line.value;
    png.data[index + 2] = line.value;
    png.data[index + 3] = 255;
  }
  return PNG.sync.write(png);
}

interface Fixture {
  root: string;
  specRun: string;
  baselineDir: string;
  figmaDir: string;
  outDir: string;
}

async function createFixture(input: { baseline: Buffer; figma: Buffer }): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "figma-parity-cli-"));
  roots.push(root);
  const specRun = path.join(root, "spec");
  const baselineDir = path.join(root, "baseline");
  const figmaDir = path.join(root, "figma");
  const outDir = path.join(root, "out");
  await mkdir(path.join(specRun, "artifacts", "page-spec"), { recursive: true });
  await mkdir(baselineDir, { recursive: true });
  await mkdir(figmaDir, { recursive: true });
  await mkdir(outDir, { recursive: true });

  const pageId = "today";
  await writeFile(
    path.join(specRun, "artifacts", "page-spec", `${pageId}.json`),
    JSON.stringify({ meta: { pageId, project: "fixture" } }),
    "utf8"
  );
  await writeFile(path.join(baselineDir, "today.default.png"), input.baseline);
  await writeFile(path.join(figmaDir, `figma.${pageId}.png`), input.figma);

  const image = PNG.sync.read(input.baseline);
  const manifest = {
    schemaVersion: "1.0",
    project: "fixture",
    generatedAt: "2026-10-26T00:00:00.000Z",
    cases: [
      {
        id: "today.default",
        pageId,
        state: "default",
        viewport: { width: image.width, height: image.height },
        file: "today.default.png",
        sha256: sha256(input.baseline),
      },
    ],
  };
  await writeFile(path.join(baselineDir, "manifest.json"), JSON.stringify(manifest), "utf8");
  return { root, specRun, baselineDir, figmaDir, outDir };
}

async function runMain(
  fixture: Fixture,
  extra: string[] = []
): Promise<{ code: number; stdout: string[]; stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await main(
    [
      "--figma",
      fixture.figmaDir,
      "--baseline",
      fixture.baselineDir,
      "--spec-run",
      fixture.specRun,
      "--out",
      fixture.outDir,
      ...extra,
    ],
    {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    }
  );
  return { code, stdout, stderr };
}

async function readReport(fixture: Fixture): Promise<ParityReport> {
  return JSON.parse(
    await readFile(path.join(fixture.outDir, "parity.json"), "utf8")
  ) as ParityReport;
}

function maskBuffer(width: number, height: number, points: Array<[number, number]>): Buffer {
  const buffer = Buffer.alloc(width * height * 4);
  for (const [x, y] of points) buffer[(y * width + x) * 4 + 3] = 255;
  return buffer;
}

describe("figma:parity args", () => {
  it("parses required paths and defaults", () => {
    const options = parseArgs([
      "--figma",
      "/tmp/figma",
      "--baseline",
      "/tmp/baseline",
      "--spec-run",
      "/tmp/spec",
      "--out",
      "/tmp/out",
    ]);
    expect(options.figma).toBe(path.resolve("/tmp/figma"));
    expect(options.baseline).toBe(path.resolve("/tmp/baseline"));
    expect(options.specRun).toBe(path.resolve("/tmp/spec"));
    expect(options.out).toBe(path.resolve("/tmp/out"));
    expect(options.maxPixelDiff).toBe(0.005);
    expect(options.minSsim).toBe(0.98);
    expect(options.maxClusterPixels).toBe(24);
    expect(options.json).toBe(false);
  });

  it("parses custom thresholds", () => {
    const options = parseArgs([
      "--figma",
      "/tmp/figma",
      "--baseline",
      "/tmp/baseline",
      "--spec-run",
      "/tmp/spec",
      "--out",
      "/tmp/out",
      "--max-pixel-diff",
      "0.01",
      "--min-ssim",
      "0.95",
      "--max-cluster-pixels",
      "40",
      "--json",
    ]);
    expect(options.maxPixelDiff).toBe(0.01);
    expect(options.minSsim).toBe(0.95);
    expect(options.maxClusterPixels).toBe(40);
    expect(options.json).toBe(true);
  });

  it("rejects unknown flags and invalid values", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
    expect(() => parseArgs(["--max-pixel-diff", "1.5"])).toThrow(/number in \[0, 1\]/);
    expect(() => parseArgs(["--min-ssim", "nan"])).toThrow(/number in \[0, 1\]/);
    expect(() => parseArgs(["--max-cluster-pixels", "1.5"])).toThrow(/non-negative integer/);
    expect(() => parseArgs(["--max-cluster-pixels", "-2"])).toThrow(/non-negative integer/);
  });
});

describe("maxDiffCluster", () => {
  it("returns 0 for identical images", () => {
    expect(maxDiffCluster(maskBuffer(32, 32, []), 32, 32)).toBe(0);
  });

  it("measures a 40px horizontal line", () => {
    const points = Array.from({ length: 40 }, (_, index): [number, number] => [5 + index, 10]);
    expect(maxDiffCluster(maskBuffer(64, 64, points), 64, 64)).toBe(40);
  });

  it("returns 1 for scattered isolated pixels", () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [2, 0],
      [4, 0],
      [0, 2],
      [2, 2],
      [4, 2],
    ];
    expect(maxDiffCluster(maskBuffer(64, 64, points), 64, 64)).toBe(1);
  });
});

describe("figma:parity main", () => {
  it("passes identical images and writes relative paths with all thresholds", async () => {
    const image = solidPng(32, 32, 128);
    const fixture = await createFixture({ baseline: image, figma: Buffer.from(image) });
    const result = await runMain(fixture);

    expect(result.stderr).toHaveLength(0);
    expect(result.code).toBe(0);
    const report = await readReport(fixture);
    expect(report.summary).toEqual({ passed: true, failed: 0, pages: 1 });
    expect(report.thresholds).toEqual({
      maxPixelDiff: 0.005,
      minSsim: 0.98,
      maxClusterPixels: 24,
    });

    const page = report.pages[0]!;
    expect(page.passed).toBe(true);
    expect(page.pixelDiffRatio).toBe(0);
    expect(page.ssim).toBe(1);
    expect(page.maxDiffCluster).toBe(0);
    expect(page.baselineFile).toBe("../baseline/today.default.png");
    expect(page.figmaFile).toBe("../figma/figma.today.png");
    expect(page.diffFile).toBe("diff/today.png");
    for (const file of [page.baselineFile, page.figmaFile, page.diffFile!]) {
      expect(path.isAbsolute(file)).toBe(false);
      expect(file.startsWith("/")).toBe(false);
    }

    const serialized = await readFile(path.join(fixture.outDir, "parity.json"), "utf8");
    expect(serialized).not.toContain(fixture.root);

    const config = JSON.parse(
      await readFile(path.join(fixture.outDir, "parity.config.json"), "utf8")
    ) as { thresholds: ParityThresholds };
    expect(config.thresholds).toEqual(report.thresholds);
    expect(config.thresholds.maxClusterPixels).toBe(24);
  });

  it("fails a 1px border removal that global thresholds miss", async () => {
    const fixture = await createFixture({
      baseline: solidPng(200, 200, 255),
      figma: linePng(200, 200, { y: 100, x: 50, length: 40, value: 0 }),
    });
    const result = await runMain(fixture);

    expect(result.code).toBe(1);
    const page = (await readReport(fixture)).pages[0]!;
    expect(page.pixelDiffRatio).toBeCloseTo(0.001, 6);
    expect(page.ssim).toBeGreaterThan(0.98);
    expect(page.maxDiffCluster).toBe(40);
    expect(page.findings.map((finding) => finding.code)).toEqual(["PARITY_DIFF_CLUSTER"]);
  });

  it("passes the same localized diff when the cluster threshold is raised", async () => {
    const fixture = await createFixture({
      baseline: solidPng(200, 200, 255),
      figma: linePng(200, 200, { y: 100, x: 50, length: 40, value: 0 }),
    });
    const result = await runMain(fixture, ["--max-cluster-pixels", "40"]);

    expect(result.code).toBe(0);
    const page = (await readReport(fixture)).pages[0]!;
    expect(page.maxDiffCluster).toBe(40);
    expect(page.findings).toHaveLength(0);
  });

  it("fails closed when the baseline PNG no longer matches the manifest", async () => {
    const original = solidPng(32, 32, 128);
    const fixture = await createFixture({ baseline: original, figma: Buffer.from(original) });
    // Simulate a baseline edit that does not update manifest.json.
    await writeFile(path.join(fixture.baselineDir, "today.default.png"), solidPng(32, 32, 200));

    const result = await runMain(fixture);
    expect(result.code).toBe(1);
    const page = (await readReport(fixture)).pages[0]!;
    expect(page.passed).toBe(false);
    expect(page.findings.map((finding) => finding.code)).toContain("BASELINE_STALE");
  });

  it("uses a pinned parity.config.json when no threshold flags are passed", async () => {
    const fixture = await createFixture({
      baseline: solidPng(200, 200, 255),
      figma: linePng(200, 200, { y: 100, x: 50, length: 40, value: 0 }),
    });
    await writeFile(
      path.join(fixture.outDir, "parity.config.json"),
      JSON.stringify({
        schemaVersion: "1.0",
        thresholds: { maxPixelDiff: 0.005, minSsim: 0.98, maxClusterPixels: 40 },
      }),
      "utf8"
    );

    const relaxed = await runMain(fixture);
    expect(relaxed.code).toBe(0);
    expect((await readReport(fixture)).thresholds.maxClusterPixels).toBe(40);

    // A later run must not silently fall back to the built-in default 24.
    await writeFile(
      path.join(fixture.outDir, "parity.config.json"),
      JSON.stringify({
        schemaVersion: "1.0",
        thresholds: { maxPixelDiff: 0.005, minSsim: 0.98, maxClusterPixels: 10 },
      }),
      "utf8"
    );
    const pinned = await runMain(fixture);
    expect(pinned.code).toBe(1);
    const page = (await readReport(fixture)).pages[0]!;
    expect(page.findings.map((finding) => finding.code)).toEqual(["PARITY_DIFF_CLUSTER"]);
    expect((await readReport(fixture)).thresholds.maxClusterPixels).toBe(10);
  });

  it("rejects a malformed pinned config", async () => {
    const image = solidPng(32, 32, 128);
    const fixture = await createFixture({ baseline: image, figma: Buffer.from(image) });
    await writeFile(
      path.join(fixture.outDir, "parity.config.json"),
      JSON.stringify({ schemaVersion: "1.0", thresholds: { maxClusterPixels: -1 } }),
      "utf8"
    );
    const result = await runMain(fixture);
    expect(result.code).toBe(2);
    expect(result.stderr.join("\n")).toContain("PARITY_CONFIG_INVALID");
  });
});
