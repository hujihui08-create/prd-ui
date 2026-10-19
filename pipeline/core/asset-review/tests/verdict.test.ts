import { describe, expect, it } from "vitest";
import type { AssetReviewVerdict } from "../src/contracts.js";
import { validateVerdict } from "../src/verdict.js";

const base: AssetReviewVerdict = {
  verdict: "pass",
  hardIssues: [],
  scores: { brandFit: 5, semantics: 5, consistency: 4, editability: 4, composition: 5 },
  suggestedChanges: [],
  reason: "ok",
};

describe("validateVerdict", () => {
  it("passes a 4.6 average with every dimension >= 4", () => {
    expect(validateVerdict(base, { brandCritical: false }).verdict.verdict).toBe("pass");
  });

  it("downgrades pass when any dimension is below 4", () => {
    const verdict = { ...base, scores: { ...base.scores, brandFit: 3 } };
    const result = validateVerdict(verdict, { brandCritical: false });
    expect(result.verdict.verdict).toBe("retry");
    expect(result.inconsistencies).toContain("SCORE_BELOW_MIN");
  });

  it("downgrades pass when the average is below 4.5", () => {
    const verdict = {
      ...base,
      scores: { brandFit: 4, semantics: 4, consistency: 4, editability: 4, composition: 4 },
    };
    const result = validateVerdict(verdict, { brandCritical: false });
    expect(result.verdict.verdict).toBe("retry");
    expect(result.inconsistencies).toContain("AVERAGE_BELOW_MIN");
  });

  it("requires 4.8 average for brand-critical assets", () => {
    const verdict = {
      ...base,
      scores: { brandFit: 5, semantics: 4, consistency: 4, editability: 4, composition: 5 },
    };
    const result = validateVerdict(verdict, { brandCritical: true });
    expect(result.verdict.verdict).toBe("retry");
    expect(result.inconsistencies).toContain("BRAND_AVERAGE_BELOW_MIN");
  });

  it("forces fallback when hardIssues are present", () => {
    const verdict = { ...base, hardIssues: ["embedded text"] };
    const result = validateVerdict(verdict, { brandCritical: false });
    expect(result.verdict.verdict).toBe("fallback");
    expect(result.inconsistencies).toContain("HARD_ISSUES_FORCE_FALLBACK");
  });

  it("keeps an explicit retry even when scores are high", () => {
    const verdict = { ...base, verdict: "retry" as const };
    expect(validateVerdict(verdict, { brandCritical: false }).verdict.verdict).toBe("retry");
  });
});
