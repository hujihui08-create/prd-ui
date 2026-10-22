import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { chromium } from "playwright";
import {
  AgentRunnerError,
  type AgentResult,
  type AgentRunnerPort,
  type AgentTask,
} from "@prd-ui/agents";
import type { AgentUsage } from "@prd-ui/contracts";
import type { ScreenshotEvidence } from "@prd-ui/visual-review";
import { main as baselineMain } from "../src/visual-baseline-cli.js";
import { main as reviewMain, parseArgs as parseReviewArgs } from "../src/visual-review-cli.js";
import { main as signMain } from "../src/visual-sign-cli.js";
import {
  captureVisualCases,
  type CaptureVisualCasesInput,
} from "../src/visual/screenshot.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const sampleBrief = path.join(
  pipelineRoot,
  "samples",
  "projects",
  "employee-app-phase2",
  "ui-brief.json"
);

/**
 * The default suite must stay offline. Playwright's executable path is enough
 * to detect an installed Chromium without launching it; the browser test is
 * skipped when it is absent (or PLAYWRIGHT_BROWSERS_PATH points elsewhere).
 */
const hasChromium = await (async (): Promise<boolean> => {
  try {
    await access(chromium.executablePath());
    return true;
  } catch {
    return false;
  }
})();

const temporaryDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirs.push(dir);
  return dir;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

type Rgba = [number, number, number, number];

const BLACK: Rgba = [0, 0, 0, 255];
const RED: Rgba = [255, 0, 0, 255];

function pngBuffer(color: Rgba): Buffer {
  const png = new PNG({ width: 2, height: 2 });
  for (let index = 0; index < 4; index += 1) {
    png.data[index * 4] = color[0];
    png.data[index * 4 + 1] = color[1];
    png.data[index * 4 + 2] = color[2];
    png.data[index * 4 + 3] = color[3];
  }
  return PNG.sync.write(png);
}

async function sha256(file: string): Promise<string> {
  return `sha256:${createHash("sha256").update(await readFile(file)).digest("hex")}`;
}

interface FakeCaptureOptions {
  colorFor?: (caseId: string) => Rgba;
  failFor?: (caseId: string) => boolean;
  removeFileFor?: (caseId: string) => boolean;
}

function fakeCapture(options: FakeCaptureOptions = {}) {
  return async (
    input: CaptureVisualCasesInput
  ): Promise<ScreenshotEvidence[]> => {
    await mkdir(input.outDir, { recursive: true });
    const results: ScreenshotEvidence[] = [];
    for (const visualCase of input.cases) {
      if (options.failFor?.(visualCase.id)) {
        input.onCaseError?.(visualCase.id, new Error(`capture failed: ${visualCase.id}`));
        continue;
      }
      const file = path.join(input.outDir, `${visualCase.id}.png`);
      await writeFile(file, pngBuffer(options.colorFor?.(visualCase.id) ?? BLACK));
      const fileSha = await sha256(file);
      if (options.removeFileFor?.(visualCase.id)) {
        await rm(file, { force: true });
      }
      results.push({
        caseId: visualCase.id,
        path: file,
        sha256: fileSha,
        consoleErrors: 0,
        overflow: false,
      });
    }
    return results;
  };
}

function pageSpec(pageId: string, extra: Record<string, unknown> = {}) {
  return {
    meta: {
      pageId,
      project: "employee-app-phase2",
      name: pageId,
      target: "mobile",
      profile: "b-mobile",
      archetype: "detail",
      purpose: `${pageId} fixture`,
      route: `/${pageId}`,
      roles: ["staff"],
      reqRefs: ["REQ-APP-001"],
      version: "0.1.0",
    },
    layout: { type: "MobileShell" },
    states: { default: { name: "default" } },
    interactions: [],
    traceability: { reqMap: {}, designDefaults: [], unmapped: [] },
    ...extra,
  };
}

interface Fixture {
  root: string;
  projectPath: string;
  specRunDir: string;
  htmlDir: string;
  baselineDir: string;
  runsDir: string;
  fixturesDir: string;
}

async function makeFixture(): Promise<Fixture> {
  const root = await tempDir("prd-ui-visual-cli-");
  const projectDir = path.join(root, "project");
  await mkdir(projectDir, { recursive: true });
  await writeFile(
    path.join(projectDir, "ui-brief.json"),
    await readFile(sampleBrief, "utf8"),
    "utf8"
  );
  await writeFile(
    path.join(projectDir, "project.yaml"),
    "project: employee-app-phase2\nbrief: ui-brief.json\nmanifests: {}\n",
    "utf8"
  );

  const specRunDir = path.join(root, "spec-run");
  await writeJson(
    path.join(specRunDir, "artifacts", "page-spec", "today.json"),
    pageSpec("today")
  );
  await writeJson(
    path.join(specRunDir, "artifacts", "page-spec", "appointment-list.json"),
    pageSpec("appointment-list", {
      views: ["calendar", "list"],
      defaultView: "calendar",
    })
  );

  const htmlDir = path.join(root, "html");
  await mkdir(htmlDir, { recursive: true });
  for (const pageId of ["today", "appointment-list"]) {
    await writeFile(
      path.join(htmlDir, `${pageId}.html`),
      `<!doctype html><html><head><meta charset="utf-8"><title>${pageId}</title></head><body><div>${pageId}</div></body></html>`,
      "utf8"
    );
  }
  await writeFile(path.join(htmlDir, "index.html"), "<!doctype html><title>index</title>", "utf8");

  return {
    root,
    projectPath: path.join(projectDir, "project.yaml"),
    specRunDir,
    htmlDir,
    baselineDir: path.join(root, "baseline"),
    runsDir: path.join(root, "runs"),
    fixturesDir: path.join(root, "fixtures"),
  };
}

async function writeCriticFixture(
  dir: string,
  output: {
    verdict: "pass" | "changes";
    findings: Array<{
      id: string;
      severity: "blocker" | "major" | "minor";
      pageId: string;
      state: string;
      evidence: string;
      issue: string;
      proposal: string;
    }>;
    summary: string;
  } = { verdict: "pass", findings: [], summary: "No visual blockers." }
): Promise<void> {
  await writeJson(path.join(dir, "visual-critic.json"), {
    output,
    usage: {
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      totalTokens: 120,
    },
    usageComplete: true,
  });
}

async function runCli(
  main: (
    argv: string[],
    io: { stdout: (line: string) => void; stderr: (line: string) => void }
  ) => Promise<number>,
  args: string[],
  deps?: unknown
): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const run = main as unknown as (
    argv: string[],
    io: { stdout: (line: string) => void; stderr: (line: string) => void },
    deps?: unknown
  ) => Promise<number>;
  const code = await run(
    args,
    {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    },
    deps
  );
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

function baselineArgs(fixture: Fixture): string[] {
  return [
    "--project",
    fixture.projectPath,
    "--spec-run",
    fixture.specRunDir,
    "--html",
    fixture.htmlDir,
    "--out",
    fixture.baselineDir,
    "--json",
  ];
}

function reviewArgs(fixture: Fixture, extra: string[] = []): string[] {
  return [
    "--project",
    fixture.projectPath,
    "--spec-run",
    fixture.specRunDir,
    "--html",
    fixture.htmlDir,
    "--baseline",
    fixture.baselineDir,
    "--runs",
    fixture.runsDir,
    "--runtime",
    "standalone",
    "--fixtures",
    fixture.fixturesDir,
    "--json",
    ...extra,
  ];
}

async function onlyRunDir(runsDir: string): Promise<string> {
  const entries = await readdir(runsDir, { withFileTypes: true });
  const runs = entries.filter(
    (entry) => entry.isDirectory() && entry.name.startsWith("run-")
  );
  expect(runs).toHaveLength(1);
  return path.join(runsDir, runs[0]!.name);
}

async function runDirs(runsDir: string): Promise<string[]> {
  const entries = await readdir(runsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("run-"))
    .map((entry) => path.join(runsDir, entry.name));
}

interface ReviewArtifact {
  status: string;
  cases: number;
  screenshots: number;
  diff: { passed: number; failed: number; missing: number };
  findings: Array<{ id: string; code: string; severity: string; message: string }>;
  costCny: number;
  usageComplete: boolean;
  manifestHash: string;
  findingsHash: string;
  critic?: {
    runtime?: string;
    profile?: string;
    model?: string;
    budgetEnforced?: boolean;
    costSource?: string;
  };
  signoff?: {
    valid: boolean;
    signer?: string;
    date?: string;
    waivedFindings?: string[];
  };
  error?: string;
}

interface FakeCriticOptions {
  output?: unknown;
  usage?: AgentUsage;
  usageComplete?: boolean;
  error?: Error;
  bypassValidation?: boolean;
  repairAttempted?: boolean;
}

function fakeCriticRunner(options: FakeCriticOptions = {}) {
  const calls: AgentTask[] = [];
  const output =
    options.output ?? { verdict: "pass", findings: [], summary: "No blockers." };
  return {
    calls,
    create: async (): Promise<AgentRunnerPort> => ({
      name: "fake-dsh",
      model: "mock-visual",
      run: async (task: AgentTask): Promise<AgentResult> => {
        calls.push(task);
        if (options.error !== undefined) throw options.error;
        let validated: { success: true; data: unknown };
        if (options.bypassValidation === true) {
          validated = { success: true, data: output };
        } else {
          const checked = task.validate(output);
          if (!checked.success) {
            throw new AgentRunnerError("AGENT_INVALID_OUTPUT", checked.error);
          }
          validated = { success: true, data: checked.data };
        }
        return {
          output: validated.data,
          usageComplete: options.usageComplete ?? options.usage !== undefined,
          model: "mock-visual",
          ...(options.repairAttempted === true ? { repairAttempted: true } : {}),
          ...(options.usage === undefined ? {} : { usage: options.usage }),
        };
      },
    }),
  };
}

async function signoffText(hashes: {
  manifestHash: string;
  findingsHash: string;
  waivers?: Array<{
    findingId: string;
    owner: string;
    reason: string;
    expires: string;
  }>;
}): Promise<string> {
  return `# Visual signoff

<!-- signoff
${JSON.stringify({
  signer: "Sample Reviewer",
  date: "2026-10-22",
  manifestHash: hashes.manifestHash,
  findingsHash: hashes.findingsHash,
  waivers: hashes.waivers ?? [],
})}
-->
`;
}

describe("visual review CLI arguments", () => {
  it("defaults the critic timeout to 900000ms and accepts an override", () => {
    expect(parseReviewArgs(["--runtime", "dsh", "--profile", "prd-ui-visual"]).criticTimeoutMs).toBe(
      900_000
    );
    expect(
      parseReviewArgs(["--critic-timeout-ms", "1200000"]).criticTimeoutMs
    ).toBe(1_200_000);
  });
});

describe("visual CLIs", () => {
  it("creates a deterministic baseline manifest", async () => {
    const fixture = await makeFixture();
    const result = await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });

    expect(result.code).toBe(0);
    const summary = JSON.parse(result.stdout) as {
      status: string;
      cases: number;
      screenshots: number;
      manifestHash: string;
    };
    expect(summary.status).toBe("passed");
    expect(summary.cases).toBe(4);
    expect(summary.screenshots).toBe(4);
    expect(summary.manifestHash).toMatch(/^sha256:/);

    const manifest = await readJson<{
      schemaVersion: string;
      project: string;
      cases: Array<{
        id: string;
        query?: Record<string, string>;
        file: string;
        sha256: string;
      }>;
    }>(path.join(fixture.baselineDir, "manifest.json"));
    expect(manifest.schemaVersion).toBe("1.0");
    expect(manifest.project).toBe("employee-app-phase2");
    expect(manifest.cases).toHaveLength(4);
    expect(manifest.cases.map((entry) => entry.id)).toEqual([
      "today.default",
      "appointment-list.default",
      "appointment-list.view.list",
      "appointment-list.drawer",
    ]);
    expect(
      manifest.cases.find((entry) => entry.id === "appointment-list.drawer")?.query
    ).toEqual({ view: "calendar" });
    for (const entry of manifest.cases) {
      expect(entry.sha256).toMatch(/^sha256:/);
      await expect(stat(path.join(fixture.baselineDir, entry.file))).resolves.toBeTruthy();
    }
  });

  it("reviews against the baseline, signs, and reuses a matching signoff", async () => {
    const fixture = await makeFixture();
    await writeCriticFixture(fixture.fixturesDir);
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });

    const review = await runCli(reviewMain, reviewArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("awaiting_signoff");
    expect(artifact.cases).toBe(4);
    expect(artifact.screenshots).toBe(4);
    expect(artifact.diff).toEqual({ passed: 4, failed: 0, missing: 0 });
    expect(artifact.findings).toEqual([]);
    expect(artifact.costCny).toBe(0);
    expect(artifact.usageComplete).toBe(true);
    expect(artifact.manifestHash).toMatch(/^sha256:/);
    expect(artifact.findingsHash).toMatch(/^sha256:/);
    expect(artifact.critic?.budgetEnforced).toBe(false);
    expect(artifact.critic?.costSource).toBe("scripted-placeholder");

    await expect(
      stat(path.join(runDir, "screenshots", "manifest.json"))
    ).resolves.toBeTruthy();
    await expect(
      stat(path.join(runDir, "findings", "visual-gate.json"))
    ).resolves.toBeTruthy();
    await expect(
      stat(path.join(runDir, "findings", "visual-critic.json"))
    ).resolves.toBeTruthy();
    await expect(stat(path.join(runDir, "logs", "visual.ndjson"))).resolves.toBeTruthy();
    expect(
      (await readdir(path.join(runDir, "diff"))).filter((file) => file.endsWith(".png"))
    ).toHaveLength(4);

    const signoffFile = path.join(fixture.root, "signoff-visual.md");
    await writeFile(
      signoffFile,
      await signoffText({
        manifestHash: artifact.manifestHash,
        findingsHash: artifact.findingsHash,
      }),
      "utf8"
    );
    const signed = await runCli(signMain, ["--run", runDir, "--signoff-visual", signoffFile, "--json"]);
    expect(signed.code).toBe(0);
    const state = await readJson<{ status: string; signoff: { visual: boolean } }>(
      path.join(runDir, "state.json")
    );
    expect(state.status).toBe("success");
    expect(state.signoff.visual).toBe(true);
    await expect(
      readFile(path.join(runDir, "signoff", "visual.md"), "utf8")
    ).resolves.toContain("Sample Reviewer");
    const signedArtifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(signedArtifact.status).toBe("passed");

    const rerun = await runCli(reviewMain, reviewArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });
    expect(rerun.code).toBe(0);
    const runs = await runDirs(fixture.runsDir);
    expect(runs).toHaveLength(2);
    const rerunDir = runs.find((entry) => entry !== runDir);
    expect(rerunDir).toBeDefined();
    const rerunArtifact = await readJson<ReviewArtifact>(
      path.join(rerunDir!, "visual-review.json")
    );
    expect(rerunArtifact.status).toBe("passed");
    expect(rerunArtifact.manifestHash).toBe(artifact.manifestHash);
    expect(rerunArtifact.findingsHash).toBe(artifact.findingsHash);
    await expect(
      stat(path.join(rerunDir!, "signoff", "visual.md"))
    ).resolves.toBeTruthy();

    // The terminated (success) early-return path must still verify evidence.
    await writeFile(
      path.join(runDir, "screenshots", "today.default.png"),
      pngBuffer(RED)
    );
    const tampered = await runCli(signMain, ["--run", runDir, "--json"]);
    expect(tampered.code).toBe(1);
    expect(tampered.stdout).toContain("VISUAL_MANIFEST_HASH_MISMATCH");
  });

  it("blocks when a baseline screenshot is missing", async () => {
    const fixture = await makeFixture();
    await writeCriticFixture(fixture.fixturesDir);
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });
    await rm(path.join(fixture.baselineDir, "today.default.png"));

    const review = await runCli(reviewMain, reviewArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("blocked");
    expect(artifact.diff.missing).toBe(1);
    expect(artifact.findings.map((finding) => finding.id)).toContain(
      "VISUAL_BASELINE_MISSING:today.default"
    );
  });

  it("rejects baseline manifest paths that escape the baseline directory", async () => {
    for (const unsafe of ["../evil.png", "/tmp/evil.png"]) {
      const fixture = await makeFixture();
      await writeCriticFixture(fixture.fixturesDir);
      await runCli(baselineMain, baselineArgs(fixture), {
        captureVisualCases: fakeCapture(),
      });
      const manifestFile = path.join(fixture.baselineDir, "manifest.json");
      const manifest = await readJson<{ cases: Array<{ file: string }> }>(
        manifestFile
      );
      manifest.cases[0]!.file = unsafe;
      await writeJson(manifestFile, manifest);

      const review = await runCli(reviewMain, reviewArgs(fixture), {
        captureVisualCases: fakeCapture(),
      });
      expect(review.code).toBe(1);
      const runDir = await onlyRunDir(fixture.runsDir);
      const artifact = await readJson<ReviewArtifact>(
        path.join(runDir, "visual-review.json")
      );
      expect(artifact.status).toBe("blocked");
      expect(artifact.findings.map((finding) => finding.code)).toContain(
        "VISUAL_BASELINE_MANIFEST_INVALID"
      );
    }
  });

  it("blocks a baseline whose PNG does not match its manifest hash", async () => {
    const fixture = await makeFixture();
    await writeCriticFixture(fixture.fixturesDir);
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });
    await writeFile(
      path.join(fixture.baselineDir, "today.default.png"),
      pngBuffer(RED)
    );

    const review = await runCli(reviewMain, reviewArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("blocked");
    expect(artifact.diff.missing).toBe(1);
    expect(artifact.findings.map((finding) => finding.code)).toContain(
      "VISUAL_BASELINE_HASH_MISMATCH"
    );
  });

  it("leaves the previous baseline usable when an update fails mid-commit", async () => {
    const fixture = await makeFixture();
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });
    const manifestFile = path.join(fixture.baselineDir, "manifest.json");
    const beforeManifest = await readFile(manifestFile, "utf8");
    const before = await readJson<{
      cases: Array<{ id: string; file: string; sha256: string }>;
    }>(manifestFile);
    const beforeHashes = new Map(
      await Promise.all(
        before.cases.map(async (entry) => [
          entry.file,
          await sha256(path.join(fixture.baselineDir, entry.file)),
        ] as const)
      )
    );

    const result = await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture({
        colorFor: () => RED,
        removeFileFor: (caseId) => caseId === "appointment-list.drawer",
      }),
    });
    expect(result.code).toBe(1);

    expect(await readFile(manifestFile, "utf8")).toBe(beforeManifest);
    for (const entry of before.cases) {
      expect(
        await sha256(path.join(fixture.baselineDir, entry.file))
      ).toBe(beforeHashes.get(entry.file));
    }
    expect(
      (await readdir(fixture.baselineDir)).filter((name) => name.startsWith("."))
    ).toEqual([]);
  });

  it("maps capture failures to VISUAL_SCREENSHOT_FAILED", async () => {
    const fixture = await makeFixture();
    await writeCriticFixture(fixture.fixturesDir);
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });

    const review = await runCli(reviewMain, reviewArgs(fixture), {
      captureVisualCases: fakeCapture({
        failFor: (caseId) => caseId === "today.default",
      }),
    });
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("blocked");
    expect(artifact.screenshots).toBe(3);
    const codes = artifact.findings.map((finding) => finding.code);
    expect(codes).toContain("VISUAL_SCREENSHOT_FAILED");
    expect(codes).toContain("VISUAL_SCREENSHOT_MISSING");
  });

  it("returns a complete JSON summary on failure", async () => {
    const fixture = await makeFixture();
    const review = await runCli(
      reviewMain,
      [
        ...reviewArgs(fixture),
        "--html",
        path.join(fixture.root, "missing-html"),
      ],
      { captureVisualCases: fakeCapture() }
    );
    expect(review.code).toBe(1);
    const summary = JSON.parse(review.stdout) as Record<string, unknown>;
    expect(summary.status).toBe("blocked");
    expect(summary.cases).toBe(4);
    expect(summary.screenshots).toBe(0);
    expect(summary.diff).toEqual({ passed: 0, failed: 0, missing: 0 });
    expect(Array.isArray(summary.findings)).toBe(true);
    expect(summary.costCny).toBe(0);
    expect(summary.usageComplete).toBe(false);
  });

  it("blocks a baseline-less review for every matrix case", async () => {
    const fixture = await makeFixture();
    await writeCriticFixture(fixture.fixturesDir);

    const review = await runCli(reviewMain, reviewArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("blocked");
    const missing = artifact.findings.filter(
      (finding) => finding.code === "VISUAL_BASELINE_MISSING"
    );
    expect(missing).toHaveLength(4);
    expect(artifact.findings.map((finding) => finding.code)).toContain(
      "VISUAL_BASELINE_MANIFEST_MISSING"
    );

    // Deterministic blockers are not waivable, even with a matching hash.
    const signoffFile = path.join(fixture.root, "signoff-deterministic.md");
    await writeFile(
      signoffFile,
      await signoffText({
        manifestHash: artifact.manifestHash,
        findingsHash: artifact.findingsHash,
        waivers: [
          {
            findingId: "VISUAL_BASELINE_MISSING:today.default",
            owner: "design-owner",
            reason: "Should still be rejected.",
            expires: "2099-12-31",
          },
        ],
      }),
      "utf8"
    );
    const rejected = await runCli(signMain, [
      "--run",
      runDir,
      "--signoff-visual",
      signoffFile,
      "--json",
    ]);
    expect(rejected.code).toBe(1);
    expect(rejected.stdout).toContain("VISUAL_WAIVER_NOT_ALLOWED");
  });

  it("blocks a diff above one percent", async () => {
    const fixture = await makeFixture();
    await writeCriticFixture(fixture.fixturesDir);
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });

    const review = await runCli(reviewMain, reviewArgs(fixture), {
      captureVisualCases: fakeCapture({
        colorFor: (caseId) => (caseId === "today.default" ? RED : BLACK),
      }),
    });
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("blocked");
    expect(artifact.diff.failed).toBe(1);
    expect(artifact.findings.map((finding) => finding.code)).toContain(
      "VISUAL_DIFF_EXCEEDED"
    );
    await expect(
      stat(path.join(runDir, "diff", "today.default.png"))
    ).resolves.toBeTruthy();
  });

  it("requires a current waiver for critic blockers and rejects stale hashes", async () => {
    const fixture = await makeFixture();
    await writeCriticFixture(fixture.fixturesDir, {
      verdict: "changes",
      findings: [
        {
          id: "VC-001",
          severity: "blocker",
          pageId: "today",
          state: "default",
          evidence: "screenshots/today.default.png",
          issue: "The primary action is below the fold.",
          proposal: "Move the primary action into the fixed bottom bar.",
        },
      ],
      summary: "One blocking hierarchy issue.",
    });
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });

    const review = await runCli(reviewMain, reviewArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("blocked");
    expect(artifact.findings.map((finding) => finding.code)).toContain(
      "VISUAL_CRITIC_BLOCKER"
    );

    const unwaived = path.join(fixture.root, "signoff-unwaived.md");
    await writeFile(
      unwaived,
      await signoffText({
        manifestHash: artifact.manifestHash,
        findingsHash: artifact.findingsHash,
      }),
      "utf8"
    );
    const rejected = await runCli(signMain, [
      "--run",
      runDir,
      "--signoff-visual",
      unwaived,
      "--json",
    ]);
    expect(rejected.code).toBe(1);
    expect(rejected.stdout).toContain("VISUAL_BLOCKER_UNWAIVED");

    const stale = path.join(fixture.root, "signoff-stale.md");
    await writeFile(
      stale,
      await signoffText({
        manifestHash: "sha256:stale",
        findingsHash: artifact.findingsHash,
      }),
      "utf8"
    );
    const staleResult = await runCli(signMain, [
      "--run",
      runDir,
      "--signoff-visual",
      stale,
      "--json",
    ]);
    expect(staleResult.code).toBe(1);
    expect(staleResult.stdout).toContain("VISUAL_SIGNOFF_STALE");

    const waived = path.join(fixture.root, "signoff-waived.md");
    await writeFile(
      waived,
      await signoffText({
        manifestHash: artifact.manifestHash,
        findingsHash: artifact.findingsHash,
        waivers: [
          {
            findingId: "VC-001",
            owner: "design-owner",
            reason: "Accepted for the v0.4 slice.",
            expires: "2099-12-31",
          },
        ],
      }),
      "utf8"
    );
    const accepted = await runCli(signMain, [
      "--run",
      runDir,
      "--signoff-visual",
      waived,
      "--json",
    ]);
    expect(accepted.code).toBe(0);
    const state = await readJson<{ status: string }>(
      path.join(runDir, "state.json")
    );
    expect(state.status).toBe("success");

    const signedGate = await readJson<{
      gate: { passed: boolean };
      waivedFindings: string[];
      unwaivedGate: { passed: boolean; blockers: unknown[] };
    }>(path.join(runDir, "findings", "visual-gate.json"));
    expect(signedGate.gate.passed).toBe(false);
    expect(signedGate.waivedFindings).toEqual(["VC-001"]);
    expect(signedGate.unwaivedGate).toEqual({ passed: true, blockers: [] });

    // A re-review whose critic blocker is covered by that signoff passes; the
    // waived blocker stays in the recorded findings.
    const rerun = await runCli(reviewMain, reviewArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });
    expect(rerun.code).toBe(0);
    const rerunDir = (await runDirs(fixture.runsDir)).find(
      (entry) => entry !== runDir
    );
    expect(rerunDir).toBeDefined();
    const rerunArtifact = await readJson<ReviewArtifact>(
      path.join(rerunDir!, "visual-review.json")
    );
    expect(rerunArtifact.status).toBe("passed");
    expect(rerunArtifact.signoff).toMatchObject({
      valid: true,
      waivedFindings: ["VC-001"],
    });
    expect(rerunArtifact.findings.map((finding) => finding.code)).toContain(
      "VISUAL_CRITIC_BLOCKER"
    );
    const rerunGate = await readJson<{
      gate: { passed: boolean };
      waivedFindings: string[];
      unwaivedGate: { passed: boolean; blockers: unknown[] };
    }>(path.join(rerunDir!, "findings", "visual-gate.json"));
    expect(rerunGate.gate.passed).toBe(false);
    expect(rerunGate.waivedFindings).toEqual(["VC-001"]);
    expect(rerunGate.unwaivedGate).toEqual({ passed: true, blockers: [] });
    const rerunState = await readJson<{ status: string; signoff: { visual: boolean } }>(
      path.join(rerunDir!, "state.json")
    );
    expect(rerunState.status).toBe("passed");
    expect(rerunState.signoff.visual).toBe(true);
  });

  it("runs the dsh critic with pricing and budget enforcement", async () => {
    const fixture = await makeFixture();
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });

    const missingProfile = await runCli(
      reviewMain,
      [...reviewArgs(fixture), "--runtime", "dsh"],
      { captureVisualCases: fakeCapture() }
    );
    expect(missingProfile.code).toBe(2);
    expect(missingProfile.stderr).toContain("--profile");

    const critic = fakeCriticRunner({
      usage: {
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadTokens: 0,
        totalTokens: 1200,
      },
      usageComplete: true,
    });
    const review = await runCli(
      reviewMain,
      [...reviewArgs(fixture), "--runtime", "dsh", "--profile", "prd-ui-visual"],
      { captureVisualCases: fakeCapture(), createCriticRunner: critic.create }
    );
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("awaiting_signoff");
    expect(artifact.findings).toEqual([]);
    expect(artifact.usageComplete).toBe(true);
    expect(artifact.costCny).toBeGreaterThan(0);
    expect(artifact.critic).toMatchObject({
      runtime: "dsh",
      profile: "prd-ui-visual",
      model: "mock-visual",
      budgetEnforced: true,
      costSource: "pricing",
    });

    const task = critic.calls[0]!;
    expect(task.role).toBe("visual-critic");
    expect(task.prompt).toContain("Visual Critic");
    expect(task.prompt).toContain("screenshots/today.default.png");
    expect(task.prompt).toContain("read_image");
    expect(task.prompt).toContain(runDir);
    expect(task.prompt).toContain(
      path.join(runDir, "screenshots", "today.default.png")
    );
    expect(task.prompt).toContain('"profile": "b-mobile"');
    expect(task.prompt).not.toContain('"profile": "prd-ui-visual"');
    expect(task.inputFiles).toHaveLength(4);
    for (const file of task.inputFiles) {
      expect(path.isAbsolute(file)).toBe(true);
      await expect(stat(file)).resolves.toBeTruthy();
    }
    expect(task.maxCostCny).toBe(3);
    expect(
      task.canRepair?.({
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadTokens: 0,
      })
    ).toBe(true);
    expect(
      task.canRepair?.({
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 0,
      })
    ).toBe(false);
    expect(task.canRepair?.(undefined)).toBe(false);

    const criticArtifact = await readJson<{
      runtime: string;
      profile: string;
      model: string;
      usageComplete: boolean;
      usage: AgentUsage;
      costCny: number;
      costSource: string;
      budgetEnforced: boolean;
      critique: unknown;
      error: null;
    }>(path.join(runDir, "findings", "visual-critic.json"));
    expect(criticArtifact.runtime).toBe("dsh");
    expect(criticArtifact.profile).toBe("prd-ui-visual");
    expect(criticArtifact.model).toBe("mock-visual");
    expect(criticArtifact.usageComplete).toBe(true);
    expect(criticArtifact.usage.totalTokens).toBe(1200);
    expect(criticArtifact.costCny).toBeGreaterThan(0);
    expect(criticArtifact.costSource).toBe("pricing");
    expect(criticArtifact.budgetEnforced).toBe(true);
    expect(criticArtifact.critique).toEqual({
      verdict: "pass",
      findings: [],
      summary: "No blockers.",
    });
    expect(criticArtifact.error).toBeNull();
  });

  it("blocks when a dsh critique exceeds the cost budget", async () => {
    const fixture = await makeFixture();
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });

    const critic = fakeCriticRunner({
      usage: {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 0,
      },
      usageComplete: true,
    });
    const review = await runCli(
      reviewMain,
      [...reviewArgs(fixture), "--runtime", "dsh", "--profile", "prd-ui-visual"],
      { captureVisualCases: fakeCapture(), createCriticRunner: critic.create }
    );
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("blocked");
    expect(artifact.costCny).toBeGreaterThan(3);
    expect(artifact.usageComplete).toBe(true);
    expect(artifact.findings.map((finding) => finding.code)).toContain(
      "VISUAL_CRITIC_BUDGET_EXCEEDED"
    );
  });

  it("blocks a dsh critique with incomplete usage", async () => {
    const fixture = await makeFixture();
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });

    const critic = fakeCriticRunner({ usageComplete: false });
    const review = await runCli(
      reviewMain,
      [...reviewArgs(fixture), "--runtime", "dsh", "--profile", "prd-ui-visual"],
      { captureVisualCases: fakeCapture(), createCriticRunner: critic.create }
    );
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("blocked");
    expect(artifact.usageComplete).toBe(false);
    expect(artifact.costCny).toBe(0);
    expect(artifact.findings.map((finding) => finding.code)).toContain(
      "VISUAL_USAGE_INCOMPLETE"
    );
  });

  it("keeps deterministic results when the dsh critic is unavailable", async () => {
    const fixture = await makeFixture();
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });

    const critic = fakeCriticRunner({
      error: new AgentRunnerError(
        "AGENT_EXIT_NONZERO",
        "MODEL_OFFLINE: mock critic failure"
      ),
    });
    const review = await runCli(
      reviewMain,
      [...reviewArgs(fixture), "--runtime", "dsh", "--profile", "prd-ui-visual"],
      { captureVisualCases: fakeCapture(), createCriticRunner: critic.create }
    );
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("blocked");
    expect(artifact.usageComplete).toBe(false);
    expect(artifact.findings.map((finding) => finding.code)).toContain(
      "VISUAL_CRITIC_UNAVAILABLE"
    );
    expect(artifact.error).toBeUndefined();
    const criticArtifact = await readJson<{ error: string }>(
      path.join(runDir, "findings", "visual-critic.json")
    );
    expect(criticArtifact.error).toContain("MODEL_OFFLINE");
  });

  it("blocks an inconsistent dsh critique (changes without findings)", async () => {
    const fixture = await makeFixture();
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });

    const critic = fakeCriticRunner({
      output: { verdict: "changes", findings: [], summary: "Looks wrong." },
      usage: {
        inputTokens: 1000,
        outputTokens: 100,
        cacheReadTokens: 0,
      },
      usageComplete: true,
    });
    const review = await runCli(
      reviewMain,
      [...reviewArgs(fixture), "--runtime", "dsh", "--profile", "prd-ui-visual"],
      { captureVisualCases: fakeCapture(), createCriticRunner: critic.create }
    );
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("blocked");
    expect(artifact.findings.map((finding) => finding.code)).toContain(
      "VISUAL_CRITIC_INCONSISTENT"
    );
  });

  it("accepts a repaired dsh critic output and records the repair", async () => {
    const fixture = await makeFixture();
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });

    const usage: AgentUsage = {
      inputTokens: 2500,
      outputTokens: 600,
      cacheReadTokens: 100,
    };
    const critic = fakeCriticRunner({
      usage,
      usageComplete: true,
      repairAttempted: true,
    });
    const review = await runCli(
      reviewMain,
      [...reviewArgs(fixture), "--runtime", "dsh", "--profile", "prd-ui-visual"],
      { captureVisualCases: fakeCapture(), createCriticRunner: critic.create }
    );
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("awaiting_signoff");
    expect(artifact.usageComplete).toBe(true);
    expect(artifact.costCny).toBeGreaterThan(0);
    const evidence = await readJson<{
      repairAttempted: boolean;
      usageComplete: boolean;
      usage: AgentUsage;
    }>(path.join(runDir, "dsh", "visual-critic", "result.json"));
    expect(evidence.repairAttempted).toBe(true);
    expect(evidence.usageComplete).toBe(true);
    expect(evidence.usage).toEqual(usage);
  });

  it("keeps deterministic evidence when the dsh output is unparseable", async () => {
    const fixture = await makeFixture();
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });

    const critic = fakeCriticRunner({
      output: { verdict: "pass" },
      bypassValidation: true,
      usage: {
        inputTokens: 1000,
        outputTokens: 100,
        cacheReadTokens: 0,
      },
      usageComplete: true,
    });
    const review = await runCli(
      reviewMain,
      [...reviewArgs(fixture), "--runtime", "dsh", "--profile", "prd-ui-visual"],
      { captureVisualCases: fakeCapture(), createCriticRunner: critic.create }
    );
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("blocked");
    expect(artifact.findings.map((finding) => finding.code)).toContain(
      "VISUAL_CRITIC_UNAVAILABLE"
    );
    const criticArtifact = await readJson<{
      error: string;
      model: string | null;
      usageComplete: boolean;
      costCny: number;
    }>(path.join(runDir, "findings", "visual-critic.json"));
    expect(criticArtifact.error).toContain("VISUAL_CRITIQUE_INVALID");
    expect(criticArtifact.model).toBe("mock-visual");
    expect(criticArtifact.usageComplete).toBe(true);
    expect(criticArtifact.costCny).toBeGreaterThan(0);
  });

  it("does not record the dsh profile as the model when runner setup fails", async () => {
    const fixture = await makeFixture();
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });

    const review = await runCli(
      reviewMain,
      [...reviewArgs(fixture), "--runtime", "dsh", "--profile", "prd-ui-visual"],
      {
        captureVisualCases: fakeCapture(),
        createCriticRunner: async () => {
          throw new Error("CONFIGURATION_ERROR: missing PRD_UI_VISION_API_KEY");
        },
      }
    );
    expect(review.code).toBe(1);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("blocked");
    expect(artifact.findings.map((finding) => finding.code)).toContain(
      "VISUAL_CRITIC_UNAVAILABLE"
    );
    const criticArtifact = await readJson<{
      model: string | null;
      error: string;
      costCny: number;
    }>(path.join(runDir, "findings", "visual-critic.json"));
    expect(criticArtifact.model).toBeNull();
    expect(criticArtifact.error).toContain("CONFIGURATION_ERROR");
    expect(criticArtifact.costCny).toBe(0);
  });

  it("fails closed without a model name when pricing cannot be loaded", async () => {
    const fixture = await makeFixture();
    await runCli(baselineMain, baselineArgs(fixture), {
      captureVisualCases: fakeCapture(),
    });

    const critic = fakeCriticRunner();
    const review = await runCli(
      reviewMain,
      [...reviewArgs(fixture), "--runtime", "dsh", "--profile", "prd-ui-visual"],
      {
        captureVisualCases: fakeCapture(),
        createCriticRunner: critic.create,
        loadPricing: async () => {
          throw new Error("INVALID_PRICING: missing pricing.json");
        },
      }
    );
    expect(review.code).toBe(1);
    expect(critic.calls).toHaveLength(0);
    const runDir = await onlyRunDir(fixture.runsDir);
    const artifact = await readJson<ReviewArtifact>(
      path.join(runDir, "visual-review.json")
    );
    expect(artifact.status).toBe("blocked");
    expect(artifact.findings.map((finding) => finding.code)).toContain(
      "VISUAL_CRITIC_UNAVAILABLE"
    );
    const criticArtifact = await readJson<{
      model: string | null;
      error: string;
      costSource: string;
      budgetEnforced: boolean;
    }>(path.join(runDir, "findings", "visual-critic.json"));
    expect(criticArtifact.model).toBeNull();
    expect(criticArtifact.error).toContain("INVALID_PRICING");
    expect(criticArtifact.costSource).toBe("unavailable");
    expect(criticArtifact.budgetEnforced).toBe(true);
  });

  it.skipIf(!hasChromium)("captures deterministic screenshots with animations disabled", async () => {
    const root = await tempDir("prd-ui-visual-capture-");
    const htmlDir = path.join(root, "html");
    await mkdir(htmlDir, { recursive: true });
    await writeFile(
      path.join(htmlDir, "fixture.html"),
      `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
html,body{margin:0;background:#fff;}
.box{width:20px;height:20px;background:#123456;animation:pulse 1s infinite;}
.slide{animation:slide 500ms ease-out forwards;}
@keyframes pulse{50%{opacity:.2}}
@keyframes slide{from{transform:translateX(10px)}to{transform:none}}
</style>
</head>
<body><div class="box"></div><div class="slide">内容</div></body>
</html>`,
      "utf8"
    );

    const evidence = await captureVisualCases({
      htmlDir,
      outDir: path.join(root, "out"),
      cases: [
        {
          id: "fixture.a",
          pageId: "fixture",
          state: "default",
          viewport: { width: 120, height: 80 },
        },
        {
          id: "fixture.b",
          pageId: "fixture",
          state: "default",
          viewport: { width: 120, height: 80 },
        },
      ],
    });

    expect(evidence).toHaveLength(2);
    expect(evidence[0]?.sha256).toBe(evidence[1]?.sha256);
    expect(evidence[0]?.consoleErrors).toBe(0);
    expect(evidence[0]?.overflow).toBe(false);
    await expect(stat(evidence[0]!.path)).resolves.toBeTruthy();
  });
});
