/**
 * Shared sign-in helper. Both seeded users share the same password, so
 * one routine covers branch_master_admin + taylab_staff.
 */
import type { Page } from "@playwright/test";

export const SEED_PASSWORD = "ChangeMe!2026";

export const TEST_USERS = {
  masterAdmin: { email: "sebtay@msn.com", expectedLanding: "/branch" },
  taylabStaff: { email: "seb@taylab.com", expectedLanding: "/taylab" },
} as const;

export async function signIn(
  page: Page,
  user: { email: string },
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Both seeded users land at their respective dashboard after auth.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
