import { expect, test } from "@playwright/test";

test.describe("Public pages (PRD §5 — Step 16)", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  const routes = [
    "/",
    "/login",
    "/terms",
    "/privacy",
    "/contact",
    "/auth/forgot-password",
  ] as const;

  for (const path of routes) {
    test(`${path} returns 200 without auth`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      // Every public page should render some kind of heading.
      await expect(page.locator("h1, h2").first()).toBeVisible();
    });
  }
});
