import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const tsxCli = path.join(pipelineRoot, "node_modules", "tsx", "dist", "cli.mjs");
const cliPath = path.join(pipelineRoot, "runtimes", "standalone", "src", "asset-cli.ts");
const projectPath = path.join(pipelineRoot, "samples", "projects", "employee-app", "project.yaml");
const m0 = path.join(pipelineRoot, "samples", "assets", "m0");
const dshBin = path.join(pipelineRoot, "node_modules", ".bin", "dsh");
const dshHome = path.join(pipelineRoot, "dsh", "home");

const verdict = {
  verdict: "pass",
  hardIssues: [],
  scores: { brandFit: 5, semantics: 5, consistency: 4, editability: 4, composition: 5 },
  suggestedChanges: [],
  reason: "mock integration verdict",
};

interface MockCall {
  url: string;
  authorization: string | undefined;
  body: string;
}

interface MockServer {
  baseUrl: string;
  calls: MockCall[];
  close(): Promise<void>;
}

/**
 * Minimal OpenAI-compatible chat-completions endpoint. pi-ai always streams,
 * so the verdict is sent as an SSE chunk followed by a usage-only chunk.
 * `prompt_tokens_details.cached_tokens` is required: dsh omits
 * `cacheReadTokens` when it is zero, and the adapter then reports
 * `usageComplete=false`.
 */
function startMockServer(): Promise<MockServer> {
  const calls: MockCall[] = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      calls.push({
        url: request.url ?? "",
        authorization: request.headers.authorization,
        body,
      });
      if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "not found" } }));
        return;
      }
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const base = {
        id: "chatcmpl-mock",
        object: "chat.completion.chunk",
        created: 1,
        model: "mock-vision",
      };
      const send = (payload: unknown): void => {
        response.write(`data: ${JSON.stringify(payload)}\n\n`);
      };
      send({
        ...base,
        choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
      });
      send({
        ...base,
        choices: [
          { index: 0, delta: { content: JSON.stringify(verdict) }, finish_reason: null },
        ],
      });
      send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      send({
        ...base,
        choices: [],
        usage: {
          prompt_tokens: 123,
          completion_tokens: 45,
          total_tokens: 168,
          prompt_tokens_details: { cached_tokens: 80 },
        },
      });
      response.write("data: [DONE]\n\n");
      response.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("mock server did not get a TCP address"));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        calls,
        close: () =>
          new Promise<void>((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [tsxCli, cliPath, ...args], {
      cwd: pipelineRoot,
      env,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 240_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
}

const temporaryDirs: string[] = [];
const servers: MockServer[] = [];

afterAll(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

const skipDsh = process.env.SKIP_DSH === "1";

describe.skipIf(skipDsh)("dsh mock integration", () => {
  it(
    "runs asset:review --only icon-home through the real pinned dsh CLI",
    async () => {
      expect(
        existsSync(dshBin),
        `dsh is not installed at ${dshBin}. Run \`pnpm install\` in pipeline/, or set SKIP_DSH=1 to skip this integration test.`
      ).toBe(true);

      const mock = await startMockServer();
      servers.push(mock);
      const runs = await mkdtemp(path.join(os.tmpdir(), "prd-ui-dsh-integration-"));
      temporaryDirs.push(runs);

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        DSH_HOME: dshHome,
        PRD_UI_VISION_API_KEY: "mock",
        PRD_UI_VISION_BASE_URL: mock.baseUrl,
        PRD_UI_VISION_MODEL: "mock-vision",
      };
      delete env.VITEST;

      const result = await runCli(
        [
          "--project",
          projectPath,
          "--assets",
          m0,
          "--only",
          "icon-home",
          "--runtime",
          "dsh",
          "--runs",
          runs,
        ],
        env
      );
      expect(result.stderr).not.toContain("CONFIGURATION_ERROR");
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("1 assets, 1 passed");
      expect(result.stdout).toContain("usageComplete=true");

      const entries = (await readdir(runs, { withFileTypes: true })).filter(
        (entry) => entry.isDirectory() && entry.name.startsWith("run-")
      );
      expect(entries).toHaveLength(1);
      const runDir = path.join(runs, entries[0]!.name);

      const review = await readJson(path.join(runDir, "asset-review.json"));
      expect(review).toMatchObject({
        passed: true,
        usageSource: "json-events",
        usageComplete: true,
        summary: { total: 1, passed: 1, unresolved: 0 },
      });
      const assets = review.assets as Array<{ assetId: string; status: string }>;
      expect(assets).toHaveLength(1);
      expect(assets[0]).toMatchObject({ assetId: "icon-home", status: "passed" });
      const summary = review.summary as { reviewCostCny?: number };
      expect(summary.reviewCostCny).toBeGreaterThan(0);

      const evidenceDir = path.join(runDir, "dsh", "icon-home-library-1");
      expect((await readJson(path.join(evidenceDir, "review.raw.json"))).parsed).toMatchObject({
        verdict: "pass",
      });
      const prompt = await readFile(path.join(evidenceDir, "prompt.md"), "utf8");
      expect(prompt).toContain("icon-home");

      expect(mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(mock.calls[0]).toMatchObject({
        url: "/v1/chat/completions",
        authorization: "Bearer mock",
      });
      expect(JSON.parse(mock.calls[0]!.body)).toMatchObject({ model: "mock-vision" });
    },
    240_000
  );
});
