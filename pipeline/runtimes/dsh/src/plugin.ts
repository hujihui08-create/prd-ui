import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AssetBriefSchema,
  AssetReviewVerdictSchema,
  checkIcon,
  normalizeSvg,
  validateVerdict,
} from "@prd-ui/asset-review";

export const name = "prd-ui-assets";
export const inject = ["tools"];

export interface PluginConfig {
  runDir?: string;
}

export interface ToolDefinitionLike {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output: {
    schema: Record<string, unknown>;
    render: (args: unknown, value: unknown) => Array<{ type: "text"; text: string }>;
  };
  execute: (args: unknown) => Promise<unknown>;
}

export interface PluginContext {
  tools: { register(definition: ToolDefinitionLike): void };
}

const textOutput = {
  schema: { type: "object", additionalProperties: true },
  render: (_args: unknown, value: unknown) => [
    { type: "text" as const, text: JSON.stringify(value) },
  ],
};

function resolveRunPath(runDir: string, relativePath: string): string {
  const absolute = path.resolve(runDir, relativePath);
  if (absolute !== runDir && !absolute.startsWith(`${runDir}${path.sep}`)) {
    throw new Error(`tool path escapes the run directory: ${relativePath}`);
  }
  return absolute;
}

async function readBrief(runDir: string, relativePath: string) {
  const raw = JSON.parse(await readFile(resolveRunPath(runDir, relativePath), "utf8")) as unknown;
  return AssetBriefSchema.parse(raw);
}

/**
 * Tools are deliberately deterministic. The model reviews; it does not get to
 * rewrite the verdict schema or the thresholds.
 */
export function apply(ctx: PluginContext, config: PluginConfig = {}): void {
  const runDir = path.resolve(config.runDir ?? process.env.PRD_UI_RUN_DIR ?? process.cwd());

  ctx.tools.register({
    name: "read_asset_brief",
    description: "Read and validate an asset brief JSON file from the run directory.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the run directory." },
      },
      required: ["path"],
      additionalProperties: false,
    },
    output: textOutput,
    execute: async (args) => {
      const input = args as { path: string };
      return { brief: await readBrief(runDir, input.path) };
    },
  });

  ctx.tools.register({
    name: "normalize_svg",
    description: "Normalize an SVG string with the core deterministic normalizer.",
    parameters: {
      type: "object",
      properties: { svg: { type: "string" } },
      required: ["svg"],
      additionalProperties: false,
    },
    output: textOutput,
    execute: async (args) => {
      const input = args as { svg: string };
      return { normalized: normalizeSvg(input.svg) };
    },
  });

  ctx.tools.register({
    name: "validate_icon",
    description: "Run the core icon hard gate against an SVG and a brief.",
    parameters: {
      type: "object",
      properties: {
        svg: { type: "string" },
        briefPath: { type: "string", description: "Brief path relative to the run directory." },
      },
      required: ["svg", "briefPath"],
      additionalProperties: false,
    },
    output: textOutput,
    execute: async (args) => {
      const input = args as { svg: string; briefPath: string };
      const brief = await readBrief(runDir, input.briefPath);
      return { gate: checkIcon(input.svg, brief) };
    },
  });

  ctx.tools.register({
    name: "score_asset",
    description:
      "Validate a reviewer verdict against the core schema and thresholds. It never generates scores.",
    parameters: {
      type: "object",
      properties: {
        verdict: { type: "object", additionalProperties: true },
        brandCritical: { type: "boolean" },
      },
      required: ["verdict"],
      additionalProperties: false,
    },
    output: textOutput,
    execute: async (args) => {
      const input = args as { verdict: unknown; brandCritical?: boolean };
      const verdict = AssetReviewVerdictSchema.parse(input.verdict);
      const check = validateVerdict(verdict, {
        brandCritical: input.brandCritical ?? false,
      });
      return { verdict: check.verdict, inconsistencies: check.inconsistencies };
    },
  });
}
