import { describe, expect, it } from "vitest";
import type { AssetBrief } from "../src/contracts.js";
import { checkIcon, checkIconSet } from "../src/gates/icon.js";
import { checkIllustration } from "../src/gates/illustration.js";
import { normalizeSvg, parseSvg } from "../src/gates/svg.js";

const iconBrief: AssetBrief = {
  id: "icon-home",
  kind: "icon",
  scene: "home",
  styleRef: "b-mobile",
  size: { width: 24, height: 24 },
  format: "svg",
  constraints: { grid: 24, strokeWidth: 1.5, currentColor: true, noText: true },
  sourceChain: ["library"],
};

const illustrationBrief: AssetBrief = {
  id: "empty-inventory",
  kind: "illustration",
  scene: "empty inventory",
  styleRef: "b-mobile",
  size: { width: 120, height: 80 },
  format: "svg",
  constraints: {
    noText: true,
    noLogo: true,
    noScreenshot: true,
    palette: ["#2563EB", "#E5E7EB", "#111827"],
  },
  sourceChain: ["library"],
};

const validIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5V21H3z"/></svg>`;

const validIllustration = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect x="0" y="0" width="120" height="80" fill="#E5E7EB"/><rect x="20" y="20" width="80" height="40" fill="#2563EB"/><circle cx="60" cy="40" r="8" fill="#111827"/></svg>`;

describe("icon gates", () => {
  it("passes a valid 24px currentColor icon", () => {
    const result = checkIcon(validIcon, iconBrief);
    expect(result.passed).toBe(true);
  });

  it("rejects a hardcoded fill", () => {
    const svg = validIcon.replace('fill="none"', 'fill="#ff0000"');
    const result = checkIcon(svg, iconBrief);
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.code === "ICON_HARDCODED_COLOR")).toBe(true);
  });

  it("rejects text, script, external refs and raster images", () => {
    const withText = validIcon.replace("</svg>", "<text>hi</text></svg>");
    const withScript = validIcon.replace("</svg>", "<script>alert(1)</script></svg>");
    expect(checkIcon(withText, iconBrief).issues.some((i) => i.code === "SVG_TEXT")).toBe(true);
    expect(checkIcon(withScript, iconBrief).issues.some((i) => i.code === "SVG_SCRIPT")).toBe(true);
    expect(checkIcon(validIcon.replace("<path", '<use href="https://x.test/a.svg#a"/><path'), iconBrief).issues.some((i) => i.code === "SVG_EXTERNAL_REF")).toBe(true);
    const withImage = validIcon.replace("</svg>", '<image href="data:image/png;base64,AAA"/></svg>');
    expect(checkIcon(withImage, iconBrief).issues.some((i) => i.code === "SVG_IMAGE")).toBe(true);
  });

  it("rejects wrong grid and stroke width", () => {
    expect(checkIcon(validIcon.replace("0 0 24 24", "0 0 20 20"), iconBrief).issues.some((i) => i.code === "ICON_GRID")).toBe(true);
    expect(checkIcon(validIcon.replace('stroke-width="1.5"', 'stroke-width="2"'), iconBrief).issues.some((i) => i.code === "ICON_STROKE_WIDTH")).toBe(true);
  });

  it("rejects an inconsistent icon set", () => {
    const other = validIcon.replace('stroke-width="1.5"', 'stroke-width="2"');
    const result = checkIconSet([{ id: "home", svg: validIcon }, { id: "search", svg: other }]);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === "ICON_SET_INCONSISTENT")).toBe(true);
  });

  it("passes a consistent icon set", () => {
    const other = validIcon.replace("M3 9.5 12 3l9 6.5V21H3z", "M4 4h16v16H4z");
    expect(checkIconSet([{ id: "home", svg: validIcon }, { id: "search", svg: other }]).passed).toBe(true);
  });
});

describe("illustration gates", () => {
  it("passes a valid 120x80 palette illustration", () => {
    expect(checkIllustration(validIllustration, illustrationBrief).passed).toBe(true);
  });

  it("rejects text", () => {
    const svg = validIllustration.replace("</svg>", "<text>empty</text></svg>");
    expect(checkIllustration(svg, illustrationBrief).issues.some((i) => i.code === "SVG_TEXT")).toBe(true);
  });

  it("rejects a color outside the palette", () => {
    const svg = validIllustration.replace('fill="#2563EB"', 'fill="#FF00AA"');
    expect(checkIllustration(svg, illustrationBrief).issues.some((i) => i.code === "ILLUSTRATION_PALETTE")).toBe(true);
  });

  it("rejects a canvas below 96x72", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60"><rect x="0" y="0" width="80" height="60" fill="#E5E7EB"/></svg>`;
    expect(checkIllustration(svg, illustrationBrief).issues.some((i) => i.code === "ILLUSTRATION_SIZE")).toBe(true);
  });

  it("rejects an element outside the safe area", () => {
    const svg = validIllustration.replace('x="20" y="20" width="80" height="40"', 'x="110" y="20" width="80" height="40"');
    expect(checkIllustration(svg, illustrationBrief).issues.some((i) => i.code === "ILLUSTRATION_SAFE_AREA")).toBe(true);
  });
});

describe("svg normalization", () => {
  it("parses and normalizes a valid svg", () => {
    expect(parseSvg(validIcon)).not.toBeNull();
    const normalized = normalizeSvg(validIcon);
    expect(normalized).toContain("<svg");
    expect(normalized).toContain("viewBox");
  });

  it("returns null for malformed svg", () => {
    expect(parseSvg("<svg><path></svg>")).toBeNull();
  });
});
