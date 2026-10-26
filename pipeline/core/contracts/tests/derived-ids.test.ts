import { describe, expect, it } from "vitest";
import {
  MATERIAL_DERIVED_KINDS,
  derivedNodeId,
  isMaterialDerivedId,
} from "../src/index.js";

describe("derivedNodeId", () => {
  it("joins parent and segments with dots", () => {
    expect(derivedNodeId("today.list", "row", 0)).toBe("today.list.row.0");
    expect(derivedNodeId("today.tabbar", "tab", 2)).toBe("today.tabbar.tab.2");
    expect(derivedNodeId("today.calendar", "cell", 1, 3)).toBe(
      "today.calendar.cell.1.3"
    );
  });

  it("identifies material derived ids", () => {
    expect(isMaterialDerivedId("today.list.row.0")).toBe(true);
    expect(isMaterialDerivedId("today.calendar.block.2")).toBe(true);
    expect(isMaterialDerivedId("today.calendar.cell.1.3")).toBe(true);
    expect(isMaterialDerivedId("today.calendar.day.0.frame")).toBe(false);
    expect(isMaterialDerivedId("today.card.appointments")).toBe(false);
    expect([...MATERIAL_DERIVED_KINDS]).toContain("tab");
  });
});
