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

  it("states are metadata and default-only content is requested", () => {
    const prompt = blockContentPrompt({
      pageId: "today",
      blockId: "today.content.1",
      role: "我的预约",
      allowedComponents: ["Card"],
      requiredStates: ["default", "empty", "loading", "error"],
      baseline: { id: "today.card.appointments", type: "Card" },
    });
    expect(prompt).toContain("Required states (metadata only)");
    expect(prompt).toContain("They are page-level overrides, not extra content");
    expect(prompt).toContain("Do not add loading, empty, or error");
    expect(prompt).toContain("do not drop hidden state placeholders");
  });

  it("preserves baseline ids and prefixes only newly created nodes", () => {
    const prompt = blockContentPrompt({
      pageId: "today",
      blockId: "today.content.1",
      role: "我的预约",
      allowedComponents: ["Card"],
      requiredStates: ["default"],
      baseline: { id: "today.card.appointments", type: "Card" },
    });
    expect(prompt).toContain("Preserve every existing baseline node id exactly");
    expect(prompt).toContain("Only nodes you newly create may use a");
    expect(prompt).not.toContain("under the block id prefix and preserve");
  });

  it("removes page chrome from the allowed component list", () => {
    const prompt = blockContentPrompt({
      pageId: "today",
      blockId: "today.content.0",
      role: "快捷操作",
      allowedComponents: ["TopBar", "TabBar", "Card", "Button"],
      requiredStates: ["default"],
      baseline: { id: "today.card.quick-actions", type: "Card" },
    });
    expect(prompt).toMatch(/Allowed component types: Card, Button\./);
    expect(prompt).toContain("TopBar, TabBar, BottomNav, or page-level actions");
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

  it("rejects nested page chrome", () => {
    const result = validateBlockContent({
      schemaVersion: "1.0",
      blockId: "today.content.0",
      root: {
        id: "today.card.quick-actions",
        type: "Card",
        children: [{ id: "today.tab-bar", type: "TabBar", props: {} }],
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("BLOCK_CONTENT_CHROME: TabBar");
  });

  it("rejects a draft with a malformed block id", () => {
    const result = validateBlockContent({
      schemaVersion: "1.0",
      blockId: "other.block",
      root: { id: "today.content.0", type: "Card", props: {}, children: [] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a well-formed id that does not match the requested block", () => {
    const result = validateBlockContent(
      {
        schemaVersion: "1.0",
        blockId: "today.content.1",
        root: { id: "today.content.1", type: "Card", props: {}, children: [] },
      },
      "today.content.0"
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("BLOCK_CONTENT_ID_MISMATCH");
  });
});
