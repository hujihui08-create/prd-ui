export interface StyleBorderSide {
  width: number;
  color: string;
}

export interface StyleNode {
  specId: string;
  tag: string;
  text?: string;
  rect: { width: number; height: number };
  padding: { top: number; right: number; bottom: number; left: number };
  gap: { row: number; column: number };
  border: {
    top: StyleBorderSide;
    right: StyleBorderSide;
    bottom: StyleBorderSide;
    left: StyleBorderSide;
  };
  radius: number;
  background: { color: string; alpha: number };
  /** Raw computed `box-shadow`; the renderer paints selected-day accents as an inset underline. */
  boxShadow?: string;
  font: {
    family: string;
    size: number;
    weight: number;
    color: string;
    lineHeight: number;
  };
}

export interface StyleManifest {
  schemaVersion: "1.0";
  pageId: string;
  viewport: { width: number; height: number };
  capturedAt: string;
  nodes: StyleNode[];
  /** Hash of the exact HTML file this manifest was captured from. */
  htmlSha256?: string;
  /** Hash of the Page Spec that produced the HTML. */
  specSha256?: string;
}

export interface ConformanceFinding {
  code:
    | "CONFORMANCE_STYLE_MISMATCH"
    | "CONFORMANCE_NODE_MISSING"
    | "CONFORMANCE_EXTRA_NODE"
    | "CONFORMANCE_TEXT_MISMATCH";
  severity: "blocker" | "major" | "minor";
  specId?: string;
  property?: string;
  expected?: string;
  actual?: string;
  tolerance?: number;
  message: string;
}

export interface ConformancePage {
  pageId: string;
  passed: boolean;
  checked: number;
  skipped: number;
  findings: ConformanceFinding[];
  /**
   * Gate-input binding: the hash of the rendered HTML this page was checked
   * against. A handoff package must supply byte-identical HTML.
   */
  htmlSha256?: string;
  /** Hash of the Page Spec file consumed by this gate. */
  specSha256?: string;
}

export interface ConformanceReport {
  schemaVersion: "1.0";
  project: string;
  generatedAt: string;
  pages: ConformancePage[];
  summary: { blockers: number; majors: number; pages: number };
}
