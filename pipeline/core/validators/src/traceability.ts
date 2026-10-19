import type { Finding, PageSpec } from "@prd-ui/contracts";
import {
  finalizeFindings,
  walkSpecNodes,
  type FindingDraft,
  type ValidationContext,
} from "./types.js";

/**
 * Requirement traceability checks.
 *
 * - `TRACE-PAGE-REQ`: the page declares no requirement references.
 * - `TRACE-NODE-REQ`: a node `reqRef` is neither on the page nor in the reqMap.
 * - `TRACE-DESIGN-DEFAULT`: a design-default rationale is empty/whitespace.
 * - `TRACE-UNMAPPED`: the traceability block still lists unmapped requirements.
 */
export function validateTraceability(spec: PageSpec, _ctx: ValidationContext): Finding[] {
  const drafts: FindingDraft[] = [];

  const push = (
    ruleId: string,
    location: string,
    evidence: string,
    issue: string,
    severity: FindingDraft["severity"] = "blocker"
  ): void => {
    drafts.push({
      ruleId,
      severity,
      category: "traceability",
      location,
      evidence,
      issue,
    });
  };

  const reqRefs = new Set<string>((spec.meta?.reqRefs ?? []).map(String));
  const reqMap = spec.traceability?.reqMap ?? {};

  if (reqRefs.size === 0) {
    push(
      "TRACE-PAGE-REQ",
      "meta.reqRefs",
      "(empty)",
      "Page must reference at least one requirement."
    );
  }

  for (const { node, path } of walkSpecNodes(spec.layout)) {
    if (
      node.reqRef !== undefined &&
      !reqRefs.has(node.reqRef) &&
      !Object.prototype.hasOwnProperty.call(reqMap, node.reqRef)
    ) {
      push(
        "TRACE-NODE-REQ",
        `${path}.reqRef`,
        node.reqRef,
        `Node reqRef "${node.reqRef}" is not in page reqRefs and not mapped in traceability.reqMap.`
      );
    }

    if (node.designDefault !== undefined && node.designDefault.trim().length === 0) {
      push(
        "TRACE-DESIGN-DEFAULT",
        `${path}.designDefault`,
        JSON.stringify(node.designDefault),
        "designDefault is present but empty or whitespace-only.",
        "major"
      );
    }
  }

  (spec.traceability?.designDefaults ?? []).forEach((entry, index) => {
    if (entry.trim().length === 0) {
      push(
        "TRACE-DESIGN-DEFAULT",
        `traceability.designDefaults[${index}]`,
        JSON.stringify(entry),
        "Design-default rationale is empty or whitespace-only.",
        "major"
      );
    }
  });

  (spec.traceability?.unmapped ?? []).forEach((requirement, index) => {
    push(
      "TRACE-UNMAPPED",
      `traceability.unmapped[${index}]`,
      requirement,
      `Requirement "${requirement}" is still unmapped.`
    );
  });

  return finalizeFindings(drafts);
}
