import { access } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { createStaticServer, type StaticServer } from "../src/visual/screenshot.js";
import { renderPhase2Html } from "./helpers/phase2-html.js";

const hasChromium = await (async (): Promise<boolean> => {
  try {
    await access(chromium.executablePath());
    return true;
  } catch {
    return false;
  }
})();

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

function composite(color: Rgb): Rgb {
  const a = color.a;
  return {
    r: color.r * a + 255 * (1 - a),
    g: color.g * a + 255 * (1 - a),
    b: color.b * a + 255 * (1 - a),
    a: 1,
  };
}

function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

describe.skipIf(!hasChromium)("v0.5 a11y baseline", () => {
  let root: string;
  let server: StaticServer;
  let browser: Browser;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "prd-ui-v05-a11y-"));
    await renderPhase2Html(root);
    server = await createStaticServer(root);
    browser = await chromium.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  });

  async function newPage(): Promise<Page> {
    return browser.newPage({
      viewport: { width: 390, height: 844 },
      locale: "zh-CN",
    });
  }

  async function readColors(
    page: Page,
    selector: string,
    pseudo?: string
  ): Promise<{ fg: Rgb; bg: Rgb } | null> {
    return page.evaluate(
      ({ selector: target, pseudo: pseudoElement }) => {
        const el = document.querySelector(target);
        if (!el) return null;
        const style = getComputedStyle(el, pseudoElement ?? undefined);
        let node: Element | null = el;
        let background = "rgba(0, 0, 0, 0)";
        while (node) {
          const candidate = getComputedStyle(node).backgroundColor;
          if (
            candidate !== "rgba(0, 0, 0, 0)" &&
            candidate !== "transparent"
          ) {
            background = candidate;
            break;
          }
          node = node.parentElement;
        }
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        const resolve = (value: string) => {
          if (!context) return { r: 0, g: 0, b: 0, a: 1 };
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = value;
          context.fillRect(0, 0, 1, 1);
          const data = context.getImageData(0, 0, 1, 1).data;
          return { r: data[0]!, g: data[1]!, b: data[2]!, a: data[3]! / 255 };
        };
        return { fg: resolve(style.color), bg: resolve(background) };
      },
      { selector, pseudo }
    );
  }

  const checks: Array<{
    url: string;
    selector: string;
    pseudo?: string;
    min?: number;
  }> = [
    { url: "/today.html", selector: ".card-title" },
    { url: "/today.html", selector: ".row-title" },
    { url: "/today.html", selector: ".row-subtitle" },
    { url: "/today.html", selector: ".tab" },
    { url: "/today.html", selector: ".tab.active" },
    { url: "/appointment-form.html", selector: ".form-label" },
    { url: "/appointment-form.html", selector: ".input", pseudo: "::placeholder" },
    { url: "/appointment-list.html", selector: ".calendar-hour" },
    { url: "/appointment-list.html", selector: ".calendar-day" },
    { url: "/appointment-list.html", selector: ".calendar-block-title" },
    { url: "/appointment-list.html", selector: ".badge.tone-warning" },
    { url: "/appointment-list.html", selector: ".badge.tone-success" },
    { url: "/appointment-list.html", selector: ".badge.tone-danger" },
    { url: "/appointment-list.html?state=error", selector: ".error-desc" },
    { url: "/customer-search.html", selector: ".empty-desc" },
    { url: "/appointment-form.html", selector: ".btn.primary" },
    { url: "/appointment-detail.html", selector: ".btn.ghost" },
    { url: "/appointment-detail.html", selector: ".btn.danger" },
  ];

  it("keeps key text above WCAG AA contrast", async () => {
    const page = await newPage();
    const failures: string[] = [];
    for (const check of checks) {
      await page.goto(`${server.url}${check.url}`, { waitUntil: "domcontentloaded" });
      const colors = await readColors(page, check.selector, check.pseudo);
      expect(colors, `${check.url} ${check.selector}`).not.toBeNull();
      const ratio = contrastRatio(
        composite(colors!.fg),
        composite(colors!.bg)
      );
      if (ratio < (check.min ?? 4.5)) {
        failures.push(
          `${check.url} ${check.selector}${check.pseudo ?? ""}: ${ratio.toFixed(2)} < ${check.min ?? 4.5}`
        );
      }
    }
    await page.close();
    expect(failures).toEqual([]);
  }, 120_000);

  it("exposes focus-visible, keyboard activation, and labels", async () => {
    const page = await newPage();
    await page.goto(`${server.url}/appointment-list.html`, {
      waitUntil: "domcontentloaded",
    });

    let focused = "";
    for (let index = 0; index < 40; index += 1) {
      await page.keyboard.press("Tab");
      focused = await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.className ?? ""
      );
      if (focused.includes("calendar-scroll")) break;
    }
    expect(focused).toContain("calendar-scroll");
    const outline = await page.evaluate(
      () => getComputedStyle(document.activeElement as Element).outlineStyle
    );
    expect(outline).not.toBe("none");

    const block = page.locator("[data-block]").first();
    await block.focus();
    await page.keyboard.press("Enter");
    expect(await page.locator(".detail-drawer").count()).toBe(1);
    await page.keyboard.press("Escape");
    expect(await page.locator(".detail-drawer").count()).toBe(0);

    await page.goto(`${server.url}/appointment-form.html`, {
      waitUntil: "domcontentloaded",
    });
    const customer = page.locator('input[name="customer"]');
    expect(await customer.getAttribute("aria-required")).toBe("true");
    expect(
      await customer.evaluate((el) => Boolean(el.closest("label")))
    ).toBe(true);
    await page.close();
  }, 60_000);
});
