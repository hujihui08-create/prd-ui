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
