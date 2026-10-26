import { describe, expect, it } from "vitest";
import { evaluateParityPage } from "../src/index.js";

const base = {
  pageId: "today",
  baselineFile: "baselines/today.default.png",
  figmaFile: "parity/figma.today.png",
  baselineHash: "sha256:a",
  figmaHash: "sha256:b",
  width: 390,
  height: 844,
};

describe("evaluateParityPage", () => {
  it("passes at the threshold boundary", () => {
    const page = evaluateParityPage({
      ...base,
      pixelDiffRatio: 0.005,
      ssim: 0.98,
      thresholds: { maxPixelDiff: 0.005, minSsim: 0.98 },
    });
    expect(page.passed).toBe(true);
    expect(page.findings).toHaveLength(0);
  });

  it("fails on too many pixels", () => {
    const page = evaluateParityPage({
      ...base,
      pixelDiffRatio: 0.02,
      ssim: 0.99,
      thresholds: { maxPixelDiff: 0.005, minSsim: 0.98 },
    });
    expect(page.passed).toBe(false);
    expect(page.findings[0]?.code).toBe("PARITY_PIXEL_DIFF");
  });

  it("fails on low ssim", () => {
    const page = evaluateParityPage({
      ...base,
      pixelDiffRatio: 0.001,
      ssim: 0.9,
      thresholds: { maxPixelDiff: 0.005, minSsim: 0.98 },
    });
    expect(page.findings[0]?.code).toBe("PARITY_SSIM");
  });

  it("fails on size mismatch", () => {
    const page = evaluateParityPage({
      ...base,
      pixelDiffRatio: 0,
      ssim: 1,
      width: 391,
      height: 844,
      thresholds: { maxPixelDiff: 0.005, minSsim: 0.98 },
    });
    expect(page.findings[0]?.code).toBe("PARITY_SIZE_MISMATCH");
  });

  it("accepts project-specific expected dimensions", () => {
    const page = evaluateParityPage({
      ...base,
      pixelDiffRatio: 0,
      ssim: 1,
      width: 1440,
      height: 900,
      expectedWidth: 1440,
      expectedHeight: 900,
      thresholds: { maxPixelDiff: 0.005, minSsim: 0.98 },
    });
    expect(page.passed).toBe(true);
    expect(page.findings).toHaveLength(0);
  });

  it("preserves the diff image path when provided", () => {
    const page = evaluateParityPage({
      ...base,
      pixelDiffRatio: 0,
      ssim: 1,
      diffFile: "out/diff/today.png",
      thresholds: { maxPixelDiff: 0.005, minSsim: 0.98 },
    });
    expect(page.diffFile).toBe("out/diff/today.png");
  });
});
