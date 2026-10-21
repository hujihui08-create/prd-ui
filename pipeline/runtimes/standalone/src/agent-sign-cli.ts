import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  M1RunStateSchema,
  parseSignoffMarkdown,
  type M1RunState,
  type ParsedSignoff,
} from "@prd-ui/agents";
import { redactValue } from "@prd-ui/contracts";
import { FileArtifactStore } from "./asset/artifact-store.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

export const USAGE = `Usage: pnpm agent:sign --run <dir> [options]

Finalize an awaiting M1 run with human signoff without rerunning agents.

Options:
  --run <dir>                     M1 run directory (required)
  --signoff-visual-style <path>   Visual-style signoff markdown
  --signoff-ia <path>             IA signoff markdown (only if not already signed)
  --json                          Print one JSON summary to stdout
  -h, --help                      Print this help and exit`;

export interface AgentSignOptions {
  runDir?: string;
  signoffVisualStylePath?: string;
  signoffIaPath?: string;
  json: boolean;
  help: boolean;
}

export class AgentSignUsageError extends Error {}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new AgentSignUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): AgentSignOptions {
  const options: AgentSignOptions = { json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    const equals = argument.indexOf("=");
    const flag =
      argument.startsWith("--") && equals > 0 ? argument.slice(0, equals) : argument;
    const inlineValue =
      argument.startsWith("--") && equals > 0 ? argument.slice(equals + 1) : undefined;
    const value = (): string => inlineValue ?? readValue(argv, ++index, flag);

    switch (flag) {
      case "--run":
        options.runDir = path.resolve(value());
        break;
      case "--signoff-visual-style":
        options.signoffVisualStylePath = path.resolve(value());
        break;
      case "--signoff-ia":
        options.signoffIaPath = path.resolve(value());
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new AgentSignUsageError(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readSignoff(
  store: FileArtifactStore,
  explicitPath: string | undefined,
  runPath: string
): Promise<{ text: string; parsed: ParsedSignoff; copied: boolean } | undefined> {
  let text: string;
  let copied = false;
  if (explicitPath !== undefined) {
    text = await readFile(explicitPath, "utf8");
    copied = true;
  } else if (await store.exists(runPath)) {
    text = await store.readText(runPath);
  } else {
    return undefined;
  }
  return { text, parsed: parseSignoffMarkdown(text), copied };
}

function summary(state: M1RunState, runDir: string): Record<string, unknown> {
  return redactValue({
    runDir,
    runId: state.runId,
    project: state.project,
    status: state.status,
    gates: state.gates,
    signoff: state.signoff,
    costCny: state.costCny,
    usageComplete: state.usageComplete,
  }) as Record<string, unknown>;
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  }
): Promise<number> {
  let options: AgentSignOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof AgentSignUsageError) {
      io.stderr(error.message);
      io.stderr(USAGE);
      return 2;
    }
    throw error;
  }

  if (options.help) {
    io.stdout(USAGE);
    return 0;
  }
  if (options.runDir === undefined) {
    io.stderr("missing required --run <dir>");
    io.stderr(USAGE);
    return 2;
  }

  const runDir = options.runDir;
  const store = new FileArtifactStore(runDir);

  try {
    const state = M1RunStateSchema.parse(
      JSON.parse(await store.readText("state.json")) as unknown
    );

    if (state.status === "success") {
      if (!state.signoff.visualStyle) {
        throw new Error("STATE_INCONSISTENT: success without visual-style signoff");
      }
      if (options.json) io.stdout(JSON.stringify(summary(state, runDir)));
      else io.stdout(`Agent sign OK: already success\nRun: ${runDir}`);
      return 0;
    }
    if (state.status !== "awaiting_signoff") {
      throw new Error(`RUN_NOT_AWAITING_SIGNOFF: ${state.status}`);
    }
    if (!["passed", "waived"].includes(state.gates.ia)) {
      throw new Error(`IA_GATE_NOT_PASSED: ${state.gates.ia}`);
    }
    if (!["passed", "waived"].includes(state.gates.visualStyle)) {
      throw new Error(`VISUAL_STYLE_GATE_NOT_PASSED: ${state.gates.visualStyle}`);
    }

    let signoffIa = state.signoff.ia;
    if (!signoffIa) {
      const ia = await readSignoff(store, options.signoffIaPath, "signoff/ia.md");
      if (ia === undefined || !ia.parsed.valid) {
        throw new Error(
          `IA_SIGNOFF_INVALID: ${ia?.parsed.error ?? "signoff/ia.md missing"}`
        );
      }
      await store.writeText("signoff/ia.md", ia.text);
      signoffIa = true;
    }

    const visual = await readSignoff(
      store,
      options.signoffVisualStylePath,
      "signoff/visual-style.md"
    );
    if (visual === undefined) {
      throw new Error("VISUAL_STYLE_SIGNOFF_MISSING");
    }
    if (!visual.parsed.valid) {
      throw new Error(`VISUAL_STYLE_SIGNOFF_INVALID: ${visual.parsed.error ?? "invalid"}`);
    }
    if (visual.copied) {
      await store.writeText("signoff/visual-style.md", visual.text);
    }

    const now = new Date().toISOString();
    const next = M1RunStateSchema.parse({
      ...state,
      status: "success",
      stage: "done",
      signoff: { ia: true, visualStyle: true },
      updatedAt: now,
      finishedAt: state.finishedAt ?? now,
    });
    await store.writeJson("state.json", next);
    await store.writeJson("agent-sign.json", {
      schemaVersion: "1.0",
      runId: next.runId,
      project: next.project,
      signedAt: now,
      gates: next.gates,
      signoff: next.signoff,
      costCny: next.costCny,
      usageComplete: next.usageComplete,
    });
    await store.appendText(
      "logs/agent.ndjson",
      `${JSON.stringify(
        redactValue({
          type: "signoff_finalized",
          runId: next.runId,
          status: next.status,
          signoff: next.signoff,
          timestamp: now,
        })
      )}\n`
    );

    if (options.json) {
      io.stdout(JSON.stringify(summary(next, runDir)));
    } else {
      io.stdout(`Agent sign OK: success`);
      io.stdout(`Signoff: ia=${next.signoff.ia} visual-style=${next.signoff.visualStyle}`);
      io.stdout(`Run: ${runDir}`);
    }
    return 0;
  } catch (error) {
    const message = redactValue(errorMessage(error)) as string;
    if (options.json) io.stdout(JSON.stringify({ runDir, status: "failed", error: message }));
    else io.stderr(`Agent sign FAILED: ${message}`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain = invokedPath === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
