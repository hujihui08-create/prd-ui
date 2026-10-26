import type { ParityPage, ParityThresholds } from "@prd-ui/contracts";

/**
 * Pure parity gate: compare a Figma export against the signed HTML baseline.
 * A page passes only when dimensions match and the pixel-diff, mean-SSIM and
 * localized-cluster thresholds are met. Findings are ordered size, pixels,
 * SSIM, cluster, stale baseline.
 */
export function evaluateParityPage(input: {
  pageId: string;
  pixelDiffRatio: number;
  ssim: number;
  maxDiffCluster: number;
  width: number;
  height: number;
  expectedWidth?: number;
  expectedHeight?: number;
  baselineFile: string;
  figmaFile: string;
  baselineHash: string;
  figmaHash: string;
  /** Hash recorded in the signed baseline manifest, when known. */
  baselineManifestHash?: string;
  diffFile?: string;
  thresholds: ParityThresholds;
}): ParityPage {
  const findings: ParityPage["findings"] = [];
  const expectedWidth = input.expectedWidth ?? 390;
  const expectedHeight = input.expectedHeight ?? 844;
  if (input.width !== expectedWidth || input.height !== expectedHeight) {
    findings.push({
      code: "PARITY_SIZE_MISMATCH",
      severity: "blocker",
      message: `Expected ${expectedWidth}x${expectedHeight}, got ${input.width}x${input.height}.`,
    });
  }
  if (input.pixelDiffRatio > input.thresholds.maxPixelDiff) {
    findings.push({
      code: "PARITY_PIXEL_DIFF",
      severity: "blocker",
      message: `Pixel diff ${(input.pixelDiffRatio * 100).toFixed(2)}% > ${(input.thresholds.maxPixelDiff * 100).toFixed(2)}%.`,
    });
  }
  if (input.ssim < input.thresholds.minSsim) {
    findings.push({
      code: "PARITY_SSIM",
      severity: "blocker",
      message: `SSIM ${input.ssim.toFixed(4)} < ${input.thresholds.minSsim.toFixed(4)}.`,
    });
  }
  if (input.maxDiffCluster > input.thresholds.maxClusterPixels) {
    findings.push({
      code: "PARITY_DIFF_CLUSTER",
      severity: "blocker",
      message: `Largest diff cluster ${input.maxDiffCluster}px > ${input.thresholds.maxClusterPixels}px.`,
    });
  }
  if (
    input.baselineManifestHash !== undefined &&
    input.baselineManifestHash !== input.baselineHash
  ) {
    findings.push({
      code: "BASELINE_STALE",
      severity: "blocker",
      message: `Baseline hash ${input.baselineHash} != manifest ${input.baselineManifestHash}; re-sign the baseline.`,
    });
  }
  return {
    pageId: input.pageId,
    passed: findings.length === 0,
    pixelDiffRatio: input.pixelDiffRatio,
    ssim: input.ssim,
    maxDiffCluster: input.maxDiffCluster,
    baselineFile: input.baselineFile,
    figmaFile: input.figmaFile,
    baselineHash: input.baselineHash,
    figmaHash: input.figmaHash,
    width: input.width,
    height: input.height,
    ...(input.diffFile === undefined ? {} : { diffFile: input.diffFile }),
    findings,
  };
}
