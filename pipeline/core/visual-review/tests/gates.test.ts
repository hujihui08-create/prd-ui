import { describe, expect, it } from "vitest";
import type {
  ScreenshotEvidence,
  VisualCase,
  VisualFinding,
} from "../src/index.js";
import { runVisualGate, visualReviewStatus } from "../src/index.js";

const visualCase: VisualCase = {
  id: "a.default",
  pageId: "a",
  state: "default",
  viewport: { width: 390, height: 844 },
};

function screenshot(overrides: Partial<ScreenshotEvidence>): ScreenshotEvidence {
  return {
    caseId: "a.default",
    path: "screenshots/a.default.png",
    sha256: "0".repeat(64),
    consoleErrors: 0,
    overflow: false,
    ...overrides,
  };
}

describe("runVisualGate", () => {
  it("blocks missing screenshots, console errors, overflow, and diff", () => {
    const gate = runVisualGate({
      cases: [visualCase],
      screenshots: [],
      findings: [],
      diff: [],
    });
    expect(gate.issues.map((entry) => entry.code)).toContain(
      "VISUAL_SCREENSHOT_MISSING"
    );
  });

  it("reports every deterministic blocker with page and evidence context", () => {
    const gate = runVisualGate({
      cases: [
        visualCase,
        { ...visualCase, id: "b.default", pageId: "b" },
        { ...visualCase, id: "c.default", pageId: "c" },
      ],
      screenshots: [
        screenshot({
          caseId: "b.default",
          path: "screenshots/b.default.png",
          consoleErrors: 2,
        }),
        screenshot({
          caseId: "c.default",
          path: "screenshots/c.default.png",
          overflow: true,
        }),
      ],
      findings: [],
      diff: [{ caseId: "a.default", diffPixels: 20, totalPixels: 1000 }],
    });

    expect(gate.passed).toBe(false);
    const codes = gate.issues.map((entry) => entry.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "VISUAL_SCREENSHOT_MISSING",
        "VISUAL_CONSOLE_ERROR",
        "VISUAL_OVERFLOW",
        "VISUAL_DIFF_EXCEEDED",
      ])
    );
    expect(gate.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "VISUAL_SCREENSHOT_MISSING:a.default",
          severity: "blocker",
          pageId: "a",
          state: "default",
        }),
        expect.objectContaining({
          id: "VISUAL_CONSOLE_ERROR:b.default",
          severity: "blocker",
          evidence: "screenshots/b.default.png",
        }),
        expect.objectContaining({
          id: "VISUAL_OVERFLOW:c.default",
          severity: "blocker",
          evidence: "screenshots/c.default.png",
        }),
        expect.objectContaining({
          id: "VISUAL_DIFF_EXCEEDED:a.default",
          severity: "blocker",
          message: "a.default diff 2.00% > 1%",
        }),
      ])
    );
  });

  it("passes a complete run within the diff threshold", () => {
    const gate = runVisualGate({
      cases: [visualCase],
      screenshots: [screenshot({})],
      findings: [],
      diff: [{ caseId: "a.default", diffPixels: 10, totalPixels: 1000 }],
    });
    expect(gate.passed).toBe(true);
    expect(gate.issues).toEqual([]);
  });

  it("treats a missing baseline as zero diff and 1% as the boundary", () => {
    const gate = runVisualGate({
      cases: [visualCase],
      screenshots: [screenshot({})],
      findings: [],
      diff: [
        { caseId: "a.default", diffPixels: 1, totalPixels: 100 },
        { caseId: "a.default", diffPixels: 5, totalPixels: 0 },
      ],
    });
    expect(gate.passed).toBe(true);
    expect(gate.issues).toEqual([]);
  });

  it("appends findings and only blockers fail the gate", () => {
    const major: VisualFinding = {
      id: "VC-001",
      severity: "major",
      code: "VISUAL_CRITIC_MAJOR",
      message: "density is uneven",
    };
    const warningOnly = runVisualGate({
      cases: [visualCase],
      screenshots: [screenshot({})],
      findings: [major],
      diff: [],
    });
    expect(warningOnly.passed).toBe(true);
    expect(warningOnly.issues).toEqual([major]);

    const blocker: VisualFinding = {
      id: "VC-002",
      severity: "blocker",
      code: "VISUAL_CRITIC_BLOCKER",
      pageId: "a",
      state: "default",
      message: "primary action is below the fold",
      evidence: "screenshots/a.default.png",
    };
    const blocked = runVisualGate({
      cases: [visualCase],
      screenshots: [screenshot({})],
      findings: [major, blocker],
      diff: [],
    });
    expect(blocked.passed).toBe(false);
    expect(blocked.issues).toEqual([major, blocker]);
  });
});

describe("visualReviewStatus", () => {
  it("derives status from gates and signoff", () => {
    expect(
      visualReviewStatus({
        gatePassed: true,
        hasBlockingFinding: false,
        signoffValid: false,
      })
    ).toBe("awaiting_signoff");
    expect(
      visualReviewStatus({
        gatePassed: true,
        hasBlockingFinding: false,
        signoffValid: true,
      })
    ).toBe("passed");
    expect(
      visualReviewStatus({
        gatePassed: false,
        hasBlockingFinding: false,
        signoffValid: true,
      })
    ).toBe("blocked");
  });

  it("blocks on a blocking critic finding even when deterministic gates pass", () => {
    expect(
      visualReviewStatus({
        gatePassed: true,
        hasBlockingFinding: true,
        signoffValid: true,
      })
    ).toBe("blocked");
  });
});
