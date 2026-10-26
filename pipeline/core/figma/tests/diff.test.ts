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
    if (node.width !== undefined) result.width = node.width;
    if (node.height !== undefined) result.height = node.height;
    if (node.type === "FRAME") {
      result.layoutMode = node.layoutMode;
      if (node.gap !== undefined) result.itemSpacing = node.gap;
      if (node.padding !== undefined) {
        result.padding = {
          top: node.padding,
          right: node.padding,
          bottom: node.padding,
          left: node.padding,
        };
      } else if (node.paddingX !== undefined || node.paddingY !== undefined) {
        result.padding = {
          top: node.paddingY ?? 0,
          right: node.paddingX ?? 0,
          bottom: node.paddingY ?? 0,
          left: node.paddingX ?? 0,
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
      if (node.color !== undefined) result.fills = [node.color];
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
});
