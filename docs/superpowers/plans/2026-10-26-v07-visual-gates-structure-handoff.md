# v0.7 Visual Gates, Structure, Blocks, and Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make visual drift fail closed before signoff, add deterministic structure feedback, pilot block generation on two pages, and package the whole delivery into an offline-readable Handoff.

**Architecture:** New contracts and pure logic live in `core/` (contracts, figma, validators, compiler, handoff); browser, PNG, zip, and process wiring live in `runtimes/standalone`; the Figma plugin gains PNG export and an in-repo save server. Every gate writes hash-bound JSON evidence, and `handoff:pack` refuses to emit a package unless every gate passed.

**Tech Stack:** TypeScript (ESM, strict), Zod 4, Vitest 5, Playwright, pngjs + pixelmatch, fflate, esbuild (Figma plugin/dsh bundles), dsh `0.2.1-rc.2`.

## Global Constraints

- All commands run from `pipeline/`.
- `core/` must not import `@deepseek-ai/*`, Playwright, pngjs, fflate, or `node:fs`.
- Relative TS imports use an explicit `.js` extension.
- Every new package follows the existing `package.json` + `tsconfig.json` pattern (`extends ../../tsconfig.base.json`, `include: ["src", "tests"]`).
- `pnpm test` must stay offline; Playwright/PNG/zip gates are CLIs plus fixture tests.
- Evidence paths follow the design: `artifacts/<project>/figma/`, `artifacts/<project>/render/`, `artifacts/<project>/blocks/`, `artifacts/<project>/handoff/`.
- Local commits only; never push.
- Never commit keys or `.env`.
- Gate 0 (v0.6 human signoff + fresh signed baseline) blocks parity acceptance and Handoff acceptance, not Batch 1 code.
- v0.7 exit requires every item in `docs/superpowers/specs/2026-10-26-v07-visual-gates-structure-handoff-design.md` §11.5.

---

## File Structure

| Path | Responsibility |
|---|---|
| `core/contracts/src/figma.ts` | Coverage, mapping metadata, readback style extensions |
| `core/contracts/src/derived-ids.ts` | Shared synthetic node id convention |
| `core/contracts/src/conformance.ts` | Style manifest + conformance report schemas |
| `core/contracts/src/parity.ts` | Parity report schemas |
| `core/contracts/src/structure.ts` | Structure lint, render metrics, structure diff schemas |
| `core/contracts/src/block.ts` | Block manifest, block content, experiment schemas |
| `core/contracts/src/handoff.ts` | Handoff manifest schemas |
| `core/figma/src/coverage.ts` | Skip reasons, consumed props, coverage build/apply |
| `core/figma/src/conformance.ts` | Pure plan↔style-manifest comparator |
| `core/figma/src/parity.ts` | Pure parity threshold evaluator |
| `core/figma/src/diff.ts` | Coverage + readback style checks |
| `core/validators/src/structure.ts` | Deterministic structure lint rules |
| `core/validators/src/structure-measured.ts` | Measured-height/overflow/footer checks |
| `core/compiler/src/blocks.ts` | Block split/assemble/verify |
| `core/compiler/src/structure-diff.ts` | Page tree diff |
| `core/handoff/src/*` | Handoff validation + manifest composition |
| `runtimes/standalone/src/conformance/capture.ts` | Playwright style manifest capture |
| `runtimes/standalone/src/figma-conformance-cli.ts` | `figma:conformance` |
| `runtimes/standalone/src/figma-parity-cli.ts` | `figma:parity` |
| `runtimes/standalone/src/figma-serve-cli.ts` | `figma:serve` |
| `runtimes/standalone/src/figma-sign-cli.ts` | `figma:sign` |
| `runtimes/standalone/src/render-measure-cli.ts` | `render:measure` |
| `runtimes/standalone/src/structure-check-cli.ts` | `structure:check` |
| `runtimes/standalone/src/structure-diff-cli.ts` | `structure:diff` |
| `runtimes/standalone/src/block-verify-cli.ts` | `block:verify` |
| `runtimes/standalone/src/block-experiment-cli.ts` | `block:experiment` |
| `runtimes/standalone/src/handoff-pack-cli.ts` | `handoff:pack` |
| `runtimes/standalone/src/v07-smoke-cli.ts` | `v07:smoke` |
| `runtimes/figma/src/plugin.ts` | PNG export + auto-save |
| `runtimes/figma/src/ui.html` | Server URL, build/save status |
| `core/agents/src/block-content.ts` | Block content prompt/schema/validator |

---

## Batch 0 — Gate 0

### Task 0: Refresh the signed baseline and close v0.6

This is a human gate. Do not fake it; parity and Handoff acceptance depend on it.

**Files:**
- Modify: `baselines/employee-app-phase2/*` (regenerated PNGs + manifest)
- Modify: `artifacts/employee-app-phase2/visual-review/*`
- Modify: `docs/handoffs/2026-10-26-v06-figma-gate-evidence.md` (signoff note)

**Interfaces:**
- Consumes: `artifacts/employee-app-phase2/figma/spec-source` (8 PageSpecs)
- Produces: fresh signed baseline manifest, `visual-sign.json`

- [ ] **Step 1: Render the signed specs to HTML**

Run:
```bash
pnpm render:html --run artifacts/employee-app-phase2/figma/spec-source --out /tmp/html-v07
```
Expected: 8 pages + `index.html` under `/tmp/html-v07`.

- [ ] **Step 2: Regenerate the visual baseline**

Run:
```bash
pnpm visual:baseline \
  --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run artifacts/employee-app-phase2/figma/spec-source \
  --html /tmp/html-v07 \
  --out baselines/employee-app-phase2
```
Expected: PNGs + `manifest.json` with a new `generatedAt`.

- [ ] **Step 3: Run the visual critic and sign**

Run:
```bash
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm visual:review \
  --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run artifacts/employee-app-phase2/figma/spec-source \
  --html /tmp/html-v07 \
  --baseline baselines/employee-app-phase2 \
  --runtime dsh --profile prd-ui-visual \
  --runs artifacts/employee-app-phase2/visual-review \
  --max-cost-cny 3 --json
pnpm visual:sign --run artifacts/employee-app-phase2/visual-review/<runId> --signoff-visual /tmp/signoff-visual-v07.md
```
Expected: 0 blocker; signoff written with the new `manifestHash` / `findingsHash`.

- [ ] **Step 4: Close v0.6**

Run the manual checklist in `artifacts/employee-app-phase2/figma/README.md`, then write the signoff into the v0.6 handoff and update the roadmap status. Do not mark v0.7 complete until this is done.

- [ ] **Step 5: Commit**

```bash
git add baselines/employee-app-phase2 artifacts/employee-app-phase2/visual-review docs/handoffs/2026-10-26-v06-figma-gate-evidence.md docs/superpowers/plans/2026-10-23-version-roadmap.md
git commit -m "chore(v07): refresh signed visual baseline and close v0.6 gate"
```

---

## Batch 1 — Fail-closed mapping, conformance, structure lint

### Task 1: Extend Figma contracts for coverage and readback styles

**Files:**
- Modify: `pipeline/core/contracts/src/figma.ts`
- Test: `pipeline/core/contracts/tests/figma.test.ts`

**Interfaces:**
- Produces:
  - `FigmaMappingStatus = "mapped" | "degraded" | "unmapped"`
  - `FigmaCoverageNode`, `FigmaCoverage`
  - `FigmaPlan.coverage?: FigmaCoverage`
  - `FigmaPlanNode.origin?`, `.mapping?`, `.reason?`
  - `FigmaBorderSide`, `FigmaFill`
  - `FigmaReadbackNode.cornerRadius?`, `.borderTop?`, `.borderBottom?`, `.borderLeft?`, `.fillDetails?`, `.fontWeight?`, `.textColor?`, `.lineHeight?`

- [ ] **Step 1: Write the failing tests**

Add to `core/contracts/tests/figma.test.ts`:

```ts
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

it("rejects an unknown mapping status", () => {
  const invalid = {
    ...plan,
    root: { ...plan.root, mapping: "maybe" },
  };
  expect(FigmaPlanSchema.safeParse(invalid).success).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm exec vitest run core/contracts/tests/figma.test.ts
```
Expected: FAIL because coverage/readback fields are not in the schema (Zod `.strict()` rejects unknown keys).

- [ ] **Step 3: Implement the contract changes**

In `core/contracts/src/figma.ts` add:

```ts
export type FigmaMappingStatus = "mapped" | "degraded" | "unmapped";

export interface FigmaCoverageNode {
  specId: string;
  specType: string;
  path: string;
  status: FigmaMappingStatus | "skipped";
  reason?: string;
}

export interface FigmaCoverage {
  nodes: FigmaCoverageNode[];
  summary: {
    spec: number;
    derived: number;
    mapped: number;
    degraded: number;
    unmapped: number;
    skipped: number;
  };
}

export interface FigmaBorderSide {
  width: number;
  color: string;
}

export interface FigmaFill {
  color: string;
  alpha: number;
}
```

Add optional fields to `FigmaPlanNode`:

```ts
  origin?: "spec" | "derived";
  mapping?: FigmaMappingStatus;
  reason?: string;
```

Add to `FigmaPlan`:

```ts
  coverage?: FigmaCoverage;
```

Add to `FigmaReadbackNode`:

```ts
  cornerRadius?: number;
  borderTop?: FigmaBorderSide;
  borderBottom?: FigmaBorderSide;
  borderLeft?: FigmaBorderSide;
  fillDetails?: FigmaFill[];
  fontWeight?: number;
  textColor?: string;
  lineHeight?: number;
```

In `FigmaPlanNodeSchema` add:

```ts
  origin: z.enum(["spec", "derived"]).optional(),
  mapping: z.enum(["mapped", "degraded", "unmapped"]).optional(),
  reason: z.string().min(1).optional(),
```

Define `FigmaCoverageNodeSchema` / `FigmaCoverageSchema` and add `coverage: FigmaCoverageSchema.optional()` to `FigmaPlanSchema`.

In `FigmaReadbackNodeSchema` add optional fields:

```ts
  cornerRadius: z.number().nonnegative().optional(),
  borderTop: z.object({ width: z.number().nonnegative(), color: z.string().min(1) }).strict().optional(),
  borderBottom: z.object({ width: z.number().nonnegative(), color: z.string().min(1) }).strict().optional(),
  borderLeft: z.object({ width: z.number().nonnegative(), color: z.string().min(1) }).strict().optional(),
  fillDetails: z.array(z.object({ color: z.string().min(1), alpha: z.number().min(0).max(1) }).strict()).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  textColor: z.string().min(1).optional(),
  lineHeight: z.number().nonnegative().optional(),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
pnpm exec vitest run core/contracts/tests/figma.test.ts
```
Expected: PASS (3 new + 3 existing).

- [ ] **Step 5: Commit**

```bash
git add core/contracts/src/figma.ts core/contracts/tests/figma.test.ts
git commit -m "feat(contracts): add figma coverage and readback style fields"
```

---

### Task 2: Share derived node ids between renderer and plan compiler

**Files:**
- Create: `pipeline/core/contracts/src/derived-ids.ts`
- Modify: `pipeline/core/contracts/src/index.ts`
- Modify: `pipeline/core/renderer-html/src/index.ts` (List, TabBar, CalendarGrid)
- Test: `pipeline/core/contracts/tests/derived-ids.test.ts`
- Test: `pipeline/core/renderer-html/tests/renderer.test.ts`

**Interfaces:**
- Produces:
  - `derivedNodeId(parentId: string, ...segments: Array<string | number>): string`
  - `MATERIAL_DERIVED_KINDS: ReadonlySet<string>`
  - `isMaterialDerivedId(id: string): boolean`
- Consumes: existing `node.id` from PageSpec.

- [ ] **Step 1: Write the failing tests**

Create `core/contracts/tests/derived-ids.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MATERIAL_DERIVED_KINDS,
  derivedNodeId,
  isMaterialDerivedId,
} from "../src/index.js";

describe("derivedNodeId", () => {
  it("joins parent and segments with dots", () => {
    expect(derivedNodeId("today.list", "row", 0)).toBe("today.list.row.0");
    expect(derivedNodeId("today.tabbar", "tab", 2)).toBe("today.tabbar.tab.2");
    expect(derivedNodeId("today.calendar", "cell", 1, 3)).toBe(
      "today.calendar.cell.1.3"
    );
  });

  it("identifies material derived ids", () => {
    expect(isMaterialDerivedId("today.list.row.0")).toBe(true);
    expect(isMaterialDerivedId("today.calendar.block.2")).toBe(true);
    expect(isMaterialDerivedId("today.calendar.cell.1.3")).toBe(true);
    expect(isMaterialDerivedId("today.calendar.day.0.frame")).toBe(false);
    expect(isMaterialDerivedId("today.card.appointments")).toBe(false);
    expect([...MATERIAL_DERIVED_KINDS]).toContain("tab");
  });
});
```

Add to `core/renderer-html/tests/renderer.test.ts`:

```ts
it("marks List rows, tabs, and calendar cells with derived ids", () => {
  const spec = compiledSpec("appointment-list");
  const html = renderDocument(spec, getProfile(spec.meta.profile), {
    pageNames: { today: "今日", "appointment-list": "预约列表" },
    pageRoutes: {},
    pageArchetypes: {},
  });
  expect(html).toMatch(/data-node-id="[^"]+\.row\.0"/);
  expect(html).toMatch(/data-node-id="[^"]+\.tab\.0"/);
  expect(html).toMatch(/data-node-id="[^"]+\.cell\.0\.0"/);
  expect(html).toMatch(/data-node-id="[^"]+\.block\.0"/);
});
```

If `compiledSpec` does not exist in that test file, reuse the file's existing spec fixture helper; the plan's implementer should use the same fixture already used for renderer tests.

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm exec vitest run core/contracts/tests/derived-ids.test.ts core/renderer-html/tests/renderer.test.ts
```
Expected: FAIL because the module and attributes do not exist.

- [ ] **Step 3: Implement the helper**

Create `core/contracts/src/derived-ids.ts`:

```ts
export const MATERIAL_DERIVED_KINDS = new Set([
  "row",
  "tab",
  "cell",
  "block",
  "day",
  "hour",
  "tr",
]);

export function derivedNodeId(
  parentId: string,
  ...segments: Array<string | number>
): string {
  return [parentId, ...segments].join(".");
}

export function isMaterialDerivedId(id: string): boolean {
  const parts = id.split(".");
  const last = parts.at(-1) ?? "";
  const prev = parts.at(-2) ?? "";
  const prev2 = parts.at(-3) ?? "";
  if (MATERIAL_DERIVED_KINDS.has(prev) && /^\d+$/.test(last)) return true;
  return MATERIAL_DERIVED_KINDS.has(prev2) && /^\d+$/.test(prev) && /^\d+$/.test(last);
}
```

The two-segment check covers `row.0`, `tab.0`, `day.0`, `hour.0`, `block.0`; the three-segment check covers `cell.1.3`. This deliberately excludes inner frames such as `day.0.frame`.

Export it from `core/contracts/src/index.ts`:

```ts
export * from "./derived-ids.js";
```

- [ ] **Step 4: Add the attributes in the renderer**

In `core/renderer-html/src/index.ts`:

- Import `derivedNodeId` from `@prd-ui/contracts`.
- `case "List"`: capture `const parentId = node.id;`, iterate with index, and add `data-node-id` to every generated row:

```tsx
const rowId = parentId ? ` data-node-id="${derivedNodeId(parentId, "row", index)}"` : "";
return `<div class="list-text-row summary-row"${rowId}>...`;
```

- `case "TabBar"` and `case "BottomNav"`: add `data-node-id="${derivedNodeId(node.id ?? "", "tab", index)}"` to each `<a class="tab">` when `node.id` is defined.
- `case "CalendarGrid"`:
  - day header: `derivedNodeId(node.id, "day", dayIndex)`
  - hour label: `derivedNodeId(node.id, "hour", hourIndex)`
  - cell: `derivedNodeId(node.id, "cell", hourIndex, dayIndex)`
  - block: `derivedNodeId(node.id, "block", index)`
  - Use a local `const calendarId = node.id;` and only emit the attribute when defined.

Do not add ids to non-material wrappers (`list-row-title`, `calendar-grid`, etc.).

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
pnpm exec vitest run core/contracts/tests/derived-ids.test.ts core/renderer-html/tests/renderer.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/contracts/src/derived-ids.ts core/contracts/src/index.ts core/contracts/tests/derived-ids.test.ts core/renderer-html/src/index.ts core/renderer-html/tests/renderer.test.ts
git commit -m "feat(contracts): share derived node ids with the html renderer"
```

---

### Task 3: Build coverage and fail closed in the plan compiler

**Files:**
- Create: `pipeline/core/figma/src/coverage.ts`
- Modify: `pipeline/core/figma/src/compile-plan.ts`
- Modify: `pipeline/core/figma/src/index.ts`
- Test: `pipeline/core/figma/tests/coverage.test.ts`

**Interfaces:**
- Consumes: `PageSpec`, `Ctx.defaultView`
- Produces:
  - `skipReason(node: SpecNode, defaultView: string | undefined): string | undefined`
  - `buildCoverage(spec: PageSpec, plan: FigmaPlan): FigmaCoverage`
  - `applyCoverage(plan: FigmaPlan, coverage: FigmaCoverage): void`
  - `coverageIndex(plans: FigmaPlan[], specRun: string, project: string): unknown`

- [ ] **Step 1: Write the failing tests**

Create `core/figma/tests/coverage.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UiBriefSchema, type PageSpec } from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { compileFigmaPlans } from "../src/index.js";

const brief = UiBriefSchema.parse(
  JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
const plans = compileFigmaPlans(
  specs,
  (page) => getProfile(page.meta.profile),
  (page) => getCatalog(page.meta.profile)
);

describe("figma coverage", () => {
  it("maps all eight phase2 pages with no unmapped or degraded nodes", () => {
    for (const plan of plans) {
      expect(plan.coverage, plan.pageId).toBeDefined();
      expect(plan.coverage!.summary.unmapped, plan.pageId).toBe(0);
      expect(plan.coverage!.summary.degraded, plan.pageId).toBe(0);
      expect(plan.coverage!.summary.skipped, plan.pageId).toBeGreaterThan(0);
      expect(
        plan.coverage!.summary.spec + plan.coverage!.summary.derived
      ).toBe(
        plan.coverage!.summary.mapped +
          plan.coverage!.summary.degraded +
          plan.coverage!.summary.unmapped +
          plan.coverage!.summary.skipped
      );
    }
  });

  it("marks an unknown component as unmapped", () => {
    const today = structuredClone(
      specs.find((spec) => spec.meta.pageId === "today")!
    );
    const section = today.layout.slots!.content![0]!;
    section.children = [
      ...(section.children ?? []),
      { id: "today.chart", type: "Chart", props: { title: "趋势" } },
    ];
    const plan = compileFigmaPlans(
      [today],
      (page) => getProfile(page.meta.profile),
      (page) => getCatalog(page.meta.profile)
    )[0]!;
    const node = plan.coverage!.nodes.find((entry) => entry.specId === "today.chart");
    expect(node?.status).toBe("unmapped");
    expect(node?.reason).toBe("UNMAPPED_COMPONENT:Chart");
  });

  it("marks an unknown prop as degraded", () => {
    const today = structuredClone(
      specs.find((spec) => spec.meta.pageId === "today")!
    );
    const card = today.layout.slots!.content![0]!.children![0]!;
    card.props = { ...card.props, mystery: true };
    const plan = compileFigmaPlans(
      [today],
      (page) => getProfile(page.meta.profile),
      (page) => getCatalog(page.meta.profile)
    )[0]!;
    const node = plan.coverage!.nodes.find((entry) => entry.specId === card.id);
    expect(node?.status).toBe("degraded");
    expect(node?.reason).toContain("UNMAPPED_PROP:mystery");
  });

  it("marks a missing node id as unmapped", () => {
    const today = structuredClone(
      specs.find((spec) => spec.meta.pageId === "today")!
    );
    const card = today.layout.slots!.content![0]!.children![0]!;
    delete card.id;
    const plan = compileFigmaPlans(
      [today],
      (page) => getProfile(page.meta.profile),
      (page) => getCatalog(page.meta.profile)
    )[0]!;
    expect(
      plan.coverage!.nodes.some((entry) => entry.reason === "SPEC_NODE_ID_MISSING")
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm exec vitest run core/figma/tests/coverage.test.ts
```
Expected: FAIL because `plan.coverage` is undefined.

- [ ] **Step 3: Implement `coverage.ts`**

Create `core/figma/src/coverage.ts`:

```ts
import type {
  FigmaCoverage,
  FigmaCoverageNode,
  FigmaPlan,
  FigmaPlanNode,
  PageSpec,
  SpecNode,
} from "@prd-ui/contracts";

/** Types the compiler intentionally does not render yet. They degrade, not silently drop. */
export const KNOWN_PARTIAL_TYPES = new Set([
  "BottomNav",
  "DataTable",
  "FeedCard",
  "FilterBar",
  "Pagination",
  "PageShell",
  "Stat",
  "Switch",
]);

/**
 * Props read by compile-plan.ts / renderer-html for a mapped type. A prop not
 * listed here and not in IGNORED_PROPS makes the node degraded.
 */
export const CONSUMED_PROPS: Record<string, readonly string[]> = {
  MobileShell: ["title", "tabs", "back", "activeTab", "storeName", "hasMessage"],
  TopBar: ["storeName", "hasMessage"],
  TabBar: ["items", "active"],
  BottomNav: ["items", "active"],
  Section: ["title", "padding", "gap", "viewPanel"],
  Card: ["title", "badge", "badgeTone", "subtitle", "padding", "gap"],
  Row: ["variant", "gap", "align", "title"],
  Stack: ["gap"],
  Grid: ["columns", "gap"],
  Text: ["text", "role", "align", "tone"],
  Button: ["label", "emphasis", "action"],
  QuickAction: ["label", "icon", "tone"],
  Badge: ["label", "tone"],
  SearchBar: ["placeholder"],
  CollapsedFilter: ["label", "value"],
  FormField: ["label", "value", "placeholder", "kind", "options", "required"],
  Input: ["label", "value", "placeholder", "kind", "options", "required"],
  Select: ["label", "value", "placeholder", "options", "required"],
  ListRow: ["title", "subtitle", "meta", "status", "statusTone", "searchText", "action"],
  List: ["items", "label"],
  CalendarGrid: ["days", "hours", "blocks", "viewPanel"],
  EmptyState: ["title", "description", "icon", "emptyKind", "action"],
  SummaryRow: ["text"],
  InventoryCard: ["title", "value", "tone"],
  Image: ["alt"],
  Skeleton: [],
  ErrorState: [],
};

/** Props that are semantic/interaction-only and never affect the plan. */
export const IGNORED_PROPS = new Set<string>([
  "id",
  "nodeId",
  "reqRef",
  "action",
  "onPress",
  "disabled",
]);

export function skipReason(
  node: SpecNode,
  defaultView: string | undefined
): string | undefined {
  if (node.type === "Skeleton") return "SKIPPED_STATE:Skeleton";
  if (node.type === "ErrorState") return "SKIPPED_STATE:ErrorState";
  if (node.type === "EmptyState" && node.props?.emptyKind !== "idle") {
    return "SKIPPED_STATE:EmptyState";
  }
  if (node.type === "ListRow" && typeof node.props?.searchText === "string") {
    return "SKIPPED_SEARCH_RESULT";
  }
  if (
    node.type === "Section" &&
    typeof node.props?.viewPanel === "string" &&
    node.props.viewPanel !== defaultView
  ) {
    return "SKIPPED_VIEW_PANEL";
  }
  return undefined;
}

function walkSpec(
  node: SpecNode,
  path: string,
  visit: (node: SpecNode, path: string) => void
): void {
  visit(node, path);
  (node.children ?? []).forEach((child, index) =>
    walkSpec(child, `${path}.children[${index}]`, visit)
  );
  for (const [slot, nodes] of Object.entries(node.slots ?? {})) {
    nodes.forEach((child, index) =>
      walkSpec(child, `${path}.slots.${slot}[${index}]`, visit)
    );
  }
}

function walkPlan(
  node: FigmaPlanNode,
  visit: (node: FigmaPlanNode) => void
): void {
  visit(node);
  if (node.child) walkPlan(node.child, visit);
  for (const child of node.children ?? []) walkPlan(child, visit);
}

function degradeReason(node: SpecNode): string | undefined {
  if (node.id === undefined || node.id.length === 0) return "SPEC_NODE_ID_MISSING";
  if (!CONSUMED_PROPS[node.type]) {
    return KNOWN_PARTIAL_TYPES.has(node.type)
      ? `PARTIAL_MAPPING:${node.type}`
      : `UNMAPPED_COMPONENT:${node.type}`;
  }
  const unknown = Object.keys(node.props ?? {}).filter(
    (key) => !CONSUMED_PROPS[node.type]!.includes(key) && !IGNORED_PROPS.has(key)
  );
  if (unknown.length > 0) return `UNMAPPED_PROP:${unknown.join(",")}`;
  return undefined;
}

export function buildCoverage(spec: PageSpec, plan: FigmaPlan): FigmaCoverage {
  const nodes: FigmaCoverageNode[] = [];
  const specIds = new Set<string>();

  walkSpec(spec.layout, "layout", (node, path) => {
    if (node.id) specIds.add(node.id);
    const skipped = skipReason(node, spec.defaultView);
    if (skipped) {
      nodes.push({
        specId: node.id ?? `${spec.meta.pageId}.${path}`,
        specType: node.type,
        path,
        status: "skipped",
        reason: skipped,
      });
      return;
    }
    const reason = degradeReason(node);
    if (reason === "SPEC_NODE_ID_MISSING") {
      nodes.push({
        specId: `${spec.meta.pageId}.${path}`,
        specType: node.type,
        path,
        status: "unmapped",
        reason,
      });
      return;
    }
    if (reason?.startsWith("UNMAPPED_COMPONENT")) {
      nodes.push({ specId: node.id!, specType: node.type, path, status: "unmapped", reason });
      return;
    }
    if (reason) {
      nodes.push({ specId: node.id!, specType: node.type, path, status: "degraded", reason });
      return;
    }
    nodes.push({ specId: node.id!, specType: node.type, path, status: "mapped" });
  });

  let derived = 0;
  walkPlan(plan.root, (node) => {
    if (!specIds.has(node.specId)) derived += 1;
  });

  return {
    nodes,
    summary: {
      spec: nodes.length,
      derived,
      mapped: nodes.filter((node) => node.status === "mapped").length,
      degraded: nodes.filter((node) => node.status === "degraded").length,
      unmapped: nodes.filter((node) => node.status === "unmapped").length,
      skipped: nodes.filter((node) => node.status === "skipped").length,
    },
  };
}

export function applyCoverage(plan: FigmaPlan, coverage: FigmaCoverage): void {
  const byId = new Map(coverage.nodes.map((node) => [node.specId, node]));
  walkPlan(plan.root, (node) => {
    const entry = byId.get(node.specId);
    if (entry === undefined) {
      node.origin = "derived";
      node.mapping = "mapped";
      return;
    }
    node.origin = "spec";
    node.mapping = entry.status === "skipped" ? "mapped" : entry.status;
    if (entry.reason !== undefined) node.reason = entry.reason;
  });
  plan.coverage = coverage;
}

export function coverageIndex(
  plans: FigmaPlan[],
  specRun: string,
  project: string
): Record<string, unknown> {
  return {
    schemaVersion: "1.0",
    project,
    specRun,
    pages: plans.map((plan) => ({
      pageId: plan.pageId,
      file: `figma-plan.${plan.pageId}.json`,
      summary: plan.coverage?.summary,
      nodes: plan.coverage?.nodes ?? [],
    })),
  };
}
```

- [ ] **Step 4: Wire coverage into `compile-plan.ts`**

In `core/figma/src/compile-plan.ts`:

1. Delete the local `shouldSkip` function; import `skipReason, buildCoverage, applyCoverage` from `./coverage.js`.
2. In `renderNode`, replace `if (shouldSkip(node, ctx)) return null;` with:

```ts
if (skipReason(node, ctx.defaultView)) return null;
```

3. Replace the `default` branch with an explicit fail-closed fallback:

```ts
default: {
  const known = KNOWN_PARTIAL_TYPES.has(node.type);
  return frame(
    specId,
    known ? node.type : `Unmapped:${node.type}`,
    "VERTICAL",
    renderChildren(childrenOf(node), ctx, `${path}.children`),
    {
      gap: 0,
      ...(known
        ? { mapping: "degraded" as const, reason: `PARTIAL_MAPPING:${node.type}` }
        : { mapping: "unmapped" as const, reason: `UNMAPPED_COMPONENT:${node.type}` }),
    }
  );
}
```

4. Import `KNOWN_PARTIAL_TYPES`.
5. At the end of `compileFigmaPlan` (before returning the plan), call:

```ts
const plan: FigmaPlan = { ... };
const coverage = buildCoverage(page, plan);
applyCoverage(plan, coverage);
return plan;
```

- [ ] **Step 5: Export the module**

In `core/figma/src/index.ts` add:

```ts
export * from "./coverage.js";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
pnpm exec vitest run core/figma/tests/coverage.test.ts core/figma/tests/plan.test.ts
```
Expected: PASS. If a phase2 page reports `degraded > 0`, add the missing prop key to `CONSUMED_PROPS` for that type; do not add it to `IGNORED_PROPS` unless it is genuinely semantic.

- [ ] **Step 7: Commit**

```bash
git add core/figma/src/coverage.ts core/figma/src/compile-plan.ts core/figma/src/index.ts core/figma/tests/coverage.test.ts
git commit -m "feat(figma): fail closed with plan coverage"
```

---

### Task 4: Make coverage a verify blocker and write `plan-coverage.json`

**Files:**
- Modify: `pipeline/core/figma/src/diff.ts`
- Modify: `pipeline/runtimes/standalone/src/figma-cli.ts`
- Test: `pipeline/core/figma/tests/diff.test.ts`

**Interfaces:**
- Consumes: `FigmaPlan.coverage`
- Produces: findings `COVERAGE_MISSING`, `UNMAPPED_COMPONENT`, `UNMAPPED_STYLE`, `UNMAPPED_PROP`; `figma:plan` writes `plan-coverage.json` via `coverageIndex`.

- [ ] **Step 1: Write the failing tests**

Add to `core/figma/tests/diff.test.ts`:

```ts
it("fails when coverage is missing", () => {
  const plan = structuredClone(plans[0]!);
  delete plan.coverage;
  const readback = readbackFromPlan(plan);
  const diff = diffFigma(plan, readback);
  expect(diff.passed).toBe(false);
  expect(diff.findings.some((finding) => finding.code === "COVERAGE_MISSING")).toBe(true);
});

it("fails on an unmapped node and reports the spec id", () => {
  const plan = structuredClone(plans[0]!);
  plan.coverage!.summary.unmapped += 1;
  plan.coverage!.nodes.push({
    specId: "today.chart",
    specType: "Chart",
    path: "layout.children[0]",
    status: "unmapped",
    reason: "UNMAPPED_COMPONENT:Chart",
  });
  const diff = diffFigma(plan, readbackFromPlan(plan));
  expect(diff.passed).toBe(false);
  expect(
    diff.findings.some(
      (finding) => finding.code === "UNMAPPED_COMPONENT" && finding.specId === "today.chart"
    )
  ).toBe(true);
});

it("reports degraded nodes as major", () => {
  const plan = structuredClone(plans[0]!);
  plan.coverage!.summary.degraded += 1;
  plan.coverage!.nodes.push({
    specId: "today.card.appointments",
    specType: "Card",
    path: "layout.slots.content[0]",
    status: "degraded",
    reason: "UNMAPPED_PROP:mystery",
  });
  const diff = diffFigma(plan, readbackFromPlan(plan));
  expect(diff.findings.some((finding) => finding.code === "UNMAPPED_PROP")).toBe(true);
  expect(diff.majorCount).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm exec vitest run core/figma/tests/diff.test.ts
```
Expected: FAIL because `diffFigma` ignores coverage.

- [ ] **Step 3: Add coverage checks to `diffFigma`**

At the start of `diffFigma` (before the tree diff), add:

```ts
if (plan.coverage === undefined) {
  findings.push({
    code: "COVERAGE_MISSING",
    severity: "blocker",
    message: "Plan has no coverage report; regenerate with figma:plan.",
  });
} else {
  for (const node of plan.coverage.nodes) {
    if (node.status === "unmapped") {
      findings.push({
        code: node.reason?.startsWith("SPEC_NODE_ID_MISSING")
          ? "SPEC_NODE_ID_MISSING"
          : "UNMAPPED_COMPONENT",
        severity: "blocker",
        specId: node.specId,
        message: `${node.specType} at ${node.path}: ${node.reason ?? "unmapped"}`,
      });
    } else if (node.status === "degraded") {
      findings.push({
        code: node.reason?.startsWith("UNMAPPED_PROP") ? "UNMAPPED_PROP" : "UNMAPPED_STYLE",
        severity: "major",
        specId: node.specId,
        message: `${node.specType} at ${node.path}: ${node.reason ?? "degraded"}`,
      });
    }
  }
}
```

Recompute `majorCount` / `blockerCount` after adding findings, following the existing helper in `diff.ts`.

- [ ] **Step 4: Write `plan-coverage.json` in the CLI**

In `runtimes/standalone/src/figma-cli.ts`:

- Import `coverageIndex` from `@prd-ui/figma`.
- After writing the plan index, write:

```ts
await writeFile(
  path.join(options.out, "plan-coverage.json"),
  pretty(
    coverageIndex(
      plans,
      options.specRun,
      specs[0]?.meta.project ?? "unknown"
    )
  ),
  "utf8"
);
```

- Include `coverage: plans.reduce(...)` in the JSON summary:

```ts
const coverage = {
  mapped: plans.reduce((sum, plan) => sum + (plan.coverage?.summary.mapped ?? 0), 0),
  degraded: plans.reduce((sum, plan) => sum + (plan.coverage?.summary.degraded ?? 0), 0),
  unmapped: plans.reduce((sum, plan) => sum + (plan.coverage?.summary.unmapped ?? 0), 0),
  skipped: plans.reduce((sum, plan) => sum + (plan.coverage?.summary.skipped ?? 0), 0),
};
console.log(JSON.stringify({ plans: plans.length, out: options.out, coverage }, null, 2));
```

- [ ] **Step 5: Run the tests and a plan smoke**

Run:
```bash
pnpm exec vitest run core/figma/tests/diff.test.ts
pnpm figma:plan --spec-run artifacts/employee-app-phase2/figma/spec-source --out /tmp/figma-v07-plans
```
Expected: tests PASS; `figma:plan` prints 8 plans and coverage with `unmapped: 0`, `degraded: 0`; `/tmp/figma-v07-plans/plan-coverage.json` exists.

- [ ] **Step 6: Commit**

```bash
git add core/figma/src/diff.ts core/figma/tests/diff.test.ts runtimes/standalone/src/figma-cli.ts
git commit -m "feat(figma): fail verify on coverage gaps and write plan coverage"
```

---

### Task 5: Implement the pure conformance comparator

**Files:**
- Create: `pipeline/core/contracts/src/conformance.ts`
- Modify: `pipeline/core/contracts/src/index.ts`
- Create: `pipeline/core/figma/src/conformance.ts`
- Modify: `pipeline/core/figma/src/index.ts`
- Test: `pipeline/core/figma/tests/conformance.test.ts`

**Interfaces:**
- Consumes: `FigmaPlan`, `StyleManifest`, `Profile`
- Produces:
  - `StyleManifest`, `StyleNode`, `ConformanceReport`, `ConformancePage`
  - `comparePlanToStyleManifest(input: { plan: FigmaPlan; manifest: StyleManifest; profile: Profile }): ConformancePage`

- [ ] **Step 1: Write the failing tests**

Create `core/figma/tests/conformance.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  UiBriefSchema,
  isMaterialDerivedId,
  type FigmaPlan,
  type FigmaPlanNode,
  type StyleManifest,
  type StyleNode,
} from "@prd-ui/contracts";
import { compileProject } from "@prd-ui/compiler";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { comparePlanToStyleManifest, compileFigmaPlans } from "../src/index.js";

const brief = UiBriefSchema.parse(
  JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
const plans = compileFigmaPlans(
  specs,
  (page) => getProfile(page.meta.profile),
  (page) => getCatalog(page.meta.profile)
);

function visibleIds(plan: FigmaPlan): string[] {
  const ids = plan.coverage!.nodes
    .filter((node) => node.status !== "skipped")
    .map((node) => node.specId);
  const walk = (node: FigmaPlanNode): void => {
    if (node.origin === "derived" && isMaterialDerivedId(node.specId)) ids.push(node.specId);
    if (node.child) walk(node.child);
    for (const child of node.children ?? []) walk(child);
  };
  walk(plan.root);
  return [...new Set(ids)];
}

function manifestFor(plan: FigmaPlan): StyleManifest {
  return {
    schemaVersion: "1.0",
    pageId: plan.pageId,
    viewport: { width: 390, height: 844 },
    capturedAt: "2026-10-26T00:00:00.000Z",
    nodes: visibleIds(plan)
      .map((specId) => ({
        specId,
        tag: "div",
        text: "",
        rect: { width: 100, height: 40 },
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        gap: { row: 0, column: 0 },
        border: {
          top: { width: 0, color: "rgba(0,0,0,0)" },
          right: { width: 0, color: "rgba(0,0,0,0)" },
          bottom: { width: 0, color: "rgba(0,0,0,0)" },
          left: { width: 0, color: "rgba(0,0,0,0)" },
        },
        radius: 0,
        background: { color: "rgba(0,0,0,0)", alpha: 0 },
        font: { family: "Noto Sans SC", size: 14, weight: 400, color: "#111827", lineHeight: 20 },
      })),
  };
}

function plainStyle(specId: string): StyleNode {
  return {
    specId,
    tag: "div",
    text: "",
    rect: { width: 100, height: 40 },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    gap: { row: 0, column: 0 },
    border: {
      top: { width: 0, color: "rgba(0,0,0,0)" },
      right: { width: 0, color: "rgba(0,0,0,0)" },
      bottom: { width: 0, color: "rgba(0,0,0,0)" },
      left: { width: 0, color: "rgba(0,0,0,0)" },
    },
    radius: 0,
    background: { color: "rgba(0,0,0,0)", alpha: 0 },
    font: { family: "Noto Sans SC", size: 14, weight: 400, color: "#111827", lineHeight: 20 },
  };
}

describe("comparePlanToStyleManifest", () => {
  it("passes a minimal plan with matching defaults", () => {
    const plan: FigmaPlan = {
      schemaVersion: "1.0",
      project: "fixture",
      pageId: "fixture",
      pageName: "Fixture",
      width: 390,
      height: 844,
      background: "color/surface/default",
      tokens: { "color/surface/default": "#FFFFFF" },
      textStyles: {},
      components: { Button: { variants: {} } },
      root: {
        specId: "fixture.root",
        type: "FRAME",
        name: "Root",
        layoutMode: "VERTICAL",
        children: [],
        origin: "spec",
        mapping: "mapped",
      },
      coverage: {
        nodes: [
          { specId: "fixture.root", specType: "MobileShell", path: "layout", status: "mapped" },
        ],
        summary: { spec: 1, derived: 0, mapped: 1, degraded: 0, unmapped: 0, skipped: 0 },
      },
      stats: { frames: 1, texts: 0, instances: 0, icons: 0, images: 0 },
    };
    const page = comparePlanToStyleManifest({
      plan,
      manifest: {
        schemaVersion: "1.0",
        pageId: "fixture",
        viewport: { width: 390, height: 844 },
        capturedAt: "2026-10-26T00:00:00.000Z",
        nodes: [plainStyle("fixture.root")],
      },
      profile: getProfile("b-mobile"),
    });
    expect(page.findings.filter((finding) => finding.severity === "blocker")).toHaveLength(0);
  });

  it("fails when a declared bottom border is missing in the plan", () => {
    const plan = plans.find((entry) => entry.pageId === "today")!;
    const manifest = manifestFor(plan);
    const target = manifest.nodes.find(
      (node) => node.specId === "today.card.appointments"
    )!;
    target.border.bottom = { width: 1, color: "rgb(226, 232, 240)" };
    const page = comparePlanToStyleManifest({
      plan,
      manifest,
      profile: getProfile("b-mobile"),
    });
    expect(
      page.findings.some(
        (finding) =>
          finding.code === "CONFORMANCE_STYLE_MISMATCH" &&
          finding.property === "borderBottom"
      )
    ).toBe(true);
  });

  it("normalizes token colors against rgb()", () => {
    const plan = plans.find((entry) => entry.pageId === "today")!;
    const manifest = manifestFor(plan);
    const root = manifest.nodes.find((node) => node.specId === plan.root.specId)!;
    root.background = { color: "rgb(255, 255, 255)", alpha: 1 };
    const page = comparePlanToStyleManifest({
      plan,
      manifest,
      profile: getProfile("b-mobile"),
    });
    expect(
      page.findings.some(
        (finding) => finding.property === "background" && finding.severity === "blocker"
      )
    ).toBe(false);
  });

  it("fails on a button height mismatch", () => {
    const plan = plans.find((entry) => entry.pageId === "appointment-form")!;
    const manifest = manifestFor(plan);
    const button = manifest.nodes.find((node) => node.specId.includes("submit"))!;
    button.rect.height = 44;
    const page = comparePlanToStyleManifest({
      plan,
      manifest,
      profile: getProfile("b-mobile"),
    });
    expect(
      page.findings.some(
        (finding) =>
          finding.code === "CONFORMANCE_STYLE_MISMATCH" &&
          finding.property === "height"
      )
    ).toBe(true);
  });
});
```

The exact spec ids in the test must use the real phase2 ids (`today.card.appointments`, the form submit button id). If the id differs, read them from the compiled plan and use the actual id; do not weaken the assertion.

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm exec vitest run core/figma/tests/conformance.test.ts
```
Expected: FAIL because the comparator and contracts do not exist.

- [ ] **Step 3: Add conformance contracts**

Create `core/contracts/src/conformance.ts`:

```ts
export interface StyleBorderSide {
  width: number;
  color: string;
}

export interface StyleNode {
  specId: string;
  tag: string;
  text?: string;
  rect: { width: number; height: number };
  padding: { top: number; right: number; bottom: number; left: number };
  gap: { row: number; column: number };
  border: {
    top: StyleBorderSide;
    right: StyleBorderSide;
    bottom: StyleBorderSide;
    left: StyleBorderSide;
  };
  radius: number;
  background: { color: string; alpha: number };
  font: {
    family: string;
    size: number;
    weight: number;
    color: string;
    lineHeight: number;
  };
}

export interface StyleManifest {
  schemaVersion: "1.0";
  pageId: string;
  viewport: { width: number; height: number };
  capturedAt: string;
  nodes: StyleNode[];
}

export interface ConformanceFinding {
  code:
    | "CONFORMANCE_STYLE_MISMATCH"
    | "CONFORMANCE_NODE_MISSING"
    | "CONFORMANCE_EXTRA_NODE"
    | "CONFORMANCE_TEXT_MISMATCH";
  severity: "blocker" | "major" | "minor";
  specId?: string;
  property?: string;
  expected?: string;
  actual?: string;
  tolerance?: number;
  message: string;
}

export interface ConformancePage {
  pageId: string;
  passed: boolean;
  checked: number;
  skipped: number;
  findings: ConformanceFinding[];
}

export interface ConformanceReport {
  schemaVersion: "1.0";
  project: string;
  generatedAt: string;
  pages: ConformancePage[];
  summary: { blockers: number; majors: number; pages: number };
}
```

Export from `core/contracts/src/index.ts`:

```ts
export * from "./conformance.js";
```

- [ ] **Step 4: Implement the comparator**

Create `core/figma/src/conformance.ts` with these exported functions and behavior:

```ts
import type {
  ConformanceFinding,
  ConformancePage,
  FigmaPlan,
  FigmaPlanNode,
  Profile,
  StyleManifest,
  StyleNode,
} from "@prd-ui/contracts";
import { isMaterialDerivedId } from "@prd-ui/contracts";

interface Rgba { r: number; g: number; b: number; a: number }

export function parseCssColor(value: string): Rgba | undefined {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value.trim());
  if (hex?.[1]) {
    const raw = hex[1];
    if (raw.length === 3 || raw.length === 4) {
      const [r, g, b, a = "f"] = raw.split("");
      return {
        r: parseInt(`${r}${r}`, 16),
        g: parseInt(`${g}${g}`, 16),
        b: parseInt(`${b}${b}`, 16),
        a: parseInt(`${a}${a}`, 16) / 255,
      };
    }
    if (raw.length === 6 || raw.length === 8) {
      return {
        r: parseInt(raw.slice(0, 2), 16),
        g: parseInt(raw.slice(2, 4), 16),
        b: parseInt(raw.slice(4, 6), 16),
        a: raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1,
      };
    }
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (rgb?.[1]) {
    const parts = rgb[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
      return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: parts[3] ?? 1 };
    }
  }
  return undefined;
}

export function sameColor(left: string, right: string, tolerance = 0): boolean {
  const a = parseCssColor(left);
  const b = parseCssColor(right);
  if (!a || !b) return left.trim() === right.trim();
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance &&
    Math.abs(a.a - b.a) <= 0.01
  );
}

function resolveToken(plan: FigmaPlan, value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return plan.tokens[value] ?? value;
}

function expectedFont(plan: FigmaPlan, node: FigmaPlanNode) {
  const style = node.textStyle ? plan.textStyles[node.textStyle] : undefined;
  const color = resolveToken(plan, node.color);
  return style === undefined
    ? undefined
    : { size: style.fontSize, weight: style.fontWeight, lineHeight: style.lineHeight, color };
}

function pushMismatch(
  findings: ConformanceFinding[],
  node: FigmaPlanNode,
  property: string,
  expected: string | number,
  actual: string | number,
  message: string,
  tolerance?: number
): void {
  findings.push({
    code: "CONFORMANCE_STYLE_MISMATCH",
    severity: "blocker",
    specId: node.specId,
    property,
    expected: String(expected),
    actual: String(actual),
    ...(tolerance === undefined ? {} : { tolerance }),
    message,
  });
}

function compareNumber(
  findings: ConformanceFinding[],
  node: FigmaPlanNode,
  property: string,
  expected: number,
  actual: number,
  tolerance = 0
): void {
  if (Math.abs(expected - actual) > tolerance) {
    pushMismatch(findings, node, property, expected, actual, `${property} expected ${expected}, got ${actual}`, tolerance);
  }
}

function compareColor(
  findings: ConformanceFinding[],
  node: FigmaPlanNode,
  property: string,
  expected: string,
  actual: string
): void {
  if (!sameColor(expected, actual)) {
    pushMismatch(findings, node, property, expected, actual, `${property} color mismatch`);
  }
}

function compareNode(
  plan: FigmaPlan,
  node: FigmaPlanNode,
  style: StyleNode,
  findings: ConformanceFinding[]
): void {
  if (node.type === "TEXT") {
    const font = expectedFont(plan, node);
    if (font) {
      compareNumber(findings, node, "fontSize", font.size, style.font.size);
      compareNumber(findings, node, "fontWeight", font.weight, style.font.weight);
      compareNumber(findings, node, "lineHeight", font.lineHeight, style.font.lineHeight);
      if (font.color) compareColor(findings, node, "textColor", font.color, style.font.color);
    }
    if (node.characters !== undefined && style.text !== undefined && node.characters.trim() !== style.text) {
      findings.push({
        code: "CONFORMANCE_TEXT_MISMATCH",
        severity: "major",
        specId: node.specId,
        expected: node.characters,
        actual: style.text,
        message: "Text content differs from the plan.",
      });
    }
    return;
  }

  if (node.type === "INSTANCE") {
    const variant = plan.components.Button.variants[node.variant ?? ""];
    if (variant) {
      if (variant.height !== undefined) compareNumber(findings, node, "height", variant.height, style.rect.height);
      if (variant.radius !== undefined) compareNumber(findings, node, "radius", variant.radius, style.radius);
      if (variant.paddingX !== undefined) compareNumber(findings, node, "paddingLeft", variant.paddingX, style.padding.left);
      if (variant.fill) compareColor(findings, node, "background", resolveToken(plan, variant.fill)!, style.background.color);
      if (variant.stroke) compareColor(findings, node, "borderTop", resolveToken(plan, variant.stroke)!, style.border.top.color);
      const font = variant.labelTextStyle ? plan.textStyles[variant.labelTextStyle] : undefined;
      if (font) {
        compareNumber(findings, node, "fontSize", font.fontSize, style.font.size);
        compareNumber(findings, node, "fontWeight", font.fontWeight, style.font.weight);
      }
      if (variant.text) compareColor(findings, node, "textColor", resolveToken(plan, variant.text)!, style.font.color);
      if (node.label !== undefined && style.text !== undefined && node.label.trim() !== style.text) {
        findings.push({
          code: "CONFORMANCE_TEXT_MISMATCH",
          severity: "major",
          specId: node.specId,
          expected: node.label,
          actual: style.text,
          message: "Button label differs from the plan.",
        });
      }
    }
    return;
  }

  if (node.type === "GLYPH") {
    if (node.size !== undefined) compareNumber(findings, node, "fontSize", node.size, style.font.size);
    if (node.color) compareColor(findings, node, "textColor", resolveToken(plan, node.color)!, style.font.color);
    return;
  }

  const padding = {
    top: node.padding ?? node.paddingY ?? 0,
    right: node.padding ?? node.paddingX ?? 0,
    bottom: node.padding ?? node.paddingY ?? 0,
    left: node.padding ?? node.paddingX ?? 0,
  };
  compareNumber(findings, node, "paddingTop", padding.top, style.padding.top);
  compareNumber(findings, node, "paddingRight", padding.right, style.padding.right);
  compareNumber(findings, node, "paddingBottom", padding.bottom, style.padding.bottom);
  compareNumber(findings, node, "paddingLeft", padding.left, style.padding.left);
  if (node.layoutMode !== "NONE") {
    compareNumber(findings, node, "gap", node.gap ?? 0, style.gap.row);
  }
  compareNumber(findings, node, "radius", node.radius ?? 0, style.radius);

  const border = [
    ["borderTop", node.borderTop ?? node.stroke, node.borderTopWidth ?? node.strokeWidth, style.border.top],
    ["borderBottom", node.borderBottom ?? node.stroke, node.borderBottomWidth ?? node.strokeWidth, style.border.bottom],
    ["borderLeft", node.borderLeft ?? node.stroke, node.borderLeftWidth ?? node.strokeWidth, style.border.left],
    ["borderRight", node.stroke, node.strokeWidth, style.border.right],
  ] as const;
  for (const [property, token, width, actual] of border) {
    const expectedWidth = width ?? (token === undefined ? 0 : 1);
    compareNumber(findings, node, `${property}Width`, expectedWidth, actual.width);
    if (token !== undefined && expectedWidth > 0) {
      compareColor(findings, node, property, resolveToken(plan, token)!, actual.color);
    }
  }

  const fill = resolveToken(plan, node.fill);
  const expectedAlpha = node.fillAlpha ?? (fill === undefined ? 0 : 1);
  if (fill !== undefined) {
    compareColor(findings, node, "background", fill, style.background.color);
    compareNumber(findings, node, "backgroundAlpha", expectedAlpha, style.background.alpha, 0.01);
  } else if (style.background.alpha > 0.01) {
    pushMismatch(findings, node, "background", "transparent", style.background.color, "Unexpected background fill");
  }

  if (node.width !== undefined) compareNumber(findings, node, "width", node.width, style.rect.width, 1);
  if (node.height !== undefined) compareNumber(findings, node, "height", node.height, style.rect.height, 1);
}

export function comparePlanToStyleManifest(input: {
  plan: FigmaPlan;
  manifest: StyleManifest;
  profile: Profile;
}): ConformancePage {
  const { plan, manifest } = input;
  const findings: ConformanceFinding[] = [];
  const styles = new Map(manifest.nodes.map((node) => [node.specId, node]));
  const seen = new Set<string>();
  const skipped = new Set(
    (plan.coverage?.nodes ?? [])
      .filter((node) => node.status === "skipped")
      .map((node) => node.specId)
  );

  const walk = (node: FigmaPlanNode): void => {
    if (node.type === "ABSOLUTE") {
      const style = styles.get(node.specId);
      if (style && node.child) {
        seen.add(node.specId);
        compareNode(plan, { ...node.child, specId: node.specId }, style, findings);
      } else if (
        node.origin === "derived" &&
        isMaterialDerivedId(node.specId) &&
        !skipped.has(node.specId)
      ) {
        findings.push({
          code: "CONFORMANCE_NODE_MISSING",
          severity: "blocker",
          specId: node.specId,
          message: `Absolute node ${node.name} has no HTML counterpart.`,
        });
      }
      for (const child of node.child?.children ?? []) walk(child);
      return;
    }
    const style = styles.get(node.specId);
    const visible = node.origin !== "derived" || isMaterialDerivedId(node.specId);
    if (style) {
      seen.add(node.specId);
      compareNode(plan, node, style, findings);
    } else if (visible && !skipped.has(node.specId)) {
      findings.push({
        code: "CONFORMANCE_NODE_MISSING",
        severity: "blocker",
        specId: node.specId,
        message: `Plan node ${node.name} has no HTML counterpart.`,
      });
    }
    if (node.child) walk(node.child);
    for (const child of node.children ?? []) walk(child);
  };
  walk(plan.root);

  for (const style of manifest.nodes) {
    if (!seen.has(style.specId)) {
      findings.push({
        code: "CONFORMANCE_EXTRA_NODE",
        severity: "blocker",
        specId: style.specId,
        message: "HTML node is not present in the plan.",
      });
    }
  }

  return {
    pageId: plan.pageId,
    passed: findings.every((finding) => finding.severity !== "blocker"),
    checked: seen.size,
    skipped: skipped.size,
    findings,
  };
}
```

Export from `core/figma/src/index.ts`:

```ts
export * from "./conformance.js";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
pnpm exec vitest run core/figma/tests/conformance.test.ts
```
Expected: PASS. The empty-styled manifest may surface real mismatches (radius/padding defaults); fix the manifest fixture to reflect plan defaults rather than weakening the comparator.

- [ ] **Step 6: Commit**

```bash
git add core/contracts/src/conformance.ts core/contracts/src/index.ts core/figma/src/conformance.ts core/figma/src/index.ts core/figma/tests/conformance.test.ts
git commit -m "feat(figma): compare plan styles against html computed styles"
```

---

### Task 6: Add the `figma:conformance` CLI

**Files:**
- Create: `pipeline/runtimes/standalone/src/conformance/capture.ts`
- Create: `pipeline/runtimes/standalone/src/figma-conformance-cli.ts`
- Modify: `pipeline/package.json`
- Test: `pipeline/runtimes/standalone/tests/figma-conformance-cli.test.ts`

**Interfaces:**
- Consumes: `comparePlanToStyleManifest`, `StyleManifest`
- Produces: `captureStyleManifests(input): Promise<StyleManifest[]>`, CLI `main(argv, io): Promise<number>`

- [ ] **Step 1: Write the failing test**

Create `runtimes/standalone/tests/figma-conformance-cli.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/figma-conformance-cli.js";

describe("figma:conformance args", () => {
  it("parses the required paths", () => {
    const options = parseArgs([
      "--spec-run", "/tmp/spec",
      "--html", "/tmp/html",
      "--plans", "/tmp/plans",
      "--out", "/tmp/out",
    ]);
    expect(options.specRun).toBe("/tmp/spec");
    expect(options.html).toBe("/tmp/html");
    expect(options.plans).toBe("/tmp/plans");
    expect(options.out).toBe("/tmp/out");
  });

  it("rejects an unknown flag", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm exec vitest run runtimes/standalone/tests/figma-conformance-cli.test.ts
```
Expected: FAIL because the CLI does not exist.

- [ ] **Step 3: Implement Playwright capture**

Create `runtimes/standalone/src/conformance/capture.ts`. Reuse `createStaticServer`, `DETERMINISTIC_CSS`, `FIXED_SCREENSHOT_TIME`, and `SCREENSHOT_TIMEZONE` from `../visual/screenshot.js`.

```ts
import { chromium } from "playwright";
import {
  DETERMINISTIC_CSS,
  FIXED_SCREENSHOT_TIME,
  SCREENSHOT_TIMEZONE,
  createStaticServer,
} from "../visual/screenshot.js";
import type { StyleManifest, StyleNode } from "@prd-ui/contracts";

export interface CaptureStyleInput {
  htmlDir: string;
  pages: Array<{ pageId: string; viewport: { width: number; height: number } }>;
}

export async function captureStyleManifests(
  input: CaptureStyleInput
): Promise<StyleManifest[]> {
  const server = await createStaticServer(input.htmlDir);
  const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--disable-lcd-text"] });
  try {
    const out: StyleManifest[] = [];
    for (const page of input.pages) {
      const context = await browser.newContext({
        viewport: page.viewport,
        deviceScaleFactor: 1,
        timezoneId: SCREENSHOT_TIMEZONE,
        reducedMotion: "reduce",
      });
      const tab = await context.newPage();
      await tab.addInitScript(`
        {
          const RealDate = Date;
          const fixed = "${FIXED_SCREENSHOT_TIME}";
          class FixedDate extends RealDate {
            constructor(...args) { super(...(args.length === 0 ? [fixed] : args)); }
            static now() { return new RealDate(fixed).getTime(); }
          }
          globalThis.Date = FixedDate;
        }
      `);
      await tab.goto(`${server.url}/${page.pageId}.html`, { waitUntil: "networkidle" });
      await tab.evaluate(() => document.fonts.ready);
      await tab.addStyleTag({ content: DETERMINISTIC_CSS });
      const nodes = await tab.evaluate((): StyleNode[] => {
        return [...document.querySelectorAll<HTMLElement>("[data-node-id]")].map((el) => {
          const cs = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const px = (value: string): number => Number.parseFloat(value) || 0;
          const side = (prop: string): { width: number; color: string } => ({
            width: px(cs.getPropertyValue(prop)),
            color: cs.getPropertyValue(prop.replace("width", "color")).trim(),
          });
          return {
            specId: el.dataset.nodeId ?? "",
            tag: el.tagName.toLowerCase(),
            text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 300),
            rect: { width: Math.round(rect.width), height: Math.round(rect.height) },
            padding: {
              top: px(cs.paddingTop),
              right: px(cs.paddingRight),
              bottom: px(cs.paddingBottom),
              left: px(cs.paddingLeft),
            },
            gap: { row: px(cs.rowGap), column: px(cs.columnGap) },
            border: {
              top: { width: px(cs.borderTopWidth), color: cs.borderTopColor },
              right: { width: px(cs.borderRightWidth), color: cs.borderRightColor },
              bottom: { width: px(cs.borderBottomWidth), color: cs.borderBottomColor },
              left: { width: px(cs.borderLeftWidth), color: cs.borderLeftColor },
            },
            radius: px(cs.borderTopLeftRadius),
            background: {
              color: cs.backgroundColor,
              alpha: (() => {
                const match = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
                const parts = match?.[1]?.split(",").map((part) => Number.parseFloat(part.trim())) ?? [];
                return parts.length >= 4 ? parts[3]! : parts.length >= 3 ? 1 : 0;
              })(),
            },
            font: {
              family: cs.fontFamily,
              size: px(cs.fontSize),
              weight: Number.parseInt(cs.fontWeight, 10) || 400,
              color: cs.color,
              lineHeight: cs.lineHeight === "normal" ? 0 : px(cs.lineHeight),
            },
          };
        });
      });
      await context.close();
      out.push({
        schemaVersion: "1.0",
        pageId: page.pageId,
        viewport: page.viewport,
        capturedAt: FIXED_SCREENSHOT_TIME,
        nodes: nodes.filter((node) => node.specId !== ""),
      });
    }
    return out;
  } finally {
    await browser.close();
    await server.close();
  }
}
```

- [ ] **Step 4: Implement the CLI**

Create `runtimes/standalone/src/figma-conformance-cli.ts`:

```ts
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  FigmaPlanSchema,
  PageSpecSchema,
  type ConformanceReport,
  type FigmaPlan,
  type PageSpec,
} from "@prd-ui/contracts";
import { comparePlanToStyleManifest } from "@prd-ui/figma";
import { getProfile } from "@prd-ui/design-system";
import { captureStyleManifests } from "./conformance/capture.js";

export class ConformanceUsageError extends Error {}

export interface ConformanceOptions {
  specRun?: string;
  html?: string;
  plans?: string;
  out?: string;
  json: boolean;
  help: boolean;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new ConformanceUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): ConformanceOptions {
  const options: ConformanceOptions = { json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    switch (flag) {
      case "--spec-run": options.specRun = path.resolve(readValue(argv, ++index, flag)); break;
      case "--html": options.html = path.resolve(readValue(argv, ++index, flag)); break;
      case "--plans": options.plans = path.resolve(readValue(argv, ++index, flag)); break;
      case "--out": options.out = path.resolve(readValue(argv, ++index, flag)); break;
      case "--json": options.json = true; break;
      case "--help":
      case "-h": options.help = true; break;
      default: throw new ConformanceUsageError(`unknown argument: ${flag}`);
    }
  }
  return options;
}

async function loadSpecs(specRun: string): Promise<PageSpec[]> {
  const dir = path.join(specRun, "artifacts", "page-spec");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  return Promise.all(
    files.map(async (file) =>
      PageSpecSchema.parse(JSON.parse(await readFile(path.join(dir, file), "utf8")))
    )
  );
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  let options: ConformanceOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (options.help) {
    io.stdout("Usage: pnpm figma:conformance --spec-run <dir> --html <dir> --plans <dir> --out <dir> [--json]");
    return 0;
  }
  if (!options.specRun || !options.html || !options.plans || !options.out) {
    io.stderr("missing required --spec-run/--html/--plans/--out");
    return 2;
  }

  try {
    const specs = await loadSpecs(options.specRun);
    const plans: FigmaPlan[] = [];
    for (const spec of specs) {
      const file = path.join(options.plans, `figma-plan.${spec.meta.pageId}.json`);
      plans.push(FigmaPlanSchema.parse(JSON.parse(await readFile(file, "utf8"))));
    }
    const manifests = await captureStyleManifests({
      htmlDir: options.html,
      pages: specs.map((spec) => ({
        pageId: spec.meta.pageId,
        viewport:
          spec.meta.target === "web"
            ? { width: 1440, height: 900 }
            : { width: 390, height: 844 },
      })),
    });
    const manifestByPage = new Map(manifests.map((manifest) => [manifest.pageId, manifest]));
    const pages = plans.map((plan) =>
      comparePlanToStyleManifest({
        plan,
        manifest: manifestByPage.get(plan.pageId)!,
        profile: getProfile(plan.project === "" ? "b-mobile" : specs.find((spec) => spec.meta.pageId === plan.pageId)!.meta.profile),
      })
    );
    const report: ConformanceReport = {
      schemaVersion: "1.0",
      project: specs[0]?.meta.project ?? "unknown",
      generatedAt: new Date().toISOString(),
      pages,
      summary: {
        blockers: pages.reduce(
          (sum, page) => sum + page.findings.filter((finding) => finding.severity === "blocker").length,
          0
        ),
        majors: pages.reduce(
          (sum, page) => sum + page.findings.filter((finding) => finding.severity === "major").length,
          0
        ),
        pages: pages.length,
      },
    };
    await mkdir(options.out, { recursive: true });
    await writeFile(path.join(options.out, "style-manifest.json"), `${JSON.stringify({ schemaVersion: "1.0", project: report.project, pages: manifests }, null, 2)}\n`, "utf8");
    await writeFile(path.join(options.out, "conformance.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (options.json) {
      io.stdout(JSON.stringify(report));
    } else {
      for (const page of pages) {
        io.stdout(`Conformance ${page.pageId}: ${page.passed ? "passed" : "failed"} (${page.findings.length} findings)`);
        for (const finding of page.findings.slice(0, 8)) {
          io.stdout(`- [${finding.severity}] ${finding.code} ${finding.specId ?? ""}: ${finding.message}`);
        }
      }
    }
    return report.summary.blockers === 0 ? 0 : 1;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 2;
  }
}
```

Replace the awkward `getProfile(...)` expression with the spec's profile via a `specByPage` map:

```ts
const specByPage = new Map(specs.map((spec) => [spec.meta.pageId, spec]));
// ...
profile: getProfile(specByPage.get(plan.pageId)!.meta.profile),
```

- [ ] **Step 5: Add the script and run it**

Add to `pipeline/package.json` scripts:

```json
"figma:conformance": "tsx runtimes/standalone/src/figma-conformance-cli.ts",
```

Run:
```bash
pnpm exec vitest run runtimes/standalone/tests/figma-conformance-cli.test.ts
pnpm figma:conformance \
  --spec-run artifacts/employee-app-phase2/figma/spec-source \
  --html artifacts/employee-app-phase2/html \
  --plans artifacts/employee-app-phase2/figma/plans \
  --out /tmp/conformance-v07
```
Expected: test PASS; the CLI runs and writes `conformance.json` + `style-manifest.json`. On the checked-in v0.6 HTML/plans it may report real mismatches — record them; Batch 2 fixes them. The command itself must not crash.

- [ ] **Step 6: Commit**

```bash
git add runtimes/standalone/src/conformance/capture.ts runtimes/standalone/src/figma-conformance-cli.ts runtimes/standalone/tests/figma-conformance-cli.test.ts package.json
git commit -m "feat(figma): add conformance cli"
```

---

### Task 7: Add deterministic structure lint to spec:engineer

**Files:**
- Modify: `pipeline/core/contracts/src/project-config.ts`
- Add `StructureConfig` to `pipeline/core/contracts/src/structure.ts`
- Modify: `pipeline/core/validators/src/types.ts`
- Create: `pipeline/core/validators/src/structure.ts`
- Modify: `pipeline/core/validators/src/index.ts`
- Modify: `pipeline/runtimes/standalone/src/spec-cli.ts`
- Test: `pipeline/core/validators/tests/structure.test.ts`
- Test: `pipeline/runtimes/standalone/tests/spec-cli.test.ts`

**Interfaces:**
- Produces:
  - `StructureConfig { maxRepeatedSections: number; pageHeightBudget: { mobile: number; web: number } }`
  - `DEFAULT_STRUCTURE_CONFIG`
  - `validateStructure(spec: PageSpec, ctx: StructureContext): Finding[]`
  - `estimatePageHeight(spec: PageSpec, ctx: StructureContext): number`
- `StructureContext = Pick<ValidationContext, "profile" | "catalog" | "archetype"> & { structure?: Partial<StructureConfig> }`

- [ ] **Step 1: Write the failing tests**

Create `core/validators/tests/structure.test.ts`:

```ts
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
    spec.layout.slots = { content: [{ type: "Section", id: "today.section", slots: { optional: [] } }] };
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
    spec.layout.slots = { content: [section("today.s1"), section("today.s2"), section("today.s3")] };
    const findings = validateStructure(spec, context(spec));
    expect(findings.some((finding) => finding.ruleId === "STRUCTURE-REPEATED-SECTION")).toBe(true);
  });

  it("reports a page height over budget", () => {
    const spec = baseSpec();
    spec.layout.slots = {
      content: [
        {
          id: "today.list",
          type: "List",
          props: { items: Array.from({ length: 60 }, (_, index) => ({ label: `l${index}`, value: "v" })) },
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm exec vitest run core/validators/tests/structure.test.ts
```
Expected: FAIL because `validateStructure` does not exist.

- [ ] **Step 3: Implement structure config and lint**

Add to `core/contracts/src/project-config.ts`:

```ts
export interface ProjectStructureConfig {
  maxRepeatedSections?: number;
  pageHeightBudget?: { mobile?: number; web?: number };
}
```

Add to `ProjectConfig`:

```ts
  structure?: ProjectStructureConfig;
```

Add to `ProjectConfigSchema`:

```ts
    structure: z
      .object({
        maxRepeatedSections: z.number().int().positive().optional(),
        pageHeightBudget: z
          .object({ mobile: z.number().int().positive().optional(), web: z.number().int().positive().optional() })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
```

Create `core/contracts/src/structure.ts`:

```ts
import type { Finding } from "./findings.js";

export interface StructureConfig {
  maxRepeatedSections: number;
  pageHeightBudget: { mobile: number; web: number };
}

export const DEFAULT_STRUCTURE_CONFIG: StructureConfig = {
  maxRepeatedSections: 2,
  pageHeightBudget: { mobile: 2100, web: 2400 },
};

export interface StructureLintPage {
  pageId: string;
  estimatedHeight: number;
  budget: number;
  findings: Finding[];
}

export interface StructureLintReport {
  schemaVersion: "1.0";
  project: string;
  generatedAt: string;
  config: StructureConfig;
  pages: StructureLintPage[];
  summary: { warnings: number; blockers: number };
}
```

Export from `core/contracts/src/index.ts`.

Add `structure?: Partial<StructureConfig>` to `ValidationContext` in `core/validators/src/types.ts`.

Create `core/validators/src/structure.ts` with these helpers:

```ts
import type { Finding, PageSpec, SpecNode } from "@prd-ui/contracts";
import { DEFAULT_STRUCTURE_CONFIG, type StructureConfig } from "@prd-ui/contracts";
import type { ValidationContext } from "./types.js";

export type StructureContext = Pick<ValidationContext, "profile" | "catalog" | "archetype"> & {
  structure?: Partial<StructureConfig>;
};

function configFor(ctx: StructureContext): StructureConfig {
  return {
    maxRepeatedSections: ctx.structure?.maxRepeatedSections ?? DEFAULT_STRUCTURE_CONFIG.maxRepeatedSections,
    pageHeightBudget: {
      mobile: ctx.structure?.pageHeightBudget?.mobile ?? DEFAULT_STRUCTURE_CONFIG.pageHeightBudget.mobile,
      web: ctx.structure?.pageHeightBudget?.web ?? DEFAULT_STRUCTURE_CONFIG.pageHeightBudget.web,
    },
  };
}

function walk(node: SpecNode | undefined, visit: (node: SpecNode, path: string, parent?: SpecNode) => void, path = "layout", parent?: SpecNode): void {
  if (!node) return;
  visit(node, path, parent);
  (node.children ?? []).forEach((child, index) => walk(child, visit, `${path}.children[${index}]`, node));
  for (const [slot, nodes] of Object.entries(node.slots ?? {})) {
    nodes.forEach((child, index) => walk(child, visit, `${path}.slots.${slot}[${index}]`, node));
  }
}

const SPACING_KEYS = ["gap", "padding", "paddingX", "paddingY"] as const;

export function estimatePageHeight(spec: PageSpec, ctx: StructureContext): number {
  const base = spec.meta.target === "web" ? 900 : 844;
  let extra = 0;
  walk(spec.layout, (node) => {
    switch (node.type) {
      case "ListRow": extra += 64; break;
      case "Card": extra += 120; break;
      case "Section": extra += 24; break;
      case "CalendarGrid": extra += 36 + 44 * Math.max((node.props?.hours as unknown[] | undefined)?.length ?? 6, 1); break;
      case "DataTable": extra += 44 * Math.max((node.props?.rows as unknown[] | undefined)?.length ?? 3, 1); break;
      case "List": {
        const items = node.props?.items;
        if (Array.isArray(items)) extra += 40 * Math.max(items.length, 1);
        else extra += 40 * Math.min(Math.max(Number(items) || 3, 1), 6);
        break;
      }
      default: extra += 0;
    }
  });
  return base + extra;
}

export function validateStructure(spec: PageSpec, ctx: StructureContext): Finding[] {
  const config = configFor(ctx);
  const findings: Finding[] = [];
  const push = (ruleId: string, location: string, evidence: string, issue: string): void => {
    findings.push({ id: `${ruleId}-${findings.length + 1}`, ruleId, severity: "warning", category: "structure", location, evidence, issue });
  };

  const sectionSignatures = new Map<string, string[]>();
  const headingRoles: string[] = [];
  const siblingTypes = new Map<string, number>();

  walk(spec.layout, (node, path, parent) => {
    for (const [slot, nodes] of Object.entries(node.slots ?? {})) {
      if (nodes.length === 0 && !ctx.archetype.requiredSlots.includes(slot)) {
        push("STRUCTURE-EMPTY-SLOT", `${path}.slots.${slot}`, "[]", `Slot "${slot}" is empty.`);
      }
    }
    if (node.type === "Section") {
      const title = String(node.props?.title ?? "").trim();
      const signature = `${title}|${(node.children ?? []).map((child) => child.type).join(",")}`;
      const locations = sectionSignatures.get(signature) ?? [];
      locations.push(path);
      sectionSignatures.set(signature, locations);
    }
    if (node.type === "Text" && typeof node.props?.role === "string" && node.props.role.startsWith("heading.")) {
      headingRoles.push(node.props.role);
    }
    if (node.type === "Button" && parent?.type === "Section") {
      push("STRUCTURE-ORPHAN-ACTION", path, "Section > Button", "Button is not inside actions/filter-row/footer/card-actions.");
    }
    if (parent) {
      const key = `${parent.id ?? path}|${node.type}`;
      siblingTypes.set(key, (siblingTypes.get(key) ?? 0) + 1);
    }
    for (const key of SPACING_KEYS) {
      const value = node.props?.[key];
      if (typeof value === "string" && /^space[.-]/.test(value)) {
        const token = value.replace(/^space[.-]/, "");
        if (!(token in ctx.profile.space)) {
          push("STRUCTURE-SPACING-SCALE", `${path}.props.${key}`, value, `"${value}" is not in the profile space scale.`);
        }
      }
    }
  });

  for (const [signature, locations] of sectionSignatures) {
    if (locations.length > config.maxRepeatedSections) {
      push("STRUCTURE-REPEATED-SECTION", locations[0]!, signature, `Section signature repeats ${locations.length} times.`);
    }
  }

  const order = headingRoles.map((role) => Number(role.split(".")[1] ?? 0)).filter((level) => level > 0);
  for (let index = 1; index < order.length; index += 1) {
    if (order[index]! - order[index - 1]! > 1) {
      push("STRUCTURE-HEADING-SKIP", "layout", order.join(","), "Heading levels jump by more than one.");
      break;
    }
  }

  for (const [key, count] of siblingTypes) {
    if (key.endsWith("|ListRow") && count >= 3) {
      push("STRUCTURE-REPEATED-ROWS", key, String(count), `${count} sibling ListRow nodes are not expressed as a List.`);
    }
  }

  const estimatedHeight = estimatePageHeight(spec, ctx);
  const budget = config.pageHeightBudget[spec.meta.target];
  if (estimatedHeight > budget) {
    push("STRUCTURE-PAGE-HEIGHT", "layout", `${estimatedHeight} > ${budget}`, `Estimated page height ${estimatedHeight}px exceeds the ${budget}px budget.`);
  }

  return findings;
}
```

Export from `core/validators/src/index.ts`:

```ts
export * from "./structure.js";
```

- [ ] **Step 4: Wire the artifact into `spec:engineer`**

In `runtimes/standalone/src/spec-cli.ts`:

- Import `validateStructure` from `@prd-ui/validators`.
- After `if (result.gate.passed) { ... write page-spec ... }`, add:

```ts
const structureConfig = {
  maxRepeatedSections:
    config.structure?.maxRepeatedSections ??
    DEFAULT_STRUCTURE_CONFIG.maxRepeatedSections,
  pageHeightBudget: {
    mobile:
      config.structure?.pageHeightBudget?.mobile ??
      DEFAULT_STRUCTURE_CONFIG.pageHeightBudget.mobile,
    web:
      config.structure?.pageHeightBudget?.web ??
      DEFAULT_STRUCTURE_CONFIG.pageHeightBudget.web,
  },
};
const structurePages = result.specs.map((spec) => {
  const context = {
    profile: getProfile(spec.meta.profile),
    catalog: getCatalog(spec.meta.profile),
    archetype: getArchetype(spec.meta.archetype),
    structure: structureConfig,
  };
  return {
    pageId: spec.meta.pageId,
    estimatedHeight: estimatePageHeight(spec, context),
    budget: structureConfig.pageHeightBudget[spec.meta.target],
    findings: validateStructure(spec, context),
  };
});
await store.writeJson("findings/structure-lint.json", {
  schemaVersion: "1.0",
  project,
  generatedAt: new Date().toISOString(),
  config: structureConfig,
  pages: structurePages,
  summary: {
    warnings: structurePages.reduce((sum, page) => sum + page.findings.length, 0),
    blockers: 0,
  },
});
```

Import `DEFAULT_STRUCTURE_CONFIG` from `@prd-ui/contracts` and `estimatePageHeight` from `@prd-ui/validators`.

This artifact is always written when specs exist, even if the gate fails; structure lint is advisory in v0.7.

- [ ] **Step 5: Run tests and a spec smoke**

Run:
```bash
pnpm exec vitest run core/validators/tests/structure.test.ts runtimes/standalone/tests/spec-cli.test.ts
pnpm spec:engineer --project samples/projects/employee-app-phase2/project.yaml --agent-run /tmp/m1-final2/<runId> --runs /tmp/spec-v07
```
Expected: tests PASS; the spec run contains `findings/structure-lint.json` with 8 pages and warning findings. If the agent run path is unavailable, use any completed agent run from `samples/agents`-backed `agent:run`; the smoke command is not part of the unit test.

- [ ] **Step 6: Commit**

```bash
git add core/contracts/src/project-config.ts core/contracts/src/structure.ts core/contracts/src/index.ts core/validators/src/types.ts core/validators/src/structure.ts core/validators/src/index.ts core/validators/tests/structure.test.ts runtimes/standalone/src/spec-cli.ts runtimes/standalone/tests/spec-cli.test.ts
git commit -m "feat(validators): add deterministic structure lint"
```

---

## Batch 2 — Parity, readback styles, signing, measurement

### Task 8: Export PNGs from the Figma plugin and add `figma:serve`

**Files:**
- Modify: `pipeline/runtimes/figma/src/plugin.ts`
- Modify: `pipeline/runtimes/figma/src/ui.html`
- Create: `pipeline/runtimes/standalone/src/figma-serve-cli.ts`
- Modify: `pipeline/package.json`
- Test: `pipeline/runtimes/standalone/tests/figma-serve.test.ts`

**Interfaces:**
- Produces:
  - `createFigmaServer(options: { figmaDir: string; port: number }): Promise<{ url: string; close(): Promise<void> }>`
  - `GET /plans/<file>` serves `<figmaDir>/plans/<file>`.
  - `POST /save/figma-readback.<pageId>.json` writes `<figmaDir>/readback/`.
  - `POST /save/figma.<pageId>.png` writes `<figmaDir>/parity/`.

- [ ] **Step 1: Write the failing server test**

Create `runtimes/standalone/tests/figma-serve.test.ts`:

```ts
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFigmaServer } from "../src/figma-serve-cli.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function temp(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "figma-serve-"));
  dirs.push(dir);
  return dir;
}

describe("figma:serve", () => {
  it("serves plans and routes readback/json and png saves", async () => {
    const figma = await temp();
    await mkdir(path.join(figma, "plans"), { recursive: true });
    await writeFile(path.join(figma, "plans", "figma-plan.today.json"), '{"ok":true}', "utf8");
    const server = await createFigmaServer({ figmaDir: figma, port: 0 });
    try {
      const plan = await fetch(`${server.url}/plans/figma-plan.today.json`);
      expect(plan.status).toBe(200);
      expect(await plan.text()).toBe('{"ok":true}');

      const png = await fetch(`${server.url}/save/figma.today.png`, {
        method: "POST",
        body: new Uint8Array([137, 80, 78, 71]),
      });
      expect(png.status).toBe(200);
      expect((await readFile(path.join(figma, "parity", "figma.today.png"))).length).toBe(4);

      const readback = await fetch(`${server.url}/save/figma-readback.today.json`, {
        method: "POST",
        body: '{"pageId":"today"}',
      });
      expect(readback.status).toBe(200);
      expect(await readFile(path.join(figma, "readback", "figma-readback.today.json"), "utf8")).toContain("today");
    } finally {
      await server.close();
    }
  });

  it("rejects path traversal", async () => {
    const figma = await temp();
    const server = await createFigmaServer({ figmaDir: figma, port: 0 });
    try {
      const response = await fetch(`${server.url}/save/../evil.png`, { method: "POST", body: "x" });
      expect(response.status).toBeGreaterThanOrEqual(400);
    } finally {
      await server.close();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm exec vitest run runtimes/standalone/tests/figma-serve.test.ts
```
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the server**

Create `runtimes/standalone/src/figma-serve-cli.ts`:

```ts
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface FigmaServerOptions {
  figmaDir: string;
  port: number;
}

export interface FigmaServer {
  url: string;
  close: () => Promise<void>;
}

function saveTarget(name: string): { dir: "readback" | "parity"; file: string } | undefined {
  const decoded = decodeURIComponent(name);
  if (/^figma-readback\.[a-z0-9-]+\.json$/i.test(decoded)) {
    return { dir: "readback", file: decoded };
  }
  if (/^figma\.[a-z0-9-]+\.png$/i.test(decoded)) {
    return { dir: "parity", file: decoded };
  }
  return undefined;
}

export async function createFigmaServer(options: FigmaServerOptions): Promise<FigmaServer> {
  const plansDir = path.join(options.figmaDir, "plans");
  await mkdir(plansDir, { recursive: true });
  await mkdir(path.join(options.figmaDir, "readback"), { recursive: true });
  await mkdir(path.join(options.figmaDir, "parity"), { recursive: true });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/plans/")) {
      const name = path.basename(url.pathname);
      try {
        const body = await readFile(path.join(plansDir, name));
        response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        response.end(body);
      } catch {
        response.writeHead(404);
        response.end("not found");
      }
      return;
    }
    if (request.method === "POST" && url.pathname.startsWith("/save/")) {
      const target = saveTarget(url.pathname.slice("/save/".length));
      if (!target) {
        response.writeHead(400);
        response.end("bad name");
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      await writeFile(path.join(options.figmaDir, target.dir, target.file), Buffer.concat(chunks));
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  await new Promise<void>((resolve) => server.listen(options.port, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export async function main(argv: string[]): Promise<number> {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const figmaDir = path.resolve(
    value("--figma") ??
      path.join(process.cwd(), "artifacts", "employee-app-phase2", "figma")
  );
  const port = Number(value("--port") ?? 9600);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error("--port must be an integer from 0 to 65535");
    return 2;
  }
  const server = await createFigmaServer({ figmaDir, port });
  console.log(`Figma plan server: ${server.url}`);
  console.log(`Plans: ${path.join(figmaDir, "plans")}`);
  console.log(`Saving readbacks to: ${path.join(figmaDir, "readback")}`);
  console.log(`Saving PNGs to: ${path.join(figmaDir, "parity")}`);
  await new Promise<void>((resolve) => {
    const stop = () => resolve();
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
  await server.close();
  return 0;
}
```

- [ ] **Step 4: Add PNG export to the plugin**

In `runtimes/figma/src/plugin.ts`:

1. In the `build` message handler, after `const readback = await build(plan, mode);`, add:

```ts
post("readback", { readback, mode, pageId: plan.pageId });
const png = await root.exportAsync({
  format: "PNG",
  constraint: { type: "SCALE", value: 1 },
});
post("png", { bytes: Array.from(png), pageId: plan.pageId });
```

This requires `build` to return `{ readback, root }`. Refactor `build` to return both:

```ts
return { readback, root };
```

and the handler to:

```ts
const { readback, root } = await build(plan, mode);
```

2. In `runtimes/figma/src/ui.html`, add a server URL input and a `save` handler:

```html
<input id="server" placeholder="http://127.0.0.1:9600" />
```

In the message handler for `readback`:

```js
if (server.value) {
  await fetch(`${server.value.replace(/\/$/, "")}/save/figma-readback.${message.pageId}.json`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message.readback),
  });
}
```

For `png`:

```js
const bytes = new Uint8Array(message.bytes);
await fetch(`${server.value.replace(/\/$/, "")}/save/figma.${message.pageId}.png`, {
  method: "POST",
  body: bytes,
});
```

Keep the existing clipboard copy as a fallback. Show a status line for auto-save success/failure.

- [ ] **Step 5: Build the plugin and run the server test**

Run:
```bash
pnpm --dir runtimes/figma build
pnpm exec vitest run runtimes/standalone/tests/figma-serve.test.ts
```
Expected: plugin bundle builds; tests PASS.

- [ ] **Step 6: Add the script and commit**

Add to `package.json`:

```json
"figma:serve": "tsx runtimes/standalone/src/figma-serve-cli.ts",
```

```bash
git add runtimes/figma/src/plugin.ts runtimes/figma/src/ui.html runtimes/standalone/src/figma-serve-cli.ts runtimes/standalone/tests/figma-serve.test.ts package.json
git commit -m "feat(figma): export pngs and serve plans locally"
```

---

### Task 9: Implement parity evaluation and the `figma:parity` CLI

**Files:**
- Create: `pipeline/core/contracts/src/parity.ts`
- Modify: `pipeline/core/contracts/src/index.ts`
- Create: `pipeline/core/figma/src/parity.ts`
- Modify: `pipeline/core/figma/src/index.ts`
- Create: `pipeline/runtimes/standalone/src/visual/ssim.ts`
- Create: `pipeline/runtimes/standalone/src/figma-parity-cli.ts`
- Modify: `pipeline/package.json`
- Test: `pipeline/core/figma/tests/parity.test.ts`
- Test: `pipeline/runtimes/standalone/tests/ssim.test.ts`

**Interfaces:**
- Produces:
  - `ParityThresholds { maxPixelDiff: number; minSsim: number }`
  - `ParityPage`, `ParityReport`
  - `evaluateParityPage(input: { pageId; pixelDiffRatio; ssim; ... }): ParityPage`
  - `computeSsim(a: Buffer, b: Buffer, width: number, height: number): number`

- [ ] **Step 1: Write the failing tests**

Create `core/figma/tests/parity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluateParityPage } from "../src/index.js";

const base = {
  pageId: "today",
  baselineFile: "baselines/today.default.png",
  figmaFile: "parity/figma.today.png",
  baselineHash: "sha256:a",
  figmaHash: "sha256:b",
  width: 390,
  height: 844,
};

describe("evaluateParityPage", () => {
  it("passes at the threshold boundary", () => {
    const page = evaluateParityPage({
      ...base,
      pixelDiffRatio: 0.005,
      ssim: 0.98,
      thresholds: { maxPixelDiff: 0.005, minSsim: 0.98 },
    });
    expect(page.passed).toBe(true);
    expect(page.findings).toHaveLength(0);
  });

  it("fails on too many pixels", () => {
    const page = evaluateParityPage({
      ...base,
      pixelDiffRatio: 0.02,
      ssim: 0.99,
      thresholds: { maxPixelDiff: 0.005, minSsim: 0.98 },
    });
    expect(page.passed).toBe(false);
    expect(page.findings[0]?.code).toBe("PARITY_PIXEL_DIFF");
  });

  it("fails on low ssim", () => {
    const page = evaluateParityPage({
      ...base,
      pixelDiffRatio: 0.001,
      ssim: 0.9,
      thresholds: { maxPixelDiff: 0.005, minSsim: 0.98 },
    });
    expect(page.findings[0]?.code).toBe("PARITY_SSIM");
  });

  it("fails on size mismatch", () => {
    const page = evaluateParityPage({
      ...base,
      pixelDiffRatio: 0,
      ssim: 1,
      width: 391,
      height: 844,
      thresholds: { maxPixelDiff: 0.005, minSsim: 0.98 },
    });
    expect(page.findings[0]?.code).toBe("PARITY_SIZE_MISMATCH");
  });
});
```

Create `runtimes/standalone/tests/ssim.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeSsim } from "../src/visual/ssim.js";

function gray(value: number, count: number): Buffer {
  return Buffer.alloc(count * 4, value);
}

describe("computeSsim", () => {
  it("returns 1 for identical images", () => {
    const image = gray(128, 16 * 16);
    expect(computeSsim(image, image, 16, 16)).toBeCloseTo(1, 3);
  });

  it("returns less than 1 for different images", () => {
    const a = gray(0, 16 * 16);
    const b = gray(255, 16 * 16);
    expect(computeSsim(a, b, 16, 16)).toBeLessThan(0.9);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm exec vitest run core/figma/tests/parity.test.ts runtimes/standalone/tests/ssim.test.ts
```
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Add parity contracts**

Create `core/contracts/src/parity.ts`:

```ts
export interface ParityThresholds {
  maxPixelDiff: number;
  minSsim: number;
}

export interface ParityFinding {
  code: "PARITY_PIXEL_DIFF" | "PARITY_SSIM" | "PARITY_SIZE_MISMATCH" | "BASELINE_STALE";
  severity: "blocker";
  message: string;
}

export interface ParityPage {
  pageId: string;
  passed: boolean;
  pixelDiffRatio: number;
  ssim: number;
  baselineFile: string;
  figmaFile: string;
  baselineHash: string;
  figmaHash: string;
  width: number;
  height: number;
  diffFile?: string;
  findings: ParityFinding[];
}

export interface ParityReport {
  schemaVersion: "1.0";
  project: string;
  generatedAt: string;
  thresholds: ParityThresholds;
  pages: ParityPage[];
  summary: { passed: boolean; failed: number; pages: number };
}
```

Export from `core/contracts/src/index.ts`.

- [ ] **Step 4: Implement the evaluator**

Create `core/figma/src/parity.ts`:

```ts
import type { ParityPage, ParityThresholds } from "@prd-ui/contracts";

export function evaluateParityPage(input: {
  pageId: string;
  pixelDiffRatio: number;
  ssim: number;
  width: number;
  height: number;
  expectedWidth?: number;
  expectedHeight?: number;
  baselineFile: string;
  figmaFile: string;
  baselineHash: string;
  figmaHash: string;
  thresholds: ParityThresholds;
}): ParityPage {
  const findings: ParityPage["findings"] = [];
  const expectedWidth = input.expectedWidth ?? 390;
  const expectedHeight = input.expectedHeight ?? 844;
  if (input.width !== expectedWidth || input.height !== expectedHeight) {
    findings.push({
      code: "PARITY_SIZE_MISMATCH",
      severity: "blocker",
      message: `Expected ${expectedWidth}x${expectedHeight}, got ${input.width}x${input.height}.`,
    });
  }
  if (input.pixelDiffRatio > input.thresholds.maxPixelDiff) {
    findings.push({
      code: "PARITY_PIXEL_DIFF",
      severity: "blocker",
      message: `Pixel diff ${(input.pixelDiffRatio * 100).toFixed(2)}% > ${(input.thresholds.maxPixelDiff * 100).toFixed(2)}%.`,
    });
  }
  if (input.ssim < input.thresholds.minSsim) {
    findings.push({
      code: "PARITY_SSIM",
      severity: "blocker",
      message: `SSIM ${input.ssim.toFixed(4)} < ${input.thresholds.minSsim.toFixed(4)}.`,
    });
  }
  return {
    pageId: input.pageId,
    passed: findings.length === 0,
    pixelDiffRatio: input.pixelDiffRatio,
    ssim: input.ssim,
    baselineFile: input.baselineFile,
    figmaFile: input.figmaFile,
    baselineHash: input.baselineHash,
    figmaHash: input.figmaHash,
    width: input.width,
    height: input.height,
    findings,
  };
}
```

Export from `core/figma/src/index.ts`.

- [ ] **Step 5: Implement SSIM**

Create `runtimes/standalone/src/visual/ssim.ts`:

```ts
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;
const WINDOW = 8;

function grayAt(buffer: Buffer, width: number, x: number, y: number): number {
  const index = (y * width + x) * 4;
  const r = buffer[index] ?? 0;
  const g = buffer[index + 1] ?? 0;
  const b = buffer[index + 2] ?? 0;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function computeSsim(a: Buffer, b: Buffer, width: number, height: number): number {
  let total = 0;
  let windows = 0;
  for (let y = 0; y + WINDOW <= height; y += WINDOW) {
    for (let x = 0; x + WINDOW <= width; x += WINDOW) {
      let sumA = 0;
      let sumB = 0;
      let sumAA = 0;
      let sumBB = 0;
      let sumAB = 0;
      const count = WINDOW * WINDOW;
      for (let dy = 0; dy < WINDOW; dy += 1) {
        for (let dx = 0; dx < WINDOW; dx += 1) {
          const va = grayAt(a, width, x + dx, y + dy);
          const vb = grayAt(b, width, x + dx, y + dy);
          sumA += va;
          sumB += vb;
          sumAA += va * va;
          sumBB += vb * vb;
          sumAB += va * vb;
        }
      }
      const meanA = sumA / count;
      const meanB = sumB / count;
      const varA = sumAA / count - meanA * meanA;
      const varB = sumBB / count - meanB * meanB;
      const cov = sumAB / count - meanA * meanB;
      const numerator = (2 * meanA * meanB + C1) * (2 * cov + C2);
      const denominator = (meanA * meanA + meanB * meanB + C1) * (varA + varB + C2);
      total += denominator === 0 ? 1 : numerator / denominator;
      windows += 1;
    }
  }
  return windows === 0 ? 1 : total / windows;
}
```

- [ ] **Step 6: Implement the parity CLI**

Create `runtimes/standalone/src/figma-parity-cli.ts`:

```ts
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { evaluateParityPage } from "@prd-ui/figma";
import type { ParityPage, ParityReport, ParityThresholds } from "@prd-ui/contracts";
import { computeSsim } from "./visual/ssim.js";

export class ParityUsageError extends Error {}

export interface ParityOptions {
  figma?: string;
  baseline?: string;
  specRun?: string;
  out?: string;
  maxPixelDiff: number;
  minSsim: number;
  json: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): ParityOptions {
  const options: ParityOptions = { maxPixelDiff: 0.005, minSsim: 0.98, json: false, help: false };
  const value = (index: number, flag: string): string => {
    const next = argv[index];
    if (next === undefined || next.startsWith("--")) throw new ParityUsageError(`missing value for ${flag}`);
    return next;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    switch (flag) {
      case "--figma": options.figma = path.resolve(value(++index, flag)); break;
      case "--baseline": options.baseline = path.resolve(value(++index, flag)); break;
      case "--spec-run": options.specRun = path.resolve(value(++index, flag)); break;
      case "--out": options.out = path.resolve(value(++index, flag)); break;
      case "--max-pixel-diff": options.maxPixelDiff = Number(value(++index, flag)); break;
      case "--min-ssim": options.minSsim = Number(value(++index, flag)); break;
      case "--json": options.json = true; break;
      case "--help":
      case "-h": options.help = true; break;
      default: throw new ParityUsageError(`unknown argument: ${flag}`);
    }
  }
  return options;
}

function hash(buffer: Buffer): string {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

async function loadPageIds(specRun: string): Promise<string[]> {
  const dir = path.join(specRun, "artifacts", "page-spec");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
  return files.map((file) => path.basename(file, ".json")).sort();
}

async function loadProject(specRun: string): Promise<string> {
  const dir = path.join(specRun, "artifacts", "page-spec");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const first = files[0];
  if (!first) return "unknown";
  const raw = JSON.parse(await readFile(path.join(dir, first), "utf8")) as {
    meta?: { project?: string };
  };
  return raw.meta?.project ?? "unknown";
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  let options: ParityOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (options.help) {
    io.stdout("Usage: pnpm figma:parity --figma <dir> --baseline <dir> --spec-run <dir> --out <dir> [--max-pixel-diff 0.005] [--min-ssim 0.98]");
    return 0;
  }
  if (!options.figma || !options.baseline || !options.specRun || !options.out) {
    io.stderr("missing required --figma/--baseline/--spec-run/--out");
    return 2;
  }

  try {
    const pageIds = await loadPageIds(options.specRun);
    const project = await loadProject(options.specRun);
    const thresholds: ParityThresholds = {
      maxPixelDiff: options.maxPixelDiff,
      minSsim: options.minSsim,
    };
    const pages: ParityPage[] = [];
    await mkdir(path.join(options.out, "diff"), { recursive: true });
    const baselineManifest = JSON.parse(
      await readFile(path.join(options.baseline, "manifest.json"), "utf8")
    ) as { cases: Array<{ pageId: string; state: string; file: string }> };

    for (const pageId of pageIds) {
      const figmaFile = path.join(options.figma, `figma.${pageId}.png`);
      const baselineCase = baselineManifest.cases.find(
        (entry) => entry.pageId === pageId && entry.state === "default"
      );
      if (!baselineCase) throw new Error(`BASELINE_CASE_MISSING: ${pageId}`);
      const baselineFile = path.join(options.baseline, baselineCase.file);
      const figmaBuffer = await readFile(figmaFile);
      const baselineBuffer = await readFile(baselineFile);
      const figma = PNG.sync.read(figmaBuffer);
      const baseline = PNG.sync.read(baselineBuffer);
      const sameSize = figma.width === baseline.width && figma.height === baseline.height;
      let pixelDiffRatio = 1;
      let ssim = 0;
      let diffFile: string | undefined;
      if (sameSize) {
        const diff = new PNG({ width: figma.width, height: figma.height });
        const diffPixels = pixelmatch(
          baseline.data,
          figma.data,
          diff.data,
          figma.width,
          figma.height,
          { threshold: 0.1, includeAA: false }
        );
        pixelDiffRatio = diffPixels / (figma.width * figma.height);
        ssim = computeSsim(baseline.data, figma.data, figma.width, figma.height);
        diffFile = path.join(options.out, "diff", `${pageId}.png`);
        await writeFile(diffFile, PNG.sync.write(diff));
      }
      pages.push(
        evaluateParityPage({
          pageId,
          pixelDiffRatio,
          ssim,
          width: figma.width,
          height: figma.height,
          baselineFile,
          figmaFile,
          baselineHash: hash(baselineBuffer),
          figmaHash: hash(figmaBuffer),
          thresholds,
          ...(diffFile === undefined ? {} : { diffFile }),
        })
      );
    }

    const report: ParityReport = {
      schemaVersion: "1.0",
      project,
      generatedAt: new Date().toISOString(),
      thresholds,
      pages,
      summary: {
        passed: pages.every((page) => page.passed),
        failed: pages.filter((page) => !page.passed).length,
        pages: pages.length,
      },
    };
    await writeFile(path.join(options.out, "parity.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(
      path.join(options.out, "parity.config.json"),
      `${JSON.stringify({ schemaVersion: "1.0", thresholds }, null, 2)}\n`,
      "utf8"
    );
    if (options.json) {
      io.stdout(JSON.stringify(report));
    } else {
      for (const page of pages) {
        io.stdout(`Parity ${page.pageId}: ${page.passed ? "passed" : "failed"} (pixel ${(page.pixelDiffRatio * 100).toFixed(3)}%, ssim ${page.ssim.toFixed(4)})`);
      }
    }
    return report.summary.passed ? 0 : 1;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 2;
  }
}
```

The baseline manifest is `baselines/<project>/manifest.json`; its `cases[]` entry with `state: "default"` supplies the file name for each page. Do not hardcode `<pageId>.default.png`.

- [ ] **Step 7: Add the script and run tests**

Add to `package.json`:

```json
"figma:parity": "tsx runtimes/standalone/src/figma-parity-cli.ts",
```

Run:
```bash
pnpm exec vitest run core/figma/tests/parity.test.ts runtimes/standalone/tests/ssim.test.ts
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add core/contracts/src/parity.ts core/contracts/src/index.ts core/figma/src/parity.ts core/figma/src/index.ts core/figma/tests/parity.test.ts runtimes/standalone/src/visual/ssim.ts runtimes/standalone/src/figma-parity-cli.ts runtimes/standalone/tests/ssim.test.ts package.json
git commit -m "feat(figma): add image parity gate"
```

---

### Task 10: Extend readback and verify with style checks

**Files:**
- Modify: `pipeline/core/figma/src/diff.ts`
- Modify: `pipeline/runtimes/figma/src/plugin.ts` (readback function)
- Test: `pipeline/core/figma/tests/diff.test.ts`

**Interfaces:**
- Consumes: `FigmaReadbackNode` style fields
- Produces: finding codes `FIGMA_BORDER_MISMATCH`, `FIGMA_RADIUS_MISMATCH`, `FIGMA_FILL_MISMATCH`, `FIGMA_FONT_WEIGHT_MISMATCH`, `FIGMA_TEXT_COLOR_MISMATCH`, `FIGMA_LINE_HEIGHT_MISMATCH`, `READBACK_STYLE_UNSUPPORTED`

- [ ] **Step 1: Write the failing tests**

Add to `core/figma/tests/diff.test.ts`:

```ts
it("fails when a planned bottom border is missing in readback", () => {
  const plan = structuredClone(plans.find((entry) => entry.pageId === "today")!);
  const readback = readbackFromPlan(plan);
  const target = plan.root.children!.find((node) => node.specId === "today.card.appointments")!;
  target.borderBottom = "color/border/subtle";
  target.borderBottomWidth = 1;
  const diff = diffFigma(plan, readback);
  expect(diff.findings.some((finding) => finding.code === "FIGMA_BORDER_MISMATCH")).toBe(true);
});

it("fails when a button radius differs", () => {
  const plan = structuredClone(plans.find((entry) => entry.pageId === "appointment-form")!);
  const readback = readbackFromPlan(plan);
  const instance = readback.nodes[0]!.children!.find((node) => node.type === "INSTANCE")!;
  instance.cornerRadius = 0;
  const diff = diffFigma(plan, readback);
  expect(diff.findings.some((finding) => finding.code === "FIGMA_RADIUS_MISMATCH")).toBe(true);
});
```

The exact plan nodes/instances must be located by walking the real plan; use the helper already in the test file to find the first INSTANCE. Do not hardcode a missing path.

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm exec vitest run core/figma/tests/diff.test.ts
```
Expected: FAIL because the checks do not exist.

- [ ] **Step 3: Implement readback style checks**

In `core/figma/src/diff.ts`, for each matched plan/readback node pair:

- If plan declares `borderBottom` with width > 0 and readback has `borderBottom`:
  - compare width and color (`sameColor` from `./conformance.js`).
  - mismatch → `FIGMA_BORDER_MISMATCH` major.
- Same for `borderTop` / `borderLeft`, and `stroke` vs `borderTop` when the plan uses a uniform stroke.
- If plan declares `radius` and readback has `cornerRadius`, compare → `FIGMA_RADIUS_MISMATCH`.
- If plan declares `fill`/`fillAlpha` and readback has `fillDetails`, compare first fill color/alpha → `FIGMA_FILL_MISMATCH`.
- If plan text style has `fontWeight` and readback has `fontWeight`, compare → `FIGMA_FONT_WEIGHT_MISMATCH`.
- If plan text color and readback has `textColor`, compare → `FIGMA_TEXT_COLOR_MISMATCH`.
- If plan text style has `lineHeight` and readback has `lineHeight`, compare → `FIGMA_LINE_HEIGHT_MISMATCH`.
- If the plan declares any of these and the readback field is absent → minor `READBACK_STYLE_UNSUPPORTED` with the property name.

Use the existing `sameColor` helper by importing it from `./conformance.js` (it is runtime-neutral).

- [ ] **Step 4: Extend the plugin readback**

In `runtimes/figma/src/plugin.ts`, inside `readbackNode(node)`:

```ts
const result: FigmaReadbackNode = { ... };
if ("cornerRadius" in node && typeof node.cornerRadius === "number") {
  result.cornerRadius = node.cornerRadius;
}
if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
  const stroke = node.strokes[0]!;
  result.borderTop = { width: node.strokeTopWeight ?? node.strokeWeight ?? 1, color: colorToHex(stroke.color) };
  // mirror for bottom/left when per-side weights exist; default to the same stroke
}
if (node.type === "TEXT" && "fontWeight" in node) {
  result.fontWeight = node.fontWeight as number;
  result.textColor = colorToHex((node.fills as Paint[])[0]?.color);
  result.lineHeight = typeof node.lineHeight === "object" && "value" in node.lineHeight ? node.lineHeight.value : undefined;
}
if (Array.isArray(node.fills) && node.fills.length > 0) {
  result.fillDetails = node.fills.map((paint) => ({ color: colorToHex(paint.color), alpha: paint.opacity ?? 1 }));
}
```

Implement `colorToHex(color: RGB): string` in the plugin:

```ts
function colorToHex(color: RGB | undefined): string {
  if (!color) return "#000000";
  const channel = (value: number): string => Math.round(value * 255).toString(16).padStart(2, "0");
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`.toUpperCase();
}
```

Keep `fills: string[]` populated as today for backward compatibility.

- [ ] **Step 5: Run the tests and rebuild the plugin**

Run:
```bash
pnpm exec vitest run core/figma/tests/diff.test.ts
pnpm --dir runtimes/figma typecheck
```
Expected: tests PASS; plugin typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add core/figma/src/diff.ts core/figma/tests/diff.test.ts runtimes/figma/src/plugin.ts
git commit -m "feat(figma): verify extended readback styles"
```

---

### Task 11: Add `figma:sign`

**Files:**
- Modify: `pipeline/core/contracts/src/figma.ts`
- Test: `pipeline/core/contracts/tests/figma.test.ts`
- Create: `pipeline/runtimes/standalone/src/figma-sign-cli.ts`
- Modify: `pipeline/package.json`
- Test: `pipeline/runtimes/standalone/tests/figma-sign.test.ts`

**Interfaces:**
- Consumes: `plans/`, `readback/`, `conformance/conformance.json`, `parity/parity.json`, baseline manifest
- Produces: `signoff/figma-sign.json` with five hashes

- [ ] **Step 1: Write the failing test**

Create `runtimes/standalone/tests/figma-sign.test.ts`:

```ts
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main, signEvidence } from "../src/figma-sign-cli.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function temp(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "figma-sign-"));
  dirs.push(dir);
  return dir;
}

describe("figma:sign", () => {
  it("rejects a signoff with a wrong hash", async () => {
    const dir = await temp();
    await writeFile(
      path.join(dir, "signoff.md"),
      "<!-- signoff\n{\"signer\":\"tester\",\"date\":\"2026-10-26\",\"planHash\":\"sha256:bad\",\"readbackHash\":\"sha256:bad\",\"conformanceHash\":\"sha256:bad\",\"parityHash\":\"sha256:bad\",\"baselineHash\":\"sha256:bad\"}\n-->\n",
      "utf8"
    );
    const result = await signEvidence({
      figmaDir: dir,
      signoffPath: path.join(dir, "signoff.md"),
      hashes: {
        planHash: "sha256:a",
        readbackHash: "sha256:b",
        conformanceHash: "sha256:c",
        parityHash: "sha256:d",
        baselineHash: "sha256:e",
      },
    });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm exec vitest run runtimes/standalone/tests/figma-sign.test.ts
```
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the signing logic**

Create `runtimes/standalone/src/figma-sign-cli.ts`:

```ts
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { FigmaSignoffBlockSchema } from "@prd-ui/contracts";

export interface FigmaHashes {
  planHash: string;
  readbackHash: string;
  conformanceHash: string;
  parityHash: string;
  baselineHash: string;
}

const SIGNOFF_BLOCK = /<!--\s*signoff\s*([\s\S]*?)-->/i;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashJson(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

async function hashDir(files: string[]): Promise<string> {
  const parts: unknown[] = [];
  for (const file of files.sort()) {
    parts.push({ file: path.basename(file), body: JSON.parse(await readFile(file, "utf8")) });
  }
  return hashJson(parts);
}

export async function computeFigmaHashes(input: {
  figmaDir: string;
  baselineDir: string;
}): Promise<FigmaHashes> {
  const plans = (await readdir(path.join(input.figmaDir, "plans")))
    .filter((file) => file.endsWith(".json") && file.startsWith("figma-plan."))
    .map((file) => path.join(input.figmaDir, "plans", file));
  const readbacks = (await readdir(path.join(input.figmaDir, "readback")))
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(input.figmaDir, "readback", file));
  return {
    planHash: await hashDir(plans),
    readbackHash: await hashDir(readbacks),
    conformanceHash: hashJson(JSON.parse(await readFile(path.join(input.figmaDir, "conformance", "conformance.json"), "utf8"))),
    parityHash: hashJson(JSON.parse(await readFile(path.join(input.figmaDir, "parity", "parity.json"), "utf8"))),
    baselineHash: hashJson(
      JSON.parse(await readFile(path.join(input.baselineDir, "manifest.json"), "utf8"))
    ),
  };
}

export async function signEvidence(input: {
  figmaDir: string;
  signoffPath: string;
  hashes: FigmaHashes;
}): Promise<{ ok: true; signoff: Record<string, unknown> } | { ok: false; error: string }> {
  const text = await readFile(input.signoffPath, "utf8");
  const match = SIGNOFF_BLOCK.exec(text);
  if (!match?.[1]) return { ok: false, error: "SIGNOFF_BLOCK_MISSING" };
  let raw: unknown;
  try {
    raw = JSON.parse(match[1].trim()) as unknown;
  } catch {
    return { ok: false, error: "SIGNOFF_BLOCK_INVALID_JSON" };
  }
  const parsed = FigmaSignoffBlockSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `SIGNOFF_BLOCK_INVALID: ${parsed.error.message}` };
  }
  const block = parsed.data;
  for (const key of ["planHash", "readbackHash", "conformanceHash", "parityHash", "baselineHash"] as const) {
    if (block[key] !== input.hashes[key]) {
      return { ok: false, error: `SIGNOFF_HASH_MISMATCH: ${key}` };
    }
  }
  const signoff = {
    schemaVersion: "1.0",
    signer: block.signer,
    date: block.date,
    ...input.hashes,
  };
  await mkdir(path.join(input.figmaDir, "signoff"), { recursive: true });
  await writeFile(
    path.join(input.figmaDir, "signoff", "figma-sign.json"),
    `${JSON.stringify(signoff, null, 2)}\n`,
    "utf8"
  );
  return { ok: true, signoff };
}
```

Add `FigmaSignoffBlockSchema` to `core/contracts/src/figma.ts`:

```ts
export const FigmaSignoffBlockSchema = z
  .object({
    signer: z.string().min(1),
    date: z.string().min(1),
    planHash: z.string().min(1),
    readbackHash: z.string().min(1),
    conformanceHash: z.string().min(1),
    parityHash: z.string().min(1),
    baselineHash: z.string().min(1),
  })
  .strict();
export type FigmaSignoffBlock = z.infer<typeof FigmaSignoffBlockSchema>;
```

Add a contract test for it in `core/contracts/tests/figma.test.ts`:

```ts
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
```

- [ ] **Step 4: Implement the CLI**

Add `main(argv)` that:

1. Parses `--figma <dir>`, `--signoff-figma <file>`, `--baseline <dir>`, `--json`.
2. Reads `conformance.json` and `parity.json`; refuses if any page failed.
3. Calls `computeFigmaHashes` and `signEvidence`.
4. Prints the five hashes; returns 1 on any refusal.

- [ ] **Step 5: Add the script and run the test**

Add to `package.json`:

```json
"figma:sign": "tsx runtimes/standalone/src/figma-sign-cli.ts",
```

Run:
```bash
pnpm exec vitest run runtimes/standalone/tests/figma-sign.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add runtimes/standalone/src/figma-sign-cli.ts runtimes/standalone/tests/figma-sign.test.ts package.json
git commit -m "feat(figma): bind verify, conformance, and parity hashes in signoff"
```

---

### Task 12: Add `render:measure` and `structure:check`

**Files:**
- Add `RenderMetrics` to `pipeline/core/contracts/src/structure.ts`
- Create: `pipeline/runtimes/standalone/src/measure/measure.ts`
- Create: `pipeline/runtimes/standalone/src/render-measure-cli.ts`
- Create: `pipeline/core/validators/src/structure-measured.ts`
- Modify: `pipeline/core/validators/src/index.ts`
- Create: `pipeline/runtimes/standalone/src/structure-check-cli.ts`
- Modify: `pipeline/package.json`
- Test: `pipeline/core/validators/tests/structure-measured.test.ts`

**Interfaces:**
- Produces:
  - `RenderMetrics`, `RenderMetricsPage`
  - `measurePages(input): Promise<RenderMetrics>`
  - `checkMeasuredStructure(metrics, config): Finding[]`

- [ ] **Step 1: Write the failing tests**

Create `core/validators/tests/structure-measured.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkMeasuredStructure } from "../src/index.js";

const metrics = {
  schemaVersion: "1.0" as const,
  project: "fixture",
  pages: [
    {
      pageId: "today",
      target: "mobile" as const,
      viewport: { width: 390, height: 844 },
      documentHeight: 2500,
      scrollContainer: { selector: ".app-scroll", clientHeight: 716, scrollHeight: 2500, overflowY: "auto" },
      firstScreenNodes: 10,
      foldSpecId: "today.card.callbacks",
      widest: { specId: "today.calendar", width: 420, overflowX: true },
      fixedFooter: { present: true, height: 64, overlapsContent: true },
      contentBottomGap: -4,
    },
  ],
};

describe("checkMeasuredStructure", () => {
  it("reports measured height, overflow-x, and footer overlap", () => {
    const findings = checkMeasuredStructure(metrics, {
      maxRepeatedSections: 2,
      pageHeightBudget: { mobile: 2100, web: 2400 },
    });
    expect(findings.some((finding) => finding.ruleId === "STRUCTURE-MEASURED-HEIGHT")).toBe(true);
    expect(findings.some((finding) => finding.ruleId === "STRUCTURE-MEASURED-OVERFLOW-X")).toBe(true);
    expect(findings.some((finding) => finding.ruleId === "STRUCTURE-MEASURED-FOOTER-OVERLAP")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm exec vitest run core/validators/tests/structure-measured.test.ts
```
Expected: FAIL because the function does not exist.

- [ ] **Step 3: Add metrics contracts**

In `core/contracts/src/structure.ts` add:

```ts
export interface RenderMetricsPage {
  pageId: string;
  target: "mobile" | "web";
  viewport: { width: number; height: number };
  documentHeight: number;
  scrollContainer: {
    selector: string;
    clientHeight: number;
    scrollHeight: number;
    overflowY: string;
  };
  firstScreenNodes: number;
  foldSpecId?: string;
  widest: { specId?: string; width: number; overflowX: boolean };
  fixedFooter: { present: boolean; height: number; overlapsContent: boolean };
  contentBottomGap: number;
}

export interface RenderMetrics {
  schemaVersion: "1.0";
  project: string;
  pages: RenderMetricsPage[];
}
```

- [ ] **Step 4: Implement measured checks**

Create `core/validators/src/structure-measured.ts`:

```ts
import type { Finding, RenderMetrics, StructureConfig } from "@prd-ui/contracts";

export function checkMeasuredStructure(
  metrics: RenderMetrics,
  config: StructureConfig
): Finding[] {
  const findings: Finding[] = [];
  const push = (ruleId: string, location: string, evidence: string, issue: string): void => {
    findings.push({
      id: `${ruleId}-${findings.length + 1}`,
      ruleId,
      severity: "warning",
      category: "structure",
      location,
      evidence,
      issue,
    });
  };
  for (const page of metrics.pages) {
    const budget = config.pageHeightBudget[page.target];
    if (page.documentHeight > budget) {
      push("STRUCTURE-MEASURED-HEIGHT", page.pageId, `${page.documentHeight} > ${budget}`, `Measured height ${page.documentHeight}px exceeds ${budget}px.`);
    }
    if (page.widest.overflowX) {
      push("STRUCTURE-MEASURED-OVERFLOW-X", page.widest.specId ?? page.pageId, String(page.widest.width), "Element is wider than the viewport.");
    }
    if (page.fixedFooter.present && page.fixedFooter.overlapsContent) {
      push("STRUCTURE-MEASURED-FOOTER-OVERLAP", page.pageId, String(page.contentBottomGap), "Fixed footer overlaps page content.");
    }
  }
  return findings;
}
```

Export from `core/validators/src/index.ts`.

- [ ] **Step 5: Implement the Playwright measurement**

Create `runtimes/standalone/src/measure/measure.ts`. Reuse the static server and deterministic CSS/time from `../visual/screenshot.js`.

```ts
import { chromium } from "playwright";
import type { RenderMetrics, RenderMetricsPage } from "@prd-ui/contracts";
import {
  DETERMINISTIC_CSS,
  FIXED_SCREENSHOT_TIME,
  SCREENSHOT_TIMEZONE,
  createStaticServer,
} from "../visual/screenshot.js";

export async function measurePages(input: {
  htmlDir: string;
  project: string;
  pages: Array<{ pageId: string; target: "mobile" | "web" }>;
}): Promise<RenderMetrics> {
  const server = await createStaticServer(input.htmlDir);
  const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--disable-lcd-text"] });
  try {
    const pages: RenderMetricsPage[] = [];
    for (const page of input.pages) {
      const viewport = page.target === "web" ? { width: 1440, height: 900 } : { width: 390, height: 844 };
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        timezoneId: SCREENSHOT_TIMEZONE,
        reducedMotion: "reduce",
      });
      const tab = await context.newPage();
      await tab.goto(`${server.url}/${page.pageId}.html`, { waitUntil: "networkidle" });
      await tab.evaluate(() => document.fonts.ready);
      await tab.addStyleTag({ content: DETERMINISTIC_CSS });
      const measured = await tab.evaluate(({ pageId, target, viewport }) => {
        const scroll = document.querySelector<HTMLElement>(".app-scroll");
        const footer = document.querySelector<HTMLElement>(".app-actions");
        const all = [...document.querySelectorAll<HTMLElement>("[data-node-id]")];
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const rects = all.map((el) => ({ id: el.dataset.nodeId ?? "", rect: el.getBoundingClientRect() }));
        const firstScreenNodes = rects.filter(({ rect }) => rect.top < viewportHeight && rect.bottom > 0).length;
        const fold = rects.find(({ rect }) => rect.top >= viewportHeight && rect.height > 0);
        const widest = rects.reduce(
          (best, entry) => (entry.rect.width > best.width ? { specId: entry.id, width: entry.rect.width } : best),
          { specId: undefined as string | undefined, width: 0 }
        );
        const footerRect = footer?.getBoundingClientRect();
        let contentBottomGap = 0;
        let overlapsContent = false;
        if (scroll) {
          const previous = scroll.scrollTop;
          scroll.scrollTop = scroll.scrollHeight;
          const last = all[all.length - 1]?.getBoundingClientRect();
          if (last && footerRect) {
            contentBottomGap = Math.round(footerRect.top - last.bottom);
            overlapsContent = last.bottom > footerRect.top;
          }
          scroll.scrollTop = previous;
        }
        return {
          pageId,
          target,
          viewport,
          documentHeight: document.documentElement.scrollHeight,
          scrollContainer: {
            selector: ".app-scroll",
            clientHeight: scroll?.clientHeight ?? 0,
            scrollHeight: scroll?.scrollHeight ?? 0,
            overflowY: scroll ? getComputedStyle(scroll).overflowY : "visible",
          },
          firstScreenNodes,
          ...(fold === undefined ? {} : { foldSpecId: fold.id }),
          widest: {
            ...(widest.specId === undefined ? {} : { specId: widest.specId }),
            width: Math.round(widest.width),
            overflowX: widest.width > viewportWidth,
          },
          fixedFooter: {
            present: footer !== null,
            height: footerRect ? Math.round(footerRect.height) : 0,
            overlapsContent,
          },
          contentBottomGap,
        };
      }, { pageId: page.pageId, target: page.target, viewport });
      await context.close();
      pages.push(measured);
    }
    return { schemaVersion: "1.0", project: input.project, pages };
  } finally {
    await browser.close();
    await server.close();
  }
}
```

- [ ] **Step 6: Implement the two CLIs**

Create `runtimes/standalone/src/render-measure-cli.ts`:
- Parse `--spec-run`, `--html`, `--out`, `--json`.
- Load specs, call `measurePages`, write `render-metrics.json`.

Create `runtimes/standalone/src/structure-check-cli.ts`:
- Parse `--spec-run`, `--metrics`, `--out`, `--json`.
- Load specs for project name and target.
- Load metrics, load project config for `structure` overrides, call `checkMeasuredStructure`, write `structure-measured.json`:

```json
{
  "schemaVersion": "1.0",
  "project": "employee-app-phase2",
  "generatedAt": "2026-10-26T00:00:00.000Z",
  "metrics": "render-metrics.json",
  "findings": [],
  "summary": { "warnings": 0, "blockers": 0 }
}
```

Add scripts:

```json
"render:measure": "tsx runtimes/standalone/src/render-measure-cli.ts",
"structure:check": "tsx runtimes/standalone/src/structure-check-cli.ts",
```

- [ ] **Step 7: Run tests and a measurement smoke**

Run:
```bash
pnpm exec vitest run core/validators/tests/structure-measured.test.ts
pnpm render:measure --spec-run artifacts/employee-app-phase2/figma/spec-source --html artifacts/employee-app-phase2/html --out /tmp/render-v07
pnpm structure:check --spec-run artifacts/employee-app-phase2/figma/spec-source --metrics /tmp/render-v07/render-metrics.json --out /tmp/render-v07
```
Expected: test PASS; 8 pages measured; `structure-measured.json` written.

- [ ] **Step 8: Commit**

```bash
git add core/contracts/src/structure.ts core/validators/src/structure-measured.ts core/validators/src/index.ts core/validators/tests/structure-measured.test.ts runtimes/standalone/src/measure/measure.ts runtimes/standalone/src/render-measure-cli.ts runtimes/standalone/src/structure-check-cli.ts package.json
git commit -m "feat(structure): measure rendered pages and check budgets"
```

---

## Batch 3 — Structure diff

### Task 13: Implement `structure:diff`

**Files:**
- Add `StructureDiff` to `pipeline/core/contracts/src/structure.ts`
- Create: `pipeline/core/compiler/src/structure-diff.ts`
- Modify: `pipeline/core/compiler/src/index.ts`
- Create: `pipeline/runtimes/standalone/src/structure-diff-cli.ts`
- Modify: `pipeline/package.json`
- Test: `pipeline/core/compiler/tests/structure-diff.test.ts`

**Interfaces:**
- Produces: `diffPageStructure(before: PageSpec, after: PageSpec): StructurePageDiff`

- [ ] **Step 1: Write the failing test**

Create `core/compiler/tests/structure-diff.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UiBriefSchema } from "@prd-ui/contracts";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { compileProject } from "../src/index.js";
import { diffPageStructure } from "../src/structure-diff.js";

const brief = UiBriefSchema.parse(
  JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
const today = specs.find((spec) => spec.meta.pageId === "today")!;

describe("diffPageStructure", () => {
  it("reports added and removed nodes", () => {
    const after = structuredClone(today);
    after.layout.slots!.content![0]!.children!.push({
      id: "today.new-card",
      type: "Card",
      props: { title: "新卡片" },
      children: [],
    });
    const diff = diffPageStructure(today, after);
    expect(diff.added.some((node) => node.specId === "today.new-card")).toBe(true);
  });

  it("reports a title change", () => {
    const after = structuredClone(today);
    const card = after.layout.slots!.content![0]!.children![0]!;
    card.props = { ...card.props, title: "新标题" };
    const diff = diffPageStructure(today, after);
    expect(
      diff.changed.some(
        (change) => change.specId === card.id && change.property === "title"
      )
    ).toBe(true);
  });

  it("reports a type change", () => {
    const after = structuredClone(today);
    const card = after.layout.slots!.content![0]!.children![0]!;
    card.type = "Section";
    const diff = diffPageStructure(today, after);
    expect(
      diff.changed.some((change) => change.specId === card.id && change.kind === "type")
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm exec vitest run core/compiler/tests/structure-diff.test.ts
```
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add the contract and implementation**

In `core/contracts/src/structure.ts` add:

```ts
export interface StructureNodeChange {
  specId: string;
  kind: "type" | "prop" | "slot" | "moved";
  property?: string;
  before?: string;
  after?: string;
}

export interface StructurePageDiff {
  pageId: string;
  added: Array<{ specId: string; path: string; type: string }>;
  removed: Array<{ specId: string; path: string; type: string }>;
  changed: StructureNodeChange[];
}

export interface StructureDiff {
  schemaVersion: "1.0";
  before: string;
  after: string;
  pages: StructurePageDiff[];
}
```

Create `core/compiler/src/structure-diff.ts`:

```ts
import type {
  PageSpec,
  SpecNode,
  StructureNodeChange,
  StructurePageDiff,
} from "@prd-ui/contracts";

interface Entry {
  node: SpecNode;
  path: string;
  parentId?: string;
}

function collect(root: SpecNode): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  const visit = (node: SpecNode, path: string, parentId?: string): void => {
    if (node.id) entries.set(node.id, { node, path, ...(parentId === undefined ? {} : { parentId }) });
    (node.children ?? []).forEach((child, index) => visit(child, `${path}.children[${index}]`, node.id));
    for (const [slot, nodes] of Object.entries(node.slots ?? {})) {
      nodes.forEach((child, index) => visit(child, `${path}.slots.${slot}[${index}]`, node.id));
    }
  };
  visit(root, "layout");
  return entries;
}

export function diffPageStructure(before: PageSpec, after: PageSpec): StructurePageDiff {
  const left = collect(before.layout);
  const right = collect(after.layout);
  const added: StructurePageDiff["added"] = [];
  const removed: StructurePageDiff["removed"] = [];
  const changed: StructureNodeChange[] = [];

  for (const [id, entry] of right) {
    const previous = left.get(id);
    if (!previous) {
      added.push({ specId: id, path: entry.path, type: entry.node.type });
      continue;
    }
    if (previous.node.type !== entry.node.type) {
      changed.push({ specId: id, kind: "type", before: previous.node.type, after: entry.node.type });
    }
    const beforeTitle = typeof previous.node.props?.title === "string" ? previous.node.props.title : undefined;
    const afterTitle = typeof entry.node.props?.title === "string" ? entry.node.props.title : undefined;
    if (beforeTitle !== afterTitle) {
      changed.push({ specId: id, kind: "prop", property: "title", ...(beforeTitle === undefined ? {} : { before: beforeTitle }), ...(afterTitle === undefined ? {} : { after: afterTitle }) });
    }
    if (previous.parentId !== entry.parentId) {
      changed.push({ specId: id, kind: "moved", ...(previous.parentId === undefined ? {} : { before: previous.parentId }), ...(entry.parentId === undefined ? {} : { after: entry.parentId }) });
    }
  }
  for (const [id, entry] of left) {
    if (!right.has(id)) removed.push({ specId: id, path: entry.path, type: entry.node.type });
  }

  return { pageId: after.meta.pageId, added, removed, changed };
}
```

Export from `core/compiler/src/index.ts`:

```ts
export { diffPageStructure } from "./structure-diff.js";
```

- [ ] **Step 4: Implement the CLI**

Create `runtimes/standalone/src/structure-diff-cli.ts`:
- Parse `--before <spec-run>`, `--after <spec-run>`, `--page <id>` optional, `--out <file>`.
- Load page specs from both runs (`artifacts/page-spec/*.json`), match by pageId, call `diffPageStructure`, write `structure-diff.json`.
- Add script:

```json
"structure:diff": "tsx runtimes/standalone/src/structure-diff-cli.ts",
```

- [ ] **Step 5: Run the test and CLI smoke**

Run:
```bash
pnpm exec vitest run core/compiler/tests/structure-diff.test.ts
pnpm structure:diff --before artifacts/employee-app-phase2/figma/spec-source --after artifacts/employee-app-phase2/figma/spec-source --out /tmp/struct-diff.json
```
Expected: test PASS; CLI writes a diff with empty added/removed/changed lists.

- [ ] **Step 6: Commit**

```bash
git add core/contracts/src/structure.ts core/compiler/src/structure-diff.ts core/compiler/src/index.ts core/compiler/tests/structure-diff.test.ts runtimes/standalone/src/structure-diff-cli.ts package.json
git commit -m "feat(compiler): diff page structure between spec runs"
```

---

## Batch 4 — Block generation experiment

### Task 14: Add block contracts and deterministic split/assemble

**Files:**
- Create: `pipeline/core/contracts/src/block.ts`
- Modify: `pipeline/core/contracts/src/page-spec.ts` (export `SpecNodeSchema`)
- Modify: `pipeline/core/contracts/src/index.ts`
- Create: `pipeline/core/compiler/src/blocks.ts`
- Modify: `pipeline/core/compiler/src/index.ts`
- Test: `pipeline/core/compiler/tests/blocks.test.ts`

**Interfaces:**
- Produces:
  - `BlockSpec`, `BlockManifest`
  - `splitBlocks(spec: PageSpec, archetype: ArchetypeDef): BlockManifest`
  - `assembleBlocks(spec: PageSpec, manifest: BlockManifest): PageSpec`
  - `verifyBlockManifest(spec: PageSpec, manifest: BlockManifest): Finding[]`

- [ ] **Step 1: Write the failing tests**

Create `core/compiler/tests/blocks.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UiBriefSchema, type PageSpec } from "@prd-ui/contracts";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { compileProject } from "../src/index.js";
import { assembleBlocks, splitBlocks, verifyBlockManifest } from "../src/blocks.js";

const brief = UiBriefSchema.parse(
  JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${key}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

describe("blocks", () => {
  it("splits and reassembles every phase2 page without changing the tree", () => {
    for (const spec of specs) {
      const manifest = splitBlocks(spec, getArchetype(spec.meta.archetype));
      expect(manifest.blocks.length, spec.meta.pageId).toBeGreaterThan(0);
      const assembled = assembleBlocks(spec, manifest);
      expect(canonical(assembled), spec.meta.pageId).toBe(canonical(spec));
      expect(verifyBlockManifest(spec, manifest)).toHaveLength(0);
    }
  });

  it("keeps the page shell and actions out of blocks", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = splitBlocks(today, getArchetype(today.meta.archetype));
    for (const block of manifest.blocks) {
      expect(block.slot).not.toBe("actions");
      expect(block.slot).not.toBe("top-bar");
      expect(block.slot).not.toBe("bottom-nav");
      expect(block.root.type).not.toBe("MobileShell");
    }
  });

  it("splits today into multiple card blocks", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = splitBlocks(today, getArchetype(today.meta.archetype));
    expect(manifest.blocks.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a block that contains the mobile shell", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = structuredClone(splitBlocks(today, getArchetype(today.meta.archetype)));
    manifest.blocks[0]!.root = structuredClone(today.layout);
    const findings = verifyBlockManifest(today, manifest);
    expect(findings.some((finding) => finding.ruleId === "BLOCK_SHELL_TYPE")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm exec vitest run core/compiler/tests/blocks.test.ts
```
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add block contracts**

In `core/contracts/src/page-spec.ts`, change `const SpecNodeSchema` to `export const SpecNodeSchema` so block drafts can validate subtrees.

Create `core/contracts/src/block.ts`:

```ts
import { z } from "zod";
import { SpecNodeSchema, type SpecNode } from "./page-spec.js";

export interface BlockSpec {
  schemaVersion: "1.0";
  blockId: string;
  pageId: string;
  slot: string;
  index: number;
  role: string;
  allowedComponents: string[];
  tokenProfile: string;
  targetHeight?: { min: number; max: number };
  requiredStates: string[];
  root: SpecNode;
  hash: string;
}

export interface BlockManifest {
  schemaVersion: "1.0";
  project: string;
  pageId: string;
  shell: {
    rootType: string;
    slots: string[];
    wrappers: Array<{
      slot: string;
      specId: string;
      type: string;
      padding?: unknown;
      gap?: unknown;
    }>;
  };
  blocks: BlockSpec[];
  skipped: Array<{ path: string; reason: string }>;
}

export interface BlockContentDraft {
  schemaVersion: "1.0";
  blockId: string;
  root: SpecNode;
}

export const BlockContentDraftSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    blockId: z.string().min(1),
    root: SpecNodeSchema,
  })
  .strict();

export interface BlockExperimentMetrics {
  blockId: string;
  retries: number;
  seams: number;
  tokenDrift: number;
  heightDeltaPct?: number;
}

export interface BlockExperimentPage {
  pageId: string;
  metrics: BlockExperimentMetrics[];
  pageRetries: number;
  costCny: number;
  durationMs: number;
  conformancePassed?: boolean;
  parityPassed?: boolean;
}

export interface BlockExperimentReport {
  schemaVersion: "1.0";
  project: string;
  baseline: string;
  pages: BlockExperimentPage[];
  conclusion: "promote" | "rollback" | "insufficient_evidence";
  reasons: string[];
}
```

Export from `core/contracts/src/index.ts`.

- [ ] **Step 4: Implement split/assemble**

Create `core/compiler/src/blocks.ts`:

```ts
import { createHash } from "node:crypto";
import type {
  BlockManifest,
  BlockSpec,
  Finding,
  PageSpec,
  SpecNode,
} from "@prd-ui/contracts";
import type { ArchetypeDef } from "@prd-ui/design-system";

const SHELL_SLOTS = new Set(["top-bar", "tab-bar", "bottom-nav", "actions", "footer", "header"]);
const SHELL_TYPES = new Set(["MobileShell", "PageShell"]);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${key}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashNode(node: SpecNode): string {
  return `sha256:${createHash("sha256").update(canonical(node)).digest("hex")}`;
}

function slug(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length === 0 ? fallback : text.replace(/\s+/g, "-").slice(0, 40);
}

export function splitBlocks(spec: PageSpec, archetype: ArchetypeDef): BlockManifest {
  const blocks: BlockSpec[] = [];
  const wrappers: BlockManifest["shell"]["wrappers"] = [];

  for (const [slot, nodes] of Object.entries(spec.layout.slots ?? {})) {
    if (SHELL_SLOTS.has(slot)) continue;
    let candidates = nodes;
    if (nodes.length === 1 && nodes[0]?.type === "Section" && (nodes[0].children?.length ?? 0) >= 2) {
      const wrapper = nodes[0]!;
      wrappers.push({
        slot,
        specId: wrapper.id ?? `${spec.meta.pageId}.${slot}.wrapper`,
        type: wrapper.type,
        padding: wrapper.props?.padding,
        gap: wrapper.props?.gap,
      });
      candidates = wrapper.children ?? [];
    }
    candidates.forEach((root, index) => {
      const blockId = `${spec.meta.pageId}.${slot}.${index}`;
      blocks.push({
        schemaVersion: "1.0",
        blockId,
        pageId: spec.meta.pageId,
        slot,
        index,
        role: slug(root.props?.title, root.type.toLowerCase()),
        allowedComponents: [...archetype.allowedComponents],
        tokenProfile: spec.meta.profile,
        requiredStates: [...archetype.requiredStates],
        root,
        hash: hashNode(root),
      });
    });
  }

  return {
    schemaVersion: "1.0",
    project: spec.meta.project,
    pageId: spec.meta.pageId,
    shell: {
      rootType: spec.layout.type,
      slots: Object.keys(spec.layout.slots ?? {}),
      wrappers,
    },
    blocks,
    skipped: [],
  };
}

export function assembleBlocks(spec: PageSpec, manifest: BlockManifest): PageSpec {
  const assembled = structuredClone(spec);
  for (const [slot, nodes] of Object.entries(assembled.layout.slots ?? {})) {
    if (SHELL_SLOTS.has(slot)) continue;
    const slotBlocks = manifest.blocks
      .filter((block) => block.slot === slot)
      .sort((left, right) => left.index - right.index)
      .map((block) => structuredClone(block.root));
    const wrapper = manifest.shell.wrappers.find((entry) => entry.slot === slot);
    if (wrapper) {
      const target = nodes.find((node) => node.id === wrapper.specId) ??
        (nodes.length === 1 ? nodes[0] : undefined);
      if (target) target.children = slotBlocks;
    } else {
      assembled.layout.slots![slot] = slotBlocks;
    }
  }
  return assembled;
}

function walk(node: SpecNode, visit: (node: SpecNode, parent?: SpecNode) => void, parent?: SpecNode): void {
  visit(node, parent);
  (node.children ?? []).forEach((child) => walk(child, visit, node));
  for (const nodes of Object.values(node.slots ?? {})) {
    nodes.forEach((child) => walk(child, visit, node));
  }
}

export function verifyBlockManifest(spec: PageSpec, manifest: BlockManifest): Finding[] {
  const findings: Finding[] = [];
  const push = (ruleId: string, location: string, evidence: string, issue: string): void => {
    findings.push({ id: `${ruleId}-${findings.length + 1}`, ruleId, severity: "blocker", category: "block", location, evidence, issue });
  };
  const ids = new Set<string>();
  for (const block of manifest.blocks) {
    if (SHELL_TYPES.has(block.root.type)) {
      push("BLOCK_SHELL_TYPE", block.blockId, block.root.type, "A block must not contain the page shell.");
    }
    walk(block.root, (node) => {
      if (!node.id) return;
      if (ids.has(node.id)) push("BLOCK_DUPLICATE_ID", block.blockId, node.id, `Duplicate node id ${node.id}.`);
      ids.add(node.id);
    });
  }
  for (const [slot, nodes] of Object.entries(spec.layout.slots ?? {})) {
    if (SHELL_SLOTS.has(slot)) continue;
    const wrapper = manifest.shell.wrappers.find((entry) => entry.slot === slot);
    const roots = wrapper
      ? nodes.find((node) => node.id === wrapper.specId)?.children ?? []
      : nodes;
    const actualIds = roots.map((node) => node.id ?? "");
    const blockIds = manifest.blocks
      .filter((block) => block.slot === slot)
      .sort((left, right) => left.index - right.index)
      .map((block) => block.root.id ?? "");
    if (actualIds.join("|") !== blockIds.join("|")) {
      push("BLOCK_ORDER", slot, blockIds.join(","), "Block order or count does not match the page.");
    }
  }
  if (canonical(assembleBlocks(spec, manifest)) !== canonical(spec)) {
    push("BLOCK_ROUNDTRIP_MISMATCH", manifest.pageId, "roundtrip", "split → assemble changed the page tree.");
  }
  return findings;
}
```

Export from `core/compiler/src/index.ts`:

```ts
export { assembleBlocks, splitBlocks, verifyBlockManifest } from "./blocks.js";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
pnpm exec vitest run core/compiler/tests/blocks.test.ts
```
Expected: PASS for all 8 pages. If round-trip fails for a page, inspect whether the wrapper detection picked a Section whose children are not the only content; fix the detection instead of relaxing the assertion.

- [ ] **Step 6: Commit**

```bash
git add core/contracts/src/block.ts core/contracts/src/index.ts core/compiler/src/blocks.ts core/compiler/src/index.ts core/compiler/tests/blocks.test.ts
git commit -m "feat(compiler): split and assemble page blocks"
```

---

### Task 15: Write block manifests in spec:engineer and add `block:verify`

**Files:**
- Modify: `pipeline/runtimes/standalone/src/spec-cli.ts`
- Create: `pipeline/runtimes/standalone/src/block-verify-cli.ts`
- Modify: `pipeline/package.json`
- Test: `pipeline/runtimes/standalone/tests/spec-cli.test.ts`

**Interfaces:**
- Produces: `artifacts/block-manifest/<pageId>.json`; `block:verify` report

- [ ] **Step 1: Write the failing test**

Add to `runtimes/standalone/tests/spec-cli.test.ts`:

```ts
it("writes a block manifest for every page", async () => {
  const runsDir = await tempDir("spec-blocks-");
  const code = await main([
    "--project", projectPath,
    "--agent-run", agentRunDir,
    "--runs", runsDir,
  ], { stdout: () => {}, stderr: () => {} });
  expect(code).toBe(0);
  const runDir = (await readdir(runsDir))[0]!;
  for (const page of ["today", "appointment-list"]) {
    const manifest = JSON.parse(
      await readFile(path.join(runsDir, runDir, "artifacts", "block-manifest", `${page}.json`), "utf8")
    );
    expect(manifest.blocks.length).toBeGreaterThan(0);
    expect(manifest.pageId).toBe(page);
  }
});
```

Reuse the existing `tempDir` helper and fixtures in that test file.

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm exec vitest run runtimes/standalone/tests/spec-cli.test.ts
```
Expected: FAIL because no block manifests are written.

- [ ] **Step 3: Write the manifests in `spec:engineer`**

In `runtimes/standalone/src/spec-cli.ts`, inside `if (result.gate.passed)`:

```ts
for (const spec of result.specs) {
  const manifest = splitBlocks(spec, getArchetype(spec.meta.archetype));
  await store.writeJson(`artifacts/block-manifest/${spec.meta.pageId}.json`, manifest);
}
```

Import `splitBlocks` from `@prd-ui/compiler`.

- [ ] **Step 4: Implement `block:verify`**

Create `runtimes/standalone/src/block-verify-cli.ts`:
- Parse `--spec-run <dir>`, `--out <file>`, `--json`.
- Load specs and their manifests; call `verifyBlockManifest`; aggregate.
- Write:

```json
{
  "schemaVersion": "1.0",
  "project": "employee-app-phase2",
  "generatedAt": "2026-10-26T00:00:00.000Z",
  "pages": [{ "pageId": "today", "passed": true, "findings": [] }],
  "summary": { "passed": true, "blockers": 0 }
}
```

- Add script:

```json
"block:verify": "tsx runtimes/standalone/src/block-verify-cli.ts",
```

- [ ] **Step 5: Run tests and the CLI**

Run:
```bash
pnpm exec vitest run runtimes/standalone/tests/spec-cli.test.ts
pnpm block:verify --spec-run /tmp/spec-v07/<runId> --out /tmp/block-verify.json
```
Expected: tests PASS; verify reports 8 pages passed.

- [ ] **Step 6: Commit**

```bash
git add runtimes/standalone/src/spec-cli.ts runtimes/standalone/src/block-verify-cli.ts runtimes/standalone/tests/spec-cli.test.ts package.json
git commit -m "feat(blocks): emit block manifests and verify assembly"
```

---

### Task 16: Add the fixture-driven block experiment harness

**Files:**
- Create: `pipeline/core/compiler/src/block-experiment.ts`
- Modify: `pipeline/core/compiler/src/index.ts`
- Create: `pipeline/runtimes/standalone/src/block/generator.ts`
- Create: `pipeline/runtimes/standalone/src/block/metrics.ts`
- Create: `pipeline/runtimes/standalone/src/block-experiment-cli.ts`
- Create fixtures: `pipeline/samples/agents/blocks/today/*.json`
- Create fixtures: `pipeline/samples/agents/blocks/appointment-list/*.json`
- Modify: `pipeline/package.json`
- Test: `pipeline/core/compiler/tests/block-experiment.test.ts`
- Test: `pipeline/runtimes/standalone/tests/block-metrics.test.ts`

**Interfaces:**
- Produces:
  - `countRawStyleValues(node: SpecNode): number`
  - `countSeams(blocks: BlockSpec[], profile: Profile): number`
  - `evaluateBlockExperiment(input): BlockExperimentReport`
  - `FixtureBlockGenerator`

- [ ] **Step 1: Write the failing tests**

Create `core/compiler/tests/block-experiment.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UiBriefSchema } from "@prd-ui/contracts";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { compileProject } from "../src/index.js";
import { splitBlocks } from "../src/blocks.js";
import { countRawStyleValues, countSeams, evaluateBlockExperiment } from "../src/block-experiment.js";

const brief = UiBriefSchema.parse(
  JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
const today = specs.find((spec) => spec.meta.pageId === "today")!;
const manifest = splitBlocks(today, getArchetype(today.meta.archetype));

describe("block experiment metrics", () => {
  it("counts raw style values", () => {
    expect(countRawStyleValues({ type: "Card", id: "x", props: { padding: "16px", title: "x" } })).toBe(1);
    expect(countRawStyleValues({ type: "Card", id: "y", props: { padding: "space.4" } })).toBe(0);
  });

  it("counts seams at block boundaries", () => {
    const blocks = structuredClone(manifest.blocks);
    blocks[0]!.root.props = { ...blocks[0]!.root.props, padding: "space.4" };
    blocks[1]!.root.props = { ...blocks[1]!.root.props, padding: "space.4" };
    expect(countSeams(blocks, getProfile(today.meta.profile))).toBeGreaterThan(0);
  });

  it("returns insufficient evidence when parity was not evaluated", () => {
    const report = evaluateBlockExperiment({
      project: today.meta.project,
      baseline: "run-x",
      pages: [
        {
          pageId: "today",
          pageRetries: 0,
          costCny: 0,
          durationMs: 10,
          metrics: manifest.blocks.map((block) => ({
            blockId: block.blockId,
            retries: 0,
            seams: 0,
            tokenDrift: 0,
          })),
          conformancePassed: true,
        },
      ],
    });
    expect(report.conclusion).toBe("insufficient_evidence");
  });
});
```

Create `runtimes/standalone/tests/block-metrics.test.ts`:

```ts
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FixtureBlockGenerator } from "../src/block/generator.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("FixtureBlockGenerator", () => {
  it("loads a block fixture by page and block id", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "block-fixture-"));
    dirs.push(dir);
    await mkdir(path.join(dir, "today"), { recursive: true });
    await writeFile(
      path.join(dir, "today", "today.content.0.json"),
      JSON.stringify({ schemaVersion: "1.0", blockId: "today.content.0", root: { id: "today.content.0", type: "Card", props: { title: "x" }, children: [] } }),
      "utf8"
    );
    const generator = new FixtureBlockGenerator(dir);
    const draft = await generator.generate({ pageId: "today", blockId: "today.content.0", prompt: "" });
    expect(draft.blockId).toBe("today.content.0");
    expect(draft.root.type).toBe("Card");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm exec vitest run core/compiler/tests/block-experiment.test.ts runtimes/standalone/tests/block-metrics.test.ts
```
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the pure metrics**

Create `core/compiler/src/block-experiment.ts`:

```ts
import type {
  BlockExperimentReport,
  BlockSpec,
  Profile,
  SpecNode,
} from "@prd-ui/contracts";

const RAW_STYLE = /(#[0-9a-fA-F]{3,8}\b)|\brgba?\(|\bhsla?\(|\b\d+(\.\d+)?(px|rem|em)\b/;

function walk(node: SpecNode, visit: (node: SpecNode) => void): void {
  visit(node);
  (node.children ?? []).forEach((child) => walk(child, visit));
  for (const nodes of Object.values(node.slots ?? {})) nodes.forEach((child) => walk(child, visit));
}

export function countRawStyleValues(node: SpecNode): number {
  let count = 0;
  walk(node, (entry) => {
    for (const value of Object.values(entry.props ?? {})) {
      if (typeof value === "string" && RAW_STYLE.test(value)) count += 1;
    }
  });
  return count;
}

function paddingValue(value: unknown, profile: Profile): number {
  if (typeof value !== "string") return 0;
  const key = value.replace(/^space[.-]/, "");
  const raw = profile.space[key];
  return raw === undefined ? 0 : Number.parseInt(raw, 10) || 0;
}

export function countSeams(blocks: BlockSpec[], profile: Profile): number {
  let count = 0;
  for (let index = 1; index < blocks.length; index += 1) {
    const previous = blocks[index - 1]!;
    const current = blocks[index]!;
    const previousBottom = paddingValue(previous.root.props?.padding, profile);
    const currentTop = paddingValue(current.root.props?.padding, profile);
    if (previousBottom > 0 && currentTop > 0) count += 1;
    const previousTitle = previous.root.props?.title;
    const currentTitle = current.root.props?.title;
    if (typeof previousTitle === "string" && previousTitle === currentTitle && previousTitle.length > 0) {
      count += 1;
    }
  }
  return count;
}

export function evaluateBlockExperiment(input: {
  project: string;
  baseline: string;
  pages: Array<{
    pageId: string;
    pageRetries: number;
    costCny: number;
    durationMs: number;
    metrics: Array<{
      blockId: string;
      retries: number;
      seams: number;
      tokenDrift: number;
      heightDeltaPct?: number;
    }>;
    conformancePassed?: boolean;
    parityPassed?: boolean;
  }>;
}): BlockExperimentReport {
  const reasons: string[] = [];
  const allMetrics = input.pages.flatMap((page) => page.metrics);
  const seams = allMetrics.reduce((sum, metric) => sum + metric.seams, 0);
  const retries = allMetrics.reduce((sum, metric) => sum + metric.retries, 0);
  const cost = input.pages.reduce((sum, page) => sum + page.costCny, 0);
  const heightDeltas = allMetrics
    .map((metric) => metric.heightDeltaPct)
    .filter((value): value is number => value !== undefined);
  const conformance = input.pages.every((page) => page.conformancePassed === true);
  const parityEvaluated = input.pages.every((page) => page.parityPassed !== undefined);
  const parity = input.pages.every((page) => page.parityPassed !== false);

  if (seams > 0) reasons.push(`seams=${seams}`);
  if (retries > 6) reasons.push(`retries=${retries}`);
  if (cost > 3) reasons.push(`cost=${cost}`);
  if (heightDeltas.some((value) => Math.abs(value) > 5)) reasons.push("heightDelta>5%");
  if (!conformance) reasons.push("conformance failed");
  if (!parityEvaluated) reasons.push("parity not evaluated");
  if (!parity) reasons.push("parity failed");

  const hardFailure = reasons.some((reason) => reason !== "parity not evaluated");
  const conclusion = hardFailure
    ? "rollback"
    : parityEvaluated
      ? "promote"
      : "insufficient_evidence";

  return {
    schemaVersion: "1.0",
    project: input.project,
    baseline: input.baseline,
    pages: input.pages,
    conclusion,
    reasons,
  };
}
```

Export from `core/compiler/src/index.ts`.

- [ ] **Step 4: Implement the fixture generator**

Create `runtimes/standalone/src/block/generator.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BlockContentDraftSchema, type BlockContentDraft } from "@prd-ui/contracts";

export interface BlockGenerateInput {
  pageId: string;
  blockId: string;
  prompt: string;
}

export interface BlockGeneratorPort {
  generate(input: BlockGenerateInput): Promise<BlockContentDraft>;
}

export class FixtureBlockGenerator implements BlockGeneratorPort {
  constructor(private readonly fixturesDir: string) {}

  async generate(input: BlockGenerateInput): Promise<BlockContentDraft> {
    const file = path.join(this.fixturesDir, input.pageId, `${input.blockId}.json`);
    return BlockContentDraftSchema.parse(JSON.parse(await readFile(file, "utf8")));
  }
}
```

`BlockContentDraftSchema` was added in Task 14; export it from `core/contracts/src/index.ts` if it is not already covered by the `block.js` star export.

- [ ] **Step 5: Generate fixtures from the baseline blocks**

Generate the fixtures with this one-off script (run it from `pipeline/`, then delete it):

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PageSpecSchema } from "@prd-ui/contracts";
import { getArchetype } from "@prd-ui/design-system";
import { splitBlocks } from "@prd-ui/compiler";

const pages = ["today", "appointment-list"];
for (const pageId of pages) {
  const file = `artifacts/employee-app-phase2/figma/spec-source/artifacts/page-spec/${pageId}.json`;
  const spec = PageSpecSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const manifest = splitBlocks(spec, getArchetype(spec.meta.archetype));
  const dir = path.join("samples/agents/blocks", pageId);
  await mkdir(dir, { recursive: true });
  for (const block of manifest.blocks) {
    await writeFile(
      path.join(dir, `${block.blockId}.json`),
      `${JSON.stringify({ schemaVersion: "1.0", blockId: block.blockId, root: block.root }, null, 2)}\n`,
      "utf8"
    );
  }
}
```

Run it with `pnpm exec tsx <script>.ts`, commit the generated fixtures, then delete the script. Do not hand-edit ids.

- [ ] **Step 6: Implement the experiment CLI**

Create `runtimes/standalone/src/block-experiment-cli.ts`:
- Parse `--project`, `--baseline`, `--pages`, `--fixtures` or `--runtime dsh`, `--max-cost-cny`, `--runs`, `--json`.
- Load baseline specs; split blocks.
- Generate each block with `FixtureBlockGenerator` (fixtures mode) or a dsh generator (Task 17).
- Validate each draft with `verifyBlockManifest` after substitution, `countSeams`, `countRawStyleValues`.
- Assemble, run `validatePageSpec` with contexts if available (structure rules are warning-only; report counts).
- Render HTML with `renderDocument` to `runs/<id>/html` and call `measurePages`; compute height delta vs baseline measurement.
- Build plans with `compileFigmaPlans(assembledSpecs, ...)`, capture styles with `captureStyleManifests`, and call `comparePlanToStyleManifest` per page to fill `page.conformancePassed`. This does not need Figma.
- If a signed baseline and Figma PNGs are available, run `evaluateParityPage` / the parity CLI to fill `page.parityPassed`; otherwise leave it undefined.
- Write `block-experiment.json` and `block-experiment.md` with the conclusion.

Keep the first implementation fixture-only; Task 17 adds the dsh generator. If the page/target has no HTML measurement, record `heightDeltaPct` as undefined.

- [ ] **Step 7: Add the script and run the fixture experiment**

Add to `package.json`:

```json
"block:experiment": "tsx runtimes/standalone/src/block-experiment-cli.ts",
```

Run:
```bash
pnpm exec vitest run core/compiler/tests/block-experiment.test.ts runtimes/standalone/tests/block-metrics.test.ts
pnpm block:experiment \
  --project samples/projects/employee-app-phase2/project.yaml \
  --baseline artifacts/employee-app-phase2/figma/spec-source \
  --pages today,appointment-list \
  --fixtures samples/agents/blocks \
  --runs /tmp/block-fixture-v07
```
Expected: tests PASS; report conclusion is `insufficient_evidence` (parity not evaluated), seams 0, retries 0, cost 0.

- [ ] **Step 8: Commit**

```bash
git add core/compiler/src/block-experiment.ts core/compiler/src/index.ts core/compiler/tests/block-experiment.test.ts runtimes/standalone/src/block/generator.ts runtimes/standalone/src/block/metrics.ts runtimes/standalone/src/block-experiment-cli.ts runtimes/standalone/tests/block-metrics.test.ts samples/agents/blocks package.json
git commit -m "feat(blocks): add fixture-driven block experiment"
```

---

### Task 17: Add the M1 block generator and experiment conclusion

**Files:**
- Create: `pipeline/core/agents/src/block-content.ts`
- Modify: `pipeline/core/agents/src/index.ts`
- Modify: `pipeline/core/agents/src/contracts.ts` (`AgentTaskRoleSchema` adds `"block-content"`)
- Create: `pipeline/runtimes/standalone/src/block/dsh-generator.ts`
- Modify: `pipeline/runtimes/standalone/src/block-experiment-cli.ts` (wire `--runtime dsh`)
- Test: `pipeline/core/agents/tests/block-content.test.ts`

**Interfaces:**
- Produces:
  - `BLOCK_CONTENT_ROLE = "block-content"`
  - `blockContentPrompt(input): string`
  - `validateBlockContent(value: unknown): AgentValidation`
  - `DshBlockGenerator implements BlockGeneratorPort`

- [ ] **Step 1: Write the failing test**

Create `core/agents/tests/block-content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateBlockContent } from "../src/index.js";

describe("block content", () => {
  it("accepts a valid block draft", () => {
    const result = validateBlockContent({
      schemaVersion: "1.0",
      blockId: "today.content.0",
      root: { id: "today.content.0", type: "Card", props: { title: "今日" }, children: [] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a draft with a shell root", () => {
    const result = validateBlockContent({
      schemaVersion: "1.0",
      blockId: "today.content.0",
      root: { id: "today.content.0", type: "MobileShell", props: {}, slots: {} },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a draft with the wrong block id", () => {
    const result = validateBlockContent({
      schemaVersion: "1.0",
      blockId: "other.block",
      root: { id: "today.content.0", type: "Card", props: {}, children: [] },
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm exec vitest run core/agents/tests/block-content.test.ts
```
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the block content role**

Create `core/agents/src/block-content.ts`:

```ts
import { BlockContentDraftSchema, type BlockContentDraft } from "@prd-ui/contracts";
import type { AgentValidation } from "./contracts.js";

export const BLOCK_CONTENT_ROLE = "block-content" as const;

export function blockContentPrompt(input: {
  pageId: string;
  blockId: string;
  role: string;
  allowedComponents: string[];
  requiredStates: string[];
  baseline: unknown;
}): string {
  return [
    `You are filling one block of a mobile page. Page: ${input.pageId}. Block: ${input.blockId} (${input.role}).`,
    `Allowed component types: ${input.allowedComponents.join(", ")}.`,
    `Required states: ${input.requiredStates.join(", ")}.`,
    "Do not emit MobileShell, PageShell, TopBar, TabBar, BottomNav, or page-level actions.",
    "Keep every node id under the block id prefix and preserve the baseline structure where possible.",
    "Return a BlockContentDraft JSON object with schemaVersion, blockId, and root.",
    `Baseline block JSON:\n${JSON.stringify(input.baseline, null, 2)}`,
  ].join("\n");
}

export function validateBlockContent(value: unknown): AgentValidation {
  const parsed = BlockContentDraftSchema.safeParse(value);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }
  return { success: true, data: parsed.data };
}
```

Add `"block-content"` to `AgentTaskRoleSchema` in `core/agents/src/contracts.ts`.

Export from `core/agents/src/index.ts`.

- [ ] **Step 4: Implement the dsh generator**

Create `runtimes/standalone/src/block/dsh-generator.ts`:

```ts
import {
  BLOCK_CONTENT_ROLE,
  blockContentPrompt,
  validateBlockContent,
} from "@prd-ui/agents";
import { createDshAgentRunner } from "@prd-ui/runtime-dsh";
import type { BlockContentDraft } from "@prd-ui/contracts";
import type { BlockGenerateInput, BlockGeneratorPort } from "./generator.js";

export class DshBlockGenerator implements BlockGeneratorPort {
  constructor(
    private readonly options: {
      runDir: string;
      dshHome: string;
      profile: string;
      baseline: unknown;
      allowedComponents: string[];
      requiredStates: string[];
      role: string;
    }
  ) {}

  async generate(input: BlockGenerateInput): Promise<BlockContentDraft> {
    const runner = createDshAgentRunner({
      dshHome: this.options.dshHome,
      profile: this.options.profile,
      cwd: process.cwd(),
    });
    const result = await runner.run({
      role: BLOCK_CONTENT_ROLE,
      prompt: blockContentPrompt({
        pageId: input.pageId,
        blockId: input.blockId,
        role: this.options.role,
        allowedComponents: this.options.allowedComponents,
        requiredStates: this.options.requiredStates,
        baseline: this.options.baseline,
      }),
      schema: "BlockContentDraft",
      validate: validateBlockContent,
      runDir: this.options.runDir,
      inputFiles: [],
    });
    const parsed = validateBlockContent(result.output);
    if (!parsed.success) throw new Error(`BLOCK_CONTENT_INVALID: ${parsed.error}`);
    const draft = parsed.data as BlockContentDraft;
    if (draft.blockId !== input.blockId) {
      throw new Error(`BLOCK_CONTENT_ID_MISMATCH: ${draft.blockId} != ${input.blockId}`);
    }
    return draft;
  }
}
```

- [ ] **Step 5: Wire the dsh mode into the CLI**

In `block-experiment-cli.ts`, when `--runtime dsh` is present:
- Require `.env` to be exported by the caller; do not auto-load it.
- Add `--pricing <path>` (default `pricing.json`). Load it with `parsePricingConfig` + `resolvePricing` from `@prd-ui/contracts`.
- Build one `DshBlockGenerator` per block with the block's role/allowed components/required states.
- After each block, if `result.usage` exists, add `reviewCost(result.usage, pricing).cny` to the page cost. If the total exceeds `--max-cost-cny`, stop and mark `BUDGET_EXCEEDED`.
- Retry a failed block up to 2 times; retry assembly once; infra errors exit non-zero.

- [ ] **Step 6: Run the test and a real pilot**

Run:
```bash
pnpm exec vitest run core/agents/tests/block-content.test.ts
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm block:experiment \
  --project samples/projects/employee-app-phase2/project.yaml \
  --baseline artifacts/employee-app-phase2/figma/spec-source \
  --pages today,appointment-list \
  --runtime dsh --profile prd-ui-agents \
  --max-cost-cny 3 \
  --runs /tmp/block-experiment-dsh
```
Expected: test PASS; the real run writes `block-experiment.json` + `.md` with a `promote`, `rollback`, or `insufficient_evidence` conclusion and recorded cost ≤ ¥3. If parity is not run, the conclusion is `insufficient_evidence`; that is not a failure of the harness.

- [ ] **Step 7: Commit**

```bash
git add core/agents/src/block-content.ts core/agents/src/contracts.ts core/agents/src/index.ts core/agents/tests/block-content.test.ts runtimes/standalone/src/block/dsh-generator.ts runtimes/standalone/src/block-experiment-cli.ts
git commit -m "feat(blocks): add m1 block content generator"
```

---

## Batch 5 — Handoff and acceptance

### Task 18: Create `core/handoff` and the validation/manifest core

**Files:**
- Create: `pipeline/core/contracts/src/handoff.ts`
- Modify: `pipeline/core/contracts/src/index.ts`
- Create: `pipeline/core/handoff/package.json`
- Create: `pipeline/core/handoff/tsconfig.json`
- Create: `pipeline/core/handoff/src/index.ts`
- Create: `pipeline/core/handoff/src/validate.ts`
- Create: `pipeline/core/handoff/src/manifest.ts`
- Test: `pipeline/core/handoff/tests/handoff.test.ts`

**Interfaces:**
- Produces:
  - `HandoffFile`, `HandoffGate`, `HandoffManifest`, `HandoffIssue`, `HandoffInput`
  - `validateHandoff(input): HandoffIssue[]`
  - `buildHandoffManifest(input): HandoffManifest`

- [ ] **Step 1: Write the failing tests**

Create `core/handoff/tests/handoff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildHandoffManifest,
  validateHandoff,
  type HandoffInput,
} from "../src/index.js";

function input(): HandoffInput {
  return {
    project: "employee-app-phase2",
    generatedAt: "2026-10-26T00:00:00.000Z",
    pipelineVersion: "0.7.0",
    profile: "b-mobile",
    catalog: "b-mobile",
    pages: ["today", "appointment-list"],
    files: [
      { path: "html/today.html", sha256: "sha256:a", bytes: 10 },
      { path: "spec/page-spec/today.json", sha256: "sha256:b", bytes: 10 },
    ],
    gates: {
      verify: { passed: true, hash: "sha256:v" },
      conformance: { passed: true, hash: "sha256:c" },
      parity: { passed: true, hash: "sha256:p" },
      figmaSign: { passed: true, hash: "sha256:f" },
      visualSign: { passed: true, hash: "sha256:s" },
    },
    signoffs: [
      { type: "figma", signedBy: "tester", signedAt: "2026-10-26", hash: "sha256:f" },
      { type: "visual", signedBy: "tester", signedAt: "2026-10-26", hash: "sha256:s" },
    ],
    figma: {
      files: [{ pageId: "today", fileKey: "abc" }],
      pages: ["today", "appointment-list"],
    },
    assets: [],
    knownGaps: [],
  };
}

describe("handoff core", () => {
  it("accepts a complete input", () => {
    expect(validateHandoff(input())).toHaveLength(0);
    const manifest = buildHandoffManifest(input());
    expect(manifest.pages).toHaveLength(2);
    expect(manifest.files).toHaveLength(2);
  });

  it("rejects a failed gate", () => {
    const data = input();
    data.gates.parity = { passed: false, hash: "sha256:p" };
    expect(validateHandoff(data).some((issue) => issue.code === "HANDOFF_GATE_FAILED")).toBe(true);
  });

  it("rejects a missing page file", () => {
    const data = input();
    data.files = data.files.filter((file) => !file.path.includes("today"));
    expect(validateHandoff(data).some((issue) => issue.code === "HANDOFF_PAGE_MISSING")).toBe(true);
  });

  it("rejects a signoff hash mismatch", () => {
    const data = input();
    data.signoffs[0]!.hash = "sha256:wrong";
    expect(validateHandoff(data).some((issue) => issue.code === "HANDOFF_SIGNOFF_STALE")).toBe(true);
  });

  it("rejects an asset without a license", () => {
    const data = input();
    data.assets = [{ path: "assets/icon.svg", license: "" }];
    expect(validateHandoff(data).some((issue) => issue.code === "HANDOFF_LICENSE_MISSING")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm exec vitest run core/handoff/tests/handoff.test.ts
```
Expected: FAIL because the package does not exist.

- [ ] **Step 3: Add contracts and package scaffolding**

Create `core/handoff/package.json`:

```json
{
  "name": "@prd-ui/handoff",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@prd-ui/contracts": "workspace:*"
  }
}
```

Create `core/handoff/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "tests"]
}
```

Create `core/contracts/src/handoff.ts`:

```ts
export interface HandoffFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface HandoffGate {
  passed: boolean;
  hash: string;
}

export interface HandoffSignoff {
  type: "figma" | "visual";
  signedBy: string;
  signedAt: string;
  hash: string;
}

export interface HandoffAsset {
  path: string;
  license: string;
}

export interface HandoffInput {
  project: string;
  generatedAt: string;
  pipelineVersion: string;
  profile: string;
  catalog: string;
  pages: string[];
  files: HandoffFile[];
  gates: {
    verify: HandoffGate;
    conformance: HandoffGate;
    parity: HandoffGate;
    figmaSign: HandoffGate;
    visualSign: HandoffGate;
  };
  signoffs: HandoffSignoff[];
  figma: {
    files: Array<{ pageId: string; fileKey: string }>;
    pages: string[];
  };
  assets: HandoffAsset[];
  knownGaps: string[];
  archive?: HandoffFile;
}

export interface HandoffManifest extends Omit<HandoffInput, "assets"> {
  schemaVersion: "1.0";
}

export interface HandoffIssue {
  code:
    | "HANDOFF_GATE_FAILED"
    | "HANDOFF_PAGE_MISSING"
    | "HANDOFF_SIGNOFF_STALE"
    | "HANDOFF_LICENSE_MISSING";
  severity: "blocker" | "warning";
  message: string;
}
```

Export from `core/contracts/src/index.ts`.

- [ ] **Step 4: Implement validation and manifest composition**

Create `core/handoff/src/validate.ts`:

```ts
import type { HandoffInput, HandoffIssue } from "@prd-ui/contracts";

export function validateHandoff(input: HandoffInput): HandoffIssue[] {
  const issues: HandoffIssue[] = [];
  for (const [name, gate] of Object.entries(input.gates)) {
    if (!gate.passed) {
      issues.push({ code: "HANDOFF_GATE_FAILED", severity: "blocker", message: `${name} gate did not pass.` });
    }
  }
  for (const page of input.pages) {
    const hasHtml = input.files.some((file) => file.path === `html/${page}.html`);
    const hasSpec = input.files.some((file) => file.path === `spec/page-spec/${page}.json`);
    if (!hasHtml || !hasSpec) {
      issues.push({ code: "HANDOFF_PAGE_MISSING", severity: "blocker", message: `${page} is missing html or spec.` });
    }
  }
  for (const signoff of input.signoffs) {
    const gate = signoff.type === "figma" ? input.gates.figmaSign : input.gates.visualSign;
    if (signoff.hash !== gate.hash) {
      issues.push({ code: "HANDOFF_SIGNOFF_STALE", severity: "blocker", message: `${signoff.type} signoff hash is stale.` });
    }
  }
  for (const asset of input.assets) {
    if (asset.license.trim().length === 0) {
      issues.push({ code: "HANDOFF_LICENSE_MISSING", severity: "blocker", message: `${asset.path} has no license record.` });
    }
  }
  return issues;
}
```

Create `core/handoff/src/manifest.ts`:

```ts
import type { HandoffInput, HandoffManifest } from "@prd-ui/contracts";

export function buildHandoffManifest(input: HandoffInput): HandoffManifest {
  return {
    schemaVersion: "1.0",
    project: input.project,
    generatedAt: input.generatedAt,
    pipelineVersion: input.pipelineVersion,
    profile: input.profile,
    catalog: input.catalog,
    pages: input.pages,
    figma: input.figma,
    gates: input.gates,
    signoffs: input.signoffs,
    files: input.files,
    knownGaps: input.knownGaps,
    ...(input.archive === undefined ? {} : { archive: input.archive }),
  };
}
```

Export from `core/handoff/src/index.ts`:

```ts
export { validateHandoff } from "./validate.js";
export { buildHandoffManifest } from "./manifest.js";
export type {
  HandoffFile,
  HandoffGate,
  HandoffInput,
  HandoffIssue,
  HandoffManifest,
} from "@prd-ui/contracts";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
pnpm exec vitest run core/handoff/tests/handoff.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/contracts/src/handoff.ts core/contracts/src/index.ts core/handoff
git commit -m "feat(handoff): add handoff validation and manifest"
```

---

### Task 19: Implement `handoff:pack`

**Files:**
- Create: `pipeline/runtimes/standalone/src/handoff/files.ts`
- Create: `pipeline/runtimes/standalone/src/handoff/docs.ts`
- Create: `pipeline/runtimes/standalone/src/handoff-pack-cli.ts`
- Modify: `pipeline/runtimes/standalone/package.json` (add `@prd-ui/handoff`, `fflate`)
- Modify: `pipeline/package.json`
- Test: `pipeline/runtimes/standalone/tests/handoff-docs.test.ts`

**Interfaces:**
- Produces:
  - `generateHandoffMd(input): string`
  - `generateLicensesMd(input): string`
  - `collectFiles(root, exclude): Promise<HandoffFile[]>`
  - `writeHandoffZip(root, out): Promise<HandoffFile>`

- [ ] **Step 1: Write the failing test**

Create `runtimes/standalone/tests/handoff-docs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateHandoffMd, generateLicensesMd } from "../src/handoff/docs.js";

const input = {
  project: "employee-app-phase2",
  pages: [
    { pageId: "today", name: "今日", route: "/", archetype: "home", states: ["default", "empty"] },
  ],
  figma: { files: [{ pageId: "today", fileKey: "abc" }], pages: ["today"] },
  gates: {
    verify: { passed: true, hash: "sha256:v" },
    conformance: { passed: true, hash: "sha256:c" },
    parity: { passed: true, hash: "sha256:p" },
    figmaSign: { passed: true, hash: "sha256:f" },
    visualSign: { passed: true, hash: "sha256:s" },
  },
  knownGaps: ["Figma state frames are not included"],
  assets: [],
};

describe("handoff docs", () => {
  it("generates a deterministic HANDOFF.md with no placeholders", () => {
    const md = generateHandoffMd(input);
    expect(md).toContain("# employee-app-phase2 Handoff");
    expect(md).toContain("今日");
    expect(md).not.toMatch(/TBD|TODO|\{\{/);
  });

  it("writes an explicit no-assets LICENSES.md", () => {
    const md = generateLicensesMd(input);
    expect(md).toContain("无第三方资产");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm exec vitest run runtimes/standalone/tests/handoff-docs.test.ts
```
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement docs generation**

Create `runtimes/standalone/src/handoff/docs.ts`. The generated markdown must be deterministic (sort pages, no timestamps beyond the manifest's `generatedAt`). Include:

```md
# <project> Handoff

## 1. 页面清单
| 页面 | 路由 | Archetype | 状态 |

## 2. 本地查看
python3 -m http.server 8080
# open http://127.0.0.1:8080/html/<page>.html

## 3. 设计令牌与组件
Profile / catalog / token file pointers.

## 4. Figma
fileKey + page names.

## 5. 门禁与证据
Table of verify / conformance / parity / signoffs and their hashes.

## 6. 已知限制
<knownGaps>

## 7. 资产与授权
Pointer to LICENSES.md.
```

`generateLicensesMd` lists each asset path + license; when `assets.length === 0`, write `本交付包无第三方资产。`.

- [ ] **Step 4: Implement file collection, hashing, and zip**

Create `runtimes/standalone/src/handoff/files.ts`:

```ts
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
import type { HandoffFile } from "@prd-ui/contracts";

export async function collectFiles(root: string, exclude: Set<string>): Promise<HandoffFile[]> {
  const files: HandoffFile[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (exclude.has(relative)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, relative);
      } else if (entry.isFile()) {
        const buffer = await readFile(absolute);
        files.push({
          path: relative,
          sha256: `sha256:${createHash("sha256").update(buffer).digest("hex")}`,
          bytes: buffer.length,
        });
      }
    }
  };
  await walk(root, "");
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function writeHandoffZip(root: string, outFile: string): Promise<HandoffFile> {
  const entries: Record<string, Uint8Array> = {};
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile()) entries[relative] = new Uint8Array(await readFile(absolute));
    }
  };
  await walk(root, "");
  const archive = Buffer.from(zipSync(entries));
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, archive);
  return {
    path: path.basename(outFile),
    sha256: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
    bytes: archive.length,
  };
}
```

- [ ] **Step 5: Implement the CLI**

Create `runtimes/standalone/src/handoff-pack-cli.ts`:
- Parse `--spec-run`, `--html`, `--figma`, `--visual-run`, `--assets` (optional), `--out`, `--zip`, `--json`.
- Read page specs, block manifests, figma plans/readbacks/diffs/conformance/parity/signoff, visual state/signoff, baseline manifest.
- Build `HandoffInput` with all page files; call `validateHandoff`; if issues, print and return 1 without writing a partial package.
- Create `handoff/` staging directory, copy files into the layout from the design, generate `HANDOFF.md` / `LICENSES.md`, collect files, write manifest, optionally zip, update manifest with `archive`, rewrite manifest.
- Never include `handoff.manifest.json` in its own `files` list; include the archive only in `archive`.
- Ensure `HANDOFF.md` contains no `TBD`/`TODO`/`{{`.

Add dependencies:
```bash
pnpm --dir runtimes/standalone add @prd-ui/handoff@workspace:* fflate
```

Add script:
```json
"handoff:pack": "tsx runtimes/standalone/src/handoff-pack-cli.ts",
```

- [ ] **Step 6: Run tests and a fixture pack**

Run:
```bash
pnpm exec vitest run runtimes/standalone/tests/handoff-docs.test.ts core/handoff/tests/handoff.test.ts
pnpm handoff:pack \
  --spec-run artifacts/employee-app-phase2/figma/spec-source \
  --html artifacts/employee-app-phase2/html \
  --figma artifacts/employee-app-phase2/figma \
  --visual-run artifacts/employee-app-phase2/visual-review \
  --out /tmp/handoff-v07
```
Expected: docs tests PASS. The fixture pack may fail on stale v0.6 evidence (expected until Batch 0/2 produce fresh signed evidence); the failure must list exact missing/stale items, not write a partial package.

- [ ] **Step 7: Commit**

```bash
git add runtimes/standalone/src/handoff runtimes/standalone/src/handoff-pack-cli.ts runtimes/standalone/tests/handoff-docs.test.ts runtimes/standalone/package.json package.json pnpm-lock.yaml
git commit -m "feat(handoff): pack offline handoff directory and manifest"
```

---

### Task 20: Add `v07:smoke`, update docs, and run the full gate

**Files:**
- Create: `pipeline/runtimes/standalone/src/v07-smoke-cli.ts`
- Modify: `pipeline/package.json`
- Modify: `AGENTS.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/2026-10-23-version-roadmap.md`
- Create: `docs/handoffs/2026-10-26-v07-implementation-handoff.md`
- Evidence: `pipeline/artifacts/employee-app-phase2/{figma,render,blocks,handoff}/`

**Interfaces:**
- Produces: `v07:smoke` command and the v0.7 evidence bundle.

- [ ] **Step 1: Implement the smoke CLI**

Create `runtimes/standalone/src/v07-smoke-cli.ts` that runs, in order, and stops on the first failure:

```text
figma:conformance
render:measure
structure:check
figma:parity
```

Use `node:child_process.spawn` with the same Node executable and `tsx` binary, or import the CLI `main` functions and call them sequentially. Print one JSON summary:

```json
{
  "conformance": { "passed": true, "blockers": 0 },
  "measure": { "pages": 8 },
  "structure": { "warnings": 0 },
  "parity": { "passed": true, "failed": 0 }
}
```

Add script:

```json
"v07:smoke": "tsx runtimes/standalone/src/v07-smoke-cli.ts",
```

- [ ] **Step 2: Run the full automated suite**

Run:
```bash
pnpm test
pnpm typecheck
pnpm test:dsh
pnpm --dir runtimes/figma typecheck
pnpm --dir runtimes/figma build
```
Expected: all pass; record the test count in the handoff. If `pnpm test:dsh` needs the pinned binary, run it; do not set `SKIP_DSH=1` for the final evidence.

- [ ] **Step 3: Run the real 8-page gate chain**

Run, in order, with the fresh baseline from Task 0:

```bash
pnpm figma:plan --spec-run artifacts/employee-app-phase2/figma/spec-source --out artifacts/employee-app-phase2/figma/plans
# Run the server in a separate terminal; it blocks.
pnpm figma:serve --figma artifacts/employee-app-phase2/figma --port 9600
# In Figma desktop: load the plugin, set http://127.0.0.1:9600, load each plan URL, Build.
# The plugin auto-saves readback JSON and PNG. Rebuild all 8 pages in scratch and delivery.
for plan in artifacts/employee-app-phase2/figma/plans/figma-plan.*.json; do
  page=$(basename "$plan" .json | sed 's/^figma-plan\.//')
  pnpm figma:verify \
    --plan "$plan" \
    --readback "artifacts/employee-app-phase2/figma/readback/figma-readback.$page.json" \
    --out "artifacts/employee-app-phase2/figma/diff/figma-diff.$page.json"
done
pnpm figma:conformance --spec-run artifacts/employee-app-phase2/figma/spec-source --html artifacts/employee-app-phase2/html --plans artifacts/employee-app-phase2/figma/plans --out artifacts/employee-app-phase2/figma/conformance
pnpm figma:parity --figma artifacts/employee-app-phase2/figma/parity --baseline baselines/employee-app-phase2 --spec-run artifacts/employee-app-phase2/figma/spec-source --out artifacts/employee-app-phase2/figma/parity
pnpm render:measure --spec-run artifacts/employee-app-phase2/figma/spec-source --html artifacts/employee-app-phase2/html --out artifacts/employee-app-phase2/render/metrics
pnpm structure:check --spec-run artifacts/employee-app-phase2/figma/spec-source --metrics artifacts/employee-app-phase2/render/metrics/render-metrics.json --out artifacts/employee-app-phase2/render/structure
pnpm v07:smoke
```
Expected: verify 8/8 passed; conformance 0 blockers; parity passes with the signed threshold; measure/structure written. If parity fails on text AA, record the scores and calibrate the threshold once with a human-signed `parity.config.json` — do not mask structural mismatches.

- [ ] **Step 4: Run the defect-injection acceptance**

Create three temporary mutations and prove each gate fails:

1. Button style: set `ghost-chip` height to 36 in a copied plan; run `figma:conformance`; expect `CONFORMANCE_STYLE_MISMATCH` on height.
2. Text content: change a tab label in a copied baseline/plan; run `figma:parity`; expect a failure.
3. Row divider: remove `borderBottom` from a copied plan's list row; run `figma:conformance`; expect `borderBottom` mismatch.
4. Unknown component: inject `Chart` into a copied spec; run `figma:plan` + `figma:verify`; expect `UNMAPPED_COMPONENT` with the spec id.

Record the commands and outputs in `docs/handoffs/2026-10-26-v07-implementation-handoff.md`.

- [ ] **Step 5: Run the new-project usability check**

Pick a different sample (for example `samples/projects/employee-app/project.yaml`):

```bash
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/v07-new-project
pnpm render:html --run /tmp/v07-new-project/<runId> --out /tmp/v07-new-project-html
pnpm figma:plan --spec-run /tmp/v07-new-project/<runId> --out /tmp/v07-new-project-plans
pnpm figma:conformance --spec-run /tmp/v07-new-project/<runId> --html /tmp/v07-new-project-html --plans /tmp/v07-new-project-plans --out /tmp/v07-new-project-conformance
```
Expected: `figma:plan` reports known-partial degradation only for types the compiler does not map (Switch), and `figma:conformance` runs without test-code changes. Record the real findings; do not claim a clean pass if the project has unmapped types.

- [ ] **Step 6: Pack the Handoff**

```bash
pnpm handoff:pack \
  --spec-run artifacts/employee-app-phase2/figma/spec-source \
  --html artifacts/employee-app-phase2/html \
  --figma artifacts/employee-app-phase2/figma \
  --visual-run artifacts/employee-app-phase2/visual-review \
  --assets artifacts/employee-app-phase2/asset-compiler \
  --out artifacts/employee-app-phase2/handoff \
  --zip
```
Expected: `HANDOFF.md`, `LICENSES.md`, `handoff.manifest.json`, optional `handoff.zip`; manifest file hashes verify; no placeholders; no failed/stale gates.

- [ ] **Step 7: Update docs and roadmap**

- `AGENTS.md`: add the new commands, evidence paths, and the v0.7 current state.
- `CHANGELOG.md`: add a v0.7 entry with the gate results.
- `docs/superpowers/plans/2026-10-23-version-roadmap.md`: mark v0.7 as implemented / signed according to the actual state.
- `docs/handoffs/2026-10-26-v07-implementation-handoff.md`: include test counts, gate results, defect-injection evidence, new-project findings, block experiment conclusion, and remaining debt.

- [ ] **Step 8: Commit evidence and docs**

```bash
git add AGENTS.md CHANGELOG.md docs/superpowers/plans/2026-10-23-version-roadmap.md docs/handoffs/2026-10-26-v07-implementation-handoff.md artifacts/employee-app-phase2/figma artifacts/employee-app-phase2/render artifacts/employee-app-phase2/blocks artifacts/employee-app-phase2/handoff
git commit -m "chore(v07): record visual gate, structure, block, and handoff evidence"
```

---

## Self-Review Checklist

- [ ] Spec §5.1 A1 is covered by Tasks 3–4.
- [ ] Spec §5.2 A2 is covered by Tasks 2, 5–6.
- [ ] Spec §5.3 A3 is covered by Tasks 8–9.
- [ ] Spec §5.4 A4 is covered by Task 10.
- [ ] Spec §5.5 figma signoff is covered by Task 11.
- [ ] Spec §6.1 B1 is covered by Task 7.
- [ ] Spec §6.2 B2 is covered by Task 12.
- [ ] Spec §6.3 B3 is covered by Task 13.
- [ ] Spec §7 C1/C2 is covered by Tasks 14–15.
- [ ] Spec §7.3/7.4 C3/C4 is covered by Tasks 16–17.
- [ ] Spec §8 Handoff is covered by Tasks 18–19.
- [ ] Spec §11.5 exit criteria are covered by Task 20.
- [ ] No task references a type or function that another task does not define.
- [ ] Every code step shows the actual test or implementation content.
- [ ] No `TBD`/`TODO`/`implement later` placeholders.
