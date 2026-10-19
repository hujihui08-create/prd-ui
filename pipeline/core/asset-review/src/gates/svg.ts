import { DOMParser, XMLSerializer, type Document, type Element, type Node } from "@xmldom/xmldom";
import type { HardGateIssue, HardGateResult } from "../contracts.js";

export interface ParsedSvg {
  document: Document;
  root: Element;
}

export function parseSvg(svg: string): ParsedSvg | null {
  try {
    const document = new DOMParser({
      onError: (level, message) => {
        if (level === "error" || level === "fatalError") {
          throw new Error(message);
        }
      },
    }).parseFromString(svg, "image/svg+xml");
    const root = document.documentElement;
    if (!root || elementName(root) !== "svg") return null;
    return { document, root };
  } catch {
    return null;
  }
}

export function normalizeSvg(svg: string): string {
  const parsed = parseSvg(svg);
  if (!parsed) {
    throw new Error("SVG_INVALID: cannot normalize a malformed SVG document");
  }
  return new XMLSerializer().serializeToString(parsed.document);
}

export function elementName(element: Element): string {
  return element.nodeName.toLowerCase().replace(/^.*:/, "");
}

export function attr(element: Element, name: string): string | null {
  const value = element.getAttribute(name);
  return value === null ? null : value.trim();
}

export function walkElements(node: Node, visit: (element: Element) => void): void {
  const children = node.childNodes;
  for (let index = 0; index < children.length; index += 1) {
    const child = children.item(index);
    if (!child || child.nodeType !== 1) continue;
    const element = child as Element;
    visit(element);
    walkElements(element, visit);
  }
}

export function allElements(parsed: ParsedSvg): Element[] {
  const elements: Element[] = [];
  walkElements(parsed.document, (element) => elements.push(element));
  return elements;
}

export function gateResult(issues: HardGateIssue[]): HardGateResult {
  return {
    passed: !issues.some((issue) => issue.severity === "blocker"),
    issues,
  };
}

export function issue(
  code: string,
  message: string,
  evidence?: string,
  severity: HardGateIssue["severity"] = "blocker"
): HardGateIssue {
  return { code, severity, message, ...(evidence === undefined ? {} : { evidence }) };
}

export function parseViewBox(value: string | null): [number, number, number, number] | null {
  if (!value) return null;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  return [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
}

export function numericAttr(element: Element, name: string): number | null {
  const value = attr(element, name);
  if (value === null) return null;
  const match = value.match(/^-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

export function sameNumber(actual: string | null, expected: number): boolean {
  if (actual === null) return false;
  const match = actual.match(/^-?\d+(?:\.\d+)?/);
  return match !== null && Number(match[0]) === expected;
}

const NEUTRAL_COLORS = new Set(["none", "currentcolor", "transparent", "inherit", "context-fill", "context-stroke"]);

export function isNeutralColor(value: string): boolean {
  return NEUTRAL_COLORS.has(value.trim().toLowerCase());
}

export function isUrlColor(value: string): boolean {
  return /^url\(/i.test(value.trim());
}

export function collectColorValues(parsed: ParsedSvg): Array<{ value: string; element: Element }> {
  const colors: Array<{ value: string; element: Element }> = [];
  for (const element of allElements(parsed)) {
    for (const name of ["fill", "stroke", "stop-color", "color"]) {
      const value = attr(element, name);
      if (value !== null) colors.push({ value, element });
    }
  }
  return colors;
}

/** Shared safety checks: no script, no external refs, no event handlers, no raster. */
export function checkSvgSafety(parsed: ParsedSvg, options: { allowText: boolean }): HardGateIssue[] {
  const issues: HardGateIssue[] = [];
  const elements = allElements(parsed);

  for (const element of elements) {
    const name = elementName(element);

    if (name === "script" || name === "foreignobject") {
      issues.push(issue("SVG_SCRIPT", `SVG contains <${name}>.`, name));
    }
    if (name === "image") {
      issues.push(issue("SVG_IMAGE", "SVG contains a raster <image>.", "image"));
    }
    if (name === "text" && !options.allowText) {
      issues.push(issue("SVG_TEXT", "SVG contains <text>.", "text"));
    }
    if (name === "style") {
      issues.push(issue("SVG_STYLE", "SVG contains an embedded <style> block.", "style"));
    }

    const attributes = element.attributes;
    for (let index = 0; index < attributes.length; index += 1) {
      const attribute = attributes.item(index);
      if (!attribute) continue;
      const attributeName = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      if (attributeName.startsWith("on")) {
        issues.push(issue("SVG_EVENT_HANDLER", `SVG attribute ${attribute.name} is an event handler.`, elementName(element)));
      }
      if (attributeName === "href" || attributeName === "xlink:href") {
        if (!value.startsWith("#")) {
          issues.push(issue("SVG_EXTERNAL_REF", "SVG references an external resource.", value));
        }
      }
      if (value.toLowerCase().includes("javascript:")) {
        issues.push(issue("SVG_SCRIPT", "SVG attribute contains javascript:.", value));
      }
    }
  }

  return issues;
}

export function checkExternalColors(parsed: ParsedSvg, allowed: string[]): HardGateIssue[] {
  const allowedSet = new Set(allowed.map((color) => color.trim().toLowerCase()));
  const issues: HardGateIssue[] = [];
  for (const { value, element } of collectColorValues(parsed)) {
    const lowered = value.trim().toLowerCase();
    if (isNeutralColor(lowered) || isUrlColor(lowered)) continue;
    if (lowered.startsWith("var(")) {
      issues.push(issue("ILLUSTRATION_PALETTE", `Color ${value} must resolve through a palette token, not a CSS variable.`, elementName(element)));
      continue;
    }
    if (!allowedSet.has(lowered)) {
      issues.push(issue("ILLUSTRATION_PALETTE", `Color ${value} is not in the brief palette.`, elementName(element)));
    }
  }
  return issues;
}
