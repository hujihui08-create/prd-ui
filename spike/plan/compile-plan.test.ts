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

describe("compilePlan", () => {
  it("compiles the B-end page into a nested plan", () => {
    const plan = compilePlan(bSpec as PageSpec, bProfile as Profile);
    expect(plan.root.type).toBe("FRAME");
    if (plan.root.type !== "FRAME") throw new Error("root must be frame");
    expect(plan.root.layout).toBe("HORIZONTAL");

    const sidebar = findNode(plan.root, "Sidebar");
    expect(sidebar).toMatchObject({ type: "FRAME", width: 240 });

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
    expect(
      plan.root.children.filter(
        (node) => node.type === "FRAME" && node.name === "FeedCard"
      )
    ).toHaveLength(2);
    expect(findNode(plan.root, "BottomNav")).toBeDefined();
    expect(findNode(plan.root, "bookmark")).toBeDefined();
  });
});
