import { describe, expect, it } from "vitest";
import type { PageSpec, SpecNode } from "@prd-ui/contracts";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { validateStructure } from "../src/index.js";

function context(spec: PageSpec) {
  return {
    profile: getProfile(spec.meta.profile),
    catalog: getCatalog(spec.meta.profile),
    archetype: getArchetype(spec.meta.archetype),
  };
}

function baseSpec(): PageSpec {
  return {
    meta: {
      pageId: "today",
      project: "fixture",
      name: "今日",
      target: "mobile",
      profile: "b-mobile",
      archetype: "home",
      purpose: "fixture",
      route: "/",
      roles: ["store_manager"],
      reqRefs: ["REQ-APPT-001"],
      version: "0.1.0",
    },
    layout: {
      type: "MobileShell",
      id: "today.page.root",
      props: { title: "今日" },
      slots: { content: [] },
    },
    states: { default: { name: "default" } },
    interactions: [],
    traceability: { reqMap: {}, designDefaults: [], unmapped: [] },
  };
}

describe("validateStructure", () => {
  it("reports an empty optional slot", () => {
    const spec = baseSpec();
    spec.layout.slots = {
      content: [{ type: "Section", id: "today.section", slots: { optional: [] } }],
    };
    const findings = validateStructure(spec, context(spec));
    expect(findings.some((finding) => finding.ruleId === "STRUCTURE-EMPTY-SLOT")).toBe(true);
  });

  it("reports repeated identical sections", () => {
    const spec = baseSpec();
    const section = (id: string): SpecNode => ({
      id,
      type: "Section",
      props: { title: "重复区块" },
      children: [{ id: `${id}.text`, type: "Text", props: { text: "内容" } }],
    });
    spec.layout.slots = {
      content: [section("today.s1"), section("today.s2"), section("today.s3")],
    };
    const findings = validateStructure(spec, context(spec));
    expect(findings.some((finding) => finding.ruleId === "STRUCTURE-REPEATED-SECTION")).toBe(
      true
    );
  });

  it("reports a page height over budget", () => {
    const spec = baseSpec();
    spec.layout.slots = {
      content: [
        {
          id: "today.list",
          type: "List",
          props: {
            items: Array.from({ length: 60 }, (_, index) => ({ label: `l${index}`, value: "v" })),
          },
        },
      ],
    };
    const findings = validateStructure(spec, context(spec));
    expect(findings.some((finding) => finding.ruleId === "STRUCTURE-PAGE-HEIGHT")).toBe(true);
  });

  it("reports heading level skips", () => {
    const spec = baseSpec();
    spec.layout.slots = {
      content: [
        {
          id: "today.section",
          type: "Section",
          children: [
            { id: "today.h1", type: "Text", props: { text: "一", role: "heading.1" } },
            { id: "today.h3", type: "Text", props: { text: "三", role: "heading.3" } },
          ],
        },
      ],
    };
    const findings = validateStructure(spec, context(spec));
    expect(findings.some((finding) => finding.ruleId === "STRUCTURE-HEADING-SKIP")).toBe(true);
  });

  it("reports an orphan action button", () => {
    const spec = baseSpec();
    spec.layout.slots = {
      content: [
        {
          id: "today.section",
          type: "Section",
          children: [{ id: "today.button", type: "Button", props: { label: "孤立" } }],
        },
      ],
    };
    const findings = validateStructure(spec, context(spec));
    expect(findings.some((finding) => finding.ruleId === "STRUCTURE-ORPHAN-ACTION")).toBe(true);
  });

  it("reports repeated sibling rows not expressed as a List", () => {
    const spec = baseSpec();
    const row = (id: string): SpecNode => ({
      id,
      type: "ListRow",
      props: { title: "行", subtitle: "说明" },
    });
    spec.layout.slots = { content: [row("today.r1"), row("today.r2"), row("today.r3")] };
    const findings = validateStructure(spec, context(spec));
    expect(findings.some((finding) => finding.ruleId === "STRUCTURE-REPEATED-ROWS")).toBe(true);
  });

  it("reports spacing outside the profile scale", () => {
    const spec = baseSpec();
    spec.layout.slots = {
      content: [{ id: "today.section", type: "Section", props: { gap: "space.99" }, children: [] }],
    };
    const findings = validateStructure(spec, context(spec));
    expect(findings.some((finding) => finding.ruleId === "STRUCTURE-SPACING-SCALE")).toBe(true);
  });
});
