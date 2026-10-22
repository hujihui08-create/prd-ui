import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { main } from "../src/intake-cli.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const projectPath = path.join(pipelineRoot, "samples", "project.demo-orders.yaml");
const prdPath = path.join(pipelineRoot, "samples", "sample-prd.md");
const fixturesDir = path.join(pipelineRoot, "samples", "agents", "intake");

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

function prdSignoff(): string {
  return `# PRD/IA signoff

<!-- signoff
{
  "signer": "Test Reviewer",
  "date": "2026-10-20",
  "answers": [],
  "waivers": [],
  "approvals": []
}
-->
`;
}

function phase2PrdSignoff(): string {
  return `# PRD/IA signoff

<!-- signoff
{
  "signer": "Test Reviewer",
  "date": "2026-10-20",
  "answers": [],
  "waivers": [
    { "findingId": "IA-001", "owner": "Test Reviewer", "reason": "slice boundary", "expires": "2026-11-20" },
    { "findingId": "IA-002", "owner": "Test Reviewer", "reason": "slice boundary", "expires": "2026-11-20" },
    { "findingId": "IA-003", "owner": "Test Reviewer", "reason": "slice boundary", "expires": "2026-11-20" }
  ],
  "approvals": []
}
-->
`;
}

function briefSignoff(hash: string, waivers: unknown[] = []): string {
  return `# Brief signoff

<!-- signoff
{
  "signer": "Test Reviewer",
  "date": "2026-10-20",
  "briefHash": ${JSON.stringify(hash)},
  "answers": [],
  "waivers": ${JSON.stringify(waivers)},
  "approvals": []
}
-->
`;
}

async function writeSignoff(name: string, content: string): Promise<string> {
  const dir = await tempDir("prd-ui-intake-signoff-");
  const file = path.join(dir, name);
  await writeFile(file, content, "utf8");
  return file;
}

async function firstRun(
  signoffPrdIa: string
): Promise<{
  code: number;
  payload: {
    runDir: string;
    status: string;
    brief: { hash: string; pages: number; path: string | null };
  };
}> {
  const runs = await tempDir("prd-ui-intake-runs-");
  const result = await runCli([
    "--project",
    projectPath,
    "--prd",
    prdPath,
    "--runs",
    runs,
    "--fixtures",
    fixturesDir,
    "--signoff-prd-ia",
    signoffPrdIa,
    "--json",
  ]);
  return {
    code: result.code,
    payload: JSON.parse(result.stdout) as never,
  };
}

describe("intake:run CLI", () => {
  it("prints help and rejects a missing PRD", async () => {
    const help = await runCli(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("intake:run");

    const missing = await runCli([
      "--project",
      projectPath,
      "--runs",
      await tempDir("prd-ui-intake-runs-"),
    ]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("missing PRD");
  });

  it("runs PRD review, waits for brief signoff, then publishes", async () => {
    const prdSignoffPath = await writeSignoff("prd-ia.md", prdSignoff());
    const first = await firstRun(prdSignoffPath);
    expect(first.code).toBe(1);
    expect(first.payload.status).toBe("awaiting_signoff");
    expect(first.payload.brief.pages).toBe(8);
    expect(first.payload.brief.hash).toMatch(/^sha256:/);

    const briefSignoffPath = await writeSignoff(
      "brief.md",
      briefSignoff(first.payload.brief.hash)
    );
    const target = path.join(await tempDir("prd-ui-intake-publish-"), "ui-brief.json");
    const second = await runCli([
      "--project",
      projectPath,
      "--prd",
      prdPath,
      "--resume",
      first.payload.runDir,
      "--fixtures",
      fixturesDir,
      "--signoff-prd-ia",
      prdSignoffPath,
      "--signoff-brief",
      briefSignoffPath,
      "--publish-brief",
      target,
      "--json",
    ]);
    expect(second.code).toBe(0);
    const payload = JSON.parse(second.stdout) as {
      status: string;
      brief: { pages: number; hash: string };
      signoff: { prdIa: boolean; brief: boolean };
      published: { path: string; overwritten: boolean };
    };
    expect(payload.status).toBe("success");
    expect(payload.brief.pages).toBe(8);
    expect(payload.signoff).toEqual({ prdIa: true, brief: true });
    expect(payload.published.path).toBe(target);
    const published = JSON.parse(await readFile(target, "utf8")) as {
      ia: {
        pages: Array<{
          id: string;
          fields?: string[];
          fieldLabels?: Record<string, string>;
          mockData?: { rows?: unknown[]; values?: Record<string, string> };
        }>;
      };
    };
    expect(published.ia.pages).toHaveLength(8);
    const listPage = published.ia.pages.find((page) => page.id === "orders-list")!;
    expect(listPage.mockData?.rows?.length ?? 0).toBeGreaterThanOrEqual(3);
    const detailPage = published.ia.pages.find((page) => page.id === "order-detail")!;
    expect(Object.keys(detailPage.mockData?.values ?? {}).length).toBeGreaterThan(0);
    expect(detailPage.fieldLabels?.orderNo).toBeTruthy();
    const final = JSON.parse(
      await readFile(
        path.join(first.payload.runDir, "artifacts", "ui-brief.json"),
        "utf8"
      )
    ) as { ia: { pages: unknown[] } };
    expect(final.ia.pages).toHaveLength(8);
  });

  it("handles the employee-app two-page slice", async () => {
    const prdSignoffPath = await writeSignoff("prd-ia.md", prdSignoff());
    const result = await runCli([
      "--project",
      path.join(pipelineRoot, "samples", "projects", "employee-app", "project.yaml"),
      "--prd",
      path.join(pipelineRoot, "samples", "projects", "employee-app", "prd.md"),
      "--runs",
      await tempDir("prd-ui-intake-runs-"),
      "--fixtures",
      path.join(pipelineRoot, "samples", "agents", "intake-employee-app"),
      "--signoff-prd-ia",
      prdSignoffPath,
      "--json",
    ]);
    expect(result.code).toBe(1);
    const payload = JSON.parse(result.stdout) as {
      status: string;
      brief: { pages: number };
    };
    expect(payload.status).toBe("awaiting_signoff");
    expect(payload.brief.pages).toBe(2);
  });

  it("handles the 03 appointments four-page slice", async () => {
    const prdSignoffPath = await writeSignoff("prd-ia.md", prdSignoff());
    const project = path.join(
      pipelineRoot,
      "samples",
      "projects",
      "employee-app-appointments-03",
      "project.yaml"
    );
    const prd = path.join(
      pipelineRoot,
      "samples",
      "projects",
      "employee-app-appointments-03",
      "prd.md"
    );
    const fixtures = path.join(
      pipelineRoot,
      "samples",
      "agents",
      "intake-appointments-03"
    );
    const runs = await tempDir("prd-ui-intake-03-runs-");
    const first = await runCli([
      "--project",
      project,
      "--prd",
      prd,
      "--runs",
      runs,
      "--fixtures",
      fixtures,
      "--signoff-prd-ia",
      prdSignoffPath,
      "--json",
    ]);
    expect(first.code).toBe(1);
    const payload = JSON.parse(first.stdout) as {
      runDir: string;
      status: string;
      brief: { pages: number; hash: string };
    };
    expect(payload.status).toBe("awaiting_signoff");
    expect(payload.brief.pages).toBe(4);

    const briefSignoffPath = await writeSignoff(
      "brief.md",
      briefSignoff(payload.brief.hash)
    );
    const target = path.join(await tempDir("prd-ui-intake-03-publish-"), "ui-brief.json");
    const second = await runCli([
      "--project",
      project,
      "--prd",
      prd,
      "--resume",
      payload.runDir,
      "--fixtures",
      fixtures,
      "--signoff-prd-ia",
      prdSignoffPath,
      "--signoff-brief",
      briefSignoffPath,
      "--publish-brief",
      target,
      "--json",
    ]);
    expect(second.code).toBe(0);
    const published = JSON.parse(await readFile(target, "utf8")) as {
      ia: {
        pages: Array<{
          id: string;
          archetype: string;
          fieldLabels?: Record<string, string>;
          mockData?: { rows?: unknown[] };
        }>;
      };
    };
    expect(published.ia.pages).toHaveLength(4);
    const byId = new Map(published.ia.pages.map((page) => [page.id, page]));
    expect(byId.get("appointment-list")?.archetype).toBe("mobile-list");
    expect(byId.get("appointment-form")?.archetype).toBe("mobile-form");
    expect(byId.get("appointment-list")?.mockData?.rows?.length ?? 0).toBeGreaterThan(0);
    expect(byId.get("appointment-detail")?.fieldLabels?.customer).toBe("客户");
  });

  it("handles the 8-page employee-app phase2 slice", async () => {
    const prdSignoffPath = await writeSignoff("prd-ia.md", phase2PrdSignoff());
    const project = path.join(
      pipelineRoot,
      "samples",
      "projects",
      "employee-app-phase2",
      "project.yaml"
    );
    const prd = path.join(
      pipelineRoot,
      "samples",
      "projects",
      "employee-app-phase2",
      "prd.md"
    );
    const fixtures = path.join(
      pipelineRoot,
      "samples",
      "agents",
      "intake-employee-app-phase2"
    );
    const first = await runCli([
      "--project",
      project,
      "--prd",
      prd,
      "--runs",
      await tempDir("prd-ui-intake-phase2-runs-"),
      "--fixtures",
      fixtures,
      "--signoff-prd-ia",
      prdSignoffPath,
      "--json",
    ]);
    expect(first.code).toBe(1);
    const payload = JSON.parse(first.stdout) as {
      runDir: string;
      status: string;
      brief: { pages: number; hash: string };
    };
    expect(payload.status).toBe("awaiting_signoff");
    expect(payload.brief.pages).toBe(8);

    const briefSignoffPath = await writeSignoff(
      "brief.md",
      briefSignoff(payload.brief.hash)
    );
    const target = path.join(await tempDir("prd-ui-intake-phase2-publish-"), "ui-brief.json");
    const second = await runCli([
      "--project",
      project,
      "--prd",
      prd,
      "--resume",
      payload.runDir,
      "--fixtures",
      fixtures,
      "--signoff-prd-ia",
      prdSignoffPath,
      "--signoff-brief",
      briefSignoffPath,
      "--publish-brief",
      target,
      "--json",
    ]);
    expect(second.code).toBe(0);
    const published = JSON.parse(await readFile(target, "utf8")) as {
      ia: {
        pages: Array<{
          id: string;
          archetype: string;
          fields?: string[];
          actions?: string[];
          noticeBlocks?: unknown[];
        }>;
      };
    };
    expect(published.ia.pages).toHaveLength(8);
    const byId = new Map(published.ia.pages.map((page) => [page.id, page]));
    expect(byId.get("today")?.archetype).toBe("home");
    expect(byId.get("today")?.fields).toEqual([]);
    expect(byId.get("customer-search")?.archetype).toBe("mobile-list");
    expect(byId.get("appointment-form")?.archetype).toBe("mobile-form");
    expect(byId.get("treatment-notice")?.noticeBlocks).toHaveLength(2);
    expect(byId.get("appointment-list")?.archetype).toBe("mobile-list");
    expect(byId.get("callback-register")?.archetype).toBe("mobile-form");
  });

  it("stays awaiting when the brief signoff hash is wrong", async () => {
    const prdSignoffPath = await writeSignoff("prd-ia.md", prdSignoff());
    const first = await firstRun(prdSignoffPath);
    const wrong = await writeSignoff("brief.md", briefSignoff("sha256:wrong"));
    const resumed = await runCli([
      "--project",
      projectPath,
      "--prd",
      prdPath,
      "--resume",
      first.payload.runDir,
      "--fixtures",
      fixturesDir,
      "--signoff-prd-ia",
      prdSignoffPath,
      "--signoff-brief",
      wrong,
      "--json",
    ]);
    expect(resumed.code).toBe(1);
    const payload = JSON.parse(resumed.stdout) as { status: string };
    expect(payload.status).toBe("awaiting_signoff");
    await expect(
      readFile(path.join(first.payload.runDir, "artifacts", "ui-brief.json"), "utf8")
    ).rejects.toThrow();
  });

  it("refuses to overwrite a different published brief without --force", async () => {
    const prdSignoffPath = await writeSignoff("prd-ia.md", prdSignoff());
    const first = await firstRun(prdSignoffPath);
    const briefSignoffPath = await writeSignoff(
      "brief.md",
      briefSignoff(first.payload.brief.hash)
    );
    const target = path.join(await tempDir("prd-ui-intake-publish-"), "ui-brief.json");
    await writeFile(target, '{"different":true}\n', "utf8");

    const conflict = await runCli([
      "--project",
      projectPath,
      "--prd",
      prdPath,
      "--resume",
      first.payload.runDir,
      "--fixtures",
      fixturesDir,
      "--signoff-prd-ia",
      prdSignoffPath,
      "--signoff-brief",
      briefSignoffPath,
      "--publish-brief",
      target,
      "--json",
    ]);
    expect(conflict.code).toBe(1);
    expect(conflict.stdout).toContain("PUBLISH_CONFLICT");

    const forced = await runCli([
      "--project",
      projectPath,
      "--prd",
      prdPath,
      "--resume",
      first.payload.runDir,
      "--fixtures",
      fixturesDir,
      "--signoff-prd-ia",
      prdSignoffPath,
      "--signoff-brief",
      briefSignoffPath,
      "--publish-brief",
      target,
      "--force",
      "--json",
    ]);
    expect(forced.code).toBe(0);
    const payload = JSON.parse(forced.stdout) as {
      published: { overwritten: boolean };
    };
    expect(payload.published.overwritten).toBe(true);
  });
});
