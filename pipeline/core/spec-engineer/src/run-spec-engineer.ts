import { applySpecs, collectAssetReferences, uniqueAssetReferences } from "./apply.js";
import { runSpecEngineerGates } from "./gates.js";
import {
  SpecEngineerSummarySchema,
  type SpecEngineerInput,
  type SpecEngineerResult,
} from "./contracts.js";

/**
 * Apply M1 artifacts, run deterministic gates, and build the audit summary.
 * Returns the specs even when the gate fails so callers can inspect them;
 * the CLI writes them only when `gate.passed` is true.
 */
export async function runSpecEngineer(
  input: SpecEngineerInput
): Promise<SpecEngineerResult> {
  const specs = applySpecs(input);
  const gate = runSpecEngineerGates({
    brief: input.brief,
    specs,
    interactionSpec: input.interactionSpec,
    motionSpec: input.motionSpec,
    ...(input.iaMap === undefined ? {} : { iaMap: input.iaMap }),
    ...(input.assetBriefs === undefined ? {} : { assetBriefs: input.assetBriefs }),
    ...(input.strictMotionPages === undefined
      ? {}
      : { strictMotionPages: input.strictMotionPages }),
  });

  const references = uniqueAssetReferences(collectAssetReferences(specs));
  const referenced = [...new Set(references.map((reference) => reference.assetId))].sort();
  const assetBriefs = input.assetBriefs ?? [];
  const hasBriefs = assetBriefs.length > 0;
  const briefIds = new Set(assetBriefs.map((brief) => brief.id));
  const missing = hasBriefs
    ? referenced.filter((id) => !briefIds.has(id)).sort()
    : [];
  const referencedSet = new Set(referenced);
  const unusedBriefs = hasBriefs
    ? assetBriefs
        .map((brief) => brief.id)
        .filter((id) => !referencedSet.has(id))
        .sort()
    : [];

  const summary = SpecEngineerSummarySchema.parse({
    schemaVersion: "1.0",
    runId: input.runId,
    project: input.project,
    ...(input.agentRunId === undefined ? {} : { agentRunId: input.agentRunId }),
    generatedAt: input.generatedAt,
    pages: specs.map((spec) => spec.meta.pageId),
    motionPages: specs
      .filter((spec) => spec.motion !== undefined)
      .map((spec) => spec.meta.pageId),
    assets: { referenced, unusedBriefs, missing },
    gate,
    passed: gate.passed,
  });

  return { specs, gate, summary };
}
