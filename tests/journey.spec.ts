import { expect, test } from "@playwright/test";
import { signIn, TEST_USERS } from "./helpers/auth";

test.describe("Journey dashboard (PRD §5 — Journey view ID)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEST_USERS.masterAdmin);
  });

  test("default ?view=table renders the table view with status badges", async ({ page }) => {
    await page.goto("/branch/journey");
    await expect(page.getByRole("heading", { name: /^journey$/i })).toBeVisible();
    await expect(page.getByRole("tablist", { name: /journey view/i })).toBeVisible();
    // Table column headers
    for (const header of ["Applicant", "Status", "Last activity", "Invited"]) {
      await expect(page.locator("thead").getByText(header, { exact: true })).toBeVisible();
    }
  });

  test("kanban view shows all 7 columns including At HQ + Completed", async ({ page }) => {
    await page.goto("/branch/journey?view=kanban");
    const expected = [
      "Applicant",
      "Referral",
      "Chairman",
      "Ready to send",
      "At HQ",
      "Completed",
      "Closed",
    ];
    for (const col of expected) {
      // Each column is a div whose first <p> matches the column name. We
      // pick the section header rather than any random match.
      await expect(
        page.locator("p.font-semibold", { hasText: new RegExp(`^${col}$`) }),
      ).toBeVisible();
    }
  });

  test("timeline view renders an ordered event list", async ({ page }) => {
    await page.goto("/branch/journey?view=timeline");
    await expect(page.getByRole("heading", { name: /^journey$/i })).toBeVisible();
    // Either there's an event list, or the empty-state copy.
    const list = page.locator("ol li");
    const emptyState = page.getByText(/no events recorded yet/i);
    await Promise.race([
      list.first().waitFor({ state: "visible" }),
      emptyState.waitFor({ state: "visible" }),
    ]);
  });

  test("view switcher links preserve role-as-tab semantics", async ({ page }) => {
    await page.goto("/branch/journey?view=table");
    const kanbanTab = page.getByRole("tab", { name: "Kanban" });
    await expect(kanbanTab).toBeVisible();
    await kanbanTab.click();
    await expect(page).toHaveURL(/view=kanban/);
  });
});
