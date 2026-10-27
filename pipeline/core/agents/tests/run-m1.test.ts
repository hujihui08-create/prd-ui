import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AgentRunnerError,
  M1RunStateSchema,
  runM1,
  type AgentArtifactStorePort,
  type AgentResult,
  type AgentRole,
  type AgentRunnerPort,
  type AgentTask,
  type RunM1Input,
} from "../src/index.js";
import { employeeBrief, iaOutput, interactionOutput, visualOutput } from "./fixtures.js";

class MemoryStore implements AgentArtifactStorePort {
  readonly files = new Map<string, string>();

  async writeJson(path: string, value: unknown): Promise<void> {
    this.files.set(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  async writeText(path: string, value: string): Promise<void> {
    this.files.set(path, value);
  }

  async appendText(path: string, value: string): Promise<void> {
    this.files.set(path, `${this.files.get(path) ?? ""}${value}`);
  }

  async readText(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`ENOENT: ${path}`);
    return value;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async hash(path: string): Promise<string> {
    const value = await this.readText(path);
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
  }

  json<T>(path: string): T {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`missing ${path}`);
    return JSON.parse(value) as T;
  }

  text(path: string): string | undefined {
    return this.files.get(path);
  }
}

class ScriptedRunner implements AgentRunnerPort {
  readonly name = "scripted";
  readonly model = "scripted-model";
  readonly calls: AgentTask[] = [];
  private index = 0;

  constructor(
    readonly role: AgentRole,
    private readonly queue: Array<AgentResult | Error>
  ) {}

  async run(task: AgentTask): Promise<AgentResult> {
    this.calls.push(task);
    const next = this.queue[this.index];
    this.index += 1;
    if (next === undefined) {
      throw new Error(`SCRIPT_EXHAUSTED: ${task.role}`);
    }
    if (next instanceof Error) throw next;
    return next;
  }
}

const usage = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0 };
const pricing = {
  inputMissUsdPerMillion: 1,
  inputCacheUsdPerMillion: 0.1,
  outputUsdPerMillion: 2,
  usdToCny: 7,
};
const now = "2026-10-20T00:00:00.000Z";

function ok(output: unknown, extra: Partial<AgentResult> = {}): AgentResult {
  return {
    output,
    usage,
    usageComplete: true,
    raw: JSON.stringify(output),
    stdout: "ok",
    stderr: "",
    ...extra,
  };
}

function signoff(waivers: unknown[] = []): string {
  return [
    "# Signoff",
    "",
    "<!-- signoff",
    JSON.stringify({ signer: "tester", date: "2026-10-20", waivers }),
    "-->",
    "",
  ].join("\n");
}

function runners(input: {
  ia: Array<AgentResult | Error>;
  interaction?: Array<AgentResult | Error>;
  visual?: Array<AgentResult | Error>;
}) {
  return {
    ia: new ScriptedRunner("ia", input.ia),
    interaction: new ScriptedRunner("interaction", input.interaction ?? [ok(interactionOutput)]),
    "visual-style": new ScriptedRunner("visual-style", input.visual ?? [ok(visualOutput)]),
  };
}

async function run(
  store: MemoryStore,
  scripted: Record<AgentRole, AgentRunnerPort>,
  overrides: Partial<RunM1Input> = {}
) {
  const logs: Array<Record<string, unknown>> = [];
  const result = await runM1({
    runId: "run-test",
    project: "employee-app",
    runDir: "/tmp/run-test",
    brief: employeeBrief,
    prdText: "# Employee PRD",
    runners: scripted,
    ports: {
      store,
      clock: { now: () => new Date(now) },
      log: { log: async (event) => { logs.push(event as Record<string, unknown>); } },
    },
    pricing,
    maxCostCny: 10,
    ...overrides,
  });
  return { result, logs };
}

const blockerFinding = {
  id: "IA-001",
  severity: "blocker" as const,
  area: "flow" as const,
  evidence: "today -> inventory",
  issue: "inventory has no return path",
};
const iaWithBlocker = { ...iaOutput, findings: { findings: [blockerFinding] } };

describe("runM1", () => {
  it("passes every page profile map to the interaction prompt", async () => {
    const store = new MemoryStore();
    store.files.set("signoff/ia.md", signoff());
    store.files.set("signoff/visual-style.md", signoff());
    const mixed = structuredClone(employeeBrief);
    mixed.ia.pages[1]!.profile = "c-expressive";
    const scripted = runners({ ia: [ok(iaOutput)] });

    await run(store, scripted, {
      brief: mixed,
      catalogsByProfile: {
        "b-mobile": { meta: { library: "b-mobile" }, components: [{ id: "ListRow" }] },
        "c-expressive": {
          meta: { library: "c-expressive" },
          components: [{ id: "FeedCard" }],
        },
      },
      motionTokensByProfile: {
        "b-mobile": { duration: { fast: "120ms" }, easing: { standard: "ease-out" } },
        "c-expressive": {
          duration: { slow: "320ms" },
          easing: { emphasized: "ease-in-out" },
        },
      },
    });

    const prompt = scripted.interaction.calls[0]?.prompt ?? "";
    expect(prompt).toContain("b-mobile");
    expect(prompt).toContain("c-expressive");
    expect(prompt).toContain("ListRow");
    expect(prompt).toContain("FeedCard");
  });

  it("runs IA first, then produces the full artifact set with signoff", async () => {
    const store = new MemoryStore();
    store.files.set("signoff/ia.md", signoff());
    store.files.set("signoff/visual-style.md", signoff());
    const scripted = runners({ ia: [ok(iaOutput)] });

    const { result } = await run(store, scripted);

    expect(result.state.status).toBe("success");
    expect(result.passed).toBe(true);
    expect(result.state.gates).toEqual({
      ia: "passed",
      interaction: "passed",
      visualStyle: "passed",
    });
    expect(result.state.signoff).toEqual({ ia: true, visualStyle: true });
    expect(scripted.ia.calls[0]?.role).toBe("ia");
    expect(scripted.interaction.calls).toHaveLength(1);
    expect(scripted["visual-style"].calls).toHaveLength(1);

    for (const path of [
      "state.json",
      "artifacts/ia-map.json",
      "artifacts/ia-findings.json",
      "artifacts/ia-proposed.json",
      "artifacts/ia-review.md",
      "artifacts/interaction-spec.json",
      "artifacts/motion-spec.json",
      "artifacts/interaction-review.md",
      "artifacts/visual-style.json",
      "artifacts/asset-briefs/icon-home.json",
      "artifacts/asset-briefs/icon-plus.json",
      "artifacts/asset-briefs/icon-package.json",
      "agents/ia/prompt.md",
      "agents/ia/output.json",
      "agents/ia/raw.json",
      "agents/ia/history.json",
      "findings/ia-gate.json",
      "findings/interaction-gate.json",
      "findings/visual-style-gate.json",
    ]) {
      expect(store.files.has(path), path).toBe(true);
    }

    const iaMap = store.json<{ promptHash: string; model: string; schemaVersion: string }>(
      "artifacts/ia-map.json"
    );
    expect(iaMap.promptHash).toBe(await store.hash("agents/ia/prompt.md"));
    expect(iaMap.model).toBe("scripted-model");
    expect(iaMap.schemaVersion).toBe("1.0");
    expect(result.state.agents.ia.usage?.inputTokens).toBe(1000);
    expect(result.state.costCny).toBeGreaterThan(0);
    expect(M1RunStateSchema.parse(result.state)).toMatchObject({ status: "success" });
  });

  it("stops before design when IA has an unwaived blocker", async () => {
    const store = new MemoryStore();
    store.files.set("signoff/ia.md", signoff());
    store.files.set("signoff/visual-style.md", signoff());
    const scripted = runners({ ia: [ok(iaWithBlocker)] });

    const { result } = await run(store, scripted);

    expect(result.state.status).toBe("failed");
    expect(result.state.gates.ia).toBe("failed");
    expect(result.state.agents.ia.status).toBe("failed");
    expect(result.state.agents.interaction.status).toBe("skipped");
    expect(result.state.agents["visual-style"].status).toBe("skipped");
    expect(scripted.interaction.calls).toHaveLength(0);
    expect(scripted["visual-style"].calls).toHaveLength(0);
    expect(store.files.has("artifacts/interaction-spec.json")).toBe(false);
    expect(store.files.has("artifacts/ia-map.json")).toBe(true);
  });

  it("passes a blocked IA when the signoff carries a valid waiver", async () => {
    const store = new MemoryStore();
    store.files.set(
      "signoff/ia.md",
      signoff([
        {
          findingId: "IA-001",
          owner: "店长",
          reason: "下一迭代补齐",
          expires: "2099-01-01",
        },
      ])
    );
    store.files.set("signoff/visual-style.md", signoff());
    const scripted = runners({ ia: [ok(iaWithBlocker)] });

    const { result } = await run(store, scripted);

    expect(result.state.status).toBe("success");
    expect(result.state.gates.ia).toBe("waived");
    expect(result.state.signoff.ia).toBe(true);
  });

  it("awaits IA signoff and skips design when review is not allowed", async () => {
    const store = new MemoryStore();
    const scripted = runners({ ia: [ok(iaOutput)] });

    const { result } = await run(store, scripted);

    expect(result.state.status).toBe("awaiting_signoff");
    expect(result.state.signoff.ia).toBe(false);
    expect(result.state.agents.interaction.status).toBe("skipped");
    expect(result.state.agents["visual-style"].status).toBe("skipped");
    expect(scripted.interaction.calls).toHaveLength(0);
    expect(scripted["visual-style"].calls).toHaveLength(0);
    expect(store.files.has("artifacts/ia-map.json")).toBe(true);
  });

  it("runs design with --allow-unreviewed but never reports success", async () => {
    const store = new MemoryStore();
    const scripted = runners({ ia: [ok(iaOutput)] });

    const { result } = await run(store, scripted, { allowUnreviewed: true });

    expect(result.state.status).toBe("awaiting_signoff");
    expect(result.passed).toBe(false);
    expect(scripted.interaction.calls).toHaveLength(1);
    expect(scripted["visual-style"].calls).toHaveLength(1);
    expect(store.files.has("artifacts/visual-style.json")).toBe(true);
    expect(result.state.signoff).toEqual({ ia: false, visualStyle: false });
  });

  it("records stage progression and the complete evidence set", async () => {
    const store = new MemoryStore();
    store.files.set("signoff/ia.md", signoff());
    store.files.set("signoff/visual-style.md", signoff());
    const scripted = runners({ ia: [ok(iaOutput)] });

    const { result, logs } = await run(store, scripted);

    const stages = logs
      .filter((event) => event.type === "state")
      .map((event) => event.stage as string);
    const unique = stages.filter(
      (stage, index) => index === 0 || stage !== stages[index - 1]
    );
    expect(unique).toEqual([
      "init",
      "ia",
      "ia_gate",
      "design",
      "design_gate",
      "signoff",
      "done",
    ]);
    expect(result.state.stage).toBe("done");

    for (const role of ["ia", "interaction", "visual-style"] as const) {
      for (const file of [
        "prompt.md",
        "output.json",
        "raw.json",
        "stdout.txt",
        "stderr.txt",
        "session.json",
        "history.json",
        "attempts/01/prompt.md",
      ]) {
        expect(store.files.has(`agents/${role}/${file}`), `${role}/${file}`).toBe(
          true
        );
      }
    }

    for (const path of [
      "artifacts/ia-map.json",
      "artifacts/ia-findings.json",
      "artifacts/ia-proposed.json",
      "artifacts/interaction-spec.json",
      "artifacts/motion-spec.json",
      "artifacts/visual-style.json",
    ]) {
      const artifact = store.json<Record<string, unknown>>(path);
      expect(artifact, path).toMatchObject({
        schemaVersion: "1.0",
        project: "employee-app",
        model: "scripted-model",
      });
      expect(typeof artifact.generatedAt, path).toBe("string");
      expect(String(artifact.promptHash), path).toMatch(/^sha256:/);
    }

    for (const path of [
      "findings/ia-gate.json",
      "findings/interaction-gate.json",
      "findings/visual-style-gate.json",
    ]) {
      expect(store.json<Record<string, unknown>>(path)).toMatchObject({
        schemaVersion: "1.0",
        role: expect.any(String),
        gate: expect.objectContaining({ passed: true }),
      });
    }
  });

  it("runs interaction and visual style concurrently after IA", async () => {
    const store = new MemoryStore();
    store.files.set("signoff/ia.md", signoff());
    store.files.set("signoff/visual-style.md", signoff());

    let designStarted = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner: AgentRunnerPort = {
      name: "barrier",
      model: "barrier-model",
      async run(task) {
        if (task.role === "ia") return ok(iaOutput);
        designStarted += 1;
        if (designStarted === 2) release();
        await barrier;
        return ok(task.role === "interaction" ? interactionOutput : visualOutput);
      },
    };

    const { result } = await Promise.race([
      run(store, {
        ia: runner,
        interaction: runner,
        "visual-style": runner,
      }),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error("design agents did not run concurrently")),
          2_000
        );
      }),
    ]);

    expect(designStarted).toBe(2);
    expect(result.state.status).toBe("success");
  });

  it("isolates a design failure and keeps the other agent artifact", async () => {
    const store = new MemoryStore();
    store.files.set("signoff/ia.md", signoff());
    store.files.set("signoff/visual-style.md", signoff());
    const scripted = runners({
      ia: [ok(iaOutput)],
      interaction: [ok({ invalid: true })],
    });

    const { result } = await run(store, scripted);

    expect(result.state.status).toBe("partial");
    expect(result.state.agents.interaction.status).toBe("failed");
    expect(result.state.agents["visual-style"].status).toBe("passed");
    expect(store.files.has("artifacts/interaction-spec.json")).toBe(false);
    expect(store.files.has("artifacts/visual-style.json")).toBe(true);
  });

  it("stops on budget and marks remaining agents budget_exceeded", async () => {
    const store = new MemoryStore();
    const scripted = runners({ ia: [ok(iaOutput)] });

    const { result } = await run(store, scripted, { maxCostCny: 0.001 });

    expect(result.state.status).toBe("budget_exceeded");
    expect(result.state.agents.ia.status).toBe("budget_exceeded");
    expect(result.state.agents.interaction.status).toBe("budget_exceeded");
    expect(result.state.agents["visual-style"].status).toBe("budget_exceeded");
    expect(scripted.interaction.calls).toHaveLength(0);
    expect(scripted["visual-style"].calls).toHaveLength(0);
  });

  it("enforces a lower per-agent cap", async () => {
    const store = new MemoryStore();
    const scripted = runners({ ia: [ok(iaOutput)] });

    const { result } = await run(store, scripted, {
      agentMaxCostCny: { ia: 0.001 },
    });

    expect(result.state.status).toBe("budget_exceeded");
    expect(result.state.agents.ia.status).toBe("budget_exceeded");
    expect(scripted.interaction.calls).toHaveLength(0);
  });

  it("fails closed on incomplete usage, and allows it explicitly", async () => {
    const store = new MemoryStore();
    store.files.set("signoff/ia.md", signoff());
    store.files.set("signoff/visual-style.md", signoff());
    const incomplete = ok(iaOutput, { usageComplete: false });

    const closed = await run(
      store,
      // Fresh store/runners per assertion to avoid state bleed.
      runners({ ia: [incomplete] })
    );
    expect(closed.result.state.status).toBe("usage_incomplete");
    expect(closed.result.state.agents.ia.status).toBe("usage_incomplete");
    expect(closed.result.state.agents.interaction.status).toBe("usage_incomplete");

    const allowed = await run(
      store,
      runners({ ia: [incomplete] }),
      { allowUnknownCost: true }
    );
    expect(allowed.result.state.status).toBe("success");
    expect(allowed.result.state.degraded).toBe(true);
    expect(allowed.result.state.usageComplete).toBe(false);
  });

  it("retries model errors up to three attempts and merges usage", async () => {
    const store = new MemoryStore();
    store.files.set("signoff/ia.md", signoff());
    store.files.set("signoff/visual-style.md", signoff());
    const failure = new AgentRunnerError("AGENT_EXIT_NONZERO", "network down", {
      usage,
      usageComplete: true,
    });
    const scripted = runners({ ia: [failure, failure, ok(iaOutput)] });

    const { result } = await run(store, scripted);

    expect(result.state.status).toBe("success");
    expect(result.state.agents.ia.attempts).toBe(3);
    expect(result.state.agents.ia.usage?.inputTokens).toBe(3000);
    expect(scripted.ia.calls).toHaveLength(3);
  });

  it("fails after three model errors", async () => {
    const store = new MemoryStore();
    const failure = new AgentRunnerError("AGENT_EXIT_NONZERO", "network down");
    const scripted = runners({ ia: [failure, failure, failure] });

    const { result } = await run(store, scripted);

    expect(result.state.status).toBe("failed");
    expect(result.state.agents.ia.attempts).toBe(3);
    expect(scripted.ia.calls).toHaveLength(3);
  });

  it("repairs a failed design gate twice, then succeeds", async () => {
    const store = new MemoryStore();
    store.files.set("signoff/ia.md", signoff());
    store.files.set("signoff/visual-style.md", signoff());
    const badInteraction = {
      ...interactionOutput,
      interactionSpec: {
        pages: interactionOutput.interactionSpec.pages.map((page) =>
          page.id === "today"
            ? {
                ...page,
                triggers: page.triggers.filter((trigger) => trigger.action !== "order.create"),
              }
            : page
        ),
      },
    };
    const scripted = runners({
      ia: [ok(iaOutput)],
      interaction: [ok(badInteraction), ok(badInteraction), ok(interactionOutput)],
    });

    const { result } = await run(store, scripted);

    expect(result.state.status).toBe("success");
    expect(result.state.agents.interaction.gateRounds).toBe(2);
    expect(scripted.interaction.calls).toHaveLength(3);
    expect(store.files.has("agents/interaction/attempts/03/prompt.md")).toBe(true);
  });

  it("stops after two gate repair rounds and marks the run partial", async () => {
    const store = new MemoryStore();
    store.files.set("signoff/ia.md", signoff());
    store.files.set("signoff/visual-style.md", signoff());
    const badInteraction = {
      ...interactionOutput,
      interactionSpec: {
        pages: interactionOutput.interactionSpec.pages.map((page) =>
          page.id === "today"
            ? {
                ...page,
                triggers: page.triggers.filter((trigger) => trigger.action !== "order.create"),
              }
            : page
        ),
      },
    };
    const scripted = runners({
      ia: [ok(iaOutput)],
      interaction: [ok(badInteraction), ok(badInteraction), ok(badInteraction)],
    });

    const { result } = await run(store, scripted);

    expect(result.state.status).toBe("partial");
    expect(result.state.gates.interaction).toBe("failed");
    expect(result.state.agents.interaction.status).toBe("failed");
    expect(scripted.interaction.calls).toHaveLength(3);
    expect(result.state.agents["visual-style"].status).toBe("passed");
  });

  it("redacts secrets in evidence and logs, and records model/promptHash", async () => {
    const store = new MemoryStore();
    store.files.set("signoff/ia.md", signoff());
    store.files.set("signoff/visual-style.md", signoff());
    const secret = "sk-abcdefgh12345678";
    const scripted = runners({
      ia: [
        ok(
          { ...iaOutput, reviewMarkdown: `token: ${secret}` },
          { stdout: `authorization: Bearer ${secret}`, stderr: `api_key=${secret}` }
        ),
      ],
    });

    const { result, logs } = await run(store, scripted);

    const stdout = store.text("agents/ia/stdout.txt") ?? "";
    const stderr = store.text("agents/ia/stderr.txt") ?? "";
    const output = store.text("agents/ia/output.json") ?? "";
    expect(stdout).not.toContain(secret);
    expect(stderr).not.toContain(secret);
    expect(output).not.toContain(secret);
    expect(JSON.stringify(logs)).not.toContain(secret);
    expect(store.files.has("agents/ia/session.json")).toBe(true);
    expect(result.state.agents.ia.model).toBe("scripted-model");
    expect(result.state.agents.ia.promptHash).toMatch(/^sha256:/);
  });
});
