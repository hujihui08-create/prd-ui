import { describe, expect, it } from "vitest";
import {
  FigmaPlanSchema,
  FigmaReadbackSchema,
  type FigmaPlan,
  type FigmaReadback,
} from "../src/index.js";

const plan: FigmaPlan = {
  schemaVersion: "1.0",
  project: "fixture",
  pageId: "today",
  pageName: "今日",
  width: 390,
  height: 844,
  background: "color/surface/subtle",
  tokens: { "color/surface/default": "#FFFFFF" },
  textStyles: {
    "b-mobile/heading.2": {
      fontFamily: "Noto Sans SC",
      fontSize: 16,
      fontWeight: 600,
      lineHeight: 24,
    },
  },
  components: {
    Button: {
      variants: {
        primary: { fill: "color/action/primary", text: "color/text/onAction", labelTextStyle: "b-mobile/body.md" },
        secondary: { fill: "color/surface/default", text: "color/text/primary", labelTextStyle: "b-mobile/body.md" },
        ghost: { fill: "color/surface/default", text: "color/text/secondary", labelTextStyle: "b-mobile/body.md" },
        danger: { fill: "color/surface/default", text: "color/status/danger", labelTextStyle: "b-mobile/body.md" },
      },
    },
  },
  root: {
    specId: "today.page.root",
    type: "FRAME",
    name: "今日",
    layoutMode: "VERTICAL",
    width: 390,
    height: 844,
    children: [
      {
        specId: "today.header",
        type: "TEXT",
        name: "标题",
        characters: "今日",
        textStyle: "b-mobile/heading.2",
      },
    ],
  },
  stats: { frames: 1, texts: 1, instances: 0, icons: 0, images: 0 },
};

const readback: FigmaReadback = {
  schemaVersion: "1.0",
  pageId: "today",
  builtAt: "2026-10-23T00:00:00.000Z",
  fonts: [{ family: "Noto Sans SC", style: "SemiBold", fallback: false }],
  variables: ["color/surface/default"],
  textStyles: ["b-mobile/heading.2"],
  components: ["b-mobile/Button"],
  nodes: [
    {
      nodeId: "1:1",
      specId: "today.page.root",
      type: "FRAME",
      name: "今日",
      layoutMode: "VERTICAL",
      width: 390,
      height: 844,
      children: [],
    },
  ],
  errors: [],
};

describe("figma contracts", () => {
  it("accepts a valid plan/readback", () => {
    expect(FigmaPlanSchema.safeParse(plan).success).toBe(true);
    expect(FigmaReadbackSchema.safeParse(readback).success).toBe(true);
  });

  it("rejects a TEXT node without a text style", () => {
    const invalid = {
      ...plan,
      root: {
        ...plan.root,
        children: [{ specId: "x", type: "TEXT", name: "x", characters: "x" }],
      },
    };
    expect(FigmaPlanSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects an incomplete readback", () => {
    expect(
      FigmaReadbackSchema.safeParse({ ...readback, nodes: undefined }).success
    ).toBe(false);
  });
});
