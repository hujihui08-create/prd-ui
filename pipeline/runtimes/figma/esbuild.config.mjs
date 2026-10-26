import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
await mkdir(dist, { recursive: true });
await build({
  entryPoints: [path.join(here, "src", "plugin.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  outfile: path.join(dist, "code.js"),
  logLevel: "info",
});
await copyFile(path.join(here, "src", "ui.html"), path.join(dist, "ui.html"));
