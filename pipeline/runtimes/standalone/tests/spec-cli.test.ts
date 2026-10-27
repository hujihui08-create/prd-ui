import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  AssetBriefSchema,
  DEFAULT_STRUCTURE_CONFIG,
  type AssetBrief,
} from "@prd-ui/contracts";
import {
  M1RunStateSchema,
  type InteractionSpec,
  type MotionSpec,
} from "@prd-ui/agents";
import { main, parseArgs } from "../src/spec-cli.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const projectPath = path.join(
  pipelineRoot,
  "samples",
  "projects",
  "employee-app",
  "project.yaml"
);
const now = "2026-10-20T00:00:00.000Z";

const interactionSpec: InteractionSpec = {
  pages: [
    {
      id: "today",
      transitions: [
        { from: "today", to: "inventory-query", trigger: "点击库存查询" },
      ],
      triggers: [
        { nodeId: "quick-inventory", action: "库存查询", reaction: "打开库存查询页" },
      ],
      states: {
        default: ["门店顶栏", "库存快捷操作"],
        loading: ["骨架屏"],
        empty: ["今天没有预约"],
        error: ["重试"],
      },
      focusOrder: ["quick-inventory"],
      keyboard: [],
      destructiveActions: [],
    },
    {
      id: "inventory-query",
      transitions: [{ from: "inventory-query", to: "today", trigger: "返回今日" }],
      triggers: [],
      states: {
        default: ["搜索栏", "产品列表"],
        loading: ["列表骨架"],
        empty: ["没有匹配的产品"],
        error: ["重试"],
      },
      focusOrder: ["search"],
      keyboard: [],
      destructiveActions: [],
    },
  ],
};

const motionSpec: MotionSpec = {
  presets: { "page-enter": { durationMs: 200, easing: "standard" } },
  bindings: [{ pageId: "today", nodeId: "quick-inventory", preset: "page-enter" }],
  tokens: {
    duration: { normal: "200ms" },
    easing: { standard: "ease-out" },
  },
  reducedMotion: { fallback: "fade" },
};

function iconBrief(id: string): AssetBrief {
  return {
    id,
    kind: "icon",
    scene: `${id} scene`,
    styleRef: "employee-app/b-mobile-neutral",
    size: { width: 24, height: 24 },
    format: "svg",
    constraints: { grid: 24, currentColor: true, noText: true },
    sourceChain: ["library"],
  };
}

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

interface M1FixtureOptions {
  status?: "success" | "failed";
  omitMotion?: boolean;
  omitInteraction?: boolean;
  project?: string;
  motionBindings?: MotionSpec["bindings"];
}

async function makeM1Run(options: M1FixtureOptions = {}): Promise<string> {
  const dir = await tempDir("prd-ui-spec-m1-");
  const project = options.project ?? "employee-app";
  const state = {
    schemaVersion: "1.0",
    runId: "m1-run-test",
    project,
    stage: "done",
    status: options.status ?? "success",
    agents: {
      ia: { status: "passed", attempts: 1, repairAttempts: 0, gateRounds: 0 },
      interaction: { status: "passed", attempts: 1, repairAttempts: 0, gateRounds: 0 },
      "visual-style": { status: "passed", attempts: 1, repairAttempts: 0, gateRounds: 0 },
    },
    gates: { ia: "passed", interaction: "passed", visualStyle: "passed" },
    signoff: { ia: true, visualStyle: true },
    usageComplete: true,
    costCny: 0.2,
    degraded: false,
    startedAt: now,
    updatedAt: now,
    finishedAt: now,
  };
  M1RunStateSchema.parse(state);
  await writeJson(path.join(dir, "state.json"), state);

  const envelope = {
    schemaVersion: "1.0",
    project,
    generatedAt: now,
    model: "test-model",
    promptHash: "sha256:test",
  };
  if (options.omitInteraction !== true) {
    await writeJson(path.join(dir, "artifacts", "interaction-spec.json"), {
      ...envelope,
      ...interactionSpec,
    });
  }
  if (options.omitMotion !== true) {
    await writeJson(path.join(dir, "artifacts", "motion-spec.json"), {
      ...envelope,
      ...motionSpec,
      ...(options.motionBindings === undefined
        ? {}
        : { bindings: options.motionBindings }),
    });
  }
  await writeJson(path.join(dir, "artifacts", "ia-map.json"), {
    ...envelope,
    pages: [
      {
        id: "today",
        name: "今日",
        route: "/today",
        level: 1,
        roles: ["store_manager"],
        entryPoints: ["tab"],
      },
      {
        id: "inventory-query",
        name: "库存查询",
        route: "/inventory",
        level: 1,
        roles: ["store_manager"],
        entryPoints: ["tab"],
      },
    ],
    navigation: { primary: ["今日", "库存查询"], tabs: ["今日", "库存查询"] },
    flows: [],
    crossLinks: [],
  });
  await writeJson(
    path.join(dir, "artifacts", "asset-briefs", "icon-package.json"),
    AssetBriefSchema.parse(iconBrief("icon-package"))
  );
  await writeJson(
    path.join(dir, "artifacts", "asset-briefs", "icon-plus.json"),
    AssetBriefSchema.parse(iconBrief("icon-plus"))
  );
  return dir;
}

async function writeProjectWithStructure(structureYaml: string): Promise<string> {
  const dir = await tempDir("prd-ui-spec-project-");
  await writeFile(
    path.join(dir, "ui-brief.json"),
    await readFile(
      path.join(pipelineRoot, "samples", "projects", "employee-app", "ui-brief.json"),
      "utf8"
    ),
    "utf8"
  );
  await writeFile(
    path.join(dir, "project.yaml"),
    [
      "project: employee-app",
      "brief: ui-brief.json",
      "manifests: {}",
      structureYaml,
      "",
    ].join("\n"),
    "utf8"
  );
  return path.join(dir, "project.yaml");
}

interface StructureLintPayload {
  schemaVersion: string;
  project: string;
  config: {
    maxRepeatedSections: number;
    pageHeightBudget: { mobile: number; web: number };
  };
  pages: Array<{
    pageId: string;
    estimatedHeight: number;
    budget: number;
    findings: Array<{ ruleId: string; severity: string }>;
  }>;
  summary: { warnings: number; blockers: number };
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

async function singleRunDir(runs: string): Promise<string> {
  const entries = await readdir(runs, { withFileTypes: true });
  const found = entries.filter(
    (entry) => entry.isDirectory() && entry.name.startsWith("run-")
  );
  expect(found).toHaveLength(1);
  return path.join(runs, found[0]!.name);
}

describe("spec:engineer CLI", () => {
  it("consumes an M1 run and writes enriched Page Specs", async () => {
    const agentRun = await makeM1Run();
    const runs = await tempDir("prd-ui-spec-out-");

    const result = await runCli([
      "--project",
      projectPath,
      "--agent-run",
      agentRun,
      "--runs",
      runs,
      "--json",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    const payload = JSON.parse(result.stdout) as {
      status: string;
      pages: string[];
      motionPages: string[];
      assets: { referenced: string[]; unusedBriefs: string[] };
    };
    expect(payload.status).toBe("passed");
    expect(payload.pages).toEqual(["today", "inventory-query"]);
    expect(payload.motionPages).toEqual(["today"]);
    expect(payload.assets.referenced).toContain("icon-package");
    expect(payload.assets.unusedBriefs).toContain("icon-plus");

    const runDir = await singleRunDir(runs);
    const today = JSON.parse(
      await readFile(path.join(runDir, "artifacts", "page-spec", "today.json"), "utf8")
    ) as {
      interactions: Array<{ trigger: string; action: string; nodeId?: string; target?: string }>;
      states: Record<string, { description?: string }>;
      motion?: { presets: Record<string, unknown> };
    };
    expect(today.interactions).toEqual(
      expect.arrayContaining([
        {
          trigger: "库存查询",
          action: "打开库存查询页",
          nodeId: "quick-inventory",
          reqRef: "REQ-EMP-001",
        },
        {
          trigger: "点击库存查询",
          action: "navigate",
          target: "/inventory",
          reqRef: "REQ-EMP-001",
        },
      ])
    );
    expect(today.states.default?.description).toBe("门店顶栏; 库存快捷操作");
    expect(today.motion?.presets).toHaveProperty("page-enter");

    const summary = JSON.parse(
      await readFile(path.join(runDir, "spec-engineer.json"), "utf8")
    ) as { passed: boolean; gate: { passed: boolean } };
    expect(summary.passed).toBe(true);
    expect(summary.gate.passed).toBe(true);
    await expect(
      readFile(path.join(runDir, "findings", "spec-engineer-gate.json"), "utf8")
    ).resolves.toContain("SPEC_ASSET_UNUSED");
  });

  it("writes a block manifest for every page", async () => {
    const agentRun = await makeM1Run();
    const runs = await tempDir("prd-ui-spec-out-");

    const result = await runCli([
      "--project",
      projectPath,
      "--agent-run",
      agentRun,
      "--runs",
      runs,
    ]);
    expect(result.code).toBe(0);

    const runDir = await singleRunDir(runs);
    for (const page of ["today", "inventory-query"]) {
      const manifest = JSON.parse(
        await readFile(
          path.join(runDir, "artifacts", "block-manifest", `${page}.json`),
          "utf8"
        )
      ) as { pageId: string; project: string; blocks: unknown[] };
      expect(manifest.blocks.length).toBeGreaterThan(0);
      expect(manifest.pageId).toBe(page);
      expect(manifest.project).toBe("employee-app");
    }
  });

  it("writes no block manifests when the spec gate fails", async () => {
    const agentRun = await makeM1Run({
      motionBindings: [
        { pageId: "today", nodeId: "today.unknown-node", preset: "page-enter" },
      ],
    });
    const runs = await tempDir("prd-ui-spec-out-");

    const result = await runCli([
      "--project",
      projectPath,
      "--agent-run",
      agentRun,
      "--runs",
      runs,
      "--strict-motion",
    ]);
    expect(result.code).toBe(1);

    const runDir = await singleRunDir(runs);
    await expect(
      readFile(path.join(runDir, "artifacts", "block-manifest", "today.json"), "utf8")
    ).rejects.toThrow();
  });

  it("writes a warning-only structure lint report", async () => {
    const agentRun = await makeM1Run();
    const runs = await tempDir("prd-ui-spec-out-");

    const result = await runCli([
      "--project",
      projectPath,
      "--agent-run",
      agentRun,
      "--runs",
      runs,
      "--json",
    ]);
    expect(result.code).toBe(0);

    const runDir = await singleRunDir(runs);
    const report = JSON.parse(
      await readFile(path.join(runDir, "findings", "structure-lint.json"), "utf8")
    ) as StructureLintPayload;

    expect(report.schemaVersion).toBe("1.0");
    expect(report.project).toBe("employee-app");
    expect(report.config).toEqual(DEFAULT_STRUCTURE_CONFIG);
    expect(report.pages.map((page) => page.pageId)).toEqual(["today", "inventory-query"]);
    expect(
      report.pages.every(
        (page) => page.budget === DEFAULT_STRUCTURE_CONFIG.pageHeightBudget.mobile
      )
    ).toBe(true);
    expect(report.pages.every((page) => page.estimatedHeight >= 844)).toBe(true);
    expect(
      report.pages.every((page) =>
        page.findings.every((finding) => finding.severity === "warning")
      )
    ).toBe(true);
    expect(report.summary).toEqual({
      warnings: report.pages.reduce((sum, page) => sum + page.findings.length, 0),
      blockers: 0,
    });
  });

  it("deep-merges partial structure config without blocking the gate", async () => {
    const structureProject = await writeProjectWithStructure(
      [
        "structure:",
        "  maxRepeatedSections: 5",
        "  pageHeightBudget:",
        "    mobile: 400",
      ].join("\n")
    );
    const agentRun = await makeM1Run();
    const runs = await tempDir("prd-ui-spec-out-");

    const result = await runCli([
      "--project",
      structureProject,
      "--agent-run",
      agentRun,
      "--runs",
      runs,
      "--json",
    ]);
    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout) as { status: string };
    expect(payload.status).toBe("passed");

    const runDir = await singleRunDir(runs);
    const report = JSON.parse(
      await readFile(path.join(runDir, "findings", "structure-lint.json"), "utf8")
    ) as StructureLintPayload;

    expect(report.config).toEqual({
      maxRepeatedSections: 5,
      pageHeightBudget: { mobile: 400, web: 2400 },
    });
    expect(report.pages.every((page) => page.budget === 400)).toBe(true);
    expect(report.summary.blockers).toBe(0);
    expect(report.summary.warnings).toBeGreaterThan(0);
    expect(
      report.pages.some((page) =>
        page.findings.some((finding) => finding.ruleId === "STRUCTURE-PAGE-HEIGHT")
      )
    ).toBe(true);
  });

  it("writes structure lint when the spec gate fails", async () => {
    const agentRun = await makeM1Run({
      motionBindings: [
        { pageId: "today", nodeId: "today.unknown-node", preset: "page-enter" },
      ],
    });
    const runs = await tempDir("prd-ui-spec-out-");

    const strict = await runCli([
      "--project",
      projectPath,
      "--agent-run",
      agentRun,
      "--runs",
      runs,
      "--strict-motion",
      "--json",
    ]);
    expect(strict.code).toBe(1);

    const runDir = await singleRunDir(runs);
    const report = JSON.parse(
      await readFile(path.join(runDir, "findings", "structure-lint.json"), "utf8")
    ) as StructureLintPayload;
    expect(report.pages.map((page) => page.pageId)).toEqual(["today", "inventory-query"]);
    expect(report.summary.blockers).toBe(0);
  });

  it("resolves motion aliases and upgrades unresolved bindings with --strict-motion", async () => {
    const agentRun = await makeM1Run({
      motionBindings: [
        { pageId: "today", nodeId: "today.appointment-row", preset: "page-enter" },
        { pageId: "today", nodeId: "today.unknown-node", preset: "page-enter" },
      ],
    });

    const lenientRuns = await tempDir("prd-ui-spec-out-");
    const lenient = await runCli([
      "--project",
      projectPath,
      "--agent-run",
      agentRun,
      "--runs",
      lenientRuns,
      "--json",
    ]);
    expect(lenient.code).toBe(0);
    const lenientPayload = JSON.parse(lenient.stdout) as {
      gate: { issues: Array<{ code: string; severity: string; evidence?: string }> };
    };
    expect(lenientPayload.gate.issues).toContainEqual(
      expect.objectContaining({
        code: "SPEC_MOTION_NODE_UNRESOLVED",
        severity: "warning",
        evidence: "today#today.unknown-node",
      })
    );
    expect(
      lenientPayload.gate.issues.filter(
        (issue) => issue.evidence === "today#today.appointment-row"
      )
    ).toEqual([]);

    const runDir = await singleRunDir(lenientRuns);
    const today = JSON.parse(
      await readFile(path.join(runDir, "artifacts", "page-spec", "today.json"), "utf8")
    ) as { motion?: { bindings: Array<{ nodeId?: string; preset: string }> } };
    expect(today.motion?.bindings).toContainEqual({
      nodeId: "today.row.appointment",
      preset: "page-enter",
    });

    const strictRuns = await tempDir("prd-ui-spec-out-");
    const strict = await runCli([
      "--project",
      projectPath,
      "--agent-run",
      agentRun,
      "--runs",
      strictRuns,
      "--strict-motion",
      "--json",
    ]);
    expect(strict.code).toBe(1);
    const strictPayload = JSON.parse(strict.stdout) as {
      status: string;
      gate: { issues: Array<{ code: string; severity: string; evidence?: string }> };
    };
    expect(strictPayload.status).toBe("failed");
    expect(strictPayload.gate.issues).toContainEqual(
      expect.objectContaining({
        code: "SPEC_MOTION_NODE_UNRESOLVED",
        severity: "blocker",
        evidence: "today#today.unknown-node",
      })
    );
    const strictRunDir = await singleRunDir(strictRuns);
    await expect(
      readFile(path.join(strictRunDir, "artifacts", "page-spec", "today.json"), "utf8")
    ).rejects.toThrow();
  });

  it("fails clearly when the M1 motion artifact is missing", async () => {
    const agentRun = await makeM1Run({ omitMotion: true });
    const runs = await tempDir("prd-ui-spec-out-");

    const result = await runCli([
      "--project",
      projectPath,
      "--agent-run",
      agentRun,
      "--runs",
      runs,
      "--json",
    ]);

    expect(result.code).toBe(1);
    const payload = JSON.parse(result.stdout) as { status: string; error: string };
    expect(payload.status).toBe("failed");
    expect(payload.error).toContain("motion-spec");
    const runDir = await singleRunDir(runs);
    await expect(
      readFile(path.join(runDir, "artifacts", "page-spec", "today.json"), "utf8")
    ).rejects.toThrow();
  });

  it("rejects a failed M1 run", async () => {
    const agentRun = await makeM1Run({ status: "failed" });
    const runs = await tempDir("prd-ui-spec-out-");
    const result = await runCli([
      "--project",
      projectPath,
      "--agent-run",
      agentRun,
      "--runs",
      runs,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("status failed");
  });

  it("rejects an M1 run whose project does not match", async () => {
    const agentRun = await makeM1Run({ project: "other-app" });
    const runs = await tempDir("prd-ui-spec-out-");
    const result = await runCli([
      "--project",
      projectPath,
      "--agent-run",
      agentRun,
      "--runs",
      runs,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("does not match");
    const runDir = await singleRunDir(runs);
    await expect(
      readFile(path.join(runDir, "artifacts", "page-spec", "today.json"), "utf8")
    ).rejects.toThrow();
  });

  it("prints help and rejects a missing --agent-run", async () => {
    expect((await runCli(["--help"])).code).toBe(0);
    const missing = await runCli([]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("--agent-run");
  });

  it("parses flags", () => {
    const options = parseArgs([
      "--project",
      "custom.yaml",
      "--agent-run",
      "/tmp/m1",
      "--runs",
      "/tmp/out",
      "--strict-motion",
      "--json",
    ]);
    expect(options.projectPath).toBe(path.resolve("custom.yaml"));
    expect(options.agentRunPath).toBe(path.resolve("/tmp/m1"));
    expect(options.runsDir).toBe(path.resolve("/tmp/out"));
    expect(options.strictMotion).toBe(true);
    expect(options.json).toBe(true);
    expect(parseArgs(["--agent-run", "/tmp/m1"]).strictMotion).toBe(false);
  });
});
