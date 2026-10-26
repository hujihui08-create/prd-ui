import { describe, expect, it } from "vitest";
import type { FigmaPlan, FigmaPlanNode, StyleManifest } from "@prd-ui/contracts";
import { assertManifestUsable, parseArgs } from "../src/figma-conformance-cli.js";

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
