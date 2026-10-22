/** One renderable screenshot case in the deterministic visual matrix. */
export interface VisualCase {
  id: string;
  pageId: string;
  state: string;
  query?: Record<string, string>;
  actions?: VisualAction[];
  viewport: { width: number; height: number };
}

export type VisualAction =
  | { kind: "search"; value: string }
  | { kind: "toggle-view" }
  | { kind: "open-drawer" }
  | { kind: "confirm-notice" }
  | { kind: "select-mode"; mode: "new" | "reschedule" };

/** What the screenshot adapter captured for one matrix case. */
export interface ScreenshotEvidence {
  caseId: string;
  path: string;
  sha256: string;
  consoleErrors: number;
  overflow: boolean;
}

export interface VisualFinding {
  id: string;
  severity: "blocker" | "major" | "minor";
  code: string;
  pageId?: string;
  state?: string;
  message: string;
  evidence?: string;
}

/** Pixel diff result for one case against its baseline. */
export interface VisualDiffEntry {
  caseId: string;
  diffPixels: number;
  totalPixels: number;
}

export interface VisualGateInput {
  cases: VisualCase[];
  screenshots: ScreenshotEvidence[];
  findings: VisualFinding[];
  diff: VisualDiffEntry[];
}

export interface VisualGateResult {
  passed: boolean;
  issues: VisualFinding[];
}
