import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { PageSpec } from "@prd-ui/contracts";
import {
  loadVisualCriticPricing,
  runDshVisualCritic,
} from "../../standalone/src/visual/critic.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const dshBin = path.join(pipelineRoot, "node_modules", ".bin", "dsh");

/** 1x1 transparent PNG; the mock model never decodes it. */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3z8wAAAABJRU5ErkJggg==";

const critique = {
  verdict: "pass",
  findings: [],
  summary: "No visual blockers.",
};

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
        choices: [
          { index: 0, delta: { role: "assistant", content: "" }, finish_reason: null },
        ],
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

const spec: PageSpec = {
  meta: {
    pageId: "today",
    project: "employee-app-phase2",
    name: "今日",
    target: "mobile",
    profile: "b-mobile",
    archetype: "home",
    purpose: "查看当天预约",
    route: "/today",
    roles: ["beautician"],
    reqRefs: ["REQ-EMP-001"],
    version: "0.1.0",
  },
  layout: { type: "MobileShell" },
  states: { default: { name: "default" } },
  interactions: [],
  traceability: { reqMap: {}, designDefaults: [], unmapped: [] },
};

const temporaryDirs: string[] = [];
const servers: MockServer[] = [];

afterAll(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

const skipDsh = process.env.SKIP_DSH === "1";

describe.skipIf(skipDsh)("dsh visual critic mock integration", () => {
  it(
    "runs the Visual Critic through the prd-ui-visual profile",
    async () => {
      expect(
        existsSync(dshBin),
        `dsh is not installed at ${dshBin}. Run \`pnpm install\` in pipeline/, or set SKIP_DSH=1 to skip this integration test.`
      ).toBe(true);

      const mock = await startMockServer(critique);
      servers.push(mock);

      const runDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-visual-dsh-"));
      temporaryDirs.push(runDir);
      await mkdir(path.join(runDir, "screenshots"), { recursive: true });
      await writeFile(
        path.join(runDir, "screenshots", "today.default.png"),
        Buffer.from(PNG_BASE64, "base64")
      );

      const env = process.env;
      const previous = {
        key: env.PRD_UI_VISION_API_KEY,
        baseUrl: env.PRD_UI_VISION_BASE_URL,
        model: env.PRD_UI_VISION_MODEL,
      };
      env.PRD_UI_VISION_API_KEY = "mock";
      env.PRD_UI_VISION_BASE_URL = mock.baseUrl;
      env.PRD_UI_VISION_MODEL = "mock-vision";

      try {
        const result = await runDshVisualCritic(
          {
            project: "employee-app-phase2",
            profile: "b-mobile",
            visualStyle: { tone: "neutral" },
            screenshots: [
              { caseId: "today.default", path: "screenshots/today.default.png" },
            ],
            specs: [spec],
            findings: [],
          },
          {
            runDir,
            dshProfile: "prd-ui-visual",
            maxCostCny: 3,
            pricing: await loadVisualCriticPricing(),
          }
        );

        expect(result.error).toBeUndefined();
        expect(result.critique).toEqual(critique);
        expect(result.findings).toEqual([]);
        expect(result.usageComplete).toBe(true);
        expect(result.usage?.inputTokens).toBeGreaterThan(0);
        expect(result.usage?.outputTokens).toBeGreaterThan(0);
        expect(result.costCny).toBeGreaterThan(0);
        expect(result.model).toBe("mock-vision");
        expect(result.budgetEnforced).toBe(true);
        expect(result.costSource).toBe("pricing");

        const prompt = await readFile(
          path.join(runDir, "dsh", "visual-critic", "prompt.md"),
          "utf8"
        );
        expect(prompt).toContain("Visual Critic");
        expect(prompt).toContain("screenshots/today.default.png");
        expect(prompt).toContain("read_image");
        expect(prompt).toContain(runDir);
        expect(prompt).toContain(
          path.join(runDir, "screenshots", "today.default.png")
        );

        const evidence = JSON.parse(
          await readFile(
            path.join(runDir, "dsh", "visual-critic", "result.json"),
            "utf8"
          )
        ) as { critique: unknown; usageComplete: boolean };
        expect(evidence.critique).toEqual(critique);
        expect(evidence.usageComplete).toBe(true);

        expect(mock.calls).toHaveLength(1);
        expect(mock.calls[0]).toMatchObject({
          url: "/v1/chat/completions",
          authorization: "Bearer mock",
        });

        // The profile must expose reads but no mutating tools. The model-facing
        // request body is the authoritative tool list.
        const request = JSON.parse(mock.calls[0]!.body) as {
          tools?: Array<{ function?: { name?: string } }>;
        };
        const toolNames = (request.tools ?? [])
          .map((tool) => tool.function?.name ?? "")
          .filter((name) => name.length > 0);
        const hasTool = (name: string): boolean =>
          toolNames.some(
            (entry) => entry === name || entry.endsWith(`__${name}`)
          );
        expect(toolNames.length, JSON.stringify(toolNames)).toBeGreaterThan(0);
        expect(hasTool("read_image"), JSON.stringify(toolNames)).toBe(true);
        for (const forbidden of ["write", "edit", "bash", "pwsh"]) {
          expect(hasTool(forbidden), `${forbidden}: ${JSON.stringify(toolNames)}`).toBe(
            false
          );
        }
      } finally {
        if (previous.key === undefined) delete env.PRD_UI_VISION_API_KEY;
        else env.PRD_UI_VISION_API_KEY = previous.key;
        if (previous.baseUrl === undefined) delete env.PRD_UI_VISION_BASE_URL;
        else env.PRD_UI_VISION_BASE_URL = previous.baseUrl;
        if (previous.model === undefined) delete env.PRD_UI_VISION_MODEL;
        else env.PRD_UI_VISION_MODEL = previous.model;
      }
    },
    240_000
  );
});
