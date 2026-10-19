import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { PageSpec, RunState, UiBrief } from "@prd-ui/contracts";
import type { ValidationReport } from "@prd-ui/validators";
import sampleBrief from "../../../samples/ui-brief.sample.json";
import { runPhase1 } from "../src/run-phase1.js";

const samplesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../samples"
);
const sampleBriefPath = path.join(samplesDir, "ui-brief.sample.json");
const sampleProjectPath = path.join(samplesDir, "project.demo-orders.yaml");
const demoCrmProjectPath = path.join(
  samplesDir,
  "projects",
  "demo-crm",
  "project.yaml"
);
const sampleManifests: Record<string, string> = {
  "b-dense": path.join(samplesDir, "asset-manifest.b-dense.json"),
  "c-expressive": path.join(samplesDir, "asset-manifest.c-expressive.json"),
};

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}


async function writeBriefFile(
  dir: string,
  mutate: (brief: UiBrief) => void
): Promise<string> {
  const brief = structuredClone(sampleBrief) as UiBrief;
  mutate(brief);
  const filePath = path.join(dir, "brief.json");
  await writeFile(filePath, JSON.stringify(brief), "utf8");
  return filePath;
}

async function findRunDir(runsDir: string): Promise<string> {
  const entries = await readdir(runsDir, { withFileTypes: true });
  const runDirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("run-"))
    .map((entry) => entry.name);
  expect(runDirs).toHaveLength(1);
  return path.join(runsDir, runDirs[0]!);
}

describe("runPhase1", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("compiles and validates the 8-page sample brief with zero blockers", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-phase1-"));
    const result = await runPhase1({ runsDir: tmpDir });

    expect(result.passed).toBe(true);
    expect(result.pages).toBe(8);
    expect(result.blockers).toBe(0);
    expect(result.runId).toMatch(/^run-\d{4}-\d{2}-\d{2}T/);

    const runDir = path.join(tmpDir, result.runId);
    expect(result.runDir).toBe(runDir);

    const state = await readJson<RunState>(path.join(runDir, "state.json"));
    expect(state.stage).toBe("done");
    expect(state.status).toBe("success");
    expect(state.gates.brief).toBe("passed");
    expect(state.runId).toBe(result.runId);

    const pageSpecFiles = (await readdir(path.join(runDir, "artifacts", "page-spec"))).filter(
      (file) => file.endsWith(".json")
    );
    expect(pageSpecFiles).toHaveLength(8);

    const feedSpec = await readJson<PageSpec>(
      path.join(runDir, "artifacts", "page-spec", "home-feed.json")
    );
    const emptyState = (feedSpec.layout.slots?.feed ?? []).find(
      (node) => node.type === "EmptyState"
    );
    expect(emptyState?.assetRef).toBe("empty-feed");

    const reports = await readJson<ValidationReport[]>(
      path.join(runDir, "reports", "validation.json")
    );
    expect(reports).toHaveLength(8);
    expect(reports.every((report) => report.passed)).toBe(true);
    expect(reports.every((report) => report.blockers === 0)).toBe(true);

    await expect(stat(path.join(runDir, "artifacts", "ui-brief.json"))).resolves.toBeDefined();
    const log = await readFile(path.join(runDir, "logs", "run.log"), "utf8");
    expect(log).toContain(`run ${result.runId} started`);
    expect(log).toContain("compile complete: 8 page specs");
  });

  it("records a failed state and log when the brief path is missing", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-phase1-"));
    const missing = path.join(tmpDir, "missing-brief.json");

    await expect(
      runPhase1({ runsDir: tmpDir, briefPath: missing, manifests: sampleManifests })
    ).rejects.toThrow(/Invalid UI brief/);

    const runDir = await findRunDir(tmpDir);
    const state = await readJson<RunState>(path.join(runDir, "state.json"));
    expect(state.status).toBe("failed");
    expect(state.gates.brief).toBe("failed");

    const log = await readFile(path.join(runDir, "logs", "run.log"), "utf8");
    expect(log).toContain("Invalid UI brief");
    expect(log).toContain("run failed");
  });

  it("records a failed state and log when the brief schema is invalid", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-phase1-"));
    const briefPath = path.join(tmpDir, "invalid-brief.json");
    await writeFile(briefPath, JSON.stringify({ meta: {} }), "utf8");

    await expect(
      runPhase1({ runsDir: tmpDir, briefPath, manifests: sampleManifests })
    ).rejects.toThrow(/Invalid UI brief/);

    const runDir = await findRunDir(tmpDir);
    const state = await readJson<RunState>(path.join(runDir, "state.json"));
    expect(state.status).toBe("failed");
    expect(state.gates.brief).toBe("failed");

    const log = await readFile(path.join(runDir, "logs", "run.log"), "utf8");
    expect(log).toContain("Invalid UI brief");
  });

  it("rejects duplicate page ids while recording the failure", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-phase1-"));
    const briefPath = await writeBriefFile(tmpDir, (brief) => {
      brief.ia.pages.push({ ...brief.ia.pages[1]! });
    });

    await expect(
      runPhase1({ runsDir: tmpDir, briefPath, manifests: sampleManifests })
    ).rejects.toThrow(/duplicate page id/i);

    const runDir = await findRunDir(tmpDir);
    const state = await readJson<RunState>(path.join(runDir, "state.json"));
    expect(state.status).toBe("failed");
    expect(state.gates.brief).toBe("failed");
    const log = await readFile(path.join(runDir, "logs", "run.log"), "utf8");
    expect(log).toContain("duplicate page id");
  });

  it("fails the brief gate for a blocking open question", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-phase1-"));
    const briefPath = await writeBriefFile(tmpDir, (brief) => {
      brief.openQuestions.push({
        id: "Q-002",
        question: "Which layout wins?",
        blocking: true,
      });
    });

    const result = await runPhase1({
      runsDir: tmpDir,
      briefPath,
      manifests: sampleManifests,
    });
    expect(result.passed).toBe(false);
    expect(result.pages).toBe(0);
    expect(result.blockers).toBe(1);

    const state = await readJson<RunState>(path.join(result.runDir, "state.json"));
    expect(state.status).toBe("failed");
    expect(state.gates.brief).toBe("failed");

    const log = await readFile(path.join(result.runDir, "logs", "run.log"), "utf8");
    expect(log).toContain("BRIEF-BLOCKING-QUESTION");
  });

  it("fails the brief gate when requirements remain unmapped", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-phase1-"));
    const briefPath = await writeBriefFile(tmpDir, (brief) => {
      brief.traceability.unmapped = ["REQ-ORDER-009"];
    });

    const result = await runPhase1({
      runsDir: tmpDir,
      briefPath,
      manifests: sampleManifests,
    });
    expect(result.passed).toBe(false);
    expect(result.blockers).toBe(1);

    const state = await readJson<RunState>(path.join(result.runDir, "state.json"));
    expect(state.status).toBe("failed");
    expect(state.gates.brief).toBe("failed");

    const log = await readFile(path.join(result.runDir, "logs", "run.log"), "utf8");
    expect(log).toContain("BRIEF-UNMAPPED");
  });

  it("fails the brief gate when a page reqRef is missing from the reqMap", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-phase1-"));
    const briefPath = await writeBriefFile(tmpDir, (brief) => {
      brief.ia.pages[0]!.reqRefs = ["REQ-ORDER-999"];
    });

    const result = await runPhase1({
      runsDir: tmpDir,
      briefPath,
      manifests: sampleManifests,
    });
    expect(result.passed).toBe(false);
    expect(result.blockers).toBe(1);

    const log = await readFile(path.join(result.runDir, "logs", "run.log"), "utf8");
    expect(log).toContain("BRIEF-REQ-UNMAPPED");

    const state = await readJson<RunState>(path.join(result.runDir, "state.json"));
    expect(state.gates.brief).toBe("failed");
  });

  it("loads the sample project config", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-phase1-"));
    const result = await runPhase1({ runsDir: tmpDir, projectPath: sampleProjectPath });

    expect(result.passed).toBe(true);
    expect(result.pages).toBe(8);
    expect(result.blockers).toBe(0);
  });

  it("runs a custom brief with explicit manifests", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-phase1-"));
    const result = await runPhase1({
      runsDir: tmpDir,
      briefPath: sampleBriefPath,
      manifests: sampleManifests,
    });

    expect(result.passed).toBe(true);
    expect(result.pages).toBe(8);
    expect(result.blockers).toBe(0);
  });

  it("rejects a custom brief without manifests instead of using sample manifests", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-phase1-"));

    await expect(
      runPhase1({ runsDir: tmpDir, briefPath: sampleBriefPath })
    ).rejects.toThrow(/missing manifests/);

    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("fails the run when the project config and brief projects disagree", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-phase1-"));
    const projectPath = path.join(tmpDir, "project.bad.yaml");
    await writeFile(
      projectPath,
      [
        "project: another-project",
        `brief: ${JSON.stringify(sampleBriefPath)}`,
        "manifests:",
        `  b-dense: ${JSON.stringify(sampleManifests["b-dense"])}`,
        `  c-expressive: ${JSON.stringify(sampleManifests["c-expressive"])}`,
        "",
      ].join("\n"),
      "utf8"
    );

    const result = await runPhase1({ runsDir: tmpDir, projectPath });

    expect(result.passed).toBe(false);
    expect(result.blockers).toBe(1);
    const state = await readJson<RunState>(path.join(result.runDir, "state.json"));
    expect(state.status).toBe("failed");
    const log = await readFile(path.join(result.runDir, "logs", "run.log"), "utf8");
    expect(log).toContain("PROJECT-MISMATCH");
  });

  it("fails the run when a page profile has no manifest", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-phase1-"));

    const result = await runPhase1({
      runsDir: tmpDir,
      briefPath: sampleBriefPath,
      manifests: { "b-dense": sampleManifests["b-dense"]! },
    });

    expect(result.passed).toBe(false);
    expect(result.blockers).toBe(1);
    const state = await readJson<RunState>(path.join(result.runDir, "state.json"));
    expect(state.status).toBe("failed");
    const log = await readFile(path.join(result.runDir, "logs", "run.log"), "utf8");
    expect(log).toContain("PROJECT-MANIFEST-MISSING");
    expect(log).toContain("c-expressive");
  });

  it("compiles the demo-crm project from its own brief and manifest", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-phase1-"));
    const result = await runPhase1({
      projectPath: demoCrmProjectPath,
      runsDir: tmpDir,
    });

    expect(result.passed).toBe(true);
    expect(result.pages).toBe(1);
    expect(result.blockers).toBe(0);

    const state = await readJson<RunState>(path.join(result.runDir, "state.json"));
    expect(state.stage).toBe("done");
    expect(state.status).toBe("success");
    expect(state.gates.brief).toBe("passed");

    const reports = await readJson<ValidationReport[]>(
      path.join(result.runDir, "reports", "validation.json")
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]!.pageId).toBe("contacts-list");
    expect(reports[0]!.passed).toBe(true);
    expect(reports[0]!.blockers).toBe(0);

    const spec = await readJson<PageSpec>(
      path.join(result.runDir, "artifacts", "page-spec", "contacts-list.json")
    );
    expect(spec.meta.pageId).toBe("contacts-list");
    expect(spec.meta.purpose).toBe("查看和管理联系人");
    expect(spec.meta.route).toBe("/contacts");
    expect(spec.meta.roles).toContain("admin");

    const content = spec.layout.slots?.content ?? [];
    expect(content[0]?.type).toBe("Section");
    const contentChildren = content[0]?.children ?? [];

    const table = contentChildren.find((node) => node.type === "DataTable");
    expect(table?.props?.columns).toEqual(["name", "email", "phone"]);

    const filterBar = contentChildren.find((node) => node.type === "FilterBar");
    expect(filterBar?.props?.fields).toEqual(["name", "email"]);
    expect(filterBar?.props?.action).toBe("新建联系人");

    const emptyState = contentChildren.find((node) => node.type === "EmptyState");
    expect(emptyState?.props?.title).toBe("暂无联系人");
    expect(emptyState?.assetRef).toBe("empty-contacts");

    expect(spec.layout.props?.nav).toEqual(["联系人", "设置"]);

    const serialized = JSON.stringify(spec);
    expect(serialized).not.toContain("新建订单");
    expect(serialized).not.toContain("暂无订单");
    expect(serialized).not.toContain("status");
    expect(serialized).not.toContain("date");
    expect(serialized).not.toContain("keyword");
  });
});
