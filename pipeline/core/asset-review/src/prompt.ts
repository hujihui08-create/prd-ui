import { z } from "zod";
import {
  AssetReviewVerdictSchema,
  type AssetBrief,
  type AssetCandidate,
  type HardGateResult,
} from "./contracts.js";
import type { VisualStyle } from "./ports.js";

export interface ReviewPromptInput {
  brief: AssetBrief;
  style: VisualStyle;
  candidate: AssetCandidate;
  hardGate: HardGateResult;
  assetText: string;
}

export function reviewVerdictJsonSchema(): string {
  return JSON.stringify(z.toJSONSchema(AssetReviewVerdictSchema), null, 2);
}

/** The reviewer sees provenance but never the producer's cost or prompt. */
function candidateView(candidate: AssetCandidate): Record<string, unknown> {
  return {
    assetId: candidate.assetId,
    source: candidate.source,
    sourceTier: candidate.sourceTier,
    attempt: candidate.attempt,
    file: candidate.file,
    producer: {
      tool: candidate.producer.tool,
      model: candidate.producer.model,
      seed: candidate.producer.seed,
      references: candidate.producer.references,
    },
    license: candidate.license,
    producedAt: candidate.producedAt,
  };
}

export function buildReviewPrompt(input: ReviewPromptInput): string {
  const { brief, style, candidate, hardGate, assetText } = input;
  return [
    "You are an independent asset reviewer for a PRD → UI pipeline.",
    "Review only the candidate against the brief, style pack and hard gate result.",
    "Do not infer or use the producer's prompt, cost, or reasoning.",
    "You must not rewrite the asset; you only return a verdict.",
    "",
    "## Brief",
    JSON.stringify(brief, null, 2),
    "",
    "## Style",
    JSON.stringify(style, null, 2),
    "",
    "## Candidate",
    JSON.stringify(candidateView(candidate), null, 2),
    "",
    "## Hard gate",
    JSON.stringify(hardGate, null, 2),
    "",
    "## Asset source",
    "```svg",
    assetText,
    "```",
    "",
    "## Scoring",
    "- scores are integers 1..5 for brandFit, semantics, consistency, editability, composition.",
    "- Any dimension < 4 is not a pass.",
    "- Average must be >= 4.5; brand-critical assets require >= 4.8.",
    "- A non-empty hardIssues array forces fallback.",
    "- verdict: pass | retry | fallback.",
    "- retry means the same source can fix it (prompt/scene/composition).",
    "- fallback means this source cannot satisfy the brief.",
    "",
    "Return ONLY one JSON object matching this JSON Schema; no markdown, no prose:",
    reviewVerdictJsonSchema(),
  ].join("\n");
}
