import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSignoffMarkdown } from "@prd-ui/agents";
import { redactValue } from "@prd-ui/contracts";
import { FileArtifactStore } from "./asset/artifact-store.js";
import { critiqueToVisualFindings } from "./visual/critic.js";
import {
  defaultCacheDir,
  writeCritiqueCache,
  type CritiqueCacheEntry,
  type CritiqueCacheSignoff,
} from "./visual/cache.js";
import {
  hashValue,
  parseVisualRunState,
  readVisualManifest,
  verifyManifestFiles,
  visualManifestHash,
  type VisualRunState,
} from "./visual/manifest.js";
import { validateVisualSignoff, unwaivedGate } from "./visual/signoff.js";

export const USAGE = `Usage: pnpm visual:sign --run <dir> [options]

Finalize an awaiting visual review with a human signoff. No model is called.
The signoff must carry the review's manifestHash and findingsHash.

Options:
  --run <dir>                Visual review run directory (required)
  --signoff-visual <path>    Visual signoff markdown
  --json                     Print one JSON summary to stdout
  -h, --help                 Print this help and exit`;

export interface VisualSignOptions {
  runDir?: string;
  signoffVisualPath?: string;
  json: boolean;
  help: boolean;
}

export class VisualSignUsageError extends Error {}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new VisualSignUsageError(`missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): VisualSignOptions {
  const options: VisualSignOptions = { json: false, help: false };
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
      case "--signoff-visual":
        options.signoffVisualPath = path.resolve(value());
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new VisualSignUsageError(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summary(
  state: VisualRunState,
  runDir: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return redactValue({
    runDir,
    runId: state.runId,
    project: state.project,
    status: state.status,
    signer: state.signer ?? null,
    manifestHash: state.manifestHash,
    findingsHash: state.findingsHash,
    signoff: state.signoff,
    costCny: state.costCny,
    usageComplete: state.usageComplete,
    ...extra,
  }) as Record<string, unknown>;
}

async function persistSignedCritiqueCache(input: {
  store: FileArtifactStore;
  cacheDir: string;
  signoffText: string;
  parsed: ReturnType<typeof parseSignoffMarkdown>;
  waivedFindings: string[];
  state: VisualRunState;
  manifestHash: string;
  findingsHash: string;
}): Promise<boolean> {
  let review: unknown;
  let critic: unknown;
  try {
    review = JSON.parse(await input.store.readText("visual-review.json")) as unknown;
    critic = JSON.parse(
      await input.store.readText("findings/visual-critic.json")
    ) as unknown;
  } catch {
    return false;
  }
  if (!isRecord(review) || !isRecord(critic)) return false;
  const cacheKey = review.cacheKey;
  const specHash = review.specHash;
  const runtime = isRecord(review.critic) ? review.critic.runtime : undefined;
  const profile = isRecord(review.critic) ? review.critic.profile : undefined;
  const model = isRecord(review.critic) ? review.critic.model : undefined;
  const critique = critic.critique;
  if (
    typeof cacheKey !== "string" ||
    typeof specHash !== "string" ||
    (runtime !== "standalone" && runtime !== "dsh") ||
    !isRecord(critique)
  ) {
    return false;
  }
  const parsed = input.parsed;
  if (parsed.signer === undefined || parsed.date === undefined) return false;
  const cacheSignoff: CritiqueCacheSignoff = {
    text: input.signoffText,
    signer: parsed.signer,
    date: parsed.date,
    manifestHash: input.manifestHash,
    findingsHash: input.findingsHash,
    waivedFindings: input.waivedFindings,
  };
  const entry: CritiqueCacheEntry = {
    schemaVersion: "1.0",
    key: cacheKey,
    createdAt: new Date().toISOString(),
    manifestHash: input.manifestHash,
    specHash,
    runtime,
    profile: typeof profile === "string" ? profile : null,
    model: typeof model === "string" ? model : null,
    critique: critique as CritiqueCacheEntry["critique"],
    findings: critiqueToVisualFindings(critique as CritiqueCacheEntry["critique"]),
    ...(critic.usage === undefined || critic.usage === null
      ? {}
      : { usage: critic.usage as CritiqueCacheEntry["usage"] }),
    usageComplete: critic.usageComplete === true,
    costCny: typeof critic.costCny === "number" ? critic.costCny : 0,
    ...(typeof critic.costSource === "string"
      ? { costSource: critic.costSource }
      : {}),
    ...(typeof critic.budgetEnforced === "boolean"
      ? { budgetEnforced: critic.budgetEnforced }
      : {}),
    signoff: cacheSignoff,
  };
  await writeCritiqueCache(input.cacheDir, entry);
  return true;
}

export interface VisualSignDeps {
  /** Test seam for the signed-critique cache directory. */
  cacheDir?: string;
}

export async function main(
  argv: string[],
  io: { stdout: (line: string) => void; stderr: (line: string) => void } = {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  },
  deps: VisualSignDeps = {}
): Promise<number> {
  let options: VisualSignOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (error instanceof VisualSignUsageError) {
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
    const state = parseVisualRunState(
      JSON.parse(await store.readText("state.json")) as unknown,
      path.join(runDir, "state.json")
    );

    // Evidence integrity is checked for every status, including the
    // already-successful early return: a signed run with a tampered PNG must
    // not report success.
    const manifest = await readVisualManifest(
      path.join(runDir, "screenshots", "manifest.json")
    );
    if (manifest === undefined) {
      throw new Error("STATE_INCONSISTENT: screenshots/manifest.json is missing");
    }
    const mismatches = await verifyManifestFiles(runDir, manifest);
    if (mismatches.length > 0) {
      const detail = mismatches.slice(0, 5).join("; ");
      const more =
        mismatches.length > 5 ? ` (+${mismatches.length - 5} more)` : "";
      throw new Error(`VISUAL_MANIFEST_HASH_MISMATCH: ${detail}${more}`);
    }
    const manifestHash = visualManifestHash(manifest);
    if (manifestHash !== state.manifestHash) {
      throw new Error(
        `STATE_INCONSISTENT: screenshot manifest changed (${manifestHash} != ${state.manifestHash})`
      );
    }
    const findingsHash = hashValue(state.findings);
    if (findingsHash !== state.findingsHash) {
      throw new Error(
        `STATE_INCONSISTENT: findings changed (${findingsHash} != ${state.findingsHash})`
      );
    }

    if (state.status === "success" || state.status === "passed") {
      if (!state.signoff.visual || !(await store.exists("signoff/visual.md"))) {
        throw new Error(`STATE_INCONSISTENT: ${state.status} without a visual signoff`);
      }
      if (options.json) io.stdout(JSON.stringify(summary(state, runDir)));
      else io.stdout(`Visual sign OK: already ${state.status}\nRun: ${runDir}`);
      return 0;
    }
    // A blocked run may still be signed when every blocker is a Visual Critic
    // blocker covered by a current waiver; deterministic blockers reject below.
    if (state.status !== "awaiting_signoff" && state.status !== "blocked") {
      throw new Error(`RUN_NOT_SIGNABLE: ${state.status}`);
    }
    if (
      state.status === "blocked" &&
      options.signoffVisualPath === undefined &&
      !(await store.exists("signoff/visual.md"))
    ) {
      throw new Error("RUN_BLOCKED: deterministic gates or critic blockers remain");
    }

    let text: string;
    if (options.signoffVisualPath !== undefined) {
      text = await readFile(options.signoffVisualPath, "utf8");
    } else if (await store.exists("signoff/visual.md")) {
      text = await store.readText("signoff/visual.md");
    } else {
      throw new Error("VISUAL_SIGNOFF_MISSING");
    }
    const parsed = parseSignoffMarkdown(text);
    const validation = validateVisualSignoff({
      parsed,
      findings: state.findings,
      manifestHash,
      findingsHash,
      now: new Date(),
    });
    if (!validation.ok) {
      throw new Error(validation.error ?? "VISUAL_SIGNOFF_INVALID");
    }

    await store.writeText("signoff/visual.md", text);

    const now = new Date().toISOString();
    const next: VisualRunState = {
      ...state,
      status: "success",
      stage: "done",
      signoff: { visual: true },
      ...(parsed.signer === undefined ? {} : { signer: parsed.signer }),
      updatedAt: now,
      finishedAt: now,
    };
    await store.writeJson("state.json", next);

    // Keep the review summary consistent with the signed state without
    // touching the hashed findings or manifest.
    try {
      const raw = JSON.parse(
        await store.readText("visual-review.json")
      ) as unknown;
      if (isRecord(raw)) {
        await store.writeJson("visual-review.json", {
          ...raw,
          status: "passed",
          signoff: {
            valid: true,
            signer: parsed.signer ?? null,
            date: parsed.date ?? null,
            waivedFindings: validation.waivedFindings,
          },
        });
      }
    } catch {
      // The state is authoritative; a missing summary does not block signing.
    }

    // The raw gate stays `passed: false` for the deterministic record; record
    // the waived findings and the effective unwaived result beside it so the
    // artifact cannot be read as contradicting the signed status.
    try {
      const raw = JSON.parse(
        await store.readText("findings/visual-gate.json")
      ) as unknown;
      if (isRecord(raw)) {
        await store.writeJson("findings/visual-gate.json", {
          ...raw,
          waivedFindings: validation.waivedFindings,
          unwaivedGate: unwaivedGate(state.findings, validation.waivedFindings),
        });
      }
    } catch {
      // The state is authoritative; a missing gate artifact does not block signing.
    }

    let cachePersisted = false;
    try {
      cachePersisted = await persistSignedCritiqueCache({
        store,
        cacheDir: deps.cacheDir ?? defaultCacheDir(),
        signoffText: text,
        parsed,
        waivedFindings: validation.waivedFindings,
        state: next,
        manifestHash,
        findingsHash,
      });
    } catch {
      // A cache write failure must not invalidate a valid human signoff.
    }

    await store.writeJson("visual-sign.json", {
      schemaVersion: "1.0",
      runId: next.runId,
      project: next.project,
      signedAt: now,
      status: next.status,
      signer: parsed.signer ?? null,
      date: parsed.date ?? null,
      manifestHash,
      findingsHash,
      waivedFindings: validation.waivedFindings,
      costCny: next.costCny,
      usageComplete: next.usageComplete,
      cachePersisted,
    });
    await store.appendText(
      "logs/visual.ndjson",
      `${JSON.stringify(
        redactValue({
          type: "signoff_finalized",
          runId: next.runId,
          status: next.status,
          signer: parsed.signer ?? null,
          manifestHash,
          findingsHash,
          waivedFindings: validation.waivedFindings,
          cachePersisted,
          timestamp: now,
        })
      )}\n`
    );

    if (options.json) {
      io.stdout(
        JSON.stringify(
          summary(next, runDir, {
            signedAt: now,
            date: parsed.date ?? null,
            waivedFindings: validation.waivedFindings,
          })
        )
      );
    } else {
      io.stdout("Visual sign OK: success");
      io.stdout(`Signer: ${parsed.signer ?? "unknown"}`);
      io.stdout(`Manifest: ${manifestHash}`);
      io.stdout(`Findings: ${findingsHash}`);
      if (validation.waivedFindings.length > 0) {
        io.stdout(`Waived: ${validation.waivedFindings.join(", ")}`);
      }
      io.stdout(`Run: ${runDir}`);
    }
    return 0;
  } catch (error) {
    const message = redactValue(errorMessage(error)) as string;
    if (options.json) {
      io.stdout(JSON.stringify({ runDir, status: "failed", error: message }));
    } else {
      io.stderr(`Visual sign FAILED: ${message}`);
    }
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
