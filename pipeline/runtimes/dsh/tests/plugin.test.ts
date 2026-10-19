import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { apply, type ToolDefinitionLike } from "../src/plugin.js";

const validIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 3l9 6.5V21H3z"/></svg>`;

const brief = {
  id: "icon-home",
  kind: "icon",
  scene: "home",
  styleRef: "b-mobile",
  size: { width: 24, height: 24 },
  format: "svg",
  constraints: { grid: 24, strokeWidth: 1.5 },
  sourceChain: ["library"],
};

const verdict = {
  verdict: "pass",
  hardIssues: [],
  scores: { brandFit: 5, semantics: 5, consistency: 4, editability: 4, composition: 5 },
  suggestedChanges: [],
  reason: "ok",
};

const temporaryDirs: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup(): Promise<{ runDir: string; definitions: ToolDefinitionLike[] }> {
  const runDir = await mkdtemp(path.join(os.tmpdir(), "prd-ui-plugin-"));
  temporaryDirs.push(runDir);
  await mkdir(path.join(runDir, "briefs"), { recursive: true });
  await writeFile(path.join(runDir, "briefs", "icon-home.json"), JSON.stringify(brief));
  const definitions: ToolDefinitionLike[] = [];
  apply({ tools: { register: (definition) => definitions.push(definition) } }, { runDir });
  return { runDir, definitions };
}

describe("dsh asset plugin", () => {
  it("registers four deterministic tools", async () => {
    const { definitions } = await setup();
    expect(definitions.map((definition) => definition.name)).toEqual([
      "read_asset_brief",
      "normalize_svg",
      "validate_icon",
      "score_asset",
    ]);
  });

  it("reads a brief and rejects path traversal", async () => {
    const { definitions } = await setup();
    const read = definitions.find((definition) => definition.name === "read_asset_brief")!;
    const result = (await read.execute({ path: "briefs/icon-home.json" })) as {
      brief: { id: string };
    };
    expect(result.brief.id).toBe("icon-home");
    await expect(read.execute({ path: "../escape.json" })).rejects.toThrow(/escapes/);
  });

  it("validates an icon with the core gate", async () => {
    const { definitions } = await setup();
    const validate = definitions.find((definition) => definition.name === "validate_icon")!;
    const result = (await validate.execute({
      svg: validIcon,
      briefPath: "briefs/icon-home.json",
    })) as { gate: { passed: boolean } };
    expect(result.gate.passed).toBe(true);
  });

  it("downgrades an inconsistent pass verdict", async () => {
    const { definitions } = await setup();
    const score = definitions.find((definition) => definition.name === "score_asset")!;
    const result = (await score.execute({
      verdict: { ...verdict, scores: { brandFit: 4, semantics: 4, consistency: 4, editability: 4, composition: 4 } },
    })) as { verdict: { verdict: string }; inconsistencies: string[] };
    expect(result.verdict.verdict).toBe("retry");
    expect(result.inconsistencies).toContain("AVERAGE_BELOW_MIN");
  });

  it("forces fallback when hard issues are present", async () => {
    const { definitions } = await setup();
    const score = definitions.find((definition) => definition.name === "score_asset")!;
    const result = (await score.execute({
      verdict: { ...verdict, hardIssues: ["embedded text"] },
    })) as { verdict: { verdict: string } };
    expect(result.verdict.verdict).toBe("fallback");
  });
});
