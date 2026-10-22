# Phase 2 Exit Implementation Plan

> **Status: Completed (2026-10-21).** Tasks 1–7 were executed inline; verification
> evidence is in `CHANGELOG.md`, `pipeline/artifacts/employee-app-phase2/`, and the
> Phase 2 exit design spec. Commit steps were not executed; the working tree is
> uncommitted. Phase 2 exit relies on sample IA waivers and one deterministic
> brief patch; a clean intake rerun is the next cleanup item.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Phase 2 exit: per-profile M1 catalogs/motion, a standard-icon asset chain, and an 8-page real employee-app PRD that runs intake → M1 → Spec Engineer → HTML.

**Architecture:** Per-profile support is an additive prompt-input change (optional maps) that leaves the single-profile path untouched. Assets are derived deterministically from the brief and reviewed against the existing A-library. The 8-page real PRD is a new sample project assembled from the 00–04 employee-app docs; no original Markdown is modified.

**Tech Stack:** TypeScript ESM, vitest, tsx, dsh `0.2.1-rc.2`, pnpm workspace, Playwright MCP for visual checks.

## Global Constraints

- ESM everywhere; relative TS imports use `.js`.
- `core/` must not import `@deepseek-ai/*` or runtime adapters.
- Default offline tests must not need a real key; real dsh runs require `set -a; . ./.env; set +a` and `DSH_HOME="$PWD/dsh/home"`.
- Every real run uses `--max-cost-cny 3` unless the spec says otherwise.
- Do not fake asset passes: placeholders are recorded as degraded, never as pass.
- No push; local commits only.
- Keep 8-page demo-orders / 2-page employee-app / 4-page 03 Phase 1 at 0 blockers.
- Baseline: 500 tests, typecheck clean, `pnpm test:dsh` 2 passed.
- dsh profile for long runs: `prd-ui-intake` (65536 maxTokens).

## File Structure

```text
core/agents/src/roles/interaction.ts        per-profile prompt input + sections
core/agents/src/run-m1.ts                   M1 input fields + prompt wiring
core/agents/src/asset-inventory.ts          deterministic icon inventory (new)
core/agents/src/roles/visual-style.ts       exact asset-id prompt rule
core/agents/src/index.ts                    export asset inventory
core/agents/tests/contracts.test.ts         prompt unit tests
core/agents/tests/run-m1.test.ts            prompt propagation test
core/agents/tests/asset-inventory.test.ts   inventory tests (new)
runtimes/standalone/src/agent-cli.ts        collect profiles, pass maps
runtimes/standalone/src/asset-cli.ts        --briefs option
runtimes/standalone/tests/asset-cli.test.ts --briefs regression
core/compiler/src/compile-page-spec.ts      mobile-list SearchBar
core/compiler/tests/compiler.test.ts        search variant test
core/design-system/src/archetypes.ts        mobile-list allows SearchBar
core/design-system/tests/design-system.test.ts archetype/catalog test
core/agents/src/roles/ui-briefer.ts         home content rule
core/intake/tests/briefer-prompt.test.ts    prompt assertion
samples/projects/employee-app-phase2/       8-page real PRD project (new)
samples/agents/intake-employee-app-phase2/  scripted fixtures from real run (new)
docs/superpowers/specs/2026-10-21-phase-2-exit-per-profile-assets-design.md
pipeline/docs/agent-m1.md
pipeline/docs/asset-review-m0.md
README.md / AGENTS.md / CHANGELOG.md
```

---

## Task 1: Per-profile prompt contract

**Files:**
- Modify: `core/agents/src/roles/interaction.ts`
- Test: `core/agents/tests/contracts.test.ts`

**Interfaces:**
- Produces: `InteractionPromptInput.catalogsByProfile?: Record<string, unknown>`
- Produces: `InteractionPromptInput.motionTokensByProfile?: Record<string, unknown>`
- `buildInteractionPrompt(input): string` keeps its existing signature.

- [ ] **Step 1: Write the failing mixed-profile prompt test**

Add to `core/agents/tests/contracts.test.ts`:

```ts
it("injects per-profile catalogs and motion tokens", () => {
  const mixed = structuredClone(employeeBrief);
  mixed.ia.pages[0]!.profile = "b-mobile";
  mixed.ia.pages[1]!.profile = "c-expressive";
  const prompt = buildInteractionPrompt({
    brief: mixed,
    iaMap: IaOutputSchema.parse(iaOutput).map,
    catalogsByProfile: {
      "b-mobile": {
        meta: { library: "b-mobile" },
        components: [{ id: "ListRow", category: "data", props: { title: {} } }],
      },
      "c-expressive": {
        meta: { library: "c-expressive" },
        components: [{ id: "FeedCard", category: "content", props: { title: {} } }],
      },
    },
    motionTokensByProfile: {
      "b-mobile": { duration: { fast: "120ms" }, easing: { standard: "ease-out" } },
      "c-expressive": { duration: { slow: "320ms" }, easing: { emphasized: "ease-in-out" } },
    },
  });
  expect(prompt).toContain("## Page profiles");
  expect(prompt).toContain("## Profile catalogs");
  expect(prompt).toContain("b-mobile");
  expect(prompt).toContain("c-expressive");
  expect(prompt).toContain("ListRow");
  expect(prompt).toContain("FeedCard");
  expect(prompt).toContain("Do not mix profile catalogs or tokens");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run core/agents/tests/contracts.test.ts`
Expected: FAIL because the per-profile sections do not exist.

- [ ] **Step 3: Add optional inputs and the summary helper**

In `core/agents/src/roles/interaction.ts`:

```ts
export interface InteractionPromptInput {
  brief: UiBrief;
  iaMap: IaMap;
  catalog?: unknown;
  motionTokens?: unknown;
  catalogsByProfile?: Record<string, unknown>;
  motionTokensByProfile?: Record<string, unknown>;
  pageSpecs?: unknown;
}

function summarizeCatalog(catalog: unknown): unknown {
  if (typeof catalog !== "object" || catalog === null) return catalog;
  const record = catalog as { meta?: unknown; components?: unknown };
  const components = Array.isArray(record.components) ? record.components : [];
  return {
    meta: record.meta,
    components: components.map((component) => {
      const entry = component as Record<string, unknown>;
      return {
        id: entry.id,
        category: entry.category,
        props: Object.keys((entry.props as Record<string, unknown> | undefined) ?? {}),
        slots: Object.keys((entry.slots as Record<string, unknown> | undefined) ?? {}),
        variants: entry.variants,
        states: entry.states,
      };
    }),
  };
}
```

- [ ] **Step 4: Render per-profile sections when more than one profile exists**

In `buildInteractionPrompt`, before the return:

```ts
const catalogs = input.catalogsByProfile;
const perProfile = catalogs !== undefined && Object.keys(catalogs).length > 1;
const pageProfiles = input.brief.ia.pages.map((page) => ({
  pageId: page.id,
  profile: page.profile,
}));
const profileCatalogSection = perProfile
  ? [
      "## Page profiles (data)",
      JSON.stringify(pageProfiles, null, 2),
      "",
      "## Profile catalogs (data)",
      JSON.stringify(
        Object.fromEntries(
          Object.entries(catalogs).map(([profile, catalog]) => [
            profile,
            summarizeCatalog(catalog),
          ])
        ),
        null,
        2
      ),
      "",
      "## Motion tokens by profile (data)",
      JSON.stringify(input.motionTokensByProfile ?? {}, null, 2),
      "",
      "## Profile rules",
      "- For each page, use only the components and motion tokens from that page's profile.",
      "- Do not mix profile catalogs or tokens.",
      "",
    ]
  : [];
```

Replace the existing `## Component contracts (data)` and `## Motion tokens (data)` blocks with:

```ts
...(perProfile
  ? profileCatalogSection
  : [
      "## Component contracts (data)",
      JSON.stringify(input.catalog ?? null, null, 2),
      "",
      "## Motion tokens (data)",
      JSON.stringify(
        input.motionTokens ?? {
          duration: { fast: "120ms", normal: "200ms", slow: "320ms" },
          easing: { standard: "ease-out", emphasized: "cubic-bezier(0.2, 0, 0, 1)" },
        },
        null,
        2
      ),
      "",
    ]),
```

- [ ] **Step 5: Add the single-profile regression test**

```ts
it("keeps the single-profile prompt shape", () => {
  const prompt = buildInteractionPrompt({
    brief: employeeBrief,
    iaMap: IaOutputSchema.parse(iaOutput).map,
    catalog: { meta: { library: "b-mobile" }, components: [] },
    motionTokens: { duration: { fast: "120ms" }, easing: { standard: "ease-out" } },
  });
  expect(prompt).toContain("## Component contracts");
  expect(prompt).not.toContain("## Page profiles");
});
```

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run core/agents/tests/contracts.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit (local only)**

```bash
git add core/agents/src/roles/interaction.ts core/agents/tests/contracts.test.ts
git commit -m "feat(agents): add per-profile interaction prompt inputs"
```

---

## Task 2: runM1 and CLI wiring, real 8-page sample run

**Files:**
- Modify: `core/agents/src/run-m1.ts`
- Modify: `runtimes/standalone/src/agent-cli.ts`
- Test: `core/agents/tests/run-m1.test.ts`
- Docs: `pipeline/docs/agent-m1.md`

**Interfaces:**
- Consumes: `catalogsByProfile` / `motionTokensByProfile` from Task 1.
- Produces: `RunM1Input.catalogsByProfile?` / `RunM1Input.motionTokensByProfile?`.
- Produces: CLI-built maps for every profile used by brief pages.

- [ ] **Step 1: Write the failing runM1 prompt-propagation test**

Add to `core/agents/tests/run-m1.test.ts`:

```ts
it("passes every page profile map to the interaction prompt", async () => {
  const store = new MemoryStore();
  store.files.set("signoff/ia.md", signoff());
  store.files.set("signoff/visual-style.md", signoff());
  const mixed = structuredClone(employeeBrief);
  mixed.ia.pages[1]!.profile = "c-expressive";
  const scripted = runners({ ia: [ok(iaOutput)] });

  await run(store, scripted, {
    brief: mixed,
    catalogsByProfile: {
      "b-mobile": { meta: { library: "b-mobile" }, components: [{ id: "ListRow" }] },
      "c-expressive": { meta: { library: "c-expressive" }, components: [{ id: "FeedCard" }] },
    },
    motionTokensByProfile: {
      "b-mobile": { duration: { fast: "120ms" }, easing: { standard: "ease-out" } },
      "c-expressive": { duration: { slow: "320ms" }, easing: { emphasized: "ease-in-out" } },
    },
  });

  const prompt = scripted.interaction.calls[0]?.prompt ?? "";
  expect(prompt).toContain("b-mobile");
  expect(prompt).toContain("c-expressive");
  expect(prompt).toContain("ListRow");
  expect(prompt).toContain("FeedCard");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run core/agents/tests/run-m1.test.ts`
Expected: FAIL because `run()` overrides do not include the new maps and the prompt lacks them.

- [ ] **Step 3: Add fields to `RunM1Input` and pass them to the prompt**

In `core/agents/src/run-m1.ts`:

```ts
catalogsByProfile?: Record<string, unknown>;
motionTokensByProfile?: Record<string, unknown>;
```

In the interaction branch of `runDesign`:

```ts
...(input.catalogsByProfile === undefined
  ? {}
  : { catalogsByProfile: input.catalogsByProfile }),
...(input.motionTokensByProfile === undefined
  ? {}
  : { motionTokensByProfile: input.motionTokensByProfile }),
```

- [ ] **Step 4: Build the maps in `agent-cli.ts`**

Replace the single `profile`/`catalog` setup with:

```ts
const profiles = [...new Set(brief.ia.pages.map((page) => page.profile))];
const profileDefinition = getProfile(brief.meta.profile);
const catalogsByProfile = Object.fromEntries(
  profiles.map((profile) => [profile, getCatalog(profile)])
);
const motionTokensByProfile = Object.fromEntries(
  profiles.map((profile) => {
    const definition = getProfile(profile);
    return [
      profile,
      {
        duration: definition.motion,
        easing: {
          standard: "ease-out",
          emphasized: "cubic-bezier(0.2, 0, 0, 1)",
        },
      },
    ];
  })
);
```

Pass both maps to `runM1`; keep the existing `catalog` / `motionTokens` fields from `profileDefinition` and `getCatalog(brief.meta.profile)`.

- [ ] **Step 5: Run the runM1 and CLI tests**

Run: `pnpm exec vitest run core/agents/tests/run-m1.test.ts runtimes/standalone/tests/agent-cli.test.ts`
Expected: PASS.

- [ ] **Step 6: Real 8-page sample run**

```bash
cd pipeline
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm agent:run \
  --project samples/project.demo-orders-intake.yaml \
  --runtime dsh --profile prd-ui-intake \
  --signoff-ia /tmp/signoff-ia-8p.md \
  --runs /tmp/m1-perprofile \
  --max-cost-cny 3 --json
```

Expected: `interaction: passed`; IA may be `waived`; record `costCny` and run dir. If interaction fails, inspect `agents/interaction/prompt.md` for both profile catalogs and fix the prompt before rerunning.

- [ ] **Step 7: Update `pipeline/docs/agent-m1.md`**

Add a short “per-profile” subsection: optional maps, page-profile rule, single-profile compatibility, real run command/evidence.

- [ ] **Step 8: Commit (local only)**

```bash
git add core/agents/src/run-m1.ts runtimes/standalone/src/agent-cli.ts core/agents/tests/run-m1.test.ts pipeline/docs/agent-m1.md
git commit -m "feat(agents): pass per-profile catalogs and motion tokens to M1"
```

---

## Task 3: Deterministic standard-icon inventory

**Files:**
- Create: `core/agents/src/asset-inventory.ts`
- Modify: `core/agents/src/index.ts`
- Modify: `core/agents/src/roles/visual-style.ts`
- Modify: `core/agents/src/run-m1.ts`
- Test: `core/agents/tests/asset-inventory.test.ts`

**Interfaces:**
- Produces:

```ts
export interface StandardAssetInventory {
  icons: string[];
  illustrations: string[];
  images: string[];
  placeholders: string[];
}
export function deriveStandardAssetInventory(brief: UiBrief): StandardAssetInventory;
```

- Produces: `VisualStylePromptInput.assetInventory?: StandardAssetInventory`.
- `runM1` passes the inventory to the Visual Style prompt; the signed brief is not mutated.

- [ ] **Step 1: Write the failing inventory test**

Create `core/agents/tests/asset-inventory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveStandardAssetInventory } from "../src/index.js";
import { employeeBrief } from "./fixtures.js";

describe("standard asset inventory", () => {
  it("maps standard actions to A-library icon ids and dedupes", () => {
    const brief = structuredClone(employeeBrief);
    brief.ia.pages[0]!.actions = ["新建预约", "搜索客户", "设置"];
    brief.ia.pages[0]!.content = {
      quickActions: [
        { label: "开单", icon: "plus" },
        { label: "预约", icon: "calendar" },
      ],
    };
    const inventory = deriveStandardAssetInventory(brief);
    expect(inventory.icons).toEqual(
      expect.arrayContaining(["icon-home", "icon-plus", "icon-search"])
    );
    expect(new Set(inventory.icons).size).toBe(inventory.icons.length);
    expect(inventory.placeholders).toEqual(
      expect.arrayContaining(["calendar", "settings"])
    );
  });
});
```

Placeholders are semantic ids (`calendar`, `settings`) that have no A-library
mapping; they are not asset ids.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run core/agents/tests/asset-inventory.test.ts`
Expected: FAIL because `deriveStandardAssetInventory` does not exist.

- [ ] **Step 3: Implement the inventory**

Create `core/agents/src/asset-inventory.ts`:

```ts
import type { UiBrief } from "@prd-ui/contracts";

export interface StandardAssetInventory {
  icons: string[];
  illustrations: string[];
  images: string[];
  placeholders: string[];
}

const ICON_MAP: Record<string, string> = {
  home: "icon-home",
  today: "icon-home",
  inventory: "icon-package",
  "inventory-list": "icon-package",
  package: "icon-package",
  search: "icon-search",
  plus: "icon-plus",
  add: "icon-plus",
  new: "icon-plus",
  minus: "icon-minus",
  remove: "icon-minus",
  back: "icon-chevron-left",
  next: "icon-chevron-right",
  forward: "icon-chevron-right",
  alert: "icon-circle-alert",
  error: "icon-circle-alert",
  refresh: "icon-refresh-cw",
  retry: "icon-refresh-cw",
  user: "icon-user",
  customer: "icon-user",
};

const ACTION_HINTS: Record<string, string> = {
  新建: "plus",
  新增: "plus",
  搜索: "search",
  查询: "search",
  设置: "settings",
  返回: "back",
  下一步: "next",
  刷新: "refresh",
  重试: "refresh",
  客户: "user",
  预约: "calendar",
  开单: "plus",
};

function addIcon(icons: Set<string>, placeholders: Set<string>, semantic: string): void {
  const mapped = ICON_MAP[semantic];
  if (mapped === undefined) placeholders.add(semantic);
  else icons.add(mapped);
}

export function deriveStandardAssetInventory(brief: UiBrief): StandardAssetInventory {
  const icons = new Set<string>();
  const placeholders = new Set<string>();
  for (const page of brief.ia.pages) {
    addIcon(icons, placeholders, page.archetype);
    for (const action of page.actions ?? []) {
      const hint = Object.entries(ACTION_HINTS).find(([token]) => action.includes(token));
      if (hint !== undefined) addIcon(icons, placeholders, hint[1]);
    }
    for (const action of page.content?.quickActions ?? []) {
      addIcon(icons, placeholders, action.icon);
    }
    if (page.emptyAssetRef !== undefined) addIcon(icons, placeholders, page.emptyAssetRef);
  }
  for (const icon of brief.assets.icons) addIcon(icons, placeholders, icon);
  return {
    icons: [...icons].sort(),
    illustrations: [],
    images: [],
    placeholders: [...placeholders].sort(),
  };
}
```

- [ ] **Step 4: Add the Visual Style prompt rule and input**

In `core/agents/src/roles/visual-style.ts`:

```ts
import type { StandardAssetInventory } from "../asset-inventory.js";

export interface VisualStylePromptInput {
  brief: UiBrief;
  iaMap: IaMap;
  assetInventory?: StandardAssetInventory;
  brandMaterials?: string[];
  references?: string[];
}
```

In the prompt, after the asset rules, add:

```ts
"- Use the exact ids in assetInventory.icons; do not invent additional icon ids.",
"- assetInventory.placeholders are not deliverable icons; record them in constraints, do not create briefs for them.",
```

Include:

```ts
"## Asset inventory (data)",
JSON.stringify(input.assetInventory ?? null, null, 2),
```

- [ ] **Step 5: Wire the inventory into `runM1`**

In `runM1`, before the Visual Style prompt:

```ts
const inventory = deriveStandardAssetInventory(input.brief);
```

Pass `assetInventory: inventory` to `buildVisualStylePrompt`. Do not modify `input.brief`.

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run core/agents/tests/asset-inventory.test.ts core/agents/tests/contracts.test.ts core/agents/tests/run-m1.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit (local only)**

```bash
git add core/agents/src/asset-inventory.ts core/agents/src/index.ts core/agents/src/roles/visual-style.ts core/agents/src/run-m1.ts core/agents/tests/asset-inventory.test.ts
git commit -m "feat(agents): derive standard asset inventory for visual style"
```

---

## Task 4: `asset:review --briefs` and the A-library review

**Files:**
- Modify: `runtimes/standalone/src/asset-cli.ts`
- Test: `runtimes/standalone/tests/asset-cli.test.ts`
- Docs: `pipeline/docs/asset-review-m0.md`

**Interfaces:**
- Produces: `--briefs <dir>` option (default `<assets>/briefs`).
- Consumes: M1 `runs/<id>/asset-briefs/*.json`.

- [ ] **Step 1: Write the failing CLI test**

Add a test that writes a temp briefs dir containing one valid icon brief (`id: "icon-home"`) and runs:

```ts
const result = await runCli([
  "--assets",
  "samples/assets/m0",
  "--briefs",
  briefsDir,
  "--only",
  "icon-home",
  "--runtime",
  "standalone",
  "--runs",
  runsDir,
  "--json",
]);
expect(result.code).toBe(0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run runtimes/standalone/tests/asset-cli.test.ts`
Expected: FAIL because `--briefs` is unknown.

- [ ] **Step 3: Implement `--briefs`**

Add `briefsDir?: string` to `AssetCliOptions`; parse `--briefs`; change `loadBriefs` to accept the directory:

```ts
async function loadBriefs(briefsDir: string): Promise<AssetBrief[]> {
  const files = (await readdir(briefsDir)).filter((file) => file.endsWith(".json")).sort();
  // existing parsing loop unchanged
}
```

Call it with `options.briefsDir ?? path.join(options.assetsDir, "briefs")`.

- [ ] **Step 4: Run the test**

Run: `pnpm exec vitest run runtimes/standalone/tests/asset-cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `pipeline/docs/asset-review-m0.md`**

Document `--briefs`, the M1 `asset-briefs/` use, and the pass/degraded semantics.

- [ ] **Step 6: Commit (local only)**

```bash
git add runtimes/standalone/src/asset-cli.ts runtimes/standalone/tests/asset-cli.test.ts pipeline/docs/asset-review-m0.md
git commit -m "feat(asset-review): allow reviewing M1 asset briefs"
```

---

## Task 5: 8-page real PRD project, home content, mobile-list search

**Files:**
- Create: `samples/projects/employee-app-phase2/project.yaml`
- Create: `samples/projects/employee-app-phase2/prd.md`
- Create: `samples/projects/employee-app-phase2/asset-manifest.b-mobile.json`
- Modify: `core/agents/src/roles/ui-briefer.ts`
- Modify: `core/compiler/src/compile-page-spec.ts`
- Modify: `core/design-system/src/archetypes.ts`
- Tests: `core/intake/tests/briefer-prompt.test.ts`, `core/compiler/tests/compiler.test.ts`, `core/design-system/tests/design-system.test.ts`

**Interfaces:**
- Produces: `samples/projects/employee-app-phase2/prd.md` with 8 pages:
  `today`, `customer-search`, `customer-detail`, `appointment-detail`,
  `appointment-form`, `treatment-notice`, `appointment-list`, `callback-register`.
- Produces: Briefer prompt rule for `home` content.
- Produces: `mobile-list` SearchBar when `filterFields` includes `keyword`/`search`.

- [ ] **Step 1: Write the failing compiler test for mobile-list search**

In `core/compiler/tests/compiler.test.ts`, add a `mobile-list` page with
`filterFields: ["keyword"]`, `fieldLabels: { keyword: "关键词" }`, and one row.
Compile and assert:

```ts
expect(nodesOf(spec, "SearchBar")[0]?.props?.placeholder).toContain("关键词");
expect(nodesOf(spec, "Text").map((node) => node.props?.text)).toContain("关键词");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run core/compiler/tests/compiler.test.ts`
Expected: FAIL because mobile-list does not render SearchBar.

- [ ] **Step 3: Implement the search variant**

In `compile-page-spec.ts` `mobile-list`:

```ts
const searchField = filterFields.find(
  (field) => field === "keyword" || field === "search"
);
```

If `searchField` exists, add before the filter row:

```ts
{
  type: "SearchBar",
  props: { placeholder: `搜索${labelFor(searchField)}` },
},
{
  type: "Text",
  props: { text: labelFor(searchField) },
  textRole: "label.sm",
},
```

Add `"SearchBar"` to `mobile-list.allowedComponents` and the design-system
test template list. `filterFields` already renders a `CollapsedFilter` for
`keyword`; skip the CollapsedFilter when it is the search field so the
SearchBar is the only control.

- [ ] **Step 4: Write the failing Briefer home-content prompt test**

In `core/intake/tests/briefer-prompt.test.ts`, assert the prompt contains:

```ts
expect(prompt).toContain("home");
expect(prompt).toContain("quickActions");
expect(prompt).toContain("appointments");
expect(prompt).toContain("callbacks");
```

- [ ] **Step 5: Run it to verify it fails, then add the rule**

Add to `buildUiBrieferPrompt` mapping rules:

```ts
"- For home pages, generate content from the PRD examples: storeName, hasMessage, quickActions (label/icon/tone), appointments, callbacks, and the empty titles. Do not invent business rules; missing examples become assumptions.",
```

- [ ] **Step 6: Create the 8-page project**

`project.yaml`:

```yaml
project: employee-app-phase2
brief: ui-brief.json
prd: prd.md
profile: b-mobile
platforms:
  - mobile
manifests:
  b-mobile: asset-manifest.b-mobile.json
```

Copy `samples/projects/employee-app/asset-manifest.b-mobile.json` into the new
project and change `project` to `employee-app-phase2`.

Write `prd.md` from 00–04 with these sections:

- `## 1. 业务范围`
- `## 2. 角色与权限`
- `## 3. 页面清单` (the 8-page table above, ids/routes/roles/states)
- `## 4. 状态矩阵` (page states + business states)
- `## 5. 字段表` (today content, customer search/detail, appointments, notice, callback)
- `## 6. 验收示例` (one example per page; include masked phone, appointment statuses, notice blocks)
- `## 7. 主流程`
- `## 8. 导航`
- `## 9. 切片边界` (host pages outside the 8-page slice)
- `## 10. 首版决策`

No `TBD`/`TODO`/`【】`/`待定`/`待确认`/`...` strings. Source attribution at the top.

- [ ] **Step 7: Run the focused tests**

Run:

```bash
pnpm exec vitest run core/compiler/tests/compiler.test.ts core/design-system/tests/design-system.test.ts core/intake/tests/briefer-prompt.test.ts
pnpm phase1:verify --project samples/projects/employee-app-phase2/project.yaml --runs /tmp/phase1-phase2
```

The Phase 1 command requires a `ui-brief.json`; if it does not exist yet, run
intake first (Task 6) and then Phase 1. The compiler/design tests must pass.

- [ ] **Step 8: Commit (local only)**

```bash
git add core/compiler/src/compile-page-spec.ts core/compiler/tests/compiler.test.ts core/design-system/src/archetypes.ts core/design-system/tests/design-system.test.ts core/agents/src/roles/ui-briefer.ts core/intake/tests/briefer-prompt.test.ts samples/projects/employee-app-phase2
git commit -m "feat: add 8-page real PRD project and mobile search"
```

---

## Task 6: Real 8-page intake, M1, Spec Engineer, HTML

**Files:**
- Create: `samples/agents/intake-employee-app-phase2/` (fixtures from the real run)
- Create: `samples/projects/employee-app-phase2/ui-brief.json`
- Update docs/evidence.

- [ ] **Step 1: Run real intake**

```bash
cd pipeline
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm intake:run \
  --project samples/projects/employee-app-phase2/project.yaml \
  --prd samples/projects/employee-app-phase2/prd.md \
  --runtime dsh --runs /tmp/intake-phase2 \
  --max-cost-cny 3 --json
```

Expected: 8 pages; PRD/IA gate passes or produces findings. For any blocker,
fix the PRD or create an owner/reason/expiry waiver; never fake a pass.

- [ ] **Step 2: Sign and publish the brief**

Create `/tmp/signoff-phase2-prd-ia.md` and `/tmp/signoff-phase2-brief.md`
with the canonical brief hash, then resume with `--signoff-prd-ia`,
`--signoff-brief`, and `--publish-brief samples/projects/employee-app-phase2/ui-brief.json`.

- [ ] **Step 3: Save scripted fixtures**

Copy the real run's `agents/*/output.json` into
`samples/agents/intake-employee-app-phase2/{prd-review,ia,ui-briefer}.json`
using the `{ output, usage, usageComplete }` fixture shape. Add an intake CLI
regression test analogous to the 03 slice test.

- [ ] **Step 4: Run real M1**

```bash
DSH_HOME="$PWD/dsh/home" pnpm agent:run \
  --project samples/projects/employee-app-phase2/project.yaml \
  --runtime dsh --profile prd-ui-intake \
  --runs /tmp/m1-phase2 --max-cost-cny 3 --json
```

Expected gates: `ia:waived` (slice boundaries only) or `ia:passed`,
`interaction:passed`, `visualStyle:passed`. Finalize with `agent:sign` if only
the visual-style signoff is missing.

- [ ] **Step 5: Run asset review on the M1 briefs**

```bash
DSH_HOME="$PWD/dsh/home" pnpm asset:review \
  --project samples/projects/employee-app-phase2/project.yaml \
  --assets samples/assets/m0 \
  --briefs /tmp/m1-phase2/<runId>/asset-briefs \
  --runtime standalone --runs /tmp/assets-phase2 --json
```

Mapped icons must pass; placeholders must be recorded as degraded. Do not
count a degraded placeholder as a pass.

- [ ] **Step 6: Spec Engineer and render**

```bash
pnpm spec:engineer \
  --project samples/projects/employee-app-phase2/project.yaml \
  --agent-run /tmp/m1-phase2/<runId> \
  --runs /tmp/spec-phase2
pnpm render:html --run /tmp/spec-phase2/<runId> --out /tmp/html-phase2
pnpm phase1:verify --project samples/projects/employee-app-phase2/project.yaml --runs /tmp/phase1-phase2
```

Expected: 8 Page Specs / 0 blockers; 8 HTML + index; Phase 1 8/0.

- [ ] **Step 7: Playwright visual scan**

Serve `/tmp/html-phase2` and capture at least: `today`, `customer-search`,
`customer-detail`, `appointment-detail`, `appointment-form`,
`treatment-notice`, `appointment-list`, `index`. Check:
- no raw field ids or “请配置” placeholders;
- calendar, fixed action footer, notice blocks, single form CTA present;
- empty/loading/error state switcher visible.

- [ ] **Step 8: Copy durable artifacts**

Copy the 8 HTML + screenshots to
`pipeline/artifacts/employee-app-phase2/` (same pattern as
`employee-app-appointments-03`).

- [ ] **Step 9: Commit (local only)**

```bash
git add samples/projects/employee-app-phase2 samples/agents/intake-employee-app-phase2 pipeline/artifacts/employee-app-phase2
git commit -m "feat: complete 8-page real PRD Phase 2 slice"
```

---

## Task 7: Docs and full regression

**Files:**
- Modify: `docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md`
- Modify: `AGENTS.md`, `README.md`, `CHANGELOG.md`
- Modify: `docs/superpowers/plans/2026-10-21-phase-2-remaining-work.md`
- Modify: `docs/handoffs/2026-10-21-8page-renderer-handoff.md`

- [ ] **Step 1: Run the full suite**

```bash
cd pipeline
pnpm test
pnpm typecheck
pnpm test:dsh
pnpm phase1:verify --project samples/project.demo-orders-intake.yaml --runs /tmp/phase1-final-8p
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/phase1-final-emp
pnpm phase1:verify --project samples/projects/employee-app-appointments-03/project.yaml --runs /tmp/phase1-final-03
pnpm phase1:verify --project samples/projects/employee-app-phase2/project.yaml --runs /tmp/phase1-final-phase2
```

Expected: tests 500+; typecheck clean; test:dsh 2; Phase 1 8/2/4/8, all 0 blockers.

- [ ] **Step 2: Update the master status**

In `2026-10-19-prd-to-ui-pipeline-design.md` §14.1:
- Phase 2 complete exit: change to “done” with the 8-page real PRD evidence.
- Add per-profile and asset-chain evidence/costs.
- Note Studio/Asset Compiler remain deferred.

- [ ] **Step 3: Update counts and evidence**

Update `AGENTS.md`, `README.md`, `CHANGELOG.md`, the remaining-work plan, and
the handoff with:
- test count;
- 8-page real PRD run costs and paths;
- per-profile 8-page sample run evidence;
- asset review pass/degraded counts;
- remaining v0.4/v1.0 work.

- [ ] **Step 4: Final audit**

Confirm:
- per-profile prompt test + real run;
- real PRD 8 pages / 0 blockers or valid waivers;
- asset review pass + explicit degraded;
- Spec 8/0; HTML 8; Phase 1 8/0;
- docs updated;
- no `.env`, keys, `node_modules`, `/tmp` artifacts committed.
