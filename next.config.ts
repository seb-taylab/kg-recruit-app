import type { NextConfig } from "next";

/**
 * Security headers applied to every response (Sebastian's 2026-05-16
 * audit, finding L1). Notable choices:
 *
 *   • Strict-Transport-Security — 2-year max-age + includeSubDomains +
 *     preload. kg.taylab.com is HTTPS-only on Vercel; HSTS makes the
 *     browser cache that so a downgrade attack on a fresh visit fails.
 *   • Referrer-Policy: strict-origin-when-cross-origin — outbound
 *     navigation from a magic-link page sends only the origin in the
 *     Referer header, not the raw token in the URL. Defence-in-depth
 *     on top of finding H4 (raw token moved to a flash cookie).
 *   • X-Frame-Options: DENY — no clickjacking via embedding.
 *   • X-Content-Type-Options: nosniff — browser respects the served
 *     Content-Type and doesn't try to MIME-guess (relevant for the
 *     storage buckets serving signed URLs).
 *
 * CSP intentionally not added here. It's a much bigger surface — would
 * need to enumerate every external host we load (Cloudinary, Supabase
 * Storage, OneMap, fonts, etc.) and tune it iteratively. Separate pass.
 */
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
