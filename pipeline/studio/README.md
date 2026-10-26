# Studio

Read-only workbench for a completed pipeline run. Run `pnpm studio:prepare` from
`pipeline/` to write `public/studio-data.json` and copy `public/html/`, then
`pnpm studio:dev` or `pnpm studio:build`.

After a build, `pnpm studio:smoke` serves `studio/dist` and drives headless
Chromium through the page tree: it asserts every page switches its iframe and
fails on browser console/page errors. `pnpm studio:smoke --json` prints
`{"ok":true,"pages":8,"iframes":8,...}` for CI or handoff evidence. If Chromium
is missing, install it with
`pnpm --dir runtimes/standalone exec playwright install chromium`.

The app uses local shadcn-style primitives (`src/components/ui/*`) with Tailwind
v4 and lucide-react. It never orchestrates agents or writes run artifacts.
