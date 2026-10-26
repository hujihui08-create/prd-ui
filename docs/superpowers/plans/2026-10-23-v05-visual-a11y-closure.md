# v0.5 Visual + A11y Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three structural visual majors and the a11y baseline before Phase 3: in-place loading skeletons, inline empty states, removal of form mode pills, keyboard/focus/contrast baseline, and a critic stop rule that enforces `0 blocker + ≤2 major + human signoff`.

**Architecture:** Keep the accepted 7-column calendar. Loading and empty become states of the existing page DOM (no fixed overlays), so skeleton geometry matches loaded geometry. Form mode is decided by entry, not an in-page switch. A11y is a focused Playwright baseline (contrast, focus, keyboard, labels), not full axe. The signoff schema gains `acceptedMajors` and `visual:sign` enforces the major cap.

**Tech Stack:** TypeScript (strict, ESM), pnpm workspace, vitest, Playwright (pinned Chromium), dsh `prd-ui-visual` for the real critic.

**Spec:** `docs/superpowers/specs/2026-10-23-v05-visual-a11y-closure-design.md`

> **Execution note (2026-10-23):** Implemented and signed. 672 tests, 0 major / 4 minor, baseline `sha256:6c900b29…c79f`, signoff run `run-2026-10-23T06-10-08-791Z`. See spec §13 for results and v0.5.x minors.

## Global Constraints

- Do not edit `samples/projects/employee-app-phase2/ui-brief.json`, M1/intake artifacts, dsh profiles, or `.env`.
- Keep the 390px compact 7-column calendar; do not reintroduce 3-day scroll.
- Visual matrix stays at 24 cases; no new pages or screenshot cases.
- `visual:baseline` is a human gate; `visual:review` never writes baseline.
- v0.5 signoff: 0 blocker, ≤2 major, every major has `acceptedMajors` (reason + owner + reviewBy), human signoff. v0.4.1 legacy signoffs are not revalidated.
- A11y scope is key pages/flows only; no full axe/AA or screen-reader matrix.
- Local commits only when authorized; no push.
- Final gates: `pnpm test` 652+, typecheck, `pnpm test:dsh` 4, Phase 1 `8/2/4/8` all 0, strict motion 8/0/0.

---

### Task 1: Catalog and signoff contracts

**Files:**
- Modify: `core/design-system/src/catalogs/b-mobile.ts`
- Modify: `core/agents/src/signoff.ts`
- Test: `core/design-system/tests/design-system.test.ts`, `core/agents/tests/gates.test.ts`

**Interfaces:**
- Produces: `EmptyState.variant` includes `"inline"`; `Button.emphasis` includes `"danger"`; `ParsedSignoff.acceptedMajors: AcceptedMajor[]`.

- [ ] **Step 1: Add failing catalog test**

```ts
it("declares inline EmptyState and danger Button variants", () => {
  const empty = component(bMobileCatalog, "EmptyState");
  expect(empty.props.variant?.enum).toEqual(["default", "calendar", "inline"]);
  const button = component(bMobileCatalog, "Button");
  expect(button.props.emphasis?.enum).toEqual([
    "primary",
    "secondary",
    "ghost",
    "danger",
  ]);
  expect(button.variants).toContain("danger");
});
```

- [ ] **Step 2: Add failing signoff parse test**

In `core/agents/tests/gates.test.ts`:

```ts
it("parses acceptedMajors for visual signoff", () => {
  const parsed = parseSignoffMarkdown(`# Visual signoff

<!-- signoff
${JSON.stringify({
  signer: "Sample Reviewer",
  date: "2026-10-23",
  manifestHash: "sha256:manifest",
  findingsHash: "sha256:findings",
  acceptedMajors: [
    {
      findingId: "VC-1",
      reason: "v0.5 debt",
      owner: "design",
      reviewBy: "v0.6",
    },
  ],
  waivers: [],
})}
-->
`);
  expect(parsed.valid).toBe(true);
  expect(parsed.acceptedMajors).toEqual([
    {
      findingId: "VC-1",
      reason: "v0.5 debt",
      owner: "design",
      reviewBy: "v0.6",
    },
  ]);
});
```

- [ ] **Step 3: Run tests and confirm they fail**

Run: `pnpm exec vitest run core/design-system/tests/design-system.test.ts core/agents/tests/gates.test.ts`
Expected: FAIL (missing variant / acceptedMajors).

- [ ] **Step 4: Implement the contracts**

Add `inline` to EmptyState `props.variant.enum` and `variants`; add `danger` to Button `props.emphasis.enum` and `variants`. In `core/agents/src/signoff.ts`, add `AcceptedMajorSchema`, `acceptedMajors` to `SignoffBlockSchema` (default `[]`) and `ParsedSignoff`, and return it from `parseSignoffMarkdown`.

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run core/design-system/tests/design-system.test.ts core/agents/tests/gates.test.ts`
Expected: PASS.

---

### Task 2: Compiler — empty panels, list skeleton, cancel danger

**Files:**
- Modify: `core/compiler/src/compile-page-spec.ts`
- Test: `core/compiler/tests/compiler.test.ts`

**Interfaces:**
- Consumes: EmptyState `inline`, Button `danger`.
- Produces: two inline EmptyState nodes for mobile-list with views (calendar/list panels); a `Skeleton` `variant: "list"` node in the list panel; `取消` Button emphasis `"danger"`.

- [ ] **Step 1: Add failing compiler tests**

```ts
it("places inline empty states in both view panels and a list skeleton", () => {
  const list = phase2Spec("appointment-list");
  const panels = collectNodes(list.layout).filter(
    (node) => node.type === "Section" && node.props?.viewPanel !== undefined
  );
  const calendar = panels.find((node) => node.props?.viewPanel === "calendar")!;
  const listPanel = panels.find((node) => node.props?.viewPanel === "list")!;
  const empties = (panel: SpecNode) =>
    collectNodes(panel).filter(
      (node) => node.type === "EmptyState" && node.props?.variant === "inline"
    );
  expect(empties(calendar)).toHaveLength(1);
  expect(empties(listPanel)).toHaveLength(1);
  expect(
    collectNodes(listPanel).some(
      (node) => node.type === "Skeleton" && node.props?.variant === "list"
    )
  ).toBe(true);
});

it("marks 取消 as a danger action", () => {
  const detail = phase2Spec("appointment-detail");
  const cancel = nodesOf(detail, "Button").find(
    (node) => node.props?.label === "取消"
  );
  expect(cancel?.props?.emphasis).toBe("danger");
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `pnpm exec vitest run core/compiler/tests/compiler.test.ts -t "places inline empty"`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Change the mobile-list `emptyNode` variant to `"inline"`; description includes `activeDateLabel` when present.
- Insert a copy into the calendar Section (after legend, before CalendarGrid) and into the list Section (after list nodes); remove the single trailing `emptyNode` for mobile-list. If `interaction.views` is undefined, keep one in the list section.
- Add `{ type: "Skeleton", props: { variant: "list" } }` to the list Section.
- In `detailLayout`, map `取消` to `btn("取消", "danger")`; other secondary actions remain `"ghost"`.
- P2 copy/placement work is Task 8; keep Task 2 limited to the structural changes above.

- [ ] **Step 4: Run compiler tests**

Run: `pnpm exec vitest run core/compiler/tests/compiler.test.ts`
Expected: PASS.

---

### Task 3: Renderer — in-place loading skeleton

**Files:**
- Modify: `core/renderer-html/src/index.ts`
- Test: `core/renderer-html/tests/renderer.test.ts`, new `runtimes/standalone/tests/v05-layout.test.ts` (Chromium-gated)

**Interfaces:**
- Consumes: `Skeleton` list node; Loading state via `?state=loading`.
- Produces: mobile-list/detail no longer render `state-panel loading`; calendar cells shimmer; list has 12 `.skeleton-list-row`; detail values skeletonize.

- [ ] **Step 1: Add failing renderer tests**

```ts
it("uses in-place loading skeletons for list and detail", () => {
  const list = renderDocument(phase2ById.get("appointment-list")!, getProfile("b-mobile"), {
    pageRoutes: phase2Routes,
  });
  expect(list).not.toContain('class="state-panel loading"');
  expect((list.match(/skeleton-list-row/g) ?? []).length).toBe(12);
  expect(list).toContain('body[data-state="loading"] .calendar-cell');
  expect(list).toContain("aria-busy");

  const detail = renderDocument(phase2ById.get("appointment-detail")!, getProfile("b-mobile"), {
    pageRoutes: phase2Routes,
  });
  expect(detail).not.toContain('class="state-panel loading"');
  expect(detail).toContain('body[data-state="loading"] .list-text-value');
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts -t "uses in-place loading"`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `Skeleton` renderer: `variant: "list"` → 12 `.skeleton-list-row`; `card` unchanged.
- MobileShell: for `mobile-list` and `detail`, do not render `loadingPanel()`; keep the real content. Other archetypes keep generic loading.
- CSS: loading hides `.calendar-block` / list rows; calendar cells shimmer; `.skeleton-list-row` 12 rows; detail values become shimmer bars; footer CTA visible but `pointer-events:none`.
- JS: set `aria-busy="true"` on `.app-scroll` (or `.app`) when `?state=loading`; remove after state change. Add visually-hidden "正在加载" text.
- Hide `.calendar-hint`/`.calendar-fade` while loading.

- [ ] **Step 4: Add geometry test**

In `runtimes/standalone/tests/v05-layout.test.ts`, render the phase2 pages to a temp dir, serve with `createStaticServer`, and measure:

```ts
const height = async (url: string, selector: string) => {
  await page.goto(url);
  return page.locator(selector).evaluate((el) => el.getBoundingClientRect().height);
};
expect(Math.abs(
  (await height(listLoadingUrl, ".calendar")) - (await height(listDefaultUrl, ".calendar"))
)).toBeLessThanOrEqual(8);
expect(Math.abs(
  (await height(detailLoadingUrl, ".card")) - (await height(detailDefaultUrl, ".card"))
)).toBeLessThanOrEqual(8);
```

- [ ] **Step 5: Run renderer + geometry tests**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts`
Run: `pnpm exec vitest run runtimes/standalone/tests/v05-layout.test.ts`
Expected: PASS (Chromium-gated test may skip).

---

### Task 4: Renderer — inline empty state

**Files:**
- Modify: `core/renderer-html/src/index.ts`
- Test: `core/renderer-html/tests/renderer.test.ts`, `runtimes/standalone/tests/v05-layout.test.ts`

- [ ] **Step 1: Add failing renderer test**

```ts
it("renders empty as an inline band without a fixed overlay", () => {
  const list = renderDocument(phase2ById.get("appointment-list")!, getProfile("b-mobile"), {
    pageRoutes: phase2Routes,
  });
  expect(list).toContain('class="empty-state empty-inline"');
  expect(list).not.toContain("empty-calendar{position:fixed");
  expect(list).toContain('body[data-state="empty"] .calendar-block');
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts -t "renders empty as an inline band"`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Add `.empty-inline` class for EmptyState `variant: "inline"`.
- Remove the fixed `.empty-calendar` rule; add inline band CSS (full width, subtle surface, borders, no shadow).
- Keep `body[data-state="empty"] .calendar-block{display:none}` and hide list rows; keep day header/time rail/legend and the "清空筛选" action.
- Ensure the active panel's empty is visible; the inactive panel remains hidden by the view switch.

- [ ] **Step 4: Add Playwright overlap assertion**

In `v05-layout.test.ts`:

```ts
const empty = await page.locator(".empty-state.empty-inline:visible").boundingBox();
const header = await page.locator(".calendar-day").first().boundingBox();
const overlaps =
  empty !== null && header !== null &&
  empty.y < header.y + header.height &&
  header.y < empty.y + empty.height;
expect(overlaps).toBe(false);
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts -t "renders empty as an inline band"`
Run: `pnpm exec vitest run runtimes/standalone/tests/v05-layout.test.ts`
Expected: PASS.

---

### Task 5: Renderer — remove form mode pills

**Files:**
- Modify: `core/renderer-html/src/index.ts`
- Test: `core/renderer-html/tests/renderer.test.ts`, `runtimes/standalone/tests/v05-layout.test.ts`

- [ ] **Step 1: Add failing renderer test**

```ts
it("removes mode pills and expresses reschedule through title and banner", () => {
  const form = renderDocument(phase2ById.get("appointment-form")!, getProfile("b-mobile"), {
    pageRoutes: phase2Routes,
    pageArchetypes: phase2Archetypes,
  });
  expect(form).not.toContain("mode-tabs");
  expect(form).toContain("改期预约");
  expect(form).toContain("请从预约详情进入改期");
  expect(form).toContain("submit.disabled = true");
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts -t "removes mode pills"`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Delete mode-tabs creation/buttons/history replacement/lockEntryMode from `applyFormModes`.
- Select `current` from `?mode=` or the first form mode; keep actions/customer lock/CTA.
- Set `.page-title` to `改期预约` or `新增预约`.
- Reschedule without a stored record: keep the context banner prompt and set `submit.disabled = true`; enable when the record is loaded.
- Remove `.mode-tabs` CSS and the `.mode-tabs` selector from `applyReadonlyState`.

- [ ] **Step 4: Add Playwright flow test**

In `v05-layout.test.ts`: open `appointment-detail.html`, click `改期`, assert no `.mode-tabs`, title `改期预约`, fields prefilled, save enabled. Open `appointment-form.html?mode=reschedule` directly and assert save disabled + prompt.

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts`
Run: `pnpm exec vitest run runtimes/standalone/tests/v05-layout.test.ts`
Expected: PASS.

---

### Task 6: a11y — focus, keyboard, labels

**Files:**
- Modify: `core/renderer-html/src/index.ts`
- Test: `core/renderer-html/tests/renderer.test.ts`, new `runtimes/standalone/tests/a11y.test.ts`

- [ ] **Step 1: Add failing renderer assertions**

```ts
it("adds focus, keyboard, and required semantics", () => {
  const list = renderDocument(phase2ById.get("appointment-list")!, getProfile("b-mobile"), {
    pageRoutes: phase2Routes,
  });
  expect(list).toContain(":focus-visible");
  expect(list).toContain('role="button"');
  expect(list).toContain('tabindex="0"');
  const form = renderDocument(phase2ById.get("appointment-form")!, getProfile("b-mobile"), {
    pageRoutes: phase2Routes,
  });
  expect(form).toContain("aria-required");
});
```

- [ ] **Step 2: Run test and confirm it fails**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts -t "adds focus, keyboard"`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Add `:focus-visible` outline for links/buttons/inputs/selects/tabs/calendar-scroll/list rows/calendar blocks; keep search input focus visible.
- Clickable `ListRow`/`[data-row-link]`: `tabindex="0"`, `role="button"`, keydown Enter/Space triggers click.
- Calendar blocks `[data-block]`: same; Enter opens drawer.
- Drawer: Escape closes; focus moves into drawer and returns to the trigger.
- Required FormField children: input `required`/`aria-required="true"`.

- [ ] **Step 4: Add Playwright a11y checks**

In `runtimes/standalone/tests/a11y.test.ts` (skipIf no Chromium):

```ts
await page.keyboard.press("Tab");
const focused = await page.evaluate(() => document.activeElement?.tagName);
expect(["A", "BUTTON", "INPUT", "SELECT", "DIV"]).toContain(focused);
const outline = await page.evaluate(() =>
  getComputedStyle(document.activeElement!).outlineStyle
);
expect(outline).not.toBe("none");
// row/block Enter opens the drawer; Escape closes it.
// every input has a non-empty accessible name.
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts`
Run: `pnpm exec vitest run runtimes/standalone/tests/a11y.test.ts`
Expected: PASS (Chromium-gated may skip).

---

### Task 7: a11y — contrast baseline

**Files:**
- Modify: `core/design-system/src/catalogs/*` profiles/tokens as needed (likely `b-mobile` profile)
- Modify: `core/renderer-html/src/index.ts` (usage if token alone insufficient)
- Test: `runtimes/standalone/tests/a11y.test.ts`

- [ ] **Step 1: Add failing contrast test**

```ts
function contrastRatio(fg: string, bg: string): number {
  // parse rgb(...) / rgba(...); compute relative luminance; return ratio
}

const pairs = [
  [".card-title", "var(--color-surface-default)", 4.5],
  [".row-subtitle", "var(--color-surface-default)", 4.5],
  [".form-label", "var(--color-surface-default)", 4.5],
  [".calendar-hour", "var(--color-surface-default)", 4.5],
  [".btn.primary", "var(--color-action-primary)", 3.0],
] as const;

for (const [selector, , min] of pairs) {
  const { color, background } = await page.locator(selector).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, background: cs.backgroundColor };
  });
  expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(min);
}
```

- [ ] **Step 2: Run test and confirm it fails**

Run: `pnpm exec vitest run runtimes/standalone/tests/a11y.test.ts -t "contrast"`
Expected: FAIL for at least one pair (or record actual ratios).

- [ ] **Step 3: Fix failing tokens/usages**

Adjust the minimum set of `text.tertiary`/`text.secondary`/status/placeholder/disabled tokens in the b-mobile profile, or the specific CSS usage. Do not restyle unrelated components. Re-run the contrast test until all pairs pass.

- [ ] **Step 4: Run full a11y test**

Run: `pnpm exec vitest run runtimes/standalone/tests/a11y.test.ts`
Expected: PASS (Chromium-gated may skip).

---

### Task 8: Visual debt P1/P2

**Files:**
- Modify: `core/renderer-html/src/index.ts`, `core/compiler/src/compile-page-spec.ts`
- Test: `runtimes/standalone/tests/v05-layout.test.ts`, `core/renderer-html/tests/renderer.test.ts`

- [ ] **Step 1: Add failing layout assertions**

```ts
const footer = await page.locator(".app-actions .btn.primary").first().boundingBox();
expect(footer?.height).toBe(44);
const cardX = await page.locator(".app-scroll > .card").first().evaluate(
  (el) => el.getBoundingClientRect().x
);
expect(cardX).toBeCloseTo(16, 0);
```

- [ ] **Step 2: Run test and confirm it fails**

Run: `pnpm exec vitest run runtimes/standalone/tests/v05-layout.test.ts -t "footer"`
Expected: FAIL.

- [ ] **Step 3: Implement P1**

- `.app-actions .btn` height 44px (mobile footer CTA), consistent across detail/list/form.
- MobileShell content gutter 16px: `.app-scroll > .card`, section content, list rows, footer align to 16px.
- `取消` danger already wired in Task 1/2; verify CSS `.btn.danger`.

- [ ] **Step 4: P2 (only if low risk)**

- Search placeholder → `搜索客户` (keep brief idle title).
- Detail status note under badge/above action row.
- Remove/rename `*详情摘要` compiler default title.
Add separate string tests for each P2 change; skip any that risks the signed brief.

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run runtimes/standalone/tests/v05-layout.test.ts`
Run: `pnpm exec vitest run core/renderer-html/tests/renderer.test.ts`
Expected: PASS.

---

### Task 9: Critic stop-rule gate

**Files:**
- Modify: `runtimes/standalone/src/visual/signoff.ts`, `runtimes/standalone/src/visual-sign-cli.ts`
- Test: `runtimes/standalone/tests/visual-cli.test.ts`

- [ ] **Step 1: Add failing pure validation test**

```ts
const findings = [
  { id: "VC-1", severity: "major", code: "VISUAL_CRITIC_MAJOR", message: "a" },
  { id: "VC-2", severity: "major", code: "VISUAL_CRITIC_MAJOR", message: "b" },
] as const;
const parsed = parseSignoffMarkdown(`<!-- signoff
${JSON.stringify({
  signer: "Reviewer",
  date: "2026-10-23",
  manifestHash: "sha256:m",
  findingsHash: "sha256:f",
  acceptedMajors: [
    { findingId: "VC-1", reason: "v0.6", owner: "design" },
    { findingId: "VC-2", reason: "copy polish", owner: "design" },
  ],
  waivers: [],
})}
-->`);
const result = validateVisualSignoff({
  parsed,
  findings: [...findings],
  manifestHash: "sha256:m",
  findingsHash: "sha256:f",
  now: new Date("2026-10-23"),
  maxMajor: 2,
});
expect(result.ok).toBe(true);
```

- [ ] **Step 2: Run test and confirm it fails**

Run: `pnpm exec vitest run runtimes/standalone/tests/visual-cli.test.ts -t "major gate"`
Expected: FAIL (missing maxMajor/validation).

- [ ] **Step 3: Implement**

- Add `maxMajor?: number` to `validateVisualSignoff`, default 2.
- Reject `majors.length > maxMajor` with `VISUAL_MAJOR_LIMIT`.
- Require an `acceptedMajors` entry for every major; reject missing with `VISUAL_MAJOR_UNACCEPTED`.
- Reject unknown/duplicate accepted IDs with `VISUAL_MAJOR_UNKNOWN`/`VISUAL_MAJOR_DUPLICATE`.
- `visual-sign-cli`: add optional `--max-major <n>` (default 2); pass through; include accepted majors in JSON summary.
- Existing v0.4.1 signoffs are not revalidated (no migration).

- [ ] **Step 4: Add negative tests**

- 3 majors → `VISUAL_MAJOR_LIMIT`.
- 2 majors but one missing reason → `VISUAL_MAJOR_UNACCEPTED`.
- acceptedMajors unknown ID → `VISUAL_MAJOR_UNKNOWN`.
- 0 majors + empty acceptedMajors → ok.

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run runtimes/standalone/tests/visual-cli.test.ts`
Expected: PASS.

---

### Task 10: Full gates, visual acceptance, docs

**Files:** no code changes; baseline/artifacts/docs.

- [ ] **Step 1: Mechanical gates**

```bash
cd pipeline
pnpm test
pnpm typecheck
pnpm test:dsh
pnpm phase1:verify --project samples/project.demo-orders-intake.yaml --runs /tmp/v05-8p
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/v05-emp
pnpm phase1:verify --project samples/projects/employee-app-appointments-03/project.yaml --runs /tmp/v05-03
pnpm phase1:verify --project samples/projects/employee-app-phase2/project.yaml --runs /tmp/v05-phase2
```

Expected: 652+ tests, typecheck clean, 4 dsh, `8/2/4/8` 0 blockers.

- [ ] **Step 2: Spec/render**

```bash
pnpm spec:engineer --project samples/projects/employee-app-phase2/project.yaml \
  --agent-run /tmp/m1-final2/run-2026-10-22T03-16-05-257Z \
  --runs /tmp/spec-v05 --strict-motion
pnpm render:html --run /tmp/spec-v05/<runId> --out /tmp/html-v05
```

Expected: 8 Page Specs / 0 blockers / 0 unresolved; 8 HTML + index.

- [ ] **Step 3: Visual baseline (human gate)**

```bash
pnpm visual:baseline --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v05/<runId> --html /tmp/html-v05 \
  --out baselines/employee-app-phase2
```

Review loading/empty/mode/footer/cancel screenshots; expect 24 cases; record changed `visualHash` cases.

- [ ] **Step 4: Real critic (one fresh run)**

```bash
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm visual:review \
  --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v05/<runId> --html /tmp/html-v05 \
  --baseline baselines/employee-app-phase2 --runtime dsh --profile prd-ui-visual \
  --runs /tmp/visual-v05 --max-cost-cny 3 --json
```

Expected: 0 blocker, ≤2 major; if >2, fix and rerun only after a code change; do not reroll for a better sample.

- [ ] **Step 5: Sign and sync**

Write `/tmp/signoff-v05.md` with `acceptedMajors` for any residual major, then:

```bash
pnpm visual:sign --run /tmp/visual-v05/<runId> --signoff-visual /tmp/signoff-v05.md --json
```

Copy screenshots/findings/signoff/diff/cache into `pipeline/artifacts/employee-app-phase2/visual-review/`; update its README, `CHANGELOG.md`, roadmap, handoff, `AGENTS.md`; local commit only if authorized; no push.

## Self-Review

- Spec coverage: §5.1 → Task 3; §5.2 → Task 2+4; §5.3 → Task 5; §5.4 → Task 6+7; §5.5 → Task 1+9; §5.6 → Task 2+8; gates → Task 10.
- No placeholder implementation steps: each task has exact files, interfaces, and test code; CSS/JS details are in the spec sections cited.
- Type consistency: `acceptedMajors`, `variant: "inline"`, `emphasis: "danger"`, `variant: "list"`, `maxMajor` are used consistently.
