import { describe, expect, it } from "vitest";
import { parseSignoffMarkdown } from "@prd-ui/agents";
import type { VisualFinding } from "@prd-ui/visual-review";
import { validateVisualSignoff } from "../src/visual/signoff.js";

function parsed(acceptedMajors: Array<Record<string, string>> = []) {
  return parseSignoffMarkdown(`# Visual signoff

<!-- signoff
${JSON.stringify({
  signer: "Reviewer",
  date: "2026-10-23",
  manifestHash: "sha256:manifest",
  findingsHash: "sha256:findings",
  acceptedMajors,
  waivers: [],
})}
-->
`);
}

function finding(id: string, severity: VisualFinding["severity"]): VisualFinding {
  return {
    id,
    severity,
    code:
      severity === "major"
        ? "VISUAL_CRITIC_MAJOR"
        : severity === "blocker"
          ? "VISUAL_CRITIC_BLOCKER"
          : "VISUAL_CRITIC_MINOR",
    message: id,
  };
}

function validate(
  findings: VisualFinding[],
  acceptedMajors: Array<Record<string, string>> = [],
  maxMajor?: number
) {
  return validateVisualSignoff({
    parsed: parsed(acceptedMajors),
    findings,
    manifestHash: "sha256:manifest",
    findingsHash: "sha256:findings",
    now: new Date("2026-10-23T00:00:00Z"),
    ...(maxMajor === undefined ? {} : { maxMajor }),
  });
}

const accepted = (id: string) => ({
  findingId: id,
  reason: "v0.6 debt",
  owner: "design",
  reviewBy: "v0.6",
});

describe("visual major gate", () => {
  it("accepts up to two majors with reasons", () => {
    const result = validate(
      [finding("VC-1", "major"), finding("VC-2", "major")],
      [accepted("VC-1"), accepted("VC-2")]
    );
    expect(result.ok).toBe(true);
  });

  it("rejects more than two majors", () => {
    const result = validate(
      [
        finding("VC-1", "major"),
        finding("VC-2", "major"),
        finding("VC-3", "major"),
      ],
      [accepted("VC-1"), accepted("VC-2"), accepted("VC-3")]
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("VISUAL_MAJOR_LIMIT");
  });

  it("rejects a major without an accepted reason", () => {
    const result = validate(
      [finding("VC-1", "major"), finding("VC-2", "major")],
      [accepted("VC-1")]
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("VISUAL_MAJOR_UNACCEPTED");
  });

  it("rejects unknown or non-major accepted entries", () => {
    const unknown = validate([finding("VC-1", "major")], [accepted("VC-1"), accepted("VC-X")]);
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toContain("VISUAL_MAJOR_UNKNOWN");

    const minor = validate([finding("VC-1", "minor")], [accepted("VC-1")]);
    expect(minor.ok).toBe(false);
    expect(minor.error).toContain("VISUAL_MAJOR_NOT_MAJOR");
  });

  it("rejects duplicate accepted entries", () => {
    const result = validate(
      [finding("VC-1", "major")],
      [accepted("VC-1"), accepted("VC-1")]
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("VISUAL_MAJOR_DUPLICATE");
  });

  it("accepts a run with no majors", () => {
    expect(validate([finding("VC-1", "minor")]).ok).toBe(true);
  });

  it("allows a lower max-major override", () => {
    const result = validate(
      [finding("VC-1", "major")],
      [accepted("VC-1")],
      0
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("VISUAL_MAJOR_LIMIT");
  });
});
