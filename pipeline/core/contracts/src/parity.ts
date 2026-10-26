export interface ParityThresholds {
  maxPixelDiff: number;
  minSsim: number;
  maxClusterPixels: number;
}

export interface ParityFinding {
  code:
    | "PARITY_PIXEL_DIFF"
    | "PARITY_SSIM"
    | "PARITY_SIZE_MISMATCH"
    | "PARITY_DIFF_CLUSTER"
    | "BASELINE_STALE";
  severity: "blocker";
  message: string;
}

export interface ParityPage {
  pageId: string;
  passed: boolean;
  pixelDiffRatio: number;
  ssim: number;
  maxDiffCluster: number;
  baselineFile: string;
  figmaFile: string;
  baselineHash: string;
  figmaHash: string;
  width: number;
  height: number;
  diffFile?: string;
  findings: ParityFinding[];
}

export interface ParityReport {
  schemaVersion: "1.0";
  project: string;
  generatedAt: string;
  thresholds: ParityThresholds;
  pages: ParityPage[];
  summary: { passed: boolean; failed: number; pages: number };
}
