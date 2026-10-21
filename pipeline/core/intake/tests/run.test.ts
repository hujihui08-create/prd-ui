import { describe, expect, it } from "vitest";
import {
  AgentRunnerError,
  type AgentArtifactStorePort,
  type AgentResult,
  type AgentRunnerPort,
  type AgentTask,
  type AgentTaskRole,
} from "@prd-ui/agents";
import type { PrdReviewOutput } from "@prd-ui/contracts";
import {
  briefHash,
  runIntake,
  type RunIntakeInput,
} from "../src/index.js";
import {
  draft,
  iaOutput,
  prdHash,
  prdText,
  project,
  review,
  validPrdSignoff,
} from "./fixtures.js";

const now = "2026-10-20T00:00:00.000Z";
const hashText = (text: string): string => `sha256:${text.length}`;

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
    return hashText(this.files.get(path) ?? "");
  }
}

class StaticRunner implements AgentRunnerPort {
  readonly name = "static";
  readonly model = "static";
  private readonly counts = new Map<AgentTaskRole, number>();

  constructor(private readonly outputs: Partial<Record<AgentTaskRole, unknown>>) {}

  async run(task: AgentTask): Promise<AgentResult> {
    const output = this.outputs[task.role];
    if (output === undefined) {
      throw new AgentRunnerError(
        "AGENT_UNAVAILABLE",
        `missing static output for ${task.role}`
      );
    }
    const count = (this.counts.get(task.role) ?? 0) + 1;
    this.counts.set(task.role, count);
    const checked = task.validate(output);
    if (!checked.success) {
      throw new AgentRunnerError("AGENT_INVALID_OUTPUT", checked.error);
    }
    return {
      output: checked.data,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
      usageComplete: true,
      raw: JSON.stringify(checked.data),
      model: this.model,
    };
  }
}

const prdSignoffText = `# PRD/IA signoff

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

const projectConfig = {
  project,
  brief: "ui-brief.sample.json",
  manifests: {},
};

function makeInput(
  store: MemoryStore,
  overrides: Partial<RunIntakeInput> = {}
): RunIntakeInput {
  const runner = new StaticRunner({
    ia: iaOutput,
    "prd-review": review,
    "ui-briefer": draft,
  });
  return {
    runId: "run-intake-test",
    project,
    runDir: "/tmp/run-intake-test",
    prdText,
    prdPath: "samples/sample-prd.md",
    prdHash,
    projectConfig,
    runners: { ia: runner, "prd-review": runner, "ui-briefer": runner },
    ports: {
      store,
      clock: { now: () => new Date(now) },
      log: { log: async () => undefined },
      validateBrief: () => ({ ok: true, errors: [] }),
      hashText,
      supportedProfiles: ["b-dense", "b-mobile", "c-expressive"],
      supportedArchetypes: [
        "overview",
        "list",
        "detail",
        "form",
        "settings",
        "feed",
        "home",
        "inventory-list",
        "auth",
        "onboarding",
      ],
    },
    signoffPrdIa: prdSignoffText,
    ...overrides,
  };
}

function briefSignoffFor(store: MemoryStore): string {
  const draftRaw = JSON.parse(
    store.files.get("artifacts/ui-brief.draft.json") ?? "null"
  ) as typeof draft;
  const hash = briefHash(hashText, draftRaw.brief);
  return `# Brief signoff

<!-- signoff
{
  "signer": "Test Reviewer",
  "date": "2026-10-20",
  "briefHash": ${JSON.stringify(hash)},
  "answers": [],
  "waivers": [],
  "approvals": []
}
-->
`;
}

describe("runIntake", () => {
  it("stops for brief signoff, then succeeds on resume", async () => {
    const store = new MemoryStore();
    const first = await runIntake(makeInput(store));
    expect(first.status).toBe("awaiting_signoff");
    expect(first.draft?.brief.ia.pages).toHaveLength(8);
    expect(first.briefHash).toMatch(/^sha256:/);
    expect(store.files.has("artifacts/ui-brief.json")).toBe(false);

    const second = await runIntake(
      makeInput(store, {
        resume: true,
        signoffBrief: briefSignoffFor(store),
      })
    );
    expect(second.status).toBe("success");
    expect(second.state.signoff).toEqual({ prdIa: true, brief: true });
    expect(second.brief?.ia.pages).toHaveLength(8);
    expect(store.files.has("artifacts/ui-brief.json")).toBe(true);
  });

  it("can resume from the PRD/IA gate without rerunning review agents", async () => {
    const store = new MemoryStore();
    const first = await runIntake(
      makeInput(store, { signoffPrdIa: undefined })
    );
    expect(first.status).toBe("awaiting_signoff");
    expect(first.state.stage).toBe("prd_ia_gate");
    expect(store.files.has("artifacts/prd-review.json")).toBe(true);
    expect(store.files.has("artifacts/ui-brief.draft.json")).toBe(false);

    const second = await runIntake(
      makeInput(store, { resume: true, signoffPrdIa: prdSignoffText })
    );
    expect(second.status).toBe("awaiting_signoff");
    expect(second.draft?.brief.ia.pages).toHaveLength(8);

    const third = await runIntake(
      makeInput(store, {
        resume: true,
        signoffPrdIa: prdSignoffText,
        signoffBrief: briefSignoffFor(store),
      })
    );
    expect(third.status).toBe("success");
  });

  it("blocks on a PRD blocker and does not run the briefer", async () => {
    const store = new MemoryStore();
    const broken: PrdReviewOutput = {
      ...review,
      findings: [
        {
          id: "PRD-001",
          ruleId: "PRD-SCOPE",
          severity: "blocker",
          category: "scope",
          location: "sec-001",
          evidence: "missing",
          issue: "scope unclear",
          owner: "product_owner",
          confidence: 0.9,
        },
      ],
    };
    const runner = new StaticRunner({
      ia: iaOutput,
      "prd-review": broken,
      "ui-briefer": draft,
    });
    const result = await runIntake(
      makeInput(store, {
        runners: { ia: runner, "prd-review": runner, "ui-briefer": runner },
      })
    );
    expect(result.status).toBe("blocked");
    expect(store.files.has("artifacts/ui-brief.draft.json")).toBe(false);
    const gate = JSON.parse(
      store.files.get("findings/prd-gate.json") ?? "{}"
    ) as { gate: { issues: Array<{ code: string }> } };
    expect(gate.gate.issues.map((issue) => issue.code)).toContain(
      "PRD_BLOCKER_UNWAIVED"
    );
  });

  it("rejects resume when the PRD hash changed", async () => {
    const store = new MemoryStore();
    await runIntake(makeInput(store));
    await expect(
      runIntake(
        makeInput(store, {
          resume: true,
          prdHash: "sha256:different",
        })
      )
    ).rejects.toThrow("PRD_CHANGED");
  });
});
