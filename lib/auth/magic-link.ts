/**
 * Magic-link token helpers.
 *
 * PRD §1D + §6 feature 9:
 *   - Token is random (32 bytes, base64url) — entropy IS the security
 *   - Only the SHA-256 hash is stored in `magic_links.token_hash`
 *   - Token validity = `consumed_at IS NULL` AND `expires_at > now()`
 *   - Single-use: server marks `consumed_at` on form submission
 *   - No revoke; admin can extend / shorten expiry (≤ 30d future cap)
 *
 * Why hash, not JWT: we never need to inspect token claims — every lookup
 * is by hash anyway. Hashing means a stolen DB dump can't impersonate.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Generate a fresh raw token (URL-safe). Caller hashes for storage. */
export function generateMagicLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Stable SHA-256 hash for `magic_links.token_hash`. */
export function hashMagicLinkToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Construct the public URL the applicant clicks. */
export function buildApplicantUrl(rawToken: string, appUrl?: string): string {
  const base = (appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return `${base}/apply/${rawToken}`;
}

/** Construct the public URL the referral clicks. */
export function buildReferralUrl(rawToken: string, appUrl?: string): string {
  const base = (appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return `${base}/referral/${rawToken}`;
}

/**
 * Construct the public URL the Chairman clicks to sign — no login required,
 * same passwordless model as the applicant/referral links. Served by the
 * top-level (non-dashboard) route /branch-sign/[token].
 */
export function buildChairmanUrl(rawToken: string, appUrl?: string): string {
  const base = (appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return `${base}/branch-sign/${rawToken}`;
}

/** Hours-from-now → ISO timestamp for `magic_links.expires_at`. */
export function ttlToExpiry(ttlHours: number): string {
  return new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
}
