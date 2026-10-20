import { describe, expect, it } from "vitest";
import {
  IaOutputSchema,
  InteractionOutputSchema,
  VisualStyleOutputSchema,
  parseSignoffMarkdown,
  runIaGate,
  runInteractionGate,
  runVisualStyleGate,
  type InteractionSpec,
  type MotionSpec,
  type VisualStyleSpec,
} from "../src/index.js";
import { employeeBrief, iaOutput, interactionOutput, visualOutput } from "./fixtures.js";

const ia = IaOutputSchema.parse(iaOutput);
const interaction = InteractionOutputSchema.parse(interactionOutput);
const visual = VisualStyleOutputSchema.parse(visualOutput);
const now = "2026-10-20T00:00:00.000Z";

const validWaiver = {
  findingId: "IA-001",
  owner: "店长",
  reason: "主流程在下一个迭代补齐",
  expires: "2099-01-01",
};

const blockerFinding = {
  id: "IA-001",
  severity: "blocker" as const,
  area: "flow" as const,
  evidence: "today -> inventory",
  issue: "库存页没有返回今日的路径",
};

describe("IA gate", () => {
  it("passes a clean map", () => {
    const result = runIaGate({
      map: ia.map,
      findings: ia.findings,
      brief: employeeBrief,
      now,
    });
    expect(result).toMatchObject({ passed: true, status: "passed", issues: [] });
  });

  it("fails an unwaived blocker", () => {
    const result = runIaGate({
      map: ia.map,
      findings: { findings: [blockerFinding] },
      brief: employeeBrief,
      now,
    });
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("IA_BLOCKER_UNWAIVED");
  });

  it("passes with a valid waiver and reports the waived finding", () => {
    const result = runIaGate({
      map: ia.map,
      findings: { findings: [blockerFinding] },
      brief: employeeBrief,
      waivers: [validWaiver],
      now,
    });
    expect(result).toMatchObject({
      passed: true,
      status: "waived",
      waivedFindings: ["IA-001"],
    });
  });

  it("fails an expired waiver", () => {
    const result = runIaGate({
      map: ia.map,
      findings: { findings: [blockerFinding] },
      brief: employeeBrief,
      waivers: [{ ...validWaiver, expires: "2000-01-01" }],
      now,
    });
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("IA_WAIVER_INVALID");
  });

  it("fails when the map misses a brief page", () => {
    const result = runIaGate({
      map: {
        ...ia.map,
        pages: ia.map.pages.filter((page) => page.id !== "inventory-query"),
        flows: [],
        crossLinks: [],
      },
      findings: ia.findings,
      brief: employeeBrief,
      now,
    });
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("IA_PAGE_MISSING");
  });

  it("fails duplicate finding ids and tab overflow", () => {
    const duplicate = runIaGate({
      map: ia.map,
      findings: { findings: [blockerFinding, blockerFinding] },
      brief: employeeBrief,
      waivers: [validWaiver],
      now,
    });
    expect(duplicate.issues.map((issue) => issue.code)).toContain("IA_DUPLICATE_FINDING");

    const tabs = runIaGate({
      map: {
        ...ia.map,
        navigation: { primary: ["a", "b", "c", "d", "e", "f"], tabs: ["a", "b", "c", "d", "e", "f"] },
      },
      findings: ia.findings,
      brief: employeeBrief,
      now,
    });
    expect(tabs.issues.map((issue) => issue.code)).toContain("IA_TAB_OVERFLOW");
  });
});

describe("signoff parsing", () => {
  const markdown = `# IA signoff\n\n<!-- signoff\n${JSON.stringify({
    signer: "店长",
    date: "2026-10-20",
    waivers: [validWaiver],
  })}\n-->\n`;

  it("parses a valid signoff block", () => {
    const parsed = parseSignoffMarkdown(markdown);
    expect(parsed).toMatchObject({ present: true, valid: true, signer: "店长" });
    expect(parsed.waivers).toHaveLength(1);
  });

  it("reports a missing or malformed block", () => {
    expect(parseSignoffMarkdown("# no block").present).toBe(false);
    expect(parseSignoffMarkdown("<!-- signoff {not json} -->").valid).toBe(false);
    expect(parseSignoffMarkdown("<!-- signoff {} -->").valid).toBe(false);
  });
});

describe("interaction gate", () => {
  it("passes the complete interaction fixture", () => {
    const result = runInteractionGate({
      interactionSpec: interaction.interactionSpec,
      motionSpec: interaction.motionSpec,
      brief: employeeBrief,
    });
    expect(result).toMatchObject({ passed: true, status: "passed", issues: [] });
  });

  it("detects a missing action reaction coverage", () => {
    const spec: InteractionSpec = {
      pages: interaction.interactionSpec.pages.map((page) =>
        page.id === "today"
          ? { ...page, triggers: page.triggers.filter((trigger) => trigger.action !== "开单") }
          : page
      ),
    };
    const result = runInteractionGate({
      interactionSpec: spec,
      motionSpec: interaction.motionSpec,
      brief: employeeBrief,
    });
    expect(result.issues.map((issue) => issue.code)).toContain("INTERACTION_ACTION_MISSING");
  });

  it("detects a missing required state", () => {
    const spec = {
      pages: interaction.interactionSpec.pages.map((page) => {
        if (page.id !== "today") return page;
        const { empty: _empty, ...states } = page.states;
        return { ...page, states };
      }),
    } as unknown as InteractionSpec;
    const result = runInteractionGate({
      interactionSpec: spec,
      motionSpec: interaction.motionSpec,
      brief: employeeBrief,
    });
    expect(result.issues.map((issue) => issue.code)).toContain("INTERACTION_STATE_MISSING");
  });

  it("detects motion values that are not tokens", () => {
    const motion: MotionSpec = {
      ...interaction.motionSpec,
      presets: { "page-enter": { durationMs: 250, easing: "bounce" } },
    };
    const result = runInteractionGate({
      interactionSpec: interaction.interactionSpec,
      motionSpec: motion,
      brief: employeeBrief,
    });
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain("MOTION_DURATION_NOT_TOKEN");
    expect(codes).toContain("MOTION_EASING_NOT_TOKEN");
  });

  it("detects an unknown binding preset and a missing reduced-motion fallback", () => {
    const motion = {
      ...interaction.motionSpec,
      bindings: [{ pageId: "today", preset: "missing" }],
      reducedMotion: undefined,
    } as unknown as MotionSpec;
    const result = runInteractionGate({
      interactionSpec: interaction.interactionSpec,
      motionSpec: motion,
      brief: employeeBrief,
    });
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain("MOTION_PRESET_UNKNOWN");
    expect(codes).toContain("MOTION_REDUCED_MISSING");
  });

  it("detects an empty focus order when a page has actions", () => {
    const spec: InteractionSpec = {
      pages: interaction.interactionSpec.pages.map((page) =>
        page.id === "today" ? { ...page, focusOrder: [] } : page
      ),
    };
    const result = runInteractionGate({
      interactionSpec: spec,
      motionSpec: interaction.motionSpec,
      brief: employeeBrief,
    });
    expect(result.issues.map((issue) => issue.code)).toContain("INTERACTION_FOCUS_EMPTY");
  });
});

describe("visual style gate", () => {
  it("passes a complete visual fixture", () => {
    const result = runVisualStyleGate({
      visualStyle: visual.visualStyle,
      assetBriefs: visual.assetBriefs,
      brief: employeeBrief,
    });
    expect(result).toMatchObject({ passed: true, status: "passed" });
  });

  it("detects missing palette, typography, and asset strategy", () => {
    for (const patch of [
      { direction: { ...visual.visualStyle.direction, palette: [] } },
      { direction: { ...visual.visualStyle.direction, typography: { heading: "", body: "" } } },
      { assetStrategy: undefined },
    ]) {
      const style = { ...visual.visualStyle, ...patch } as unknown as VisualStyleSpec;
      const result = runVisualStyleGate({
        visualStyle: style,
        assetBriefs: visual.assetBriefs,
        brief: employeeBrief,
      });
      expect(result.passed).toBe(false);
    }
  });

  it("detects a missing asset brief", () => {
    const result = runVisualStyleGate({
      visualStyle: visual.visualStyle,
      assetBriefs: visual.assetBriefs.filter((brief) => brief.id !== "calendar"),
      brief: employeeBrief,
    });
    expect(result.issues.map((issue) => issue.code)).toContain("ASSET_BRIEF_MISSING");
  });

  it("detects a kind mismatch", () => {
    const result = runVisualStyleGate({
      visualStyle: visual.visualStyle,
      assetBriefs: visual.assetBriefs.map((brief) =>
        brief.id === "calendar" ? { ...brief, kind: "illustration" as const } : brief
      ),
      brief: employeeBrief,
    });
    expect(result.issues.map((issue) => issue.code)).toContain("ASSET_BRIEF_KIND_MISMATCH");
  });

  it("detects a source strategy mismatch", () => {
    const result = runVisualStyleGate({
      visualStyle: visual.visualStyle,
      assetBriefs: visual.assetBriefs.map((brief) => ({
        ...brief,
        sourceChain: ["commission" as const],
      })),
      brief: employeeBrief,
    });
    expect(result.issues.map((issue) => issue.code)).toContain(
      "ASSET_SOURCE_STRATEGY_MISMATCH"
    );
  });

  it("detects duplicates and reports extras as warnings", () => {
    const duplicate = runVisualStyleGate({
      visualStyle: visual.visualStyle,
      assetBriefs: [...visual.assetBriefs, visual.assetBriefs[0]!],
      brief: employeeBrief,
    });
    expect(duplicate.issues.map((issue) => issue.code)).toContain("ASSET_BRIEF_DUPLICATE");

    const extra = runVisualStyleGate({
      visualStyle: visual.visualStyle,
      assetBriefs: [
        ...visual.assetBriefs,
        {
          ...visual.assetBriefs[0]!,
          id: "unused-icon",
        },
      ],
      brief: employeeBrief,
    });
    expect(extra.passed).toBe(true);
    expect(extra.issues.map((issue) => issue.code)).toContain("ASSET_BRIEF_EXTRA");
  });
});
