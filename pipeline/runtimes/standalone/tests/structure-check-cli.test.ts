import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RenderMetrics } from "@prd-ui/contracts";
import {
  main,
  parseArgs,
  resolveStructureConfig,
} from "../src/structure-check-cli.js";

const SPEC = {
  meta: {
    pageId: "today",
    project: "fixture",
    name: "Today",
    target: "mobile",
    profile: "b-mobile",
    archetype: "home",
    purpose: "fixture",
    route: "/today",
    roles: ["store_manager"],
    reqRefs: ["REQ-APPT-001"],
    version: "0.1.0",
  },
  layout: {
    type: "MobileShell",
    id: "today.page.root",
    props: { title: "Today" },
    slots: { content: [] },
  },
  states: { default: { name: "default" } },
  interactions: [],
  traceability: { reqMap: {}, designDefaults: [], unmapped: [] },
};

function metrics(documentHeight: number): RenderMetrics {
  return {
    schemaVersion: "1.0",
    project: "fixture",
    pages: [
      {
        pageId: "today",
        target: "mobile",
        viewport: { width: 390, height: 844 },
        documentHeight,
        contentHeight: documentHeight,
        scrollContainer: {
          selector: ".app-scroll",
          clientHeight: 844,
          scrollHeight: documentHeight,
          overflowY: "auto",
        },
        firstScreenNodes: 5,
        widest: { width: 390, overflowX: false },
        fixedFooter: { present: false, height: 0, overlapsContent: false },
        contentBottomGap: 0,
      },
    ],
  };
}

describe("structure:check args", () => {
  it("requires --project", () => {
    expect(() =>
      parseArgs([
        "--spec-run",
        "/tmp/spec",
        "--metrics",
        "/tmp/metrics.json",
        "--out",
        "/tmp/out",
      ])
    ).toThrow(/--project/);
  });

  it("still parses --help without --project", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
  });
});

describe("structure:check project overrides", () => {
  it("applies structure.pageHeightBudget from the project config", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-structure-check-"));
    try {
      const specDir = path.join(dir, "spec-run", "artifacts", "page-spec");
      await mkdir(specDir, { recursive: true });
      await writeFile(path.join(specDir, "today.json"), JSON.stringify(SPEC), "utf8");
      const metricsPath = path.join(dir, "render-metrics.json");
      await writeFile(metricsPath, JSON.stringify(metrics(2050)), "utf8");
      const projectPath = path.join(dir, "project.yaml");
      await writeFile(
        projectPath,
        [
          "project: fixture",
          "brief: brief.json",
          "manifests: {}",
          "structure:",
          "  pageHeightBudget:",
          "    mobile: 2000",
          "    web: 2400",
          "",
        ].join("\n"),
        "utf8"
      );

      expect(resolveStructureConfig(projectPath).pageHeightBudget.mobile).toBe(2000);

      const out = path.join(dir, "out");
      const stderr: string[] = [];
      const code = await main(
        [
          "--spec-run",
          path.join(dir, "spec-run"),
          "--metrics",
          metricsPath,
          "--project",
          projectPath,
          "--out",
          out,
        ],
        { stdout: () => undefined, stderr: (line) => stderr.push(line) }
      );

      expect(stderr).toEqual([]);
      expect(code).toBe(0);
      const report = JSON.parse(
        await readFile(path.join(out, "structure-measured.json"), "utf8")
      ) as {
        findings: Array<{ ruleId: string; evidence: string; severity: string }>;
        summary: { warnings: number; blockers: number };
      };
      expect(report.findings).toHaveLength(1);
      expect(report.findings[0]?.ruleId).toBe("STRUCTURE-MEASURED-HEIGHT");
      expect(report.findings[0]?.evidence).toBe("2050 > 2000");
      expect(report.findings[0]?.severity).toBe("warning");
      expect(report.summary).toEqual({ warnings: 1, blockers: 0 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
