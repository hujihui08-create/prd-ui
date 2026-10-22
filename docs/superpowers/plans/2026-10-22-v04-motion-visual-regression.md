# v0.4 Motion and Visual Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 8-page clean Phase 2 HTML motion-capable and visually regression-tested: stable semantic node ids, real CSS motion in HTML, a post-render Visual Review stage with screenshots/pixel diff/Visual Critic/signoff, customer picker, full-date prefill, and the agreed visual-fidelity fixes.

**Architecture:** Compiler assigns deterministic semantic node ids; Spec Engineer resolves M1 motion bindings (with legacy aliases and group targets); renderer consumes `PageSpec.motion` as CSS keyframes with reduced-motion fallback. A new runtime-neutral `core/visual-review` package builds a screenshot matrix, runs deterministic gates and pixel diff, and calls a new `visual-critic` agent role; the standalone runtime supplies a Playwright screenshot adapter and the `visual:review` / `visual:baseline` / `visual:sign` CLIs.

**Tech Stack:** TypeScript ESM, vitest, tsx, dsh `0.2.1-rc.2`, Playwright Chromium, pngjs + pixelmatch, pnpm workspace.

## Global Constraints

- ESM everywhere; relative TS imports use `.js`.
- `core/` must not import `@deepseek-ai/*` or runtime adapters.
- Local commits only; no push. Never commit `.env`, keys, `node_modules`, or `/tmp` artifacts.
- Baseline: 529 tests, typecheck clean, `test:dsh` 2 passed, Phase 1 `8/2/4/8` all 0 blockers.
- Real dsh commands: `set -a; . ./.env; set +a`, `DSH_HOME="$PWD/dsh/home"`, `--max-cost-cny 3`.
- The signed clean brief `samples/projects/employee-app-phase2/ui-brief.json` must not be manually edited. Picker/date defaults must be deterministic when the brief omits the new optional fields.
- Visual hard gates are deterministic only; Visual Critic findings are advisory and blockers require human waiver.
- `visual:review` never updates a baseline; only `visual:baseline` writes baselines, and only humans commit them.
- Motion is CSS-only (transform/opacity), never changes layout, and honors `prefers-reduced-motion`.
- Component promotion rule: only add a catalog component/prop when it is reused by two or more archetypes/pages and has a stable semantic contract. Page-specific composition stays in the compiler; page-specific behavior stays in the renderer. Do not add one-off props such as `resultOnly`.

## File Structure

```text
core/design-system/src/semantic-ids.ts            semantic id registry + slug maps
core/contracts/src/page-spec.ts                   SpecNode.motionGroup + picker/date fields
core/contracts/src/ui-brief.ts                    picker/date brief fields
core/compiler/src/compile-page-spec.ts            node id assignment, picker/date, fidelity
core/spec-engineer/src/motion-aliases.ts          legacy M1 id aliases
core/spec-engineer/src/apply.ts                   motion target resolution
core/spec-engineer/src/gates.ts                   group ids + strict unresolved gate
core/agents/src/contracts.ts                      visual-critic role
core/agents/src/roles/visual-critic.ts            Visual Critic prompt/schema
core/visual-review/                               matrix, gates, run, contracts
core/renderer-html/src/motion.ts                  motion CSS + attrs
core/renderer-html/src/index.ts                   motion/picker/date/fidelity rendering
runtimes/standalone/src/visual/screenshot.ts      Playwright capture + static server
runtimes/standalone/src/visual/diff.ts            PNG diff
runtimes/standalone/src/visual-review-cli.ts
runtimes/standalone/src/visual-baseline-cli.ts
runtimes/standalone/src/visual-sign-cli.ts
dsh/home/profiles/prd-ui-visual/                  vision + file-read profile
pipeline/baselines/employee-app-phase2/           committed baseline PNG + manifest
pipeline/artifacts/employee-app-phase2/visual-review/  evidence
```

---

### Task 1: Semantic node ids in contracts and compiler

**Files:**
- Create: `pipeline/core/design-system/src/semantic-ids.ts`
- Modify: `pipeline/core/design-system/src/index.ts`
- Modify: `pipeline/core/contracts/src/page-spec.ts`
- Modify: `pipeline/core/compiler/src/compile-page-spec.ts`
- Test: `pipeline/core/design-system/tests/semantic-ids.test.ts`
- Test: `pipeline/core/compiler/tests/compiler.test.ts`

**Interfaces:**
- Produces: `semanticNodeId(pageId, kind, key)`, `ACTION_KEYS`, `QUICK_KEYS`, `CARD_KEYS`, `kebab`.
- Produces: `SpecNode.motionGroup?: string`.
- Produces: every compiled `SpecNode.id` deterministic and unique; repeated rows carry `motionGroup`.

- [ ] **Step 1: Write the failing semantic-id tests**

```ts
// pipeline/core/design-system/tests/semantic-ids.test.ts
import { describe, expect, it } from "vitest";
import { ACTION_KEYS, QUICK_KEYS, semanticNodeId } from "../src/index.js";

describe("semantic ids", () => {
  it("builds stable ids and maps known labels", () => {
    expect(semanticNodeId("appointment-detail", "action", "checkin")).toBe(
      "appointment-detail.action.checkin"
    );
    expect(ACTION_KEYS["已到店确认"]).toBe("checkin");
    expect(ACTION_KEYS["接单并确认到店"]).toBe("checkin");
    expect(QUICK_KEYS["新增预约"]).toBe("new-appointment");
  });
});
```

```ts
// add to pipeline/core/compiler/tests/compiler.test.ts
it("assigns deterministic semantic node ids and row groups", () => {
  const phase2 = UiBriefSchema.parse(
    JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
  );
  const compiled = compileProject(phase2, deps);
  const detail = compiled.find((spec) => spec.meta.pageId === "appointment-detail")!;
  const list = compiled.find((spec) => spec.meta.pageId === "appointment-list")!;
  const ids = (spec: PageSpec) => collectNodes(spec.layout).flatMap((node) => (node.id ? [node.id] : []));
  expect(ids(detail)).toContain("appointment-detail.page.root");
  expect(ids(detail)).toContain("appointment-detail.action.checkin");
  expect(ids(list)).toContain("appointment-list.action.toggle-view");
  const rows = collectNodes(list.layout).filter((node) => node.type === "ListRow");
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.motionGroup).toBe("appointment-list.row.appointment");
    expect(row.id).toMatch(/^appointment-list\.row\.appointment\.\d+$/);
  }
  expect(ids(list)).toEqual(ids(compileProject(phase2, deps).find((s) => s.meta.pageId === "appointment-list")!));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd pipeline && pnpm exec vitest run core/design-system/tests/semantic-ids.test.ts core/compiler/tests/compiler.test.ts`
Expected: FAIL because `semantic-ids` and node ids do not exist.

- [ ] **Step 3: Add the registry**

```ts
// pipeline/core/design-system/src/semantic-ids.ts
export type SemanticKind =
  | "page" | "action" | "field" | "row" | "card" | "quick" | "view" | "calendar" | "state";

export function semanticNodeId(pageId: string, kind: SemanticKind, key: string): string {
  return `${pageId}.${kind}.${key}`;
}

export function kebab(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const ACTION_KEYS: Record<string, string> = {
  已到店确认: "checkin",
  接单并确认到店: "checkin",
  开单: "open-order",
  改期: "reschedule",
  取消: "cancel",
  术后告知: "notice",
  查看告知: "view-notice",
  客户详情: "customer",
  查看预约: "view-appointment",
  回访登记: "callback",
  新增预约: "new-appointment",
  保存: "save",
  保存改期: "save-reschedule",
  选择客户: "pick-customer",
  确认已当面告知: "confirm",
  查看完整详情: "view-detail",
  查看详情: "view-detail",
  切换日历/列表: "toggle-view",
  清空关键词: "clear",
  搜索: "search",
  保存回访: "save",
};

export const QUICK_KEYS: Record<string, string> = {
  开单: "create-order",
  预约: "new-appointment",
  客户搜索: "customer-search",
};

export const CARD_KEYS: Record<string, string> = {
  我的预约: "appointments",
  待回访: "callbacks",
  快捷操作: "quick-actions",
  预约详情摘要: "summary",
  预约摘要: "summary",
  术后告知摘要: "summary",
};
```

Export these from `core/design-system/src/index.ts`.

- [ ] **Step 4: Add `motionGroup` to the Page Spec contract**

In `core/contracts/src/page-spec.ts` add `motionGroup?: string;` to `SpecNode` and the same optional field to `SpecNodeSchema` (after `id`).

- [ ] **Step 5: Assign ids in the compiler**

Add to `compile-page-spec.ts`:

```ts
import {
  ACTION_KEYS,
  CARD_KEYS,
  QUICK_KEYS,
  semanticNodeId,
} from "@prd-ui/design-system";

function rowGroupFor(pageId: string, parentTitle: string | undefined): string {
  if (pageId === "today") return parentTitle === "待回访" ? "callback" : "appointment";
  if (pageId === "customer-search") return "result";
  if (pageId === "appointment-list") return "appointment";
  return "row";
}

function assignNodeIds(page: UiBriefPage, layout: SpecNode): void {
  const used = new Set<string>();
  const groupCounts = new Map<string, number>();
  const unique = (id: string): string => {
    let candidate = id;
    let index = 2;
    while (used.has(candidate)) candidate = `${id}.${index++}`;
    used.add(candidate);
    return candidate;
  };
  const walk = (node: SpecNode, path: string, parentTitle?: string): void => {
    let id: string | undefined;
    if (path === "root") {
      id = semanticNodeId(page.id, "page", "root");
    } else if (node.type === "Button") {
      const key = ACTION_KEYS[String(node.props?.action ?? "")];
      if (key !== undefined) id = semanticNodeId(page.id, "action", key);
    } else if (node.type === "FormField") {
      const field = String(node.props?.field ?? "");
      if (field !== "") id = semanticNodeId(page.id, "field", field.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase());
    } else if (node.type === "QuickAction") {
      const key = QUICK_KEYS[String(node.props?.label ?? "")];
      if (key !== undefined) id = semanticNodeId(page.id, "quick", key);
    } else if (node.type === "Card") {
      const key = CARD_KEYS[String(node.props?.title ?? "")];
      if (key !== undefined) id = semanticNodeId(page.id, "card", key);
    } else if (node.type === "CalendarGrid") {
      id = semanticNodeId(page.id, "calendar", "grid");
    } else if (node.type === "Section" && node.props?.viewPanel !== undefined) {
      id = semanticNodeId(page.id, "view", String(node.props.viewPanel));
    } else if (node.type === "EmptyState") {
      id = semanticNodeId(page.id, "state", String(node.props?.emptyKind ?? "empty"));
    } else if (node.type === "ListRow") {
      const group = (node.motionGroup ??= semanticNodeId(page.id, "row", rowGroupFor(page.id, parentTitle)));
      const index = groupCounts.get(group) ?? 0;
      groupCounts.set(group, index + 1);
      node.id = unique(`${group}.${index}`);
    }
    if (node.id === undefined && id !== undefined) node.id = unique(id);
    if (node.id === undefined) node.id = unique(`${page.id}.${path.replace(/\//g, ".")}`);
    for (const [slotName, children] of Object.entries(node.slots ?? {})) {
      children.forEach((child, index) => walk(child, `${path}/${slotName}/${index}`, String(node.props?.title ?? parentTitle ?? "")));
    }
    (node.children ?? []).forEach((child, index) => walk(child, `${path}/children/${index}`, parentTitle));
  };
  walk(layout, "root");
}
```

Call `assignNodeIds(page, layout)` immediately after `const layout = buildLayout(...)`.

- [ ] **Step 6: Run tests**

Run: `cd pipeline && pnpm exec vitest run core/design-system/tests/semantic-ids.test.ts core/compiler/tests/compiler.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add core/design-system/src/semantic-ids.ts core/design-system/src/index.ts core/design-system/tests/semantic-ids.test.ts core/contracts/src/page-spec.ts core/compiler/src/compile-page-spec.ts core/compiler/tests/compiler.test.ts
git commit -m "feat(compiler): assign deterministic semantic node ids"
```

---

### Task 2: Resolve motion bindings and strict unresolved gate

**Files:**
- Create: `pipeline/core/spec-engineer/src/motion-aliases.ts`
- Modify: `pipeline/core/spec-engineer/src/apply.ts`
- Modify: `pipeline/core/spec-engineer/src/gates.ts`
- Modify: `pipeline/core/spec-engineer/src/contracts.ts`
- Modify: `pipeline/core/spec-engineer/src/run-spec-engineer.ts`
- Modify: `pipeline/runtimes/standalone/src/spec-cli.ts`
- Test: `pipeline/core/spec-engineer/tests/apply.test.ts`
- Test: `pipeline/core/spec-engineer/tests/gates.test.ts`
- Test: `pipeline/runtimes/standalone/tests/spec-cli.test.ts`

**Interfaces:**
- Consumes: `SpecNode.id`, `SpecNode.motionGroup` from Task 1.
- Produces: `LEGACY_MOTION_ALIASES: Record<string,string>`.
- Produces: `resolveMotionTarget(spec, nodeId): { id: string; group: boolean } | undefined`.
- Produces: `RunSpecEngineerInput.strictMotionPages?: string[]`; CLI `--strict-motion`.

- [ ] **Step 1: Write failing resolution tests**

```ts
// pipeline/core/spec-engineer/tests/apply.test.ts
import { resolveMotionTarget } from "../src/motion-aliases.js";

it("resolves exact ids, groups, and legacy aliases", () => {
  const spec = {
    meta: { pageId: "appointment-detail" },
    layout: {
      type: "MobileShell",
      id: "appointment-detail.page.root",
      slots: {
        actions: [
          { type: "Button", id: "appointment-detail.action.checkin" },
          { type: "ListRow", id: "appointment-list.row.appointment.0", motionGroup: "appointment-list.row.appointment" },
        ],
      },
    },
  } as unknown as PageSpec;
  expect(resolveMotionTarget(spec, "appointment-detail.action.checkin")).toEqual({
    id: "appointment-detail.action.checkin",
    group: false,
  });
  expect(resolveMotionTarget(spec, "appointment-list.row.appointment")).toEqual({
    id: "appointment-list.row.appointment",
    group: true,
  });
  expect(resolveMotionTarget(spec, "ad.footer-checkin")).toEqual({
    id: "appointment-detail.action.checkin",
    group: false,
  });
  expect(resolveMotionTarget(spec, "ad.unknown")).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd pipeline && pnpm exec vitest run core/spec-engineer/tests/apply.test.ts`
Expected: FAIL because the module/function does not exist.

- [ ] **Step 3: Add aliases and resolver**

```ts
// pipeline/core/spec-engineer/src/motion-aliases.ts
import type { PageSpec, SpecNode } from "@prd-ui/contracts";

export const LEGACY_MOTION_ALIASES: Record<string, string> = {
  "today.quick-new-appointment": "today.quick.new-appointment",
  "today.appointment-row": "today.row.appointment",
  "today.callback-row": "today.row.callback",
  "today.appointments-view-all": "today.card.appointments",
  "today.error-retry": "today.page.root",
  "cs.result-row": "customer-search.row.result",
  "cs.clear-keyword": "customer-search.action.clear",
  "cs.error-retry": "customer-search.page.root",
  "cs.back": "customer-search.page.root",
  "cd.view-appointment": "customer-detail.action.view-appointment",
  "cd.new-appointment": "customer-detail.action.new-appointment",
  "cd.callback-register": "customer-detail.action.callback",
  "cd.error-retry": "customer-detail.page.root",
  "ad.footer-checkin": "appointment-detail.action.checkin",
  "ad.footer-order": "appointment-detail.action.open-order",
  "ad.footer-reschedule": "appointment-detail.action.reschedule",
  "ad.footer-cancel": "appointment-detail.action.cancel",
  "ad.customer-link": "appointment-detail.action.customer",
  "ad.error-retry": "appointment-detail.page.root",
  "af.customer-field": "appointment-form.field.customer",
  "af.pick-customer": "appointment-form.action.pick-customer",
  "af.save": "appointment-form.action.save",
  "af.save-reschedule": "appointment-form.action.save",
  "tn.confirm": "treatment-notice.action.confirm",
  "tn.error-retry": "treatment-notice.page.root",
  "tn.back": "treatment-notice.page.root",
  "al.view-toggle": "appointment-list.action.toggle-view",
  "al.new-appointment": "appointment-list.action.new-appointment",
  "al.calendar-block": "appointment-list.row.appointment",
  "al.list-row": "appointment-list.row.appointment",
  "al.error-retry": "appointment-list.page.root",
  "cr.pick-customer": "callback-register.action.pick-customer",
  "cr.save": "callback-register.action.save",
  "cr.error-retry": "callback-register.page.root",
};

export function resolveMotionTarget(
  spec: PageSpec,
  nodeId: string
): { id: string; group: boolean } | undefined {
  const target = LEGACY_MOTION_ALIASES[nodeId] ?? nodeId;
  const ids = new Set<string>();
  const groups = new Set<string>();
  const walk = (node: SpecNode): void => {
    if (node.id !== undefined) ids.add(node.id);
    if (node.motionGroup !== undefined) groups.add(node.motionGroup);
    for (const children of Object.values(node.slots ?? {})) children.forEach(walk);
    (node.children ?? []).forEach(walk);
  };
  walk(spec.layout);
  if (ids.has(target)) return { id: target, group: false };
  if (groups.has(target)) return { id: target, group: true };
  return undefined;
}
```

- [ ] **Step 4: Use the resolver in `buildMotion`**

Change `buildMotion(bindings, motionSpec)` to `buildMotion(spec, bindings, motionSpec)` and map each binding:

```ts
bindings.map((binding) => {
  if (binding.nodeId === undefined) return { preset: binding.preset };
  const target = resolveMotionTarget(spec, binding.nodeId);
  return target === undefined
    ? { nodeId: binding.nodeId, preset: binding.preset }
    : { nodeId: target.id, preset: binding.preset };
})
```

Pass the current `spec` at the call site.

- [ ] **Step 5: Add strict unresolved gate**

In `gates.ts`, collect `motionGroups` alongside node ids. For each binding, resolve alias/group and if neither exists:

```ts
const strict = input.strictMotionPages?.includes(binding.pageId) === true;
issues.push(
  issue(
    "SPEC_MOTION_NODE_UNRESOLVED",
    strict ? "blocker" : "warning",
    `motion binding node ${binding.nodeId} is not present in the layout`,
    `${binding.pageId}#${binding.nodeId}`
  )
);
```

Add `strictMotionPages?: string[]` to `MotionGateInput`/`RunSpecEngineerInput` and thread it through.

- [ ] **Step 6: Add the CLI flag**

In `spec-cli.ts`, accept `--strict-motion`; when present, pass `strictMotionPages: brief.ia.pages.map((page) => page.id)`.

- [ ] **Step 7: Write and run the strict gate test**

```ts
it("blocks unresolved motion ids for strict pages", () => {
  const gate = runMotionGate({
    specs: [specWithoutTargetNode],
    motionSpec: motionWithUnknownNode,
    tokens: motionTokens,
    strictMotionPages: ["appointment-detail"],
  });
  expect(gate.issues.map((entry) => entry.code)).toContain("SPEC_MOTION_NODE_UNRESOLVED");
  expect(gate.issues.find((entry) => entry.code === "SPEC_MOTION_NODE_UNRESOLVED")?.severity).toBe("blocker");
});
```

Run: `cd pipeline && pnpm exec vitest run core/spec-engineer/tests/apply.test.ts core/spec-engineer/tests/gates.test.ts runtimes/standalone/tests/spec-cli.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add core/spec-engineer/src/motion-aliases.ts core/spec-engineer/src/apply.ts core/spec-engineer/src/gates.ts core/spec-engineer/src/contracts.ts core/spec-engineer/src/run-spec-engineer.ts core/spec-engineer/tests/apply.test.ts core/spec-engineer/tests/gates.test.ts runtimes/standalone/src/spec-cli.ts runtimes/standalone/tests/spec-cli.test.ts
git commit -m "feat(spec-engineer): resolve motion bindings to semantic node ids"
```

---

### Task 3: Render motion in HTML

**Files:**
- Create: `pipeline/core/renderer-html/src/motion.ts`
- Modify: `pipeline/core/renderer-html/src/index.ts`
- Test: `pipeline/core/renderer-html/tests/renderer.test.ts`

**Interfaces:**
- Consumes: `SpecNode.id`, `SpecNode.motionGroup`, `PageSpec.motion`.
- Produces: `createMotionContext(spec)`, `motionAttrs(node, ctx)`, `renderMotionCss()`.

- [ ] **Step 1: Write the failing renderer test**

```ts
it("renders node and group motion attributes plus reduced-motion fallback", () => {
  const html = renderDocument(
    appointmentById.get("appointment-list")!,
    getProfile("b-mobile"),
    { pageRoutes: appointmentRoutes }
  );
  expect(html).toContain('data-node-id="appointment-list.action.toggle-view"');
  expect(html).toContain('data-motion-preset="press-feedback"');
  expect(html).toMatch(/data-motion-group="appointment-list\.row\.appointment"/);
  expect(html).toContain("@keyframes motion-enter-fade");
  expect(html).toContain("prefers-reduced-motion");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd pipeline && pnpm exec vitest run core/renderer-html/tests/renderer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `motion.ts`**

```ts
import type { PageSpec, SpecNode } from "@prd-ui/contracts";

export interface MotionContext {
  pagePreset?: { preset: string; durationMs: number; easing: string };
  byNode: Map<string, { preset: string; durationMs: number; easing: string; staggerMs?: number }>;
  byGroup: Map<string, { preset: string; durationMs: number; easing: string; staggerMs?: number }>;
  groupCounts: Map<string, number>;
}

export function createMotionContext(spec: PageSpec): MotionContext {
  const ctx: MotionContext = { byNode: new Map(), byGroup: new Map(), groupCounts: new Map() };
  const motion = spec.motion;
  if (motion === undefined) return ctx;
  const ids = new Set<string>();
  const groups = new Set<string>();
  const walk = (node: SpecNode): void => {
    if (node.id !== undefined) ids.add(node.id);
    if (node.motionGroup !== undefined) groups.add(node.motionGroup);
    for (const children of Object.values(node.slots ?? {})) children.forEach(walk);
    (node.children ?? []).forEach(walk);
  };
  walk(spec.layout);
  for (const binding of motion.bindings) {
    const preset = motion.presets[binding.preset];
    if (preset === undefined) continue;
    const entry = {
      preset: binding.preset,
      durationMs: preset.durationMs,
      easing: preset.easing,
      ...(preset.staggerMs === undefined ? {} : { staggerMs: preset.staggerMs }),
    };
    if (binding.nodeId === undefined) ctx.pagePreset = entry;
    else if (ids.has(binding.nodeId)) ctx.byNode.set(binding.nodeId, entry);
    else if (groups.has(binding.nodeId)) ctx.byGroup.set(binding.nodeId, entry);
  }
  return ctx;
}

export function motionAttrs(
  node: SpecNode,
  ctx: MotionContext | undefined,
  root = false
): { attrs: string; style: string } {
  if (ctx === undefined) return { attrs: "", style: "" };
  const attrs: string[] = [];
  let style = "";
  if (node.id !== undefined) attrs.push(`data-node-id="${node.id}"`);
  if (node.motionGroup !== undefined) attrs.push(`data-motion-group="${node.motionGroup}"`);
  const entry = root
    ? ctx.pagePreset
    : (node.id === undefined ? undefined : ctx.byNode.get(node.id)) ??
      (node.motionGroup === undefined ? undefined : ctx.byGroup.get(node.motionGroup));
  if (entry !== undefined) {
    attrs.push(`data-motion-preset="${entry.preset}"`);
    style = `--motion-duration:${entry.durationMs}ms;--motion-ease:${entry.easing}`;
    if (entry.staggerMs !== undefined) style += `;--motion-stagger:${entry.staggerMs}ms`;
    if (node.motionGroup !== undefined) {
      const index = ctx.groupCounts.get(node.motionGroup) ?? 0;
      ctx.groupCounts.set(node.motionGroup, index + 1);
      attrs.push(`data-motion-index="${index}"`);
    }
  }
  return { attrs: attrs.length === 0 ? "" : ` ${attrs.join(" ")}`, style };
}

export function renderMotionCss(): string {
  return `
@keyframes motion-enter-fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes motion-page-push{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
@keyframes motion-sheet-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes motion-state-swap{from{opacity:0}to{opacity:1}}
@keyframes motion-confirm-collapse{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.98)}}
@keyframes motion-toast-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
[data-motion-preset]{animation-duration:var(--motion-duration,200ms);animation-timing-function:var(--motion-ease,ease-out);animation-fill-mode:both;}
[data-motion-preset="enter-fade"]{animation-name:motion-enter-fade}
[data-motion-preset="page-push"]{animation-name:motion-page-push}
[data-motion-preset="sheet-up"]{animation-name:motion-sheet-up}
[data-motion-preset="state-swap"]{animation-name:motion-state-swap}
[data-motion-preset="toast-in"]{animation-name:motion-toast-in}
[data-motion-preset="confirm-collapse"]{animation-name:motion-confirm-collapse}
[data-motion-preset="list-stagger"]{animation-name:motion-enter-fade;animation-delay:calc(var(--motion-stagger,40ms) * var(--motion-index,0))}
[data-motion-preset="press-feedback"]:active{transform:scale(.98)}
@media (prefers-reduced-motion: reduce){
  [data-motion-preset]{animation:none!important;transition:none!important}
  [data-motion-fallback="fade"] [data-motion-preset]{animation-name:motion-state-swap!important;animation-duration:120ms!important}
}
`;
}
```

- [ ] **Step 4: Wire motion into `renderNode`/`renderDocument`**

- `renderDocument` sets a module global `renderMotionContext = createMotionContext(spec)` before `renderNode`.
- Add `motionAttrs(node, renderMotionContext)` to the root `PageShell`/`MobileShell` tags and to `Button`, `QuickAction`, `FormField`, `ListRow`, `Card`, `Section`, `CalendarGrid` tags.
- For root calls use `motionAttrs(node, renderMotionContext, true)`.
- `motionAttrs` returns `{ attrs, style }`; append `style` to any existing inline style (especially `Section`'s padding/gap) instead of emitting a second `style` attribute.
- Add `renderMotionCss()` to the `<style>` block.
- Add to the state script:

```js
document.documentElement.dataset.motionFallback = ${JSON.stringify(spec.motion?.reducedMotion.fallback ?? "none")};
```

- [ ] **Step 5: Run renderer tests**

Run: `cd pipeline && pnpm exec vitest run core/renderer-html/tests/renderer.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/renderer-html/src/motion.ts core/renderer-html/src/index.ts core/renderer-html/tests/renderer.test.ts
git commit -m "feat(renderer): apply page motion presets and reduced-motion fallback"
```

---

### Task 4: Picker and full-date contracts, defaults, and brief gate

**Files:**
- Modify: `pipeline/core/contracts/src/ui-brief.ts`
- Modify: `pipeline/core/contracts/src/page-spec.ts`
- Modify: `pipeline/core/agents/src/roles/ui-briefer.ts`
- Modify: `pipeline/core/compiler/src/compile-page-spec.ts`
- Modify: `pipeline/core/intake/src/gates.ts`
- Test: `pipeline/core/contracts/tests/contracts.test.ts`
- Test: `pipeline/core/intake/tests/briefer-prompt.test.ts`
- Test: `pipeline/core/intake/tests/gates.test.ts`
- Test: `pipeline/core/compiler/tests/compiler.test.ts`

**Interfaces:**
- Produces: `UiBriefPage.pickerReturnTo?`, `customerPicker?`, `calendarWeekStart?`; mirrored on `PageSpec`.
- Produces gate codes: `BRIEF_PICKER_RETURN_UNKNOWN`, `BRIEF_PICKER_RETURN_UNSUPPORTED`, `BRIEF_CUSTOMER_PICKER_UNKNOWN`, `BRIEF_CUSTOMER_PICKER_UNSUPPORTED`, `BRIEF_CALENDAR_DATE_INVALID`, `BRIEF_CALENDAR_FIELDS_MISSING`.
- Produces compiler defaults from the signed brief without editing it.

- [ ] **Step 1: Write failing contract + compiler tests**

```ts
it("parses picker and calendar metadata on a brief page", () => {
  const page = {
    ...minimalBrief.ia.pages[0]!,
    pickerReturnTo: "orders-list",
    customerPicker: "customer-search",
    calendarWeekStart: "2026-11-02",
  };
  const parsed = UiBriefSchema.parse({
    ...minimalBrief,
    ia: { ...minimalBrief.ia, pages: [page] },
  });
  expect(parsed.ia.pages[0]?.pickerReturnTo).toBe("orders-list");
  expect(parsed.ia.pages[0]?.calendarWeekStart).toBe("2026-11-02");
});
```

```ts
it("defaults picker and calendar metadata for the signed phase2 brief", () => {
  const phase2 = UiBriefSchema.parse(
    JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
  );
  const specs = compileProject(phase2, deps);
  const form = specs.find((spec) => spec.meta.pageId === "appointment-form")!;
  const search = specs.find((spec) => spec.meta.pageId === "customer-search")!;
  const list = specs.find((spec) => spec.meta.pageId === "appointment-list")!;
  expect(form.customerPicker).toBe("customer-search");
  expect(search.pickerReturnTo).toBe("appointment-form");
  expect(list.calendarWeekStart).toBe("2026-11-02");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd pipeline && pnpm exec vitest run core/contracts/tests/contracts.test.ts core/compiler/tests/compiler.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add contract fields and schemas**

Add to `UiBriefPage`/`UiBriefPageSchema` and `PageSpec`/`PageSpecSchema`:

```ts
pickerReturnTo?: PageId;
customerPicker?: PageId;
calendarWeekStart?: string;
```

Use `PageIdSchema` for ids and a string regex `/^\d{4}-\d{2}-\d{2}$/` for the date.

- [ ] **Step 4: Add compiler defaults**

In `compilePageSpec`:

```ts
const customerSearch = brief.ia.pages.find((entry) => entry.id === "customer-search");
const firstForm = brief.ia.pages.find((entry) => entry.archetype === "mobile-form");
const pickerReturnTo =
  page.pickerReturnTo ?? (page.id === customerSearch?.id ? firstForm?.id : undefined);
const customerPicker =
  page.customerPicker ?? (page.archetype === "mobile-form" ? customerSearch?.id : undefined);

function mondayOf(date: string): string {
  const base = new Date(`${date}T00:00:00`);
  const offset = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - offset);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}
const firstRowDate = page.mockData?.rows?.[0]?.date?.match(/^(\d{2})-(\d{2})/);
const rowYear = brief.meta.date.slice(0, 4);
const rowDate = firstRowDate === undefined || firstRowDate === null
  ? undefined
  : `${rowYear}-${firstRowDate[1]}-${firstRowDate[2]}`;
const calendarWeekStart =
  page.calendarWeekStart ??
  (page.archetype === "mobile-list" &&
  ((page.fields ?? []).includes("date") || (page.fields ?? []).includes("time"))
    ? mondayOf(rowDate ?? brief.meta.date)
    : undefined);
```

Add the values to the returned Page Spec with conditional spreads.

- [ ] **Step 5: Add brief gate checks**

Inside the page loop:

```ts
if (page.pickerReturnTo !== undefined && !pageIdSet.has(page.pickerReturnTo)) {
  issues.push(issue("BRIEF_PICKER_RETURN_UNKNOWN", "blocker", `pickerReturnTo ${page.pickerReturnTo} is not a page`, page.id));
}
if (page.customerPicker !== undefined) {
  const target = brief.ia.pages.find((entry) => entry.id === page.customerPicker);
  if (target?.archetype !== "mobile-list") {
    issues.push(issue("BRIEF_CUSTOMER_PICKER_UNKNOWN", "blocker", `customerPicker ${page.customerPicker} is not a mobile-list search page`, page.id));
  }
}
if (page.calendarWeekStart !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(page.calendarWeekStart)) {
  issues.push(issue("BRIEF_CALENDAR_DATE_INVALID", "blocker", `calendarWeekStart ${page.calendarWeekStart} is not ISO`, page.id));
}
```

- [ ] **Step 6: Add the Briefer prompt rules and test**

Add to `ui-briefer.ts` mapping rules:

```ts
"- For mobile form pages with customer selection, emit customerPicker pointing to the customer-search page id.",
"- For customer-search pages opened from a form, emit pickerReturnTo pointing to the form page id.",
"- For mobile-list pages with date/time fields, emit calendarWeekStart as an ISO date for the Monday of the example week.",
```

Add to `briefer-prompt.test.ts`:

```ts
it("requires picker and calendar metadata", () => {
  expect(prompt).toContain("customerPicker");
  expect(prompt).toContain("pickerReturnTo");
  expect(prompt).toContain("calendarWeekStart");
});
```

- [ ] **Step 7: Run tests and commit**

Run: `cd pipeline && pnpm exec vitest run core/contracts/tests/contracts.test.ts core/intake/tests/briefer-prompt.test.ts core/intake/tests/gates.test.ts core/compiler/tests/compiler.test.ts`
Expected: PASS.

```bash
git add core/contracts/src/ui-brief.ts core/contracts/src/page-spec.ts core/agents/src/roles/ui-briefer.ts core/compiler/src/compile-page-spec.ts core/intake/src/gates.ts core/contracts/tests/contracts.test.ts core/intake/tests/briefer-prompt.test.ts core/intake/tests/gates.test.ts core/compiler/tests/compiler.test.ts
git commit -m "feat(contracts): add picker and calendar metadata"
```

---

### Task 5: Renderer picker, full date, and visual-fidelity fixes

**Files:**
- Modify: `pipeline/core/renderer-html/src/index.ts`
- Modify: `pipeline/core/compiler/src/compile-page-spec.ts`
- Modify: `pipeline/core/design-system/src/catalogs/b-mobile.ts`
- Modify: `pipeline/core/design-system/src/catalogs/b-dense.ts`
- Test: `pipeline/core/renderer-html/tests/renderer.test.ts`
- Test: `pipeline/core/compiler/tests/compiler.test.ts`

**Interfaces:**
- Consumes: `PageSpec.pickerReturnTo`, `customerPicker`, `calendarWeekStart`.
- Produces: `data-picker-search`, `data-picker-return`, full ISO `data-slot-date`, `datetime-local` inputs, deduplicated detail/notice, tabs, search result actions, calendar legend.

- [ ] **Step 1: Write failing renderer/compiler tests**

```ts
it("renders picker hooks, full dates, and fidelity fixes", () => {
  const form = renderDocument(appointmentById.get("appointment-form")!, getProfile("b-mobile"));
  expect(form).toContain('data-picker-search="customer-search"');
  expect(form).toContain('type="datetime-local"');
  const list = renderDocument(appointmentById.get("appointment-list")!, getProfile("b-mobile"));
  expect(list).toContain('data-slot-date="2026-11-02"');
  expect(list).not.toContain("日期 时间段 客户");
  const detail = renderDocument(appointmentById.get("appointment-detail")!, getProfile("b-mobile"));
  expect(detail.match(/data-field="customer"/g)?.length ?? 0).toBe(0);
  expect(detail.match(/已登记<\/span>/g)?.length ?? 0).toBe(1);
  expect(detail).not.toContain('form-readonly">已登记');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd pipeline && pnpm exec vitest run core/renderer-html/tests/renderer.test.ts core/compiler/tests/compiler.test.ts`
Expected: FAIL.

- [ ] **Step 3: Compiler fidelity changes**

- Remove the mobile-list field-label `Row` block entirely.
- `calendarDays`: use `calendarWeekStart`; each day `date` is full `YYYY-MM-DD`; `label` is `周一`…; `today` compares to `brief.meta.date`.
- Add a `Row` of `Badge` nodes after the calendar title for status legend (`已登记/已到店/爽约/已取消`); this is composition, not a new component.
- `calendarBlocks.day`: parse `周([一二三四五六日])` from `row.date` and map to 0–6; fall back to the current index when absent.
- `detailLayout`: remove duplicate `visibleFields` FormField nodes from the `fields` slot; keep the secondary-actions `Row`. The summary List is the single read-only representation of those fields. If Phase 1 semantic validation requires a field node, keep one representation per field (summary List or FormField), never both. For web detail, keep a `Section` with only the secondary-actions Row.
- Summary card: add `props.badge` and `props.badgeTone` instead of a Badge child; remove the Badge node.
- Home tabs: `const tabs = [...new Set([page.id, ...(brief.ia.navigation.tabs ?? brief.ia.navigation.primary)])]`; `activeTab = page.id`; set `showTabs: tabs.length > 1` so a single tab cannot render an empty TabBar.
- Form: for `startTime`/`endTime`, emit `Input` with `inputType: "datetime-local"`.
- Mobile-form customer field: emit `FormField` with a `Row` child containing the `Input` and a ghost `Button` labeled「选择」(action `选择客户`); remove `选择客户` from `otherActions` so it is not duplicated.
- Mobile-list search (page has `searchIdleTitle`): do not emit the bottom `actions` slot (the input filters live); keep `查看详情` in the secondary actions row so the renderer can hide it until results.
- Mobile-form: only emit the `另一模式` Row when `page.formModes === undefined`.

- [ ] **Step 4: Renderer changes**

- Add `data-picker-search` / `data-picker-return` to the `MobileShell` root from `spec.customerPicker` / `spec.pickerReturnTo`.
- Add `datetime-local` to the Input `inputType` handling (it already renders `type`).
- Add `props.badge` rendering in `Card`:

```html
<h2 class="card-title">${esc(title)}${badge ? `<span class="badge tone-${esc(badgeTone)}">${esc(badge)}</span>` : ""}</h2>
```

- Add `.card-title .badge{margin-left:8px}`.
- TabBar icons: add `today: "home"`.
- `MobileShell` bottom nav only when `items.length > 1`; if one tab, omit.
- Calendar CSS: `.calendar-scroll{overflow-x:auto}` and `.calendar-grid{min-width:720px}`.
- Search JS: after computing `visible`, hide `[data-action="查看详情"]` when `visible === 0`; this is page behavior, not a catalog prop.
- In `applyBusinessStates`, initialize `status` from `new URLSearchParams(location.search).get("status") ?? config.currentStatus ?? states[0]?.name` so screenshots can drive each business state.
- In `applyViews`, initialize the current view from `new URLSearchParams(location.search).get("view") ?? config.defaultView ?? config.views[0]` so screenshots can drive calendar/list.
- Picker JS:

```js
const pickerSearch = config.customerPicker;
const pickerReturn = config.pickerReturnTo;
const params = new URLSearchParams(location.search);
if (pickerSearch && document.body.dataset.pageKind === "form") {
  const button = document.querySelector('[data-action="选择客户"]');
  button?.addEventListener("click", () => {
    const draft = {};
    for (const input of qsa(".app-scroll input, .app-scroll select")) {
      draft[input.name || input.id] = input.value;
    }
    sessionStorage.setItem("prd-ui:picker:" + config.pageId, JSON.stringify(draft));
    location.href = pickerSearch + ".html?mode=picker&returnTo=" + config.pageId;
  });
}
if (params.get("mode") === "picker" && pickerReturn) {
  for (const row of qsa("[data-search-text]")) {
    row.addEventListener("click", () => {
      sessionStorage.setItem("prd-ui:picker:selected", row.dataset.searchText ?? "");
      location.href = pickerReturn + ".html";
    });
  }
}
const draftRaw = sessionStorage.getItem("prd-ui:picker:" + config.pageId);
if (draftRaw) {
  const draft = JSON.parse(draftRaw);
  for (const [name, value] of Object.entries(draft)) {
    const input = document.querySelector('[name="' + name + '"]');
    if (input) input.value = value;
  }
}
const selected = sessionStorage.getItem("prd-ui:picker:selected");
if (selected) {
  const customer = document.querySelector('[data-field="customer"] input');
  if (customer) customer.value = selected.split(" ")[0];
  sessionStorage.removeItem("prd-ui:picker:selected");
}
```

- Form prefill: parse `date`/`time`; set `startTime` to `${date}T${time}`, `endTime` to +60 minutes.

- [ ] **Step 5: Add `inputType`/badge catalog props**

Add `datetime-local` to the `Input` inputType enum in `b-mobile` and `b-dense`; add `badge`/`badgeTone` props to `Card` in both catalogs.

- [ ] **Step 6: Run tests and commit**

Run: `cd pipeline && pnpm exec vitest run core/renderer-html/tests/renderer.test.ts core/compiler/tests/compiler.test.ts core/validators/tests/validators.test.ts`
Expected: PASS.

```bash
git add core/renderer-html/src/index.ts core/compiler/src/compile-page-spec.ts core/design-system/src/catalogs/b-mobile.ts core/design-system/src/catalogs/b-dense.ts core/renderer-html/tests/renderer.test.ts core/compiler/tests/compiler.test.ts
git commit -m "feat(renderer): wire picker, full dates, and visual fidelity fixes"
```

---

### Task 6: Visual-review core matrix and deterministic gates

**Files:**
- Create: `pipeline/core/visual-review/package.json`
- Create: `pipeline/core/visual-review/tsconfig.json`
- Create: `pipeline/core/visual-review/src/contracts.ts`
- Create: `pipeline/core/visual-review/src/matrix.ts`
- Create: `pipeline/core/visual-review/src/gates.ts`
- Create: `pipeline/core/visual-review/src/run-visual-review.ts`
- Create: `pipeline/core/visual-review/src/index.ts`
- Test: `pipeline/core/visual-review/tests/matrix.test.ts`
- Test: `pipeline/core/visual-review/tests/gates.test.ts`

**Interfaces:**
- Produces: `VisualCase`, `VisualFinding`, `VisualGateInput`, `runVisualGate`, `buildVisualMatrix`.
- Produces: deterministic case ids and manifest expectations.

- [ ] **Step 1: Write failing matrix/gate tests**

```ts
it("builds page, state, business-state, form-mode, and view cases", () => {
  const cases = buildVisualMatrix([appointmentDetail, appointmentForm, appointmentList]);
  expect(cases.map((entry) => entry.id)).toEqual(
    expect.arrayContaining([
      "appointment-detail.default",
      "appointment-detail.business.已到店",
      "appointment-form.mode.reschedule",
      "appointment-list.view.calendar",
      "appointment-list.view.list",
    ])
  );
});
```

```ts
it("blocks missing screenshots, console errors, overflow, and diff", () => {
  const gate = runVisualGate({
    cases: [{ id: "a.default", pageId: "a", state: "default", viewport: { width: 390, height: 844 } }],
    screenshots: [],
    findings: [],
    diff: [],
  });
  expect(gate.issues.map((entry) => entry.code)).toContain("VISUAL_SCREENSHOT_MISSING");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd pipeline && pnpm exec vitest run core/visual-review/tests/matrix.test.ts core/visual-review/tests/gates.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement contracts/matrix**

```ts
// contracts.ts
export interface VisualCase {
  id: string;
  pageId: string;
  state: string;
  query?: Record<string, string>;
  actions?: Array<
    | { kind: "search"; value: string }
    | { kind: "toggle-view" }
    | { kind: "open-drawer" }
    | { kind: "confirm-notice" }
    | { kind: "select-mode"; mode: "new" | "reschedule" }
  >;
  viewport: { width: number; height: number };
}
export interface ScreenshotEvidence {
  caseId: string;
  path: string;
  sha256: string;
  consoleErrors: number;
  overflow: boolean;
}
export interface VisualFinding {
  id: string;
  severity: "blocker" | "major" | "minor";
  code: string;
  pageId?: string;
  state?: string;
  message: string;
  evidence?: string;
}
```

```ts
// matrix.ts
export function buildVisualMatrix(specs: PageSpec[]): VisualCase[] {
  const cases: VisualCase[] = [];
  for (const spec of specs) {
    const viewport = spec.meta.target === "mobile"
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 };
    cases.push({ id: `${spec.meta.pageId}.default`, pageId: spec.meta.pageId, state: "default", viewport });
    for (const state of Object.keys(spec.states)) {
      if (state !== "default") cases.push({ id: `${spec.meta.pageId}.state.${state}`, pageId: spec.meta.pageId, state, query: { state }, viewport });
    }
    for (const state of spec.businessStates ?? []) {
      cases.push({ id: `${spec.meta.pageId}.business.${state.name}`, pageId: spec.meta.pageId, state: `business:${state.name}`, query: { status: state.name }, viewport });
    }
    for (const mode of spec.formModes ?? []) {
      cases.push({ id: `${spec.meta.pageId}.mode.${mode.name}`, pageId: spec.meta.pageId, state: `mode:${mode.name}`, query: { mode: mode.name }, viewport });
    }
    for (const view of spec.views ?? []) {
      cases.push({ id: `${spec.meta.pageId}.view.${view}`, pageId: spec.meta.pageId, state: `view:${view}`, query: { view }, viewport });
    }
    if (spec.searchIdleTitle !== undefined) {
      cases.push({ id: `${spec.meta.pageId}.search.idle`, pageId: spec.meta.pageId, state: "search:idle", viewport });
      cases.push({ id: `${spec.meta.pageId}.search.results`, pageId: spec.meta.pageId, state: "search:results", actions: [{ kind: "search", value: "张" }], viewport });
      cases.push({ id: `${spec.meta.pageId}.search.empty`, pageId: spec.meta.pageId, state: "search:empty", actions: [{ kind: "search", value: "zzz" }], viewport });
    }
    if (spec.meta.pageId === "appointment-list") {
      cases.push({ id: `${spec.meta.pageId}.drawer`, pageId: spec.meta.pageId, state: "drawer", actions: [{ kind: "open-drawer" }], viewport });
    }
    if (spec.meta.pageId === "treatment-notice") {
      cases.push({ id: `${spec.meta.pageId}.confirmed`, pageId: spec.meta.pageId, state: "confirmed", actions: [{ kind: "confirm-notice" }], viewport });
    }
  }
  return cases;
}
```

- [ ] **Step 4: Implement gates**

```ts
export function runVisualGate(input: {
  cases: VisualCase[];
  screenshots: ScreenshotEvidence[];
  findings: VisualFinding[];
  diff: Array<{ caseId: string; diffPixels: number; totalPixels: number }>;
}): { passed: boolean; issues: VisualFinding[] } {
  const issues: VisualFinding[] = [];
  const byCase = new Map(input.screenshots.map((entry) => [entry.caseId, entry]));
  for (const visualCase of input.cases) {
    if (!byCase.has(visualCase.id)) {
      issues.push({ id: `VISUAL_SCREENSHOT_MISSING:${visualCase.id}`, severity: "blocker", code: "VISUAL_SCREENSHOT_MISSING", pageId: visualCase.pageId, state: visualCase.state, message: `missing screenshot for ${visualCase.id}` });
    }
  }
  for (const shot of input.screenshots) {
    if (shot.consoleErrors > 0) issues.push({ id: `VISUAL_CONSOLE_ERROR:${shot.caseId}`, severity: "blocker", code: "VISUAL_CONSOLE_ERROR", message: `${shot.caseId} has console errors`, evidence: shot.path });
    if (shot.overflow) issues.push({ id: `VISUAL_OVERFLOW:${shot.caseId}`, severity: "blocker", code: "VISUAL_OVERFLOW", message: `${shot.caseId} overflows the viewport`, evidence: shot.path });
  }
  for (const entry of input.diff) {
    const ratio = entry.totalPixels === 0 ? 0 : entry.diffPixels / entry.totalPixels;
    if (ratio > 0.01) issues.push({ id: `VISUAL_DIFF_EXCEEDED:${entry.caseId}`, severity: "blocker", code: "VISUAL_DIFF_EXCEEDED", message: `${entry.caseId} diff ${(ratio * 100).toFixed(2)}% > 1%`, evidence: entry.caseId });
  }
  for (const finding of input.findings) issues.push(finding);
  return { passed: issues.every((entry) => entry.severity !== "blocker"), issues };
}
```

- [ ] **Step 5: Add the pure status function**

```ts
// run-visual-review.ts
export function visualReviewStatus(input: {
  gatePassed: boolean;
  hasBlockingFinding: boolean;
  signoffValid: boolean;
}): "passed" | "awaiting_signoff" | "blocked" {
  if (!input.gatePassed || input.hasBlockingFinding) return "blocked";
  return input.signoffValid ? "passed" : "awaiting_signoff";
}
```

Add a test:

```ts
it("derives status from gates and signoff", () => {
  expect(visualReviewStatus({ gatePassed: true, hasBlockingFinding: false, signoffValid: false })).toBe("awaiting_signoff");
  expect(visualReviewStatus({ gatePassed: true, hasBlockingFinding: false, signoffValid: true })).toBe("passed");
  expect(visualReviewStatus({ gatePassed: false, hasBlockingFinding: false, signoffValid: true })).toBe("blocked");
});
```

- [ ] **Step 6: Package wiring**

Create `package.json` with name `@prd-ui/visual-review`, dependencies `@prd-ui/contracts`, `@prd-ui/agents`, `zod`; tsconfig extends root. Add it to `runtimes/standalone` dependencies and tsconfig references if needed.

- [ ] **Step 7: Run tests and commit**

Run: `cd pipeline && pnpm exec vitest run core/visual-review/tests`
Expected: PASS.

```bash
git add core/visual-review runtimes/standalone/package.json
git commit -m "feat(visual-review): add screenshot matrix and deterministic gates"
```

---

### Task 7: Playwright screenshots, diff, and visual CLIs

**Files:**
- Modify: `pipeline/runtimes/standalone/package.json`
- Create: `pipeline/runtimes/standalone/src/visual/screenshot.ts`
- Create: `pipeline/runtimes/standalone/src/visual/diff.ts`
- Create: `pipeline/runtimes/standalone/src/visual-review-cli.ts`
- Create: `pipeline/runtimes/standalone/src/visual-baseline-cli.ts`
- Create: `pipeline/runtimes/standalone/src/visual-sign-cli.ts`
- Modify: `pipeline/package.json`
- Test: `pipeline/runtimes/standalone/tests/visual-diff.test.ts`
- Test: `pipeline/runtimes/standalone/tests/visual-cli.test.ts`

**Interfaces:**
- Consumes: `VisualCase`, `buildVisualMatrix`, `runVisualGate`.
- Produces: `captureVisualCases`, `diffPng`, CLI summaries with `status`, `cases`, `screenshots`, `diff`, `findings`, `costCny`, `usageComplete`.

- [ ] **Step 1: Add dependencies and scripts**

`runtimes/standalone/package.json` dependencies add `playwright`, `pixelmatch`, `pngjs`; devDependencies add `@types/pixelmatch`, `@types/pngjs`. `pipeline/package.json` scripts:

```json
"visual:review": "tsx runtimes/standalone/src/visual-review-cli.ts",
"visual:baseline": "tsx runtimes/standalone/src/visual-baseline-cli.ts",
"visual:sign": "tsx runtimes/standalone/src/visual-sign-cli.ts"
```

Run `pnpm install` and `pnpm exec playwright install chromium`.

- [ ] **Step 2: Write failing diff test**

```ts
it("computes diff pixels and writes a diff png", async () => {
  const result = await diffPng(equalPng, equalPng, "/tmp/visual-diff-test.png");
  expect(result.diffPixels).toBe(0);
  expect(result.totalPixels).toBe(4);
});
```

- [ ] **Step 3: Implement diff**

```ts
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
export async function diffPng(aPath: string, bPath: string, outPath: string) {
  const a = PNG.sync.read(await readFile(aPath));
  const b = PNG.sync.read(await readFile(bPath));
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  await writeFile(outPath, PNG.sync.write(diff));
  return { diffPixels, totalPixels: a.width * a.height };
}
```

- [ ] **Step 4: Implement screenshots**

```ts
export async function captureVisualCases(input: {
  htmlDir: string;
  cases: VisualCase[];
  outDir: string;
}): Promise<ScreenshotEvidence[]> {
  const server = createStaticServer(input.htmlDir);
  const browser = await chromium.launch({ headless: true });
  const results: ScreenshotEvidence[] = [];
  try {
    for (const visualCase of input.cases) {
      const page = await browser.newPage({ viewport: visualCase.viewport, deviceScaleFactor: 1 });
      const errors: string[] = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.emulateMedia({ reducedMotion: "reduce" });
      const query = new URLSearchParams(visualCase.query ?? {}).toString();
      await page.goto(`${server.url}/${visualCase.pageId}.html${query ? `?${query}` : ""}`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      for (const action of visualCase.actions ?? []) {
        if (action.kind === "toggle-view") await page.click("[data-view-toggle]");
        if (action.kind === "open-drawer") await page.click("[data-block]");
        if (action.kind === "confirm-notice") await page.click('[data-action="确认已当面告知"]');
        if (action.kind === "search") await page.fill("[data-search-input]", action.value);
        if (action.kind === "select-mode") await page.click(`.mode-tabs button:text-is("${action.mode === "new" ? "新增预约" : "改期"}")`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      const path = join(input.outDir, `${visualCase.id}.png`);
      await page.screenshot({ path, fullPage: false });
      results.push({ caseId: visualCase.id, path, sha256: await hashFile(path), consoleErrors: errors.length, overflow });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return results;
}
```

`createStaticServer` is a small `node:http` server that serves files from `htmlDir` and listens on `127.0.0.1:0`:

```ts
function createStaticServer(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent((request.url ?? "/").split("?")[0] ?? "/");
    const filePath = join(dir, pathname === "/" ? "index.html" : pathname);
    try {
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": filePath.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}
```

- [ ] **Step 5: CLI**

`visual-baseline-cli.ts`: parse `--project`, `--spec-run`, `--html`, `--out`; read specs; `buildVisualMatrix`; capture; write PNGs and `manifest.json`; no model.

`visual-review-cli.ts`: parse `--project`, `--spec-run`, `--html`, `--baseline`, `--runtime`, `--profile`, `--runs`, `--max-cost-cny`, `--json`; capture to run dir; diff baseline; call Visual Critic runner (Task 8, `--profile prd-ui-visual` for dsh) or scripted critic; `runVisualGate`; write `visual-review.json`; status `passed|awaiting_signoff|blocked`.

`visual-sign-cli.ts`: parse `--run`, `--signoff-visual`; parse `manifestHash`/`findingsHash` from the markdown block; validate; write `signoff/visual.md`; update state to `success`.

- [ ] **Step 6: Tests and commit**

Run: `cd pipeline && pnpm exec vitest run runtimes/standalone/tests/visual-diff.test.ts runtimes/standalone/tests/visual-cli.test.ts`
Expected: PASS.

```bash
git add runtimes/standalone/package.json package.json runtimes/standalone/src/visual runtimes/standalone/src/visual-review-cli.ts runtimes/standalone/src/visual-baseline-cli.ts runtimes/standalone/src/visual-sign-cli.ts runtimes/standalone/tests/visual-diff.test.ts runtimes/standalone/tests/visual-cli.test.ts pnpm-lock.yaml
git commit -m "feat(visual-review): add Playwright screenshots, diff, and CLIs"
```

---

### Task 8: Visual Critic agent and vision profile

**Files:**
- Modify: `pipeline/core/agents/src/contracts.ts`
- Create: `pipeline/core/agents/src/roles/visual-critic.ts`
- Modify: `pipeline/core/agents/src/index.ts`
- Create: `pipeline/dsh/home/profiles/prd-ui-visual/package.json`
- Create: `pipeline/dsh/home/profiles/prd-ui-visual/cordis.yml`
- Create: `pipeline/dsh/home/profiles/prd-ui-visual/cordis.patch.yml`
- Create: `pipeline/samples/agents/visual-critic/visual-critic.json`
- Test: `pipeline/core/agents/tests/contracts.test.ts`
- Test: `pipeline/core/agents/tests/visual-critic.test.ts`
- Test: `pipeline/runtimes/standalone/tests/visual-cli.test.ts`

**Interfaces:**
- Produces: `AgentTaskRoleSchema` includes `"visual-critic"`.
- Produces: `VisualCritiqueSchema`, `buildVisualCriticPrompt`.
- Produces: `prd-ui-visual` profile with vision model and file tools.

- [ ] **Step 1: Write failing role/prompt test**

```ts
it("builds a visual critic prompt with screenshots and forbids edits", () => {
  const prompt = buildVisualCriticPrompt({
    project: "employee-app-phase2",
    screenshots: [{ caseId: "today.default", path: "screenshots/today.default.png" }],
    specs: [spec],
    profile: "b-mobile",
    visualStyle: {},
  });
  expect(prompt).toContain("Visual Critic");
  expect(prompt).toContain("screenshots/today.default.png");
  expect(prompt).toContain("Do not modify files");
  expect(prompt).toContain("hierarchy");
});
```

- [ ] **Step 2: Implement role**

```ts
export const VisualCritiqueSchema = z.object({
  verdict: z.enum(["pass", "changes"]),
  findings: z.array(z.object({
    id: z.string().min(1),
    severity: z.enum(["blocker", "major", "minor"]),
    pageId: z.string().min(1),
    state: z.string().min(1),
    evidence: z.string().min(1),
    issue: z.string().min(1),
    proposal: z.string().min(1),
  }).strict()),
  summary: z.string().min(1),
}).strict();

export function buildVisualCriticPrompt(input: {
  project: string;
  screenshots: Array<{ caseId: string; path: string }>;
  specs: PageSpec[];
  profile: string;
  visualStyle: unknown;
}): string {
  return [
    "You are the Visual Critic for a PRD → UI pipeline.",
    "Inspect only the supplied screenshots. Do not modify files or render new pages.",
    "Judge hierarchy, spacing, alignment, density, visual balance, and brand consistency.",
    "Do not repeat deterministic checks (console errors, overflow, pixel diff).",
    "Return one JSON object matching the schema; findings must cite a screenshot path and location.",
    "## Screenshots (data)",
    JSON.stringify(input.screenshots, null, 2),
    "## Page Specs (data)",
    JSON.stringify(input.specs, null, 2),
    "## Profile and visual style (data)",
    JSON.stringify({ profile: input.profile, visualStyle: input.visualStyle }, null, 2),
    "Return only JSON.",
  ].join("\n");
}
```

- [ ] **Step 3: Add the role to contracts and export**

Add `"visual-critic"` to `AgentTaskRoleSchema`; export prompt/schema from `core/agents/src/index.ts`.

- [ ] **Step 4: Add `prd-ui-visual` profile**

Copy `prd-ui-assets` profile files; change the comment/name; keep `defaultInput: [text, image]`, `maxTokens: 32768`, and the `@prd-ui/runtime-dsh` bundle. Add a smoke command to `dsh/README.md`.

- [ ] **Step 5: Add scripted fixture and CLI path**

`visual-critic.json` shape:

```json
{
  "output": {
    "verdict": "pass",
    "findings": [],
    "summary": "No visual blockers."
  },
  "usage": { "inputTokens": 100, "outputTokens": 20, "cacheReadTokens": 0, "totalTokens": 120 },
  "usageComplete": true
}
```

`visual-review-cli.ts --runtime standalone` loads this fixture instead of calling dsh; `--runtime dsh` calls the visual-critic runner.

- [ ] **Step 6: Tests and commit**

Run: `cd pipeline && pnpm exec vitest run core/agents/tests/contracts.test.ts core/agents/tests/visual-critic.test.ts runtimes/standalone/tests/visual-cli.test.ts`
Expected: PASS.

```bash
git add core/agents/src/contracts.ts core/agents/src/roles/visual-critic.ts core/agents/src/index.ts core/agents/tests/contracts.test.ts core/agents/tests/visual-critic.test.ts samples/agents/visual-critic dsh/home/profiles/prd-ui-visual runtimes/standalone/tests/visual-cli.test.ts
git commit -m "feat(agents): add Visual Critic role and vision profile"
```

---

### Task 9: Clean 8-page visual acceptance, artifacts, docs, regression

**Files:**
- Update: `pipeline/artifacts/employee-app-phase2/visual-review/`
- Update: `pipeline/baselines/employee-app-phase2/`
- Modify: `docs/superpowers/specs/2026-10-19-prd-to-ui-pipeline-design.md`
- Modify: `docs/superpowers/specs/2026-10-22-v04-motion-visual-regression-design.md`
- Modify: `README.md`, `AGENTS.md`, `CHANGELOG.md`
- Modify: `pipeline/docs/spec-engineer-v0.md`, `pipeline/docs/agent-m1.md`
- Modify: `docs/handoffs/2026-10-21-8page-renderer-handoff.md`

- [ ] **Step 1: Run Spec Engineer with strict motion**

```bash
cd pipeline
pnpm spec:engineer --project samples/projects/employee-app-phase2/project.yaml \
  --agent-run /tmp/m1-final2/run-2026-10-22T03-16-05-257Z \
  --runs /tmp/spec-v04 --strict-motion
```

Expected: 8 Page Specs, 0 blockers, **0 `SPEC_MOTION_NODE_UNRESOLVED`**.

- [ ] **Step 2: Render**

```bash
pnpm render:html --run /tmp/spec-v04/<runId> --out /tmp/html-v04
```

Expected: 8 pages + index; HTML contains `data-motion-preset`, `data-node-id`, full `data-slot-date`, `data-picker-search`.

- [ ] **Step 3: Create baseline**

```bash
pnpm visual:baseline --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v04/<runId> --html /tmp/html-v04 \
  --out pipeline/baselines/employee-app-phase2
```

Expected: 19–24 PNGs + `manifest.json`.

- [ ] **Step 4: Run Visual Review with real dsh**

```bash
set -a; . ./.env; set +a
DSH_HOME="$PWD/dsh/home" pnpm visual:review \
  --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v04/<runId> --html /tmp/html-v04 \
  --baseline pipeline/baselines/employee-app-phase2 \
  --runtime dsh --profile prd-ui-visual \
  --runs /tmp/visual-v04 --max-cost-cny 3 --json
```

Expected: screenshots complete, 0 console/overflow, diff within 1%, Visual Critic findings triaged; status `awaiting_signoff` or `passed`.

- [ ] **Step 5: Sign and rerun**

Create `/tmp/signoff-visual-v04.md` with the `manifestHash` and `findingsHash` printed by the review summary:

```md
# Visual signoff

<!-- signoff
{
  "signer": "Sample Reviewer",
  "date": "2026-10-22",
  "manifestHash": "<manifest hash>",
  "findingsHash": "<findings hash>",
  "waivers": []
}
-->
```

```bash
pnpm visual:sign --run /tmp/visual-v04/<runId> \
  --signoff-visual /tmp/signoff-visual-v04.md
pnpm visual:review --project samples/projects/employee-app-phase2/project.yaml \
  --spec-run /tmp/spec-v04/<runId> --html /tmp/html-v04 \
  --baseline pipeline/baselines/employee-app-phase2 \
  --runtime dsh --profile prd-ui-visual \
  --runs /tmp/visual-v04-rerun --max-cost-cny 3 --json
```

Expected: `status=passed`, diff stable.

- [ ] **Step 6: Playwright picker/date/fidelity checks**

Serve `/tmp/html-v04` and verify:

1. form → 选择客户 → customer-search picker → select 张女士 → back to form with customer prefilled and other fields preserved.
2. calendar empty cell → form `startTime` prefilled `YYYY-MM-DDTHH:mm`, `endTime` +60 minutes.
3. list page has no raw field-label row; detail/notice has no duplicate customer/status nodes; bottom tabs show 今日 + 预约列表; search idle hides 查看详情; calendar has legend and horizontal scroll.

- [ ] **Step 7: Copy artifacts and update docs**

Copy HTML, screenshots, visual-review JSON/findings/signoff, baseline manifest, and run summaries to `pipeline/artifacts/employee-app-phase2/`. Update docs with:

- motion node ids / 0 unresolved;
- visual review cases/screenshots/diff/findings/cost;
- picker/date acceptance;
- fidelity fixes;
- v0.4 completion and remaining debt (Phase 3/4).

- [ ] **Step 8: Full regression and commit**

```bash
cd pipeline
pnpm test
pnpm typecheck
pnpm test:dsh
pnpm phase1:verify --project samples/project.demo-orders-intake.yaml --runs /tmp/final-v04-8p
pnpm phase1:verify --project samples/projects/employee-app/project.yaml --runs /tmp/final-v04-emp
pnpm phase1:verify --project samples/projects/employee-app-appointments-03/project.yaml --runs /tmp/final-v04-03
pnpm phase1:verify --project samples/projects/employee-app-phase2/project.yaml --runs /tmp/final-v04-phase2
```

Expected: tests pass, typecheck clean, `test:dsh` 2 passed, Phase 1 `8/2/4/8` all 0.

Final audit: no `.env`, keys, `node_modules`, `/tmp`, or `/Users` strings in artifacts. Commit locally only.

```bash
git add pipeline/artifacts/employee-app-phase2 pipeline/baselines/employee-app-phase2 docs README.md AGENTS.md CHANGELOG.md pipeline/docs
git commit -m "feat(v0.4): add motion, visual review, picker, and fidelity fixes"
```
