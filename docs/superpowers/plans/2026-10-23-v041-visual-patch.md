# v0.4.1 Visual Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the six v0.4.1 visual fixes (today CTA, calendar affordance/selection, list error context, datetime localization, reschedule context) without touching the signed brief, M1/intake, or v0.5 structural work.

**Architecture:** The compiler writes the new optional data (`linkedRoutes.list`, Card action props, calendar day `selected`, Chinese datetime placeholder). The renderer consumes it with small HTML/CSS/JS additions. Visual Review gets `VisualCase.storage` so the reschedule screenshot reproduces the real detail → form click path. No new screenshot cases; the matrix stays at 24.

**Tech Stack:** TypeScript (strict, ESM), pnpm workspace, vitest, Playwright (pinned Chromium), dsh / `prd-ui-visual` for the real critic.

**Spec:** `docs/superpowers/specs/2026-10-23-v041-visual-patch-design.md`

> **Execution note (2026-10-23):** Implemented. The real critic rejected the 3-day scroll affordance, so the final calendar is a compact 7-day week; see spec §13 for this and the other implementation deviations.

## Global Constraints

- Do not edit `samples/projects/employee-app-phase2/ui-brief.json`, M1/intake artifacts, dsh profiles, or `.env`.
- `PageSpec.meta.version` stays `0.1.0`; additions are optional fields only.
- No new screenshot cases: the phase2 matrix stays at 24.
- `visual:baseline` is a human gate; do not let `visual:review` write it.
- `waivers=[]`; no `VISUAL_CRITIC_BLOCKER` waiver.
- Local commits only, no push. Commit only when the user asks.
- Final gates: `pnpm test` 644+, `pnpm typecheck`, `pnpm test:dsh` 4, Phase 1 `8/2/4/8` all 0, `--strict-motion` 8/0/0.

---

### Task 1: Contracts, catalogs, compiler data

**Files:**
- Modify: `core/contracts/src/page-spec.ts` (`linkedRoutes.list` interface + zod)
- Modify: `core/design-system/src/catalogs/b-mobile.ts`, `b-dense.ts`, `c-expressive.ts` (Card props)
- Modify: `core/compiler/src/compile-page-spec.ts` (`linkedRoutesFor`, home Card, `calendarDays`, datetime placeholder)
- Test: `core/compiler/tests/compiler.test.ts`, `core/design-system/tests/design-system.test.ts`

**Interfaces:**
- Produces: `PageSpec.linkedRoutes.list?: string`; Card props `actionLabel?: string`, `actionRoute?: string`; `CalendarGrid.days[].selected?: boolean`; datetime `placeholder = 请选择${label}`.

- [ ] **Step 1: Add the failing compiler test**

In `core/compiler/tests/compiler.test.ts`, after the phase2 quick-action test:

```ts
it("adds today's appointment-list entry and marks the selected calendar day", () => {
  const phase2 = UiBriefSchema.parse(phase2BriefJson);
  const compiled = compileProject(phase2, deps);
  const today = compiled.find((spec) => spec.meta.pageId === "today")!;
  const card = collectNodes(today.layout).find(
    (node) => node.type === "Card" && node.props?.title === "我的预约"
  )!;
  expect(card.props).toMatchObject({
    actionLabel: "查看全部",
    actionRoute: "/appointments",
  });
  expect(today.linkedRoutes?.list).toBe("/appointments");

  const list = compiled.find((spec) => spec.meta.pageId === "appointment-list")!;
  const calendar = collectNodes(list.layout).find((node) => node.type === "CalendarGrid")!;
  const days = calendar.props?.days as Array<{ date: string; selected: boolean; today: boolean }>;
  expect(days.find((day) => day.date === "2025-11-05")?.selected).toBe(true);
  expect(days.filter((day) => day.selected)).toHaveLength(1);
  expect(days.every((day) => day.today === false)).toBe(true);

  const form = compiled.find((spec) => spec.meta.pageId === "appointment-form")!;
  const inputs = collectNodes(form.layout).filter((node) => node.type === "Input");
  expect(inputs.find((node) => node.props?.name === "startTime")?.props?.placeholder).toBe(
    "请选择开始时间"
  );
  expect(inputs.find((node) => node.props?.name === "endTime")?.props?.placeholder).toBe(
    "请选择结束时间"
  );
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec vitest run core/compiler/tests/compiler.test.ts -t "adds today's appointment-list entry"`
Expected: FAIL (Card props missing / `linkedRoutes.list` undefined / `selected` undefined).

- [ ] **Step 3: Add the contract and catalog fields**

In `core/contracts/src/page-spec.ts`, add `list?: string` to the interface and schema `linkedRoutes` object.

In each of the three catalog files, add to `Card.props`:

```ts
actionLabel: { type: "string" },
actionRoute: { type: "string" },
```

- [ ] **Step 4: Implement compiler changes**

`linkedRoutesFor`: add a `list` route using the spec §4.1 rule. `buildLayout` home: add `actionLabel: "查看全部"` and `actionRoute: <listRoute>` to the「我的预约」Card. `calendarDays`: add `selected: date === selectedDate` with `selectedDate = resolvedRowDate ?? (meta date inside week ? meta date : undefined)`. `mobile-form` placeholder: use `请选择${label}` for `datetime-local`.

- [ ] **Step 5: Add the design-system contract test**

```ts
it("declares the Card header action props for every library", () => {
  for (const catalog of [bDenseCatalog, bMobileCatalog, cExpressiveCatalog]) {
    const card = component(catalog, "Card");
    expect(card.props.actionLabel?.type).toBe("string");
    expect(card.props.actionRoute?.type).toBe("string");
  }
});
```

- [ ] **Step 6: Run focused tests**

Run: `pnpm exec vitest run core/compiler/tests/compiler.test.ts core/design-system/tests/design-system.test.ts`
Expected: PASS.

---

### Task 2: Renderer card action + calendar affordance

**Files:**
- Modify: `core/renderer-html/src/index.ts` (Card, CalendarGrid, CSS, `applyCalendarScroll`)
- Test: `core/renderer-html/tests/renderer.test.ts`

- [ ] **Step 1: Add the failing renderer test**

```ts
it("renders the today action and calendar scroll/selection affordances", () => {
  const today = renderDocument(phase2ById.get("today")!, getProfile("b-mobile"), {
    pageRoutes: phase2Routes,
  });
  expect(today).toContain('class="card-action" href="appointment-list.html"');
  expect(today).toContain("查看全部");

  const list = renderDocument(phase2ById.get("appointment-list")!, getProfile("b-mobile"), {
    pageRoutes: phase2Routes,
  });
  expect(list).toContain('class="calendar-hint"');
  expect(list).toContain('class="calendar-viewport"');
  expect(list).toContain('class="calendar-scroll" tabindex="0"');
  expect(list).toContain('class="calendar-day selected"');
  expect(list).toContain('class="calendar-cell selected"');
  expect(list).toContain("applyCalendarScroll");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts -t "renders the today action"`
Expected: FAIL.

- [ ] **Step 3: Implement Card action + calendar markup/CSS/JS**

Use spec §5.1 and §5.2. Card: resolve `actionRoute` via `routeHref`, render `<a class="card-action" href="...">`. Calendar: parse `selected`, add `calendar-hint`/`calendar-viewport`/`calendar-fade`, selected classes, CSS block, and `applyCalendarScroll()`.

- [ ] **Step 4: Run the renderer test**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts -t "renders the today action"`
Expected: PASS.

---

### Task 3: Inline list error context

**Files:**
- Modify: `core/renderer-html/src/index.ts` (`statePanels` split, `MobileShell`, CSS)
- Test: `core/renderer-html/tests/renderer.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
it("keeps list context above an inline error panel", () => {
  const list = renderDocument(phase2ById.get("appointment-list")!, getProfile("b-mobile"), {
    pageRoutes: phase2Routes,
  });
  const inline = list.indexOf('class="state-panel error inline"');
  expect(inline).toBeGreaterThan(-1);
  expect(inline).toBeLessThan(list.indexOf("</main>"));

  const detail = renderDocument(phase2ById.get("appointment-detail")!, getProfile("b-mobile"), {
    pageRoutes: phase2Routes,
  });
  expect(detail).not.toContain("state-panel error inline");
  expect(detail.indexOf('class="state-panel error"')).toBeGreaterThan(
    detail.indexOf("</main>")
  );
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts -t "keeps list context"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Split `statePanels()` into `loadingPanel()` and `errorPanel(variant)`. In `MobileShell`, render `errorPanel("inline")` inside `app-scroll` only for `mobile-list`; keep the overlay for other archetypes. Add the spec §5.3 CSS (inline panel, hide calendar/list/empty in error state).

- [ ] **Step 4: Run the test**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts -t "keeps list context"`
Expected: PASS.

---

### Task 4: Datetime display + reschedule context banner

**Files:**
- Modify: `core/renderer-html/src/index.ts` (Input, CSS, `applyDateTimeDisplay`, `applyFormModes`, init order)
- Test: `core/renderer-html/tests/renderer.test.ts` (add new test; update two existing reschedule tests)

- [ ] **Step 1: Add the failing test**

```ts
it("localizes datetime display and renders a reschedule context", () => {
  const form = renderDocument(phase2ById.get("appointment-form")!, getProfile("b-mobile"), {
    pageRoutes: phase2Routes,
    pageArchetypes: phase2Archetypes,
  });
  expect(form).toContain('class="datetime-control"');
  expect(form).toContain('class="datetime-display" aria-hidden="true">请选择开始时间');
  expect(form).toContain("applyDateTimeDisplay");
  expect(form).toContain('className = "reschedule-context"');
  expect(form).toContain("正在改期");
  expect(form).toContain("请从预约详情进入改期");
  expect(form).not.toContain("appointment-id");
});
```

Update `stores and restores reschedule record context` to expect `rescheduleRecord.project` / `rescheduleRecord.therapist`. Update `does not leak the page id as a reschedule reference` to no longer expect `current.name === "reschedule" && appointmentId`; assert the banner fallback text instead.

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts -t "localizes datetime display"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Use spec §5.4 and §5.5: Input wrapper + `.datetime-display` CSS + `applyDateTimeDisplay()`; `rescheduleRecord` variable, `ensureBanner()`, banner CSS, remove `.appointment-id`. Call `applyFormModes()` before `applyDateTimeDisplay()` in the init sequence.

- [ ] **Step 4: Run the renderer tests**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts`
Expected: PASS (all renderer tests, including updated reschedule tests).

---

### Task 5: Visual harness storage + matrix context

**Files:**
- Modify: `core/visual-review/src/contracts.ts` (`VisualCase.storage`)
- Modify: `core/visual-review/src/matrix.ts` (`rescheduleContext`)
- Modify: `runtimes/standalone/src/visual/screenshot.ts` (`addInitScript`)
- Test: `core/visual-review/tests/matrix.test.ts`, `runtimes/standalone/tests/visual-cli.test.ts`

- [ ] **Step 1: Add the failing matrix test**

```ts
it("seeds the reschedule screenshot from the appointment detail summary", () => {
  const brief = UiBriefSchema.parse(
    JSON.parse(
      readFileSync(
        path.join(pipelineRoot, "samples", "projects", "employee-app-phase2", "ui-brief.json"),
        "utf8"
      )
    )
  );
  const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });
  const reschedule = buildVisualMatrix(specs).find(
    (entry) => entry.id === "appointment-form.mode.reschedule"
  )!;
  expect(reschedule.query).toEqual({ mode: "reschedule", recordId: "appointment-detail" });
  expect(reschedule.storage).toBeDefined();
  const record = JSON.parse(Object.values(reschedule.storage!)[0]!);
  expect(record).toMatchObject({
    customer: "张女士",
    project: "小气泡",
    time: "11-05 周三 10:00-11:00",
    therapist: "王美容",
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec vitest run core/visual-review/tests/matrix.test.ts -t "seeds the reschedule screenshot"`
Expected: FAIL (`storage` undefined).

- [ ] **Step 3: Implement**

Use spec §5.5: add `storage?: Record<string, string>` to `VisualCase`; add `rescheduleContext()` with candidate iteration (skip pages without customer/time); add `recordId`/`appointmentId` query and storage to the reschedule case; in `captureCase`, call `page.addInitScript` before `goto`.

- [ ] **Step 4: Add the screenshot storage test**

In the existing Chromium-gated screenshot test block, add:

```ts
it.skipIf(!hasChromium)("seeds sessionStorage before capture", async () => {
  const root = await tempDir("prd-ui-visual-storage-");
  const htmlDir = path.join(root, "html");
  await mkdir(htmlDir, { recursive: true });
  await writeFile(
    path.join(htmlDir, "storage.html"),
    `<script>if (sessionStorage.getItem("prd-ui:test") !== "seeded") throw new Error("missing storage");</script>`,
    "utf8"
  );
  const evidence = await captureVisualCases({
    htmlDir,
    outDir: path.join(root, "out"),
    cases: [
      {
        id: "storage.seeded",
        pageId: "storage",
        state: "default",
        storage: { "prd-ui:test": "seeded" },
        viewport: { width: 120, height: 80 },
      },
    ],
  });
  expect(evidence[0]?.consoleErrors).toBe(0);
});
```

- [ ] **Step 5: Run the matrix and visual tests**

Run: `pnpm exec vitest run core/visual-review/tests/matrix.test.ts`
Run: `pnpm exec vitest run runtimes/standalone/tests/visual-cli.test.ts -t "seeds sessionStorage"`
Expected: PASS (Chromium-gated test may skip if Chromium is unavailable).

---

### Task 6: Full mechanical gates + render

**Files:** no code changes; run gates.

- [ ] **Step 1: Unit/typecheck/dsh**

Run:
```bash
cd pipeline
pnpm test
pnpm typecheck
pnpm test:dsh
```
Expected: 644+ passed, typecheck clean, 4 dsh tests passed.

- [ ] **Step 2: Phase 1**

```bash
pnpm phase1:verify --project samples/project.demo-orders-intake.yaml --runs /tmp/v041-8p
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/v041-emp
pnpm phase1:verify --project samples/projects/employee-app-appointments-03/project.yaml --runs /tmp/v041-03
pnpm phase1:verify --project samples/projects/employee-app-phase2/project.yaml --runs /tmp/v041-phase2
```
Expected: `8 / 2 / 4 / 8` pages, all 0 blockers.

- [ ] **Step 3: Spec + render**

```bash
pnpm spec:engineer --project samples/projects/employee-app-phase2/project.yaml \
  --agent-run /tmp/m1-final2/run-2026-10-22T03-16-05-257Z \
  --runs /tmp/spec-v041 --strict-motion
pnpm render:html --run /tmp/spec-v041/<runId> --out /tmp/html-v041
```
Expected: 8 Page Specs / 0 blockers / 0 motion unresolved; 8 HTML + index.

---

### Task 7: Visual baseline / critic / sign / docs (human-gated)

**Files:** `pipeline/baselines/employee-app-phase2/`, `pipeline/artifacts/employee-app-phase2/visual-review/`, `CHANGELOG.md`, roadmap, handoff.

- [ ] **Step 1: Baseline (human gate)**

```bash
pnpm visual:baseline --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v041/<runId> --html /tmp/html-v041 \
  --out baselines/employee-app-phase2
```
Compare old/new manifest `visualHash`; expected changed cases: `today.default`, `appointment-form.default`, `appointment-form.state.disabled`, `appointment-form.mode.reschedule`, `appointment-list.default`, `appointment-list.state.error`; confirm drawer/empty only if the shared calendar styles change them.

- [ ] **Step 2: Real critic**

```bash
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm visual:review \
  --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v041/<runId> --html /tmp/html-v041 \
  --baseline baselines/employee-app-phase2 --runtime dsh --profile prd-ui-visual \
  --runs /tmp/visual-v041 --max-cost-cny 3 --json
```
Expected: 24/24 screenshots, 0 console/overflow, 0 blocker, no new major; VC-003/004/005 remain as v0.5 debt.

- [ ] **Step 3: Sign**

```bash
pnpm visual:sign --run /tmp/visual-v041/<runId> --signoff-visual /tmp/signoff-v041.md
```
Expected: `waivers=[]`, new `manifestHash`/`findingsHash` bound.

- [ ] **Step 4: Evidence + docs**

Copy the new screenshots/findings/signoff/critique cache evidence into `pipeline/artifacts/employee-app-phase2/visual-review/`; update its README. Update `CHANGELOG.md`, the roadmap status, and a v0.4.1 handoff. Do not push.

## Self-Review

- Spec coverage: §5.1 → Task 1+2; §5.2 → Task 1+2; §5.3 → Task 3; §5.4 → Task 1+4; §5.5 → Task 4+5; gates → Task 6+7.
- No placeholders: each task has exact test code and file targets; implementation CSS/JS is in the spec sections cited.
- Type consistency: `linkedRoutes.list`, `actionLabel/actionRoute`, `day.selected`, `VisualCase.storage`, `rescheduleRecord`, `ensureBanner` are used consistently across tasks.
