import { describe, expect, it } from "vitest";
import { findRequiredSections, normalizePrd } from "../src/normalize.js";
import { normalized, prdHash, prdText, project } from "./fixtures.js";

describe("normalizePrd", () => {
  it("indexes sections, tables, and the required section map", () => {
    expect(normalized.title).toContain("订单管理");
    expect(normalized.sourceHash).toBe(prdHash);
    expect(normalized.sections.length).toBeGreaterThan(10);
    expect(normalized.tables.length).toBeGreaterThanOrEqual(5);

    const required = findRequiredSections(normalized);
    expect(required.business_scope.length).toBeGreaterThan(0);
    expect(required.roles_permissions.length).toBeGreaterThan(0);
    expect(required.page_inventory.length).toBeGreaterThan(0);
    expect(required.state_matrix.length).toBeGreaterThan(0);
    expect(required.field_tables.length).toBeGreaterThan(0);
    expect(required.acceptance_examples.length).toBeGreaterThan(0);
  });

  it("marks the explicitly non-blocking open-questions section as non-blocking", () => {
    const openQuestion = normalized.placeholders.find((placeholder) =>
      placeholder.text.includes("待确认事项")
    );
    expect(openQuestion).toBeDefined();
    expect(openQuestion?.blocking).toBe(false);
  });

  it("does not flag a parent section that only contains subsections as empty", () => {
    const empty = normalized.placeholders.filter(
      (placeholder) => placeholder.kind === "empty-section"
    );
    expect(empty.map((placeholder) => placeholder.text)).not.toContain("5. 字段表");
    expect(empty.map((placeholder) => placeholder.text)).not.toContain("6. 验收示例");
  });

  it("is stable across repeated normalization", () => {
    const again = normalizePrd({
      prdText: prdText.replace(/\n/g, "\r\n"),
      project,
      sourcePath: "samples/sample-prd.md",
      sourceHash: prdHash,
      generatedAt: "2026-10-20T00:00:00.000Z",
    });
    expect(again.sections).toEqual(normalized.sections);
    expect(again.tables).toEqual(normalized.tables);
  });
});
