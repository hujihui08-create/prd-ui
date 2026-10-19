import { describe, expect, it } from "vitest";
import {
  UiBriefSchema,
  type AssetManifest,
  type PageSpec,
  type ReqId,
  type SpecNode,
} from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import briefJson from "../../../samples/ui-brief.sample.json";
import {
  contrastRatio,
  validatePageSpec,
  validateProject,
  walkSpecNodes,
  type ValidationContext,
  type ValidationReport,
} from "../src/index.js";

const brief = UiBriefSchema.parse(briefJson);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
const specByPageId = new Map(specs.map((spec) => [spec.meta.pageId, spec]));

const manifest: AssetManifest = {
  project: "demo-orders",
  profile: "b-dense",
  assets: [
    {
      id: "search",
      kind: "icon",
      library: "lucide",
      style: "outline",
      files: [{ path: "assets/icons/search.svg", format: "svg" }],
      license: "ISC",
      hash: "sha256:search",
    },
    {
      id: "empty-orders",
      kind: "illustration",
      library: "local",
      files: [{ path: "assets/illustrations/empty-orders.svg", format: "svg" }],
      license: "internal",
    },
  ],
  placeholders: [],
  complete: true,
};

function requiredSpec(pageId: string): PageSpec {
  const spec = specByPageId.get(pageId);
  if (!spec) throw new Error(`Unknown page: ${pageId}`);
  return spec;
}

function contextFor(spec: PageSpec): ValidationContext {
  return {
    profile: getProfile(spec.meta.profile),
    catalog: getCatalog(spec.meta.profile),
    archetype: getArchetype(spec.meta.archetype),
    manifest,
  };
}

function cloneSpec(pageId: string): PageSpec {
  return structuredClone(requiredSpec(pageId));
}

function findNode(spec: PageSpec, type: string): SpecNode {
  const match = walkSpecNodes(spec.layout).find(({ node }) => node.type === type);
  if (!match) throw new Error(`Node not found: ${type}`);
  return match.node;
}

function ruleIds(report: ValidationReport): string[] {
  return [...new Set(report.findings.map((finding) => finding.ruleId))];
}

describe("compiled sample specs", () => {
  it("validates all eight pages with zero findings", () => {
    expect(specs).toHaveLength(8);
    for (const spec of specs) {
      const report = validatePageSpec(spec, contextFor(spec));
      const detail = report.findings
        .map((finding) => `${finding.ruleId}@${finding.location}: ${finding.issue}`)
        .join("\n");
      expect(report.pageId).toBe(spec.meta.pageId);
      expect(report.findings, detail).toEqual([]);
      expect(report.blockers, detail).toBe(0);
      expect(report.passed, detail).toBe(true);
    }
  });

  it("has a clean web page and a clean mobile page", () => {
    const web = validatePageSpec(requiredSpec("orders-list"), contextFor(requiredSpec("orders-list")));
    const mobile = validatePageSpec(requiredSpec("item-detail"), contextFor(requiredSpec("item-detail")));

    expect(requiredSpec("orders-list").layout.type).toBe("PageShell");
    expect(requiredSpec("item-detail").layout.type).toBe("MobileShell");
    expect(web.findings).toEqual([]);
    expect(mobile.findings).toEqual([]);
  });

  it("validateProject returns reports in spec order and rejects missing contexts", () => {
    const contexts = Object.fromEntries(
      specs.map((spec) => [spec.meta.pageId, contextFor(spec)])
    ) as Record<string, ValidationContext>;

    const reports = validateProject(specs, contexts);
    expect(reports.map((report) => report.pageId)).toEqual(
      specs.map((spec) => spec.meta.pageId)
    );
    expect(reports.every((report) => report.passed)).toBe(true);

    expect(() => validateProject(specs, {})).toThrow(/Missing validation context/);
  });

  it("numbers findings and counts severities", () => {
    const spec = cloneSpec("orders-list");
    delete spec.states.default;

    const report = validatePageSpec(spec, contextFor(spec));
    expect(report.findings[0]?.id).toBe("F-001");
    expect(report.blockers).toBe(
      report.findings.filter((finding) => finding.severity === "blocker").length
    );
    expect(report.blockers).toBe(report.findings.length);
    expect(report.passed).toBe(false);
  });
});

describe("schema validation", () => {
  it("rejects inline style/className props", () => {
    const spec = cloneSpec("orders-list");
    const section = findNode(spec, "Section");
    section.props = { ...(section.props ?? {}), style: { padding: 16 } };

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toContain("SCHEMA-INVALID");
    expect(report.blockers).toBeGreaterThan(0);
  });
});

describe("catalog validation", () => {
  it("reports CATALOG-UNKNOWN for a component outside the catalog", () => {
    const spec = cloneSpec("orders-list");
    findNode(spec, "FilterBar").type = "MysteryPanel";

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["CATALOG-UNKNOWN"]);
  });

  it("reports CATALOG-UNAVAILABLE when a component is not available", () => {
    const spec = cloneSpec("orders-list");
    const ctx = structuredClone(contextFor(spec));
    const filterBar = ctx.catalog.components.find((component) => component.id === "FilterBar")!;
    filterBar.availability = "code-only";

    const report = validatePageSpec(spec, ctx);
    expect(ruleIds(report)).toEqual(["CATALOG-UNAVAILABLE"]);
  });

  it("reports CATALOG-PROP-UNKNOWN for an undeclared prop", () => {
    const spec = cloneSpec("orders-list");
    const filterBar = findNode(spec, "FilterBar");
    filterBar.props = { ...(filterBar.props ?? {}), mystery: true };

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["CATALOG-PROP-UNKNOWN"]);
  });

  it("reports CATALOG-PROP-ENUM for an out-of-enum prop value", () => {
    const spec = cloneSpec("item-detail");
    const badge = findNode(spec, "Badge");
    badge.props = { ...(badge.props ?? {}), tone: "purple" };

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["CATALOG-PROP-ENUM"]);
  });

  it("reports CATALOG-VARIANT for an undeclared emphasis variant", () => {
    const spec = cloneSpec("order-form");
    const button = findNode(spec, "Button");
    button.props = { ...(button.props ?? {}), emphasis: "fuchsia" };

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toContain("CATALOG-VARIANT");
  });

  it("reports CATALOG-ARCHETYPE for a catalog component outside the archetype", () => {
    const spec = cloneSpec("orders-list");
    spec.layout.slots!.content!.push({ type: "Modal", props: { title: "Not allowed here" } });

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["CATALOG-ARCHETYPE"]);
  });

  it("reports CATALOG-SLOT for a child outside the slot allow-list", () => {
    const spec = cloneSpec("order-detail");
    spec.layout.slots!.actions = [{ type: "Card", props: { title: "Disallowed" } }];

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["CATALOG-SLOT"]);
  });

  it("reports CATALOG-SLOT-UNKNOWN for an undeclared slot key", () => {
    const spec = cloneSpec("order-detail");
    spec.layout.slots!.mystery = [{ type: "Button", props: { label: "x" } }];

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["CATALOG-SLOT-UNKNOWN"]);
  });

  it("skips slot content on components without a slot contract", () => {
    const spec = cloneSpec("orders-list");
    const section = findNode(spec, "Section");
    section.slots = { arbitrary: [{ type: "Button", props: { label: "x" } }] };

    const report = validatePageSpec(spec, contextFor(spec));
    expect(report.findings).toEqual([]);
  });
});

describe("token validation", () => {
  it("reports TOKEN-RAW-VALUE for hex, rgb, and px/rem values", () => {
    for (const raw of ["#ff0000", "rgb(0, 0, 0)", "hsl(0, 0%, 0%)", "16px", "1.5rem", "2em"]) {
      const spec = cloneSpec("orders-list");
      const section = findNode(spec, "Section");
      section.props = { ...(section.props ?? {}), padding: raw };

      const report = validatePageSpec(spec, contextFor(spec));
      expect(ruleIds(report), raw).toContain("TOKEN-RAW-VALUE");
    }
  });

  it("reports TOKEN-UNKNOWN for a missing profile token", () => {
    const spec = cloneSpec("orders-list");
    const section = findNode(spec, "Section");
    section.props = { ...(section.props ?? {}), padding: "space.99" };

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["TOKEN-UNKNOWN"]);
  });

  it("reports TOKEN-TEXTROLE when a Text node has no textRole", () => {
    const spec = cloneSpec("auth");
    const text = findNode(spec, "Text");
    delete text.textRole;

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["TOKEN-TEXTROLE"]);
  });

  it("reports TOKEN-TEXTROLE when a textRole is not in the profile", () => {
    const spec = cloneSpec("auth");
    findNode(spec, "Text").textRole = "body.huge";

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["TOKEN-TEXTROLE"]);
  });

  it("reports TOKEN-CONTRAST when secondary text is too light", () => {
    const spec = cloneSpec("orders-list");
    const ctx = structuredClone(contextFor(spec));
    ctx.profile.color["text.secondary"] = "#CCCCCC";

    const report = validatePageSpec(spec, ctx);
    expect(ruleIds(report)).toEqual(["TOKEN-CONTRAST"]);
    expect(report.major).toBe(1);
    expect(report.passed).toBe(true);
  });

  it("reports TOKEN-FONT-SIZE for text below the target minimum", () => {
    const spec = cloneSpec("auth");
    const ctx = structuredClone(contextFor(spec));
    ctx.profile.typography["heading.1"]!.fontSize = 10;

    const report = validatePageSpec(spec, ctx);
    expect(ruleIds(report)).toEqual(["TOKEN-FONT-SIZE"]);
  });

  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 4);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 4);
    expect(contrastRatio("#6B7280", "#FFFFFF")).toBeGreaterThan(4.5);
  });
});

describe("layout validation", () => {
  it("reports LAYOUT-ARCHETYPE when the root shell is wrong for the target", () => {
    const spec = cloneSpec("orders-list");
    spec.layout.type = "MobileShell";

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["LAYOUT-ARCHETYPE"]);
  });

  it("reports LAYOUT-ABSOLUTE for position, top, left, right, and bottom", () => {
    for (const key of ["position", "top", "left", "right", "bottom"] as const) {
      const spec = cloneSpec("orders-list");
      const section = findNode(spec, "Section");
      section.props = { ...(section.props ?? {}), [key]: "0" };

      const report = validatePageSpec(spec, contextFor(spec));
      expect(ruleIds(report), key).toContain("LAYOUT-ABSOLUTE");
    }
  });

  it("reports LAYOUT-ABSOLUTE for nested position keys", () => {
    const spec = cloneSpec("orders-overview");
    const grid = findNode(spec, "Grid");
    grid.props = { ...(grid.props ?? {}), layoutHints: { left: 0 } };

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["LAYOUT-ABSOLUTE"]);
  });

  it("reports LAYOUT-SLOT when a required slot is missing", () => {
    const spec = cloneSpec("orders-list");
    delete spec.layout.slots!.content;

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["LAYOUT-SLOT"]);
  });

  it("reports LAYOUT-SLOT when a required slot is empty", () => {
    const spec = cloneSpec("orders-list");
    spec.layout.slots!.content = [];

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["LAYOUT-SLOT"]);
  });
});

describe("state validation", () => {
  it("reports STATE-REQUIRED for an archetype state that is absent", () => {
    const spec = cloneSpec("orders-list");
    delete spec.states.empty;

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["STATE-REQUIRED"]);
  });

  it("reports STATE-DEFAULT and the schema error when default is absent", () => {
    const spec = cloneSpec("orders-list");
    delete spec.states.default;

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toContain("STATE-DEFAULT");
    expect(ruleIds(report)).toContain("SCHEMA-INVALID");
  });

  it("reports STATE-OVERRIDE for an unknown node id", () => {
    const spec = cloneSpec("orders-list");
    spec.states.default!.overrides = [{ nodeId: "ghost-node", state: "hover" }];

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["STATE-OVERRIDE"]);
  });

  it("reports STATE-OVERRIDE for an unknown component", () => {
    const spec = cloneSpec("orders-list");
    spec.states.default!.overrides = [{ component: "GhostWidget", state: "hover" }];

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["STATE-OVERRIDE"]);
  });

  it("accepts overrides that reference real nodes and catalog components", () => {
    const spec = cloneSpec("orders-list");
    const section = findNode(spec, "Section");
    section.id = "section-1";
    spec.states.default!.overrides = [
      { nodeId: "section-1", state: "hover" },
      { component: "Modal", state: "open" },
    ];

    const report = validatePageSpec(spec, contextFor(spec));
    expect(report.findings).toEqual([]);
  });
});

describe("asset validation", () => {
  it("reports ASSET-MISSING for node.assetRef values", () => {
    const spec = cloneSpec("item-detail");
    findNode(spec, "Card").assetRef = "hero-missing";

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["ASSET-MISSING"]);
  });

  it("reports ASSET-MISSING for assetRef nested in props", () => {
    const spec = cloneSpec("auth");
    const text = findNode(spec, "Text");
    text.props = { ...(text.props ?? {}), assetRef: "missing-illustration" };

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["ASSET-MISSING"]);
  });

  it("reports ASSET-PLACEHOLDER when placeholders remain", () => {
    const spec = cloneSpec("orders-list");
    const ctx = structuredClone(contextFor(spec));
    ctx.manifest.placeholders = ["empty-orders"];

    const report = validatePageSpec(spec, ctx);
    expect(ruleIds(report)).toEqual(["ASSET-PLACEHOLDER"]);
    expect(report.blockers).toBe(1);
  });

  it("reports ASSET-INCOMPLETE as a major finding", () => {
    const spec = cloneSpec("orders-list");
    const ctx = structuredClone(contextFor(spec));
    ctx.manifest.complete = false;

    const report = validatePageSpec(spec, ctx);
    expect(ruleIds(report)).toEqual(["ASSET-INCOMPLETE"]);
    expect(report.major).toBe(1);
    expect(report.passed).toBe(true);
  });

  it("reports ASSET-ICON-SVG when an icon has no svg file", () => {
    const spec = cloneSpec("orders-list");
    const ctx = structuredClone(contextFor(spec));
    const search = ctx.manifest.assets.find((asset) => asset.id === "search")!;
    search.files = [{ path: "assets/icons/search.png", format: "png" }];

    const report = validatePageSpec(spec, ctx);
    expect(ruleIds(report)).toEqual(["ASSET-ICON-SVG"]);
  });
});

describe("traceability validation", () => {
  it("reports TRACE-PAGE-REQ when the page has no requirements", () => {
    const spec = cloneSpec("orders-list");
    spec.meta.reqRefs = [];

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toContain("TRACE-PAGE-REQ");
    expect(ruleIds(report)).toContain("SCHEMA-INVALID");
  });

  it("reports TRACE-NODE-REQ for a reqRef outside page refs and reqMap", () => {
    const spec = cloneSpec("orders-list");
    spec.layout.reqRef = "REQ-ORDER-999" as ReqId;

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["TRACE-NODE-REQ"]);
  });

  it("reports TRACE-DESIGN-DEFAULT for blank node rationales", () => {
    const spec = cloneSpec("orders-list");
    spec.layout.designDefault = "   ";

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["TRACE-DESIGN-DEFAULT"]);
    expect(report.major).toBe(1);
  });

  it("reports TRACE-DESIGN-DEFAULT for blank traceability entries", () => {
    const spec = cloneSpec("orders-list");
    spec.traceability.designDefaults = ["  "];

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["TRACE-DESIGN-DEFAULT"]);
  });

  it("reports TRACE-UNMAPPED when traceability still lists unmapped requirements", () => {
    const spec = cloneSpec("orders-list");
    spec.traceability.unmapped = ["REQ-ORDER-009"];

    const report = validatePageSpec(spec, contextFor(spec));
    expect(ruleIds(report)).toEqual(["TRACE-UNMAPPED"]);
  });
});
