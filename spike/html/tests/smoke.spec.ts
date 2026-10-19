import { expect, test } from "@playwright/test";

test("b-end page has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?page=b");
  await expect(page.getByText("订单管理")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: "artifacts/b-end.png", fullPage: true });
});

test("c-end page keeps bottom nav visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?page=c");
  await expect(page.getByText("发现")).toBeVisible();
  await expect(page.locator(".bottom-nav")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: "artifacts/c-end.png", fullPage: true });
});
