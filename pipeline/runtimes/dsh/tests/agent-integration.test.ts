import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
const cliPath = path.join(pipelineRoot, "runtimes", "standalone", "src", "agent-cli.ts");
const projectPath = path.join(pipelineRoot, "samples", "projects", "employee-app", "project.yaml");
const fixturePath = path.join(pipelineRoot, "samples", "agents", "m1", "ia.json");
const dshBin = path.join(pipelineRoot, "node_modules", ".bin", "dsh");
const dshHome = path.join(pipelineRoot, "dsh", "home");

interface MockServer {
  baseUrl: string;
  calls: Array<{ url: string; authorization: string | undefined; body: string }>;
  close(): Promise<void>;
}

function startMockServer(output: unknown): Promise<MockServer> {
  const calls: MockServer["calls"] = [];
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
          {
            index: 0,
            delta: { content: JSON.stringify(output) },
            finish_reason: null,
          },
        ],
      });
      send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      send({
        ...base,
        choices: [],
        usage: { prompt_tokens: 321, completion_tokens: 123, total_tokens: 444 },
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

const temporaryDirs: string[] = [];
const servers: MockServer[] = [];

afterAll(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

const skipDsh = process.env.SKIP_DSH === "1";

describe.skipIf(skipDsh)("dsh agent mock integration", () => {
  it(
    "runs agent:run --runtime dsh --only-role ia through the pinned dsh CLI",
    async () => {
      expect(
        existsSync(dshBin),
        `dsh is not installed at ${dshBin}. Run \`pnpm install\` in pipeline/, or set SKIP_DSH=1 to skip this integration test.`
      ).toBe(true);

      const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as {
        output: unknown;
      };
      const mock = await startMockServer(fixture.output);
      servers.push(mock);

      const runs = await mkdtemp(path.join(os.tmpdir(), "prd-ui-agent-dsh-"));
      temporaryDirs.push(runs);
      const signoff = path.join(runs, "signoff-ia.md");
      await writeFile(
        signoff,
        `# IA signoff\n\n<!-- signoff\n${JSON.stringify({
          signer: "tester",
          date: "2026-10-20",
          waivers: [],
        })}\n-->\n`,
        "utf8"
      );

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        DSH_HOME: dshHome,
        PRD_UI_VISION_API_KEY: "mock",
        PRD_UI_VISION_BASE_URL: mock.baseUrl,
        PRD_UI_VISION_MODEL: "mock-vision",
      };
      delete env.VITEST;

      let code = 0;
      let stdout = "";
      let stderr = "";
      try {
        const result = await execFileAsync(
          process.execPath,
          [
            tsxCli,
            cliPath,
            "--project",
            projectPath,
            "--runtime",
            "dsh",
            "--only-role",
            "ia",
            "--signoff-ia",
            signoff,
            "--runs",
            runs,
          ],
          { cwd: pipelineRoot, env, maxBuffer: 8 * 1024 * 1024, timeout: 240_000 }
        );
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (error) {
        const failure = error as { code?: number; stdout?: string; stderr?: string };
        code = typeof failure.code === "number" ? failure.code : 1;
        stdout = failure.stdout ?? "";
        stderr = failure.stderr ?? "";
      }

      expect(stderr).not.toContain("CONFIGURATION_ERROR");
      expect(stderr).not.toContain("MISSING_CREDENTIAL");
      expect(code).toBe(0);
      expect(stdout).toContain("Agent run OK: success");

      const entries = (await readdir(runs, { withFileTypes: true })).filter(
        (entry) => entry.isDirectory() && entry.name.startsWith("run-")
      );
      expect(entries).toHaveLength(1);
      const runDir = path.join(runs, entries[0]!.name);

      const state = JSON.parse(await readFile(path.join(runDir, "state.json"), "utf8")) as {
        status: string;
        gates: { ia: string };
        agents: {
          ia: {
            status: string;
            usageComplete: boolean;
            usage: { inputTokens: number; outputTokens: number };
          };
        };
      };
      expect(state.status).toBe("success");
      expect(state.gates.ia).toBe("passed");
      expect(state.agents.ia.status).toBe("passed");
      expect(state.agents.ia.usageComplete).toBe(true);
      expect(state.agents.ia.usage.inputTokens).toBeGreaterThan(0);
      expect(state.agents.ia.usage.outputTokens).toBeGreaterThan(0);

      const prompt = await readFile(path.join(runDir, "agents", "ia", "prompt.md"), "utf8");
      expect(prompt).toContain("IA (Information Architecture) Agent");
      expect(prompt).not.toContain("read_asset_brief");
      expect(prompt).not.toContain("score_asset");

      const iaMap = JSON.parse(
        await readFile(path.join(runDir, "artifacts", "ia-map.json"), "utf8")
      ) as { schemaVersion: string; model: string; pages: Array<{ id: string }> };
      expect(iaMap.schemaVersion).toBe("1.0");
      expect(iaMap.model).toBe("mock-vision");
      expect(iaMap.pages.map((page) => page.id)).toEqual(["today", "inventory-query"]);

      expect(mock.calls.length).toBe(1);
      expect(mock.calls[0]).toMatchObject({
        url: "/v1/chat/completions",
        authorization: "Bearer mock",
      });
    },
    240_000
  );
});
