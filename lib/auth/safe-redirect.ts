/**
 * Open-redirect guard for `?next=` style query params on login + auth
 * callbacks.
 *
 * The naive check — `next.startsWith("/")` — accepts protocol-relative
 * URLs like `//evil.com` which browsers treat as cross-origin. This
 * helper requires a SINGLE leading slash followed by a non-slash
 * character, so `/branch/inbox` is fine but `//evil.com`,
 * `/\\evil.com`, and `https://evil.com` are all rejected.
 *
 * Sebastian's 2026-05-16 security audit, finding C2.
 */

const SAFE_INTERNAL_PATH = /^\/(?!\/|\\)[^\\]*$/;

/**
 * Returns the input if it's a safe internal path, otherwise `fallback`.
 * Use this anywhere you'd previously written `next?.startsWith("/")`.
 */
export function safeInternalPath(
  candidate: string | null | undefined,
  fallback: string,
): string {
  if (!candidate) return fallback;
  return SAFE_INTERNAL_PATH.test(candidate) ? candidate : fallback;
}
