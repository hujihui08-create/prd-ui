import { describe, expect, it } from "vitest";
import {
  AssetBriefSchema,
  AssetReviewVerdictSchema,
  DEFAULT_SOURCE_POLICY,
  SourcePolicySchema,
} from "../src/contracts.js";

const brief = {
  id: "icon-home",
  kind: "icon",
  scene: "home navigation",
  styleRef: "b-mobile",
  size: { width: 24, height: 24 },
  format: "svg",
  sourceChain: ["library"],
};

describe("asset review contracts", () => {
  it("parses a minimal brief and defaults constraints", () => {
    const parsed = AssetBriefSchema.parse(brief);
    expect(parsed.constraints).toEqual({});
    expect(parsed.sourceChain).toEqual(["library"]);
  });

  it("rejects an empty source chain", () => {
    expect(() => AssetBriefSchema.parse({ ...brief, sourceChain: [] })).toThrow();
  });

  it("rejects unknown keys", () => {
    expect(() => AssetBriefSchema.parse({ ...brief, unexpected: true })).toThrow();
  });

  it("rejects scores outside 1..5", () => {
    expect(() =>
      AssetReviewVerdictSchema.parse({
        verdict: "pass",
        hardIssues: [],
        scores: {
          brandFit: 0,
          semantics: 5,
          consistency: 5,
          editability: 5,
          composition: 5,
        },
        suggestedChanges: [],
        reason: "ok",
      })
    ).toThrow();
  });

  it("validates the default source policy", () => {
    expect(SourcePolicySchema.parse(DEFAULT_SOURCE_POLICY)).toEqual(DEFAULT_SOURCE_POLICY);
  });

  it("strips extra reviewer annotations instead of failing", () => {
    const parsed = AssetReviewVerdictSchema.parse({
      verdict: "pass",
      hardIssues: [],
      scores: {
        brandFit: 5,
        semantics: 5,
        consistency: 5,
        editability: 5,
        composition: 5,
      },
      suggestedChanges: [],
      reason: "ok",
      reason_note: "model annotation",
    });
    expect(parsed.verdict).toBe("pass");
    expect(parsed).not.toHaveProperty("reason_note");
  });
});
