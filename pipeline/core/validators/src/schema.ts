import { PageSpecSchema, type Finding, type PageSpec } from "@prd-ui/contracts";
import {
  finalizeFindings,
  type FindingDraft,
  type ValidationContext,
} from "./types.js";

/**
 * Contract check. Runs `PageSpecSchema.safeParse` and turns every issue into a
 * `SCHEMA-INVALID` blocker. This validator never throws.
 */
export function validateSchema(spec: PageSpec, _ctx: ValidationContext): Finding[] {
  const result = PageSpecSchema.safeParse(spec);
  if (result.success) return [];

  const drafts: FindingDraft[] = result.error.issues.map((issue) => ({
    ruleId: "SCHEMA-INVALID",
    severity: "blocker",
    category: "schema",
    location: issue.path.length > 0 ? `spec.${issue.path.join(".")}` : "spec",
    evidence: issue.message,
    issue: `PageSpec does not satisfy the schema: ${issue.message}`,
  }));

  return finalizeFindings(drafts);
}
