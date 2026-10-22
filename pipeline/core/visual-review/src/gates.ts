import type {
  VisualFinding,
  VisualGateInput,
  VisualGateResult,
} from "./contracts.js";

/** Maximum tolerated baseline diff ratio before a case blocks. */
export const VISUAL_DIFF_MAX_RATIO = 0.01;

/**
 * Pure deterministic visual gates. Blockers always fail the gate; major and
 * minor findings are recorded as issues but do not block.
 */
export function runVisualGate(input: VisualGateInput): VisualGateResult {
  const issues: VisualFinding[] = [];
  const byCase = new Map(input.screenshots.map((entry) => [entry.caseId, entry]));
  for (const visualCase of input.cases) {
    if (!byCase.has(visualCase.id)) {
      issues.push({
        id: `VISUAL_SCREENSHOT_MISSING:${visualCase.id}`,
        severity: "blocker",
        code: "VISUAL_SCREENSHOT_MISSING",
        pageId: visualCase.pageId,
        state: visualCase.state,
        message: `missing screenshot for ${visualCase.id}`,
      });
    }
  }
  for (const shot of input.screenshots) {
    if (shot.consoleErrors > 0) {
      issues.push({
        id: `VISUAL_CONSOLE_ERROR:${shot.caseId}`,
        severity: "blocker",
        code: "VISUAL_CONSOLE_ERROR",
        message: `${shot.caseId} has console errors`,
        evidence: shot.path,
      });
    }
    if (shot.overflow) {
      issues.push({
        id: `VISUAL_OVERFLOW:${shot.caseId}`,
        severity: "blocker",
        code: "VISUAL_OVERFLOW",
        message: `${shot.caseId} overflows the viewport`,
        evidence: shot.path,
      });
    }
  }
  for (const entry of input.diff) {
    const ratio =
      entry.totalPixels === 0 ? 0 : entry.diffPixels / entry.totalPixels;
    if (ratio > VISUAL_DIFF_MAX_RATIO) {
      issues.push({
        id: `VISUAL_DIFF_EXCEEDED:${entry.caseId}`,
        severity: "blocker",
        code: "VISUAL_DIFF_EXCEEDED",
        message: `${entry.caseId} diff ${(ratio * 100).toFixed(2)}% > 1%`,
        evidence: entry.caseId,
      });
    }
  }
  for (const finding of input.findings) issues.push(finding);
  return {
    passed: issues.every((entry) => entry.severity !== "blocker"),
    issues,
  };
}
