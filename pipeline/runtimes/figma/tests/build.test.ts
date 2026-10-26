import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

describe("figma plugin build", () => {
  it("bundles a browser-only plugin and copies the UI", () => {
    execFileSync("pnpm", ["build"], { cwd: root, stdio: "pipe" });
    const codePath = path.join(root, "dist", "code.js");
    const uiPath = path.join(root, "dist", "ui.html");
    expect(existsSync(codePath)).toBe(true);
    expect(existsSync(uiPath)).toBe(true);
    const code = readFileSync(codePath, "utf8");
    expect(code).not.toMatch(/\bfrom\s+["']node:/);
    expect(code).not.toMatch(/\brequire\(["']fs["']\)/);
    expect(code).toContain("figma.showUI");
    const manifest = JSON.parse(
      readFileSync(path.join(root, "manifest.json"), "utf8")
    ) as { main: string; ui: string };
    expect(manifest.main).toBe("dist/code.js");
    expect(manifest.ui).toBe("dist/ui.html");
  }, 60_000);
});
