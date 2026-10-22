import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { PageSpec } from "@prd-ui/contracts";
import {
  loadVisualCriticPricing,
  runDshVisualCritic,
  type VisualCriticInput,
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

interface MockResponse {
  output?: unknown;
  toolCall?: { id: string; name: string; arguments: string };
}

function startMockServer(
  script: MockResponse | MockResponse[]
): Promise<MockServer> {
  const responses = Array.isArray(script) ? script : [script];
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
      const responseSpec =
        responses[Math.min(calls.length - 1, responses.length - 1)] ?? {};
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
      if (responseSpec.toolCall !== undefined) {
        send({
          ...base,
          choices: [
            {
              index: 0,
              delta: {
                content: null,
                tool_calls: [
                  {
                    index: 0,
                    id: responseSpec.toolCall.id,
                    type: "function",
                    function: {
                      name: responseSpec.toolCall.name,
                      arguments: responseSpec.toolCall.arguments,
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        });
        send({
          ...base,
          choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        });
      } else {
        send({
          ...base,
          choices: [
            {
              index: 0,
              delta: { content: JSON.stringify(responseSpec.output) },
              finish_reason: null,
            },
          ],
        });
        send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      }
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

const criticInput: VisualCriticInput = {
  project: "employee-app-phase2",
  profile: "b-mobile",
  visualStyle: { tone: "neutral" },
  screenshots: [
    { caseId: "today.default", path: "screenshots/today.default.png" },
  ],
  specs: [spec],
  findings: [],
};

async function makeRunDir(): Promise<string> {
  const runDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-visual-dsh-"));
  temporaryDirs.push(runDir);
  await mkdir(path.join(runDir, "screenshots"), { recursive: true });
  await writeFile(
    path.join(runDir, "screenshots", "today.default.png"),
    Buffer.from(PNG_BASE64, "base64")
  );
  return runDir;
}

async function withMockProviderEnv<T>(
  baseUrl: string,
  operation: () => Promise<T>
): Promise<T> {
  const env = process.env;
  const previous = {
    key: env.PRD_UI_VISION_API_KEY,
    baseUrl: env.PRD_UI_VISION_BASE_URL,
    model: env.PRD_UI_VISION_MODEL,
  };
  env.PRD_UI_VISION_API_KEY = "mock";
  env.PRD_UI_VISION_BASE_URL = baseUrl;
  env.PRD_UI_VISION_MODEL = "mock-vision";
  try {
    return await operation();
  } finally {
    if (previous.key === undefined) delete env.PRD_UI_VISION_API_KEY;
    else env.PRD_UI_VISION_API_KEY = previous.key;
    if (previous.baseUrl === undefined) delete env.PRD_UI_VISION_BASE_URL;
    else env.PRD_UI_VISION_BASE_URL = previous.baseUrl;
    if (previous.model === undefined) delete env.PRD_UI_VISION_MODEL;
    else env.PRD_UI_VISION_MODEL = previous.model;
  }
}

function toolNamesOf(body: string): string[] {
  const request = JSON.parse(body) as {
    tools?: Array<{ function?: { name?: string } }>;
  };
  return (request.tools ?? [])
    .map((tool) => tool.function?.name ?? "")
    .filter((name) => name.length > 0);
}

function hasTool(toolNames: string[], name: string): boolean {
  return toolNames.some(
    (entry) => entry === name || entry.endsWith(`__${name}`)
  );
}

const skipDsh = process.env.SKIP_DSH === "1";

describe.skipIf(skipDsh)("dsh visual critic mock integration", () => {
  it(
    "runs the Visual Critic through the prd-ui-visual profile",
    async () => {
      expect(
        existsSync(dshBin),
        `dsh is not installed at ${dshBin}. Run \`pnpm install\` in pipeline/, or set SKIP_DSH=1 to skip this integration test.`
      ).toBe(true);

      const mock = await startMockServer({ output: critique });
      servers.push(mock);
      const runDir = await makeRunDir();
      const pricing = await loadVisualCriticPricing();

      const result = await withMockProviderEnv(mock.baseUrl, () =>
        runDshVisualCritic(criticInput, {
          runDir,
          dshProfile: "prd-ui-visual",
          maxCostCny: 3,
          pricing,
        })
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
      ) as {
        critique: unknown;
        usageComplete: boolean;
        attempts?: Array<{ stdout?: string; stderr?: string }>;
      };
      expect(evidence.critique).toEqual(critique);
      expect(evidence.usageComplete).toBe(true);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0]).toMatchObject({
        url: "/v1/chat/completions",
        authorization: "Bearer mock",
      });

      // The profile must expose reads but no mutating, orchestration,
      // delegation, or network tools. The model-facing request body is the
      // authoritative tool list.
      const toolNames = toolNamesOf(mock.calls[0]!.body);
      expect(toolNames.length, JSON.stringify(toolNames)).toBeGreaterThan(0);
      for (const required of ["read", "read_image", "glob", "grep"]) {
        expect(
          hasTool(toolNames, required),
          `${required}: ${JSON.stringify(toolNames)}`
        ).toBe(true);
      }
      for (const forbidden of [
        "write",
        "edit",
        "bash",
        "pwsh",
        "workflow",
        "subagent",
        "subagent_fork",
        "send_message",
        "list_agents",
        "web_search",
        "web_fetch",
      ]) {
        expect(
          hasTool(toolNames, forbidden),
          `${forbidden}: ${JSON.stringify(toolNames)}`
        ).toBe(false);
      }

      // Removing the duplicate @prd-ui/runtime-dsh mount must not leave the
      // pinned CLI warning about duplicate registration or inactive entries.
      const cliLogs = (evidence.attempts ?? [])
        .map((attempt) => `${attempt.stdout ?? ""}\n${attempt.stderr ?? ""}`)
        .join("\n");
      expect(cliLogs).not.toMatch(/already registered/i);
      expect(cliLogs).not.toMatch(/did not activate/i);
    },
    240_000
  );

  it(
    "denies a workflow write probe through the prd-ui-visual profile",
    async () => {
      expect(
        existsSync(dshBin),
        `dsh is not installed at ${dshBin}. Run \`pnpm install\` in pipeline/, or set SKIP_DSH=1 to skip this integration test.`
      ).toBe(true);

      // The model tries to reach a file write through the workflow script
      // runner. The profile must not expose `workflow`; dsh rejects the call
      // and the model recovers with the critique.
      const mock = await startMockServer([
        {
          toolCall: {
            id: "call_workflow_probe",
            name: "workflow",
            arguments: JSON.stringify({
              script:
                "await tools.write({ path: 'workflow-probe.txt', content: 'probe' }); return 'written';",
              meta: { name: "workflow-write-probe" },
            }),
          },
        },
        { output: critique },
      ]);
      servers.push(mock);
      const runDir = await makeRunDir();
      const pricing = await loadVisualCriticPricing();

      const result = await withMockProviderEnv(mock.baseUrl, () =>
        runDshVisualCritic(criticInput, {
          runDir,
          dshProfile: "prd-ui-visual",
          maxCostCny: 3,
          pricing,
        })
      );

      expect(result.error).toBeUndefined();
      expect(result.critique).toEqual(critique);
      expect(mock.calls.length).toBeGreaterThanOrEqual(2);

      const toolNames = toolNamesOf(mock.calls[0]!.body);
      expect(hasTool(toolNames, "workflow")).toBe(false);

      const second = JSON.parse(mock.calls[1]!.body) as {
        messages?: Array<{ role?: string; content?: unknown }>;
      };
      const toolMessages = (second.messages ?? []).filter(
        (message) => message.role === "tool"
      );
      expect(toolMessages.length).toBeGreaterThan(0);
      const toolText = JSON.stringify(toolMessages);
      expect(toolText).toMatch(/workflow/i);
      expect(toolText).toMatch(
        /unknown|not found|not registered|unavailable|no such tool|invalid tool|not allowed/i
      );

      // The probe write did not land.
      await expect(
        stat(path.join(runDir, "workflow-probe.txt"))
      ).rejects.toThrow();

      const evidence = JSON.parse(
        await readFile(
          path.join(runDir, "dsh", "visual-critic", "result.json"),
          "utf8"
        )
      ) as { attempts?: Array<{ stdout?: string; stderr?: string }> };
      const cliLogs = (evidence.attempts ?? [])
        .map((attempt) => `${attempt.stdout ?? ""}\n${attempt.stderr ?? ""}`)
        .join("\n");
      expect(cliLogs).not.toMatch(/already registered/i);
      expect(cliLogs).not.toMatch(/did not activate/i);
    },
    240_000
  );
});
