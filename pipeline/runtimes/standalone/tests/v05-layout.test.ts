import { access, mkdtemp, rm } from "node:fs/promises";
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

describe.skipIf(!hasChromium)("v0.5 layout", () => {
  let root: string;
  let server: StaticServer;
  let browser: Browser;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "prd-ui-v05-layout-"));
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
    return browser.newPage({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
  }

  async function height(page: Page, url: string, selector: string): Promise<number> {
    await page.goto(`${server.url}${url}`, { waitUntil: "domcontentloaded" });
    return page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().height);
  }

  it("keeps loading geometry close to the loaded state", async () => {
    const page = await newPage();
    const listDefault = await height(page, "/appointment-list.html", ".calendar");
    const listLoading = await height(page, "/appointment-list.html?state=loading", ".calendar");
    expect(Math.abs(listDefault - listLoading)).toBeLessThanOrEqual(8);

    const detailDefault = await height(page, "/appointment-detail.html", ".card");
    const detailLoading = await height(
      page,
      "/appointment-detail.html?state=loading",
      ".card"
    );
    expect(Math.abs(detailDefault - detailLoading)).toBeLessThanOrEqual(8);
    await page.close();
  }, 60_000);

  it("keeps list chrome and uses an inline empty band", async () => {
    const page = await newPage();
    await page.goto(`${server.url}/appointment-list.html?state=loading`, {
      waitUntil: "domcontentloaded",
    });
    expect(await page.locator(".state-panel.loading").count()).toBe(0);
    expect(await page.locator(".calendar-day").first().isVisible()).toBe(true);
    expect(await page.locator("[data-view-toggle]").isVisible()).toBe(true);
    expect(await page.locator(".app-actions .btn").isVisible()).toBe(true);

    await page.goto(`${server.url}/appointment-list.html?state=empty`, {
      waitUntil: "domcontentloaded",
    });
    const empty = await page.locator(".empty-state.empty-inline:visible").boundingBox();
    const header = await page.locator(".calendar-day").first().boundingBox();
    expect(empty).not.toBeNull();
    expect(header).not.toBeNull();
    const overlaps =
      empty!.y < header!.y + header!.height && header!.y < empty!.y + empty!.height;
    expect(overlaps).toBe(false);
    await page.close();
  }, 60_000);

  it("removes mode pills and unifies footer/gutter", async () => {
    const page = await newPage();
    await page.goto(`${server.url}/appointment-form.html?mode=reschedule`, {
      waitUntil: "domcontentloaded",
    });
    expect(await page.locator(".mode-tabs").count()).toBe(0);
    expect(await page.locator(".page-title").textContent()).toBe("改期预约");
    expect(await page.locator(".app-actions .btn.primary").isDisabled()).toBe(true);
    const footer = await page.locator(".app-actions .btn.primary").boundingBox();
    expect(footer?.height).toBe(44);

    await page.goto(`${server.url}/today.html`, { waitUntil: "domcontentloaded" });
    const todayCard = await page.locator(".app-scroll .card").first().boundingBox();
    expect(todayCard?.x).toBe(16);

    await page.goto(`${server.url}/appointment-list.html`, {
      waitUntil: "domcontentloaded",
    });
    const calendar = await page.locator(".calendar").first().boundingBox();
    expect(calendar?.x).toBe(16);
    await page.close();
  }, 60_000);
});
