import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UiBriefSchema } from "@prd-ui/contracts";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { compileProject } from "../src/index.js";
import { assembleBlocks, splitBlocks, verifyBlockManifest } from "../src/blocks.js";

const brief = UiBriefSchema.parse(
  JSON.parse(readFileSync("samples/projects/employee-app-phase2/ui-brief.json", "utf8"))
);
const specs = compileProject(brief, { getProfile, getCatalog, getArchetype });

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${key}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

describe("blocks", () => {
  it("splits and reassembles every phase2 page without changing the tree", () => {
    for (const spec of specs) {
      const manifest = splitBlocks(spec, getArchetype(spec.meta.archetype));
      expect(manifest.blocks.length, spec.meta.pageId).toBeGreaterThan(0);
      const assembled = assembleBlocks(spec, manifest);
      expect(canonical(assembled), spec.meta.pageId).toBe(canonical(spec));
      expect(verifyBlockManifest(spec, manifest)).toHaveLength(0);
    }
  });

  it("keeps the page shell and actions out of blocks", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = splitBlocks(today, getArchetype(today.meta.archetype));
    for (const block of manifest.blocks) {
      expect(block.slot).not.toBe("actions");
      expect(block.slot).not.toBe("top-bar");
      expect(block.slot).not.toBe("bottom-nav");
      expect(block.root.type).not.toBe("MobileShell");
    }
  });

  it("splits today into multiple card blocks", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = splitBlocks(today, getArchetype(today.meta.archetype));
    expect(manifest.blocks.length).toBeGreaterThanOrEqual(2);
  });

  it("records the single content Section as an assembly wrapper", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = splitBlocks(today, getArchetype(today.meta.archetype));
    expect(manifest.shell.wrappers).toMatchObject([
      { slot: "content", specId: "today.root.content.0", type: "Section" },
    ]);
    expect(manifest.blocks.map((block) => block.root.type)).toEqual(["Card", "Card", "Card"]);
  });

  it("does not alias block roots into the assembled page", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = splitBlocks(today, getArchetype(today.meta.archetype));
    const specBefore = canonical(today);
    const manifestBefore = canonical(manifest);
    const assembled = assembleBlocks(today, manifest);
    const block = assembled.layout.slots!.content![0]!.children![0]!;
    block.props = { title: "mutated" };
    block.children![0]!.id = "mutated-id";
    expect(canonical(today)).toBe(specBefore);
    expect(canonical(manifest)).toBe(manifestBefore);
  });

  it("rejects duplicate node ids across blocks", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = structuredClone(splitBlocks(today, getArchetype(today.meta.archetype)));
    manifest.blocks[1]!.root.id = manifest.blocks[0]!.root.id;
    const findings = verifyBlockManifest(today, manifest);
    expect(findings.some((finding) => finding.ruleId === "BLOCK_DUPLICATE_ID")).toBe(true);
  });

  it("rejects blocks whose order does not match the page", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = structuredClone(splitBlocks(today, getArchetype(today.meta.archetype)));
    manifest.blocks[0]!.index = 1;
    manifest.blocks[1]!.index = 0;
    const findings = verifyBlockManifest(today, manifest);
    expect(findings.some((finding) => finding.ruleId === "BLOCK_ORDER")).toBe(true);
  });

  it("rejects a block that contains the mobile shell", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = structuredClone(splitBlocks(today, getArchetype(today.meta.archetype)));
    manifest.blocks[0]!.root = structuredClone(today.layout);
    const findings = verifyBlockManifest(today, manifest);
    expect(findings.some((finding) => finding.ruleId === "BLOCK_SHELL_TYPE")).toBe(true);
  });
});
