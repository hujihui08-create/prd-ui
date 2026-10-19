import { describe, expect, it } from "vitest";
import { UiBriefSchema } from "@prd-ui/contracts";
import brief from "../../../samples/ui-brief.sample.json";

describe("sample ui brief", () => {
  it("is valid and has 8 pages", () => {
    const parsed = UiBriefSchema.parse(brief);
    expect(parsed.ia.pages).toHaveLength(8);
    expect(parsed.ia.pages.map((p) => p.id).sort()).toEqual([
      "auth",
      "home-feed",
      "item-detail",
      "order-detail",
      "order-form",
      "orders-list",
      "orders-overview",
      "settings",
    ]);
  });

  it("has no blocking open questions", () => {
    expect(brief.openQuestions.filter((q) => q.blocking)).toHaveLength(0);
  });

  it("maps every requirement", () => {
    expect(Object.keys(brief.traceability.reqMap)).toHaveLength(8);
    expect(brief.traceability.unmapped).toEqual([]);
  });
});
