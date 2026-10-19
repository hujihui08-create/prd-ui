import type { Finding, PageSpec } from "@prd-ui/contracts";
import { validateAsset } from "./asset.js";
import { validateCatalog } from "./catalog.js";
import { validateLayout } from "./layout.js";
import { validateSchema } from "./schema.js";
import { validateState } from "./state.js";
import { validateToken } from "./token.js";
import { validateTraceability } from "./traceability.js";
import type { ValidationContext, ValidationReport } from "./types.js";

type PageValidator = (spec: PageSpec, ctx: ValidationContext) => Finding[];

const validators: PageValidator[] = [
  validateSchema,
  validateCatalog,
  validateToken,
  validateLayout,
  validateState,
  validateAsset,
  validateTraceability,
];

/**
 * Run the schema and every rule against a page spec. Findings are renumbered
 * report-wide as F-001...N and counted by severity. A report passes when it
 * has no blockers (major/minor findings are reported but do not fail it).
 */
export function validatePageSpec(spec: PageSpec, ctx: ValidationContext): ValidationReport {
  const rawFindings = validators.flatMap((validate) => validate(spec, ctx));
  const findings: Finding[] = rawFindings.map((finding, index) => ({
    ...finding,
    id: `F-${String(index + 1).padStart(3, "0")}`,
  }));

  const blockers = findings.filter((finding) => finding.severity === "blocker").length;
  const major = findings.filter((finding) => finding.severity === "major").length;
  const minor = findings.filter((finding) => finding.severity === "minor").length;
  const questions = findings.filter((finding) => finding.severity === "question").length;

  return {
    pageId: spec.meta?.pageId ?? "(unknown)",
    findings,
    blockers,
    major,
    minor,
    questions,
    passed: blockers === 0,
  };
}

/**
 * Validate every spec in order using the context registered for its page id.
 * Missing contexts are a programming error and throw.
 */
export function validateProject(
  specs: PageSpec[],
  contextsByPage: Record<string, ValidationContext>
): ValidationReport[] {
  return specs.map((spec) => {
    const context = contextsByPage[spec.meta.pageId];
    if (!context) {
      throw new Error(`Missing validation context for page "${spec.meta.pageId}".`);
    }
    return validatePageSpec(spec, context);
  });
}
