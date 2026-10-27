import { describe, expect, it } from "vitest";
import {
  buildHandoffManifest,
  validateHandoff,
  type HandoffInput,
} from "../src/index.js";

function input(): HandoffInput {
  return {
    project: "employee-app-phase2",
    generatedAt: "2026-10-26T00:00:00.000Z",
    pipelineVersion: "0.7.0",
    profile: "b-mobile",
    catalog: "b-mobile",
    pages: ["today", "appointment-list"],
    files: [
      { path: "html/today.html", sha256: "sha256:a", bytes: 10 },
      { path: "spec/page-spec/today.json", sha256: "sha256:b", bytes: 10 },
      { path: "html/appointment-list.html", sha256: "sha256:c", bytes: 10 },
      { path: "spec/page-spec/appointment-list.json", sha256: "sha256:d", bytes: 10 },
    ],
    gates: {
      verify: { passed: true, hash: "sha256:v" },
      conformance: { passed: true, hash: "sha256:c" },
      parity: { passed: true, hash: "sha256:p" },
      figmaSign: { passed: true, hash: "sha256:f" },
      visualSign: { passed: true, hash: "sha256:s" },
    },
    signoffs: [
      { type: "figma", signedBy: "tester", signedAt: "2026-10-26", hash: "sha256:f" },
      { type: "visual", signedBy: "tester", signedAt: "2026-10-26", hash: "sha256:s" },
    ],
    figma: {
      files: [{ pageId: "today", fileKey: "abc" }],
      pages: ["today", "appointment-list"],
    },
    assets: [],
    knownGaps: [],
  };
}

describe("handoff core", () => {
  it("accepts a complete input", () => {
    expect(validateHandoff(input())).toHaveLength(0);
    const manifest = buildHandoffManifest(input());
    expect(manifest.pages).toHaveLength(2);
    expect(manifest.files).toHaveLength(4);
  });

  it("rejects a failed gate", () => {
    const data = input();
    data.gates.parity = { passed: false, hash: "sha256:p" };
    expect(validateHandoff(data).some((issue) => issue.code === "HANDOFF_GATE_FAILED")).toBe(true);
  });

  it("rejects a missing page file", () => {
    const data = input();
    data.files = data.files.filter((file) => !file.path.includes("today"));
    expect(validateHandoff(data).some((issue) => issue.code === "HANDOFF_PAGE_MISSING")).toBe(true);
  });

  it("rejects a signoff hash mismatch", () => {
    const data = input();
    data.signoffs[0]!.hash = "sha256:wrong";
    expect(validateHandoff(data).some((issue) => issue.code === "HANDOFF_SIGNOFF_STALE")).toBe(true);
  });

  it("rejects a missing signoff", () => {
    const data = input();
    data.signoffs = data.signoffs.filter((signoff) => signoff.type !== "figma");
    expect(
      validateHandoff(data).some((issue) => issue.code === "HANDOFF_SIGNOFF_MISSING")
    ).toBe(true);
  });

  it("rejects an asset without a license", () => {
    const data = input();
    data.assets = [{ path: "assets/icon.svg", license: "" }];
    expect(validateHandoff(data).some((issue) => issue.code === "HANDOFF_LICENSE_MISSING")).toBe(true);
  });

  it("omits assets from the manifest and keeps the archive when provided", () => {
    const data = input();
    data.assets = [{ path: "assets/icon.svg", license: "CC0-1.0" }];
    data.archive = { path: "handoff.zip", sha256: "sha256:z", bytes: 100 };
    expect(validateHandoff(data)).toHaveLength(0);
    const manifest = buildHandoffManifest(data);
    expect(manifest.schemaVersion).toBe("1.0");
    expect("assets" in manifest).toBe(false);
    expect(manifest.archive).toEqual(data.archive);
  });
});
