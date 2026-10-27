import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UiBriefSchema } from "@prd-ui/contracts";
import { getArchetype, getCatalog, getProfile } from "@prd-ui/design-system";
import { compileProject } from "../src/index.js";
import {
  assembleBlocks,
  splitBlocks,
  verifyBlockContracts,
  verifyBlockManifest,
} from "../src/blocks.js";

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

  it("does not alias wrapper layout props into the page spec", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const spec = structuredClone(today);
    const section = spec.layout.slots!.content![0]!;
    section.props = { ...section.props, padding: { token: "space.4" } };
    const manifest = splitBlocks(spec, getArchetype(spec.meta.archetype));
    const wrapper = manifest.shell.wrappers[0]!;
    expect(wrapper.padding).toEqual({ token: "space.4" });
    expect(wrapper.padding).not.toBe(section.props.padding);
  });

  it("handles an id-less assembly wrapper end to end", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const spec = structuredClone(today);
    const section = spec.layout.slots!.content![0]!;
    delete section.id;
    const manifest = splitBlocks(spec, getArchetype(spec.meta.archetype));
    expect(manifest.shell.wrappers).toMatchObject([
      { slot: "content", specId: "today.content.wrapper", type: "Section" },
    ]);
    expect(verifyBlockManifest(spec, manifest)).toHaveLength(0);
    expect(canonical(assembleBlocks(spec, manifest))).toBe(canonical(spec));
  });

  it("rejects duplicate node ids across blocks", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = structuredClone(splitBlocks(today, getArchetype(today.meta.archetype)));
    manifest.blocks[1]!.root.id = manifest.blocks[0]!.root.id;
    const findings = verifyBlockManifest(today, manifest);
    expect(findings.some((finding) => finding.ruleId === "BLOCK_DUPLICATE_ID")).toBe(true);
  });

  it("rejects a block that reuses a shell node id", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = structuredClone(splitBlocks(today, getArchetype(today.meta.archetype)));
    manifest.blocks[0]!.root.id = today.layout.slots!["bottom-nav"]![0]!.id;
    const findings = verifyBlockManifest(today, manifest);
    expect(findings.some((finding) => finding.ruleId === "BLOCK_DUPLICATE_ID")).toBe(true);
  });

  it("rejects a manifest with a deleted block", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = structuredClone(splitBlocks(today, getArchetype(today.meta.archetype)));
    manifest.blocks.splice(0, 1);
    const findings = verifyBlockManifest(today, manifest);
    expect(findings.some((finding) => finding.ruleId === "BLOCK_ROUNDTRIP_MISMATCH")).toBe(true);
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

  it("accepts the compiler's own block contracts", () => {
    for (const spec of specs) {
      const manifest = splitBlocks(spec, getArchetype(spec.meta.archetype));
      expect(verifyBlockContracts(spec, manifest), spec.meta.pageId).toHaveLength(0);
    }
  });

  it("rejects a component that is not in allowedComponents", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = splitBlocks(today, getArchetype(today.meta.archetype));
    const block = manifest.blocks[0]!;
    block.allowedComponents = block.allowedComponents.filter((type) => type !== block.root.type);
    const findings = verifyBlockContracts(today, manifest);
    expect(
      findings.some(
        (finding) =>
          finding.ruleId === "BLOCK_COMPONENT_NOT_ALLOWED" &&
          finding.location === block.blockId
      )
    ).toBe(true);
  });

  it("rejects an empty allowedComponents list", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = splitBlocks(today, getArchetype(today.meta.archetype));
    manifest.blocks[0]!.allowedComponents = [];
    const findings = verifyBlockContracts(today, manifest);
    expect(
      findings.some((finding) => finding.ruleId === "BLOCK_ALLOWED_COMPONENTS_EMPTY")
    ).toBe(true);
  });

  it("rejects a required state that the page does not declare", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = splitBlocks(today, getArchetype(today.meta.archetype));
    manifest.blocks[0]!.requiredStates = ["default", "not-a-state"];
    const findings = verifyBlockContracts(today, manifest);
    expect(
      findings.some(
        (finding) =>
          finding.ruleId === "BLOCK_REQUIRED_STATE_MISSING" &&
          finding.evidence === "not-a-state"
      )
    ).toBe(true);
  });

  it("rejects an empty requiredStates list", () => {
    const today = specs.find((spec) => spec.meta.pageId === "today")!;
    const manifest = splitBlocks(today, getArchetype(today.meta.archetype));
    manifest.blocks[0]!.requiredStates = [];
    const findings = verifyBlockContracts(today, manifest);
    expect(
      findings.some((finding) => finding.ruleId === "BLOCK_REQUIRED_STATES_EMPTY")
    ).toBe(true);
  });
});
