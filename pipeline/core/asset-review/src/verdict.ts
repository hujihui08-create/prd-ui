import type { AssetReviewVerdict } from "./contracts.js";

export interface VerdictCheck {
  verdict: AssetReviewVerdict;
  inconsistencies: string[];
}

/**
 * Enforce the policy thresholds in core, not in a prompt or a runtime.
 * A reviewer may return `pass` with scores that do not meet the bar; core
 * downgrades it to `retry` so a lenient model cannot bypass the gate.
 */
export function validateVerdict(
  verdict: AssetReviewVerdict,
  options: { brandCritical: boolean }
): VerdictCheck {
  if (verdict.hardIssues.length > 0) {
    return {
      verdict: { ...verdict, verdict: "fallback" },
      inconsistencies: ["HARD_ISSUES_FORCE_FALLBACK"],
    };
  }

  const values = Object.values(verdict.scores);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const inconsistencies: string[] = [];

  if (values.some((value) => value < 4)) {
    inconsistencies.push("SCORE_BELOW_MIN");
  }
  if (average < 4.5) {
    inconsistencies.push("AVERAGE_BELOW_MIN");
  }
  if (options.brandCritical && average < 4.8) {
    inconsistencies.push("BRAND_AVERAGE_BELOW_MIN");
  }

  if (verdict.verdict === "pass" && inconsistencies.length > 0) {
    return { verdict: { ...verdict, verdict: "retry" }, inconsistencies };
  }

  return { verdict, inconsistencies };
}

export function averageScore(verdict: AssetReviewVerdict): number {
  const values = Object.values(verdict.scores);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
