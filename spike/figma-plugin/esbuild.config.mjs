// spike/figma-plugin/esbuild.config.mjs
import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/code.ts"],
  bundle: true,
  outfile: "dist/code.js",
  target: "es2017",
  format: "iife",
  loader: { ".json": "json" },
});
