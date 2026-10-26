import { describe, expect, it } from "vitest";
import { AgentRunnerError } from "@prd-ui/agents";
import type { BlockContentDraft, BlockSpec, ReviewPricing } from "@prd-ui/contracts";
import {
  BlockBudgetExceededError,
  BlockCostBudget,
  MAX_BLOCK_RETRIES,
  generateBlockWithRetries,
  isBlockInfraError,
  main,
  parseArgs,
} from "../src/block-experiment-cli.js";
import type { BlockGeneratorPort } from "../src/block/generator.js";

function collector(): {
  io: { stdout: (line: string) => void; stderr: (line: string) => void };
  stdout: string[];
  stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    },
    stdout,
    stderr,
  };
}

const block: BlockSpec = {
  schemaVersion: "1.0",
  blockId: "today.content.0",
  pageId: "today",
  slot: "content",
  index: 0,
  role: "quick-actions",
  allowedComponents: ["Card", "Row"],
  tokenProfile: "b-mobile",
  requiredStates: ["default"],
  root: { id: "today.card.quick-actions", type: "Card", props: { title: "快捷操作" } },
  hash: "sha256:test",
};

const draft: BlockContentDraft = {
  schemaVersion: "1.0",
  blockId: block.blockId,
  root: structuredClone(block.root),
};

const pricing: ReviewPricing = {
  inputMissUsdPerMillion: 0.3,
  inputCacheUsdPerMillion: 0.006,
  outputUsdPerMillion: 1.2,
  usdToCny: 7.2,
};

function generator(
  run: () => Promise<BlockContentDraft>
): BlockGeneratorPort & { calls: number } {
  const state = {
    calls: 0,
    async generate(): Promise<BlockContentDraft> {
      state.calls += 1;
      return run();
    },
  };
  return state;
}

describe("block:experiment CLI", () => {
  it("parses fixture-mode arguments", () => {
    const options = parseArgs([
      "--project",
      "samples/projects/employee-app-phase2/project.yaml",
      "--baseline",
      "artifacts/employee-app-phase2/figma/spec-source",
      "--pages",
      "today, appointment-list",
      "--fixtures",
      "samples/agents/blocks",
      "--max-cost-cny",
      "2.5",
      "--runs",
      "/tmp/block",
      "--json",
    ]);
    expect(options.project).toMatch(/samples\/projects\/employee-app-phase2\/project\.yaml$/);
    expect(options.baseline).toMatch(/artifacts\/employee-app-phase2\/figma\/spec-source$/);
    expect(options.pages).toEqual(["today", "appointment-list"]);
    expect(options.fixtures).toMatch(/samples\/agents\/blocks$/);
    expect(options.maxCostCny).toBe(2.5);
    expect(options.runs).toBe("/tmp/block");
    expect(options.json).toBe(true);
  });

  it("parses dsh-mode profile and pricing", () => {
    const options = parseArgs([
      "--runtime",
      "dsh",
      "--profile",
      "prd-ui-agents",
      "--pricing",
      "pricing.json",
    ]);
    expect(options.runtime).toBe("dsh");
    expect(options.profile).toBe("prd-ui-agents");
    expect(options.pricingPath).toMatch(/pricing\.json$/);
  });

  it("rejects a missing option value", () => {
    expect(() => parseArgs(["--pages"])).toThrow(/missing value for --pages/);
  });

  it("prints usage for --help", async () => {
    const output = collector();
    const code = await main(["--help"], output.io);
    expect(code).toBe(0);
    expect(output.stdout.join("\n")).toContain("block:experiment");
  });

  it("fails closed for --runtime dsh without provider env", async () => {
    const savedBase = process.env.PRD_UI_VISION_BASE_URL;
    const savedModel = process.env.PRD_UI_VISION_MODEL;
    process.env.PRD_UI_VISION_BASE_URL = "";
    process.env.PRD_UI_VISION_MODEL = "";
    try {
      const output = collector();
      const code = await main(
        [
          "--project",
          "samples/projects/employee-app-phase2/project.yaml",
          "--baseline",
          "artifacts/employee-app-phase2/figma/spec-source",
          "--runtime",
          "dsh",
          "--runs",
          "/tmp/block",
        ],
        output.io
      );
      expect(code).toBe(2);
      expect(output.stderr.join("\n")).toContain("CONFIGURATION_ERROR");
    } finally {
      if (savedBase === undefined) delete process.env.PRD_UI_VISION_BASE_URL;
      else process.env.PRD_UI_VISION_BASE_URL = savedBase;
      if (savedModel === undefined) delete process.env.PRD_UI_VISION_MODEL;
      else process.env.PRD_UI_VISION_MODEL = savedModel;
    }
  });

  it("rejects fixture mode combined with --runtime dsh", async () => {
    const output = collector();
    const code = await main(
      [
        "--project",
        "samples/projects/employee-app-phase2/project.yaml",
        "--baseline",
        "artifacts/employee-app-phase2/figma/spec-source",
        "--runtime",
        "dsh",
        "--fixtures",
        "samples/agents/blocks",
        "--runs",
        "/tmp/block",
      ],
      output.io
    );
    expect(code).toBe(2);
    expect(output.stderr.join("\n")).toContain("--fixtures selects fixture mode");
  });
});

describe("block experiment retries", () => {
  it("retries a failing block at most twice", async () => {
    let attempts = 0;
    const alwaysFails = generator(async () => {
      attempts += 1;
      throw new Error("BLOCK_CONTENT_INVALID: bad draft");
    });
    let cost = 0;
    await expect(
      generateBlockWithRetries({
        pageId: "today",
        block,
        generator: alwaysFails,
        onCost: (cny) => {
          cost += cny;
        },
      })
    ).rejects.toThrow(/BLOCK_CONTENT_INVALID/);
    expect(attempts).toBe(MAX_BLOCK_RETRIES + 1);
    expect(cost).toBe(0);
  });

  it("returns the draft and retry count after a transient failure", async () => {
    let attempts = 0;
    const flaky = generator(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("BLOCK_CONTENT_INVALID: bad draft");
      return draft;
    });
    const result = await generateBlockWithRetries({
      pageId: "today",
      block,
      generator: flaky,
      onCost: () => {},
    });
    expect(result.retries).toBe(1);
    expect(attempts).toBe(2);
  });

  it("does not retry infrastructure failures", async () => {
    const unavailable = generator(async () => {
      throw new AgentRunnerError("AGENT_UNAVAILABLE", "dsh binary not found");
    });
    await expect(
      generateBlockWithRetries({
        pageId: "today",
        block,
        generator: unavailable,
        onCost: () => {},
      })
    ).rejects.toBeInstanceOf(AgentRunnerError);
    expect(unavailable.calls).toBe(1);
    expect(isBlockInfraError(new AgentRunnerError("AGENT_UNAVAILABLE", "missing"))).toBe(true);
    expect(isBlockInfraError(new AgentRunnerError("AGENT_INVALID_OUTPUT", "bad"))).toBe(false);
  });
});

describe("block experiment budget", () => {
  it("charges usage and stops at the cap", () => {
    const budget = new BlockCostBudget(0.02, pricing);
    const usage = { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0 };
    const cost = budget.charge(usage);
    expect(cost).toBeGreaterThan(0);
    expect(budget.spentCny).toBeCloseTo(cost);
    expect(budget.canAfford(usage)).toBe(false);
    expect(() => budget.charge(usage)).toThrow(BlockBudgetExceededError);
    expect(() => budget.charge(usage)).toThrow(/BUDGET_EXCEEDED/);
  });

  it("treats the exact cap as affordable", () => {
    const budget = new BlockCostBudget(0.01, pricing);
    const usage = { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0 };
    const single = new BlockCostBudget(Number.POSITIVE_INFINITY, pricing).charge(usage);
    const exact = new BlockCostBudget(single, pricing);
    expect(() => exact.charge(usage)).not.toThrow();
    expect(exact.spentCny).toBeCloseTo(single);
  });
});
