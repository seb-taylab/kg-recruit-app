import { expect, test } from "@playwright/test";
import { signIn, TEST_USERS } from "./helpers/auth";

test.describe("Branch dashboard navigation (PRD §5 — IDs 4, 5)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEST_USERS.masterAdmin);
  });

  const routes = [
    { path: "/branch", heading: /.+/ }, // dashboard root
    { path: "/branch/initiate", heading: /invite a new applicant/i },
    { path: "/branch/inbox", heading: /^inbox$/i },
    { path: "/branch/journey", heading: /^journey$/i },
    { path: "/branch/history", heading: /^history$/i },
    { path: "/branch/team", heading: /team/i },
    { path: "/branch/settings", heading: /branch settings/i },
  ] as const;

  for (const { path, heading } of routes) {
    test(`${path} renders an h1`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    });
  }

  test("sidebar contains every branch admin route", async ({ page }) => {
    await page.goto("/branch");
    const sidebar = page.getByRole("navigation", { name: /main/i });
    for (const label of [
      "Overview",
      "Initiate",
      "Inbox",
      "Applications",
      "History",
      "Team",
      "Settings",
    ]) {
      await expect(sidebar.getByRole("link", { name: label })).toBeVisible();
    }
  });

  test("History tabs filter the list", async ({ page }) => {
    await page.goto("/branch/history");
    for (const tab of ["All", "Completed", "HQ rejected", "Archived"]) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    }
    await page.getByRole("tab", { name: "Archived" }).click();
    await expect(page).toHaveURL(/tab=archived/);
  });
});
