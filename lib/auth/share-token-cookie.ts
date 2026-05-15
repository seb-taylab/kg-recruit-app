/**
 * @used-by app/(dashboard)/branch/initiate/actions.ts (after invite),
 *          app/(dashboard)/branch/applications/[id]/actions.ts (after referral assign),
 *          app/(dashboard)/branch/applications/[id]/page.tsx (read on render)
 *
 * Flash-cookie carrier for raw magic-link tokens. Previously the
 * minting action redirected to `/branch/applications/<id>?token=<raw>`
 * — that ended up in browser history, server access logs, the Referer
 * header on any outbound link from that page, and any future analytics
 * integration. Anyone who reads any of those gets a working magic link.
 *
 * Now the action writes the raw token to a per-application httpOnly
 * cookie with a 60-second TTL + path scoped to that application's
 * detail page, then redirects without the query string. The detail
 * page reads the cookie via cookies().get() during render. After 60
 * seconds the cookie auto-expires; the next reload shows the standard
 * "no active share token" state.
 *
 * Sebastian's 2026-05-16 security audit, finding H4.
 */
import "server-only";
import { cookies } from "next/headers";

const COOKIE_PREFIX = "kg_share_token_";
const COOKIE_TTL_SECONDS = 60;

function cookieNameFor(applicationId: string): string {
  // Cookie names allow letters/digits/dash/underscore. Application IDs
  // are UUIDs which are safe here.
  return `${COOKIE_PREFIX}${applicationId}`;
}

/**
 * Write the raw token to a per-application cookie. Must be called from
 * a server action or route handler (server components can only READ
 * cookies via cookies().get(), not set them).
 *
 * Scope:
 *   - path     /branch/applications/<id> — cookie isn't sent to any
 *                                          other route
 *   - httpOnly — not readable from client JS
 *   - secure   — only sent over HTTPS in production
 *   - sameSite strict — never sent on cross-origin navigations
 *   - maxAge   60s — just long enough to bridge the redirect-to-render gap
 */
export async function setShareTokenCookie(
  applicationId: string,
  rawToken: string,
): Promise<void> {
  const c = await cookies();
  c.set({
    name: cookieNameFor(applicationId),
    value: rawToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: `/branch/applications/${applicationId}`,
    maxAge: COOKIE_TTL_SECONDS,
  });
}

/**
 * Read the raw token from the per-application cookie. Returns null if
 * no cookie is present (cookie expired, user reloaded after 60s, or
 * they navigated to the detail page directly without going through
 * an action).
 *
 * Safe to call from a server component — only uses cookies().get().
 */
export async function readShareTokenCookie(
  applicationId: string,
): Promise<string | null> {
  const c = await cookies();
  return c.get(cookieNameFor(applicationId))?.value ?? null;
}
