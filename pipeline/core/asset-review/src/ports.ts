import type {
  AssetBrief,
  AssetCandidate,
  AssetReviewVerdict,
  HardGateResult,
  SourceId,
} from "./contracts.js";

export interface VisualStyle {
  id: string;
  name?: string;
  palette?: string[];
  illustration?: string;
  notes?: string;
}

export interface AssetProducerInput {
  brief: AssetBrief;
  source: SourceId;
  attempt: number;
  runDir: string;
}

export interface AssetProducerPort {
  produce(input: AssetProducerInput): Promise<AssetCandidate>;
}

export interface AssetReviewerInput {
  brief: AssetBrief;
  style: VisualStyle;
  candidate: AssetCandidate;
  hardGate: HardGateResult;
  assetText: string;
  runDir: string;
}

export interface AssetReviewerPort {
  review(input: AssetReviewerInput): Promise<AssetReviewVerdict>;
}

/**
 * Paths passed to this port are relative to the run directory. The adapter
 * owns the actual filesystem and hash implementation.
 */
export interface ArtifactStorePort {
  writeJson(path: string, value: unknown): Promise<void>;
  writeText(path: string, value: string): Promise<void>;
  readText(path: string): Promise<string>;
  hash(path: string): Promise<string>;
}

export interface RunLogger {
  log(event: Record<string, unknown>): Promise<void>;
}

export interface AssetReviewPorts {
  producer: AssetProducerPort;
  reviewer: AssetReviewerPort;
  store: ArtifactStorePort;
  clock: { now(): Date };
  log: RunLogger;
}
