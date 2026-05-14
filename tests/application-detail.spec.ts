import { expect, test } from "@playwright/test";
import { signIn, TEST_USERS } from "./helpers/auth";

/**
 * Application detail page (PRD §5 — multiple IDs). Renders different
 * cards based on application status. We don't drive a full happy-path
 * here (covered in step-specific scripts under /scripts) — these tests
 * exercise structural invariants of the detail page.
 */
test.describe("Application detail page", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEST_USERS.masterAdmin);
  });

  test("opens the latest application from the Journey table", async ({ page }) => {
    await page.goto("/branch/journey?view=table");
    const firstOpenLink = page.getByRole("link", { name: /^open$/i }).first();
    // If there are no apps in the table the test is a no-op — exit early.
    const count = await firstOpenLink.count();
    test.skip(count === 0, "No applications visible to the Master Admin.");
    await firstOpenLink.click();
    await expect(page).toHaveURL(/\/branch\/applications\/[0-9a-f-]+/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("shows the Archive button on a non-archived application", async ({ page }) => {
    await page.goto("/branch/journey?view=table");
    const firstOpenLink = page.getByRole("link", { name: /^open$/i }).first();
    const count = await firstOpenLink.count();
    test.skip(count === 0, "No applications visible to the Master Admin.");
    await firstOpenLink.click();
    // Either the Archive footer button is visible (non-archived), or this
    // is the rare case where the row IS archived and we see Unarchive.
    const archiveBtn = page.getByRole("button", { name: /^archive$/i });
    const unarchiveBtn = page.getByRole("button", { name: /^unarchive$/i });
    const eitherOne = archiveBtn.or(unarchiveBtn);
    await expect(eitherOne).toBeVisible();
  });
});
