import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSignoffMarkdown } from "@prd-ui/agents";
import type { IaOutput } from "@prd-ui/agents";
import type {
  NormalizedPrd,
  PrdReviewOutput,
  UiBriefDraft,
} from "@prd-ui/contracts";
import { normalizePrd } from "../src/normalize.js";

const pipelineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const now = "2026-10-20T00:00:00.000Z";

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(path.join(pipelineRoot, relative), "utf8")) as unknown;
}

function readFixture(role: string): unknown {
  return (readJson(`samples/agents/intake/${role}.json`) as { output: unknown }).output;
}

export const prdText = readFileSync(
  path.join(pipelineRoot, "samples", "sample-prd.md"),
  "utf8"
);

export const prdHash = "sha256:test-prd";
export const project = "demo-orders";

export const normalized: NormalizedPrd = normalizePrd({
  prdText,
  project,
  sourcePath: "samples/sample-prd.md",
  sourceHash: prdHash,
  generatedAt: now,
});

export const review = readFixture("prd-review") as PrdReviewOutput;
export const iaOutput = readFixture("ia") as IaOutput;
export const draft = readFixture("ui-briefer") as UiBriefDraft;

export const validPrdSignoff = parseSignoffMarkdown(`# PRD/IA signoff

<!-- signoff
{
  "signer": "Test Reviewer",
  "date": "2026-10-20",
  "answers": [],
  "waivers": [],
  "approvals": []
}
-->
`);

export function briefSignoff(hash: string, waivers: unknown[] = []) {
  return parseSignoffMarkdown(`# Brief signoff

<!-- signoff
{
  "signer": "Test Reviewer",
  "date": "2026-10-20",
  "briefHash": ${JSON.stringify(hash)},
  "answers": [],
  "waivers": ${JSON.stringify(waivers)},
  "approvals": []
}
-->
`);
}

export function withBrief(
  mutate: (brief: UiBriefDraft["brief"]) => UiBriefDraft["brief"]
): UiBriefDraft {
  return { ...draft, brief: mutate(structuredClone(draft.brief)) };
}
