# Phase 1B · User Usability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Phase 1A pipeline usable with a second project and a custom brief, without hardcoded order content, and make the CLI accept project/brief/manifest input.

**Architecture:** Extend contracts with page metadata and project config; make compiler templates consume the UI Brief instead of hardcoded copy; add a Brief↔PageSpec semantic validator; add a project-level CLI (`--project`, `--brief`, `--manifest`, `--runs`, `--help`); add a second `demo-crm` sample project. Keep the existing sample green (8 pages, 0 blockers).

**Tech Stack:** TypeScript strict, Zod 4, pnpm workspace, Vitest, tsx, `yaml` (project config).

## Global Constraints

- Work under `pipeline/`; do not touch `spike/`.
- Keep the sample `demo-orders` result: 8 pages, 0 blockers, `pnpm phase1:verify` exit 0.
- PageSpec remains semantic-only; no raw colors/sizes/style/absolute positioning.
- One product surface uses one design system.
- Validators remain pure functions.
- All new user-facing behavior has tests; run `pnpm test`, `pnpm typecheck`, and the CLI before commit.
- No placeholders; no silent fallbacks. If a project lacks a manifest for a page profile, fail with a run-level error.
- Local commits only; no push.

---

### Task 1: Project config, CLI, and PageSpec metadata

**Files:**
- Modify: `pipeline/packages/contracts/src/page-spec.ts`
- Modify: `pipeline/packages/contracts/src/ui-brief.ts`
- Create: `pipeline/packages/contracts/src/project-config.ts`
- Modify: `pipeline/packages/contracts/src/index.ts`
- Modify: `pipeline/packages/compiler/src/compile-page-spec.ts` (meta only: purpose/route/roles)
- Create: `pipeline/pipeline/orchestrator/src/project-config.ts`
- Modify: `pipeline/pipeline/orchestrator/src/run-phase1.ts`
- Create: `pipeline/pipeline/orchestrator/src/cli.ts`
- Modify: `pipeline/package.json` (`phase1:verify` → `tsx pipeline/orchestrator/src/cli.ts`; add `yaml` to orchestrator)
- Create: `pipeline/samples/project.demo-orders.yaml`
- Test: `pipeline/packages/contracts/tests/contracts.test.ts`
- Test: `pipeline/pipeline/orchestrator/tests/cli.test.ts`

**Interfaces:**
- `PageSpec.meta` adds required `purpose: string`, `route: string`, `roles: string[]`.
- `UiBriefPage` adds optional `filterFields?: string[]`, `emptyTitle?: string`, `emptyAssetRef?: string`, `summaryTitle?: string`, `feedItems?: Array<{ title: string; body: string }>`, `stats?: Array<{ label: string; value: string }>`.
- `UiBrief.ia.navigation` adds optional `tabs?: string[]`.
- `ProjectConfig = { project: string; brief: string; manifests: Record<string, string>; runsDir?: string }` with `ProjectConfigSchema` (strict).
- `runPhase1(options?: { projectPath?: string; briefPath?: string; manifests?: Record<string, string>; runsDir?: string }): Promise<Phase1Result>`.
- CLI:
  ```
  pnpm phase1:verify [--project <path>] [--brief <path>]
                     [--manifest <profile>=<path>]... [--runs <dir>] [--help]
  ```
  No args → `samples/project.demo-orders.yaml`. `--help` prints usage and exits 0 without running. Unknown args → exit 2.
  Success prints `Phase 1A OK: N pages, B blockers` and `Run: <runDir>`; failure prints `Phase 1A FAILED: ...` and exits 1.

- [ ] **Step 1: Extend PageSpec meta and UI Brief**
  - Add `purpose`, `route`, `roles` to `PageSpec` meta type and `PageSpecSchema` (roles: `z.array(z.string().min(1)).min(1)`).
  - Add optional fields to `UiBriefPageSchema` and types:
    ```ts
    filterFields: z.array(z.string()).optional(),
    emptyTitle: z.string().min(1).optional(),
    emptyAssetRef: z.string().min(1).optional(),
    summaryTitle: z.string().min(1).optional(),
    feedItems: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) }).strict()).optional(),
    stats: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) }).strict()).optional(),
    ```
  - `ia.navigation.tabs: z.array(z.string()).optional()`.
  - Update `compilePageSpec` meta:
    ```ts
    purpose: page.purpose,
    route: page.route,
    roles: page.roles,
    ```
  - Update existing tests/fixtures that construct PageSpec meta (contracts test minimal spec, compiler tests, validators tests, orchestrator sample) to include the new fields.

- [ ] **Step 2: Project config contract and loader**
  - `project-config.ts` schema as above.
  - Orchestrator loader:
    ```ts
    import { parse as parseYaml } from "yaml";
    import { ProjectConfigSchema } from "@prd-ui/contracts";
    export function loadProjectConfig(path: string): { config: ProjectConfig; baseDir: string } {
      const abs = path.resolve(path);
      const config = ProjectConfigSchema.parse(parseYaml(readFileSync(abs, "utf8")));
      return { config, baseDir: path.dirname(abs) };
    }
    ```
    Resolve `brief` and each manifest relative to `baseDir`; `runsDir` relative to `baseDir` if provided.
  - Add `yaml` dependency to orchestrator and `pnpm install`.

- [ ] **Step 3: `runPhase1` options and manifest selection**
  - Load project config when `projectPath` is provided; otherwise when no `briefPath`/`manifests`, use `samples/project.demo-orders.yaml`.
  - If `briefPath` is provided without any manifests and no project config, throw `missing manifests: pass --manifest <profile>=<path> or --project`.
  - Validate `config.project === brief.meta.project`; mismatch → run-level failure.
  - Build `manifestsByProfile`: parse each manifest path, check `manifest.profile` key, `manifest.project === config.project`; missing profile for a page → run-level `PROJECT-MANIFEST-MISSING` failure.
  - Pass each page's profile manifest in `ValidationContext`.
  - CLI success/failure prints the run dir.

- [ ] **Step 4: CLI**
  - `cli.ts` parses args, supports `--help`, `--project`, `--brief`, repeatable `--manifest profile=path`, `--runs`.
  - `--help` must not call `runPhase1`; add a test that no run dir is created.
  - Unknown flag/argument → usage + exit 2.
  - On result, print `Run: <runDir>`; exit 1 if `!passed`.
  - Update `pipeline/package.json` `phase1:verify`.

- [ ] **Step 5: Sample project config**
  ```yaml
  project: demo-orders
  brief: ui-brief.sample.json
  manifests:
    b-dense: asset-manifest.b-dense.json
    c-expressive: asset-manifest.c-expressive.json
  ```
  (Paths relative to `samples/`.)

- [ ] **Step 6: Tests**
  - Contracts: PageSpec meta requires purpose/route/roles; UI Brief optional fields parse; project config strict.
  - CLI: `--help` no run; unknown arg exit 2; default no-arg run 8/0; `--project samples/project.demo-orders.yaml` 8/0; `--brief` + two `--manifest` custom run; missing manifest error; project mismatch error.
  - Keep existing 100 tests green (update fixtures for new meta fields).

- [ ] **Step 7: Verify and commit**
  ```bash
  cd "/Users/jihui/Desktop/产品、ui/pipeline"
  pnpm install
  pnpm test
  pnpm typecheck
  pnpm phase1:verify
  ```
  Expect 8 pages/0 blockers. Commit: `feat: add project config and cli`.

---

### Task 2: Brief-driven page content

**Files:**
- Modify: `pipeline/packages/compiler/src/compile-page-spec.ts`
- Modify: `pipeline/samples/ui-brief.sample.json`
- Test: `pipeline/packages/compiler/tests/compiler.test.ts`

**Interfaces:**
- All templates consume `brief.ia.navigation` and the page's `fields/actions/filterFields/emptyTitle/emptyAssetRef/summaryTitle/feedItems/stats`.
- `PageSpec.meta` already carries `purpose/route/roles` from Task 1.

- [ ] **Step 1: Navigation/tabs**
  - `const nav = brief.ia.navigation.primary;`
  - `const tabs = brief.ia.navigation.tabs ?? nav;`
  - Replace hardcoded `nav`/`tabs` in PageShell/MobileShell.

- [ ] **Step 2: List**
  - `columns = page.fields ?? ["名称", "状态"]`
  - `filterFields = page.filterFields ?? page.fields ?? []`
  - `action = page.actions?.[0] ?? "新建"`
  - `emptyTitle = page.emptyTitle ?? \`暂无${page.name}\``
  - `emptyAssetRef = page.emptyAssetRef ?? (page.profile === "c-expressive" ? "empty-feed" : "empty-orders")`
  - DataTable columns, FilterBar fields/action, EmptyState title/assetRef use these.
  - The empty state remains in the layout (current list template includes it).

- [ ] **Step 3: Detail/form/settings/auth/feed/overview/onboarding**
  - Detail summary title: `page.summaryTitle ?? \`${page.name}摘要\``; action: `page.actions?.[0] ?? "编辑"`.
  - Form fields from `page.fields`; actions from `page.actions?.[0]`/`[1]` or `保存`/`取消`; labels from field names.
  - Settings groups from `page.fields`; FormField labels from fields; action `page.actions?.[0] ?? "保存"`.
  - Feed cards from `page.feedItems ?? [{ title: "示例内容", body: "请配置 feedItems" }]`.
  - Auth fields from `page.fields ?? ["email", "password"]`; action `page.actions?.[0] ?? "登录"`.
  - Overview stats from `page.stats ?? [{ label: "指标", value: "—" }]`; recent list title `${page.name}近期数据`.
  - Onboarding title `page.name`; body `page.purpose`.

- [ ] **Step 4: Update sample brief**
  - Add `ia.navigation.tabs: ["推荐", "关注", "附近", "我的"]`.
  - `orders-list`: `filterFields: ["status", "date", "keyword"]`, `emptyTitle: "暂无订单"`.
  - `orders-overview`: `stats` with the four current stats.
  - `home-feed`: `feedItems` with the two current cards.
  - `item-detail`: `summaryTitle: "商品摘要"`.
  - `order-detail`: `summaryTitle: "订单摘要"`.
  - Keep the sample output equivalent.

- [ ] **Step 5: Tests**
  - Compile the sample: 8 specs, 0 blockers; assert `orders-list` columns/action/empty title; `home-feed` feed items; nav from brief.
  - Add a custom `customers-list` page to a cloned brief (no file writes outside temp): compile and assert columns `customerName/phone/email`, filter fields, action `新建客户`, empty title `暂无客户` (set `emptyTitle`), and that no order-specific `新建订单`/`暂无订单`/`status/date/keyword` appears in its spec JSON.
  - Add a `contacts-list` `demo-crm` page: same assertions with its own fields/actions.
  - Assert PageSpec meta purpose/route/roles match.

- [ ] **Step 6: Verify and commit**
  ```bash
  cd pipeline && pnpm test && pnpm typecheck && pnpm phase1:verify
  ```
  Commit: `feat: drive page content from the ui brief`.

---

### Task 3: Semantic validation (Brief ↔ Page Spec)

**Files:**
- Create: `pipeline/packages/validators/src/semantic.ts`
- Modify: `pipeline/packages/validators/src/types.ts`
- Modify: `pipeline/packages/validators/src/validate.ts`
- Modify: `pipeline/packages/validators/src/index.ts`
- Modify: `pipeline/pipeline/orchestrator/src/run-phase1.ts` (populate context)
- Test: `pipeline/packages/validators/tests/validators.test.ts`

**Interfaces:**
- `ValidationContext` adds `briefPage?: UiBriefPage` and `navigation?: { primary: string[]; tabs?: string[] }`.
- New rule IDs:
  - `SEMANTIC-META` — `spec.meta.name/purpose/route/roles` differ from brief page.
  - `SEMANTIC-NAV` — web `PageShell.props.nav` misses a primary item; mobile `MobileShell.props.tabs` misses a tab.
  - `SEMANTIC-FIELD` — a page `fields` entry does not appear anywhere in the serialized layout.
  - `SEMANTIC-ACTION` — a page `actions` entry does not appear in the layout or interactions.
  - `SEMANTIC-EMPTY` — page `emptyTitle` is set but does not appear in the layout.
- All are blockers.

- [ ] **Step 1: Implement semantic validator**
  - Traverse/stringify the layout; check exact strings.
  - For nav: find the root `PageShell`/`MobileShell` props.
  - For actions: check `JSON.stringify(layout).includes(action)` OR `spec.interactions.some(i => i.trigger === action)`; prefer layout but allow interactions.
  - For fields: check serialized layout includes each field string.
  - For empty title: check includes.
  - Meta check includes roles arrays equality (order-insensitive) and purpose/route strings.

- [ ] **Step 2: Context and orchestrator**
  - `validatePageSpec` context includes `briefPage`/`navigation`.
  - `runPhase1` passes the brief page and `brief.ia.navigation` for each spec.
  - Tests call with context; existing validator tests update.

- [ ] **Step 3: Tests**
  - All 8 sample pages: 0 semantic findings.
  - `customers-list` and `contacts-list`: 0 findings.
  - Mutate a customers-list spec to use order columns/filter/action → `SEMANTIC-FIELD`/`SEMANTIC-ACTION` findings.
  - Mutate meta name/purpose/route/roles → `SEMANTIC-META`.
  - Remove nav item/tab → `SEMANTIC-NAV`.
  - Remove empty title → `SEMANTIC-EMPTY`.

- [ ] **Step 4: Verify and commit**
  ```bash
  cd pipeline && pnpm test && pnpm typecheck && pnpm phase1:verify
  ```
  Commit: `feat: add brief-to-spec semantic validation`.

---

### Task 4: Second project fixture, docs, and user re-test

**Files:**
- Create: `pipeline/samples/projects/demo-crm/project.yaml`
- Create: `pipeline/samples/projects/demo-crm/ui-brief.json`
- Create: `pipeline/samples/projects/demo-crm/asset-manifest.b-dense.json`
- Modify: `pipeline/README.md`
- Create: `pipeline/docs/user-acceptance-2026-10-19-after-fixes.md`
- Test: `pipeline/pipeline/orchestrator/tests/run-phase1.test.ts`

**Interfaces:**
- `demo-crm` project: one page `contacts-list`, list archetype, b-dense, fields `name/email/phone`, filterFields `name/email`, action `新建联系人`, emptyTitle `暂无联系人`, reqRef `REQ-CRM-001`, nav `["联系人", "设置"]`, route `/contacts`, roles `admin`.
- Manifest b-dense with icons + `empty-orders`; `complete: true`, placeholders [].
- Project config:
  ```yaml
  project: demo-crm
  brief: ui-brief.json
  manifests:
    b-dense: asset-manifest.b-dense.json
  ```
- CLI: `pnpm phase1:verify --project samples/projects/demo-crm/project.yaml --runs /tmp/demo-crm-runs` → 1 page, 0 blockers; page spec has contact fields/action/empty title/nav; no order copy.

- [ ] **Step 1: Create the project fixture**
- [ ] **Step 2: Test the custom project via `runPhase1({ projectPath })`**
  - Assert 1 page, 0 blockers, state success; inspect `contacts-list.json` for contact content.
  - Assert no `新建订单`/`暂无订单`/`status/date/keyword`.
- [ ] **Step 3: README**
  - Document CLI flags, project.yaml, custom brief/manifest workflow, `--help`, run dir output.
  - Update "Current limitations": remove the project/CLI/dynamic-content limitations that are fixed; keep PRD → UI Brief ingestion (Phase 2) and real design-system ingestion.
- [ ] **Step 4: User re-test note**
  - After implementation, run an independent agent (not this task) to re-test scenarios A–D from `pipeline/docs/user-acceptance-2026-10-19.md`; record results in `user-acceptance-2026-10-19-after-fixes.md`.
- [ ] **Step 5: Verify and commit**
  ```bash
  cd pipeline && pnpm test && pnpm typecheck
  pnpm phase1:verify
  pnpm phase1:verify --project samples/projects/demo-crm/project.yaml --runs /tmp/demo-crm-runs
  ```
  Commit: `feat: add demo crm project and usage docs`.

---

## Phase 1B Exit Criteria

- `pnpm phase1:verify` → 8 pages, 0 blockers (demo-orders unchanged).
- `pnpm phase1:verify --project samples/projects/demo-crm/project.yaml --runs /tmp/demo-crm-runs` → 1 page, 0 blockers.
- A custom `customers-list` page compiles with its own fields/actions/filter/empty title; no order copy.
- Semantic validator blocks a spec whose layout does not match its brief page.
- CLI supports `--project`, `--brief`, `--manifest`, `--runs`, `--help`; `--help` does not run; run dir printed.
- README documents the user workflow; remaining limitation is PRD → UI Brief ingestion (Phase 2).
- Full suite + typecheck clean.
