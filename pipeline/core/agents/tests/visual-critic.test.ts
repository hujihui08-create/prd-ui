import { describe, expect, it } from "vitest";
import type { PageSpec } from "@prd-ui/contracts";
import {
  VisualCritiqueSchema,
  buildVisualCriticPrompt,
} from "../src/index.js";

const spec: PageSpec = {
  meta: {
    pageId: "today",
    project: "employee-app-phase2",
    name: "今日",
    target: "mobile",
    profile: "b-mobile",
    archetype: "home",
    purpose: "查看当天预约",
    route: "/today",
    roles: ["beautician"],
    reqRefs: ["REQ-EMP-001"],
    version: "0.1.0",
  },
  layout: {
    id: "today.page.root",
    type: "MobileShell",
    children: [
      {
        id: "today.action.new-appointment",
        type: "Button",
        props: { label: "新建预约" },
      },
    ],
  },
  states: { default: { name: "default" } },
  interactions: [],
  traceability: { reqMap: {}, designDefaults: [], unmapped: [] },
};

const critique = {
  verdict: "pass" as const,
  findings: [],
  summary: "No visual blockers.",
};

describe("Visual Critic role", () => {
  it("builds a visual critic prompt with screenshots and forbids edits", () => {
    const prompt = buildVisualCriticPrompt({
      project: "employee-app-phase2",
      screenshots: [
        { caseId: "today.default", path: "screenshots/today.default.png" },
      ],
      specs: [spec],
      profile: "b-mobile",
      visualStyle: {},
    });
    expect(prompt).toContain("Visual Critic");
    expect(prompt).toContain("screenshots/today.default.png");
    expect(prompt).toContain("Do not modify files");
    expect(prompt).toContain("hierarchy");
  });

  it("embeds the output schema and the subjective-only boundary", () => {
    const prompt = buildVisualCriticPrompt({
      project: "employee-app-phase2",
      screenshots: [
        { caseId: "today.default", path: "screenshots/today.default.png" },
      ],
      specs: [spec],
      profile: "b-mobile",
      visualStyle: { tone: "neutral" },
    });
    expect(prompt).toContain("Page Specs (data)");
    expect(prompt).toContain("today.action.new-appointment");
    expect(prompt).toContain("Do not repeat deterministic checks");
    expect(prompt).toContain('"proposal"');
    expect(prompt).toContain('"verdict"');
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain("Return only JSON.");
  });

  it("parses a valid critique and rejects drift", () => {
    expect(VisualCritiqueSchema.parse(critique)).toEqual(critique);

    expect(() =>
      VisualCritiqueSchema.parse({ ...critique, extra: true })
    ).toThrow();
    expect(() =>
      VisualCritiqueSchema.parse({ ...critique, verdict: "approved" })
    ).toThrow();
    expect(() =>
      VisualCritiqueSchema.parse({
        ...critique,
        findings: [
          {
            id: "VC-001",
            severity: "blocker",
            pageId: "today",
            state: "default",
            evidence: "",
            issue: "Primary action is below the fold.",
            proposal: "Move it into the fixed bottom bar.",
          },
        ],
      })
    ).toThrow();
    expect(() =>
      VisualCritiqueSchema.parse({
        ...critique,
        findings: [
          {
            id: "VC-001",
            severity: "critical",
            pageId: "today",
            state: "default",
            evidence: "screenshots/today.default.png",
            issue: "Primary action is below the fold.",
            proposal: "Move it into the fixed bottom bar.",
          },
        ],
      })
    ).toThrow();
  });

  it("accepts findings that cite a screenshot and location", () => {
    const parsed = VisualCritiqueSchema.parse({
      verdict: "changes",
      findings: [
        {
          id: "VC-001",
          severity: "major",
          pageId: "today",
          state: "default",
          evidence:
            "screenshots/today.default.png: quick-action row, 2nd button",
          issue: "The quick actions are visually heavier than the primary CTA.",
          proposal: "Reduce the quick-action fill to the secondary tone.",
        },
      ],
      summary: "One major hierarchy issue.",
    });
    expect(parsed.findings[0]?.id).toBe("VC-001");
  });
});
