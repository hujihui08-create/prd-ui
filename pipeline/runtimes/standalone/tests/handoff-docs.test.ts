import { describe, expect, it } from "vitest";
import { generateHandoffMd, generateLicensesMd } from "../src/handoff/docs.js";

const input = {
  project: "employee-app-phase2",
  pages: [
    { pageId: "today", name: "今日", route: "/", archetype: "home", states: ["default", "empty"] },
  ],
  figma: { files: [{ pageId: "today", fileKey: "abc" }], pages: ["today"] },
  gates: {
    verify: { passed: true, hash: "sha256:v" },
    conformance: { passed: true, hash: "sha256:c" },
    parity: { passed: true, hash: "sha256:p" },
    figmaSign: { passed: true, hash: "sha256:f" },
    visualSign: { passed: true, hash: "sha256:s" },
  },
  knownGaps: ["Figma state frames are not included"],
  assets: [],
};

describe("handoff docs", () => {
  it("generates a deterministic HANDOFF.md with no placeholders", () => {
    const md = generateHandoffMd(input);
    expect(md).toContain("# employee-app-phase2 Handoff");
    expect(md).toContain("今日");
    expect(md).not.toMatch(/TBD|TODO|\{\{/);
  });

  it("writes an explicit no-assets LICENSES.md", () => {
    const md = generateLicensesMd(input);
    expect(md).toContain("无第三方资产");
  });

  it("is deterministic and fails closed on placeholders", () => {
    expect(generateHandoffMd(input)).toBe(generateHandoffMd(input));
    expect(() =>
      generateHandoffMd({ ...input, knownGaps: ["TODO: fill this in"] })
    ).toThrow(/HANDOFF_PLACEHOLDER/);
  });

  it("aggregates every asset license", () => {
    const md = generateLicensesMd({
      ...input,
      assets: [
        { path: "assets/icons/home.svg", license: "ISC" },
        { path: "assets/illustrations/empty.svg", license: "CC0-1.0" },
      ],
    });
    expect(md).toContain("`assets/icons/home.svg` | ISC");
    expect(md).toContain("`assets/illustrations/empty.svg` | CC0-1.0");
    expect(md).not.toMatch(/TBD|TODO|\{\{/);
  });
});
