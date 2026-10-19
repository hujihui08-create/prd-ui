import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  AssetReviewVerdictSchema,
  type AssetReviewVerdict,
} from "@prd-ui/asset-review";
import type { AssetReviewerInput, AssetReviewerPort } from "@prd-ui/asset-review";

const ScriptedReviewsSchema = z.record(z.string(), AssetReviewVerdictSchema);

export function parseScriptedReviews(raw: unknown): Map<string, AssetReviewVerdict> {
  const parsed = ScriptedReviewsSchema.parse(raw);
  return new Map(Object.entries(parsed));
}

export async function loadScriptedReviews(filePath: string): Promise<Map<string, AssetReviewVerdict>> {
  const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  return parseScriptedReviews(raw);
}

/**
 * Deterministic reviewer for tests/CI. A missing key is an error, never an
 * implicit pass; a scripted fixture must state every reviewed attempt.
 */
export class ScriptedReviewer implements AssetReviewerPort {
  constructor(private readonly reviews: Map<string, AssetReviewVerdict>) {}

  async review(input: AssetReviewerInput): Promise<AssetReviewVerdict> {
    const key = `${input.brief.id}/${input.candidate.source}/${input.candidate.attempt}`;
    const verdict = this.reviews.get(key);
    if (!verdict) {
      throw new Error(`SCRIPTED_REVIEW_MISSING: ${key}`);
    }
    return verdict;
  }
}
