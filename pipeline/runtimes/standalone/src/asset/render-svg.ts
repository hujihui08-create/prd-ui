import { Resvg } from "@resvg/resvg-js";

export interface RenderSvgOptions {
  scale?: number;
}

/**
 * Rasterize an SVG for visual review. `@resvg/resvg-js` is a native dependency
 * and must stay in the standalone runtime: the dsh adapter receives only the
 * resulting file path.
 */
export async function renderSvgToPng(
  svg: string,
  options: RenderSvgOptions = {}
): Promise<Buffer> {
  const scale = options.scale ?? 2;
  try {
    const resvg = new Resvg(svg, {
      fitTo: { mode: "zoom", value: scale },
      // Hard gates reject text; skipping the system font scan keeps each
      // render deterministic and avoids ~1.5s of latency per process.
      font: { loadSystemFonts: false },
    });
    return resvg.render().asPng();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`RENDER_FAILED: ${message}`);
  }
}
