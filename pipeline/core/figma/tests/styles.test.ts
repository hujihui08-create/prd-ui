import { describe, expect, it } from "vitest";
import type { Profile } from "@prd-ui/contracts";
import { radiusPx, spacePx } from "../src/styles.js";

const profile = {
  space: { "4": "16px" },
  radius: { md: "6px" },
} as unknown as Profile;

describe("figma style token resolution", () => {
  it("accepts bare, dotted, and dashed space keys", () => {
    expect(spacePx(profile, "4")).toBe(16);
    expect(spacePx(profile, "space.4")).toBe(16);
    expect(spacePx(profile, "space-4")).toBe(16);
    expect(spacePx(profile, "space.unknown", 8)).toBe(8);
  });

  it("accepts bare, dotted, and dashed radius keys", () => {
    expect(radiusPx(profile, "md")).toBe(6);
    expect(radiusPx(profile, "radius.md")).toBe(6);
    expect(radiusPx(profile, "radius-md")).toBe(6);
    expect(radiusPx(profile, "radius.unknown", 4)).toBe(4);
  });
});
