import type { HandoffInput, HandoffManifest } from "@prd-ui/contracts";

export function buildHandoffManifest(input: HandoffInput): HandoffManifest {
  return {
    schemaVersion: "1.0",
    project: input.project,
    generatedAt: input.generatedAt,
    pipelineVersion: input.pipelineVersion,
    profile: input.profile,
    catalog: input.catalog,
    pages: input.pages,
    figma: input.figma,
    gates: input.gates,
    signoffs: input.signoffs,
    files: input.files,
    knownGaps: input.knownGaps,
    ...(input.archive === undefined ? {} : { archive: input.archive }),
  };
}
