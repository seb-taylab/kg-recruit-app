/**
 * Playwright config for Step 18 — end-to-end acceptance tests.
 *
 * Tests run against a live dev server on port 3000 (we don't auto-spawn
 * — the preview workflow uses `mcp__Claude_Preview` to manage the server
 * and we don't want Playwright fighting it).
 *
 * Cloud DB: tests log in with the seeded users from supabase/seed.sql
 *   sebtay@msn.com  / ChangeMe!2026  → branch_master_admin
 *   seb@taylab.com  / ChangeMe!2026  → taylab_staff
 *
 * To run locally:
 *   npm run dev          # in one terminal
 *   npm run test:e2e     # in another
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // shared cloud DB — keep tests serial
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
