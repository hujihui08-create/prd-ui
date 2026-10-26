import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FigmaPlan, FigmaPlanNode, StyleManifest } from "@prd-ui/contracts";
import { assertManifestUsable, parseArgs } from "../src/figma-conformance-cli.js";
import { captureStyleManifests } from "../src/conformance/capture.js";

const fixtureRoot: FigmaPlanNode = {
  specId: "fixture.root",
  type: "FRAME",
  name: "Root",
  layoutMode: "VERTICAL",
  children: [],
  origin: "spec",
  mapping: "mapped",
};

function fixturePlan(status: "mapped" | "skipped"): FigmaPlan {
  return {
    schemaVersion: "1.0",
    project: "fixture",
    pageId: "fixture",
    pageName: "Fixture",
    width: 390,
    height: 844,
    background: "color/surface/default",
    tokens: { "color/surface/default": "#FFFFFF" },
    textStyles: {},
    components: { Button: { variants: {} } },
    coverage: {
      nodes: [{ specId: "fixture.root", specType: "MobileShell", path: "layout", status }],
      summary: {
        spec: 1,
        derived: 0,
        mapped: status === "mapped" ? 1 : 0,
        degraded: 0,
        unmapped: 0,
        skipped: status === "skipped" ? 1 : 0,
      },
    },
    root: fixtureRoot,
    stats: { frames: 1, texts: 0, instances: 0, icons: 0, images: 0 },
  };
}

function emptyManifest(): StyleManifest {
  return {
    schemaVersion: "1.0",
    pageId: "fixture",
    viewport: { width: 390, height: 844 },
    capturedAt: "2026-10-26T00:00:00.000Z",
    nodes: [],
  };
}

describe("figma:conformance args", () => {
  it("parses the required paths", () => {
    const options = parseArgs([
      "--spec-run", "/tmp/spec",
      "--html", "/tmp/html",
      "--plans", "/tmp/plans",
      "--out", "/tmp/out",
    ]);
    expect(options.specRun).toBe("/tmp/spec");
    expect(options.html).toBe("/tmp/html");
    expect(options.plans).toBe("/tmp/plans");
    expect(options.out).toBe("/tmp/out");
  });

  it("rejects an unknown flag", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
  });
});

describe("figma:conformance manifest guard", () => {
  it("rejects a zero-node manifest when the plan has visible nodes", () => {
    expect(() => assertManifestUsable(emptyManifest(), fixturePlan("mapped"))).toThrow(
      /CONFORMANCE_MANIFEST_EMPTY: fixture/
    );
  });

  it("allows a zero-node manifest when every plan node is skipped", () => {
    expect(() => assertManifestUsable(emptyManifest(), fixturePlan("skipped"))).not.toThrow();
  });
});

describe("conformance style capture", () => {
  it("skips non-rendered nodes and keeps offscreen or empty-boxed ones", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-capture-"));
    try {
      await writeFile(
        path.join(dir, "fixture.html"),
        `<!doctype html><html><head><style>
          body{margin:0}
          .offscreen{position:absolute;top:2000px;left:0;width:10px;height:10px}
        </style></head><body>
          <div data-node-id="visible">visible</div>
          <div data-node-id="display-none" style="display:none">x</div>
          <div data-node-id="visibility-hidden" style="visibility:hidden">x</div>
          <div data-node-id="hidden-attr" hidden>x</div>
          <div data-node-id="display-contents" style="display:contents">x</div>
          <div class="offscreen" data-node-id="offscreen">x</div>
          <div data-node-id="empty-visible"></div>
        </body></html>`,
        "utf8"
      );
      const [manifest] = await captureStyleManifests({
        htmlDir: dir,
        pages: [{ pageId: "fixture", viewport: { width: 390, height: 844 } }],
      });
      expect(manifest).toBeDefined();
      expect(manifest!.nodes.map((node) => node.specId).sort()).toEqual([
        "empty-visible",
        "offscreen",
        "visible",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
