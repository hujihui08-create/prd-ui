import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { BlockManifest, PageSpec } from "@prd-ui/contracts";
import { splitBlocks } from "@prd-ui/compiler";
import { getArchetype } from "@prd-ui/design-system";
import { main, parseArgs } from "../src/block-verify-cli.js";

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

function page(pageId: string): PageSpec {
  return {
    meta: {
      pageId,
      project: "fixture",
      name: pageId,
      target: "mobile",
      profile: "b-mobile",
      archetype: "home",
      purpose: "fixture",
      route: `/${pageId}`,
      roles: ["store_manager"],
      reqRefs: ["REQ-APPT-001"],
      version: "0.1.0",
    },
    layout: {
      type: "MobileShell",
      id: `${pageId}.page.root`,
      slots: {
        content: [
          {
            id: `${pageId}.root.content.0`,
            type: "Section",
            children: [
              { id: `${pageId}.card-a`, type: "Card", props: { title: "A" }, children: [] },
              { id: `${pageId}.card-b`, type: "Card", props: { title: "B" }, children: [] },
            ],
          },
        ],
      },
    },
    states: {
      default: { name: "default" },
      empty: { name: "empty" },
      loading: { name: "loading" },
      error: { name: "error" },
    },
    interactions: [],
    traceability: { reqMap: {}, designDefaults: [], unmapped: [] },
  } as PageSpec;
}

interface SpecRunOptions {
  pages?: PageSpec[];
  omitManifestFor?: string;
}

async function makeSpecRun(options: SpecRunOptions = {}): Promise<string> {
  const runDir = await tempDir("prd-ui-block-run-");
  for (const spec of options.pages ?? [page("today"), page("appointment-list")]) {
    await writeJson(
      path.join(runDir, "artifacts", "page-spec", `${spec.meta.pageId}.json`),
      spec
    );
    if (spec.meta.pageId !== options.omitManifestFor) {
      const manifest = splitBlocks(spec, getArchetype(spec.meta.archetype));
      await writeJson(
        path.join(runDir, "artifacts", "block-manifest", `${spec.meta.pageId}.json`),
        manifest
      );
    }
  }
  return runDir;
}

async function runCli(args: string[]): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await main(args, {
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

interface BlockVerifyPayload {
  schemaVersion: string;
  project: string;
  generatedAt: string;
  pages: Array<{
    pageId: string;
    passed: boolean;
    findings: Array<{ ruleId: string; severity: string }>;
  }>;
  summary: { passed: boolean; blockers: number };
}

describe("block:verify CLI", () => {
  it("passes when every page has a round-tripping manifest", async () => {
    const runDir = await makeSpecRun();
    const out = path.join(await tempDir("prd-ui-block-out-"), "block-verify.json");

    const result = await runCli([
      "--spec-run",
      runDir,
      "--out",
      out,
      "--json",
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout) as BlockVerifyPayload;
    expect(payload.schemaVersion).toBe("1.0");
    expect(payload.project).toBe("fixture");
    expect(payload.pages.map((entry) => entry.pageId)).toEqual([
      "appointment-list",
      "today",
    ]);
    expect(payload.pages.every((entry) => entry.passed)).toBe(true);
    expect(payload.pages.every((entry) => entry.findings.length === 0)).toBe(true);
    expect(payload.summary).toEqual({ passed: true, blockers: 0 });

    const written = JSON.parse(await readFile(out, "utf8")) as BlockVerifyPayload;
    expect(written).toEqual(payload);
  });

  it("fails closed when a page manifest is missing", async () => {
    const runDir = await makeSpecRun({ omitManifestFor: "appointment-list" });
    const out = path.join(await tempDir("prd-ui-block-out-"), "block-verify.json");

    const result = await runCli([
      "--spec-run",
      runDir,
      "--out",
      out,
      "--json",
    ]);

    expect(result.code).toBe(1);
    const payload = JSON.parse(result.stdout) as BlockVerifyPayload;
    const missing = payload.pages.find((entry) => entry.pageId === "appointment-list")!;
    expect(missing.passed).toBe(false);
    expect(missing.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "BLOCK_MANIFEST_MISSING",
        severity: "blocker",
      })
    );
    expect(payload.summary).toEqual({ passed: false, blockers: 1 });
    await expect(readFile(out, "utf8")).resolves.toContain("BLOCK_MANIFEST_MISSING");
  });

  it("reports a manifest whose blocks no longer match the page", async () => {
    const runDir = await makeSpecRun();
    const manifestFile = path.join(
      runDir,
      "artifacts",
      "block-manifest",
      "today.json"
    );
    const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as BlockManifest;
    manifest.blocks.splice(0, 1);
    await writeJson(manifestFile, manifest);

    const result = await runCli(["--spec-run", runDir, "--json"]);

    expect(result.code).toBe(1);
    const payload = JSON.parse(result.stdout) as BlockVerifyPayload;
    const today = payload.pages.find((entry) => entry.pageId === "today")!;
    expect(today.passed).toBe(false);
    expect(today.findings.some((finding) => finding.ruleId === "BLOCK_ROUNDTRIP_MISMATCH")).toBe(
      true
    );
    expect(payload.summary.blockers).toBeGreaterThan(0);
  });

  it("treats a malformed manifest as a blocker", async () => {
    const runDir = await makeSpecRun();
    await writeJson(
      path.join(runDir, "artifacts", "block-manifest", "today.json"),
      { blocks: "not-an-array" }
    );

    const result = await runCli(["--spec-run", runDir, "--json"]);

    expect(result.code).toBe(1);
    const payload = JSON.parse(result.stdout) as BlockVerifyPayload;
    const today = payload.pages.find((entry) => entry.pageId === "today")!;
    expect(today.passed).toBe(false);
    expect(today.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "BLOCK_MANIFEST_INVALID",
        severity: "blocker",
      })
    );
  });

  it("rejects a manifest from another project", async () => {
    const runDir = await makeSpecRun();
    const manifestFile = path.join(
      runDir,
      "artifacts",
      "block-manifest",
      "today.json"
    );
    const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as BlockManifest;
    manifest.project = "other-app";
    await writeJson(manifestFile, manifest);

    const result = await runCli(["--spec-run", runDir, "--json"]);

    expect(result.code).toBe(1);
    const payload = JSON.parse(result.stdout) as BlockVerifyPayload;
    const today = payload.pages.find((entry) => entry.pageId === "today")!;
    expect(today.passed).toBe(false);
    expect(today.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "BLOCK_PROJECT_MISMATCH",
        severity: "blocker",
      })
    );
  });

  it("writes the report to the run's findings directory by default", async () => {
    const runDir = await makeSpecRun();
    const result = await runCli(["--spec-run", runDir]);
    expect(result.code).toBe(0);

    const report = JSON.parse(
      await readFile(path.join(runDir, "findings", "block-verify.json"), "utf8")
    ) as BlockVerifyPayload;
    expect(report.summary).toEqual({ passed: true, blockers: 0 });
  });

  it("prints human output and validates usage", async () => {
    const runDir = await makeSpecRun();
    const human = await runCli(["--spec-run", runDir]);
    expect(human.code).toBe(0);
    expect(human.stdout).toContain("Block verify: 2 pages, 0 blockers");

    expect((await runCli(["--help"])).code).toBe(0);
    const missing = await runCli([]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("--spec-run");
    expect((await runCli(["--spec-run", runDir, "--bogus"])).code).toBe(2);
  });

  it("parses flags", () => {
    const options = parseArgs([
      "--spec-run",
      "/tmp/spec-run",
      "--out",
      "/tmp/report.json",
      "--json",
    ]);
    expect(options.specRun).toBe(path.resolve("/tmp/spec-run"));
    expect(options.out).toBe(path.resolve("/tmp/report.json"));
    expect(options.json).toBe(true);
    expect(options.help).toBe(false);
  });
});
