import type { Finding } from "./findings.js";

/** Deterministic structure-lint thresholds; projects may override them. */
export interface StructureConfig {
  maxRepeatedSections: number;
  pageHeightBudget: { mobile: number; web: number };
}

export const DEFAULT_STRUCTURE_CONFIG: StructureConfig = {
  maxRepeatedSections: 2,
  pageHeightBudget: { mobile: 2100, web: 2400 },
};

export interface StructureLintPage {
  pageId: string;
  estimatedHeight: number;
  budget: number;
  findings: Finding[];
}

export interface StructureLintReport {
  schemaVersion: "1.0";
  project: string;
  generatedAt: string;
  config: StructureConfig;
  pages: StructureLintPage[];
  summary: { warnings: number; blockers: number };
}

/**
 * Measurement of one rendered page in its default state. `documentHeight` is
 * the budgeted page height: the taller of the document's scroll height and the
 * app scroll container's `scrollHeight` (so it is never below the viewport).
 * `contentHeight` is the raw scrollable content height before that floor is
 * applied.
 */
export interface RenderMetricsPage {
  pageId: string;
  target: "mobile" | "web";
  viewport: { width: number; height: number };
  documentHeight: number;
  contentHeight: number;
  scrollContainer: {
    selector: string;
    clientHeight: number;
    scrollHeight: number;
    overflowY: string;
  };
  firstScreenNodes: number;
  foldSpecId?: string;
  widest: { specId?: string; width: number; overflowX: boolean };
  fixedFooter: { present: boolean; height: number; overlapsContent: boolean };
  contentBottomGap: number;
}

/** `render:measure` artifact: deterministic geometry for every rendered page. */
export interface RenderMetrics {
  schemaVersion: "1.0";
  project: string;
  pages: RenderMetricsPage[];
}

/** One node-level difference between two versions of the same page. */
export interface StructureNodeChange {
  specId: string;
  /**
   * `slot` covers two shapes: a matched node changing container slot
   * (before/after are the slot names, `"children"` for direct children), or a
   * matched parent gaining/losing an empty slot (`property: "slots"`,
   * before/after are the sorted slot-key lists).
   */
  kind: "type" | "prop" | "slot" | "moved";
  property?: string;
  before?: string;
  after?: string;
}

export interface StructurePageDiff {
  pageId: string;
  added: Array<{ specId: string; path: string; type: string }>;
  removed: Array<{ specId: string; path: string; type: string }>;
  changed: StructureNodeChange[];
}

/** `structure:diff` artifact: node-level changes between two spec runs. */
export interface StructureDiff {
  schemaVersion: "1.0";
  before: string;
  after: string;
  pages: StructurePageDiff[];
}
