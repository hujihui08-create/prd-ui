# Studio

Read-only workbench for a completed pipeline run. Run `pnpm studio:prepare` from
`pipeline/` to write `public/studio-data.json` and copy `public/html/`, then
`pnpm studio:dev` or `pnpm studio:build`.

The app uses local shadcn-style primitives (`src/components/ui/*`) with Tailwind
v4 and lucide-react. It never orchestrates agents or writes run artifacts.
