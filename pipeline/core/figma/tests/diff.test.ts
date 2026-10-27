import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  UiBriefSchema,
  type FigmaPlan,
  type FigmaPlanNode,
  type FigmaReadback,
  type FigmaReadbackNode,
} from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { compileFigmaPlans, diffFigma } from "../src/index.js";

const brief = UiBriefSchema.parse(
  JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
const plans = compileFigmaPlans(
  specs,
  (page) => getProfile(page.meta.profile),
  (page) => getCatalog(page.meta.profile)
);

function readbackFromPlan(plan: FigmaPlan): FigmaReadback {
  const readbackNode = (node: FigmaPlanNode): FigmaReadbackNode => {
    const children = [
      ...(node.children ?? []),
      ...(node.child === undefined ? [] : [node.child]),
    ].map(readbackNode);
    const result: FigmaReadbackNode = {
      specId: node.specId,
      nodeId: node.specId,
      type: node.type === "ABSOLUTE" ? "FRAME" : node.type,
      name: node.name,
      children,
    };
    const variant =
      node.type === "INSTANCE" ? plan.components.Button.variants[node.variant ?? ""] : undefined;
    const tokenColor = (name: string): string => plan.tokens[name] ?? name;
    if (node.width !== undefined) result.width = node.width;
    if (node.height !== undefined) result.height = node.height;
    if (node.type === "FRAME") {
      result.layoutMode = node.layoutMode;
      if (node.gap !== undefined) result.itemSpacing = node.gap;
      // Mirror the plugin's per-side precedence so slot wrappers that carry only
      // paddingTop/paddingX/paddingBottom round-trip through the fixture.
      if (
        node.padding !== undefined ||
        node.paddingX !== undefined ||
        node.paddingY !== undefined ||
        node.paddingTop !== undefined ||
        node.paddingRight !== undefined ||
        node.paddingBottom !== undefined ||
        node.paddingLeft !== undefined
      ) {
        result.padding = {
          top: node.paddingTop ?? node.padding ?? node.paddingY ?? 0,
          right: node.paddingRight ?? node.padding ?? node.paddingX ?? 0,
          bottom: node.paddingBottom ?? node.padding ?? node.paddingY ?? 0,
          left: node.paddingLeft ?? node.padding ?? node.paddingX ?? 0,
        };
      }
      if (node.fill !== undefined) result.fills = [node.fill];
    }
    if (node.type === "ABSOLUTE") {
      result.x = node.x;
      result.y = node.y;
    }
    if (node.type === "TEXT") {
      result.textStyleName = node.textStyle;
      result.characters = node.characters;
      result.fontSize = node.textStyle === undefined ? undefined : plan.textStyles[node.textStyle]?.fontSize;
      const family =
        node.textStyle === undefined ? undefined : plan.textStyles[node.textStyle]?.fontFamily;
      if (family !== undefined) result.fontName = { family, style: "Regular" };
      if (node.color !== undefined) {
        result.fills = [node.color];
        result.textColor = tokenColor(node.color);
      }
      const style = node.textStyle === undefined ? undefined : plan.textStyles[node.textStyle];
      if (style !== undefined) {
        result.fontWeight = style.fontWeight;
        result.lineHeight = style.lineHeight;
      }
    }
    if (node.type === "INSTANCE") {
      result.componentName = "b-mobile/Button";
      result.variantProperties = { emphasis: node.variant ?? "" };
      result.characters = node.label;
    }
    if (node.type === "GLYPH" || node.type === "VECTOR") {
      if (node.size !== undefined) {
        result.width = node.size;
        result.height = node.size;
      }
    }
    if (node.type === "IMAGE") {
      result.fills = ["image"];
    }
    const applyBorder = (
      property: "borderTop" | "borderBottom" | "borderLeft",
      name: string | undefined,
      width: number | undefined
    ): void => {
      if (name === undefined) return;
      result[property] = { width: width ?? 1, color: tokenColor(name) };
    };
    const radius = node.radius ?? variant?.radius;
    if (radius !== undefined) result.cornerRadius = radius;
    const fill = node.fill ?? variant?.fill;
    if (fill !== undefined) {
      result.fillDetails = [
        { color: tokenColor(fill), alpha: node.fillAlpha ?? variant?.fillAlpha ?? 1 },
      ];
    }
    // The plugin reads a uniform stroke back as the top border; per-side plan
    // borders map to their matching readback side.
    applyBorder(
      "borderTop",
      node.borderTop ?? node.stroke ?? variant?.stroke,
      node.borderTopWidth ?? node.strokeWidth ?? variant?.strokeWidth
    );
    applyBorder("borderBottom", node.borderBottom, node.borderBottomWidth);
    applyBorder("borderLeft", node.borderLeft, node.borderLeftWidth);
    if (node.type === "GLYPH" && node.color !== undefined) result.textColor = tokenColor(node.color);
    return result;
  };

  return {
    schemaVersion: "1.0",
    pageId: plan.pageId,
    builtAt: "2026-10-23T00:00:00.000Z",
    fonts: Object.entries(plan.textStyles).map(([, style]) => ({
      family: style.fontFamily,
      style: "Regular",
      fallback: false,
    })),
    variables: Object.keys(plan.tokens).filter((key) => key.startsWith("color/")),
    textStyles: Object.keys(plan.textStyles),
    components: ["b-mobile/Button"],
    nodes: [readbackNode(plan.root)],
    errors: [],
  };
}

function firstPlan(): FigmaPlan {
  return plans.find((plan) => plan.pageId === "appointment-list")!;
}

function walkPlan(node: FigmaPlanNode): FigmaPlanNode[] {
  return [
    node,
    ...(node.child === undefined ? [] : walkPlan(node.child)),
    ...(node.children ?? []).flatMap((child) => walkPlan(child)),
  ];
}

function planNode(plan: FigmaPlan, specId: string): FigmaPlanNode {
  const node = walkPlan(plan.root).find((entry) => entry.specId === specId);
  if (node === undefined) throw new Error(`plan node missing: ${specId}`);
  return node;
}

function walkReadback(node: FigmaReadbackNode): FigmaReadbackNode[] {
  return [node, ...(node.children ?? []).flatMap((child) => walkReadback(child))];
}

function readbackNode(readback: FigmaReadback, specId: string): FigmaReadbackNode {
  const node = walkReadback(readback.nodes[0]!).find((entry) => entry.specId === specId);
  if (node === undefined) throw new Error(`readback node missing: ${specId}`);
  return node;
}

describe("diffFigma", () => {
  it("passes every clean plan/readback pair", () => {
    for (const plan of plans) {
      const diff = diffFigma(plan, readbackFromPlan(plan));
      expect(diff.findings, plan.pageId).toEqual([]);
      expect(diff.passed, plan.pageId).toBe(true);
    }
  });

  it("flags a missing node and a wrong hierarchy as blockers", () => {
    const plan = firstPlan();
    const readback = readbackFromPlan(plan);
    readback.nodes[0]!.children = readback.nodes[0]!.children?.slice(0, 1);
    const diff = diffFigma(plan, readback);
    expect(diff.blockerCount).toBeGreaterThan(0);
    expect(diff.findings.some((item) => item.code === "FIGMA_NODE_MISSING")).toBe(true);
    expect(diff.findings.some((item) => item.code === "FIGMA_HIERARCHY")).toBe(true);
  });

  it("flags text style/instance/absolute differences", () => {
    const plan = firstPlan();
    const readback = readbackFromPlan(plan);
    const walk = (node: FigmaReadbackNode) => {
      if (node.textStyleName !== undefined) node.textStyleName = "wrong/style";
      if (node.variantProperties !== undefined) node.variantProperties = { emphasis: "ghost" };
      if (node.x !== undefined) node.x = (node.x ?? 0) + 10;
      for (const child of node.children ?? []) walk(child);
    };
    walk(readback.nodes[0]!);
    const diff = diffFigma(plan, readback);
    expect(diff.findings.some((item) => item.code === "FIGMA_TEXT_STYLE")).toBe(true);
    expect(diff.findings.some((item) => item.code === "FIGMA_COMPONENT_INSTANCE")).toBe(true);
    expect(diff.findings.some((item) => item.code === "FIGMA_ABSOLUTE")).toBe(true);
  });

  it("fails the gate when more than two majors remain", () => {
    const plan = firstPlan();
    const readback = readbackFromPlan(plan);
    const walk = (node: FigmaReadbackNode) => {
      if (node.width !== undefined) node.width = (node.width ?? 0) + 20;
      for (const child of node.children ?? []) walk(child);
    };
    walk(readback.nodes[0]!);
    const diff = diffFigma(plan, readback, { maxMajor: 0 });
    expect(diff.passed).toBe(false);
    expect(diff.majorCount).toBeGreaterThan(0);
  });

  it("fails when coverage is missing", () => {
    const plan = structuredClone(plans[0]!);
    delete plan.coverage;
    const readback = readbackFromPlan(plan);
    const diff = diffFigma(plan, readback);
    expect(diff.passed).toBe(false);
    expect(diff.findings.some((finding) => finding.code === "COVERAGE_MISSING")).toBe(true);
  });

  it("fails on an unmapped node and reports the spec id", () => {
    const plan = structuredClone(plans[0]!);
    plan.coverage!.summary.unmapped += 1;
    plan.coverage!.nodes.push({
      specId: "today.chart",
      specType: "Chart",
      path: "layout.children[0]",
      status: "unmapped",
      reason: "UNMAPPED_COMPONENT:Chart",
    });
    const diff = diffFigma(plan, readbackFromPlan(plan));
    expect(diff.passed).toBe(false);
    expect(
      diff.findings.some(
        (finding) => finding.code === "UNMAPPED_COMPONENT" && finding.specId === "today.chart"
      )
    ).toBe(true);
  });

  it("reports degraded nodes as major", () => {
    const plan = structuredClone(plans[0]!);
    plan.coverage!.summary.degraded += 1;
    plan.coverage!.nodes.push({
      specId: "today.card.appointments",
      specType: "Card",
      path: "layout.slots.content[0]",
      status: "degraded",
      reason: "UNMAPPED_PROP:mystery",
    });
    const diff = diffFigma(plan, readbackFromPlan(plan));
    expect(diff.findings.some((finding) => finding.code === "UNMAPPED_PROP")).toBe(true);
    expect(diff.majorCount).toBeGreaterThan(0);
  });

  it("fails when a planned bottom border is missing in readback", () => {
    const plan = structuredClone(plans.find((entry) => entry.pageId === "today")!);
    const readback = readbackFromPlan(plan);
    const target = planNode(plan, "today.card.appointments");
    target.borderBottom = "color/border/subtle";
    target.borderBottomWidth = 1;
    const diff = diffFigma(plan, readback);
    expect(diff.findings).toHaveLength(1);
    expect(diff.findings[0]?.code).toBe("FIGMA_BORDER_MISMATCH");
    expect(diff.findings[0]?.severity).toBe("major");
    expect(diff.majorCount).toBe(1);
  });

  it("fails when a button radius differs", () => {
    const plan = structuredClone(plans.find((entry) => entry.pageId === "appointment-form")!);
    const readback = readbackFromPlan(plan);
    const instance = walkReadback(readback.nodes[0]!).find((node) => node.type === "INSTANCE")!;
    instance.cornerRadius = 0;
    const diff = diffFigma(plan, readback);
    expect(diff.findings.some((finding) => finding.code === "FIGMA_RADIUS_MISMATCH")).toBe(true);
  });

  it("flags border width and color drift", () => {
    const plan = structuredClone(plans.find((entry) => entry.pageId === "today")!);
    const readback = readbackFromPlan(plan);
    readbackNode(readback, "today.row.appointment.0").borderBottom = {
      width: 3,
      color: "#010203",
    };
    const diff = diffFigma(plan, readback);
    expect(diff.findings.some((finding) => finding.code === "FIGMA_BORDER_MISMATCH")).toBe(true);
  });

  it("flags a readback fill that differs from the plan", () => {
    const plan = structuredClone(plans.find((entry) => entry.pageId === "today")!);
    const readback = readbackFromPlan(plan);
    readbackNode(readback, "today.card.appointments").fillDetails![0]!.color = "#010203";
    const diff = diffFigma(plan, readback);
    expect(diff.findings.some((finding) => finding.code === "FIGMA_FILL_MISMATCH")).toBe(true);
  });

  it("flags text weight and line height drift", () => {
    const plan = structuredClone(plans.find((entry) => entry.pageId === "today")!);
    const readback = readbackFromPlan(plan);
    const node = walkReadback(readback.nodes[0]!).find(
      (entry) => entry.type === "TEXT" && entry.fontWeight !== undefined && entry.lineHeight !== undefined
    )!;
    node.fontWeight = (node.fontWeight ?? 0) + 100;
    node.lineHeight = (node.lineHeight ?? 0) + 4;
    const diff = diffFigma(plan, readback);
    expect(diff.findings.some((finding) => finding.code === "FIGMA_FONT_WEIGHT_MISMATCH")).toBe(true);
    expect(diff.findings.some((finding) => finding.code === "FIGMA_LINE_HEIGHT_MISMATCH")).toBe(true);
  });

  it("flags a text color that differs from the plan", () => {
    const plan = structuredClone(plans.find((entry) => entry.pageId === "today")!);
    const readback = readbackFromPlan(plan);
    const node = walkReadback(readback.nodes[0]!).find(
      (entry) => entry.type === "TEXT" && entry.textColor !== undefined
    )!;
    node.textColor = "#010203";
    const diff = diffFigma(plan, readback);
    expect(diff.findings.some((finding) => finding.code === "FIGMA_TEXT_COLOR_MISMATCH")).toBe(true);
  });

  it("reports a missing readback style as a minor unsupported finding", () => {
    const plan = structuredClone(plans.find((entry) => entry.pageId === "today")!);
    const readback = readbackFromPlan(plan);
    delete readbackNode(readback, "today.card.appointments").cornerRadius;
    const diff = diffFigma(plan, readback);
    const unsupported = diff.findings.find(
      (finding) => finding.code === "READBACK_STYLE_UNSUPPORTED"
    );
    expect(unsupported?.severity).toBe("minor");
    expect(unsupported?.message).toContain("cornerRadius");
    expect(diff.passed).toBe(true);
  });

  it("treats a style-less legacy readback as unsupported instead of failing", () => {
    const plan = structuredClone(plans.find((entry) => entry.pageId === "today")!);
    const readback = readbackFromPlan(plan);
    const strip = (node: FigmaReadbackNode): void => {
      delete node.cornerRadius;
      delete node.borderTop;
      delete node.borderBottom;
      delete node.borderLeft;
      delete node.fillDetails;
      delete node.fontWeight;
      delete node.textColor;
      delete node.lineHeight;
      for (const child of node.children ?? []) strip(child);
    };
    strip(readback.nodes[0]!);
    const diff = diffFigma(plan, readback);
    expect(diff.majorCount).toBe(0);
    expect(diff.findings.every((finding) => finding.severity === "minor")).toBe(true);
    expect(diff.findings.some((finding) => finding.code === "FIGMA_BORDER_MISMATCH")).toBe(false);
    expect(
      diff.findings.some(
        (finding) => finding.code === "READBACK_STYLE_UNSUPPORTED" && finding.severity === "minor"
      )
    ).toBe(true);
    expect(diff.passed).toBe(true);
  });
});
