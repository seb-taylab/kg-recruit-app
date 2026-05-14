/**
 * Next.js auto-generates the OpenGraph image at /opengraph-image from this
 * file using next/og's ImageResponse. WhatsApp, Slack, Telegram, iMessage,
 * Discord etc. all read the resulting <meta property="og:image"> tag and
 * show this 1200x630 PNG when the URL is shared.
 *
 * The PAP logo path data is the canonical artwork from Wikimedia
 * Commons (File:PAP_logo_variation.svg) — same paths live in app/icon.svg.
 * Inlined here so the rendered image is fully self-contained — no
 * external fetches, no font-loading flakiness during build.
 *
 * Edge runtime is the recommended runtime for ImageResponse — faster
 * cold starts than Node, and the only deps we use (next/og + plain
 * constants from lib/design/tokens) are Edge-compatible.
 */
import { ImageResponse } from "next/og";
// next/og's ImageResponse renders via Satori, which can't resolve CSS
// custom properties — Tailwind classes and `var(--token-*)` are both
// no-ops. Read the resolved values directly from the generated tokens.ts
// (auto-generated from tokens.json by Style Dictionary). The validator
// skip-lists lib/design/* so the literal hexes there don't trip it.
import {
  ColorBrandWhite,
  ColorTextMuted,
  ColorTextPrimary,
} from "@/lib/design/tokens";

// Canonical PAP colours from Wikimedia File:PAP_logo_variation.svg —
// kept byte-identical with components/brand/PapLogo.tsx and the favicon
// app/icon.svg so every surface that shows the mark shows the SAME hex.
// (The brand-* tokens used by CTAs / buttons are a slightly different
// approximation — see KG_DesignSystem_v1.md.)
const PAP_BLUE = "#0052A1"; // tokens-ok
const PAP_RED = "#EA312D"; // tokens-ok

export const runtime = "edge";
export const alt = "PAP Kampong Glam — Membership Application Portal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: ColorBrandWhite,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 32,
            marginBottom: 64,
          }}
        >
          {/* Canonical PAP mark — paths copied verbatim from Wikimedia
              File:PAP_logo_variation.svg, native viewBox preserved so the
              proportions match the favicon. */}
          <svg
            width="120"
            height="120"
            viewBox="-25 0 158.75 158.75"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="m33.328,131.239c-19.588,-8.26,-33.328,-27.636,-33.328,-50.239c0,-26.348,18.672,-48.313,43.513,-53.394l-4.757,21.571l-.002,-.004c-11.708,5.802,-19.754,17.872,-19.754,31.827c0,14.377,8.541,26.755,20.827,32.337l-6.496,17.902l6.496,-17.902"
              fill={PAP_BLUE}
            />
            <path
              d="m75.005,30.485c19.942,8.098,33.995,27.657,33.995,50.515c0,30.112,-24.388,54.5,-54.5,54.5c-3.272,0,-6.118,-.288,-9.231,-.84v.06l10.569,-18.249v.015c19.14,-.538,34.162,-16.215,34.162,-35.486c0,-14.741,-8.979,-27.38,-21.768,-32.748h-.003l6.833,-17.739"
              fill={PAP_BLUE}
            />
            <polygon
              fill={PAP_RED}
              points="49.833 89.75 32.083 89.75 53.333 0 82.333 0 58.333 68.75 80.083 68.75 27.333 158.75"
            />
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 40,
                fontWeight: 600,
                color: ColorTextPrimary,
                letterSpacing: -0.5,
              }}
            >
              PAP Kampong Glam
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 400,
                color: ColorTextMuted,
                marginTop: 6,
              }}
            >
              Branch
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: 80,
            fontWeight: 700,
            color: ColorTextPrimary,
            lineHeight: 1.1,
            letterSpacing: -2,
          }}
        >
          Membership Application Portal
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 400,
            color: ColorTextMuted,
            marginTop: 36,
            lineHeight: 1.4,
          }}
        >
          Access by invitation only
        </div>
      </div>
    ),
    { ...size },
  );
}
