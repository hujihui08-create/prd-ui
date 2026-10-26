import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  main,
  parseArgs,
  paritySkipReason,
  type SmokeStepResult,
} from "../src/v07-smoke-cli.js";

const temporary: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporary.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function capture(): { stdout: string[]; stderr: string[]; io: { stdout: (line: string) => void; stderr: (line: string) => void } } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (line) => {
        stdout.push(line);
      },
      stderr: (line) => {
        stderr.push(line);
      },
    },
  };
}

const PAGES = ["today", "appointment-list"];

function passed(summary: Record<string, unknown> = {}): Promise<SmokeStepResult> {
  return Promise.resolve({ code: 0, summary });
}

describe("v07:smoke args", () => {
  it("parses the required paths and optional parity inputs", () => {
    const options = parseArgs([
      "--spec-run",
      "/tmp/spec",
      "--html",
      "/tmp/html",
      "--project",
      "/tmp/project.yaml",
      "--out",
      "/tmp/out",
      "--figma",
      "/tmp/figma",
      "--baseline",
      "/tmp/baseline",
      "--json",
    ]);
    expect(options.specRun).toBe(path.resolve("/tmp/spec"));
    expect(options.html).toBe(path.resolve("/tmp/html"));
    expect(options.project).toBe(path.resolve("/tmp/project.yaml"));
    expect(options.out).toBe(path.resolve("/tmp/out"));
    expect(options.figma).toBe(path.resolve("/tmp/figma"));
    expect(options.baseline).toBe(path.resolve("/tmp/baseline"));
    expect(options.json).toBe(true);
  });

  it("rejects unknown arguments", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
  });
});

describe("v07:smoke orchestration", () => {
  it("runs conformance, measure and structure, then skips parity without Figma inputs", async () => {
    const out = await tempDir("v07-smoke-pass-");
    const calls: string[] = [];
    const output = capture();
    const code = await main(
      [
        "--spec-run",
        "/tmp/spec",
        "--html",
        "/tmp/html",
        "--project",
        "/tmp/project.yaml",
        "--out",
        out,
        "--plans",
        "/tmp/plans",
        "--json",
      ],
      output.io,
      {
        runConformance: async (options) => {
          calls.push("conformance");
          expect(options.out).toBe(path.join(out, "conformance"));
          expect(options.plans).toBe(path.resolve("/tmp/plans"));
          return passed({ passed: true, blockers: 0, majors: 0, pages: 8 });
        },
        runMeasure: async (options) => {
          calls.push("measure");
          expect(options.out).toBe(path.join(out, "render", "metrics"));
          return passed({ pages: 8 });
        },
        runStructure: async (options) => {
          calls.push("structure");
          expect(options.metrics).toBe(path.join(out, "render", "metrics", "render-metrics.json"));
          expect(options.out).toBe(path.join(out, "render", "structure"));
          return passed({ warnings: 0, blockers: 0 });
        },
        runParity: async () => {
          calls.push("parity");
          return passed({ passed: true, failed: 0, pages: 2 });
        },
        pageIds: async () => PAGES,
        now: () => new Date("2026-10-26T00:00:00.000Z"),
      }
    );

    expect(code).toBe(0);
    expect(calls).toEqual(["conformance", "measure", "structure"]);
    const summary = JSON.parse(output.stdout.at(-1)!) as Record<string, unknown>;
    expect(summary.passed).toBe(true);
    expect(summary.conformance).toMatchObject({ status: "passed", blockers: 0, pages: 8 });
    expect(summary.measure).toMatchObject({ status: "passed", pages: 8 });
    expect(summary.structure).toMatchObject({ status: "passed", warnings: 0 });
    expect(summary.parity).toMatchObject({ status: "skipped" });
    expect(String((summary.parity as Record<string, unknown>).reason)).toContain(
      "--figma and --baseline"
    );
    const file = await readFile(path.join(out, "v07-smoke.json"), "utf8");
    expect(JSON.parse(file)).toEqual(summary);
  });

  it("uses --figma plans and conformance directory when supplied", async () => {
    const out = await tempDir("v07-smoke-figma-");
    const figma = await tempDir("v07-smoke-figma-evidence-");
    const seen: Array<{ plans?: string; conformanceOut?: string }> = [];
    const code = await main(
      [
        "--spec-run",
        "/tmp/spec",
        "--html",
        "/tmp/html",
        "--project",
        "/tmp/project.yaml",
        "--out",
        out,
        "--figma",
        figma,
        "--json",
      ],
      capture().io,
      {
        runConformance: async (options) => {
          seen.push({ plans: options.plans, conformanceOut: options.out });
          return passed({ blockers: 0, majors: 0, pages: 8 });
        },
        runMeasure: () => passed({ pages: 8 }),
        runStructure: () => passed({ warnings: 0, blockers: 0 }),
        pageIds: async () => PAGES,
      }
    );

    expect(code).toBe(0);
    expect(seen).toEqual([
      { plans: path.join(figma, "plans"), conformanceOut: path.join(figma, "conformance") },
    ]);
  });

  it("stops after conformance blockers and exits 1", async () => {
    const out = await tempDir("v07-smoke-blockers-");
    const calls: string[] = [];
    const output = capture();
    const code = await main(
      [
        "--spec-run",
        "/tmp/spec",
        "--html",
        "/tmp/html",
        "--project",
        "/tmp/project.yaml",
        "--out",
        out,
        "--plans",
        "/tmp/plans",
        "--json",
      ],
      output.io,
      {
        runConformance: async () => {
          calls.push("conformance");
          return { code: 1, summary: { blockers: 2, majors: 0, pages: 8 } };
        },
        runMeasure: async () => {
          calls.push("measure");
          return passed({ pages: 8 });
        },
        runStructure: async () => {
          calls.push("structure");
          return passed({ warnings: 0, blockers: 0 });
        },
        pageIds: async () => PAGES,
      }
    );

    expect(code).toBe(1);
    expect(calls).toEqual(["conformance"]);
    const summary = JSON.parse(output.stdout.at(-1)!) as Record<string, unknown>;
    expect(summary.passed).toBe(false);
    expect(summary.stoppedAt).toBe("conformance");
    expect(summary.conformance).toMatchObject({ status: "failed", blockers: 2 });
    expect(summary.measure).toBeUndefined();
    expect(summary.structure).toBeUndefined();
    expect(summary.parity).toBeUndefined();
  });

  it("treats a measure infrastructure error as exit 2 and stops", async () => {
    const out = await tempDir("v07-smoke-measure-");
    const calls: string[] = [];
    const code = await main(
      [
        "--spec-run",
        "/tmp/spec",
        "--html",
        "/tmp/html",
        "--project",
        "/tmp/project.yaml",
        "--out",
        out,
        "--plans",
        "/tmp/plans",
        "--json",
      ],
      capture().io,
      {
        runConformance: async () => passed({ blockers: 0, majors: 0, pages: 8 }),
        runMeasure: async () => {
          calls.push("measure");
          return { code: 2, summary: {}, stderr: ["BROWSER_LAUNCH_FAILED"] };
        },
        runStructure: async () => {
          calls.push("structure");
          return passed({ warnings: 0, blockers: 0 });
        },
        pageIds: async () => PAGES,
      }
    );

    expect(code).toBe(2);
    expect(calls).toEqual(["measure"]);
  });

  it("treats a thrown step as an infrastructure error", async () => {
    const out = await tempDir("v07-smoke-throw-");
    const code = await main(
      [
        "--spec-run",
        "/tmp/spec",
        "--html",
        "/tmp/html",
        "--project",
        "/tmp/project.yaml",
        "--out",
        out,
        "--plans",
        "/tmp/plans",
        "--json",
      ],
      capture().io,
      {
        runConformance: () => Promise.reject(new Error("SPEC_RUN_EMPTY")),
      }
    );
    expect(code).toBe(2);
  });

  it("fails on structure blockers", async () => {
    const out = await tempDir("v07-smoke-structure-");
    const code = await main(
      [
        "--spec-run",
        "/tmp/spec",
        "--html",
        "/tmp/html",
        "--project",
        "/tmp/project.yaml",
        "--out",
        out,
        "--plans",
        "/tmp/plans",
        "--json",
      ],
      capture().io,
      {
        runConformance: () => passed({ blockers: 0, majors: 0, pages: 8 }),
        runMeasure: () => passed({ pages: 8 }),
        runStructure: () => Promise.resolve({ code: 1, summary: { warnings: 3, blockers: 1 } }),
        pageIds: async () => PAGES,
      }
    );
    expect(code).toBe(1);
  });

  it("runs parity when Figma PNGs and a baseline manifest exist", async () => {
    const out = await tempDir("v07-smoke-parity-");
    const figma = await tempDir("v07-smoke-parity-figma-");
    const baseline = await tempDir("v07-smoke-parity-baseline-");
    await mkdir(path.join(figma, "parity"), { recursive: true });
    for (const pageId of PAGES) {
      await writeFile(path.join(figma, "parity", `figma.${pageId}.png`), "");
    }
    await writeFile(path.join(baseline, "manifest.json"), "{}\n");
    let parityOut: string | undefined;
    const output = capture();
    const code = await main(
      [
        "--spec-run",
        "/tmp/spec",
        "--html",
        "/tmp/html",
        "--project",
        "/tmp/project.yaml",
        "--out",
        out,
        "--figma",
        figma,
        "--baseline",
        baseline,
        "--json",
      ],
      output.io,
      {
        runConformance: () => passed({ blockers: 0, majors: 0, pages: 8 }),
        runMeasure: () => passed({ pages: 8 }),
        runStructure: () => passed({ warnings: 0, blockers: 0 }),
        runParity: async (options) => {
          parityOut = options.out;
          expect(options.figma).toBe(path.join(figma, "parity"));
          expect(options.baseline).toBe(baseline);
          return passed({ passed: true, failed: 0, pages: 2 });
        },
        pageIds: async () => PAGES,
      }
    );

    expect(code).toBe(0);
    expect(parityOut).toBe(path.join(figma, "parity"));
    const summary = JSON.parse(output.stdout.at(-1)!) as Record<string, unknown>;
    expect(summary.parity).toMatchObject({ status: "passed", passed: true, failed: 0 });
  });

  it("fails parity when the comparison fails", async () => {
    const out = await tempDir("v07-smoke-parity-fail-");
    const figma = await tempDir("v07-smoke-parity-fail-figma-");
    const baseline = await tempDir("v07-smoke-parity-fail-baseline-");
    await mkdir(path.join(figma, "parity"), { recursive: true });
    for (const pageId of PAGES) {
      await writeFile(path.join(figma, "parity", `figma.${pageId}.png`), "");
    }
    await writeFile(path.join(baseline, "manifest.json"), "{}\n");
    const code = await main(
      [
        "--spec-run",
        "/tmp/spec",
        "--html",
        "/tmp/html",
        "--project",
        "/tmp/project.yaml",
        "--out",
        out,
        "--figma",
        figma,
        "--baseline",
        baseline,
        "--json",
      ],
      capture().io,
      {
        runConformance: () => passed({ blockers: 0, majors: 0, pages: 8 }),
        runMeasure: () => passed({ pages: 8 }),
        runStructure: () => passed({ warnings: 0, blockers: 0 }),
        runParity: () => Promise.resolve({ code: 1, summary: { passed: false, failed: 2, pages: 2 } }),
        pageIds: async () => PAGES,
      }
    );
    expect(code).toBe(1);
  });

  it("requires a plan directory", async () => {
    const out = await tempDir("v07-smoke-usage-");
    const output = capture();
    const code = await main(
      [
        "--spec-run",
        "/tmp/spec",
        "--html",
        "/tmp/html",
        "--project",
        "/tmp/project.yaml",
        "--out",
        out,
      ],
      output.io,
      {}
    );
    expect(code).toBe(2);
    expect(output.stderr.join("\n")).toContain("--plans or --figma");
  });

  it("exits 2 when the summary cannot be written", async () => {
    const out = await tempDir("v07-smoke-write-");
    await writeFile(path.join(out, "v07-smoke.json"), "not a directory\n");
    const output = capture();
    const code = await main(
      [
        "--spec-run",
        "/tmp/spec",
        "--html",
        "/tmp/html",
        "--project",
        "/tmp/project.yaml",
        "--out",
        path.join(out, "v07-smoke.json"),
        "--plans",
        "/tmp/plans",
        "--json",
      ],
      output.io,
      {
        runConformance: () => passed({ blockers: 0, majors: 0, pages: 8 }),
        runMeasure: () => passed({ pages: 8 }),
        runStructure: () => passed({ warnings: 0, blockers: 0 }),
        pageIds: async () => PAGES,
      }
    );
    expect(code).toBe(2);
    expect(output.stderr.join("\n")).toContain("V07_SMOKE_SUMMARY_WRITE_FAILED");
  });
});

describe("v07:smoke parity skip reasons", () => {
  it("names the missing inputs", async () => {
    const options = parseArgs([
      "--spec-run",
      "/tmp/spec",
      "--html",
      "/tmp/html",
      "--project",
      "/tmp/project.yaml",
      "--out",
      "/tmp/out",
    ]);
    expect(await paritySkipReason(options, PAGES)).toContain("--figma and --baseline");
  });

  it("names the pages with missing Figma PNGs", async () => {
    const figma = await tempDir("v07-smoke-reason-figma-");
    const baseline = await tempDir("v07-smoke-reason-baseline-");
    const options = parseArgs([
      "--spec-run",
      "/tmp/spec",
      "--html",
      "/tmp/html",
      "--project",
      "/tmp/project.yaml",
      "--out",
      "/tmp/out",
      "--figma",
      figma,
      "--baseline",
      baseline,
    ]);
    expect(await paritySkipReason(options, PAGES)).toContain("today, appointment-list");
  });

  it("requires a baseline manifest when PNGs exist", async () => {
    const figma = await tempDir("v07-smoke-reason2-figma-");
    const baseline = await tempDir("v07-smoke-reason2-baseline-");
    await mkdir(path.join(figma, "parity"), { recursive: true });
    for (const pageId of PAGES) {
      await writeFile(path.join(figma, "parity", `figma.${pageId}.png`), "");
    }
    const options = parseArgs([
      "--spec-run",
      "/tmp/spec",
      "--html",
      "/tmp/html",
      "--project",
      "/tmp/project.yaml",
      "--out",
      "/tmp/out",
      "--figma",
      figma,
      "--baseline",
      baseline,
    ]);
    expect(await paritySkipReason(options, PAGES)).toContain("baseline manifest");
  });
});
