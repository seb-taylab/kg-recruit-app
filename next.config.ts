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
  // Server Actions default to a 1 MB body-size limit. The applicant
  // wizard uploads NRIC scans (up to 8 MB per our server-side cap) and
  // applicant photos (up to 5 MB) via server actions, so the default
  // rejects every NRIC upload at the framework boundary BEFORE the
  // action runs — surfacing as a generic "unexpected response from the
  // server" on the client.
  //
  // 10 MB gives comfortable headroom over both server-side caps and
  // still bounds memory use per invocation. Real validation (MIME +
  // size + magic bytes) happens inside the action via
  // lib/security/file-upload.ts.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
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
