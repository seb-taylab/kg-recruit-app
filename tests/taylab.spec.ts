import { expect, test } from "@playwright/test";
import { signIn, TEST_USERS } from "./helpers/auth";

test.describe("Taylab Staff dashboard (PRD §5 — Step 15)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEST_USERS.taylabStaff);
  });

  const routes = [
    { path: "/taylab", heading: /platform overview/i },
    { path: "/taylab/branches", heading: /branches/i },
    { path: "/taylab/users", heading: /users/i },
    { path: "/taylab/audit", heading: /audit/i },
    { path: "/taylab/settings", heading: /platform settings/i },
  ] as const;

  for (const { path, heading } of routes) {
    test(`${path} renders an h1`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    });
  }

  test("sidebar shows the Taylab cross-tenant nav", async ({ page }) => {
    await page.goto("/taylab");
    const sidebar = page.getByRole("navigation", { name: /main/i });
    for (const label of ["Overview", "Branches", "Users", "Platform settings", "Audit log"]) {
      await expect(sidebar.getByRole("link", { name: label })).toBeVisible();
    }
  });
});
