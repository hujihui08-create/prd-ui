import { z } from "zod";
import { SpecNodeSchema, type SpecNode } from "./page-spec.js";

export interface BlockSpec {
  schemaVersion: "1.0";
  blockId: string;
  pageId: string;
  slot: string;
  index: number;
  role: string;
  allowedComponents: string[];
  tokenProfile: string;
  targetHeight?: { min: number; max: number };
  requiredStates: string[];
  root: SpecNode;
  hash: string;
}

export interface BlockManifest {
  schemaVersion: "1.0";
  project: string;
  pageId: string;
  shell: {
    rootType: string;
    slots: string[];
    wrappers: Array<{
      slot: string;
      specId: string;
      type: string;
      padding?: unknown;
      gap?: unknown;
    }>;
  };
  blocks: BlockSpec[];
  skipped: Array<{ path: string; reason: string }>;
}

export interface BlockContentDraft {
  schemaVersion: "1.0";
  blockId: string;
  root: SpecNode;
}

export const BlockContentDraftSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    blockId: z.string().min(1),
    root: SpecNodeSchema,
  })
  .strict();

export interface BlockExperimentMetrics {
  blockId: string;
  retries: number;
  seams: number;
  tokenDrift: number;
  heightDeltaPct?: number;
}

/**
 * Tri-state conformance result. `not_evaluated` is deliberately distinct from
 * `failed`: a gate that did not run yields insufficient evidence, while a gate
 * that ran and found blockers is a hard failure.
 */
export type BlockConformanceStatus = "passed" | "failed" | "not_evaluated";

export interface BlockExperimentPage {
  pageId: string;
  metrics: BlockExperimentMetrics[];
  pageRetries: number;
  costCny: number;
  durationMs: number;
  conformance: BlockConformanceStatus;
  /** False when the assembled block manifest has structural blockers. */
  blockVerifyPassed?: boolean;
  parityPassed?: boolean;
}

export interface BlockExperimentReport {
  schemaVersion: "1.0";
  project: string;
  baseline: string;
  pages: BlockExperimentPage[];
  conclusion: "promote" | "rollback" | "insufficient_evidence";
  reasons: string[];
}
