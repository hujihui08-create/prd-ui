import type { AssetBrief, HardGateIssue, HardGateResult } from "../contracts.js";
import {
  allElements,
  attr,
  checkSvgSafety,
  elementName,
  gateResult,
  isNeutralColor,
  isUrlColor,
  issue,
  numericAttr,
  parseSvg,
  parseViewBox,
} from "./svg.js";

export function checkIllustration(svg: string, brief: AssetBrief): HardGateResult {
  const parsed = parseSvg(svg);
  if (!parsed) {
    return gateResult([issue("SVG_INVALID", "Illustration is not a well-formed SVG document.")]);
  }

  const issues: HardGateIssue[] = [];
  issues.push(...checkSvgSafety(parsed, { allowText: false }));

  const viewBox = parseViewBox(attr(parsed.root, "viewBox"));
  if (!viewBox) {
    issues.push(issue("SVG_NO_VIEWBOX", "Illustration SVG has no usable viewBox."));
  } else {
    const minimumWidth = Math.max(96, brief.size.width);
    const minimumHeight = Math.max(72, brief.size.height);
    if (viewBox[2] < minimumWidth || viewBox[3] < minimumHeight) {
      issues.push(
        issue(
          "ILLUSTRATION_SIZE",
          `Illustration canvas is ${viewBox[2]}×${viewBox[3]}, expected at least ${minimumWidth}×${minimumHeight}.`
        )
      );
    }

    const [minX, minY, width, height] = viewBox;
    const maxX = minX + width;
    const maxY = minY + height;
    for (const element of allElements(parsed)) {
      const name = elementName(element);
      if (name === "svg" || name === "defs" || name === "lineargradient" || name === "radialgradient" || name === "stop") {
        continue;
      }
      const x = numericAttr(element, "x");
      const y = numericAttr(element, "y");
      const elementWidth = numericAttr(element, "width");
      const elementHeight = numericAttr(element, "height");
      const cx = numericAttr(element, "cx");
      const cy = numericAttr(element, "cy");
      const r = numericAttr(element, "r");
      if (x !== null && x < minX) issues.push(issue("ILLUSTRATION_SAFE_AREA", `<${name}> x is outside the viewBox.`, String(x)));
      if (y !== null && y < minY) issues.push(issue("ILLUSTRATION_SAFE_AREA", `<${name}> y is outside the viewBox.`, String(y)));
      if (x !== null && elementWidth !== null && x + elementWidth > maxX) {
        issues.push(issue("ILLUSTRATION_SAFE_AREA", `<${name}> extends past the viewBox width.`, `${x}+${elementWidth}`));
      }
      if (y !== null && elementHeight !== null && y + elementHeight > maxY) {
        issues.push(issue("ILLUSTRATION_SAFE_AREA", `<${name}> extends past the viewBox height.`, `${y}+${elementHeight}`));
      }
      if (cx !== null && r !== null && (cx - r < minX || cx + r > maxX)) {
        issues.push(issue("ILLUSTRATION_SAFE_AREA", `<${name}> circle is outside the viewBox horizontally.`, String(cx)));
      }
      if (cy !== null && r !== null && (cy - r < minY || cy + r > maxY)) {
        issues.push(issue("ILLUSTRATION_SAFE_AREA", `<${name}> circle is outside the viewBox vertically.`, String(cy)));
      }
    }
  }

  const palette = brief.constraints.palette;
  if (palette && palette.length > 0) {
    const allowed = new Set(palette.map((color) => color.trim().toLowerCase()));
    for (const element of allElements(parsed)) {
      for (const property of ["fill", "stroke", "stop-color", "color"]) {
        const value = attr(element, property);
        if (value === null) continue;
        const lowered = value.toLowerCase();
        if (isNeutralColor(lowered) || isUrlColor(lowered)) continue;
        if (!allowed.has(lowered)) {
          issues.push(
            issue(
              "ILLUSTRATION_PALETTE",
              `${property}=${value} is not in the brief palette.`,
              `${elementName(element)}.${property}`
            )
          );
        }
      }
    }
  }

  return gateResult(issues);
}
