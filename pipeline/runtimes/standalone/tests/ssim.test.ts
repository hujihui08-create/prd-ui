import { describe, expect, it } from "vitest";
import { computeSsim } from "../src/visual/ssim.js";

function gray(value: number, count: number): Buffer {
  return Buffer.alloc(count * 4, value);
}

describe("computeSsim", () => {
  it("returns 1 for identical images", () => {
    const image = gray(128, 16 * 16);
    expect(computeSsim(image, image, 16, 16)).toBeCloseTo(1, 3);
  });

  it("returns less than 1 for different images", () => {
    const a = gray(0, 16 * 16);
    const b = gray(255, 16 * 16);
    expect(computeSsim(a, b, 16, 16)).toBeLessThan(0.9);
  });

  it("returns 1 when the image is smaller than a window", () => {
    const a = gray(0, 4 * 4);
    const b = gray(255, 4 * 4);
    expect(computeSsim(a, b, 4, 4)).toBe(1);
  });
});
