import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeFigmaHashes,
  hashJson,
  main,
  parseArgs,
  signEvidence,
  type FigmaHashes,
} from "../src/figma-sign-cli.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function sha256(value: Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function temp(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "figma-sign-"));
  dirs.push(dir);
  return dir;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeBytes(file: string, value: Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value);
}

interface Fixture {
  root: string;
  figmaDir: string;
  baselineDir: string;
  signoffPath: string;
}

interface Overrides {
  conformanceBlockers?: number;
  parityPassed?: boolean;
  diffPassed?: boolean;
  readbackErrors?: string[];
}

function planChild(specId: string, height = 36): Record<string, unknown> {
  return {
    specId,
    type: "FRAME",
    name: specId,
    layoutMode: "NONE",
    height,
    children: [],
  };
}

function basePlan(): Record<string, unknown> {
  return {
    schemaVersion: "1.0",
    project: "fixture",
    pageId: "today",
    pageName: "今日",
    width: 390,
    height: 844,
    background: "#FFFFFF",
    tokens: { "color/surface/default": "#FFFFFF" },
    textStyles: {},
    components: { Button: { variants: {} } },
    coverage: {
      nodes: [],
      summary: { spec: 0, derived: 0, mapped: 0, degraded: 0, unmapped: 0, skipped: 0 },
    },
    root: {
      specId: "today.page.root",
      type: "FRAME",
      name: "今日",
      layoutMode: "VERTICAL",
      children: [
        planChild("today.button.a"),
        planChild("today.button.b"),
        planChild("today.button.c"),
      ],
    },
    stats: { frames: 4, texts: 0, instances: 0, icons: 0, images: 0 },
  };
}

function readbackButton(specId: string, height = 36): Record<string, unknown> {
  return {
    specId,
    nodeId: `node-${specId}`,
    type: "FRAME",
    name: specId,
    layoutMode: "NONE",
    height,
    children: [],
  };
}

function baseReadback(overrides: { buttonHeight?: number } = {}): Record<string, unknown> {
  const height = overrides.buttonHeight ?? 36;
  return {
    schemaVersion: "1.0",
    pageId: "today",
    builtAt: "2026-10-26T00:00:00.000Z",
    fonts: [],
    variables: [],
    textStyles: [],
    components: [],
    nodes: [
      {
        specId: "today.page.root",
        nodeId: "node-root",
        type: "FRAME",
        name: "今日",
        layoutMode: "VERTICAL",
        children: [
          readbackButton("today.button.a", height),
          readbackButton("today.button.b", height),
          readbackButton("today.button.c", height),
        ],
      },
    ],
    errors: [],
  };
}

function baseDiff(): Record<string, unknown> {
  return {
    schemaVersion: "1.0",
    pageId: "today",
    passed: true,
    findings: [],
    majorCount: 0,
    blockerCount: 0,
  };
}

function baseConformance(blockers: number): Record<string, unknown> {
  return {
    schemaVersion: "1.0",
    project: "fixture",
    generatedAt: "2026-10-26T00:00:00.000Z",
    pages: [
      {
        pageId: "today",
        passed: blockers === 0,
        checked: 1,
        skipped: 0,
        findings: [],
      },
    ],
    summary: { blockers, majors: 0, pages: 1 },
  };
}

function baseParity(passed: boolean): Record<string, unknown> {
  return {
    schemaVersion: "1.0",
    project: "fixture",
    generatedAt: "2026-10-26T00:00:00.000Z",
    thresholds: { maxPixelDiff: 0.005, minSsim: 0.98, maxClusterPixels: 24 },
    pages: [
      {
        pageId: "today",
        passed,
        pixelDiffRatio: 0,
        ssim: 1,
        maxDiffCluster: 0,
        baselineFile: "../baseline/today.default.png",
        figmaFile: "../figma/figma.today.png",
        baselineHash: sha256(PNG),
        figmaHash: sha256(PNG),
        baselineManifestHash: sha256(PNG),
        width: 390,
        height: 844,
        findings: passed
          ? []
          : [{ code: "PARITY_PIXEL_DIFF", severity: "blocker", message: "drift" }],
      },
    ],
    summary: { passed, failed: passed ? 0 : 1, pages: 1 },
  };
}

function baseBaselineManifest(): Record<string, unknown> {
  return {
    schemaVersion: "1.0",
    project: "fixture",
    generatedAt: "2026-10-26T00:00:00.000Z",
    cases: [
      {
        id: "today.default",
        pageId: "today",
        state: "default",
        viewport: { width: 390, height: 844 },
        file: "today.default.png",
        sha256: sha256(PNG),
      },
    ],
  };
}

async function createFixture(overrides: Overrides = {}): Promise<Fixture> {
  const root = await temp();
  const figmaDir = path.join(root, "figma");
  const baselineDir = path.join(root, "baseline");
  const signoffPath = path.join(root, "signoff.md");
  const blockers = overrides.conformanceBlockers ?? 0;
  const parityPassed = overrides.parityPassed ?? true;
  const diffPassed = overrides.diffPassed ?? true;

  await writeJson(path.join(figmaDir, "plans", "figma-plan.today.json"), basePlan());
  await writeJson(path.join(figmaDir, "readback", "figma-readback.today.json"), {
    ...baseReadback(),
    errors: overrides.readbackErrors ?? [],
  });
  await writeJson(path.join(figmaDir, "diff", "figma-diff.today.json"), {
    ...baseDiff(),
    passed: diffPassed,
  });
  await writeJson(
    path.join(figmaDir, "conformance", "conformance.json"),
    baseConformance(blockers)
  );
  await writeJson(path.join(figmaDir, "parity", "parity.json"), baseParity(parityPassed));
  await writeBytes(path.join(figmaDir, "parity", "figma.today.png"), PNG);
  await writeJson(path.join(baselineDir, "manifest.json"), baseBaselineManifest());
  await writeBytes(path.join(baselineDir, "today.default.png"), PNG);
  return { root, figmaDir, baselineDir, signoffPath };
}

async function writeSignoff(
  fixture: Fixture,
  hashes: FigmaHashes,
  overrides: Partial<FigmaHashes> = {}
): Promise<void> {
  const block = {
    signer: "tester",
    date: "2026-10-26",
    ...hashes,
    ...overrides,
  };
  await writeFile(
    fixture.signoffPath,
    `# Figma signoff\n\n<!-- signoff\n${JSON.stringify(block, null, 2)}\n-->\n`,
    "utf8"
  );
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
      "--signoff-figma",
      fixture.signoffPath,
      ...extra,
    ],
    {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    }
  );
  return { code, stdout, stderr };
}

async function signoffFile(fixture: Fixture): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(path.join(fixture.figmaDir, "signoff", "figma-sign.json"), "utf8")
  ) as Record<string, unknown>;
}

describe("figma:sign args", () => {
  it("parses required paths and defaults", () => {
    const options = parseArgs([
      "--figma",
      "/tmp/figma",
      "--baseline",
      "/tmp/baseline",
      "--signoff-figma",
      "/tmp/signoff.md",
    ]);
    expect(options.figma).toBe(path.resolve("/tmp/figma"));
    expect(options.baseline).toBe(path.resolve("/tmp/baseline"));
    expect(options.signoffPath).toBe(path.resolve("/tmp/signoff.md"));
    expect(options.json).toBe(false);
  });

  it("rejects unknown flags and missing values", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
    expect(() => parseArgs(["--figma", "--json"])).toThrow(/missing value/);
  });
});

describe("figma:sign", () => {
  it("rejects a signoff with a wrong hash", async () => {
    const dir = await temp();
    await writeFile(
      path.join(dir, "signoff.md"),
      "<!-- signoff\n{\"signer\":\"tester\",\"date\":\"2026-10-26\",\"planHash\":\"sha256:bad\",\"readbackHash\":\"sha256:bad\",\"conformanceHash\":\"sha256:bad\",\"parityHash\":\"sha256:bad\",\"baselineHash\":\"sha256:bad\"}\n-->\n",
      "utf8"
    );
    const result = await signEvidence({
      figmaDir: dir,
      signoffPath: path.join(dir, "signoff.md"),
      hashes: {
        planHash: "sha256:a",
        readbackHash: "sha256:b",
        conformanceHash: "sha256:c",
        parityHash: "sha256:d",
        baselineHash: "sha256:e",
      },
    });
    expect(result.ok).toBe(false);
  });

  it("writes signoff/figma-sign.json when every hash matches", async () => {
    const fixture = await createFixture();
    const hashes = await computeFigmaHashes({
      figmaDir: fixture.figmaDir,
      baselineDir: fixture.baselineDir,
    });
    await writeSignoff(fixture, hashes);

    const result = await signEvidence({
      figmaDir: fixture.figmaDir,
      signoffPath: fixture.signoffPath,
      hashes,
      project: "fixture",
    });

    expect(result.ok).toBe(true);
    expect(await signoffFile(fixture)).toMatchObject({
      schemaVersion: "1.0",
      project: "fixture",
      signer: "tester",
      date: "2026-10-26",
      ...hashes,
    });
  });

  it("ignores timestamps and derived plan indexes when hashing evidence", async () => {
    const fixture = await createFixture();
    const before = await computeFigmaHashes({
      figmaDir: fixture.figmaDir,
      baselineDir: fixture.baselineDir,
    });

    await writeJson(path.join(fixture.figmaDir, "conformance", "conformance.json"), {
      ...baseConformance(0),
      generatedAt: "2026-10-27T12:00:00.000Z",
    });
    await writeJson(path.join(fixture.figmaDir, "readback", "figma-readback.today.json"), {
      ...baseReadback(),
      builtAt: "2026-10-27T12:00:00.000Z",
    });
    await writeJson(path.join(fixture.figmaDir, "parity", "parity.json"), {
      ...baseParity(true),
      generatedAt: "2026-10-27T12:00:00.000Z",
    });
    await writeJson(path.join(fixture.baselineDir, "manifest.json"), {
      ...baseBaselineManifest(),
      generatedAt: "2026-10-27T12:00:00.000Z",
    });
    await writeJson(
      path.join(fixture.figmaDir, "plans", "figma-plan.index.json"),
      {
        schemaVersion: "1.0",
        project: "fixture",
        specRun: "/somewhere/else",
        plans: [],
      }
    );

    const after = await computeFigmaHashes({
      figmaDir: fixture.figmaDir,
      baselineDir: fixture.baselineDir,
    });
    expect(after).toEqual(before);
    for (const hash of Object.values(after)) {
      expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it("signs through main and prints the five hashes", async () => {
    const fixture = await createFixture();
    const hashes = await computeFigmaHashes({
      figmaDir: fixture.figmaDir,
      baselineDir: fixture.baselineDir,
    });
    await writeSignoff(fixture, hashes);

    const result = await runMain(fixture, ["--json"]);

    expect(result.stderr).toHaveLength(0);
    expect(result.code).toBe(0);
    const summary = JSON.parse(result.stdout.join("\n")) as Record<string, unknown>;
    expect(summary).toMatchObject({ ok: true, project: "fixture", ...hashes });
    expect(await signoffFile(fixture)).toMatchObject({ signer: "tester", ...hashes });
  });

  it("refuses a stale signoff hash and prints the current hashes", async () => {
    const fixture = await createFixture();
    const hashes = await computeFigmaHashes({
      figmaDir: fixture.figmaDir,
      baselineDir: fixture.baselineDir,
    });
    await writeSignoff(fixture, hashes, { parityHash: "sha256:stale" });

    const result = await runMain(fixture);

    expect(result.code).toBe(1);
    expect(result.stderr.join("\n")).toContain("SIGNOFF_HASH_MISMATCH: parityHash");
    // The signer needs the current hashes to repair the block.
    expect(result.stdout.join("\n")).toContain(`Plan: ${hashes.planHash}`);
    expect(result.stdout.join("\n")).toContain(`Parity: ${hashes.parityHash}`);
    await expect(signoffFile(fixture)).rejects.toThrow();
  });

  it("refuses when conformance has blockers", async () => {
    const fixture = await createFixture({ conformanceBlockers: 2 });

    const result = await runMain(fixture);

    expect(result.code).toBe(1);
    expect(result.stderr.join("\n")).toContain("CONFORMANCE_BLOCKERS: 2");
    await expect(signoffFile(fixture)).rejects.toThrow();
  });

  it("refuses when parity failed", async () => {
    const fixture = await createFixture({ parityPassed: false });

    const result = await runMain(fixture);

    expect(result.code).toBe(1);
    expect(result.stderr.join("\n")).toContain("PARITY_FAILED");
    await expect(signoffFile(fixture)).rejects.toThrow();
  });

  it("refuses a failed verify diff or a readback with errors", async () => {
    const diffFailure = await createFixture({ diffPassed: false });
    const diffResult = await runMain(diffFailure);
    expect(diffResult.code).toBe(1);
    expect(diffResult.stderr.join("\n")).toContain("FIGMA_VERIFY_FAILED: today");

    const readbackFailure = await createFixture({ readbackErrors: ["export failed"] });
    const readbackResult = await runMain(readbackFailure);
    expect(readbackResult.code).toBe(1);
    expect(readbackResult.stderr.join("\n")).toContain("READBACK_ERRORS: today");
  });

  it("does not trust a stored passed diff when the current readback regressed", async () => {
    const fixture = await createFixture();
    const hashes = await computeFigmaHashes({
      figmaDir: fixture.figmaDir,
      baselineDir: fixture.baselineDir,
    });
    await writeSignoff(fixture, hashes);

    // Three button heights now disagree with the plan: 3 majors > the
    // default maxMajor of 2. The stored diff still claims passed: true.
    await writeJson(path.join(fixture.figmaDir, "readback", "figma-readback.today.json"), {
      ...baseReadback({ buttonHeight: 44 }),
      errors: [],
    });

    const result = await runMain(fixture);
    expect(result.code).toBe(1);
    expect(result.stderr.join("\n")).toContain("FIGMA_VERIFY_FAILED: today");
    await expect(signoffFile(fixture)).rejects.toThrow();
  });

  it("does not trust a stored passed diff after a different plan is supplied", async () => {
    const fixture = await createFixture();
    const hashes = await computeFigmaHashes({
      figmaDir: fixture.figmaDir,
      baselineDir: fixture.baselineDir,
    });
    await writeSignoff(fixture, hashes);

    const plan = basePlan();
    (plan.root as Record<string, unknown>).children = [planChild("today.button.a")];
    await writeJson(path.join(fixture.figmaDir, "plans", "figma-plan.today.json"), plan);

    const result = await runMain(fixture);
    expect(result.code).toBe(1);
    // The plan/readback hierarchy no longer matches: blocker.
    expect(result.stderr.join("\n")).toContain("FIGMA_VERIFY_FAILED: today");
  });

  it("refuses when a parity PNG changes after parity.json was written", async () => {
    const fixture = await createFixture();
    const hashes = await computeFigmaHashes({
      figmaDir: fixture.figmaDir,
      baselineDir: fixture.baselineDir,
    });
    await writeSignoff(fixture, hashes);

    await writeBytes(
      path.join(fixture.figmaDir, "parity", "figma.today.png"),
      Buffer.from("tampered")
    );

    const result = await runMain(fixture);
    expect(result.code).toBe(1);
    expect(result.stderr.join("\n")).toContain("PARITY_HASH_STALE");
    expect(result.stderr.join("\n")).toContain("parity PNG hash does not match parity.json");
  });

  it("refuses when the signed baseline PNG changes after parity.json was written", async () => {
    const fixture = await createFixture();
    const hashes = await computeFigmaHashes({
      figmaDir: fixture.figmaDir,
      baselineDir: fixture.baselineDir,
    });
    await writeSignoff(fixture, hashes);

    await writeBytes(path.join(fixture.baselineDir, "today.default.png"), Buffer.from("tampered"));

    const result = await runMain(fixture);
    expect(result.code).toBe(1);
    expect(result.stderr.join("\n")).toContain("PARITY_HASH_STALE");
    expect(result.stderr.join("\n")).toContain(
      "baseline PNG hash does not match parity.json"
    );
  });

  it("rejects a signoff date in the future and a mismatched project", async () => {
    const fixture = await createFixture();
    const hashes = await computeFigmaHashes({
      figmaDir: fixture.figmaDir,
      baselineDir: fixture.baselineDir,
    });
    await writeSignoff(fixture, hashes);

    const future = await signEvidence({
      figmaDir: fixture.figmaDir,
      signoffPath: fixture.signoffPath,
      hashes,
      project: "fixture",
      now: new Date("2026-10-25T00:00:00Z"),
    });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.error).toContain("SIGNOFF_DATE_IN_FUTURE");

    await writeFile(
      fixture.signoffPath,
      `<!-- signoff\n${JSON.stringify({
        signer: "tester",
        date: "2026-10-26",
        project: "other",
        ...hashes,
      })}\n-->\n`,
      "utf8"
    );
    const mismatch = await signEvidence({
      figmaDir: fixture.figmaDir,
      signoffPath: fixture.signoffPath,
      hashes,
      project: "fixture",
      now: new Date("2026-10-26T00:00:00Z"),
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.error).toContain("SIGNOFF_PROJECT_MISMATCH");
  });

  it("treats a __proto__ key as inert data when hashing", async () => {
    const left = JSON.parse('{"__proto__":{"polluted":true},"a":1}') as unknown;
    const right = JSON.parse('{"a":1,"__proto__":{"polluted":true}}') as unknown;
    expect(hashJson(left)).toBe(hashJson(right));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("returns 2 when the evidence is missing", async () => {
    const root = await temp();
    const result = await main(
      [
        "--figma",
        path.join(root, "figma"),
        "--baseline",
        path.join(root, "baseline"),
        "--signoff-figma",
        path.join(root, "signoff.md"),
      ],
      { stdout: () => undefined, stderr: () => undefined }
    );

    expect(result).toBe(2);
  });
});
