import { describe, expect, it } from "vitest";
import {
  UiBriefSchema,
  type AssetManifest,
  type PageSpec,
  type ReqId,
  type SpecNode,
  type UiBrief,
  type UiBriefPage,
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
const deps = { getProfile, getCatalog, getArchetype };
const specs = compileProject(brief, deps);
const specByPageId = new Map(specs.map((spec) => [spec.meta.pageId, spec]));

const manifestsByProfile: Record<string, AssetManifest> = {
  "b-dense": {
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
  },
  "c-expressive": {
    project: "demo-orders",
    profile: "c-expressive",
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
        id: "empty-feed",
        kind: "illustration",
        library: "local",
        files: [{ path: "assets/illustrations/empty-feed.svg", format: "svg" }],
        license: "internal",
      },
    ],
    placeholders: [],
    complete: true,
  },
};

function requiredSpec(pageId: string): PageSpec {
  const spec = specByPageId.get(pageId);
  if (!spec) throw new Error(`Unknown page: ${pageId}`);
  return spec;
}

function contextForSpec(
  spec: PageSpec,
  page: UiBriefPage | undefined,
  navigation: ValidationContext["navigation"],
  manifests: Record<string, AssetManifest> = manifestsByProfile
): ValidationContext {
  const manifest = manifests[spec.meta.profile];
  if (!manifest) throw new Error(`Unknown manifest profile: ${spec.meta.profile}`);
  return {
    profile: getProfile(spec.meta.profile),
    catalog: getCatalog(spec.meta.profile),
    archetype: getArchetype(spec.meta.archetype),
    manifest,
    requiredStates: page?.requiredStates,
    briefPage: page,
    navigation,
  };
}

function contextFor(spec: PageSpec): ValidationContext {
  const page = brief.ia.pages.find((candidate) => candidate.id === spec.meta.pageId);
  return contextForSpec(spec, page, brief.ia.navigation);
}

/** Context without brief data; semantic checks must be skipped. */
function brieflessContextFor(spec: PageSpec): ValidationContext {
  return contextForSpec(spec, undefined, undefined);
}

function findingDetail(report: ValidationReport): string {
  return report.findings
    .map((finding) => `${finding.ruleId}@${finding.location}: ${finding.issue}`)
    .join("\n");
}

const customersPage: UiBriefPage = {
  id: "customers-list",
  name: "客户列表",
  purpose: "查看和管理客户",
  archetype: "list",
  target: "web",
  profile: "b-dense",
  route: "/customers",
  roles: ["admin", "operator"],
  requiredStates: ["default", "empty", "loading", "error"],
  reqRefs: ["REQ-ORDER-009"],
  fields: ["customerName", "phone", "email"],
  filterFields: ["name", "phone"],
  actions: ["新建客户", "导出客户"],
  emptyTitle: "暂无客户",
};

const customersBrief = structuredClone(brief) as UiBrief;
customersBrief.ia.pages.push(customersPage);
customersBrief.traceability.reqMap["REQ-ORDER-009"] = ["customers-list"];
const customersSpec = compileProject(customersBrief, deps).find(
  (spec) => spec.meta.pageId === "customers-list"
)!;

const contactsPage: UiBriefPage = {
  id: "contacts-list",
  name: "联系人列表",
  purpose: "查看和管理联系人",
  archetype: "list",
  target: "web",
  profile: "b-dense",
  route: "/contacts",
  roles: ["admin", "operator"],
  requiredStates: ["default", "empty", "loading", "error"],
  reqRefs: ["REQ-CRM-001"],
  fields: ["name", "email", "phone"],
  filterFields: ["name", "email"],
  actions: ["新建联系人"],
  emptyTitle: "暂无联系人",
  emptyAssetRef: "empty-contacts",
};

const crmBrief = structuredClone(brief) as UiBrief;
crmBrief.meta.project = "demo-crm";
crmBrief.ia.pages = [contactsPage];
crmBrief.ia.navigation = { primary: ["联系人", "设置"] };
crmBrief.ia.flows = [];
crmBrief.traceability.reqMap = { "REQ-CRM-001": ["contacts-list"] };
crmBrief.traceability.unmapped = [];
const contactsSpec = compileProject(crmBrief, deps)[0]!;
const crmManifestsByProfile: Record<string, AssetManifest> = {
  ...manifestsByProfile,
  "b-dense": {
    ...structuredClone(manifestsByProfile["b-dense"]!),
    project: "demo-crm",
    assets: [
      ...structuredClone(manifestsByProfile["b-dense"]!.assets),
      {
        id: "empty-contacts",
        kind: "illustration",
        library: "local",
        files: [{ path: "assets/illustrations/empty-contacts.svg", format: "svg" }],
        license: "internal",
      },
    ],
  },
};

const customersListOnlyBrief = structuredClone(brief) as UiBrief;
customersListOnlyBrief.ia.pages = [customersPage];
customersListOnlyBrief.traceability.reqMap = { "REQ-ORDER-009": ["customers-list"] };
customersListOnlyBrief.traceability.unmapped = [];
const customersListOnlySpec = compileProject(customersListOnlyBrief, deps)[0]!;

/** Same project and profile, icons only: no empty-orders illustration exists. */
const iconsOnlyManifests: Record<string, AssetManifest> = {
  "b-dense": {
    ...structuredClone(manifestsByProfile["b-dense"]!),
    assets: structuredClone(manifestsByProfile["b-dense"]!.assets).filter(
      (asset) => asset.kind === "icon"
    ),
  },
};

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

function semanticRuleIds(report: ValidationReport): string[] {
  return [
    ...new Set(
      report.findings
        .filter((finding) => finding.ruleId.startsWith("SEMANTIC-"))
        .map((finding) => finding.ruleId)
    ),
  ];
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

describe("brief semantic validation", () => {
  it("reports zero semantic findings for all eight sample pages", () => {
    for (const spec of specs) {
      const report = validatePageSpec(spec, contextFor(spec));
      expect(semanticRuleIds(report), `${spec.meta.pageId}\n${findingDetail(report)}`).toEqual(
        []
      );
      expect(report.passed, findingDetail(report)).toBe(true);
    }
  });

  it("reports zero semantic findings for a custom customers-list page", () => {
    const report = validatePageSpec(
      customersSpec,
      contextForSpec(customersSpec, customersPage, customersBrief.ia.navigation)
    );
    expect(report.findings, findingDetail(report)).toEqual([]);
    expect(report.passed).toBe(true);

    const serializedLayout = JSON.stringify(customersSpec.layout);
    for (const action of ["新建客户", "导出客户"]) {
      expect(serializedLayout, `missing action ${action}`).toContain(action);
    }
  });

  it("passes a list page with no emptyAssetRef against an icons-only manifest", () => {
    expect(customersListOnlySpec.layout).toBeDefined();

    const report = validatePageSpec(
      customersListOnlySpec,
      contextForSpec(
        customersListOnlySpec,
        customersPage,
        customersListOnlyBrief.ia.navigation,
        iconsOnlyManifests
      )
    );
    expect(report.findings, findingDetail(report)).toEqual([]);
    expect(report.blockers).toBe(0);
    expect(report.passed).toBe(true);

    const empty = findNode(customersListOnlySpec, "EmptyState");
    expect(empty.assetRef).toBeUndefined();
  });

  it("reports zero semantic findings for a custom contacts-list page", () => {
    const report = validatePageSpec(
      contactsSpec,
      contextForSpec(
        contactsSpec,
        contactsPage,
        crmBrief.ia.navigation,
        crmManifestsByProfile
      )
    );
    expect(report.findings, findingDetail(report)).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("rejects a customer page that renders order fields, actions, and empty copy", () => {
    const spec = structuredClone(customersSpec);
    const table = findNode(spec, "DataTable");
    table.props = {
      ...(table.props ?? {}),
      columns: ["orderNo", "customer", "amount", "status", "createdAt"],
    };
    const filter = findNode(spec, "FilterBar");
    filter.props = { ...(filter.props ?? {}), action: "新建订单" };
    const empty = findNode(spec, "EmptyState");
    empty.props = { ...(empty.props ?? {}), title: "暂无订单" };
    // Interactions alone never satisfy SEMANTIC-ACTION after the fix.
    spec.interactions = [
      { trigger: "新建客户", action: "navigate" },
      { trigger: "导出客户", action: "navigate" },
    ];

    const report = validatePageSpec(
      spec,
      contextForSpec(spec, customersPage, customersBrief.ia.navigation)
    );
    const ids = semanticRuleIds(report);
    expect(ids, findingDetail(report)).toContain("SEMANTIC-FIELD");
    expect(ids, findingDetail(report)).toContain("SEMANTIC-ACTION");
    expect(ids, findingDetail(report)).toContain("SEMANTIC-EMPTY");
    expect(
      report.findings
        .filter((finding) => finding.ruleId.startsWith("SEMANTIC-"))
        .every((finding) => finding.severity === "blocker")
    ).toBe(true);
    expect(report.passed).toBe(false);
  });

  it("reports SEMANTIC-FILTER when a brief filter field is absent from the layout", () => {
    const spec = structuredClone(customersSpec);
    const filterPage: UiBriefPage = {
      ...customersPage,
      filterFields: ["name", "phone", "region"],
    };

    const report = validatePageSpec(
      spec,
      contextForSpec(spec, filterPage, customersBrief.ia.navigation)
    );
    const findings = report.findings.filter(
      (finding) => finding.ruleId === "SEMANTIC-FILTER"
    );
    expect(findings, findingDetail(report)).toHaveLength(1);
    expect(findings[0]?.evidence).toBe("region");
    expect(findings[0]?.severity).toBe("blocker");
    expect(report.passed).toBe(false);
  });

  it("requires actions in the layout even when interactions trigger them", () => {
    const spec = structuredClone(customersSpec);
    const filter = findNode(spec, "FilterBar");
    filter.props = { ...(filter.props ?? {}), action: "查询" };
    const actionsRow = findNode(spec, "Row");
    actionsRow.children = [];
    spec.interactions = [
      { trigger: "新建客户", action: "navigate" },
      { trigger: "导出客户", action: "navigate" },
    ];

    const report = validatePageSpec(
      spec,
      contextForSpec(spec, customersPage, customersBrief.ia.navigation)
    );
    const findings = report.findings.filter(
      (finding) => finding.ruleId === "SEMANTIC-ACTION"
    );
    expect(findings.map((finding) => finding.evidence).sort(), findingDetail(report)).toEqual(
      ["新建客户", "导出客户"].sort()
    );
    expect(findings.every((finding) => finding.severity === "blocker")).toBe(true);
    expect(report.passed).toBe(false);
  });

  it("reports SEMANTIC-META for name, purpose, route, and role drift", () => {
    const spec = structuredClone(customersSpec);
    spec.meta.name = "订单列表";
    spec.meta.purpose = "查看和管理订单";
    spec.meta.route = "/orders";
    spec.meta.roles = ["admin"];

    const report = validatePageSpec(
      spec,
      contextForSpec(spec, customersPage, customersBrief.ia.navigation)
    );
    const metaFindings = report.findings.filter(
      (finding) => finding.ruleId === "SEMANTIC-META"
    );
    expect(metaFindings.map((finding) => finding.location).sort()).toEqual([
      "meta.name",
      "meta.purpose",
      "meta.roles",
      "meta.route",
    ]);
    expect(metaFindings.every((finding) => finding.severity === "blocker")).toBe(true);
  });

  it("compares roles order-insensitively", () => {
    const spec = structuredClone(customersSpec);
    spec.meta.roles = ["operator", "admin"];

    const report = validatePageSpec(
      spec,
      contextForSpec(spec, customersPage, customersBrief.ia.navigation)
    );
    expect(semanticRuleIds(report), findingDetail(report)).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("reports SEMANTIC-NAV when a web nav item is missing", () => {
    const spec = cloneSpec("orders-list");
    const nav = (spec.layout.props?.nav as string[] | undefined) ?? [];
    spec.layout.props = {
      ...(spec.layout.props ?? {}),
      nav: nav.filter((item) => item !== "客户"),
    };

    const report = validatePageSpec(spec, contextFor(spec));
    const findings = report.findings.filter(
      (finding) => finding.ruleId === "SEMANTIC-NAV"
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toBe("客户");
    expect(findings[0]?.location).toBe("layout.props.nav");
    expect(report.passed).toBe(false);
  });

  it("reports SEMANTIC-NAV when a mobile tab is missing", () => {
    const spec = cloneSpec("home-feed");
    const tabs = (spec.layout.props?.tabs as string[] | undefined) ?? [];
    spec.layout.props = {
      ...(spec.layout.props ?? {}),
      tabs: tabs.filter((item) => item !== "关注"),
    };

    const report = validatePageSpec(spec, contextFor(spec));
    const findings = report.findings.filter(
      (finding) => finding.ruleId === "SEMANTIC-NAV"
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toBe("关注");
    expect(findings[0]?.location).toBe("layout.props.tabs");
  });

  it("reports SEMANTIC-NAV when a mobile shell omits tabs entirely", () => {
    const spec = cloneSpec("item-detail");
    delete spec.layout.props!.tabs;

    const report = validatePageSpec(spec, contextFor(spec));
    const findings = report.findings.filter(
      (finding) => finding.ruleId === "SEMANTIC-NAV"
    );
    expect(findings, findingDetail(report)).toHaveLength(1);
    expect(findings[0]?.location).toBe("layout.props.tabs");
    expect(findings[0]?.evidence).toContain("推荐");
    expect(report.passed).toBe(false);
  });

  it("checks settings fields via their localized labels instead of skipping them", () => {
    const settingsPage = brief.ia.pages.find((page) => page.id === "settings")!;
    const cleanSpec = cloneSpec("settings");
    const clean = validatePageSpec(
      cleanSpec,
      contextForSpec(cleanSpec, settingsPage, brief.ia.navigation)
    );
    expect(semanticRuleIds(clean), findingDetail(clean)).toEqual([]);

    const pageWithUnknownField: UiBriefPage = {
      ...settingsPage,
      fields: [...(settingsPage.fields ?? []), "bogus-setting"],
    };
    const spec = cloneSpec("settings");
    const report = validatePageSpec(
      spec,
      contextForSpec(spec, pageWithUnknownField, brief.ia.navigation)
    );
    const findings = report.findings.filter(
      (finding) => finding.ruleId === "SEMANTIC-FIELD"
    );
    expect(findings, findingDetail(report)).toHaveLength(1);
    expect(findings[0]?.evidence).toBe("bogus-setting");
    expect(report.passed).toBe(false);
  });

  it("matches fields and actions exactly rather than as substrings", () => {
    const spec = structuredClone(customersSpec);
    const page: UiBriefPage = {
      ...customersPage,
      fields: ["customer"],
      filterFields: [],
      actions: ["导出"],
    };

    const report = validatePageSpec(
      spec,
      contextForSpec(spec, page, customersBrief.ia.navigation)
    );
    const fieldFindings = report.findings.filter(
      (finding) => finding.ruleId === "SEMANTIC-FIELD"
    );
    const actionFindings = report.findings.filter(
      (finding) => finding.ruleId === "SEMANTIC-ACTION"
    );
    expect(fieldFindings.map((finding) => finding.evidence)).toEqual(["customer"]);
    expect(actionFindings.map((finding) => finding.evidence)).toEqual(["导出"]);
  });

  it("accepts a feed page whose brief emptyTitle is rendered", () => {
    const feedBrief = structuredClone(brief) as UiBrief;
    const feedPage = feedBrief.ia.pages.find((page) => page.id === "home-feed")!;
    feedPage.emptyTitle = "暂无动态";
    const feedSpec = compileProject(feedBrief, deps).find(
      (spec) => spec.meta.pageId === "home-feed"
    )!;

    const report = validatePageSpec(
      feedSpec,
      contextForSpec(feedSpec, feedPage, feedBrief.ia.navigation)
    );
    expect(report.findings, findingDetail(report)).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("reports SEMANTIC-EMPTY when the brief empty title is absent", () => {
    const spec = cloneSpec("orders-list");
    const empty = findNode(spec, "EmptyState");
    empty.props = { ...(empty.props ?? {}), title: "暂无数据" };

    const report = validatePageSpec(spec, contextFor(spec));
    const findings = report.findings.filter(
      (finding) => finding.ruleId === "SEMANTIC-EMPTY"
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toBe("暂无订单");
    expect(report.passed).toBe(false);
  });

  it("skips every semantic check when brief context is absent", () => {
    const spec = cloneSpec("orders-list");
    spec.meta.name = "客户列表";
    const nav = (spec.layout.props?.nav as string[] | undefined) ?? [];
    spec.layout.props = {
      ...(spec.layout.props ?? {}),
      nav: nav.filter((item) => item !== "客户"),
    };
    const empty = findNode(spec, "EmptyState");
    empty.props = { ...(empty.props ?? {}), title: "暂无数据" };

    const report = validatePageSpec(spec, brieflessContextFor(spec));
    expect(semanticRuleIds(report)).toEqual([]);
    expect(report.findings, findingDetail(report)).toEqual([]);
    expect(report.passed).toBe(true);
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

  it("rejects a mobile root shell missing from the b-dense catalog", () => {
    const spec = cloneSpec("auth");
    const report = validatePageSpec(spec, {
      profile: getProfile("b-dense"),
      catalog: getCatalog("b-dense"),
      archetype: getArchetype("auth"),
      manifest: manifestsByProfile["b-dense"]!,
      requiredStates: ["default", "loading", "error", "disabled"],
    });

    expect(
      report.findings.some(
        (finding) => finding.ruleId === "CATALOG-UNKNOWN" && finding.evidence === "MobileShell"
      )
    ).toBe(true);
    expect(report.blockers).toBeGreaterThan(0);
    expect(report.passed).toBe(false);
  });

  it("rejects a web root shell missing from the c-expressive catalog", () => {
    const spec = cloneSpec("orders-overview");
    const report = validatePageSpec(spec, {
      profile: getProfile("c-expressive"),
      catalog: getCatalog("c-expressive"),
      archetype: getArchetype("overview"),
      manifest: manifestsByProfile["c-expressive"]!,
      requiredStates: ["default", "loading", "error"],
    });

    expect(
      report.findings.some(
        (finding) => finding.ruleId === "CATALOG-UNKNOWN" && finding.evidence === "PageShell"
      )
    ).toBe(true);
    expect(report.blockers).toBeGreaterThan(0);
    expect(report.passed).toBe(false);
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

    const report = validatePageSpec(spec, brieflessContextFor(spec));
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
    expect(ruleIds(report)).toContain("LAYOUT-ARCHETYPE");
    // MobileShell is also absent from the b-dense catalog, so the catalog gate
    // reports it as well.
    expect(ruleIds(report)).toContain("CATALOG-UNKNOWN");
    expect(report.passed).toBe(false);
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

    const report = validatePageSpec(spec, brieflessContextFor(spec));
    expect(ruleIds(report)).toEqual(["LAYOUT-SLOT"]);
  });

  it("reports LAYOUT-SLOT when a required slot is empty", () => {
    const spec = cloneSpec("orders-list");
    spec.layout.slots!.content = [];

    const report = validatePageSpec(spec, brieflessContextFor(spec));
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

  it("reports STATE-REQUIRED for a page-only required state", () => {
    const spec = cloneSpec("orders-list");
    const report = validatePageSpec(spec, {
      ...contextFor(spec),
      requiredStates: ["filtered"],
    });

    expect(ruleIds(report)).toEqual(["STATE-REQUIRED"]);
    expect(report.findings[0]?.evidence).toBe("filtered");
    expect(report.passed).toBe(false);
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
  it("exercises a c-expressive assetRef against the c-expressive manifest", () => {
    const spec = requiredSpec("home-feed");
    const emptyState = walkSpecNodes(spec.layout).find(({ node }) => node.type === "EmptyState");

    expect(emptyState?.node.assetRef).toBe("empty-feed");
    expect(validatePageSpec(spec, contextFor(spec)).findings).toEqual([]);
  });

  it("reports ASSET-PROFILE when the manifest profile differs", () => {
    const spec = cloneSpec("orders-list");
    const ctx = structuredClone(contextFor(spec));
    ctx.manifest.profile = "c-expressive";

    const report = validatePageSpec(spec, ctx);
    expect(ruleIds(report)).toEqual(["ASSET-PROFILE"]);
    expect(report.blockers).toBe(1);
  });

  it("reports ASSET-PROJECT when the manifest project differs", () => {
    const spec = cloneSpec("orders-list");
    const ctx = structuredClone(contextFor(spec));
    ctx.manifest.project = "another-project";

    const report = validatePageSpec(spec, ctx);
    expect(ruleIds(report)).toEqual(["ASSET-PROJECT"]);
    expect(report.blockers).toBe(1);
  });

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
