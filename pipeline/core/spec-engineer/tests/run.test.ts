import { describe, expect, it } from "vitest";
import { PageSpecSchema, type PageSpec } from "@prd-ui/contracts";
import {
  applySpecs,
  runSpecEngineer,
  SpecEngineerSummarySchema,
} from "../src/index.js";
import { makeInput } from "./fixtures.js";

describe("runSpecEngineer", () => {
  it("returns enriched specs, a passing gate, and a summary", async () => {
    const result = await runSpecEngineer(makeInput());

    expect(result.gate.passed).toBe(true);
    expect(result.summary.pages).toEqual(["today", "inventory-query"]);
    expect(result.summary.motionPages).toEqual(["today", "inventory-query"]);
    expect(result.summary.assets.referenced).toContain("icon-package");
    expect(result.summary.assets.unusedBriefs).toEqual(["icon-plus"]);
    expect(result.summary.assets.missing).toEqual([]);
    expect(SpecEngineerSummarySchema.parse(result.summary)).toEqual(result.summary);
    for (const spec of result.specs) {
      expect(PageSpecSchema.safeParse(spec).success).toBe(true);
    }
  });

  it("is byte-identical across runs", async () => {
    const first = await runSpecEngineer(makeInput());
    const second = await runSpecEngineer(makeInput());
    expect(JSON.stringify(first.specs)).toBe(JSON.stringify(second.specs));
    expect(JSON.stringify(first.summary.gate)).toBe(JSON.stringify(second.summary.gate));
  });

  it("reports SPEC_SCHEMA for an invalid base spec", async () => {
    const specs = applySpecs(makeInput());
    const bad = structuredClone(specs) as PageSpec[];
    bad[0]!.layout.props = { ...bad[0]!.layout.props, fill: "#ffffff" };

    const result = await runSpecEngineer(makeInput({ baseSpecs: bad }));

    expect(result.gate.passed).toBe(false);
    expect(result.summary.passed).toBe(false);
    expect(result.gate.issues.map((issue) => issue.code)).toContain("SPEC_SCHEMA");
  });
});
