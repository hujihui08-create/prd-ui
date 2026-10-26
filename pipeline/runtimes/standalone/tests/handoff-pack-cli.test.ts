import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HandoffManifest } from "@prd-ui/contracts";
import { computeFigmaHashes } from "../src/figma-sign-cli.js";
import { main } from "../src/handoff-pack-cli.js";
import { hashValue, visualManifestHash } from "../src/visual/manifest.js";

const PROJECT = "fixture";
const GENERATED_AT = "2026-10-26T00:00:00.000Z";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function temp(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "handoff-pack-"));
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

function sha256(value: Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function spec(): Record<string, unknown> {
  return {
    meta: {
      pageId: "today",
      project: PROJECT,
      name: "今日",
      target: "mobile",
      profile: "b-mobile",
      archetype: "home",
      purpose: "fixture page",
      route: "/today",
      roles: ["tester"],
      reqRefs: ["REQ-FIXTURE-1"],
      version: "0.1.0",
    },
    layout: {
      type: "Screen",
      props: { title: "Fixture" },
      id: "today.page.root",
    },
    states: { default: { name: "default" } },
    interactions: [],
    traceability: { reqMap: {}, designDefaults: [], unmapped: [] },
  };
}

interface Fixture {
  root: string;
  specDir: string;
  htmlDir: string;
  figmaDir: string;
  visualDir: string;
  baselineDir: string;
  outDir: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await temp();
  const specDir = path.join(root, "spec");
  const htmlDir = path.join(root, "html");
  const figmaDir = path.join(root, "figma");
  const visualDir = path.join(root, "visual");
  const baselineDir = path.join(root, "baseline");
  const outDir = path.join(root, "out");

  await writeJson(path.join(specDir, "artifacts", "page-spec", "today.json"), spec());
  await writeJson(path.join(specDir, "findings", "spec-engineer-gate.json"), {
    schemaVersion: "1.0",
    project: PROJECT,
    generatedAt: GENERATED_AT,
    gate: { passed: true, issues: [] },
  });
  await mkdir(htmlDir, { recursive: true });
  await writeFile(
    path.join(htmlDir, "today.html"),
    "<!doctype html><html lang=\"zh\"><body><h1>今日</h1></body></html>\n",
    "utf8"
  );

  await writeJson(path.join(figmaDir, "plans", "figma-plan.today.json"), {
    schemaVersion: "1.0",
    project: PROJECT,
    pageId: "today",
    pageName: "今日",
  });
  await writeJson(path.join(figmaDir, "readback", "figma-readback.today.json"), {
    schemaVersion: "1.0",
    pageId: "today",
    fileKey: "fixture-file-key",
    builtAt: GENERATED_AT,
    fonts: [],
    variables: [],
    textStyles: [],
    components: [],
    nodes: [],
    errors: [],
  });
  await writeJson(path.join(figmaDir, "diff", "figma-diff.today.json"), {
    schemaVersion: "1.0",
    pageId: "today",
    passed: true,
    findings: [],
    majorCount: 0,
    blockerCount: 0,
  });
  await writeJson(path.join(figmaDir, "conformance", "conformance.json"), {
    schemaVersion: "1.0",
    project: PROJECT,
    generatedAt: GENERATED_AT,
    pages: [{ pageId: "today", passed: true, checked: 1, skipped: 0, findings: [] }],
    summary: { blockers: 0, majors: 0, pages: 1 },
  });
  await writeJson(path.join(figmaDir, "parity", "parity.json"), {
    schemaVersion: "1.0",
    project: PROJECT,
    generatedAt: GENERATED_AT,
    thresholds: { maxPixelDiff: 0.005, minSsim: 0.98, maxClusterPixels: 24 },
    pages: [
      {
        pageId: "today",
        passed: true,
        pixelDiffRatio: 0,
        ssim: 1,
        maxDiffCluster: 0,
        findings: [],
      },
    ],
    summary: { passed: true, failed: 0, pages: 1 },
  });
  await writeBytes(path.join(figmaDir, "screenshots", "delivery.today.png"), PNG);
  await writeBytes(path.join(figmaDir, "parity", "diff", "today.png"), PNG);

  const baselineSha = sha256(PNG);
  await writeBytes(path.join(baselineDir, "today.default.png"), PNG);
  await writeJson(path.join(baselineDir, "manifest.json"), {
    schemaVersion: "1.0",
    project: PROJECT,
    generatedAt: GENERATED_AT,
    cases: [
      {
        id: "today.default",
        pageId: "today",
        state: "default",
        viewport: { width: 390, height: 844 },
        file: "today.default.png",
        sha256: baselineSha,
      },
    ],
  });

  const visualManifest = {
    schemaVersion: "1.0" as const,
    project: PROJECT,
    generatedAt: GENERATED_AT,
    cases: [
      {
        id: "today.default",
        pageId: "today",
        state: "default",
        viewport: { width: 390, height: 844 },
        file: "screenshots/today.default.png",
        sha256: baselineSha,
      },
    ],
  };
  await writeBytes(path.join(visualDir, "screenshots", "today.default.png"), PNG);
  await writeJson(path.join(visualDir, "screenshots", "manifest.json"), visualManifest);
  const manifestHash = visualManifestHash(visualManifest);
  const findingsHash = hashValue([]);
  await writeJson(path.join(visualDir, "state.json"), {
    schemaVersion: "1.0",
    runId: "run-fixture",
    project: PROJECT,
    stage: "done",
    status: "success",
    cases: 1,
    screenshots: 1,
    diff: { passed: 1, failed: 0, missing: 0 },
    findings: [],
    costCny: 0,
    usageComplete: true,
    manifestHash,
    findingsHash,
    signoff: { visual: true },
    startedAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    finishedAt: GENERATED_AT,
  });
  await writeJson(path.join(visualDir, "visual-sign.json"), {
    schemaVersion: "1.0",
    runId: "run-fixture",
    project: PROJECT,
    signedAt: GENERATED_AT,
    status: "success",
    signer: "tester",
    date: "2026-10-26",
    manifestHash,
    findingsHash,
    waivedFindings: [],
    costCny: 0,
    usageComplete: true,
    cachePersisted: false,
  });
  await mkdir(path.join(visualDir, "signoff"), { recursive: true });
  await writeFile(
    path.join(visualDir, "signoff", "visual.md"),
    `# Visual signoff\n\n<!-- signoff\n${JSON.stringify(
      {
        signer: "tester",
        date: "2026-10-26",
        manifestHash,
        findingsHash,
        acceptedMajors: [],
        waivers: [],
      },
      null,
      2
    )}\n-->\n\nfixture\n`,
    "utf8"
  );

  const hashes = await computeFigmaHashes({
    figmaDir,
    baselineFile: path.join(baselineDir, "manifest.json"),
  });
  await writeJson(path.join(figmaDir, "signoff", "figma-sign.json"), {
    schemaVersion: "1.0",
    project: PROJECT,
    signer: "tester",
    date: "2026-10-26",
    ...hashes,
  });

  return { root, specDir, htmlDir, figmaDir, visualDir, baselineDir, outDir };
}

function args(fixture: Fixture, extra: string[] = []): string[] {
  return [
    "--spec-run",
    fixture.specDir,
    "--html",
    fixture.htmlDir,
    "--figma",
    fixture.figmaDir,
    "--visual-run",
    fixture.visualDir,
    "--baseline",
    fixture.baselineDir,
    "--out",
    fixture.outDir,
    ...extra,
  ];
}

async function runMain(
  fixture: Fixture,
  extra: string[] = []
): Promise<{ code: number; stdout: string[]; stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await main(args(fixture, extra), {
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout, stderr };
}

async function expectFailure(fixture: Fixture, expected: RegExp, code = 1): Promise<void> {
  const result = await runMain(fixture);
  expect(result.code).toBe(code);
  expect(`${result.stdout.join("\n")}\n${result.stderr.join("\n")}`).toMatch(expected);
  expect(await exists(fixture.outDir)).toBe(false);
}

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
}

/** Re-sign the figma evidence after changing hashed evidence, so a test can
 * isolate the gate under test from an incidental stale-signoff failure. */
async function resignFigma(fixture: Fixture): Promise<void> {
  const hashes = await computeFigmaHashes({
    figmaDir: fixture.figmaDir,
    baselineFile: path.join(fixture.baselineDir, "manifest.json"),
  });
  await writeJson(path.join(fixture.figmaDir, "signoff", "figma-sign.json"), {
    schemaVersion: "1.0",
    project: PROJECT,
    signer: "tester",
    date: "2026-10-26",
    ...hashes,
  });
}

describe("handoff:pack", () => {
  it("packs a success fixture with docs, manifest, hashes and zip", async () => {
    const fixture = await createFixture();
    const result = await runMain(fixture, ["--zip"]);
    expect(result.code).toBe(0);
    expect(result.stdout.join("\n")).toContain("Handoff pack OK: success");

    const manifest = JSON.parse(
      await readFile(path.join(fixture.outDir, "handoff.manifest.json"), "utf8")
    ) as HandoffManifest;
    expect(manifest.gates.verify.passed).toBe(true);
    expect(manifest.gates.conformance.passed).toBe(true);
    expect(manifest.gates.parity.passed).toBe(true);
    expect(manifest.gates.figmaSign.passed).toBe(true);
    expect(manifest.gates.visualSign.passed).toBe(true);
    expect(manifest.signoffs.map((signoff) => signoff.type).sort()).toEqual([
      "figma",
      "visual",
    ]);

    expect(manifest.files.some((file) => file.path === "HANDOFF.md")).toBe(true);
    expect(manifest.files.some((file) => file.path === "LICENSES.md")).toBe(true);
    expect(manifest.files.some((file) => file.path === "handoff.manifest.json")).toBe(false);
    expect(manifest.files.some((file) => file.path === "handoff.zip")).toBe(false);
    expect(manifest.archive?.path).toBe("handoff.zip");

    for (const file of manifest.files) {
      const body = await readFile(path.join(fixture.outDir, file.path));
      expect(sha256(body)).toBe(file.sha256);
      expect(body.length).toBe(file.bytes);
    }

    const zip = await readFile(path.join(fixture.outDir, "handoff.zip"));
    expect(sha256(zip)).toBe(manifest.archive?.sha256);
    const handoffMd = await readFile(path.join(fixture.outDir, "HANDOFF.md"), "utf8");
    const licensesMd = await readFile(path.join(fixture.outDir, "LICENSES.md"), "utf8");
    expect(handoffMd).not.toMatch(/TBD|TODO|\{\{/);
    expect(licensesMd).toContain("无第三方资产");
  });

  it("fails closed when the figma signoff is missing", async () => {
    const fixture = await createFixture();
    await rm(path.join(fixture.figmaDir, "signoff", "figma-sign.json"));
    await expectFailure(fixture, /HANDOFF_SIGNOFF_MISSING/);
  });

  it("fails closed on a stale figma signoff hash", async () => {
    const fixture = await createFixture();
    const signoff = await readJson(path.join(fixture.figmaDir, "signoff", "figma-sign.json"));
    await writeJson(path.join(fixture.figmaDir, "signoff", "figma-sign.json"), {
      ...signoff,
      planHash: "sha256:stale",
    });
    await expectFailure(fixture, /HANDOFF_SIGNOFF_STALE/);
  });

  it("fails closed on a stale visual signoff hash", async () => {
    const fixture = await createFixture();
    const signoff = await readJson(path.join(fixture.visualDir, "visual-sign.json"));
    await writeJson(path.join(fixture.visualDir, "visual-sign.json"), {
      ...signoff,
      findingsHash: "sha256:stale",
    });
    await expectFailure(fixture, /visual signoff findingsHash is stale/);
  });

  it("fails closed when the visual run is not final", async () => {
    const fixture = await createFixture();
    const state = await readJson(path.join(fixture.visualDir, "state.json"));
    await writeJson(path.join(fixture.visualDir, "state.json"), {
      ...state,
      status: "awaiting_signoff",
    });
    await expectFailure(fixture, /run status is awaiting_signoff/);
  });

  it("fails closed on a failed per-page diff", async () => {
    const fixture = await createFixture();
    const diff = await readJson(path.join(fixture.figmaDir, "diff", "figma-diff.today.json"));
    await writeJson(path.join(fixture.figmaDir, "diff", "figma-diff.today.json"), {
      ...diff,
      passed: false,
    });
    await expectFailure(fixture, /diff did not pass for today/);
  });

  it("fails closed on a conformance blocker", async () => {
    const fixture = await createFixture();
    const conformance = await readJson(
      path.join(fixture.figmaDir, "conformance", "conformance.json")
    );
    await writeJson(path.join(fixture.figmaDir, "conformance", "conformance.json"), {
      ...conformance,
      pages: [{ pageId: "today", passed: false, checked: 1, skipped: 0, findings: [] }],
      summary: { blockers: 1, majors: 0, pages: 1 },
    });
    await resignFigma(fixture);
    await expectFailure(fixture, /conformance gate failed/);
  });

  it("fails closed when the baseline has no cases", async () => {
    const fixture = await createFixture();
    const baseline = await readJson(path.join(fixture.baselineDir, "manifest.json"));
    await writeJson(path.join(fixture.baselineDir, "manifest.json"), {
      ...baseline,
      cases: [],
    });
    await resignFigma(fixture);
    await expectFailure(fixture, /baseline manifest has no cases/);
  });

  it("fails closed when the baseline project does not match the spec project", async () => {
    const fixture = await createFixture();
    const baseline = await readJson(path.join(fixture.baselineDir, "manifest.json"));
    await writeJson(path.join(fixture.baselineDir, "manifest.json"), {
      ...baseline,
      project: "other-project",
    });
    await resignFigma(fixture);
    await expectFailure(fixture, /baseline project mismatch/);
  });

  it("fails closed when a baseline screenshot does not match its manifest hash", async () => {
    const fixture = await createFixture();
    await writeBytes(path.join(fixture.baselineDir, "today.default.png"), Buffer.from("tampered"));
    await expectFailure(fixture, /baseline screenshot hash mismatch/);
  });

  it("fails closed when the visual manifest path is unsafe", async () => {
    const fixture = await createFixture();
    const manifest = await readJson(
      path.join(fixture.visualDir, "screenshots", "manifest.json")
    );
    await writeJson(path.join(fixture.visualDir, "screenshots", "manifest.json"), {
      ...manifest,
      cases: [{ ...(manifest.cases as Array<Record<string, unknown>>)[0]!, file: "../escape.png" }],
    });
    await expectFailure(fixture, /unsafe file path/);
  });

  it("rejects duplicate page ids in the spec run", async () => {
    const fixture = await createFixture();
    await writeJson(
      path.join(fixture.specDir, "artifacts", "page-spec", "today-copy.json"),
      spec()
    );
    await expectFailure(fixture, /SPEC_PAGE_DUPLICATE/, 2);
  });
});
