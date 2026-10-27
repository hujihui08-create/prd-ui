import { describe, expect, it } from "vitest";
import { parseSignoffMarkdown } from "@prd-ui/agents";
import type { NormalizedPrd, PrdReviewOutput, UiBriefDraft } from "@prd-ui/contracts";
import {
  briefHash,
  combinePrdIaGate,
  runBriefGate,
  runIntakeIaGate,
  runPrdGate,
} from "../src/index.js";
import {
  briefSignoff,
  draft,
  iaOutput,
  normalized,
  prdHash,
  review,
  validPrdSignoff,
  withBrief,
} from "./fixtures.js";

const now = "2026-10-20T00:00:00.000Z";
const hashText = (text: string): string => `sha256:${text.length}`;
const projectConfig = {
  project: "demo-orders",
  brief: "ui-brief.sample.json",
  manifests: {},
};
const supportedProfiles = ["b-dense", "b-mobile", "c-expressive"];
const supportedArchetypes = [
  "overview",
  "list",
  "detail",
  "form",
  "settings",
  "feed",
  "home",
  "inventory-list",
  "mobile-list",
  "mobile-form",
  "auth",
  "onboarding",
];

function briefGateInput(
  overrides: Partial<Parameters<typeof runBriefGate>[0]> = {}
): Parameters<typeof runBriefGate>[0] {
  const brief = {
    ...structuredClone(draft.brief),
    meta: {
      ...draft.brief.meta,
      project: "demo-orders",
      sourcePrdHash: prdHash,
      date: "2026-10-20",
      version: "0.1.0",
    },
  };
  const candidate: UiBriefDraft = { ...draft, brief };
  const hash = briefHash(hashText, brief);
  return {
    draft: candidate,
    expectedPrdHash: prdHash,
    prdReview: review,
    iaMap: iaOutput.map,
    projectConfig,
    supportedProfiles,
    supportedArchetypes,
    signoff: briefSignoff(hash),
    compile: { ok: true, errors: [] },
    briefHash: hash,
    ...overrides,
  };
}

describe("PRD gate", () => {
  it("waits for signoff when findings pass", () => {
    const gate = runPrdGate({ normalized, review, now });
    expect(gate.passed).toBe(true);
    expect(gate.status).toBe("awaiting_signoff");
    expect(gate.issues.map((issue) => issue.code)).toContain("PRD_SIGNOFF_MISSING");
  });

  it("passes with a valid PRD/IA signoff", () => {
    const gate = runPrdGate({
      normalized,
      review,
      signoff: validPrdSignoff,
      now,
    });
    expect(gate.passed).toBe(true);
    expect(gate.status).toBe("passed");
    expect(gate.signoff.valid).toBe(true);
  });

  it("blocks a missing required section", () => {
    const broken: NormalizedPrd = {
      ...normalized,
      sections: normalized.sections.filter(
        (section) => !section.heading.includes("业务范围")
      ),
    };
    const gate = runPrdGate({ normalized: broken, review, now });
    expect(gate.passed).toBe(false);
    expect(gate.status).toBe("blocked");
    expect(gate.issues.map((issue) => issue.code)).toContain("PRD_SECTION_MISSING");
  });

  it("blocks a low-confidence blocker finding", () => {
    const broken: PrdReviewOutput = {
      ...review,
      findings: [
        {
          id: "PRD-001",
          ruleId: "PRD-SCOPE",
          severity: "blocker",
          category: "scope",
          location: "missing",
          evidence: "missing",
          issue: "scope unclear",
          owner: "product_owner",
          confidence: 0.5,
        },
      ],
    };
    const gate = runPrdGate({ normalized, review: broken, now });
    expect(gate.passed).toBe(false);
    expect(gate.issues.map((issue) => issue.code)).toContain("PRD_FINDING_INVALID");
  });

  it("requires a waiver for every blocker and rejects expired waivers", () => {
    const broken: PrdReviewOutput = {
      ...review,
      findings: [
        {
          id: "PRD-001",
          ruleId: "PRD-SCOPE",
          severity: "blocker",
          category: "scope",
          location: "sec-001",
          evidence: "missing",
          issue: "scope unclear",
          owner: "product_owner",
          confidence: 0.9,
        },
      ],
    };
    const noSignoff = runPrdGate({ normalized, review: broken, now });
    expect(noSignoff.passed).toBe(false);
    expect(noSignoff.status).toBe("blocked");
    expect(noSignoff.issues.map((issue) => issue.code)).toContain(
      "PRD_BLOCKER_UNWAIVED"
    );

    const noWaiver = runPrdGate({ normalized, review: broken, signoff: validPrdSignoff, now });
    expect(noWaiver.passed).toBe(false);
    expect(noWaiver.issues.map((issue) => issue.code)).toContain("PRD_BLOCKER_UNWAIVED");

    const waived = parseSignoffMarkdown(`<!-- signoff
{"signer":"Test","date":"2026-10-20","waivers":[{"findingId":"PRD-001","owner":"Test","reason":"slice","expires":"2026-11-20"}]}
-->`);
    expect(
      runPrdGate({ normalized, review: broken, signoff: waived, now }).passed
    ).toBe(true);

    // The same signoff file also carries IA waivers; the PRD gate must ignore
    // those rather than treating them as unknown PRD findings.
    const mixed = parseSignoffMarkdown(`<!-- signoff
{"signer":"Test","date":"2026-10-20","waivers":[
  {"findingId":"PRD-001","owner":"Test","reason":"slice","expires":"2026-11-20"},
  {"findingId":"IA-001","owner":"Test","reason":"ia slice","expires":"2026-11-20"}
]}
-->`);
    const mixedGate = runPrdGate({
      normalized,
      review: broken,
      signoff: mixed,
      now,
    });
    expect(mixedGate.passed).toBe(true);
    expect(mixedGate.issues.map((issue) => issue.code)).not.toContain(
      "PRD_WAIVER_INVALID"
    );

    const expired = parseSignoffMarkdown(`<!-- signoff
{"signer":"Test","date":"2026-10-20","waivers":[{"findingId":"PRD-001","owner":"Test","reason":"slice","expires":"2020-01-01"}]}
-->`);
    const expiredGate = runPrdGate({
      normalized,
      review: broken,
      signoff: expired,
      now,
    });
    expect(expiredGate.passed).toBe(false);
    expect(expiredGate.issues.map((issue) => issue.code)).toContain("PRD_WAIVER_INVALID");
  });

  it("requires an answer for a blocking question", () => {
    const broken: PrdReviewOutput = {
      ...review,
      findings: [
        {
          id: "PRD-002",
          ruleId: "PRD-QUESTION",
          severity: "question",
          category: "scope",
          location: "sec-001",
          evidence: "ambiguous",
          issue: "which role?",
          blocking: true,
          owner: "product_owner",
          confidence: 0.8,
        },
      ],
    };
    const missing = runPrdGate({ normalized, review: broken, signoff: validPrdSignoff, now });
    expect(missing.passed).toBe(false);
    expect(missing.issues.map((issue) => issue.code)).toContain("PRD_ANSWER_MISSING");

    const answered = parseSignoffMarkdown(`<!-- signoff
{"signer":"Test","date":"2026-10-20","answers":[{"questionId":"PRD-002","answer":"admin"}]}
-->`);
    expect(
      runPrdGate({ normalized, review: broken, signoff: answered, now }).passed
    ).toBe(true);
  });

  it("combines the IA gate and keeps signoff status separate", () => {
    const prd = runPrdGate({ normalized, review, signoff: validPrdSignoff, now });
    const ia = runIntakeIaGate({
      review,
      map: iaOutput.map,
      findings: iaOutput.findings,
      signoff: validPrdSignoff,
      now,
    });
    expect(ia.passed).toBe(true);
    const combined = combinePrdIaGate(prd, ia);
    expect(combined.status).toBe("passed");
  });
});

function gateForDraft(candidate: UiBriefDraft): ReturnType<typeof runBriefGate> {
  const hash = briefHash(hashText, candidate.brief);
  return runBriefGate(
    briefGateInput({ draft: candidate, briefHash: hash, signoff: briefSignoff(hash) })
  );
}

describe("brief gate", () => {
  it("passes a complete signed brief", () => {
    const gate = runBriefGate(briefGateInput());
    expect(gate.passed).toBe(true);
    expect(gate.status).toBe("passed");
    expect(gate.signoff.valid).toBe(true);
  });

  it("waits for brief signoff when the structural gates pass", () => {
    const gate = runBriefGate(briefGateInput({ signoff: undefined }));
    expect(gate.passed).toBe(true);
    expect(gate.status).toBe("awaiting_signoff");
    expect(gate.issues.map((issue) => issue.code)).toContain("BRIEF_SIGNOFF_MISSING");
  });

  it("waits when the brief signoff hash does not match", () => {
    const gate = runBriefGate(
      briefGateInput({ signoff: briefSignoff("sha256:wrong") })
    );
    expect(gate.passed).toBe(true);
    expect(gate.status).toBe("awaiting_signoff");
    expect(gate.issues.map((issue) => issue.code)).toContain(
      "BRIEF_SIGNOFF_HASH_MISMATCH"
    );
  });

  it("blocks a missing required state", () => {
    const input = briefGateInput();
    const page = input.draft.brief.ia.pages.find((entry) => entry.id === "orders-list")!;
    page.requiredStates = page.requiredStates.filter((state) => state !== "loading");
    const gate = runBriefGate(input);
    expect(gate.passed).toBe(false);
    expect(gate.issues.map((issue) => issue.code)).toContain("BRIEF_STATE_MISSING");
  });

  it("blocks unknown pages and undefined roles", () => {
    const input = briefGateInput();
    const page = input.draft.brief.ia.pages[0]!;
    page.id = "extra-page";
    page.roles = [...page.roles, "ghost"];
    const gate = runBriefGate(input);
    const codes = gate.issues.map((issue) => issue.code);
    expect(codes).toContain("BRIEF_PAGE_UNKNOWN");
    expect(codes).toContain("BRIEF_PAGE_MISSING");
    expect(codes).toContain("BRIEF_ROLE_UNDEFINED");
  });

  it("warns when mock data or field labels are missing", () => {
    const input = briefGateInput();
    const listPage = input.draft.brief.ia.pages.find((entry) => entry.id === "orders-list")!;
    delete listPage.mockData;
    delete listPage.fieldLabels;
    const detailPage = input.draft.brief.ia.pages.find((entry) => entry.id === "order-detail")!;
    delete detailPage.mockData;
    const hash = briefHash(hashText, input.draft.brief);
    input.briefHash = hash;
    input.signoff = briefSignoff(hash);

    const gate = runBriefGate(input);
    const codes = gate.issues.map((issue) => issue.code);
    expect(codes).toContain("BRIEF_MOCK_DATA_MISSING");
    expect(codes).toContain("BRIEF_FIELD_LABELS_MISSING");
    expect(gate.passed).toBe(true);
  });

  it("blocks home fields/actions and host actions", () => {
    const home = withBrief((brief) => {
      const page = brief.ia.pages.find((entry) => entry.id === "orders-overview")!;
      page.archetype = "home";
      page.fields = ["storeName"];
      page.actions = [{ id: "nav.customer-tab", label: "前往客户 Tab" }];
      return brief;
    });
    const gate = gateForDraft(home);
    const codes = gate.issues.map((issue) => issue.code);
    expect(codes).toContain("BRIEF_HOME_FIELDS");
    expect(codes).toContain("BRIEF_HOST_ACTION");
    expect(gate.passed).toBe(false);
  });

  it("blocks missing or unknown business state actions", () => {
    const missing = withBrief((brief) => {
      const page = brief.ia.pages.find((entry) => entry.id === "order-detail")!;
      page.fields = ["status"];
      page.actions = [
        { id: "order.create", label: "开单" },
        { id: "appointment.cancel", label: "取消" },
      ];
      return brief;
    });
    expect(gateForDraft(missing).issues.map((issue) => issue.code)).toContain(
      "BRIEF_BUSINESS_STATES_MISSING"
    );

    const unknown = withBrief((brief) => {
      const page = brief.ia.pages.find((entry) => entry.id === "order-detail")!;
      page.fields = ["status"];
      page.actions = [{ id: "order.create", label: "开单" }];
      page.businessStates = [{ name: "已到店", actions: ["order.create", "不存在"] }];
      return brief;
    });
    expect(gateForDraft(unknown).issues.map((issue) => issue.code)).toContain(
      "BRIEF_BUSINESS_STATE_ACTION_UNKNOWN"
    );
  });

  it("blocks form modes and views that the page cannot support", () => {
    const mode = withBrief((brief) => {
      const page = brief.ia.pages.find((entry) => entry.id === "order-form")!;
      page.formModes = [{ name: "new", label: "新增", actions: ["form.save-draft"] }];
      return brief;
    });
    expect(gateForDraft(mode).issues.map((issue) => issue.code)).toContain(
      "BRIEF_FORM_MODE_ACTION_UNKNOWN"
    );

    const view = withBrief((brief) => {
      const page = brief.ia.pages.find((entry) => entry.id === "orders-overview")!;
      page.views = ["calendar", "list"];
      return brief;
    });
    expect(gateForDraft(view).issues.map((issue) => issue.code)).toContain(
      "BRIEF_VIEW_WITHOUT_TIME"
    );
  });

  it("blocks unknown picker targets and invalid calendar dates", () => {
    const unknownReturn = withBrief((brief) => {
      const page = brief.ia.pages.find((entry) => entry.id === "orders-list")!;
      page.pickerReturnTo = "ghost-page";
      return brief;
    });
    expect(gateForDraft(unknownReturn).issues.map((issue) => issue.code)).toContain(
      "BRIEF_PICKER_RETURN_UNKNOWN"
    );

    const unknownPicker = withBrief((brief) => {
      const page = brief.ia.pages.find((entry) => entry.id === "order-form")!;
      page.customerPicker = "orders-list";
      return brief;
    });
    expect(gateForDraft(unknownPicker).issues.map((issue) => issue.code)).toContain(
      "BRIEF_CUSTOMER_PICKER_UNKNOWN"
    );

    const missingPicker = withBrief((brief) => {
      const page = brief.ia.pages.find((entry) => entry.id === "order-form")!;
      page.customerPicker = "ghost-search";
      return brief;
    });
    expect(gateForDraft(missingPicker).issues.map((issue) => issue.code)).toContain(
      "BRIEF_CUSTOMER_PICKER_UNKNOWN"
    );

    const invalidDate = withBrief((brief) => {
      const page = brief.ia.pages.find((entry) => entry.id === "orders-list")!;
      page.calendarWeekStart = "11-05";
      return brief;
    });
    expect(gateForDraft(invalidDate).issues.map((issue) => issue.code)).toContain(
      "BRIEF_CALENDAR_DATE_INVALID"
    );
  });

  it("blocks picker and calendar metadata on unsupported page types", () => {
    const pickerReturn = withBrief((brief) => {
      const form = brief.ia.pages.find((entry) => entry.id === "order-form")!;
      form.archetype = "mobile-form";
      const page = brief.ia.pages.find((entry) => entry.id === "order-detail")!;
      page.pickerReturnTo = "order-form";
      return brief;
    });
    const pickerReturnCodes = gateForDraft(pickerReturn).issues.map((issue) => issue.code);
    expect(pickerReturnCodes).toContain("BRIEF_PICKER_RETURN_UNSUPPORTED");
    expect(pickerReturnCodes).not.toContain("BRIEF_PICKER_RETURN_UNKNOWN");

    const customerPicker = withBrief((brief) => {
      const list = brief.ia.pages.find((entry) => entry.id === "orders-list")!;
      list.archetype = "mobile-list";
      list.filterFields = ["keyword"];
      const page = brief.ia.pages.find((entry) => entry.id === "order-detail")!;
      page.customerPicker = "orders-list";
      return brief;
    });
    const customerPickerCodes = gateForDraft(customerPicker).issues.map(
      (issue) => issue.code
    );
    expect(customerPickerCodes).toContain("BRIEF_CUSTOMER_PICKER_UNSUPPORTED");
    expect(customerPickerCodes).not.toContain("BRIEF_CUSTOMER_PICKER_UNKNOWN");

    const listWithoutDate = withBrief((brief) => {
      const list = brief.ia.pages.find((entry) => entry.id === "orders-list")!;
      list.archetype = "mobile-list";
      list.calendarWeekStart = "2026-11-02";
      return brief;
    });
    expect(gateForDraft(listWithoutDate).issues.map((issue) => issue.code)).toContain(
      "BRIEF_CALENDAR_FIELDS_MISSING"
    );

    const nonListPage = withBrief((brief) => {
      const page = brief.ia.pages.find((entry) => entry.id === "order-detail")!;
      page.calendarWeekStart = "2026-11-02";
      return brief;
    });
    expect(gateForDraft(nonListPage).issues.map((issue) => issue.code)).toContain(
      "BRIEF_CALENDAR_FIELDS_MISSING"
    );
  });

  it("requires customerPicker to target the customer-search page", () => {
    const listOnly = withBrief((brief) => {
      const list = brief.ia.pages.find((entry) => entry.id === "orders-list")!;
      list.archetype = "mobile-list";
      list.filterFields = ["status"];
      const form = brief.ia.pages.find((entry) => entry.id === "order-form")!;
      form.archetype = "mobile-form";
      form.customerPicker = "orders-list";
      return brief;
    });
    const listOnlyCodes = gateForDraft(listOnly).issues.map((issue) => issue.code);
    expect(listOnlyCodes).toContain("BRIEF_CUSTOMER_PICKER_UNKNOWN");
    expect(listOnlyCodes).not.toContain("BRIEF_CUSTOMER_PICKER_UNSUPPORTED");

    const keywordFilter = withBrief((brief) => {
      const list = brief.ia.pages.find((entry) => entry.id === "orders-list")!;
      list.archetype = "mobile-list";
      list.filterFields = ["keyword"];
      const form = brief.ia.pages.find((entry) => entry.id === "order-form")!;
      form.archetype = "mobile-form";
      form.customerPicker = "orders-list";
      return brief;
    });
    const keywordCodes = gateForDraft(keywordFilter).issues.map((issue) => issue.code);
    expect(keywordCodes).not.toContain("BRIEF_CUSTOMER_PICKER_UNKNOWN");
    expect(keywordCodes).not.toContain("BRIEF_CUSTOMER_PICKER_UNSUPPORTED");
  });

  it("requires pickerReturnTo to target a mobile form page", () => {
    const toDetail = withBrief((brief) => {
      const list = brief.ia.pages.find((entry) => entry.id === "orders-list")!;
      list.id = "customer-search";
      list.archetype = "mobile-list";
      list.pickerReturnTo = "order-detail";
      return brief;
    });
    const codes = gateForDraft(toDetail).issues.map((issue) => issue.code);
    expect(codes).toContain("BRIEF_PICKER_RETURN_UNKNOWN");
    expect(codes).not.toContain("BRIEF_PICKER_RETURN_UNSUPPORTED");
  });

  it("blocks impossible calendar dates", () => {
    for (const value of ["2026-02-31", "2026-13-01", "2026-02-29"]) {
      const invalid = withBrief((brief) => {
        const list = brief.ia.pages.find((entry) => entry.id === "orders-list")!;
        list.archetype = "mobile-list";
        list.fields = [...(list.fields ?? []), "date"];
        list.calendarWeekStart = value;
        return brief;
      });
      const codes = gateForDraft(invalid).issues.map((issue) => issue.code);
      expect(codes, value).toContain("BRIEF_CALENDAR_DATE_INVALID");
      expect(codes, value).not.toContain("BRIEF_CALENDAR_FIELDS_MISSING");
    }
  });

  it("accepts supported picker targets and calendar metadata", () => {
    const valid = withBrief((brief) => {
      const list = brief.ia.pages.find((entry) => entry.id === "orders-list")!;
      list.id = "customer-search";
      list.archetype = "mobile-list";
      list.fields = [...(list.fields ?? []), "date"];
      list.pickerReturnTo = "order-form";
      list.calendarWeekStart = "2026-11-02";
      const form = brief.ia.pages.find((entry) => entry.id === "order-form")!;
      form.archetype = "mobile-form";
      form.customerPicker = "customer-search";
      return brief;
    });
    const codes = gateForDraft(valid).issues.map((issue) => issue.code);
    expect(codes).not.toContain("BRIEF_PICKER_RETURN_UNKNOWN");
    expect(codes).not.toContain("BRIEF_PICKER_RETURN_UNSUPPORTED");
    expect(codes).not.toContain("BRIEF_CUSTOMER_PICKER_UNKNOWN");
    expect(codes).not.toContain("BRIEF_CUSTOMER_PICKER_UNSUPPORTED");
    expect(codes).not.toContain("BRIEF_CALENDAR_DATE_INVALID");
    expect(codes).not.toContain("BRIEF_CALENDAR_FIELDS_MISSING");
  });

  it("warns when a search page has no idle title", () => {
    const gate = gateForDraft(withBrief((brief) => brief));
    expect(gate.issues.map((issue) => issue.code)).toContain("BRIEF_SEARCH_IDLE_MISSING");

    const titled = withBrief((brief) => {
      const page = brief.ia.pages.find((entry) => entry.id === "orders-list")!;
      page.searchIdleTitle = "输入订单号或客户姓名搜索";
      return brief;
    });
    expect(gateForDraft(titled).issues.map((issue) => issue.code)).not.toContain(
      "BRIEF_SEARCH_IDLE_MISSING"
    );
  });

  it("blocks compile failures, placeholders, and blocking questions", () => {
    const compile = runBriefGate(
      briefGateInput({ compile: { ok: false, errors: ["boom"] } })
    );
    expect(compile.issues.map((issue) => issue.code)).toContain("BRIEF_COMPILE_FAILED");

    const placeholderInput = briefGateInput();
    placeholderInput.draft.brief.ia.pages[0]!.name = "TBD";
    const placeholder = runBriefGate(placeholderInput);
    expect(placeholder.issues.map((issue) => issue.code)).toContain("BRIEF_PLACEHOLDER");

    const questionInput = briefGateInput();
    questionInput.draft = {
      ...questionInput.draft,
      questions: [
        {
          id: "BQ-001",
          question: "which feed?",
          impact: "feed content",
          owner: "product_owner",
          blocking: true,
        },
      ],
    };
    const question = runBriefGate(questionInput);
    expect(question.issues.map((issue) => issue.code)).toContain(
      "BRIEF_OPEN_QUESTION_BLOCKING"
    );
  });
});
