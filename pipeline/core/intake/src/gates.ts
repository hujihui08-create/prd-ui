import type {
  BriefGate,
  IntakeGateIssue,
  NormalizedPrd,
  PrdIaGate,
  PrdReadiness,
  PrdReviewOutput,
  ProjectConfig,
  UiBriefDraft,
} from "@prd-ui/contracts";
import type {
  IaFindings,
  IaMap,
  ParsedSignoff,
  SignoffAnswer,
} from "@prd-ui/agents";
import { runIaGate, waiverIsCurrent } from "@prd-ui/agents";
import { findPlaceholders } from "./hash.js";
import { findRequiredSections } from "./normalize.js";
import type { BriefValidation } from "./contracts.js";

const SIGNOFF_CODES = new Set([
  "PRD_SIGNOFF_MISSING",
  "BRIEF_SIGNOFF_MISSING",
  "BRIEF_SIGNOFF_HASH_MISMATCH",
]);

function issue(
  code: string,
  severity: IntakeGateIssue["severity"],
  message: string,
  evidence?: string
): IntakeGateIssue {
  return {
    code,
    severity,
    message,
    ...(evidence === undefined ? {} : { evidence }),
  };
}

function blockerCount(issues: IntakeGateIssue[]): number {
  return issues.filter(
    (entry) => entry.severity === "blocker" && !SIGNOFF_CODES.has(entry.code)
  ).length;
}

export interface PrdGateInput {
  normalized: NormalizedPrd;
  review: PrdReviewOutput;
  signoff?: ParsedSignoff;
  now: string;
}

export interface PrdGateResult {
  passed: boolean;
  status: "passed" | "awaiting_signoff" | "blocked";
  signoff: { required: true; valid: boolean; missing: string[] };
  issues: IntakeGateIssue[];
  readiness: PrdReadiness;
}

const REQUIRED_BLOCKER_SECTIONS = [
  "business_scope",
  "roles_permissions",
  "page_inventory",
  "state_matrix",
] as const;

const REQUIRED_WARNING_SECTIONS = [
  "field_tables",
  "acceptance_examples",
  "flows",
  "navigation",
] as const;

export function runPrdGate(input: PrdGateInput): PrdGateResult {
  const issues: IntakeGateIssue[] = [];
  const required = findRequiredSections(input.normalized);

  for (const key of REQUIRED_BLOCKER_SECTIONS) {
    const sections = required[key];
    if (sections.length === 0) {
      issues.push(
        issue("PRD_SECTION_MISSING", "blocker", `missing required PRD section ${key}`, key)
      );
      continue;
    }
    if (sections.every((section) => section.text.replace(/^#{1,6}\s+.*$/m, "").trim() === "")) {
      issues.push(
        issue("PRD_SECTION_EMPTY", "blocker", `PRD section ${key} is empty`, sections[0]!.id)
      );
    }
  }
  for (const key of REQUIRED_WARNING_SECTIONS) {
    if (required[key].length === 0) {
      issues.push(
        issue("PRD_SECTION_MISSING", "warning", `missing PRD section ${key}`, key)
      );
    }
  }

  for (const placeholder of input.normalized.placeholders) {
    const severity =
      placeholder.blocking === false || placeholder.kind === "ellipsis"
        ? "warning"
        : "blocker";
    issues.push(
      issue(
        "PRD_PLACEHOLDER_UNRESOLVED",
        severity,
        `unresolved ${placeholder.kind} placeholder`,
        `${placeholder.location}: ${placeholder.text}`
      )
    );
  }

  const findingIds = new Set<string>();
  let blockingQuestions = 0;
  for (const finding of input.review.findings) {
    if (findingIds.has(finding.id)) {
      issues.push(
        issue("PRD_FINDING_DUPLICATE", "warning", `duplicate PRD finding id ${finding.id}`, finding.id)
      );
    }
    findingIds.add(finding.id);
    if (finding.severity === "question" && finding.blocking === true) {
      blockingQuestions += 1;
    }
    if (finding.severity === "blocker") {
      if (finding.location.trim().length === 0 || finding.evidence.trim().length === 0) {
        issues.push(
          issue(
            "PRD_FINDING_INVALID",
            "blocker",
            `blocker ${finding.id} is missing location or evidence`,
            finding.id
          )
        );
      }
      if (finding.confidence < 0.7) {
        issues.push(
          issue(
            "PRD_FINDING_INVALID",
            "blocker",
            `blocker ${finding.id} has confidence ${finding.confidence} < 0.7`,
            finding.id
          )
        );
      }
    }
  }
  if (blockingQuestions > 10) {
    issues.push(
      issue(
        "PRD_QUESTION_OVERFLOW",
        "blocker",
        `${blockingQuestions} blocking PRD questions exceed the limit of 10`
      )
    );
  }

  const signoff = input.signoff;
  const signoffValid = signoff?.valid === true;
  const missing: string[] = [];
  if (signoff === undefined || !signoff.present) {
    missing.push("signoff/prd-ia.md");
    issues.push(
      issue(
        "PRD_SIGNOFF_MISSING",
        "blocker",
        "PRD/IA signoff is missing",
        "signoff/prd-ia.md"
      )
    );
  } else if (!signoffValid) {
    missing.push("signoff/prd-ia.md");
    issues.push(
      issue(
        "PRD_SIGNOFF_MISSING",
        "blocker",
        `PRD/IA signoff is invalid: ${signoff.error ?? "unknown error"}`,
        "signoff/prd-ia.md"
      )
    );
  }

  // Blockers exist independently of whether a signoff file was supplied:
  // a missing signoff must not hide an unwaived blocker.
  // The same signoff file carries PRD and IA waivers; this gate owns PRD
  // findings only (IA findings are IA-* and are validated by the IA gate).
  const waivers = (signoffValid && signoff !== undefined ? signoff.waivers : []).filter(
    (waiver) => !waiver.findingId.startsWith("IA-")
  );
  const blockerFindings = input.review.findings.filter(
    (finding) => finding.severity === "blocker"
  );
  for (const finding of blockerFindings) {
    const waiver = waivers.find((entry) => entry.findingId === finding.id);
    if (waiver === undefined) {
      issues.push(
        issue(
          "PRD_BLOCKER_UNWAIVED",
          "blocker",
          `blocker ${finding.id} has no human waiver`,
          finding.id
        )
      );
    } else if (!waiverIsCurrent(waiver, new Date(input.now))) {
      issues.push(
        issue(
          "PRD_WAIVER_INVALID",
          "blocker",
          `waiver for ${finding.id} is expired`,
          waiver.expires
        )
      );
    }
  }

  if (signoffValid && signoff !== undefined) {
    for (const waiver of waivers) {
      const finding = input.review.findings.find((entry) => entry.id === waiver.findingId);
      if (finding === undefined) {
        issues.push(
          issue(
            "PRD_WAIVER_INVALID",
            "blocker",
            `waiver references unknown finding ${waiver.findingId}`,
            waiver.findingId
          )
        );
      } else if (finding.severity !== "blocker") {
        issues.push(
          issue(
            "PRD_WAIVER_INVALID",
            "warning",
            `waiver references non-blocker ${waiver.findingId}`,
            waiver.findingId
          )
        );
      }
    }

    const answers = new Set(signoff.answers.map((entry) => entry.questionId));
    for (const finding of input.review.findings) {
      if (
        finding.severity === "question" &&
        finding.blocking === true &&
        !answers.has(finding.id)
      ) {
        issues.push(
          issue(
            "PRD_ANSWER_MISSING",
            "blocker",
            `blocking question ${finding.id} has no answer`,
            finding.id
          )
        );
      }
    }

    if (signoff.approvals.length > 0) {
      const requiredOwners = new Set(
        input.review.findings
          .filter((finding) => finding.severity === "blocker")
          .map((finding) => finding.owner)
      );
      const approved = new Set(signoff.approvals.map((entry) => entry.owner));
      for (const owner of requiredOwners) {
        if (!approved.has(owner)) {
          issues.push(
            issue(
              "PRD_OWNER_APPROVAL_MISSING",
              "blocker",
              `owner ${owner} has blockers but no approval`,
              owner
            )
          );
        }
      }
    }
  }

  const blockers = blockerCount(issues);
  const passed = blockers === 0;
  const readiness: PrdReadiness = {
    status: passed ? "ready" : "blocked",
    blockers,
    majors: input.review.findings.filter((finding) => finding.severity === "major").length,
    questions: input.review.findings.filter((finding) => finding.severity === "question").length,
    summary: passed
      ? "PRD has no blocking findings."
      : `PRD has ${blockers} blocking findings.`,
  };
  return {
    passed,
    status: !passed ? "blocked" : signoffValid ? "passed" : "awaiting_signoff",
    signoff: { required: true, valid: signoffValid, missing },
    issues,
    readiness,
  };
}

export interface IaScopeGateInput {
  review: PrdReviewOutput;
  map: IaMap;
  findings: IaFindings;
  signoff?: ParsedSignoff;
  now: string;
}

export interface IaScopeGateResult {
  passed: boolean;
  issues: IntakeGateIssue[];
}

export function runIntakeIaGate(input: IaScopeGateInput): IaScopeGateResult {
  const result = runIaGate({
    map: input.map,
    findings: input.findings,
    scope: {
      pages: input.review.extract.pages.map((page) => ({
        id: page.id,
        roles: page.roles,
      })),
      roles: input.review.extract.roles.map((role) => role.id),
    },
    waivers: (input.signoff?.waivers ?? []).filter((waiver) =>
      waiver.findingId.startsWith("IA-")
    ),
    now: input.now,
  });
  return {
    passed: result.passed,
    issues: result.issues.map((entry) => ({
      code: entry.code,
      severity: entry.severity,
      message: entry.message,
      ...(entry.evidence === undefined ? {} : { evidence: entry.evidence }),
    })),
  };
}

export function combinePrdIaGate(
  prd: PrdGateResult,
  ia: IaScopeGateResult
): PrdIaGate {
  const passed = prd.passed && ia.passed;
  return {
    passed,
    status: !passed ? "blocked" : prd.signoff.valid ? "passed" : "awaiting_signoff",
    signoff: prd.signoff,
    issues: [...prd.issues, ...ia.issues],
    readiness: prd.readiness,
    ia,
  };
}

export interface BriefGateInput {
  draft: UiBriefDraft;
  expectedPrdHash: string;
  prdReview: PrdReviewOutput;
  iaMap: IaMap;
  projectConfig: ProjectConfig;
  supportedProfiles: string[];
  supportedArchetypes: readonly string[];
  prdAnswers?: SignoffAnswer[];
  signoff?: ParsedSignoff;
  compile: BriefValidation;
  briefHash?: string;
}

export function runBriefGate(input: BriefGateInput): BriefGate {
  const issues: IntakeGateIssue[] = [];
  const brief = input.draft.brief;
  const pageIds = brief.ia.pages.map((page) => page.id);
  const pageIdSet = new Set(pageIds);
  const prdPageIds = new Set(input.prdReview.extract.pages.map((page) => page.id));

  if (brief.meta.sourcePrdHash !== input.expectedPrdHash) {
    issues.push(
      issue(
        "BRIEF_PRD_HASH_MISMATCH",
        "blocker",
        "brief sourcePrdHash does not match the normalized PRD",
        brief.meta.sourcePrdHash
      )
    );
  }
  if (pageIdSet.size !== pageIds.length) {
    issues.push(issue("BRIEF_DUPLICATE_PAGE", "blocker", "brief has duplicate page ids"));
  }
  for (const id of prdPageIds) {
    if (!pageIdSet.has(id)) {
      issues.push(issue("BRIEF_PAGE_MISSING", "blocker", `brief is missing page ${id}`, id));
    }
  }
  for (const id of pageIdSet) {
    if (!prdPageIds.has(id)) {
      issues.push(issue("BRIEF_PAGE_UNKNOWN", "blocker", `brief has unknown page ${id}`, id));
    }
  }

  if (
    brief.product.goals.length === 0 ||
    brief.product.users.length === 0 ||
    brief.product.scope.length === 0 ||
    brief.product.successMetrics.length === 0
  ) {
    issues.push(
      issue(
        "BRIEF_PRODUCT_CONTEXT_MISSING",
        "warning",
        "product goals/users/scope/successMetrics are incomplete"
      )
    );
  }
  const productRoles = new Set(brief.product.roles);
  const rolesWithPages = new Set<string>();
  const routes = new Set<string>();
  const entityFields = new Set(
    brief.data.entities.flatMap((entity) => entity.fields.map((field) => field.name))
  );
  const assetIds = new Set([
    ...brief.assets.icons,
    ...brief.assets.illustrations,
    ...brief.assets.images,
  ]);
  for (const page of brief.ia.pages) {
    if (page.content !== undefined && !["home", "inventory-list"].includes(page.archetype)) {
      issues.push(
        issue(
          "BRIEF_CONTENT_INVALID",
          "blocker",
          `page ${page.id} has typed content for unsupported archetype ${page.archetype}`,
          page.archetype
        )
      );
    }
    if (entityFields.size > 0) {
      for (const field of page.fields ?? []) {
        if (!entityFields.has(field)) {
          issues.push(
            issue(
              "BRIEF_DATA_ENTITY_UNKNOWN",
              "warning",
              `page ${page.id} field ${field} is not in data.entities`,
              field
            )
          );
        }
      }
    }
    if (page.emptyAssetRef !== undefined && !assetIds.has(page.emptyAssetRef)) {
      issues.push(
        issue(
          "BRIEF_ASSET_UNKNOWN",
          "warning",
          `page ${page.id} references unknown asset ${page.emptyAssetRef}`,
          page.emptyAssetRef
        )
      );
    }
  }
  for (const page of brief.ia.pages) {
    for (const role of page.roles) {
      if (!productRoles.has(role)) {
        issues.push(
          issue(
            "BRIEF_ROLE_UNDEFINED",
            "blocker",
            `page ${page.id} uses undefined role ${role}`,
            role
          )
        );
      }
      rolesWithPages.add(role);
    }
    if (routes.has(page.route)) {
      issues.push(
        issue("BRIEF_ROUTE_CONFLICT", "blocker", `duplicate route ${page.route}`, page.route)
      );
    }
    routes.add(page.route);
    if (!input.supportedArchetypes.includes(page.archetype)) {
      issues.push(
        issue(
          "BRIEF_ARCHETYPE_UNSUPPORTED",
          "blocker",
          `page ${page.id} uses unsupported archetype ${page.archetype}`,
          page.archetype
        )
      );
    }
    if (
      input.supportedProfiles.length > 0 &&
      !input.supportedProfiles.includes(page.profile)
    ) {
      issues.push(
        issue(
          "BRIEF_PROFILE_UNKNOWN",
          "blocker",
          `page ${page.id} uses unknown profile ${page.profile}`,
          page.profile
        )
      );
    }
    const missingLabels = (page.fields ?? []).filter(
      (field) => page.fieldLabels?.[field] === undefined
    );
    if (missingLabels.length > 0) {
      issues.push(
        issue(
          "BRIEF_FIELD_LABELS_MISSING",
          "warning",
          `page ${page.id} has no display label for ${missingLabels.length} field(s)`,
          missingLabels.join(", ")
        )
      );
    }
    const missingMockData =
      page.archetype === "list"
        ? page.mockData?.rows === undefined || page.mockData.rows.length === 0
        : page.archetype === "detail"
          ? page.mockData?.values === undefined ||
            Object.keys(page.mockData.values).length === 0
          : page.archetype === "overview"
            ? page.mockData?.listItems === undefined ||
              page.mockData.listItems.length === 0
            : page.archetype === "feed"
              ? (page.feedItems ?? []).length === 0
              : false;
    if (missingMockData) {
      issues.push(
        issue(
          "BRIEF_MOCK_DATA_MISSING",
          "warning",
          `page ${page.id} (${page.archetype}) has no example data for rendering`,
          page.id
        )
      );
    }
    const requiredStates = new Set([
      "default",
      "loading",
      "error",
      ...(input.prdReview.extract.pages.find((entry) => entry.id === page.id)
        ?.requiredStates ?? []),
    ]);
    for (const state of requiredStates) {
      if (!page.requiredStates.includes(state)) {
        issues.push(
          issue(
            "BRIEF_STATE_MISSING",
            "blocker",
            `page ${page.id} is missing required state ${state}`,
            state
          )
        );
      }
    }
    if (page.reqRefs.length === 0) {
      issues.push(
        issue("BRIEF_REQ_MISSING", "blocker", `page ${page.id} has no reqRefs`, page.id)
      );
    }
    for (const req of page.reqRefs) {
      if (!(req in brief.traceability.reqMap)) {
        issues.push(
          issue(
            "BRIEF_REQ_MISSING",
            "blocker",
            `page ${page.id} req ${req} is not in traceability.reqMap`,
            req
          )
        );
      }
    }
  }
  for (const role of brief.product.roles) {
    if (!rolesWithPages.has(role)) {
      issues.push(
        issue(
          "BRIEF_ROLE_MATRIX_MISSING",
          "blocker",
          `role ${role} has no visible page`,
          role
        )
      );
    }
  }
  for (const pages of Object.values(brief.traceability.reqMap)) {
    for (const pageId of pages) {
      if (!pageIdSet.has(pageId)) {
        issues.push(
          issue(
            "BRIEF_TRACEABILITY_INCOMPLETE",
            "blocker",
            `traceability references unknown page ${pageId}`,
            pageId
          )
        );
      }
    }
  }
  if (brief.traceability.unmapped.length > 0) {
    issues.push(
      issue(
        "BRIEF_TRACEABILITY_INCOMPLETE",
        "blocker",
        `brief has ${brief.traceability.unmapped.length} unmapped requirements`,
        brief.traceability.unmapped.join(", ")
      )
    );
  }
  const placeholders = findPlaceholders(brief);
  if (placeholders.length > 0) {
    issues.push(
      issue("BRIEF_PLACEHOLDER", "blocker", "brief contains placeholders", placeholders[0])
    );
  }
  const blockingQuestions = input.draft.questions.filter(
    (question) => question.blocking
  ).length;
  if (blockingQuestions > 10) {
    issues.push(
      issue(
        "BRIEF_QUESTION_OVERFLOW",
        "blocker",
        `${blockingQuestions} blocking brief questions exceed the limit of 10`
      )
    );
  }
  for (const question of input.draft.questions) {
    if (question.blocking) {
      issues.push(
        issue(
          "BRIEF_OPEN_QUESTION_BLOCKING",
          "blocker",
          `blocking brief question ${question.id}`,
          question.question
        )
      );
    }
  }
  for (const assumption of input.draft.assumptions) {
    if (assumption.blocking) {
      issues.push(
        issue(
          "BRIEF_ASSUMPTION_BLOCKING",
          "blocker",
          `blocking assumption ${assumption.id} is not accepted`,
          assumption.statement
        )
      );
    }
  }
  if (!input.compile.ok) {
    issues.push(
      issue(
        "BRIEF_COMPILE_FAILED",
        "blocker",
        "brief failed the compiler dry-run",
        input.compile.errors.join("; ")
      )
    );
  }

  const answers = new Set((input.prdAnswers ?? []).map((entry) => entry.questionId));
  for (const finding of input.prdReview.findings) {
    if (
      finding.severity === "question" &&
      finding.blocking === true &&
      !answers.has(finding.id)
    ) {
      issues.push(
        issue(
          "BRIEF_PRD_QUESTION_UNANSWERED",
          "blocker",
          `PRD question ${finding.id} is still unanswered`,
          finding.id
        )
      );
    }
  }

  const signoff = input.signoff;
  let signoffValid = signoff?.valid === true;
  if (signoff === undefined || !signoff.present) {
    issues.push(
      issue(
        "BRIEF_SIGNOFF_MISSING",
        "blocker",
        "brief signoff is missing",
        "signoff/brief.md"
      )
    );
  } else if (!signoffValid) {
    issues.push(
      issue(
        "BRIEF_SIGNOFF_MISSING",
        "blocker",
        `brief signoff is invalid: ${signoff.error ?? "unknown error"}`,
        "signoff/brief.md"
      )
    );
  } else {
    if (
      signoff.briefHash === undefined ||
      input.briefHash === undefined ||
      signoff.briefHash !== input.briefHash
    ) {
      issues.push(
        issue(
          "BRIEF_SIGNOFF_HASH_MISMATCH",
          "blocker",
          "brief signoff hash does not match the candidate brief",
          signoff.briefHash ?? "missing"
        )
      );
      signoffValid = false;
    }
    if (signoff.waivers.length > 0) {
      issues.push(
        issue(
          "BRIEF_WAIVER_INVALID",
          "blocker",
          "brief signoff must not contain waivers in v0"
        )
      );
    }
  }

  const blockers = blockerCount(issues);
  const passed = blockers === 0;
  return {
    passed,
    status: !passed ? "blocked" : signoffValid ? "passed" : "awaiting_signoff",
    signoff: { valid: signoffValid },
    issues,
    compile: input.compile,
    ...(input.briefHash === undefined ? {} : { briefHash: input.briefHash }),
  };
}
