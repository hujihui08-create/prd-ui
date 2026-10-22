import { describe, expect, it } from "vitest";
import { deriveStandardAssetInventory } from "../src/index.js";
import { employeeBrief } from "./fixtures.js";

describe("standard asset inventory", () => {
  it("maps standard actions to A-library icon ids and dedupes", () => {
    const brief = structuredClone(employeeBrief);
    brief.ia.pages[0]!.actions = ["新建预约", "搜索客户", "设置"];
    brief.ia.pages[0]!.content = {
      quickActions: [
        { label: "开单", icon: "plus" },
        { label: "预约", icon: "calendar" },
      ],
    };
    const inventory = deriveStandardAssetInventory(brief);
    expect(inventory.icons).toEqual(
      expect.arrayContaining(["icon-home", "icon-plus", "icon-search"])
    );
    expect(new Set(inventory.icons).size).toBe(inventory.icons.length);
    expect(inventory.placeholders).toEqual(
      expect.arrayContaining(["calendar", "settings"])
    );
  });
});
