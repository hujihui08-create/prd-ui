import { chromium, type Browser } from "playwright";
import type { RenderMetrics, RenderMetricsPage } from "@prd-ui/contracts";
import {
  DETERMINISTIC_CSS,
  FIXED_SCREENSHOT_TIME,
  LAUNCH_ARGS,
  SCREENSHOT_TIMEZONE,
  createStaticServer,
} from "../visual/screenshot.js";

export interface MeasurePagesInput {
  htmlDir: string;
  project: string;
  pages: Array<{ pageId: string; target: "mobile" | "web" }>;
}

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const WEB_VIEWPORT = { width: 1440, height: 900 } as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Measure every rendered page in its default state.
 *
 * Geometry is deterministic across runs: fixed viewport, `deviceScaleFactor`
 * 1, frozen clock, reduced motion, animations/transitions disabled by
 * `DETERMINISTIC_CSS`, and fonts settled before measuring. The browser does
 * the reading; Node only assembles the artifact. Any missing page is an
 * infrastructure error (the caller exits 2) rather than a zero-metric page.
 */
export async function measurePages(input: MeasurePagesInput): Promise<RenderMetrics> {
  const server = await createStaticServer(input.htmlDir);
  let browser: Browser | undefined;
  try {
    try {
      browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
    } catch (error) {
      throw new Error(
        `MEASURE_BROWSER_UNAVAILABLE: ${errorMessage(error)} ` +
          "(run `pnpm exec playwright install chromium`)"
      );
    }

    const pages: RenderMetricsPage[] = [];
    for (const page of input.pages) {
      const viewport = page.target === "web" ? WEB_VIEWPORT : MOBILE_VIEWPORT;
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        locale: "zh-CN",
        timezoneId: SCREENSHOT_TIMEZONE,
        reducedMotion: "reduce",
      });
      try {
        const tab = await context.newPage();
        await tab.clock.setFixedTime(FIXED_SCREENSHOT_TIME);
        const url = `${server.url}/${encodeURIComponent(page.pageId)}.html`;
        const response = await tab.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
        if (response === null || !response.ok()) {
          throw new Error(
            `PAGE_HTML_MISSING: ${page.pageId} (${
              response === null ? "no response" : response.status()
            })`
          );
        }
        // Fonts are a layout input; `ready` settles after either load or
        // failure, so an offline measure still completes.
        await tab.evaluate(
          "document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true"
        );
        await tab.addStyleTag({ content: DETERMINISTIC_CSS });
        await tab.evaluate(
          "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))"
        );

        // A string script avoids tsx/esbuild `keepNames` injecting `__name`
        // into the serialized function body (the browser has no such helper).
        const payload = JSON.stringify({
          pageId: page.pageId,
          target: page.target,
          viewport,
        });
        const measured = (await tab.evaluate(`(() => {
          const input = ${payload};
          const { pageId, target, viewport } = input;
          const appScroll = document.querySelector(".app-scroll");
          const scrollElement = appScroll ?? document.scrollingElement;
          const footer = document.querySelector(".app-actions");
          const all = [...document.querySelectorAll("[data-node-id]")];
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;
          const rects = all.map((el) => ({
            id: el.dataset.nodeId || "",
            rect: el.getBoundingClientRect(),
          }));
          const firstScreenNodes = rects.filter(
            ({ rect }) => rect.height > 0 && rect.top < viewportHeight && rect.bottom > 0
          ).length;
          const fold = rects.find(({ rect }) => rect.height > 0 && rect.top >= viewportHeight);
          // Overflow is a layout property, not a property of labeled nodes: an
          // unlabeled child can be wider than the viewport. Scan every element
          // and fall back to the scroll container's scrollWidth for overflow
          // that no element rect exposes (e.g. pseudo-elements).
          const labeledAncestor = (el) => el.closest("[data-node-id]");
          let widestElement = null;
          let widestWidth = 0;
          for (const el of document.querySelectorAll("*")) {
            const width = el.getBoundingClientRect().width;
            if (width <= 0) continue;
            if (width > widestWidth) {
              widestWidth = width;
              widestElement = el;
            } else if (
              width === widestWidth &&
              widestElement !== null &&
              labeledAncestor(widestElement) === null &&
              labeledAncestor(el) !== null
            ) {
              widestElement = el;
            }
          }
          const scrollWidth = scrollElement === null ? 0 : scrollElement.scrollWidth;
          // Only fall back when no element rect exposes the overflow: an
          // overflowing element is the better answer because it carries a
          // specId, while scrollWidth also counts that element's offset.
          if (widestWidth <= viewportWidth && scrollWidth > viewportWidth) {
            widestWidth = scrollWidth;
            widestElement = null;
          }
          const widestLabel = widestElement === null ? null : labeledAncestor(widestElement);
          const widestSpecId =
            widestLabel === null ? undefined : widestLabel.dataset.nodeId || undefined;

          // Content that the footer can cover lives inside the scroll
          // container (page shell nodes are not content). Hidden nodes report
          // a zero rect and are ignored.
          const contentNodes = all.filter(
            (el) =>
              (appScroll === null ? true : appScroll.contains(el)) &&
              !(footer !== null && footer.contains(el))
          );
          const contentBottom = () => {
            let bottom = Number.NEGATIVE_INFINITY;
            for (const el of contentNodes) {
              const rect = el.getBoundingClientRect();
              if (rect.height <= 0) continue;
              if (rect.bottom > bottom) bottom = rect.bottom;
            }
            return bottom;
          };

          let contentBottomGap = 0;
          let overlapsContent = false;
          let footerRect = footer === null ? null : footer.getBoundingClientRect();
          if (footerRect !== null) {
            const previous = scrollElement === null ? null : scrollElement.scrollTop;
            if (scrollElement !== null) {
              scrollElement.scrollTop = scrollElement.scrollHeight;
              footerRect = footer.getBoundingClientRect();
            }
            const bottom = contentBottom();
            if (Number.isFinite(bottom)) {
              contentBottomGap = Math.round(footerRect.top - bottom);
              overlapsContent = bottom > footerRect.top + 0.5;
            }
            if (scrollElement !== null && previous !== null) {
              scrollElement.scrollTop = previous;
            }
          }

          const contentHeight =
            scrollElement === null
              ? document.documentElement.scrollHeight
              : scrollElement.scrollHeight;
          return {
            pageId,
            target,
            viewport,
            documentHeight: Math.max(document.documentElement.scrollHeight, contentHeight),
            contentHeight,
            scrollContainer: {
              selector: appScroll === null ? "document.scrollingElement" : ".app-scroll",
              clientHeight: scrollElement === null ? 0 : scrollElement.clientHeight,
              scrollHeight: scrollElement === null ? 0 : scrollElement.scrollHeight,
              overflowY:
                scrollElement === null ? "visible" : getComputedStyle(scrollElement).overflowY,
            },
            firstScreenNodes,
            ...(fold === undefined ? {} : { foldSpecId: fold.id }),
            widest: {
              ...(widestSpecId === undefined ? {} : { specId: widestSpecId }),
              width: Math.round(widestWidth),
              overflowX: widestWidth > viewportWidth,
            },
            fixedFooter: {
              present: footer !== null,
              height: footerRect === null ? 0 : Math.round(footerRect.height),
              overlapsContent,
            },
            contentBottomGap,
          };
        })()`)) as RenderMetricsPage;
        pages.push(measured);
      } finally {
        await context.close().catch(() => undefined);
      }
    }

    return { schemaVersion: "1.0", project: input.project, pages };
  } finally {
    await browser?.close().catch(() => undefined);
    await server.close();
  }
}
