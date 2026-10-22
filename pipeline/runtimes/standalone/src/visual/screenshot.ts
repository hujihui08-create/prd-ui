import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import type {
  ScreenshotEvidence,
  VisualAction,
  VisualCase,
} from "@prd-ui/visual-review";

export interface CaptureVisualCasesInput {
  htmlDir: string;
  cases: VisualCase[];
  outDir: string;
  /** Optional per-case error hook; the case is skipped and the gate reports it. */
  onCaseError?: (caseId: string, error: unknown) => void;
}

export interface StaticServer {
  url: string;
  close: () => Promise<void>;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * A screenshot must not catch a fade/stagger mid-flight. The renderer's fade
 * fallback keeps a 120ms opacity animation alive under reduced motion, so the
 * capture injects a hard override in addition to `emulateMedia`.
 */
export const DETERMINISTIC_CSS =
  "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";

/**
 * Renderer mock data must not drift between captures: `confirmedAt` and
 * calendar headers read `new Date()`. Freeze it at one instant in the
 * project's timezone so two captures of the same HTML are byte-identical.
 */
export const FIXED_SCREENSHOT_TIME = "2026-10-22T09:00:00+08:00";
export const SCREENSHOT_TIMEZONE = "Asia/Shanghai";

/** Let a webfont swap repaint before the first frame is captured. */
const FONT_SETTLE_MS = 200;

const LAUNCH_ARGS = [
  "--force-color-profile=srgb",
  "--disable-lcd-text",
  "--font-render-hinting=none",
  "--disable-gpu",
];

async function hashFile(file: string): Promise<string> {
  const buffer = await readFile(file);
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Minimal static file server on an ephemeral loopback port. Only files under
 * `dir` are served; missing files return 404 and favicon requests return 204.
 */
export async function createStaticServer(dir: string): Promise<StaticServer> {
  const root = path.resolve(dir);
  const server = createServer(async (request, response) => {
    const rawUrl = request.url ?? "/";
    const pathname = rawUrl.split("?")[0] ?? "/";
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      response.writeHead(400);
      response.end("bad request");
      return;
    }
    if (decoded === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
    const filePath = path.resolve(root, relative);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403);
      response.end("forbidden");
      return;
    }
    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type":
          CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
          "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        server.close();
        reject(new Error("STATIC_SERVER_NO_ADDRESS"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
            server.closeAllConnections?.();
          }),
      });
    });
  });
}

async function applyAction(page: Page, action: VisualAction): Promise<void> {
  switch (action.kind) {
    case "toggle-view":
      await page.locator("[data-view-toggle]").first().click();
      return;
    case "open-drawer":
      await page.locator("[data-block]").first().click();
      return;
    case "confirm-notice":
      await page.locator('[data-action="确认已当面告知"]').first().click();
      return;
    case "search":
      await page.locator("[data-search-input]").first().fill(action.value);
      return;
    case "select-mode": {
      const label = action.mode === "new" ? "新增预约" : "改期";
      await page.locator(".mode-tabs button", { hasText: label }).first().click();
      return;
    }
  }
}

async function captureCase(
  browser: Browser,
  serverUrl: string,
  visualCase: VisualCase,
  outDir: string
): Promise<ScreenshotEvidence> {
  const page = await browser.newPage({
    viewport: visualCase.viewport,
    deviceScaleFactor: 1,
    locale: "zh-CN",
    timezoneId: SCREENSHOT_TIMEZONE,
  });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.setFixedTime(FIXED_SCREENSHOT_TIME);
    const query = new URLSearchParams(visualCase.query ?? {}).toString();
    const url = `${serverUrl}/${encodeURIComponent(visualCase.pageId)}.html${
      query ? `?${query}` : ""
    }`;
    const response = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
    if (response !== null && !response.ok()) {
      throw new Error(`SCREENSHOT_HTTP_${response.status()}: ${url}`);
    }
    // Fonts are a layout input; wait for them before any action changes state.
    await page.evaluate(
      "document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true"
    );
    await page.waitForTimeout(FONT_SETTLE_MS);
    await page.addStyleTag({ content: DETERMINISTIC_CSS });
    for (const action of visualCase.actions ?? []) {
      await applyAction(page, action);
    }
    // Let the renderer's synchronous state handlers settle before capture.
    await page.evaluate(
      "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))"
    );

    const overflow = await page.evaluate<boolean>(
      "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"
    );
    const file = path.join(outDir, `${visualCase.id}.png`);
    await page.screenshot({
      path: file,
      fullPage: false,
      animations: "disabled",
      caret: "hide",
    });
    return {
      caseId: visualCase.id,
      path: file,
      sha256: await hashFile(file),
      consoleErrors: errors.length,
      overflow,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * Capture every matrix case against a local static server. One failing case
 * does not abort the run: it is omitted from the evidence, and the visual gate
 * reports `VISUAL_SCREENSHOT_MISSING` for it.
 */
export async function captureVisualCases(
  input: CaptureVisualCasesInput
): Promise<ScreenshotEvidence[]> {
  await mkdir(input.outDir, { recursive: true });
  const server = await createStaticServer(input.htmlDir);
  let browser: Browser | undefined;
  const results: ScreenshotEvidence[] = [];
  try {
    try {
      browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
    } catch (error) {
      throw new Error(
        `VISUAL_BROWSER_UNAVAILABLE: ${errorMessage(error)} ` +
          "(run `pnpm exec playwright install chromium`)"
      );
    }
    for (const visualCase of input.cases) {
      try {
        results.push(
          await captureCase(browser, server.url, visualCase, input.outDir)
        );
      } catch (error) {
        input.onCaseError?.(visualCase.id, error);
      }
    }
  } finally {
    await browser?.close().catch(() => undefined);
    await server.close();
  }
  return results;
}
