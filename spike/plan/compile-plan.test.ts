import { describe, expect, it } from "vitest";
import bSpec from "../spec/page-spec.b-end.json";
import cSpec from "../spec/page-spec.c-end.json";
import bProfile from "../spec/profile.b-dense.json";
import cProfile from "../spec/profile.c-expressive.json";
import { compilePlan } from "./compile-plan";
import type { PageSpec, PlanNode, Profile } from "./types";

function findNode(node: PlanNode, name: string): PlanNode | undefined {
  if (node.name === name) return node;
  if (node.type !== "FRAME") return undefined;
  for (const child of node.children) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return undefined;
}

function findAllNodes(
  node: PlanNode,
  name: string,
  out: PlanNode[] = []
): PlanNode[] {
  if (node.name === name) out.push(node);
  if (node.type === "FRAME") {
    for (const child of node.children) findAllNodes(child, name, out);
  }
  return out;
}

describe("compilePlan", () => {
  it("compiles the B-end page into a nested plan", () => {
    const plan = compilePlan(bSpec as PageSpec, bProfile as Profile);
    expect(plan.root.type).toBe("FRAME");
    if (plan.root.type !== "FRAME") throw new Error("root must be frame");
    expect(plan.root.layout).toBe("HORIZONTAL");

    const sidebar = findNode(plan.root, "Sidebar");
    expect(sidebar).toMatchObject({ type: "FRAME", width: 240 });

    expect(findNode(plan.root, "Header")).toMatchObject({
      type: "FRAME",
      paddingX: 24,
      paddingY: 0,
      alignItems: "CENTER",
    });

    const table = findNode(plan.root, "DataTable");
    expect(table).toBeDefined();
    if (table?.type === "FRAME") {
      expect(table.children).toHaveLength(6); // header + 5 rows
    }

    expect(plan.tokens["color.surface.default"]).toBe("#FFFFFF");
    expect(plan.tokens["space.6"]).toBe("24px");
    expect(plan.textStyles["body.md"].fontSize).toBe(14);
  });

  it("compiles the C-end page with feed cards and bottom nav", () => {
    const plan = compilePlan(cSpec as PageSpec, cProfile as Profile);
    expect(plan.root.type).toBe("FRAME");
    if (plan.root.type !== "FRAME") throw new Error("root must be frame");
    expect(plan.root.layout).toBe("VERTICAL");
    expect(plan.root.width).toBe(390);
    expect(findNode(plan.root, "FeedContent")).toMatchObject({
      type: "FRAME",
      padding: 16,
      gap: 16,
      layoutAlign: "STRETCH",
    });

    const feedCards = findAllNodes(plan.root, "FeedCard");
    expect(feedCards).toHaveLength(2);
    for (const card of feedCards) {
      expect(card).toMatchObject({ type: "FRAME", padding: 0 });
    }

    const feedTexts = findAllNodes(plan.root, "FeedText");
    expect(feedTexts).toHaveLength(2);
    for (const feedText of feedTexts) {
      expect(feedText).toMatchObject({
        type: "FRAME",
        paddingX: 16,
        paddingY: 12,
      });
    }

    expect(findNode(plan.root, "BottomNav")).toMatchObject({
      type: "FRAME",
      justifyContent: "SPACE_BETWEEN",
    });
    expect(findNode(plan.root, "bookmark")).toBeDefined();
  });
});
