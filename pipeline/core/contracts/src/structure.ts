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
 * the page's total scrollable height: the taller of the document's scroll
 * height and the app scroll container's `scrollHeight` (so it is never below
 * the viewport).
 */
export interface RenderMetricsPage {
  pageId: string;
  target: "mobile" | "web";
  viewport: { width: number; height: number };
  documentHeight: number;
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
