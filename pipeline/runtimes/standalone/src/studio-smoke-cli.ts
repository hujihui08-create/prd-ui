import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium, type ConsoleMessage } from "playwright";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

interface StudioPage {
  id: string;
  html: string;
}

interface StudioData {
  pages: StudioPage[];
}

interface SmokeResult {
  ok: boolean;
  pages: number;
  iframes: number;
  consoleErrors: string[];
  pageErrors: string[];
}

const USAGE = `Usage: pnpm studio:smoke [options]

Options:
  --dir <path>     Built Studio directory (default: studio/dist)
  --timeout <ms>   Per-step timeout (default: 30000)
  --json           Print one JSON summary to stdout
  -h, --help       Print this help and exit`;

function parseArgs(argv: string[]): { dir: string; timeout: number; json: boolean; help: boolean } {
  const options = {
    dir: path.resolve("studio", "dist"),
    timeout: 30_000,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--dir") {
      options.dir = path.resolve(argv[++index] ?? "");
    } else if (argument === "--timeout") {
      options.timeout = Number(argv[++index] ?? "");
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readStudioData(dir: string): Promise<StudioData> {
  const file = path.join(dir, "studio-data.json");
  return JSON.parse(await readFile(file, "utf8")) as StudioData;
}

function startServer(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(async (request, response) => {
    const rawPath = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    if (rawPath === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    const relative = rawPath === "/" ? "index.html" : rawPath.replace(/^\/+/, "");
    const file = path.resolve(dir, relative);
    if (!file.startsWith(path.resolve(dir))) {
      response.writeHead(403).end();
      return;
    }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error("not a file");
      const body = await readFile(file);
      response.writeHead(200, {
        "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("failed to bind studio smoke server"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done()))),
      });
    });
  });
}

function consoleError(message: ConsoleMessage): string | null {
  if (message.type() !== "error") return null;
  const text = message.text();
  const location = message.location().url;
  // Preview iframes load Google Fonts; offline runs log a resource error that
  // is not a Studio regression.
  if (/fonts\.(googleapis|gstatic)\.com/.test(location) || /fonts\.(googleapis|gstatic)\.com/.test(text)) {
    return null;
  }
  return `${location || "inline"}: ${text}`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  if (!Number.isFinite(options.timeout) || options.timeout <= 0) {
    throw new Error("--timeout must be a positive number");
  }

  const data = await readStudioData(options.dir);
  if (!Array.isArray(data.pages) || data.pages.length === 0) {
    throw new Error(`${path.join(options.dir, "studio-data.json")}: no pages`);
  }
  await stat(path.join(options.dir, "index.html"));

  const server = await startServer(options.dir);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let iframes = 0;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.on("console", (message) => {
      const error = consoleError(message);
      if (error !== null) consoleErrors.push(error);
    });
    page.on("pageerror", (error) => pageErrors.push(errorMessage(error)));

    await page.goto(server.url, { waitUntil: "domcontentloaded", timeout: options.timeout });
    await page.waitForSelector("[data-page-id]", { timeout: options.timeout });

    const pageButtons = await page.locator("[data-page-id]").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.pageId ?? "")
    );
    const expected = data.pages.map((entry) => entry.id);
    const missing = expected.filter((id) => !pageButtons.includes(id));
    if (missing.length > 0) {
      throw new Error(`page tree is missing: ${missing.join(", ")}`);
    }

    for (const entry of data.pages) {
      await page.locator(`[data-page-id="${entry.id}"]`).click();
      await page.waitForFunction(
        (html) => {
          const frame = document.querySelector("iframe");
          return frame !== null && (frame.getAttribute("src") ?? "").includes(html);
        },
        entry.html,
        { timeout: options.timeout }
      );
      const src = await page.locator("iframe").getAttribute("src");
      if (src === null || !src.includes(entry.html)) {
        throw new Error(`${entry.id}: iframe src did not switch to ${entry.html}`);
      }
      const frame = page.frames().find((candidate) => candidate.url().includes(entry.html));
      if (frame === undefined) {
        throw new Error(`${entry.id}: iframe frame did not attach`);
      }
      await frame.waitForLoadState("domcontentloaded", { timeout: options.timeout }).catch(() => undefined);
      iframes += 1;
    }

    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      throw new Error(
        `browser errors: ${[...pageErrors, ...consoleErrors].join(" | ")}`
      );
    }
  } finally {
    await browser?.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }

  const result: SmokeResult = {
    ok: true,
    pages: data.pages.length,
    iframes,
    consoleErrors,
    pageErrors,
  };
  if (options.json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`studio smoke: ${result.pages} pages / ${result.iframes} iframes / 0 browser errors`);
  }
}

main().catch((error: unknown) => {
  console.error(`studio smoke FAILED: ${errorMessage(error)}`);
  process.exitCode = 1;
});
