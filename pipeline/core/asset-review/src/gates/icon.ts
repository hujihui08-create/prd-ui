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
  parseSvg,
  parseViewBox,
  sameNumber,
} from "./svg.js";

const UNSUPPORTED_PAINT = new Set(["lineargradient", "radialgradient", "filter", "mask"]);

export function checkIcon(svg: string, brief: AssetBrief): HardGateResult {
  const parsed = parseSvg(svg);
  if (!parsed) {
    return gateResult([issue("SVG_INVALID", "Icon is not a well-formed SVG document.")]);
  }

  const issues: HardGateIssue[] = [];
  issues.push(...checkSvgSafety(parsed, { allowText: false }));

  const grid = brief.constraints.grid ?? 24;
  const viewBox = parseViewBox(attr(parsed.root, "viewBox"));
  if (!viewBox) {
    issues.push(issue("SVG_NO_VIEWBOX", "Icon SVG has no usable viewBox."));
  } else if (viewBox[0] !== 0 || viewBox[1] !== 0 || viewBox[2] !== grid || viewBox[3] !== grid) {
    issues.push(issue("ICON_GRID", `Icon viewBox is ${viewBox.join(" ")}, expected 0 0 ${grid} ${grid}.`));
  }

  for (const dimension of ["width", "height"]) {
    const value = attr(parsed.root, dimension);
    if (value !== null && !sameNumber(value, grid)) {
      issues.push(issue("ICON_GRID", `Icon ${dimension} is ${value}, expected ${grid}.`));
    }
  }

  const expectedStroke = brief.constraints.strokeWidth ?? 1.5;
  const strokeWidths = allElements(parsed)
    .map((element) => attr(element, "stroke-width"))
    .filter((value): value is string => value !== null);
  if (strokeWidths.length === 0) {
    issues.push(issue("ICON_STROKE_WIDTH", "Icon has no stroke-width."));
  }
  for (const value of strokeWidths) {
    if (!sameNumber(value, expectedStroke)) {
      issues.push(issue("ICON_STROKE_WIDTH", `stroke-width ${value} does not match ${expectedStroke}.`, value));
    }
  }

  for (const element of allElements(parsed)) {
    const name = elementName(element);
    if (UNSUPPORTED_PAINT.has(name)) {
      issues.push(issue("ICON_UNSUPPORTED_PAINT", `Icon uses <${name}>.`, name));
    }
    for (const property of ["fill", "stroke", "stop-color", "color"]) {
      const value = attr(element, property);
      if (value === null) continue;
      const lowered = value.toLowerCase();
      if (isNeutralColor(lowered)) continue;
      if (isUrlColor(lowered) || lowered.startsWith("var(")) {
        issues.push(issue("ICON_HARDCODED_COLOR", `${property}=${value} is not currentColor.`, value));
        continue;
      }
      issues.push(issue("ICON_HARDCODED_COLOR", `${property}=${value} is a hardcoded color.`, value));
    }
  }

  return gateResult(issues);
}

const SIGNATURE_PROPERTIES = [
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "fill",
] as const;

type SignatureProperty = (typeof SIGNATURE_PROPERTIES)[number];

/**
 * Set-level consistency. Call once for the icon collection after each icon
 * passes `checkIcon`; a mismatch is a blocker even when every icon is valid
 * on its own.
 *
 * The signature is the sorted set of declared values for each presentation
 * property across *all* elements, not just the root. Equal roots are not
 * enough: one child path with a different `stroke-width` must fail the set.
 * Collecting a set (instead of a per-element list) keeps icons with different
 * element counts consistent as long as they declare the same values.
 */
export function checkIconSet(icons: Array<{ id: string; svg: string }>): HardGateResult {
  const issues: HardGateIssue[] = [];
  const signatures: Array<{ id: string; values: Record<SignatureProperty, string[]> }> = [];

  for (const icon of icons) {
    const parsed = parseSvg(icon.svg);
    if (!parsed) {
      issues.push(issue("ICON_SET_INVALID", `Icon ${icon.id} is not a well-formed SVG.`, icon.id));
      continue;
    }
    const values = {} as Record<SignatureProperty, string[]>;
    for (const property of SIGNATURE_PROPERTIES) {
      const declared = new Set<string>();
      for (const element of allElements(parsed)) {
        const value = attr(element, property);
        if (value !== null) declared.add(value.toLowerCase());
      }
      values[property] = [...declared].sort();
    }
    signatures.push({ id: icon.id, values });
  }

  for (const property of SIGNATURE_PROPERTIES) {
    const byValue = new Map<string, string[]>();
    for (const signature of signatures) {
      const values = signature.values[property];
      const key = values.length > 0 ? values.join(",") : "(absent)";
      const ids = byValue.get(key);
      if (ids === undefined) {
        byValue.set(key, [signature.id]);
      } else {
        ids.push(signature.id);
      }
    }
    if (byValue.size > 1) {
      const detail = [...byValue.entries()]
        .map(([value, ids]) => `${value}:${ids.join(",")}`)
        .join(" | ");
      issues.push(
        issue(
          "ICON_SET_INCONSISTENT",
          `Icon set disagrees on ${property}: ${detail}.`,
          property
        )
      );
    }
  }

  return gateResult(issues);
}
