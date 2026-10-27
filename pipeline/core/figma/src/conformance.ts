import type {
  ConformanceFinding,
  ConformancePage,
  FigmaPlan,
  FigmaPlanNode,
  Profile,
  StyleManifest,
  StyleNode,
} from "@prd-ui/contracts";
import { isMaterialDerivedId } from "@prd-ui/contracts";

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parse `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()` and `color(srgb ...)`. */
export function parseCssColor(value: string): Rgba | undefined {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value.trim());
  if (hex?.[1]) {
    const raw = hex[1];
    if (raw.length === 3 || raw.length === 4) {
      const [r, g, b, a = "f"] = raw.split("");
      return {
        r: parseInt(`${r}${r}`, 16),
        g: parseInt(`${g}${g}`, 16),
        b: parseInt(`${b}${b}`, 16),
        a: parseInt(`${a}${a}`, 16) / 255,
      };
    }
    if (raw.length === 6 || raw.length === 8) {
      return {
        r: parseInt(raw.slice(0, 2), 16),
        g: parseInt(raw.slice(2, 4), 16),
        b: parseInt(raw.slice(4, 6), 16),
        a: raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1,
      };
    }
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (rgb?.[1]) {
    const parts = rgb[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
      return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: parts[3] ?? 1 };
    }
  }
  // Chrome serializes color-mix() results as `color(srgb r g b / a)` with
  // channels in 0..1, e.g. `color(srgb 0.839216 0.643137 0.643137)`.
  const srgb = /^color\(srgb\s+([^)]+)\)$/i.exec(value.trim());
  if (srgb?.[1]) {
    const [channelsPart, alphaPart] = srgb[1].split("/");
    const channels = (channelsPart ?? "")
      .trim()
      .split(/\s+/)
      .map((part) => Number.parseFloat(part));
    if (channels.length >= 3 && channels.every((part) => Number.isFinite(part))) {
      const alpha = alphaPart === undefined ? 1 : Number.parseFloat(alphaPart.trim());
      if (Number.isFinite(alpha)) {
        return {
          r: Math.round(channels[0]! * 255),
          g: Math.round(channels[1]! * 255),
          b: Math.round(channels[2]! * 255),
          a: alpha,
        };
      }
    }
  }
  return undefined;
}

/** Same color within an RGB tolerance; alpha is always compared at 0.01. */
export function sameColor(left: string, right: string, tolerance = 0): boolean {
  const a = parseCssColor(left);
  const b = parseCssColor(right);
  if (!a || !b) return left.trim() === right.trim();
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance &&
    Math.abs(a.a - b.a) <= 0.01
  );
}

interface Hsl {
  h: number | undefined;
  s: number;
  l: number;
}

function toHsl(color: Rgba): Hsl {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: undefined, s: 0, l };
  const denominator = 1 - Math.abs(2 * l - 1);
  const s = denominator === 0 ? 0 : delta / denominator;
  let h: number;
  if (max === r) h = 60 * (((g - b) / delta) % 6);
  else if (max === g) h = 60 * ((b - r) / delta + 2);
  else h = 60 * ((r - g) / delta + 4);
  if (h < 0) h += 360;
  return { h, s, l };
}

function relativeLuminance(color: Rgba): number {
  const linear = (value: number): number => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

function hueDistance(left: number, right: number): number {
  const diff = Math.abs(left - right) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Compare a declared translucent color (a token plus an alpha) against what
 * the browser actually paints.
 *
 * HTML renders tinted fills/strokes with `color-mix(in srgb, token N%, base)`,
 * which serializes as an opaque lighter RGB (or `color(srgb ...)`), losing the
 * original alpha. A capture may instead report `rgba(token, N)`. The tint check
 * therefore requires the same hue as the token, a lighter result for opaque
 * captures, and only checks alpha when the capture itself is translucent
 * (within 0.05). Mixing may target white or `surface-subtle`; no exact base is
 * assumed and no un-compositing is done.
 */
export function sameTint(expected: string, actual: string, alpha: number): boolean {
  const token = parseCssColor(expected);
  const rendered = parseCssColor(actual);
  if (!token || !rendered) return expected.trim() === actual.trim();
  const tokenHsl = toHsl(token);
  const renderedHsl = toHsl(rendered);
  if (tokenHsl.h !== undefined && tokenHsl.s >= 0.03) {
    if (renderedHsl.h === undefined || renderedHsl.s < 0.03) return false;
    if (hueDistance(tokenHsl.h, renderedHsl.h) > 12) return false;
  }
  const tokenLuminance = relativeLuminance(token);
  if (rendered.a < 1) {
    return (
      Math.abs(rendered.a - alpha) <= 0.05 &&
      relativeLuminance(rendered) >= tokenLuminance - 1e-6
    );
  }
  return relativeLuminance(rendered) > tokenLuminance + 1e-6;
}

export interface BoxShadow {
  inset: boolean;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
}

const SHADOW_LENGTH = /-?(?:\d+(?:\.\d+)?|\.\d+)px/gi;

/**
 * Parse a computed `box-shadow` value. Chrome serializes each shadow as
 * `<color> <x>px <y>px <blur>px <spread>px [inset]`, with shadows separated by
 * top-level commas (rgb() colors contain commas too).
 */
export function parseBoxShadows(value: string | undefined): BoxShadow[] {
  if (value === undefined) return [];
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "none") return [];
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      parts.push(trimmed.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(trimmed.slice(start));
  const shadows: BoxShadow[] = [];
  for (const part of parts) {
    const lengths = (part.match(SHADOW_LENGTH) ?? []).map((length) => Number.parseFloat(length));
    if (lengths.length < 2) continue;
    const color = part
      .replace(SHADOW_LENGTH, " ")
      .replace(/\binset\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    shadows.push({
      inset: /\binset\b/i.test(part),
      offsetX: lengths[0]!,
      offsetY: lengths[1]!,
      blur: lengths[2] ?? 0,
      spread: lengths[3] ?? 0,
      color,
    });
  }
  return shadows;
}

/**
 * The renderer draws a selected calendar day's bottom accent as
 * `box-shadow: inset 0 -Npx 0 <token>` instead of a wider bottom border. A
 * negative y-offset with `inset` paints a band at the bottom edge; its solid
 * thickness is the offset minus blur plus spread. Returns the first such
 * bottom underline, if any.
 */
export function insetBottomUnderline(
  value: string | undefined
): { color: string; thickness: number } | undefined {
  for (const shadow of parseBoxShadows(value)) {
    if (!shadow.inset || shadow.offsetY >= 0) continue;
    const thickness = Math.abs(shadow.offsetY) + shadow.spread - shadow.blur;
    if (thickness <= 0) continue;
    return { color: shadow.color, thickness };
  }
  return undefined;
}

function resolveToken(plan: FigmaPlan, value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return plan.tokens[value] ?? value;
}

function expectedFont(
  plan: FigmaPlan,
  node: FigmaPlanNode
): { size: number; weight: number; lineHeight: number; color: string | undefined } | undefined {
  const style = node.textStyle ? plan.textStyles[node.textStyle] : undefined;
  if (style === undefined) return undefined;
  return {
    size: style.fontSize,
    weight: style.fontWeight,
    lineHeight: style.lineHeight,
    color: resolveToken(plan, node.color),
  };
}

function pushMismatch(
  findings: ConformanceFinding[],
  node: FigmaPlanNode,
  property: string,
  expected: string | number,
  actual: string | number,
  message: string,
  tolerance?: number
): void {
  findings.push({
    code: "CONFORMANCE_STYLE_MISMATCH",
    severity: "blocker",
    specId: node.specId,
    property,
    expected: String(expected),
    actual: String(actual),
    ...(tolerance === undefined ? {} : { tolerance }),
    message,
  });
}

function compareNumber(
  findings: ConformanceFinding[],
  node: FigmaPlanNode,
  property: string,
  expected: number,
  actual: number,
  tolerance = 0
): void {
  if (Math.abs(expected - actual) > tolerance) {
    pushMismatch(
      findings,
      node,
      property,
      expected,
      actual,
      `${property} expected ${expected}, got ${actual}`,
      tolerance
    );
  }
}

function compareColor(
  findings: ConformanceFinding[],
  node: FigmaPlanNode,
  property: string,
  expected: string,
  actual: string
): void {
  if (!sameColor(expected, actual)) {
    pushMismatch(findings, node, property, expected, actual, `${property} color mismatch`);
  }
}

function compareTint(
  findings: ConformanceFinding[],
  node: FigmaPlanNode,
  property: string,
  expected: string,
  actual: string,
  alpha: number
): void {
  if (!sameTint(expected, actual, alpha)) {
    pushMismatch(
      findings,
      node,
      property,
      expected,
      actual,
      `${property} tint mismatch for alpha ${alpha}`
    );
  }
}

function compareNode(
  plan: FigmaPlan,
  node: FigmaPlanNode,
  style: StyleNode,
  findings: ConformanceFinding[]
): void {
  if (node.type === "TEXT") {
    const font = expectedFont(plan, node);
    if (font) {
      compareNumber(findings, node, "fontSize", font.size, style.font.size);
      compareNumber(findings, node, "fontWeight", font.weight, style.font.weight);
      compareNumber(findings, node, "lineHeight", font.lineHeight, style.font.lineHeight);
      if (font.color) compareColor(findings, node, "textColor", font.color, style.font.color);
    }
    if (
      node.characters !== undefined &&
      style.text !== undefined &&
      node.characters.trim() !== style.text
    ) {
      findings.push({
        code: "CONFORMANCE_TEXT_MISMATCH",
        severity: "major",
        specId: node.specId,
        expected: node.characters,
        actual: style.text,
        message: "Text content differs from the plan.",
      });
    }
    return;
  }

  if (node.type === "INSTANCE") {
    const variant = plan.components.Button.variants[node.variant ?? ""];
    if (variant) {
      // A plan node may override the component variant (footer buttons grow to
      // 44px); the override is what the HTML actually renders.
      const height = node.height ?? variant.height;
      if (height !== undefined) {
        compareNumber(
          findings,
          node,
          "height",
          height,
          style.rect.height,
          node.height === undefined ? 0 : 1
        );
      }
      const radius = node.radius ?? variant.radius;
      if (radius !== undefined) compareNumber(findings, node, "radius", radius, style.radius);
      const paddingX = node.paddingX ?? variant.paddingX;
      if (paddingX !== undefined) {
        compareNumber(findings, node, "paddingLeft", paddingX, style.padding.left);
      }
      const fill = resolveToken(plan, node.fill ?? variant.fill);
      const fillAlpha = node.fillAlpha ?? variant.fillAlpha ?? 1;
      if (fill !== undefined) {
        if (fillAlpha < 1) {
          compareTint(findings, node, "background", fill, style.background.color, fillAlpha);
        } else {
          compareColor(findings, node, "background", fill, style.background.color);
        }
      }
      const stroke = resolveToken(plan, node.stroke ?? variant.stroke);
      const strokeAlpha = variant.strokeAlpha ?? 1;
      if (stroke !== undefined) {
        if (strokeAlpha < 1) {
          compareTint(findings, node, "borderTop", stroke, style.border.top.color, strokeAlpha);
        } else {
          compareColor(findings, node, "borderTop", stroke, style.border.top.color);
        }
      }
      const font = variant.labelTextStyle ? plan.textStyles[variant.labelTextStyle] : undefined;
      if (font) {
        compareNumber(findings, node, "fontSize", font.fontSize, style.font.size);
        compareNumber(findings, node, "fontWeight", font.fontWeight, style.font.weight);
      }
      const textColor = resolveToken(plan, variant.text);
      if (textColor !== undefined) {
        compareColor(findings, node, "textColor", textColor, style.font.color);
      }
      if (node.label !== undefined && style.text !== undefined && node.label.trim() !== style.text) {
        findings.push({
          code: "CONFORMANCE_TEXT_MISMATCH",
          severity: "major",
          specId: node.specId,
          expected: node.label,
          actual: style.text,
          message: "Button label differs from the plan.",
        });
      }
    }
    return;
  }

  if (node.type === "GLYPH") {
    if (node.size !== undefined) compareNumber(findings, node, "fontSize", node.size, style.font.size);
    if (node.color) {
      compareColor(findings, node, "textColor", resolveToken(plan, node.color)!, style.font.color);
    }
    return;
  }

  const padding = {
    top: node.paddingTop ?? node.padding ?? node.paddingY ?? 0,
    right: node.paddingRight ?? node.padding ?? node.paddingX ?? 0,
    bottom: node.paddingBottom ?? node.padding ?? node.paddingY ?? 0,
    left: node.paddingLeft ?? node.padding ?? node.paddingX ?? 0,
  };
  compareNumber(findings, node, "paddingTop", padding.top, style.padding.top);
  compareNumber(findings, node, "paddingRight", padding.right, style.padding.right);
  compareNumber(findings, node, "paddingBottom", padding.bottom, style.padding.bottom);
  compareNumber(findings, node, "paddingLeft", padding.left, style.padding.left);
  if (node.layoutMode !== "NONE") {
    compareNumber(findings, node, "gap", node.gap ?? 0, style.gap.row);
  }
  compareNumber(findings, node, "radius", node.radius ?? 0, style.radius);

  const border = [
    ["borderTop", node.borderTop ?? node.stroke, node.borderTopWidth ?? node.strokeWidth, style.border.top],
    ["borderBottom", node.borderBottom ?? node.stroke, node.borderBottomWidth ?? node.strokeWidth, style.border.bottom],
    ["borderLeft", node.borderLeft ?? node.stroke, node.borderLeftWidth ?? node.strokeWidth, style.border.left],
    ["borderRight", node.stroke, node.strokeWidth, style.border.right],
  ] as const;
  for (const [property, token, width, actual] of border) {
    const expectedWidth = width ?? (token === undefined ? 0 : 1);
    const expectedColor = token === undefined ? undefined : resolveToken(plan, token)!;
    // The renderer may paint a declared bottom accent with a base border plus an
    // inset shadow (selected calendar day: 1px border/subtle + 2px status.info
    // shadow). Accept the shadow only when it supplies both the declared color
    // and the declared thickness, and only when the CSS border is thinner than
    // the plan; a thicker CSS border still fails.
    if (
      property === "borderBottom" &&
      expectedColor !== undefined &&
      expectedWidth > 0 &&
      actual.width < expectedWidth
    ) {
      const underline = insetBottomUnderline(style.boxShadow);
      if (
        underline !== undefined &&
        sameColor(expectedColor, underline.color) &&
        Math.abs(underline.thickness - expectedWidth) <= 0.5
      ) {
        continue;
      }
    }
    compareNumber(findings, node, `${property}Width`, expectedWidth, actual.width);
    if (expectedColor !== undefined && expectedWidth > 0) {
      compareColor(findings, node, property, expectedColor, actual.color);
    }
  }

  const fill = resolveToken(plan, node.fill);
  const expectedAlpha = node.fillAlpha ?? (fill === undefined ? 0 : 1);
  if (fill !== undefined) {
    if (expectedAlpha < 1) {
      compareTint(findings, node, "background", fill, style.background.color, expectedAlpha);
    } else {
      compareColor(findings, node, "background", fill, style.background.color);
      compareNumber(findings, node, "backgroundAlpha", expectedAlpha, style.background.alpha, 0.01);
    }
  } else if (style.background.alpha > 0.01) {
    pushMismatch(findings, node, "background", "transparent", style.background.color, "Unexpected background fill");
  }

  if (node.width !== undefined) {
    compareNumber(findings, node, "width", node.width, style.rect.width, 1);
  }
  if (node.height !== undefined) {
    compareNumber(findings, node, "height", node.height, style.rect.height, 1);
  }
}

/**
 * Compare a Figma plan against an HTML computed-style manifest.
 *
 * Pure: no fs, no browser. The manifest is expected to contain the style for
 * every spec node in the plan and for material derived nodes (list rows, tabs,
 * calendar days/hours/cells/blocks). Non-material derived frames (`Card.head`,
 * `TitleRow`, `.frame` wrappers) are generator helpers with no DOM node. An
 * ABSOLUTE wrapper is compared through its child frame, keyed by the wrapper id.
 */
export function comparePlanToStyleManifest(input: {
  plan: FigmaPlan;
  manifest: StyleManifest;
  profile: Profile;
}): ConformancePage {
  const { plan, manifest } = input;
  const findings: ConformanceFinding[] = [];
  const styles = new Map(manifest.nodes.map((node) => [node.specId, node]));
  const seen = new Set<string>();
  const skipped = new Set(
    (plan.coverage?.nodes ?? [])
      .filter((node) => node.status === "skipped")
      .map((node) => node.specId)
  );

  const walk = (node: FigmaPlanNode): void => {
    const hidden = node.visible === false;
    const visible =
      !hidden && (node.origin !== "derived" || isMaterialDerivedId(node.specId));
    if (node.type === "ABSOLUTE") {
      const style = styles.get(node.specId);
      if (style && node.child) {
        seen.add(node.specId);
        compareNode(plan, { ...node.child, specId: node.specId }, style, findings);
      } else if (visible && !skipped.has(node.specId)) {
        findings.push({
          code: "CONFORMANCE_NODE_MISSING",
          severity: "blocker",
          specId: node.specId,
          message: `Absolute node ${node.name} has no HTML counterpart.`,
        });
      }
      for (const child of node.child?.children ?? []) walk(child);
      return;
    }
    const style = styles.get(node.specId);
    if (style) {
      seen.add(node.specId);
      compareNode(plan, node, style, findings);
    } else if (visible && !skipped.has(node.specId)) {
      findings.push({
        code: "CONFORMANCE_NODE_MISSING",
        severity: "blocker",
        specId: node.specId,
        message: `Plan node ${node.name} has no HTML counterpart.`,
      });
    }
    if (node.child) walk(node.child);
    for (const child of node.children ?? []) walk(child);
  };
  walk(plan.root);

  for (const style of manifest.nodes) {
    if (!seen.has(style.specId)) {
      findings.push({
        code: "CONFORMANCE_EXTRA_NODE",
        severity: "blocker",
        specId: style.specId,
        message: "HTML node is not present in the plan.",
      });
    }
  }

  return {
    pageId: plan.pageId,
    passed: findings.every((finding) => finding.severity !== "blocker"),
    checked: seen.size,
    skipped: skipped.size,
    findings,
  };
}
