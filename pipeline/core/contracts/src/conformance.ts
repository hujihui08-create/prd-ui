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
}

export interface ConformanceReport {
  schemaVersion: "1.0";
  project: string;
  generatedAt: string;
  pages: ConformancePage[];
  summary: { blockers: number; majors: number; pages: number };
}
