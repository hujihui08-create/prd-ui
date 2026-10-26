# v0.6 Phase 3A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v0.6 Phase 3A slice: Figma plan/plugin/readback diff for 8 default pages, deterministic Asset Compiler with LICENSES, and a read-only Studio workbench over a completed run.

**Architecture:** `core/figma` compiles PageSpec + Profile + Catalog into a stable `FigmaPlan` and diffs a plugin readback in pure TypeScript. `runtimes/figma` is a Figma-sandbox plugin with a plan file picker and readback download. `core/asset-compiler` packages manifest/frozen assets and licenses; standalone owns file IO. `studio` is an independent Vite/React/Tailwind v4/shadcn app reading a static `studio-data.json`; it never orchestrates.

**Tech Stack:** TypeScript (strict, ESM), pnpm workspace, vitest, esbuild (Figma bundle), React + Vite + Tailwind v4 + shadcn (Studio), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-v06-figma-studio-asset-compiler-design.md`

## Global Constraints

- Do not edit the signed brief, M1/intake artifacts, or the v0.5 visual baseline.
- Figma plugin cannot be headless; real build/readback is a human gate. No Figma build/readback means v0.6 cannot be signed `passed`.
- v0.6 Figma scope: 8 default pages only; no state frames.
- Only Button is a Figma component instance; other nodes are native frames.
- Material Symbols render as glyph text; asset icons as VECTOR; full vector set is v0.6.x debt.
- Studio UI must use `ui-design-system` (shadcn/ui + Tailwind v4, lucide-react, h-9, black/white/gray); no product b-mobile styles.
- Local commits only when authorized; no push.

---

### Task 1: Contracts, workspace, catalog mapping

**Files:**
- Create: `core/contracts/src/figma.ts`
- Modify: `core/contracts/src/index.ts`
- Create: `core/figma/package.json`, `tsconfig.json`
- Modify: `core/design-system/src/catalogs/b-mobile.ts` (Button `mapping.figma`)
- Modify: `pnpm-workspace.yaml` (add `studio` later)
- Test: `core/contracts/tests/figma.test.ts`

**Interfaces:**
- Produces: `FigmaPlan`, `FigmaPlanNode`, `FigmaReadback`, `FigmaReadbackNode`, `FigmaDiffFinding`, schemas; Button `mapping.figma = "b-mobile/Button"`.

- [ ] **Step 1: Define Figma contracts + failing schema tests**

Add `FigmaPlanSchema`, `FigmaReadbackSchema`, `FigmaDiffFindingSchema` with `schemaVersion: "1.0"`; test valid/invalid plan and readback.

- [ ] **Step 2: Add catalog mapping and package skeleton**

Add `mapping: { figma: "b-mobile/Button" }` to the b-mobile Button component. Create `core/figma` package with `@prd-ui/contracts` and `@prd-ui/design-system` workspace deps and a `typecheck` script.

- [ ] **Step 3: Run contracts/typecheck**

`pnpm exec vitest run core/contracts/tests/figma.test.ts` and `pnpm typecheck`.
Expected: PASS.

---

### Task 2: Figma plan compiler + style registry

**Files:**
- Create: `core/figma/src/styles.ts`, `core/figma/src/compile-plan.ts`, `core/figma/src/index.ts`
- Create: `core/figma/tests/plan.test.ts`

**Interfaces:**
- `compileFigmaPlan(page: PageSpec, profile: Profile, catalog: Catalog): FigmaPlan`
- `compileFigmaPlans(specs: PageSpec[], profileFor: (id)=>Profile, catalogFor: (id)=>Catalog): FigmaPlan[]`

- [ ] **Step 1: Add a failing 8-page test**

Load `samples/projects/employee-app-phase2/ui-brief.json`, compile project, assert 8 plans; each root FRAME 390×844; default view filtering; inline empty/skeleton skipped; Button INSTANCE count >0; CalendarGrid contains ABSOLUTE blocks; text uses `b-mobile/*` styles; no raw hex outside tokens.

- [ ] **Step 2: Implement style registry + plan compiler**

Map the 20 node types in the v0.5 PageSpec to plan nodes (FRAME/TEXT/INSTANCE/GLYPH/VECTOR/IMAGE/ABSOLUTE). Use profile tokens only. Default state filter:
`viewPanel` non-default, `Skeleton`, `EmptyState` except `emptyKind: "idle"`, error/loading nodes skipped.
`specId` = node.id or stable path. Button mapping from catalog `mapping.figma`.

- [ ] **Step 3: Run plan tests**

`pnpm exec vitest run core/figma/tests/plan.test.ts`
Expected: PASS.

---

### Task 3: Figma diff + plan/verify CLIs

**Files:**
- Create: `core/figma/src/diff.ts`
- Create: `runtimes/standalone/src/figma-cli.ts`
- Modify: `pipeline/package.json` scripts: `figma:plan`, `figma:verify`
- Test: `core/figma/tests/diff.test.ts`, `runtimes/standalone/tests/figma-cli.test.ts`

- [ ] **Step 1: Add failing diff tests**

Clean plan/readback → 0 blocker. Mutations: missing node, hierarchy, text style, component instance → blocker; size/spacing/fill/font/absolute → major; >2 major → gate fail.

- [ ] **Step 2: Implement diff + CLI**

`diffFigma(plan, readback): {passed, findings}`; codes per spec §5.4. CLI writes plan index and diff JSON.

- [ ] **Step 3: Run tests**

`pnpm exec vitest run core/figma/tests/diff.test.ts runtimes/standalone/tests/figma-cli.test.ts`
Expected: PASS.

---

### Task 4: Figma plugin (sandbox + UI + bundle)

**Files:**
- Create: `runtimes/figma/package.json`, `tsconfig.json`, `manifest.json`, `esbuild.config.mjs`
- Create: `runtimes/figma/src/plugin.ts`, `src/ui.html`, `src/figma.d.ts` (minimal sandbox types)
- Test: `runtimes/figma/tests/build.test.ts`

- [ ] **Step 1: Add failing build test**

Run `pnpm --dir runtimes/figma build`; assert `dist/plugin.js` exists, bundle has no `node:`/`fs` import, manifest main points to bundle.

- [ ] **Step 2: Implement plugin**

UI file picker for plan index; scratch/delivery build; variables (`color/*` slash names), text styles (`b-mobile/*`), Button component set (4 variants), Auto Layout, ABSOLUTE calendar blocks, GLYPH/VECTOR/IMAGE, readback JSON download; font fallback; duplicate style/collection reuse; scratch cleanup.

- [ ] **Step 3: Run build test**

`pnpm --dir runtimes/figma build && pnpm exec vitest run runtimes/figma/tests/build.test.ts`
Expected: PASS.

---

### Task 5: Asset Compiler

**Files:**
- Create: `core/asset-compiler/package.json`, `tsconfig.json`, `src/{package,licenses,index}.ts`
- Create: `runtimes/standalone/src/asset-compile-cli.ts`
- Modify: `pipeline/package.json` script `asset:compile`
- Test: `core/asset-compiler/tests/package.test.ts`, `runtimes/standalone/tests/asset-compile-cli.test.ts`

- [ ] **Step 1: Add failing tests**

`library` M0 index 13 assets → 13 files + manifest complete + LICENSES with Lucide ISC; `asset-review` phase2 4 icons → 4 files; missing file/unknown license/placeholder → blocker; idempotent hashes.

- [ ] **Step 2: Implement compiler + CLI**

`compileAssetPackage(input): AssetPackage` returns files/manifest/licenses; standalone writes to out dir atomically. License aggregation from manifest/license dir; `test-fixture` note; relative paths/hashes.

- [ ] **Step 3: Run tests**

`pnpm exec vitest run core/asset-compiler/tests/package.test.ts runtimes/standalone/tests/asset-compile-cli.test.ts`
Expected: PASS.

---

### Task 6: Studio read-only MVP

**Files:**
- Create: `studio/package.json`, `vite.config.ts`, `index.html`, `src/*`, `src/components/ui/*` (shadcn primitives)
- Create: `runtimes/standalone/src/studio-prepare-cli.ts`
- Modify: `pnpm-workspace.yaml` (`studio`), root scripts `studio:prepare`, `studio:build`, `studio:dev`
- Test: `runtimes/standalone/tests/studio-prepare-cli.test.ts`, `studio/tests/studio.spec.ts` (Playwright)

- [ ] **Step 1: Implement studio data**

`studio:prepare --spec-run --html --visual-run --assets --out studio/public` writes `studio-data.json` and copies HTML. Test 8 pages/profile/catalog/findings/assets.

- [ ] **Step 2: Build Studio UI**

Use `ui-design-system` skill: three-column workbench with shadcn Button/Input/Tabs/Card/Badge/ScrollArea/Separator/Tooltip; PageTree, iframe Preview, inspector tabs; state/view selectors; no orchestration.

- [ ] **Step 3: Build + Playwright**

`pnpm --dir studio build`; Playwright: 8 pages, page switching, state/view, tabs, findings/assets, 0 console/overflow; screenshot.

---

### Task 7: Figma manual gate + docs

- [ ] **Step 1: Generate plans**

`pnpm figma:plan --spec-run /tmp/spec-v05/run-2026-10-23T06-07-48-403Z --out /tmp/figma-v06`

- [ ] **Step 2: Manual Figma build/readback**

Requires Figma desktop + plugin import; Brio MCP optional. Build 8 scratch pages; download readback; `pnpm figma:verify`; 0 blocker; delivery pages; Chinese font/Button/variables/icons/16:30 checklist.

- [ ] **Step 3: Evidence/docs**

`artifacts/employee-app-phase2/figma/` (plans, readback, diff, 8 screenshots, checklist); `handoff/assets`; CHANGELOG/roadmap/handoff/AGENTS; local commit only if authorized.

## Self-Review

- Spec coverage: Figma §5 → Tasks 1-4/7; Asset §6 → Task 5; Studio §7 → Task 6; gates §9 → all.
- No placeholders: each task has files, interfaces and concrete acceptance.
- Type consistency: `FigmaPlan`, `specId`, `FigmaReadback`, `figma:plan/verify`, `compileAssetPackage`, `studio-data`.
