import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RenderMetrics } from "@prd-ui/contracts";
import { measurePages } from "../src/measure/measure.js";

const SHELL_STYLE = `html,body{margin:0}
.app{display:flex;flex-direction:column;height:100vh}
.app-scroll{flex:1;overflow-y:auto;overflow-x:hidden}
.card{box-sizing:border-box;padding:16px}`;

function shell(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${SHELL_STYLE}</style></head><body>${body}</body></html>`;
}

const OVERFLOW_HTML = shell(`<div class="app" data-node-id="fixture.page.root">
  <main class="app-scroll">
    <div class="card" data-node-id="fixture.card"><span class="wide"></span></div>
  </main>
</div>
<style>.wide{display:block;width:600px;height:10px}</style>`);

const NORMAL_HTML = shell(`<div class="app" data-node-id="fixture.page.root">
  <main class="app-scroll">
    <div class="card" data-node-id="fixture.card">normal content</div>
  </main>
</div>`);

const TALL_HTML = shell(`<div class="app" data-node-id="fixture.page.root">
  <main class="app-scroll">
    <div class="card" data-node-id="fixture.card" style="height:1500px">tall content</div>
  </main>
</div>`);

let dir: string;
let metrics: RenderMetrics;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-measure-"));
  await Promise.all([
    writeFile(path.join(dir, "overflow.html"), OVERFLOW_HTML, "utf8"),
    writeFile(path.join(dir, "normal.html"), NORMAL_HTML, "utf8"),
    writeFile(path.join(dir, "tall.html"), TALL_HTML, "utf8"),
  ]);
  metrics = await measurePages({
    htmlDir: dir,
    project: "fixture",
    pages: [
      { pageId: "overflow", target: "mobile" },
      { pageId: "normal", target: "mobile" },
      { pageId: "tall", target: "mobile" },
    ],
  });
}, 120_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function page(pageId: string) {
  const found = metrics.pages.find((entry) => entry.pageId === pageId);
  if (found === undefined) throw new Error(`missing measured page: ${pageId}`);
  return found;
}

describe("measurePages", () => {
  it("detects an unlabeled child wider than the viewport", () => {
    const overflow = page("overflow");
    expect(overflow.widest.overflowX).toBe(true);
    expect(overflow.widest.width).toBe(600);
    // The widest element has no node id, so the nearest labeled ancestor wins.
    expect(overflow.widest.specId).toBe("fixture.card");
  });

  it("reports no overflow for a normal page", () => {
    const normal = page("normal");
    expect(normal.widest.overflowX).toBe(false);
    expect(normal.widest.width).toBe(390);
    expect(normal.widest.specId).toBe("fixture.page.root");
    expect(normal.contentHeight).toBe(844);
    expect(normal.documentHeight).toBe(844);
  });

  it("keeps raw content height separate from the budgeted height", () => {
    const tall = page("tall");
    expect(tall.contentHeight).toBe(1500);
    expect(tall.documentHeight).toBe(1500);
    expect(tall.scrollContainer.scrollHeight).toBe(1500);
  });
});
