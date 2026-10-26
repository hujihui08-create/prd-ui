import { chromium, type Browser } from "playwright";
import type { StyleManifest, StyleNode } from "@prd-ui/contracts";
import { parseCssColor } from "@prd-ui/figma";
import {
  DETERMINISTIC_CSS,
  FIXED_SCREENSHOT_TIME,
  LAUNCH_ARGS,
  SCREENSHOT_TIMEZONE,
  createStaticServer,
} from "../visual/screenshot.js";

export interface CaptureStyleInput {
  htmlDir: string;
  pages: Array<{ pageId: string; viewport: { width: number; height: number } }>;
}

/** A captured node with the background split so alpha is derived in Node. */
type RawStyleNode = Omit<StyleNode, "background"> & { backgroundColor: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Capture computed styles for every `[data-node-id]` element on each page.
 *
 * Pure observation: no color un-compositing. `backgroundColor` and border
 * colors are kept exactly as Chrome serializes them (`rgb(...)`,
 * `rgba(...)`, `color(srgb ...)`); the comparator's tint rule handles
 * translucent plan colors. `boxShadow` is kept raw so the comparator can read
 * an inset bottom underline (selected calendar day).
 */
export async function captureStyleManifests(
  input: CaptureStyleInput
): Promise<StyleManifest[]> {
  const server = await createStaticServer(input.htmlDir);
  let browser: Browser | undefined;
  try {
    try {
      browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
    } catch (error) {
      throw new Error(
        `CONFORMANCE_BROWSER_UNAVAILABLE: ${errorMessage(error)} ` +
          "(run `pnpm exec playwright install chromium`)"
      );
    }
    const manifests: StyleManifest[] = [];
    for (const page of input.pages) {
      const context = await browser.newContext({
        viewport: page.viewport,
        deviceScaleFactor: 1,
        locale: "zh-CN",
        timezoneId: SCREENSHOT_TIMEZONE,
        reducedMotion: "reduce",
      });
      try {
        const tab = await context.newPage();
        await tab.clock.setFixedTime(FIXED_SCREENSHOT_TIME);
        const response = await tab.goto(`${server.url}/${encodeURIComponent(page.pageId)}.html`, {
          waitUntil: "networkidle",
          timeout: 60_000,
        });
        if (response === null || !response.ok()) {
          throw new Error(
            `PAGE_HTML_MISSING: ${page.pageId} (${
              response === null ? "no response" : response.status()
            })`
          );
        }
        // Fonts are a layout input; `document.fonts.ready` settles after either
        // load or failure, so an offline capture still completes.
        await tab.evaluate(
          "document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true"
        );
        await tab.addStyleTag({ content: DETERMINISTIC_CSS });
        await tab.evaluate(
          "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))"
        );
        // A string script avoids tsx/esbuild `keepNames` injecting `__name`
        // into the serialized function body (the browser has no such helper).
        const raw = (await tab.evaluate(`(() => {
          const px = (value) => Number.parseFloat(value) || 0;
          return [...document.querySelectorAll("[data-node-id]")].map((el) => {
            const cs = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return {
              specId: el.dataset.nodeId || "",
              tag: el.tagName.toLowerCase(),
              text: (el.innerText || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 300),
              rect: { width: Math.round(rect.width), height: Math.round(rect.height) },
              padding: {
                top: px(cs.paddingTop),
                right: px(cs.paddingRight),
                bottom: px(cs.paddingBottom),
                left: px(cs.paddingLeft),
              },
              gap: { row: px(cs.rowGap), column: px(cs.columnGap) },
              border: {
                top: { width: px(cs.borderTopWidth), color: cs.borderTopColor },
                right: { width: px(cs.borderRightWidth), color: cs.borderRightColor },
                bottom: { width: px(cs.borderBottomWidth), color: cs.borderBottomColor },
                left: { width: px(cs.borderLeftWidth), color: cs.borderLeftColor },
              },
              radius: px(cs.borderTopLeftRadius),
              backgroundColor: cs.backgroundColor,
              boxShadow: cs.boxShadow,
              font: {
                family: cs.fontFamily,
                size: px(cs.fontSize),
                weight: Number.parseInt(cs.fontWeight, 10) || 400,
                color: cs.color,
                lineHeight: cs.lineHeight === "normal" ? 0 : px(cs.lineHeight),
              },
            };
          });
        })()`)) as RawStyleNode[];
        const nodes = new Map<string, StyleNode>();
        for (const node of raw) {
          const { backgroundColor, ...rest } = node;
          if (node.specId === "" || nodes.has(node.specId)) continue;
          nodes.set(node.specId, {
            ...rest,
            background: {
              color: backgroundColor,
              alpha: parseCssColor(backgroundColor)?.a ?? 0,
            },
          });
        }
        manifests.push({
          schemaVersion: "1.0",
          pageId: page.pageId,
          viewport: page.viewport,
          capturedAt: FIXED_SCREENSHOT_TIME,
          nodes: [...nodes.values()],
        });
      } finally {
        await context.close().catch(() => undefined);
      }
    }
    return manifests;
  } finally {
    await browser?.close().catch(() => undefined);
    await server.close();
  }
}
