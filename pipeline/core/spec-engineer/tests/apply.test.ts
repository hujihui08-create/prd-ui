import { describe, expect, it } from "vitest";
import {
  applySpecs,
  collectAssetReferences,
  uniqueAssetReferences,
} from "../src/index.js";
import {
  assetBriefs,
  baseSpecs,
  interactionSpec,
  makeInput,
  motionSpec,
} from "./fixtures.js";

describe("applySpecs", () => {
  it("maps transitions to navigate interactions and triggers to reactions", () => {
    const specs = applySpecs(makeInput());
    const today = specs.find((spec) => spec.meta.pageId === "today")!;

    expect(today.interactions).toEqual(
      expect.arrayContaining([
        {
          trigger: "点击库存查询",
          action: "navigate",
          target: "/inventory",
          reqRef: "REQ-EMP-001",
        },
        {
          trigger: "库存查询",
          action: "打开库存查询页",
          nodeId: "quick-inventory",
          reqRef: "REQ-EMP-001",
        },
      ])
    );
    const inventory = specs.find((spec) => spec.meta.pageId === "inventory-query")!;
    expect(inventory.interactions).toEqual(
      expect.arrayContaining([
        {
          trigger: "返回今日",
          action: "navigate",
          target: "/today",
          reqRef: "REQ-EMP-002",
        },
      ])
    );
  });

  it("replaces base interactions, dedupes repeats, and keeps transitions first", () => {
    const duplicated = {
      ...interactionSpec,
      pages: interactionSpec.pages.map((page) =>
        page.id === "today"
          ? { ...page, triggers: [...page.triggers, ...page.triggers] }
          : page
      ),
    };
    const today = applySpecs(makeInput({ interactionSpec: duplicated })).find(
      (spec) => spec.meta.pageId === "today"
    )!;

    expect(today.interactions[0]).toEqual({
      trigger: "点击库存查询",
      action: "navigate",
      target: "/inventory",
      reqRef: "REQ-EMP-001",
    });
    expect(today.interactions.filter((entry) => entry.trigger === "库存查询")).toHaveLength(1);
    expect(today.interactions).not.toContainEqual(
      expect.objectContaining({ trigger: "库存查询", action: "navigate" })
    );
  });

  it("merges interaction state descriptions into Page Spec states", () => {
    const today = applySpecs(makeInput()).find((spec) => spec.meta.pageId === "today")!;
    expect(today.states.default?.description).toBe("门店顶栏; 库存快捷操作; 预约列表");
    expect(today.states.loading?.description).toBe("骨架屏");
    expect(today.states.empty?.description).toBe("今天没有预约");
    expect(today.states.error?.description).toBe("错误说明; 重试按钮");
  });

  it("merges disabled and success interaction states", () => {
    const withExtraStates = {
      ...interactionSpec,
      pages: interactionSpec.pages.map((page) =>
        page.id === "today"
          ? {
              ...page,
              states: {
                ...page.states,
                disabled: ["无库存权限"],
                success: ["预约已更新"],
              },
            }
          : page
      ),
    };
    const today = applySpecs(makeInput({ interactionSpec: withExtraStates })).find(
      (spec) => spec.meta.pageId === "today"
    )!;

    expect(today.states.disabled).toEqual({
      name: "disabled",
      description: "无库存权限",
    });
    expect(today.states.success).toEqual({
      name: "success",
      description: "预约已更新",
    });
  });

  it("attaches only the page's motion bindings and used presets", () => {
    const specs = applySpecs(makeInput());
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    expect(Object.keys(today.motion?.presets ?? {})).toEqual([
      "list-stagger",
      "page-enter",
    ]);
    expect(today.motion?.bindings).toEqual([
      { nodeId: "quick-inventory", preset: "page-enter" },
      { nodeId: "appointments", preset: "list-stagger" },
    ]);
    expect(today.motion?.reducedMotion.fallback).toBe("fade");

    const inventory = specs.find((spec) => spec.meta.pageId === "inventory-query")!;
    expect(Object.keys(inventory.motion?.presets ?? {})).toEqual(["empty-fade"]);
  });

  it("does not mutate the base specs or the client motion spec", () => {
    const beforeSpecs = JSON.stringify(baseSpecs);
    const beforeMotion = JSON.stringify(motionSpec);
    applySpecs(makeInput());
    expect(JSON.stringify(baseSpecs)).toBe(beforeSpecs);
    expect(JSON.stringify(motionSpec)).toBe(beforeMotion);
  });

  it("adds sorted design defaults for motion and assets", () => {
    const today = applySpecs(makeInput()).find((spec) => spec.meta.pageId === "today")!;
    expect(today.traceability.designDefaults).toEqual(
      expect.arrayContaining([
        "asset:icon-package",
        "motion:list-stagger",
        "motion:page-enter",
      ])
    );
    const defaults = today.traceability.designDefaults;
    expect(defaults).toEqual([...defaults].sort());
  });

  it("collects QuickAction icon references and dedupes them", () => {
    const specs = applySpecs(makeInput());
    const references = collectAssetReferences(specs);
    expect(references.map((reference) => reference.assetId)).toContain("icon-package");
    expect(references.map((reference) => reference.assetId)).not.toContain("icon-plus");

    const duplicated = [...references, ...references];
    expect(uniqueAssetReferences(duplicated)).toHaveLength(references.length);
    expect(assetBriefs.map((brief) => brief.id)).toContain("icon-plus");
  });
});
