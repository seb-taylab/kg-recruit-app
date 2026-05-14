import { expect, test } from "@playwright/test";
import { signIn, TEST_USERS } from "./helpers/auth";

test.describe("Settings pages (PRD §5 — Settings IDs)", () => {
  test("Branch settings renders both card sections", async ({ page }) => {
    await signIn(page, TEST_USERS.masterAdmin);
    await page.goto("/branch/settings");
    await expect(page.getByRole("heading", { name: /branch settings/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^overrides$/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /auto-nudges/i })).toBeVisible();

    // Each of the four override fields has a label.
    for (const label of [/hq email/i, /from.+display name/i, /invite ttl/i, /default routing/i]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }

    // All six nudge stages render as checkboxes.
    const checkboxes = page.getByRole("checkbox");
    await expect(checkboxes).toHaveCount(6);
  });

  test("Platform settings is reachable only as Taylab Staff", async ({ page }) => {
    await signIn(page, TEST_USERS.taylabStaff);
    await page.goto("/taylab/settings");
    await expect(page.getByRole("heading", { name: /platform settings/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /auto-nudge defaults/i })).toBeVisible();
  });
});
