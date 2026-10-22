import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { VisualCritique } from "@prd-ui/agents";
import type { AgentUsage } from "@prd-ui/contracts";
import type { VisualFinding } from "@prd-ui/visual-review";
import { critiqueToVisualFindings } from "./critic.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);

export const DEFAULT_CRITIQUE_CACHE_DIR = path.join(
  pipelineRoot,
  ".visual-cache",
  "critiques"
);

export interface CritiqueCacheSignoff {
  text: string;
  signer: string;
  date: string;
  manifestHash: string;
  findingsHash: string;
  waivedFindings: string[];
}

export interface CritiqueCacheEntry {
  schemaVersion: "1.0";
  key: string;
  createdAt: string;
  manifestHash: string;
  specHash: string;
  runtime: "standalone" | "dsh";
  profile: string | null;
  model: string | null;
  critique: VisualCritique;
  findings: VisualFinding[];
  usage?: AgentUsage;
  usageComplete: boolean;
  costCny: number;
  costSource?: string;
  budgetEnforced?: boolean;
  signoff: CritiqueCacheSignoff;
}

export function critiqueCacheKey(input: {
  manifestHash: string;
  specHash: string;
  runtime: "standalone" | "dsh";
  profile: string | null;
  model: string | null;
}): string {
  const key = JSON.stringify({
    manifestHash: input.manifestHash,
    specHash: input.specHash,
    runtime: input.runtime,
    profile: input.profile,
    model: input.model,
  });
  return `sha256:${createHash("sha256").update(key, "utf8").digest("hex")}`;
}

export function cacheFilePath(cacheDir: string, key: string): string {
  const name = key.replace(/^sha256:/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(cacheDir, `${name}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntry(raw: unknown, source: string): CritiqueCacheEntry {
  if (!isRecord(raw) || raw.schemaVersion !== "1.0") {
    throw new Error(`CRITIQUE_CACHE_INVALID: ${source}`);
  }
  const signoff = raw.signoff;
  if (
    !isRecord(signoff) ||
    typeof signoff.text !== "string" ||
    typeof signoff.signer !== "string" ||
    typeof signoff.date !== "string" ||
    typeof signoff.manifestHash !== "string" ||
    typeof signoff.findingsHash !== "string" ||
    !Array.isArray(signoff.waivedFindings)
  ) {
    throw new Error(`CRITIQUE_CACHE_INVALID: ${source}: signoff`);
  }
  if (
    typeof raw.key !== "string" ||
    typeof raw.manifestHash !== "string" ||
    typeof raw.specHash !== "string" ||
    (raw.runtime !== "standalone" && raw.runtime !== "dsh") ||
    (raw.profile !== null && typeof raw.profile !== "string") ||
    (raw.model !== null && typeof raw.model !== "string") ||
    !isRecord(raw.critique) ||
    !Array.isArray(raw.findings) ||
    typeof raw.usageComplete !== "boolean" ||
    typeof raw.costCny !== "number"
  ) {
    throw new Error(`CRITIQUE_CACHE_INVALID: ${source}`);
  }
  return raw as unknown as CritiqueCacheEntry;
}

export async function readCritiqueCache(
  cacheDir: string,
  key: string
): Promise<CritiqueCacheEntry | undefined> {
  const file = cacheFilePath(cacheDir, key);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  return parseEntry(JSON.parse(text) as unknown, file);
}

export async function writeCritiqueCache(
  cacheDir: string,
  entry: CritiqueCacheEntry
): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  const file = cacheFilePath(cacheDir, entry.key);
  await writeFile(file, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
}

export function defaultCacheDir(): string {
  return process.env.PRD_UI_VISUAL_CACHE_DIR ?? DEFAULT_CRITIQUE_CACHE_DIR;
}

/**
 * Seed the cache from an already signed run whose screenshot manifest matches
 * the current render. Hidden-only Page Spec changes may alter the spec hash
 * without changing pixels; the human-approved critique is still valid for the
 * exact manifest, so it can be copied under the new cache key.
 */
export async function seedCritiqueCacheFromRun(input: {
  runDir: string;
  cacheDir: string;
  key: string;
  manifestHash: string;
  specHash: string;
}): Promise<boolean> {
  let review: unknown;
  let critic: unknown;
  let signoffText: string;
  try {
    review = JSON.parse(
      await readFile(path.join(input.runDir, "visual-review.json"), "utf8")
    ) as unknown;
    critic = JSON.parse(
      await readFile(
        path.join(input.runDir, "findings", "visual-critic.json"),
        "utf8"
      )
    ) as unknown;
    signoffText = await readFile(
      path.join(input.runDir, "signoff", "visual.md"),
      "utf8"
    );
  } catch {
    return false;
  }
  if (!isRecord(review) || !isRecord(critic)) return false;
  if (review.manifestHash !== input.manifestHash) return false;
  const critique = critic.critique;
  if (!isRecord(critique)) return false;
  const signoff = review.signoff;
  if (
    !isRecord(signoff) ||
    signoff.valid !== true ||
    typeof signoff.signer !== "string" ||
    typeof signoff.date !== "string"
  ) {
    return false;
  }
  const runtime = isRecord(review.critic) ? review.critic.runtime : undefined;
  if (runtime !== "standalone" && runtime !== "dsh") return false;
  const profile = isRecord(review.critic) ? review.critic.profile : undefined;
  const model = isRecord(review.critic) ? review.critic.model : undefined;
  const findingsHash = review.findingsHash;
  if (typeof findingsHash !== "string") return false;
  const entry: CritiqueCacheEntry = {
    schemaVersion: "1.0",
    key: input.key,
    createdAt: new Date().toISOString(),
    manifestHash: input.manifestHash,
    specHash: input.specHash,
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
    signoff: {
      text: signoffText,
      signer: signoff.signer,
      date: signoff.date,
      manifestHash: input.manifestHash,
      findingsHash,
      waivedFindings: Array.isArray(signoff.waivedFindings)
        ? signoff.waivedFindings.filter(
            (value): value is string => typeof value === "string"
          )
        : [],
    },
  };
  await writeCritiqueCache(input.cacheDir, entry);
  return true;
}
