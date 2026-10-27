import type { Finding, RenderMetrics, StructureConfig } from "@prd-ui/contracts";

/**
 * Advisory measured-structure checks. Unlike `validateStructure`, these read
 * the rendered geometry written by `render:measure` instead of estimating from
 * the Page Spec tree. Findings are warnings in v0.7.
 *
 * Rules:
 * - `STRUCTURE-MEASURED-HEIGHT`: the measured page height exceeds the
 *   target-specific budget.
 * - `STRUCTURE-MEASURED-OVERFLOW-X`: the widest node is wider than the
 *   viewport.
 * - `STRUCTURE-MEASURED-FOOTER-OVERLAP`: a present fixed footer covers the
 *   bottom of the page content.
 */
export function checkMeasuredStructure(
  metrics: RenderMetrics,
  config: StructureConfig
): Finding[] {
  const findings: Finding[] = [];
  const push = (ruleId: string, location: string, evidence: string, issue: string): void => {
    findings.push({
      id: `${ruleId}-${findings.length + 1}`,
      ruleId,
      severity: "warning",
      category: "structure",
      location,
      evidence,
      issue,
    });
  };
  for (const page of metrics.pages) {
    const budget = config.pageHeightBudget[page.target];
    if (page.documentHeight > budget) {
      push(
        "STRUCTURE-MEASURED-HEIGHT",
        page.pageId,
        `${page.documentHeight} > ${budget}`,
        `Measured height ${page.documentHeight}px exceeds ${budget}px.`
      );
    }
    if (page.widest.overflowX) {
      push(
        "STRUCTURE-MEASURED-OVERFLOW-X",
        page.widest.specId ?? page.pageId,
        String(page.widest.width),
        "Element is wider than the viewport."
      );
    }
    if (page.fixedFooter.present && page.fixedFooter.overlapsContent) {
      push(
        "STRUCTURE-MEASURED-FOOTER-OVERLAP",
        page.pageId,
        String(page.contentBottomGap),
        "Fixed footer overlaps page content."
      );
    }
  }
  return findings;
}
