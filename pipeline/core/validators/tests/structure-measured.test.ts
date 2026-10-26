import { describe, expect, it } from "vitest";
import type { RenderMetrics } from "@prd-ui/contracts";
import { checkMeasuredStructure } from "../src/index.js";

const metrics: RenderMetrics = {
  schemaVersion: "1.0",
  project: "fixture",
  pages: [
    {
      pageId: "today",
      target: "mobile",
      viewport: { width: 390, height: 844 },
      documentHeight: 2500,
      scrollContainer: {
        selector: ".app-scroll",
        clientHeight: 716,
        scrollHeight: 2500,
        overflowY: "auto",
      },
      firstScreenNodes: 10,
      foldSpecId: "today.card.callbacks",
      widest: { specId: "today.calendar", width: 420, overflowX: true },
      fixedFooter: { present: true, height: 64, overlapsContent: true },
      contentBottomGap: -4,
    },
  ],
};

describe("checkMeasuredStructure", () => {
  it("reports measured height, overflow-x, and footer overlap", () => {
    const findings = checkMeasuredStructure(metrics, {
      maxRepeatedSections: 2,
      pageHeightBudget: { mobile: 2100, web: 2400 },
    });
    expect(findings.some((finding) => finding.ruleId === "STRUCTURE-MEASURED-HEIGHT")).toBe(true);
    expect(findings.some((finding) => finding.ruleId === "STRUCTURE-MEASURED-OVERFLOW-X")).toBe(true);
    expect(findings.some((finding) => finding.ruleId === "STRUCTURE-MEASURED-FOOTER-OVERLAP")).toBe(true);
    expect(findings.every((finding) => finding.severity === "warning")).toBe(true);
  });

  it("uses the target-specific budget", () => {
    const findings = checkMeasuredStructure(
      {
        ...metrics,
        pages: [
          {
            ...metrics.pages[0]!,
            target: "web",
            documentHeight: 2200,
            widest: { specId: "today.table", width: 1000, overflowX: false },
            fixedFooter: { present: false, height: 0, overlapsContent: false },
            contentBottomGap: 0,
          },
        ],
      },
      { maxRepeatedSections: 2, pageHeightBudget: { mobile: 2100, web: 2400 } }
    );
    expect(findings).toHaveLength(0);
  });
});
