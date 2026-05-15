/**
 * @used-by app/api/address/lookup/route.ts (OneMap proxy)
 *
 * In-memory per-IP token-bucket rate limiter. Used to slow down public
 * endpoints that proxy upstream services we don't want to burn quota on.
 *
 * Trade-offs (Sebastian's 2026-05-16 audit, finding M1):
 *   - In-memory state means each Vercel function instance has its own
 *     bucket. An attacker who hits a cold-started + warm instance
 *     simultaneously could get ~2× the rate. Acceptable for our scale
 *     (pilot branch, single-user-class public endpoint).
 *   - No persistence across cold starts — attacker who waits between
 *     bursts gets a fresh allowance. Also acceptable; goal is to slow
 *     scraping, not block determined attackers.
 *
 * If/when we need real distributed rate limiting (multi-region, sustained
 * attack), swap to @upstash/ratelimit or Vercel KV without changing the
 * caller interface.
 */

interface Bucket {
  /** Floating-point token count (fractional refills allowed). */
  tokens: number;
  /** Last time we computed refill, ms-since-epoch. */
  lastRefill: number;
  /** When this bucket was last touched — used by the GC sweep. */
  lastSeen: number;
}

interface BucketConfig {
  /** Max tokens — also the max burst size. */
  capacity: number;
  /** Tokens added per second. capacity / refillPerSec = sustained interval. */
  refillPerSec: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Hourly GC sweep to keep the Map bounded under abuse. Removes buckets
 * untouched for the last hour; the next request from that IP gets a
 * fresh full-capacity bucket which is fine — they've been quiet.
 */
let gcInterval: NodeJS.Timeout | null = null;
function ensureGcStarted() {
  if (gcInterval || typeof setInterval === "undefined") return;
  gcInterval = setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [key, bucket] of buckets) {
      if (bucket.lastSeen < cutoff) buckets.delete(key);
    }
  }, 60 * 60 * 1000);
  // Don't keep the process alive in dev / test.
  if (typeof gcInterval.unref === "function") gcInterval.unref();
}

export interface RateLimitDecision {
  ok: boolean;
  /** Approximate ms to wait before the next attempt would succeed. */
  retryAfterMs: number;
}

/**
 * Try to consume one token from `key`'s bucket. Returns ok=true if the
 * call should proceed, ok=false (+ retryAfterMs) if it should be 429'd.
 */
export function consume(key: string, config: BucketConfig): RateLimitDecision {
  ensureGcStarted();
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: config.capacity, lastRefill: now, lastSeen: now };
    buckets.set(key, bucket);
  } else {
    const elapsedSec = Math.max(0, (now - bucket.lastRefill) / 1000);
    bucket.tokens = Math.min(
      config.capacity,
      bucket.tokens + elapsedSec * config.refillPerSec,
    );
    bucket.lastRefill = now;
  }
  bucket.lastSeen = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { ok: true, retryAfterMs: 0 };
  }
  const retryAfterMs = Math.ceil(((1 - bucket.tokens) / config.refillPerSec) * 1000);
  return { ok: false, retryAfterMs };
}

/**
 * Extract the client IP from a Next.js Request. Trusts the first hop in
 * x-forwarded-for, then falls back to x-real-ip, then to a placeholder
 * (which still gets a per-instance bucket — not great, but the only
 * IP we can't trust IS the one we'd want to rate-limit on).
 */
export function ipFromRequest(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}
