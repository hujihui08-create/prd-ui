export type VisualReviewStatus = "passed" | "awaiting_signoff" | "blocked";

export interface VisualStatusInput {
  gatePassed: boolean;
  hasBlockingFinding: boolean;
  signoffValid: boolean;
}

/**
 * Derives the run status from deterministic gates, critic blockers, and the
 * human visual signoff. Pure so Task 7's runner stays thin.
 */
export function visualReviewStatus(input: VisualStatusInput): VisualReviewStatus {
  if (!input.gatePassed || input.hasBlockingFinding) return "blocked";
  return input.signoffValid ? "passed" : "awaiting_signoff";
}
