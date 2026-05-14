/**
 * Next.js auto-generates the OpenGraph image at /opengraph-image from this
 * file using next/og's ImageResponse. WhatsApp, Slack, Telegram, iMessage,
 * Discord, etc. all read the resulting <meta property="og:image"> tag and
 * show this 1200x630 PNG when the URL is shared — instead of falling back
 * to the (small) favicon.
 *
 * The PAP logo SVG is inlined so the rendered image is fully self-contained
 * — no external fetches, no font-loading flakiness during build.
 */
import { ImageResponse } from "next/og";

export const alt = "Kampong Glam Branch — Membership Application Portal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
          background: "#FFFFFF",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* PAP bolt-and-ring mark, rendered inline so no asset fetch */}
        <svg
          width="200"
          height="260"
          viewBox="0 0 100 130"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <mask id="ringMask">
              <rect width="100" height="130" fill="white" />
              <path
                d="M 62 4 L 26 62 L 48 62 L 40 126 L 74 64 L 54 64 Z"
                fill="black"
                stroke="black"
                strokeWidth="12"
                strokeLinejoin="round"
              />
            </mask>
          </defs>
          <circle
            cx="50"
            cy="65"
            r="44"
            fill="none"
            stroke="#0052A1"
            strokeWidth="13"
            mask="url(#ringMask)"
          />
          <path
            d="M 62 4 L 26 62 L 48 62 L 40 126 L 74 64 L 54 64 Z"
            fill="#EF3340"
            strokeLinejoin="round"
          />
        </svg>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: "#1A1A1A",
              letterSpacing: -0.5,
            }}
          >
            Kampong Glam Branch
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#525252",
            }}
          >
            Membership Application Portal
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
