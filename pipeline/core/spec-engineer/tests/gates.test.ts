import { describe, expect, it } from "vitest";
import type { PageSpec } from "@prd-ui/contracts";
import {
  applySpecs,
  runSpecEngineerGates,
  type SpecEngineerGateInput,
} from "../src/index.js";
import {
  assetBriefs,
  baseSpecs,
  interactionSpec,
  makeInput,
  motionSpec,
} from "./fixtures.js";

function gateFor(overrides: Partial<SpecEngineerGateInput> = {}) {
  const input = makeInput(overrides);
  const specs = overrides.specs ?? applySpecs(input);
  return runSpecEngineerGates({
    brief: input.brief,
    specs,
    interactionSpec: input.interactionSpec,
    motionSpec: input.motionSpec,
    ...(input.assetBriefs === undefined ? {} : { assetBriefs: input.assetBriefs }),
    ...(input.iaMap === undefined ? {} : { iaMap: input.iaMap }),
  });
}

describe("Spec Engineer gates", () => {
  it("passes a complete mapping with expected warnings", () => {
    const gate = gateFor();
    expect(gate.passed).toBe(true);
    const codes = gate.issues.map((issue) => issue.code);
    expect(codes).toContain("SPEC_ASSET_UNUSED");
    expect(codes).toContain("SPEC_MOTION_NODE_UNRESOLVED");
    expect(gate.issues.every((issue) => issue.severity !== "blocker")).toBe(true);
  });

  it("blocks a brief action without a trigger", () => {
    const gate = gateFor({
      interactionSpec: {
        ...interactionSpec,
        pages: interactionSpec.pages.map((page) =>
          page.id === "today" ? { ...page, triggers: [] } : page
        ),
      },
    });
    expect(gate.passed).toBe(false);
    expect(gate.issues.map((issue) => issue.code)).toContain("SPEC_ACTION_MISSING");
  });

  it("blocks unknown transition endpoints", () => {
    const gate = gateFor({
      interactionSpec: {
        ...interactionSpec,
        pages: interactionSpec.pages.map((page) =>
          page.id === "today"
            ? {
                ...page,
                transitions: [
                  { from: "today", to: "missing-page", trigger: "未知跳转" },
                ],
              }
            : page
        ),
      },
    });
    expect(gate.issues.map((issue) => issue.code)).toContain(
      "SPEC_TRANSITION_PAGE_UNKNOWN"
    );
  });

  it("blocks unknown motion presets and token mismatches", () => {
    const unknown = gateFor({
      motionSpec: {
        ...motionSpec,
        bindings: [...motionSpec.bindings, { pageId: "today", preset: "missing" }],
      },
    });
    expect(unknown.issues.map((issue) => issue.code)).toContain(
      "SPEC_MOTION_PRESET_UNKNOWN"
    );

    const badPreset = {
      ...motionSpec,
      presets: {
        ...motionSpec.presets,
        "page-enter": { durationMs: 250, easing: "bounce" },
      },
    };
    const mismatch = gateFor({ motionSpec: badPreset });
    expect(mismatch.issues.map((issue) => issue.code)).toContain(
      "SPEC_MOTION_TOKEN_MISMATCH"
    );
  });

  it("blocks a referenced asset without a brief", () => {
    const gate = gateFor({
      assetBriefs: assetBriefs.filter((brief) => brief.id !== "icon-package"),
    });
    expect(gate.passed).toBe(false);
    expect(gate.issues.map((issue) => issue.code)).toContain("SPEC_ASSET_MISSING");
  });

  it("warns when asset briefs are absent", () => {
    const gate = gateFor({ assetBriefs: undefined });
    expect(gate.passed).toBe(true);
    expect(gate.issues.map((issue) => issue.code)).toContain(
      "SPEC_ASSET_BRIEFS_MISSING"
    );
  });

  it("blocks a missing required state and warns on unmapped base states", () => {
    const specs = applySpecs(makeInput()).map((spec) => {
      if (spec.meta.pageId !== "today") return spec;
      const states = { ...spec.states };
      delete states.empty;
      states.disabled = { name: "disabled" };
      return { ...spec, states };
    });
    const gate = gateFor({ specs });
    const codes = gate.issues.map((issue) => issue.code);
    expect(codes).toContain("SPEC_STATE_MISSING");
    expect(codes).toContain("SPEC_STATE_UNMAPPED");
  });

  it("blocks an invalid enriched Page Spec", () => {
    const specs = applySpecs(makeInput());
    const bad = structuredClone(specs) as PageSpec[];
    bad[0]!.layout.props = { ...bad[0]!.layout.props, fill: "#ffffff" };
    const gate = gateFor({ specs: bad });
    expect(gate.passed).toBe(false);
    expect(gate.issues.map((issue) => issue.code)).toContain("SPEC_SCHEMA");
  });

  it("warns on IA page drift", () => {
    const gate = gateFor({
      iaMap: {
        pages: [
          {
            id: "today",
            name: "今日",
            route: "/today",
            level: 1,
            roles: ["store_manager"],
            entryPoints: ["tab"],
          },
        ],
        navigation: { primary: ["今日"], tabs: ["今日"] },
        flows: [],
        crossLinks: [],
      },
    });
    expect(gate.passed).toBe(true);
    expect(gate.issues.map((issue) => issue.code)).toContain("SPEC_IA_PAGE_MISSING");
  });

  it("blocks a brief page that is missing from the interaction spec", () => {
    const gate = gateFor({
      interactionSpec: {
        ...interactionSpec,
        pages: interactionSpec.pages.filter((page) => page.id !== "inventory-query"),
      },
    });
    expect(gate.passed).toBe(false);
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "SPEC_PAGE_MISSING",
        severity: "blocker",
        evidence: "inventory-query",
      })
    );
  });

  it("blocks an interaction page that is not in the brief", () => {
    const gate = gateFor({
      interactionSpec: {
        ...interactionSpec,
        pages: [
          ...interactionSpec.pages,
          { ...interactionSpec.pages[0]!, id: "extra-page" },
        ],
      },
    });
    expect(gate.passed).toBe(false);
    expect(gate.issues).toContainEqual(
      expect.objectContaining({
        code: "SPEC_PAGE_UNKNOWN",
        severity: "blocker",
        evidence: "extra-page",
      })
    );
  });

  it("reports a missing page spec and an unknown spec page", () => {
    const specs = applySpecs(makeInput());
    const missing = gateFor({
      specs: specs.filter((spec) => spec.meta.pageId !== "inventory-query"),
    });
    expect(missing.issues.map((issue) => issue.code)).toContain("SPEC_PAGE_MISSING");

    const unknown = gateFor({
      specs: [
        ...specs,
        { ...baseSpecs[0]!, meta: { ...baseSpecs[0]!.meta, pageId: "extra-page" } },
      ],
    });
    expect(unknown.issues.map((issue) => issue.code)).toContain("SPEC_PAGE_UNKNOWN");
  });
});
