import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AssetReviewerInput,
  AssetReviewerPort,
  ReviewResult,
} from "@prd-ui/asset-review";
import { renderSvgToPng, type RenderSvgOptions } from "./render-svg.js";

export type RenderSvg = (svg: string, options: RenderSvgOptions) => Promise<Buffer>;

export interface RenderingReviewerOptions {
  scale?: number;
  render?: RenderSvg;
}

export function candidatePngPath(input: AssetReviewerInput): string {
  return `assets/attempts/${input.candidate.assetId}/${input.candidate.source}-${input.candidate.attempt}/candidate.png`;
}

/**
 * Standalone-only reviewer decorator. It renders SVG candidates to PNG before
 * delegating, so the dsh adapter can reference an image without bundling a
 * native renderer. A render failure degrades to SVG-text review with an
 * explicit `RENDER_WARNING` instead of blocking the asset.
 */
export class RenderingReviewer implements AssetReviewerPort {
  constructor(
    private readonly inner: AssetReviewerPort,
    private readonly options: RenderingReviewerOptions = {}
  ) {}

  async review(input: AssetReviewerInput): Promise<ReviewResult> {
    if (input.candidate.file.format !== "svg") {
      return this.inner.review(input);
    }

    const relativePath = candidatePngPath(input);
    const runDir = path.resolve(input.runDir);
    const absolutePath = path.resolve(runDir, relativePath);
    if (absolutePath !== runDir && !absolutePath.startsWith(`${runDir}${path.sep}`)) {
      return this.reviewWithoutImage(input, `artifact path escapes run directory: ${relativePath}`);
    }

    try {
      const render = this.options.render ?? renderSvgToPng;
      const png = await render(input.assetText, { scale: this.options.scale ?? 2 });
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, png);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.reviewWithoutImage(input, message);
    }

    // Keep the reviewer call outside the render try: a reviewer failure must
    // propagate unchanged instead of being retried as an SVG-only fallback.
    return this.inner.review({ ...input, candidateImagePath: absolutePath });
  }

  private async reviewWithoutImage(
    input: AssetReviewerInput,
    reason: string
  ): Promise<ReviewResult> {
    const warning = `RENDER_WARNING: ${input.candidate.assetId}/${input.candidate.source}/${input.candidate.attempt}: ${reason}`;
    const result = await this.inner.review(input);
    return { ...result, renderWarning: warning };
  }
}
