import { describe, expect, it } from "vitest";
import {
  FigmaPlanSchema,
  FigmaReadbackSchema,
  FigmaSignoffBlockSchema,
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

  it("accepts coverage and mapping metadata", () => {
    const withCoverage: FigmaPlan = {
      ...plan,
      coverage: {
        nodes: [
          {
            specId: "today.page.root",
            specType: "MobileShell",
            path: "layout",
            status: "mapped",
          },
          {
            specId: "today.chart",
            specType: "Chart",
            path: "layout.children[0]",
            status: "unmapped",
            reason: "UNMAPPED_COMPONENT:Chart",
          },
        ],
        summary: { spec: 2, derived: 0, mapped: 1, degraded: 0, unmapped: 1, skipped: 0 },
      },
      root: {
        ...plan.root,
        origin: "spec",
        mapping: "unmapped",
        reason: "UNMAPPED_COMPONENT:Chart",
      },
    };
    expect(FigmaPlanSchema.safeParse(withCoverage).success).toBe(true);
  });

  it("accepts extended readback style fields", () => {
    const extended: FigmaReadback = {
      ...readback,
      nodes: [
        {
          ...readback.nodes[0]!,
          cornerRadius: 8,
          borderTop: { width: 0, color: "#00000000" },
          borderBottom: { width: 1, color: "#E2E8F0" },
          borderLeft: { width: 2, color: "#2563EB" },
          fillDetails: [{ color: "#FFFFFF", alpha: 1 }],
          fontWeight: 600,
          textColor: "#111827",
          lineHeight: 24,
        },
      ],
    };
    expect(FigmaReadbackSchema.safeParse(extended).success).toBe(true);
  });

  it("accepts per-side frame padding", () => {
    const padded = {
      ...plan,
      root: { ...plan.root, paddingTop: 2, paddingRight: 4 },
    };
    const parsed = FigmaPlanSchema.safeParse(padded);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.root.paddingTop).toBe(2);
    expect(parsed.success && parsed.data.root.paddingRight).toBe(4);
    expect(
      FigmaPlanSchema.safeParse({
        ...plan,
        root: { ...plan.root, paddingTop: -1 },
      }).success
    ).toBe(false);
  });

  it("rejects an unknown mapping status", () => {
    const invalid = {
      ...plan,
      root: { ...plan.root, mapping: "maybe" },
    };
    expect(FigmaPlanSchema.safeParse(invalid).success).toBe(false);
  });

  it("accepts a figma signoff block", () => {
    expect(
      FigmaSignoffBlockSchema.safeParse({
        signer: "tester",
        date: "2026-10-26",
        planHash: "sha256:a",
        readbackHash: "sha256:b",
        conformanceHash: "sha256:c",
        parityHash: "sha256:d",
        baselineHash: "sha256:e",
      }).success
    ).toBe(true);
  });

  it("rejects a partial or extended figma signoff block", () => {
    const block = {
      signer: "tester",
      date: "2026-10-26",
      planHash: "sha256:a",
      readbackHash: "sha256:b",
      conformanceHash: "sha256:c",
      parityHash: "sha256:d",
      baselineHash: "sha256:e",
    };
    expect(
      FigmaSignoffBlockSchema.safeParse({ ...block, parityHash: undefined }).success
    ).toBe(false);
    expect(
      FigmaSignoffBlockSchema.safeParse({ ...block, extra: "not allowed" }).success
    ).toBe(false);
  });
});
