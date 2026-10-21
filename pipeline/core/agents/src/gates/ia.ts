import type { UiBrief } from "@prd-ui/contracts";
import type { GateIssue, GateResult } from "../contracts.js";
import type { IaFindings, IaMap } from "../roles/ia.js";
import { waiverIsCurrent, type IaWaiver } from "../signoff.js";

/** Page/role scope the IA map must match. Intake has no signed brief yet. */
export interface IaGateScope {
  pages: Array<{ id: string; roles: string[] }>;
  roles: string[];
}

export interface IaGateInput {
  map: IaMap;
  findings: IaFindings;
  /** M1 path: derive the scope from a full brief. */
  brief?: UiBrief;
  /** Intake path: derive the scope from the signed PRD extract. */
  scope?: IaGateScope;
  waivers?: IaWaiver[];
  /** ISO timestamp used for waiver expiry. */
  now: string;
}

export function scopeFromBrief(brief: UiBrief): IaGateScope {
  return {
    pages: brief.ia.pages.map((page) => ({ id: page.id, roles: page.roles })),
    roles: brief.product.roles,
  };
}

function blocker(code: string, message: string, evidence?: string): GateIssue {
  return {
    code,
    severity: "blocker",
    message,
    ...(evidence === undefined ? {} : { evidence }),
  };
}

function warning(code: string, message: string, evidence?: string): GateIssue {
  return {
    code,
    severity: "warning",
    message,
    ...(evidence === undefined ? {} : { evidence }),
  };
}

/**
 * Deterministic IA gate: structural map checks, unwaived blockers, and
 * waiver validity. The agent's judgment lives in findings; this gate only
 * enforces facts a human can audit.
 */
export function runIaGate(input: IaGateInput): GateResult {
  const issues: GateIssue[] = [];
  const scope =
    input.scope ?? (input.brief === undefined ? undefined : scopeFromBrief(input.brief));
  if (scope === undefined) {
    throw new Error("IA gate requires either brief or scope");
  }
  const scopePageIds = new Set(scope.pages.map((page) => page.id));
  const mapPageIds = new Set<string>();

  for (const page of input.map.pages) {
    if (mapPageIds.has(page.id)) {
      issues.push(blocker("IA_DUPLICATE_PAGE", `duplicate page id ${page.id}`, page.id));
    }
    mapPageIds.add(page.id);
    if (!scopePageIds.has(page.id)) {
      issues.push(blocker("IA_PAGE_UNKNOWN", `page ${page.id} is not in the signed page scope`, page.id));
    }
    const knownRoles = new Set(scope.roles);
    for (const role of page.roles) {
      if (!knownRoles.has(role)) {
        issues.push(
          warning("IA_UNKNOWN_ROLE", `page ${page.id} names unknown role ${role}`, role)
        );
      }
    }
  }

  for (const page of scope.pages) {
    if (!mapPageIds.has(page.id)) {
      issues.push(blocker("IA_PAGE_MISSING", `IA map is missing page ${page.id}`, page.id));
    }
  }

  for (const page of input.map.pages) {
    if (page.parentId !== undefined && !mapPageIds.has(page.parentId)) {
      issues.push(
        blocker("IA_PARENT_UNKNOWN", `page ${page.id} has unknown parent ${page.parentId}`, page.parentId)
      );
    }
  }

  const flowIds = new Set<string>();
  for (const flow of input.map.flows) {
    if (flowIds.has(flow.id)) {
      issues.push(blocker("IA_DUPLICATE_FLOW", `duplicate flow id ${flow.id}`, flow.id));
    }
    flowIds.add(flow.id);
    for (const step of flow.steps) {
      if (!mapPageIds.has(step)) {
        issues.push(
          blocker("IA_FLOW_STEP_UNKNOWN", `flow ${flow.id} references unknown page ${step}`, step)
        );
      }
    }
  }

  for (const link of input.map.crossLinks) {
    if (!mapPageIds.has(link.from) || !mapPageIds.has(link.to)) {
      issues.push(
        blocker(
          "IA_CROSSLINK_UNKNOWN",
          `cross-link ${link.from} -> ${link.to} references an unknown page`,
          `${link.from}->${link.to}`
        )
      );
    }
  }

  const tabs = input.map.navigation.tabs ?? [];
  if (tabs.length > 5) {
    issues.push(
      blocker("IA_TAB_OVERFLOW", `navigation has ${tabs.length} tabs; the maximum is 5`, `${tabs.length}`)
    );
  }

  const findingIds = new Set<string>();
  for (const finding of input.findings.findings) {
    if (findingIds.has(finding.id)) {
      issues.push(blocker("IA_DUPLICATE_FINDING", `duplicate finding id ${finding.id}`, finding.id));
    }
    findingIds.add(finding.id);
  }

  const now = new Date(input.now);
  const waivers = input.waivers ?? [];
  const waivedFindings: string[] = [];

  for (const finding of input.findings.findings) {
    if (finding.severity !== "blocker") continue;
    const waiver = waivers.find((candidate) => candidate.findingId === finding.id);
    if (waiver === undefined) {
      issues.push(
        blocker(
          "IA_BLOCKER_UNWAIVED",
          `blocker ${finding.id} has no human waiver`,
          `${finding.id}: ${finding.issue}`
        )
      );
      continue;
    }
    if (!waiverIsCurrent(waiver, now)) {
      issues.push(
        blocker(
          "IA_WAIVER_INVALID",
          `waiver for ${finding.id} is expired or has an invalid expiry`,
          waiver.expires
        )
      );
      continue;
    }
    waivedFindings.push(finding.id);
  }

  for (const waiver of waivers) {
    const finding = input.findings.findings.find((candidate) => candidate.id === waiver.findingId);
    if (finding === undefined) {
      issues.push(
        warning(
          "IA_WAIVER_UNKNOWN_FINDING",
          `waiver references ${waiver.findingId}, which is not in findings`,
          waiver.findingId
        )
      );
    } else if (finding.severity !== "blocker") {
      issues.push(
        warning(
          "IA_WAIVER_NOT_BLOCKER",
          `waiver references ${waiver.findingId}, which is not a blocker`,
          waiver.findingId
        )
      );
    }
  }

  const passed = !issues.some((issue) => issue.severity === "blocker");
  return {
    passed,
    status: passed ? (waivedFindings.length > 0 ? "waived" : "passed") : "failed",
    issues,
    ...(waivedFindings.length === 0 ? {} : { waivedFindings }),
  };
}
