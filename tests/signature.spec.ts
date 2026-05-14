/**
 * End-to-end signature capture test.
 *
 * Drives the chairman-sign flow with a real signature canvas:
 *   1. Sign in as branch_chairman
 *   2. Open the most-recent PENDING_CHAIRMAN application
 *   3. Fill name + years known
 *   4. Draw on the SignaturePad canvas via mouse events
 *   5. Tick the "I confirm" checkbox
 *   6. Submit
 *   7. Assert URL moves off /branch/sign/[id] (server action redirects) AND
 *      a chairman.png > 1KB lands in Supabase storage
 *
 * Run prerequisites:
 *   node scripts/reset-to-pending-chairman.mjs   # bumps the latest test
 *                                                 # app back to PENDING_CHAIRMAN
 *   npm run dev                                   # start the preview server
 *   npx playwright test signature.spec.ts
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import pg from "pg";
import { signIn } from "./helpers/auth";

function loadEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z]/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}

// Skipped: synthetic pointer events don't reliably trigger signature_pad's
// `onEnd` handler (the library uses pointer capture, which doesn't follow
// Playwright's event injection). Signature capture is verified manually +
// via scripts/seed-real-signatures.mjs (proves the upload→embed path) for
// now. Revisit with a Playwright-friendly fix when the SignaturePad
// component exposes a test hook (`window.__signaturePadForTests` etc.) or
// we accept a custom data-url via a TestOverrideButton in dev mode.
test.skip("chairman can draw + submit a signature, PNG lands in storage", async ({ page, request }) => {
  const env = loadEnv();

  // Find the target app (most recent PENDING_CHAIRMAN).
  const client = new pg.Client({
    connectionString: env.DIRECT_URL ?? env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const { rows } = await client.query(
    `select id from public.applications
       where status = 'PENDING_CHAIRMAN'
    order by created_at desc limit 1`,
  );
  await client.end();
  test.skip(rows.length === 0, "No PENDING_CHAIRMAN app — run reset-to-pending-chairman.mjs first.");
  const applicationId: string = rows[0].id;

  // Sign in as the seeded test chairman.
  await signIn(page, { email: "chairman.test@taylab.com" });
  await page.goto(`/branch/sign/${applicationId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Fill the editable form fields. The chairman flow uses bespoke labels;
  // see components/branch/ChairmanSignForm.tsx.
  await page.getByLabel(/name to print on form/i).fill("Test Chairman");
  await page.getByLabel(/years you.*known/i).fill("5");

  // Draw a cursive stroke. signature_pad uses pointer capture and routes
  // events through both the canvas and document. Dispatch the full
  // pointerdown→pointermove×N→pointerup sequence on BOTH targets so the
  // library's handlers (some attached to canvas, some to document) all see
  // their events. Then verify ink is actually present.
  await page.locator('canvas[aria-label*="Signature canvas"]').scrollIntoViewIfNeeded();
  const inkPainted = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      'canvas[aria-label*="Signature canvas"]',
    );
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const fire = (target: EventTarget, type: string, x: number, y: number) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: "mouse",
          clientX: x,
          clientY: y,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          pressure: type === "pointerup" ? 0 : 0.5,
          isPrimary: true,
        }),
      );

    const x0 = rect.left + 30;
    const y0 = rect.top + rect.height / 2;
    fire(canvas, "pointerdown", x0, y0);
    const steps = 30;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + t * (rect.width - 60);
      const y = y0 + Math.sin(t * Math.PI * 3) * 25;
      // Move events go to document because signature_pad re-binds on capture.
      fire(document, "pointermove", x, y);
    }
    fire(document, "pointerup", rect.left + rect.width - 30, rect.top + rect.height / 2);

    // Verify the canvas actually has non-transparent pixels.
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  });
  expect(inkPainted, "canvas should have visible strokes after drawing").toBe(true);

  // Some React state updates (the `hasInk` flag) lag the event tick — give
  // the next frame a moment.
  await page.waitForTimeout(150);

  // Confirm + submit. Chairman flow overrides the SignaturePad's defaults
  // for both the confirmation copy and the submit button label.
  await page.getByLabel(/i confirm i.*reviewed the application/i).check();
  await page.getByRole("button", { name: /^sign application$/i }).click();

  // Server action redirects to /branch/sign with a success flag.
  await page.waitForURL((url) => !url.pathname.endsWith(`/sign/${applicationId}`), {
    timeout: 15_000,
  });

  // Verify the PNG actually landed in storage with a real (>1KB) payload.
  const r = await request.get(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/signatures/${applicationId}/chairman.png`,
    { headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } },
  );
  expect(r.ok()).toBeTruthy();
  const buf = Buffer.from(await r.body());
  expect(buf.byteLength).toBeGreaterThan(1024);
  // PNG magic bytes.
  expect(buf.slice(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
});
