import { describe, expect, it } from "vitest";
import { main, parseArgs } from "../src/block-experiment-cli.js";

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

  it("rejects a missing option value", () => {
    expect(() => parseArgs(["--pages"])).toThrow(/missing value for --pages/);
  });

  it("prints usage for --help", async () => {
    const output = collector();
    const code = await main(["--help"], output.io);
    expect(code).toBe(0);
    expect(output.stdout.join("\n")).toContain("block:experiment");
  });

  it("fails closed for --runtime dsh until Task 17", async () => {
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
    expect(output.stderr.join("\n")).toContain("BLOCK_RUNTIME_NOT_IMPLEMENTED");
  });
});
