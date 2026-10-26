import { describe, expect, it } from "vitest";
import { blockContentPrompt, validateBlockContent } from "../src/index.js";

describe("block content", () => {
  it("forbids tool use so one block costs one model call", () => {
    const prompt = blockContentPrompt({
      pageId: "today",
      blockId: "today.content.0",
      role: "快捷操作",
      allowedComponents: ["Card", "Row"],
      requiredStates: ["default"],
      baseline: { id: "today.card.quick-actions", type: "Card" },
    });
    expect(prompt).toContain("Do not call tools");
    expect(prompt).toContain("today.content.0");
    expect(prompt).toContain("today.card.quick-actions");
  });

  it("accepts a valid block draft", () => {
    const result = validateBlockContent({
      schemaVersion: "1.0",
      blockId: "today.content.0",
      root: { id: "today.content.0", type: "Card", props: { title: "今日" }, children: [] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a draft with a shell root", () => {
    const result = validateBlockContent({
      schemaVersion: "1.0",
      blockId: "today.content.0",
      root: { id: "today.content.0", type: "MobileShell", props: {}, slots: {} },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a draft with the wrong block id", () => {
    const result = validateBlockContent({
      schemaVersion: "1.0",
      blockId: "other.block",
      root: { id: "today.content.0", type: "Card", props: {}, children: [] },
    });
    expect(result.success).toBe(false);
  });
});
