import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  UiBriefSchema,
  isMaterialDerivedId,
  type FigmaPlan,
  type FigmaPlanNode,
  type StyleManifest,
  type StyleNode,
} from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { comparePlanToStyleManifest, compileFigmaPlans, parseCssColor } from "../src/index.js";

const brief = UiBriefSchema.parse(
  JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
const plans = compileFigmaPlans(
  specs,
  (page) => getProfile(page.meta.profile),
  (page) => getCatalog(page.meta.profile)
);

function plan(pageId: string): FigmaPlan {
  const found = plans.find((entry) => entry.pageId === pageId);
  if (found === undefined) throw new Error(`missing plan ${pageId}`);
  return found;
}

function visibleIds(plan: FigmaPlan): string[] {
  const ids = (plan.coverage?.nodes ?? [])
    .filter((node) => node.status !== "skipped")
    .map((node) => node.specId);
  const walk = (node: FigmaPlanNode): void => {
    if (node.origin === "derived" && isMaterialDerivedId(node.specId)) ids.push(node.specId);
    if (node.child) walk(node.child);
    for (const child of node.children ?? []) walk(child);
  };
  walk(plan.root);
  return [...new Set(ids)];
}

function plainStyle(specId: string): StyleNode {
  return {
    specId,
    tag: "div",
    text: "",
    rect: { width: 100, height: 40 },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    gap: { row: 0, column: 0 },
    border: {
      top: { width: 0, color: "rgba(0,0,0,0)" },
      right: { width: 0, color: "rgba(0,0,0,0)" },
      bottom: { width: 0, color: "rgba(0,0,0,0)" },
      left: { width: 0, color: "rgba(0,0,0,0)" },
    },
    radius: 0,
    background: { color: "rgba(0,0,0,0)", alpha: 0 },
    font: { family: "Noto Sans SC", size: 14, weight: 400, color: "#111827", lineHeight: 20 },
  };
}

function resolve(plan: FigmaPlan, value: string | undefined): string | undefined {
  return value === undefined ? undefined : (plan.tokens[value] ?? value);
}

/** What `color-mix(in srgb, token alpha, white)` paints, as an opaque rgb(). */
function mixWithWhite(color: string, alpha: number): string {
  const parsed = parseCssColor(color);
  if (parsed === undefined) return color;
  const channel = (value: number): number => Math.round(value * alpha + 255 * (1 - alpha));
  return `rgb(${channel(parsed.r)}, ${channel(parsed.g)}, ${channel(parsed.b)})`;
}

function expectedStyle(plan: FigmaPlan, node: FigmaPlanNode, specId = node.specId): StyleNode {
  const style = plainStyle(specId);
  if (node.type === "TEXT") {
    const textStyle = node.textStyle === undefined ? undefined : plan.textStyles[node.textStyle];
    if (textStyle !== undefined) {
      style.font = {
        family: textStyle.fontFamily,
        size: textStyle.fontSize,
        weight: textStyle.fontWeight,
        color: resolve(plan, node.color) ?? style.font.color,
        lineHeight: textStyle.lineHeight,
      };
    }
    style.text = (node.characters ?? "").trim();
    return style;
  }
  if (node.type === "INSTANCE") {
    const variant = plan.components.Button.variants[node.variant ?? ""];
    if (variant === undefined) return style;
    const height = node.height ?? variant.height;
    if (height !== undefined) style.rect.height = height;
    style.radius = node.radius ?? variant.radius ?? style.radius;
    const paddingX = node.paddingX ?? variant.paddingX;
    if (paddingX !== undefined) {
      style.padding.left = paddingX;
      style.padding.right = paddingX;
    }
    const fill = resolve(plan, node.fill ?? variant.fill);
    const fillAlpha = node.fillAlpha ?? variant.fillAlpha ?? 1;
    if (fill !== undefined) {
      style.background = {
        color: fillAlpha < 1 ? mixWithWhite(fill, fillAlpha) : fill,
        alpha: 1,
      };
    }
    const stroke = resolve(plan, node.stroke ?? variant.stroke);
    const strokeAlpha = variant.strokeAlpha ?? 1;
    if (stroke !== undefined) {
      style.border.top = {
        width: node.strokeWidth ?? variant.strokeWidth ?? 1,
        color: strokeAlpha < 1 ? mixWithWhite(stroke, strokeAlpha) : stroke,
      };
    }
    const labelFont = plan.textStyles[variant.labelTextStyle];
    if (labelFont !== undefined) {
      style.font.size = labelFont.fontSize;
      style.font.weight = labelFont.fontWeight;
    }
    style.font.color = resolve(plan, variant.text) ?? style.font.color;
    style.text = (node.label ?? "").trim();
    return style;
  }
  if (node.type === "GLYPH") {
    if (node.size !== undefined) style.font.size = node.size;
    style.font.color = resolve(plan, node.color) ?? style.font.color;
    return style;
  }
  style.padding = {
    top: node.padding ?? node.paddingY ?? 0,
    right: node.padding ?? node.paddingX ?? 0,
    bottom: node.padding ?? node.paddingY ?? 0,
    left: node.padding ?? node.paddingX ?? 0,
  };
  const gap = node.layoutMode === "NONE" ? 0 : (node.gap ?? 0);
  style.gap = { row: gap, column: gap };
  style.radius = node.radius ?? 0;
  const borderSide = (token: string | undefined, width: number | undefined) => {
    const color = resolve(plan, token);
    return color === undefined
      ? { width: width ?? 0, color: "rgba(0,0,0,0)" }
      : { width: width ?? 1, color };
  };
  style.border = {
    top: borderSide(node.borderTop ?? node.stroke, node.borderTopWidth ?? node.strokeWidth),
    right: borderSide(node.stroke, node.strokeWidth),
    bottom: borderSide(node.borderBottom ?? node.stroke, node.borderBottomWidth ?? node.strokeWidth),
    left: borderSide(node.borderLeft ?? node.stroke, node.borderLeftWidth ?? node.strokeWidth),
  };
  const fill = resolve(plan, node.fill);
  const fillAlpha = node.fillAlpha ?? 1;
  style.background =
    fill === undefined
      ? { color: "rgba(0,0,0,0)", alpha: 0 }
      : { color: fillAlpha < 1 ? mixWithWhite(fill, fillAlpha) : fill, alpha: 1 };
  if (node.width !== undefined) style.rect.width = node.width;
  if (node.height !== undefined) style.rect.height = node.height;
  return style;
}

/** Plan nodes that require an HTML style, with ABSOLUTE wrappers mapped to their child frame. */
function styleNodes(plan: FigmaPlan): Map<string, FigmaPlanNode> {
  const byId = new Map<string, FigmaPlanNode>();
  const walk = (node: FigmaPlanNode): void => {
    if (node.type === "ABSOLUTE") {
      // The wrapper has no DOM node; its child frame carries the visual style.
      if (node.child) byId.set(node.specId, node.child);
      for (const child of node.child?.children ?? []) walk(child);
      return;
    }
    byId.set(node.specId, node);
    if (node.child) walk(node.child);
    for (const child of node.children ?? []) walk(child);
  };
  walk(plan.root);
  return byId;
}

function manifestFor(plan: FigmaPlan): StyleManifest {
  const byId = styleNodes(plan);
  // Coverage can list spec nodes inside a skipped ancestor; the plan drops them,
  // so only ids that really exist in the plan get a captured style.
  const nodes = visibleIds(plan)
    .filter((specId) => byId.has(specId))
    .map((specId) => expectedStyle(plan, byId.get(specId)!, specId));
  return {
    schemaVersion: "1.0",
    pageId: plan.pageId,
    viewport: { width: 390, height: 844 },
    capturedAt: "2026-10-26T00:00:00.000Z",
    nodes,
  };
}

function fixturePlan(root: FigmaPlanNode, coverageIds: string[] = [root.specId]): FigmaPlan {
  return {
    schemaVersion: "1.0",
    project: "fixture",
    pageId: "fixture",
    pageName: "Fixture",
    width: 390,
    height: 844,
    background: "color/surface/default",
    tokens: { "color/surface/default": "#FFFFFF" },
    textStyles: {},
    components: { Button: { variants: {} } },
    root,
    coverage: {
      nodes: coverageIds.map((specId) => ({
        specId,
        specType: "MobileShell",
        path: "layout",
        status: "mapped" as const,
      })),
      summary: {
        spec: coverageIds.length,
        derived: 0,
        mapped: coverageIds.length,
        degraded: 0,
        unmapped: 0,
        skipped: 0,
      },
    },
    stats: { frames: 1, texts: 0, instances: 0, icons: 0, images: 0 },
  };
}

function fixtureManifest(nodes: StyleNode[]): StyleManifest {
  return {
    schemaVersion: "1.0",
    pageId: "fixture",
    viewport: { width: 390, height: 844 },
    capturedAt: "2026-10-26T00:00:00.000Z",
    nodes,
  };
}

describe("comparePlanToStyleManifest", () => {
  it("passes a minimal plan with matching defaults", () => {
    const minimal = fixturePlan({
      specId: "fixture.root",
      type: "FRAME",
      name: "Root",
      layoutMode: "VERTICAL",
      children: [],
      origin: "spec",
      mapping: "mapped",
    });
    const page = comparePlanToStyleManifest({
      plan: minimal,
      manifest: fixtureManifest([plainStyle("fixture.root")]),
      profile: getProfile("b-mobile"),
    });
    expect(page.findings.filter((finding) => finding.severity === "blocker")).toHaveLength(0);
  });

  it("flags an ABSOLUTE node without a style even when it is spec-origin", () => {
    const fixture = fixturePlan(
      {
        specId: "fixture.root",
        type: "FRAME",
        name: "Root",
        layoutMode: "VERTICAL",
        children: [
          {
            specId: "fixture.overlay",
            type: "ABSOLUTE",
            name: "Overlay",
            x: 0,
            y: 0,
            width: 100,
            height: 40,
            origin: "spec",
            mapping: "mapped",
            child: {
              specId: "fixture.overlay.frame",
              type: "FRAME",
              name: "Overlay frame",
              layoutMode: "VERTICAL",
              children: [],
              width: 100,
              height: 40,
              origin: "derived",
              mapping: "mapped",
            },
          },
        ],
        origin: "spec",
        mapping: "mapped",
      },
      ["fixture.root", "fixture.overlay"]
    );
    const page = comparePlanToStyleManifest({
      plan: fixture,
      manifest: fixtureManifest([plainStyle("fixture.root")]),
      profile: getProfile("b-mobile"),
    });
    expect(
      page.findings.some(
        (finding) =>
          finding.code === "CONFORMANCE_NODE_MISSING" &&
          finding.specId === "fixture.overlay" &&
          finding.severity === "blocker"
      )
    ).toBe(true);
    expect(page.passed).toBe(false);
  });

  it("passes compiled plans whose manifest mirrors every visible node", () => {
    for (const pageId of ["today", "appointment-list"]) {
      const compiled = plan(pageId);
      const page = comparePlanToStyleManifest({
        plan: compiled,
        manifest: manifestFor(compiled),
        profile: getProfile("b-mobile"),
      });
      expect(
        page.findings.filter((finding) => finding.severity === "blocker"),
        pageId
      ).toHaveLength(0);
      expect(page.passed, pageId).toBe(true);
      expect(page.checked, pageId).toBeGreaterThan(0);
    }
  });

  it("does not require html nodes for non-material derived frames", () => {
    const compiled = plan("today");
    const manifest = manifestFor(compiled);
    expect(manifest.nodes.some((node) => node.specId === "today.row.appointment.0.titleRow")).toBe(
      false
    );
    const page = comparePlanToStyleManifest({
      plan: compiled,
      manifest,
      profile: getProfile("b-mobile"),
    });
    expect(page.findings.some((finding) => finding.specId === "today.row.appointment.0.titleRow")).toBe(
      false
    );
    expect(page.findings.some((finding) => finding.code === "CONFORMANCE_NODE_MISSING")).toBe(false);
  });

  it("fails when a declared bottom border color differs from the manifest", () => {
    const compiled = plan("today");
    const manifest = manifestFor(compiled);
    const target = manifest.nodes.find((node) => node.specId === "today.row.appointment.0")!;
    target.border.bottom = { width: 1, color: "rgb(226, 232, 240)" };
    const page = comparePlanToStyleManifest({
      plan: compiled,
      manifest,
      profile: getProfile("b-mobile"),
    });
    expect(
      page.findings.some(
        (finding) =>
          finding.code === "CONFORMANCE_STYLE_MISMATCH" &&
          finding.specId === "today.row.appointment.0" &&
          finding.property === "borderBottom"
      )
    ).toBe(true);
  });

  it("normalizes token colors against rgb()", () => {
    const compiled = plan("today");
    const manifest = manifestFor(compiled);
    const root = manifest.nodes.find((node) => node.specId === compiled.root.specId)!;
    root.background = { color: "rgb(245, 246, 248)", alpha: 1 };
    const page = comparePlanToStyleManifest({
      plan: compiled,
      manifest,
      profile: getProfile("b-mobile"),
    });
    expect(
      page.findings.some(
        (finding) => finding.property === "background" && finding.severity === "blocker"
      )
    ).toBe(false);
  });

  it("fails on a button height mismatch", () => {
    const compiled = plan("appointment-form");
    const manifest = manifestFor(compiled);
    const button = manifest.nodes.find(
      (node) => node.specId === "appointment-form.action.save"
    )!;
    button.rect.height = 36;
    const page = comparePlanToStyleManifest({
      plan: compiled,
      manifest,
      profile: getProfile("b-mobile"),
    });
    expect(
      page.findings.some(
        (finding) =>
          finding.code === "CONFORMANCE_STYLE_MISMATCH" &&
          finding.specId === "appointment-form.action.save" &&
          finding.property === "height"
      )
    ).toBe(true);
  });

  it("accepts a color-mix tint for a translucent danger border", () => {
    const compiled = plan("appointment-detail");
    const manifest = manifestFor(compiled);
    const button = manifest.nodes.find(
      (node) => node.specId === "appointment-detail.action.cancel"
    )!;
    // Chrome serialization of color-mix(in srgb, status.danger 40%, white).
    button.border.top = { width: 1, color: "color(srgb 0.839216 0.643137 0.643137)" };
    const page = comparePlanToStyleManifest({
      plan: compiled,
      manifest,
      profile: getProfile("b-mobile"),
    });
    expect(page.findings.filter((finding) => finding.severity === "blocker")).toHaveLength(0);
    expect(page.passed).toBe(true);
  });

  it("rejects a solid token border for a translucent danger variant", () => {
    const compiled = plan("appointment-detail");
    const manifest = manifestFor(compiled);
    const button = manifest.nodes.find(
      (node) => node.specId === "appointment-detail.action.cancel"
    )!;
    button.border.top = { width: 1, color: "#991B1B" };
    const page = comparePlanToStyleManifest({
      plan: compiled,
      manifest,
      profile: getProfile("b-mobile"),
    });
    expect(
      page.findings.some(
        (finding) =>
          finding.code === "CONFORMANCE_STYLE_MISMATCH" &&
          finding.specId === "appointment-detail.action.cancel" &&
          finding.property === "borderTop" &&
          finding.severity === "blocker"
      )
    ).toBe(true);
  });

  it("accepts an opaque color-mix fill for a selected translucent calendar day", () => {
    const compiled = plan("appointment-list");
    const manifest = manifestFor(compiled);
    const day = manifest.nodes.find(
      (node) => node.specId === "appointment-list.calendar.grid.day.2"
    )!;
    // color-mix(in srgb, status.info 14%, surface-subtle), serialized as rgb().
    day.background = { color: "rgb(215, 222, 244)", alpha: 1 };
    const page = comparePlanToStyleManifest({
      plan: compiled,
      manifest,
      profile: getProfile("b-mobile"),
    });
    expect(page.findings.filter((finding) => finding.severity === "blocker")).toHaveLength(0);
    expect(page.passed).toBe(true);
  });

  it("rejects a solid or wrong-hue fill for a selected calendar day", () => {
    const dayId = "appointment-list.calendar.grid.day.2";
    for (const color of ["#1D4ED8", "rgb(216, 244, 222)"]) {
      const compiled = plan("appointment-list");
      const manifest = manifestFor(compiled);
      const day = manifest.nodes.find((node) => node.specId === dayId)!;
      day.background = { color, alpha: 1 };
      const page = comparePlanToStyleManifest({
        plan: compiled,
        manifest,
        profile: getProfile("b-mobile"),
      });
      expect(
        page.findings.some(
          (finding) =>
            finding.code === "CONFORMANCE_STYLE_MISMATCH" &&
            finding.specId === dayId &&
            finding.property === "background" &&
            finding.severity === "blocker"
        ),
        color
      ).toBe(true);
    }
  });

  it("flags a material derived node missing from the html", () => {
    const compiled = plan("appointment-list");
    const manifest = manifestFor(compiled);
    manifest.nodes = manifest.nodes.filter(
      (node) => node.specId !== "appointment-list.calendar.grid.day.0"
    );
    const page = comparePlanToStyleManifest({
      plan: compiled,
      manifest,
      profile: getProfile("b-mobile"),
    });
    expect(
      page.findings.some(
        (finding) =>
          finding.code === "CONFORMANCE_NODE_MISSING" &&
          finding.specId === "appointment-list.calendar.grid.day.0" &&
          finding.severity === "blocker"
      )
    ).toBe(true);
  });

  it("flags a missing spec node as a blocker", () => {
    const compiled = plan("today");
    const manifest = manifestFor(compiled);
    manifest.nodes = manifest.nodes.filter((node) => node.specId !== "today.row.appointment.0");
    const page = comparePlanToStyleManifest({
      plan: compiled,
      manifest,
      profile: getProfile("b-mobile"),
    });
    expect(
      page.findings.some(
        (finding) =>
          finding.code === "CONFORMANCE_NODE_MISSING" &&
          finding.specId === "today.row.appointment.0" &&
          finding.severity === "blocker"
      )
    ).toBe(true);
    expect(page.passed).toBe(false);
  });

  it("flags extra html nodes as blockers", () => {
    const compiled = plan("today");
    const manifest = manifestFor(compiled);
    manifest.nodes.push(plainStyle("today.ghost.node"));
    const page = comparePlanToStyleManifest({
      plan: compiled,
      manifest,
      profile: getProfile("b-mobile"),
    });
    expect(
      page.findings.some(
        (finding) =>
          finding.code === "CONFORMANCE_EXTRA_NODE" &&
          finding.specId === "today.ghost.node" &&
          finding.severity === "blocker"
      )
    ).toBe(true);
    expect(page.passed).toBe(false);
  });

  it("reports text mismatches as major", () => {
    const compiled = plan("appointment-form");
    const manifest = manifestFor(compiled);
    const button = manifest.nodes.find(
      (node) => node.specId === "appointment-form.action.save"
    )!;
    button.text = "提交";
    const page = comparePlanToStyleManifest({
      plan: compiled,
      manifest,
      profile: getProfile("b-mobile"),
    });
    const finding = page.findings.find(
      (entry) =>
        entry.code === "CONFORMANCE_TEXT_MISMATCH" &&
        entry.specId === "appointment-form.action.save"
    );
    expect(finding?.severity).toBe("major");
    expect(page.passed).toBe(true);
  });
});
