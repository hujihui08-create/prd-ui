# Clean Phase 2 Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Phase 2 exit from “passed with 10 IA waivers + a manual brief patch” into a reproducible clean run: 0 manual brief patch, ≤3 host-boundary waivers, and clickable state/form/calendar/search interactions.

**Architecture:** Add optional interaction metadata to the brief and Page Spec (`businessStates`, `formModes`, `views`, `defaultView`, `searchIdleTitle`, `currentStatus`, `linkedRoutes`). The compiler emits data attributes and a small JSON config; the renderer injects one inline vanilla-JS controller. The Briefer generates the metadata; the brief gate blocks non-compliant home/host/state/form shapes; the clean intake is rerun without manual edits.

**Tech Stack:** TypeScript ESM, vitest, tsx, dsh `0.2.1-rc.2`, pnpm workspace, Playwright MCP for interaction checks.

**Status:** Completed 2026-10-22 (v0.3.1). Final evidence in the last section.

## Global Constraints

- ESM everywhere; relative TS imports use `.js`.
- `core/` must not import `@deepseek-ai/*` or runtime adapters.
- No React or frontend framework; interaction JS is inline, dependency-free, ~150 lines.
- “0 patch” means no manual edit of the brief after intake; Briefer gate-repair is allowed.
- Allowed IA waivers: at most 3, only host boundaries (workbench/my/customer-tab root, service-completion host entry, warehouse host landing).
- Baseline: 510 tests, typecheck clean, `test:dsh` 2 passed; keep 8/2/4/8-page Phase 1 at 0 blockers.
- Real dsh runs: `set -a; . ./.env; set +a`, `DSH_HOME="$PWD/dsh/home"`, `--max-cost-cny 3`.
- Local commits only; no push.

## File Structure

```text
core/contracts/src/ui-brief.ts              businessStates/formModes/views/searchIdleTitle
core/contracts/src/page-spec.ts             same fields + currentStatus/linkedRoutes
core/intake/src/gates.ts                    new brief gate rules
core/intake/tests/gates.test.ts             gate tests
core/agents/src/roles/ui-briefer.ts         prompt rules
core/intake/tests/briefer-prompt.test.ts    prompt assertions
core/compiler/src/compile-page-spec.ts      defaults, routes, data attributes
core/compiler/tests/compiler.test.ts        compiler tests
core/renderer-html/src/index.ts             data attrs + inline JS
core/renderer-html/tests/renderer.test.ts   renderer tests
samples/agents/intake-employee-app-phase2/ui-briefer.json  fixture metadata
samples/agents/intake-appointments-03/ui-briefer.json      fixture metadata
samples/agents/intake-employee-app/ui-briefer.json         home actions cleanup
samples/projects/employee-app-phase2/prd.md state/form/view/search metadata
samples/projects/employee-app-phase2/ui-brief.json         clean intake output
pipeline/artifacts/employee-app-phase2/                    refreshed artifacts
```

---

## Task 1: Contracts and brief gate

**Files:**
- Modify: `core/contracts/src/ui-brief.ts`
- Modify: `core/contracts/src/page-spec.ts`
- Modify: `core/intake/src/gates.ts`
- Test: `core/contracts/tests/contracts.test.ts`
- Test: `core/intake/tests/gates.test.ts`

**Interfaces:**
- Produces: `UiBriefPage.businessStates?: Array<{ name; actions; note? }>`
- Produces: `UiBriefPage.formModes?: Array<{ name: "new"|"reschedule"; label; actions; customerLocked? }>`
- Produces: `UiBriefPage.views?: Array<"calendar"|"list">`, `defaultView?`, `searchIdleTitle?`
- Produces: `PageSpec` same fields plus `currentStatus?: string`,
  `referenceId?: string`, and
  `linkedRoutes?: { create?; detail?; customer?; notice?; form? }`.
- Produces gate codes: `BRIEF_HOME_FIELDS`, `BRIEF_HOST_ACTION`,
  `BRIEF_BUSINESS_STATES_MISSING`, `BRIEF_BUSINESS_STATE_ACTION_UNKNOWN`,
  `BRIEF_FORM_MODE_ACTION_UNKNOWN`, `BRIEF_VIEW_WITHOUT_TIME`,
  `BRIEF_SEARCH_IDLE_MISSING`.

- [x] **Step 1: Write failing contract tests**

In `core/contracts/tests/contracts.test.ts`:

```ts
it("parses interaction metadata on a brief page", () => {
  const page = {
    id: "appointment-detail",
    name: "预约详情",
    purpose: "查看预约",
    archetype: "detail",
    target: "mobile" as const,
    profile: "b-mobile",
    route: "/appointments/detail/:id",
    roles: ["admin"],
    requiredStates: ["default", "loading", "error"],
    reqRefs: ["REQ-ORDER-001"],
    fields: ["status"],
    actions: ["已到店确认", "开单", "取消"],
    businessStates: [
      { name: "已登记", actions: ["已到店确认", "开单", "取消"] },
      { name: "已到店", actions: ["开单"] },
      { name: "已取消", actions: [], note: "本单已取消" },
    ],
    formModes: [
      { name: "new", label: "新增预约", actions: ["保存"] },
      {
        name: "reschedule",
        label: "改期",
        actions: ["保存改期"],
        customerLocked: true,
      },
    ],
    views: ["calendar", "list"],
    defaultView: "calendar",
    searchIdleTitle: "输入姓名或脱敏手机号搜索客户",
  };
  expect(UiBriefPageSchema.parse(page).businessStates).toHaveLength(3);
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run core/contracts/tests/contracts.test.ts`
Expected: FAIL because the schema rejects the new keys.

- [x] **Step 3: Add the interfaces and strict schemas**

In `core/contracts/src/ui-brief.ts` add to `UiBriefPage`:

```ts
businessStates?: Array<{ name: string; actions: string[]; note?: string }>;
formModes?: Array<{
  name: "new" | "reschedule";
  label: string;
  actions: string[];
  customerLocked?: boolean;
}>;
views?: Array<"calendar" | "list">;
defaultView?: "calendar" | "list";
searchIdleTitle?: string;
```

In `UiBriefPageSchema` add the matching `.strict()` objects. In
`core/contracts/src/page-spec.ts` add the same optional fields plus:

```ts
currentStatus?: string;
linkedRoutes?: {
  create?: string;
  detail?: string;
  customer?: string;
  notice?: string;
  form?: string;
};
```

and mirror them in `PageSpecSchema`.

- [x] **Step 4: Write failing gate tests**

Add to `core/intake/tests/gates.test.ts`:

```ts
it("blocks home fields/actions and host actions", () => {
  const home = withBrief((brief) => {
    const page = brief.ia.pages.find((entry) => entry.id === "orders-overview")!;
    page.archetype = "home";
    page.fields = ["storeName"];
    page.actions = ["前往客户 Tab"];
    return brief;
  });
  const gate = runBriefGate(briefGateInput({ draft: home }));
  const codes = gate.issues.map((issue) => issue.code);
  expect(codes).toContain("BRIEF_HOME_FIELDS");
  expect(codes).toContain("BRIEF_HOST_ACTION");
});

it("blocks missing or unknown business state actions", () => {
  const missing = withBrief((brief) => {
    const page = brief.ia.pages.find((entry) => entry.id === "order-detail")!;
    page.fields = ["status"];
    page.actions = ["开单", "取消"];
    return brief;
  });
  expect(runBriefGate(briefGateInput({ draft: missing })).issues.map((i) => i.code))
    .toContain("BRIEF_BUSINESS_STATES_MISSING");

  const unknown = withBrief((brief) => {
    const page = brief.ia.pages.find((entry) => entry.id === "order-detail")!;
    page.fields = ["status"];
    page.actions = ["开单"];
    page.businessStates = [{ name: "已到店", actions: ["开单", "不存在"] }];
    return brief;
  });
  expect(runBriefGate(briefGateInput({ draft: unknown })).issues.map((i) => i.code))
    .toContain("BRIEF_BUSINESS_STATE_ACTION_UNKNOWN");
});
```

Add analogous tests for `BRIEF_FORM_MODE_ACTION_UNKNOWN`,
`BRIEF_VIEW_WITHOUT_TIME`, and `BRIEF_SEARCH_IDLE_MISSING`.

- [x] **Step 5: Implement the gate checks**

In `runBriefGate`, inside the page loop:

```ts
const hostAction = (page.actions ?? []).find((action) =>
  /前往客户\s*Tab|工作台|我的/.test(action)
);
if (page.archetype === "home" && ((page.fields ?? []).length > 0 || (page.actions ?? []).length > 0)) {
  issues.push(issue("BRIEF_HOME_FIELDS", "blocker", `home page ${page.id} must not declare fields/actions`, page.id));
}
if (hostAction !== undefined) {
  issues.push(issue("BRIEF_HOST_ACTION", "blocker", `page ${page.id} has host action ${hostAction}`, hostAction));
}
if (
  page.archetype === "detail" &&
  (page.fields ?? []).includes("status") &&
  (page.actions ?? []).length >= 2 &&
  page.businessStates === undefined
) {
  issues.push(issue("BRIEF_BUSINESS_STATES_MISSING", "blocker", `detail page ${page.id} needs businessStates`, page.id));
}
for (const state of page.businessStates ?? []) {
  for (const action of state.actions) {
    if (!(page.actions ?? []).includes(action)) {
      issues.push(issue("BRIEF_BUSINESS_STATE_ACTION_UNKNOWN", "blocker", `state ${state.name} uses unknown action ${action}`, action));
    }
  }
}
for (const mode of page.formModes ?? []) {
  for (const action of mode.actions) {
    if (!(page.actions ?? []).includes(action)) {
      issues.push(issue("BRIEF_FORM_MODE_ACTION_UNKNOWN", "blocker", `mode ${mode.name} uses unknown action ${action}`, action));
    }
  }
}
if (page.views !== undefined && !(page.fields ?? []).includes("time") && !(page.fields ?? []).includes("date")) {
  issues.push(issue("BRIEF_VIEW_WITHOUT_TIME", "blocker", `page ${page.id} declares views without time/date`, page.id));
}
if (
  (page.filterFields ?? []).some((field) => field === "keyword" || field === "search") &&
  page.searchIdleTitle === undefined
) {
  issues.push(issue("BRIEF_SEARCH_IDLE_MISSING", "warning", `search page ${page.id} has no idle title`, page.id));
}
```

- [x] **Step 6: Run the tests**

Run: `pnpm exec vitest run core/contracts/tests/contracts.test.ts core/intake/tests/gates.test.ts`
Expected: PASS.

- [x] **Step 7: Commit (local only)**

```bash
git add core/contracts/src/ui-brief.ts core/contracts/src/page-spec.ts core/contracts/tests/contracts.test.ts core/intake/src/gates.ts core/intake/tests/gates.test.ts
git commit -m "feat(intake): add interaction metadata and brief gate rules"
```

---

## Task 2: Briefer rules and fixtures

**Files:**
- Modify: `core/agents/src/roles/ui-briefer.ts`
- Test: `core/intake/tests/briefer-prompt.test.ts`
- Modify: `samples/agents/intake-employee-app/ui-briefer.json`
- Modify: `samples/agents/intake-appointments-03/ui-briefer.json`
- Modify: `samples/agents/intake-employee-app-phase2/ui-briefer.json`

**Interfaces:**
- Consumes: Task 1 schema.
- Produces: prompt rules for `businessStates`, `formModes`, `views`, `searchIdleTitle`, home/host constraints.

- [x] **Step 1: Write failing prompt assertions**

In `core/intake/tests/briefer-prompt.test.ts`:

```ts
it("requires interaction metadata for stateful pages", () => {
  expect(prompt).toContain("businessStates");
  expect(prompt).toContain("formModes");
  expect(prompt).toContain("views");
  expect(prompt).toContain("searchIdleTitle");
  expect(prompt).toContain("must be a subset of page.actions");
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run core/intake/tests/briefer-prompt.test.ts`
Expected: FAIL.

- [x] **Step 3: Add the prompt rules**

In `core/agents/src/roles/ui-briefer.ts` mapping rules:

```ts
"- Detail pages with a status field and at least two actions: emit businessStates from the PRD state/action matrix. Every businessStates[].actions entry must be a subset of page.actions; read-only states get a note.",
"- Form pages: emit formModes for new/reschedule. Every formModes[].actions entry must be a subset of page.actions; reschedule sets customerLocked=true and uses appointmentId in the query contract.",
"- List pages with time/date fields and a calendar/list switch: emit views and defaultView. Do not declare views without time/date fields.",
"- Search pages: emit searchIdleTitle and state that no customer list is returned before a keyword is entered.",
"- Never emit host actions such as 前往客户 Tab / 工作台 / 我的.",
```

- [x] **Step 4: Update fixtures**

Use a Node script or manual edit:

- `samples/agents/intake-employee-app/ui-briefer.json`: `today.actions = []`; keep `content`.
- `samples/agents/intake-appointments-03/ui-briefer.json`: add to `appointment-detail`:

```json
"businessStates": [
  { "name": "已登记", "actions": ["已到店确认", "接单并确认到店", "开单", "改期", "取消"] },
  { "name": "已到店", "actions": ["开单"] },
  { "name": "爽约", "actions": [], "note": "爽约已记录入客户档案" },
  { "name": "已取消", "actions": [], "note": "本单已取消" }
]
```

- `samples/agents/intake-employee-app-phase2/ui-briefer.json`: add the same
  `businessStates` (with 术后告知 in 已到店 if present in actions) and add
  `"searchIdleTitle": "输入姓名或脱敏手机号搜索客户"` to `customer-search`.
- `samples/agents/intake-employee-app-phase2/ui-briefer.json`: add
  `formModes` to `appointment-form`:

```json
"formModes": [
  { "name": "new", "label": "新增预约", "actions": ["保存"] },
  { "name": "reschedule", "label": "改期", "actions": ["保存改期"], "customerLocked": true }
]
```

- `samples/agents/intake-employee-app-phase2/ui-briefer.json`: add
  `"views": ["calendar", "list"], "defaultView": "calendar"` to
  `appointment-list`.

- [x] **Step 5: Run the prompt + intake tests**

Run: `pnpm exec vitest run core/intake/tests/briefer-prompt.test.ts runtimes/standalone/tests/intake-cli.test.ts`
Expected: PASS. If a fixture now fails the new gate, add the missing metadata rather than weakening the gate.

- [x] **Step 6: Commit (local only)**

```bash
git add core/agents/src/roles/ui-briefer.ts core/intake/tests/briefer-prompt.test.ts samples/agents/intake-employee-app/ui-briefer.json samples/agents/intake-appointments-03/ui-briefer.json samples/agents/intake-employee-app-phase2/ui-briefer.json
git commit -m "feat(briefer): require business states, form modes, views, search idle"
```

---

## Task 3: Compiler metadata, defaults, routes, data attributes

**Files:**
- Modify: `core/compiler/src/compile-page-spec.ts`
- Test: `core/compiler/tests/compiler.test.ts`

**Interfaces:**
- Consumes: `UiBriefPage.businessStates/formModes/views/searchIdleTitle`.
- Produces: `PageSpec.businessStates/formModes/views/defaultView/searchIdleTitle/currentStatus/linkedRoutes`.
- Produces data props on nodes: `action`, `field`, `searchText`, `emptyKind`, `viewPanel`.

- [x] **Step 1: Write failing compiler tests**

Add a test using a clone of the 03 brief with:

```ts
const page = { ...appointmentPage, businessStates: [...] };
const spec = compilePageSpec({ brief, page, ... });
expect(spec.businessStates).toHaveLength(4);
expect(spec.currentStatus).toBe("已登记");
expect(spec.linkedRoutes?.form).toContain("/appointments/form");
```

Add tests for defaults:

```ts
expect(compilePageSpec(mobileFormPage).formModes?.map((mode) => mode.name)).toEqual([
  "new",
  "reschedule",
]);
expect(compilePageSpec(appointmentListPage).views).toEqual(["calendar", "list"]);
expect(compilePageSpec(appointmentListPage).defaultView).toBe("calendar");
```

- [x] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run core/compiler/tests/compiler.test.ts`
Expected: FAIL.

- [x] **Step 3: Implement metadata and defaults**

In `compilePageSpec`, replace the return object with:

```ts
const views = page.views ??
  (page.archetype === "mobile-list" &&
  ((page.fields ?? []).includes("time") || (page.fields ?? []).includes("date"))
    ? (["calendar", "list"] as const)
    : undefined);
const formModes = page.formModes ??
  (page.archetype === "mobile-form" &&
  (page.actions ?? []).includes("保存") &&
  (page.actions ?? []).includes("保存改期")
    ? [
        { name: "new" as const, label: "新增预约", actions: ["保存"] },
        {
          name: "reschedule" as const,
          label: "改期",
          actions: ["保存改期"],
          customerLocked: true,
        },
      ]
    : undefined);
const searchIdleTitle = page.searchIdleTitle ??
  ((page.filterFields ?? []).some((field) => field === "keyword" || field === "search")
    ? "输入姓名或脱敏手机号搜索客户"
    : undefined);
const linkedRoutes = {
  create: brief.ia.pages.find((entry) => entry.archetype === "mobile-form")?.route,
  form: brief.ia.pages.find((entry) => entry.archetype === "mobile-form")?.route,
  detail: brief.ia.pages.find((entry) => entry.archetype === "detail")?.route,
  customer: brief.ia.pages.find((entry) => entry.id === "customer-detail")?.route,
  notice: brief.ia.pages.find((entry) => (entry.noticeBlocks ?? []).length > 0)?.route,
};
return {
  meta: {
    pageId: page.id,
    project: brief.meta.project,
    name: page.name,
    target: page.target,
    profile: page.profile,
    archetype: page.archetype,
    purpose: page.purpose,
    route: page.route,
    roles: page.roles,
    reqRefs: page.reqRefs as PageSpec["meta"]["reqRefs"],
    version: "0.1.0",
  },
  layout,
  states,
  interactions: buildInteractions(page),
  traceability: {
    reqMap: Object.fromEntries(page.reqRefs.map((req) => [req, [page.id]])),
    designDefaults: [],
    unmapped: [],
  },
  ...(page.businessStates === undefined ? {} : { businessStates: page.businessStates }),
  ...(formModes === undefined ? {} : { formModes }),
  ...(views === undefined ? {} : { views, defaultView: page.defaultView ?? views[0] }),
  ...(searchIdleTitle === undefined ? {} : { searchIdleTitle }),
  ...(page.mockData?.values?.status === undefined
    ? {}
    : { currentStatus: page.mockData.values.status }),
  referenceId:
    page.mockData?.values?.orderNo ??
    page.mockData?.values?.appointmentId ??
    page.id,
  linkedRoutes,
};
```

- [x] **Step 4: Add data props**

- `btn(label, emphasis, action?)` sets `props.action`.
- `fieldFormNode` sets `props.field = field`.
- `rowProps` adds `searchText: Object.values(row).join(" ")`.
- `mobile-list` search page adds an `EmptyState` with `emptyKind: "idle"` and `title: searchIdleTitle`; the existing empty state gets `emptyKind: "empty"`.
- Wrap list rows in a `Section` with `props.viewPanel = "list"`; `CalendarGrid` gets `props.viewPanel = "calendar"`.
- Detail and list action buttons pass `action: label`; form primary CTA passes `action: primary`.
- The list action whose label matches `/日历.*列表/` gets `viewToggle: true`.
- `Button` renderer emits `data-view-toggle` when `props.viewToggle` is true.
- Search rows carry `searchText`; the search idle/empty states carry `emptyKind`.

- [x] **Step 5: Run tests**

Run: `pnpm exec vitest run core/compiler/tests/compiler.test.ts`
Expected: PASS.

- [x] **Step 6: Commit (local only)**

```bash
git add core/compiler/src/compile-page-spec.ts core/compiler/tests/compiler.test.ts
git commit -m "feat(compiler): carry interaction metadata and data hooks"
```

---

## Task 4: Renderer data attributes and inline JS

**Files:**
- Modify: `core/renderer-html/src/index.ts`
- Test: `core/renderer-html/tests/renderer.test.ts`

**Interfaces:**
- Consumes: `PageSpec.businessStates/formModes/views/defaultView/searchIdleTitle/currentStatus/linkedRoutes`.
- Produces: `<script id="interaction-config" type="application/json">` and inline controller.
- Produces: SearchBar `<input data-search-input>`, Button `data-action`, ListRow `data-search-text`, EmptyState `data-empty-kind`, Section `data-view-panel`, CalendarGrid cells `data-slot-date/time`, blocks `data-block`.

- [x] **Step 1: Write failing renderer tests**

```ts
it("emits interaction config and data hooks for the appointment detail", () => {
  const brief = structuredClone(appointmentsBrief);
  const page = brief.ia.pages.find((entry) => entry.id === "appointment-detail")!;
  page.businessStates = [
    { name: "已登记", actions: ["已到店确认", "开单"] },
    { name: "已到店", actions: ["开单"] },
  ];
  const specs = compileProject(brief, {
    getProfile,
    getCatalog,
    getArchetype,
  });
  const spec = specs.find((entry) => entry.meta.pageId === "appointment-detail")!;
  const html = renderDocument(spec, getProfile("b-mobile"));
  expect(html).toContain('data-page-archetype="detail"');
  expect(html).toContain('id="interaction-config"');
  expect(html).toContain('data-action="已到店确认"');
  expect(html).toContain("data-business-states");
});
```

Add tests for `data-search-input`, `data-view-panel`, `data-empty-kind`, and
`data-view-toggle`.

- [x] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts`
Expected: FAIL.

- [x] **Step 3: Add data attributes**

- `renderDocument`: add `data-page-archetype`, `data-page-id`,
  `data-current-status` (if present), and the config script:

```ts
const config = {
  archetype: spec.meta.archetype,
  pageId: spec.meta.pageId,
  businessStates: spec.businessStates ?? null,
  formModes: spec.formModes ?? null,
  views: spec.views ?? null,
  defaultView: spec.defaultView ?? null,
  searchIdleTitle: spec.searchIdleTitle ?? null,
  currentStatus: spec.currentStatus ?? null,
  referenceId: spec.referenceId ?? spec.meta.pageId,
  linkedRoutes: spec.linkedRoutes ?? {},
};
```

- `Button`: if `props.action` add `data-action`.
- `SearchBar`: render `<input class="search-input" data-search-input placeholder="...">`; keep the icon.
- `ListRow`: add `data-search-text` from `props.searchText`.
- `EmptyState`: add `data-empty-kind` from `props.emptyKind`.
- `Section`: add `data-view-panel` from `props.viewPanel`.
- `CalendarGrid`: root `data-view-panel="calendar"`; each cell
  `data-slot-date="<day.date>" data-slot-time="<hour>"`; each block
  `data-block` with an escaped JSON payload.
- `MobileShell`/`PageShell`: add `data-page-archetype`, `data-page-id`,
  `data-current-status`, and JSON attributes `data-business-states`,
  `data-form-modes`, `data-views`, `data-default-view` when present.
- Add `.empty-state[data-empty-kind]{display:flex}` so the search idle/empty
  panels can be shown by JS; `[hidden]` still wins.

- [x] **Step 4: Add the inline controller**

Add `renderInteractionScript(): string` returning a `<script>` body. It must:

```ts
(() => {
const raw = document.getElementById("interaction-config")?.textContent;
if (!raw) return;
const config = JSON.parse(raw);
const qsa = (selector) => [...document.querySelectorAll(selector)];

function applyBusinessStates() {
  const states = config.businessStates;
  if (!states) return;
  let status = config.currentStatus ?? states[0]?.name;
  const currentState = () => states.find((state) => state.name === status);
  const actions = () => currentState()?.actions ?? [];
  const apply = () => {
    for (const button of qsa("[data-action]")) {
      button.hidden = !actions().includes(button.dataset.action);
    }
    const badge = document.querySelector(".badge");
    if (badge) badge.textContent = status;
    const host = document.querySelector(".app-actions") ?? document.querySelector(".app-scroll");
    let note = document.querySelector(".state-note");
    if (currentState()?.note) {
      if (!note) {
        note = document.createElement("div");
        note.className = "state-note";
        host?.append(note);
      }
      note.textContent = currentState().note;
    } else {
      note?.remove();
    }
  };
  for (const button of qsa("[data-action]")) {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "改期" && config.linkedRoutes.form) {
        location.href = `${config.linkedRoutes.form}?mode=reschedule&appointmentId=${encodeURIComponent(config.referenceId)}`;
        return;
      }
      if (action === "术后告知" && config.linkedRoutes.notice) {
        location.href = config.linkedRoutes.notice;
        return;
      }
      if (action === "客户详情" && config.linkedRoutes.customer) {
        location.href = config.linkedRoutes.customer;
        return;
      }
      if (action === "开单") {
        window.alert("开单流程不在本切片");
        return;
      }
      if (action === "已到店确认" || action === "接单并确认到店") {
        status = "已到店";
      } else if (action === "取消") {
        if (!window.confirm("确认取消本单？")) return;
        status = "已取消";
      }
      apply();
    });
  }
  apply();
}

function applyFormModes() {
  const modes = config.formModes;
  if (!modes) return;
  const params = new URLSearchParams(location.search);
  let current = modes.find((mode) => mode.name === params.get("mode")) ?? modes[0];
  const submit = document.querySelector(".app-actions [data-action]");
  const customer = document.querySelector('[data-field="customer"] input');
  const host = document.querySelector(".app-scroll");
  const tabs = document.createElement("div");
  tabs.className = "mode-tabs";
  for (const mode of modes) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = mode.label;
    button.addEventListener("click", () => {
      current = mode;
      history.replaceState(
        null,
        "",
        `?mode=${mode.name}&appointmentId=${encodeURIComponent(config.referenceId)}`
      );
      apply();
    });
    tabs.append(button);
  }
  host?.prepend(tabs);
  const apply = () => {
    for (const button of tabs.children) {
      button.classList.toggle("active", button.textContent === current.label);
    }
    if (submit) {
      submit.textContent = current.actions[0];
      submit.dataset.action = current.actions[0];
    }
    if (customer) customer.disabled = current.customerLocked === true;
    let id = document.querySelector(".appointment-id");
    if (current.name === "reschedule") {
      if (!id) {
        id = document.createElement("div");
        id.className = "appointment-id";
        host?.prepend(id);
      }
      id.textContent = `预约 ${config.referenceId}`;
    } else {
      id?.remove();
    }
  };
  apply();
}

function applySearch() {
  const input = document.querySelector("[data-search-input]");
  if (!input) return;
  const rows = qsa("[data-search-text]");
  const idle = document.querySelector('[data-empty-kind="idle"]');
  const empty = document.querySelector('[data-empty-kind="empty"]');
  const apply = () => {
    const query = input.value.trim();
    let visible = 0;
    for (const row of rows) {
      const match = query.length > 0 && (row.dataset.searchText ?? "").includes(query);
      row.hidden = !match;
      if (match) visible += 1;
    }
    if (idle) idle.hidden = query.length > 0;
    if (empty) empty.hidden = query.length === 0 || visible > 0;
  };
  input.addEventListener("input", apply);
  const clear = document.querySelector('[data-action="清空关键词"]');
  clear?.addEventListener("click", () => {
    input.value = "";
    apply();
    input.focus();
  });
  apply();
}

function applyViews() {
  if (!config.views) return;
  const panels = qsa("[data-view-panel]");
  let current = config.defaultView ?? config.views[0];
  const toggle =
    document.querySelector("[data-view-toggle]") ??
    qsa("[data-action]").find((button) => /日历.*列表/.test(button.textContent ?? ""));
  const apply = () => {
    for (const panel of panels) {
      panel.hidden = panel.dataset.viewPanel !== current;
    }
  };
  toggle?.addEventListener("click", () => {
    current = current === "calendar" ? "list" : "calendar";
    apply();
  });
  for (const cell of qsa("[data-slot-date]")) {
    cell.addEventListener("click", () => {
      if (config.linkedRoutes.create) {
        location.href = `${config.linkedRoutes.create}?mode=new&date=${encodeURIComponent(cell.dataset.slotDate)}&time=${encodeURIComponent(cell.dataset.slotTime)}`;
      } else {
        window.alert("当前切片没有新增预约页");
      }
    });
  }
  for (const block of qsa("[data-block]")) {
    block.addEventListener("click", () => {
      const data = JSON.parse(block.dataset.block);
      const drawer = document.createElement("div");
      drawer.className = "detail-drawer";
      const card = document.createElement("div");
      card.className = "detail-drawer-card";
      for (const [key, value] of Object.entries(data)) {
        const line = document.createElement("p");
        line.textContent = `${key}: ${value}`;
        card.append(line);
      }
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "关闭";
      close.addEventListener("click", () => drawer.remove());
      card.append(close);
      drawer.append(card);
      drawer.addEventListener("click", (event) => {
        if (event.target === drawer) drawer.remove();
      });
      document.body.append(drawer);
    });
  }
  apply();
}

applyBusinessStates();
applyFormModes();
applySearch();
applyViews();
})();
```

Add CSS:

```css
[hidden]{display:none!important}
.search-input{flex:1;border:0;background:transparent;font:inherit;color:inherit;outline:none}
.mode-tabs{display:flex;gap:8px;padding:12px 16px 0}
.mode-tabs button{height:32px;border:1px solid var(--color-border-strong);border-radius:6px;background:#fff;font:inherit;font-size:13px}
.mode-tabs button.active{background:var(--color-action-primary);color:#fff;border-color:var(--color-action-primary)}
.appointment-id{font-size:12px;color:var(--color-text-tertiary);padding:4px 16px}
.state-note{padding:12px 16px;font-size:13px;color:var(--color-text-secondary)}
.detail-drawer{position:fixed;inset:0;z-index:200;background:rgba(15,23,42,.35);display:flex;align-items:flex-end}
.detail-drawer-card{width:100%;background:#fff;border-radius:12px 12px 0 0;padding:16px;display:flex;flex-direction:column;gap:8px}
```

Add the script before `</body>` only when the page has any interaction config
(businessStates/formModes/views/searchIdleTitle). Add CSS for
`.search-input`, `[hidden]{display:none!important}`, `.state-note`, and a
small drawer.

- [x] **Step 5: Run renderer tests**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts`
Expected: PASS.

- [x] **Step 6: Commit (local only)**

```bash
git add core/renderer-html/src/index.ts core/renderer-html/tests/renderer.test.ts
git commit -m "feat(renderer): add inline interaction controller"
```

---

## Task 5: Clean real intake

**Files:**
- Modify: `samples/projects/employee-app-phase2/prd.md` (explicit interaction metadata)
- Update: `samples/projects/employee-app-phase2/ui-brief.json`
- Update: `samples/agents/intake-employee-app-phase2/*.json`
- Update: `samples/projects/employee-app-phase2/ui-brief.json` signoff

- [x] **Step 1: Add explicit metadata to the PRD**

In `samples/projects/employee-app-phase2/prd.md`, add a section:

```md
## 12. 交互元数据

### 12.1 预约详情业务状态

| 状态 | 允许动作 |
|---|---|
| 已登记 | 已到店确认、接单并确认到店、开单、改期、取消 |
| 已到店 | 开单；serviceCompleted=true 时术后告知 |
| 爽约 | 无；只读说明「爽约已记录入客户档案」 |
| 已取消 | 无；只读说明「本单已取消」 |

### 12.2 新增/改期模式

- new：按钮「保存」，客户可编辑。
- reschedule：按钮「保存改期」，客户锁定，使用 `appointmentId` 查询参数。

### 12.3 预约列表视图

- views：calendar、list；默认 calendar。
- 日历空格 → 新增预约并预填日期/时间；点块 → 详情抽屉。

### 12.4 客户搜索

- 首次进入显示 `searchIdleTitle`，不返回默认客户列表；输入关键词后过滤。
```

- [x] **Step 2: Run clean intake**

```bash
cd pipeline
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm intake:run \
  --project samples/projects/employee-app-phase2/project.yaml \
  --prd samples/projects/employee-app-phase2/prd.md \
  --runtime dsh --runs /tmp/intake-clean \
  --max-cost-cny 3 --json
```

Expected: 8 pages, brief gate passed. If gate blockers appear, let gate-repair
run; inspect `findings/brief-gate.json`. **Do not edit the brief manually.**
If after 2 repair rounds it still fails, stop and report the blocker.

- [x] **Step 3: Sign and publish**

Create `/tmp/signoff-clean-prd-ia.md`:

```md
# PRD/IA signoff (clean phase2)

<!-- signoff
{
  "signer": "Sample Reviewer",
  "date": "2026-10-22",
  "answers": [],
  "waivers": [
    { "findingId": "IA-xxx", "owner": "Sample Reviewer", "reason": "host tabs/root pages are outside the 8-page slice", "expires": "2026-11-20" }
  ],
  "approvals": []
}
-->
```

Keep only the host-boundary waivers reported by the run (≤3). Create
`/tmp/signoff-clean-brief.md` with the `brief.hash` from the `--json` summary:

```md
# Brief signoff

<!-- signoff
{
  "signer": "Sample Reviewer",
  "date": "2026-10-22",
  "briefHash": "<brief.hash from intake --json>",
  "answers": [],
  "waivers": [],
  "approvals": []
}
-->
```

Resume with `--signoff-prd-ia`, `--signoff-brief`, and `--publish-brief
samples/projects/employee-app-phase2/ui-brief.json`. Any blocker that is not a
host boundary means the PRD/brief must be fixed and the intake rerun.

- [x] **Step 4: Refresh fixtures**

Copy the accepted briefer output to
`samples/agents/intake-employee-app-phase2/ui-briefer.json` in the
`{ output, usage, usageComplete }` shape, preserving the new metadata.
Run `pnpm exec vitest run runtimes/standalone/tests/intake-cli.test.ts`.

- [x] **Step 5: Commit (local only)**

```bash
git add samples/projects/employee-app-phase2 samples/agents/intake-employee-app-phase2
git commit -m "feat(samples): clean phase2 brief with interaction metadata"
```

---

## Task 6: M1, Spec Engineer, HTML, interactions

- [x] **Step 1: Run M1**

```bash
DSH_HOME="$PWD/dsh/home" pnpm agent:run \
  --project samples/projects/employee-app-phase2/project.yaml \
  --runtime dsh --profile prd-ui-intake \
  --signoff-ia /tmp/signoff-clean-prd-ia.md \
  --runs /tmp/m1-clean --max-cost-cny 3 --json
```

Expected: `ia:waived` (host boundaries only) / `interaction:passed` /
`visualStyle:passed`; `agent:sign` if only visual-style is missing.

- [x] **Step 2: Spec Engineer and render**

```bash
pnpm spec:engineer --project samples/projects/employee-app-phase2/project.yaml \
  --agent-run /tmp/m1-clean/<runId> --runs /tmp/spec-clean
pnpm render:html --run /tmp/spec-clean/<runId> --out /tmp/html-clean
pnpm phase1:verify --project samples/projects/employee-app-phase2/project.yaml --runs /tmp/phase1-clean
```

Expected: 8 Page Specs / 0 blockers; 8 HTML + index; Phase 1 8/0.

- [x] **Step 3: Playwright interaction checks**

Serve `/tmp/html-clean` and verify:

1. Search “张” filters to 张女士; clear restores idle; nonsense shows empty.
2. Calendar/list toggle; click empty cell navigates to form with date/time; click block opens drawer.
3. Form new/reschedule toggle; customer locks in reschedule; CTA changes.
4. Detail: click 已到店确认 → status 已到店 and action bar shrinks; click 取消 → readonly note; 爽约/已取消 no actions.
5. Screenshot all 8 pages + interaction states.

- [x] **Step 4: Copy artifacts and commit**

Copy HTML/screenshots/signoffs/run summaries to
`pipeline/artifacts/employee-app-phase2/`. Commit locally.

---

## Task 7: Docs and full regression

- [x] **Step 1: Run the full suite**

```bash
cd pipeline
pnpm test
pnpm typecheck
pnpm test:dsh
pnpm phase1:verify --project samples/project.demo-orders-intake.yaml --runs /tmp/final-8p
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/final-emp
pnpm phase1:verify --project samples/projects/employee-app-appointments-03/project.yaml --runs /tmp/final-03
pnpm phase1:verify --project samples/projects/employee-app-phase2/project.yaml --runs /tmp/final-phase2
```

Expected: 510+ tests, typecheck clean, `test:dsh` 2, Phase 1 8/2/4/8 all 0.

- [x] **Step 2: Update docs**

Update `docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md` §14.1,
the new clean spec, `README.md`, `AGENTS.md`, `CHANGELOG.md`, the remaining-work
plan, and the handoff with:

- 0 manual patch and ≤3 host waivers;
- clean intake/M1/Spec/HTML evidence and costs;
- interaction screenshots;
- remaining v0.4 work (motion, stable node ids, Visual Critic/diff).

- [x] **Step 3: Final audit and commit**

Confirm no `.env`, keys, `node_modules`, or `/tmp` artifacts are committed.
Local commit only; no push.

---

## Final evidence (2026-10-22)

- Intake `run-2026-10-22T03-09-28-544Z`: `success`; 8 pages, all `b-mobile`;
  PRD/IA gate passed, brief gate passed; **0 waivers, 0 manual brief edits**;
  brief hash `sha256:b558b57a5876bdabdd268f05d355876f84b1f675d668f561db253b3c3b0b8335`;
  ¥0.8977902624, `usageComplete=true`; one PRD/IA answer (PRD-005 calendar
  09:00–20:00, 60-minute slots).
- M1 `run-2026-10-22T03-16-05-257Z`: `success`;
  `gates={ia:passed, interaction:passed, visualStyle:passed}`; 0 waivers;
  visual-style signoff via `agent:sign`; ¥0.4399832736
  (IA ¥0.1676724192 + interaction ¥0.2259093024 + visual-style ¥0.046401552),
  `usageComplete=true`.
- Spec Engineer `run-2026-10-22T03-23-54-618Z`: 8 Page Specs, 0 blockers,
  36 warnings (34 `SPEC_MOTION_NODE_UNRESOLVED`, 2 `SPEC_ASSET_UNUSED`); assets
  missing none, referenced `icon-plus` / `icon-search`.
- HTML: 8 pages + `index.html`; `phase1:verify` `8 pages / 0 blockers`.
- Playwright: search idle/张/clear/nonsense; calendar/list toggle; empty cell →
  form with date/time; drawer → 查看完整详情 → detail; list row / 查看完整详情 →
  detail; form new/reschedule CTA + customer lock; detail 已到店/取消/爽约;
  treatment notice confirm with 确认人/确认时间; 19 screenshots.
- Regression: 529 tests passed, typecheck clean, `test:dsh` 2 passed; Phase 1
  `8 / 2 / 4 / 8` pages all 0 blockers.
- Cost: final chain ¥1.337773536; ¥2.935835885 including earlier retries.
- v0.4 debt: customer picker not wired in the static renderer; calendar prefill
  is day-of-month (`03 09:00`), not full `YYYY-MM-DD`; M1 interaction spec
  `cd.new-appointment` still says prefill+lock while the signed brief keeps new
  editable (artifact unchanged); 34 motion-node warnings; asset review
  unchanged (2026-10-21 evidence, no `/tmp` paths); 爽约/已取消 keep the
  read-only 客户详情 nav.
