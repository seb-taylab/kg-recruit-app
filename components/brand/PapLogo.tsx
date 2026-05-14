/**
 * @tier atom
 * @design-spec KG_BrandGuide_PAP.md §1 (PAP logo — blue broken ring + red bolt)
 * @used-by Sidebar, MobileFormShell, PublicLayout
 *
 * Renders the canonical PAP mark as inline SVG. The path data is the
 * authoritative artwork from Wikimedia Commons (File:PAP_logo_variation.svg)
 * — same paths shipped in app/icon.svg (browser-tab favicon) and inlined
 * in app/opengraph-image.tsx (link-preview card), so every surface that
 * shows a logo shows the SAME logo.
 *
 * Inline SVG (vs. <Image src="/brand/pap-logo.svg" />) keeps the markup
 * self-contained — no network round-trip on first paint, no flash of
 * empty img box, no need to mark the SVG `unoptimized` in next/image
 * config, and the colors stay literal (next/og can't resolve CSS vars,
 * but here in normal SSR we just need the same hex values everywhere).
 *
 * If the brand updates, edit the path data here AND public/brand/pap-logo.svg
 * AND app/icon.svg AND app/opengraph-image.tsx — all four are the same
 * artwork. (The single source of truth is the Wikimedia file.)
 */
import * as React from "react";
import { cn } from "@/lib/utils/cn";

// Native artwork viewBox from the Wikimedia source — the logo is taller
// than wide (109:158.75 ≈ 0.687). Consumers pass `size` as pixel height
// and width auto-scales to preserve the aspect ratio.
const VIEW_W = 109;
const VIEW_H = 158.75;

// Canonical PAP colours from Wikimedia File:PAP_logo_variation.svg.
// Hardcoded literals (NOT the brand-* tokens) because the user's brief is
// "don't modify the logo" — these stay byte-identical to the source SVG
// even if the app's brand tokens drift in the future. tokens-ok opts out
// of validate-tokens for these two lines only.
const PAP_BLUE = "#0052A1"; // tokens-ok
const PAP_RED = "#EA312D"; // tokens-ok

interface PapLogoProps {
  /** Pixel height. Width auto-scales from the artwork's aspect ratio. Default 32. */
  size?: number;
  className?: string;
  /** Accessible label. Pass null/"" to hide from screen readers. */
  title?: string | null;
}

export function PapLogo({ size = 32, className, title = "PAP" }: PapLogoProps) {
  const width = Math.round((size * VIEW_W) / VIEW_H);
  const hidden = title === null || title === "";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width={width}
      height={size}
      role={hidden ? undefined : "img"}
      aria-label={hidden ? undefined : title}
      aria-hidden={hidden ? true : undefined}
      className={cn("shrink-0", className)}
    >
      {!hidden && <title>{title}</title>}
      {/* Blue broken ring — left half */}
      <path
        d="m33.328,131.239c-19.588,-8.26,-33.328,-27.636,-33.328,-50.239c0,-26.348,18.672,-48.313,43.513,-53.394l-4.757,21.571l-.002,-.004c-11.708,5.802,-19.754,17.872,-19.754,31.827c0,14.377,8.541,26.755,20.827,32.337l-6.496,17.902l6.496,-17.902"
        fill={PAP_BLUE}
      />
      {/* Blue broken ring — right half */}
      <path
        d="m75.005,30.485c19.942,8.098,33.995,27.657,33.995,50.515c0,30.112,-24.388,54.5,-54.5,54.5c-3.272,0,-6.118,-.288,-9.231,-.84v.06l10.569,-18.249v.015c19.14,-.538,34.162,-16.215,34.162,-35.486c0,-14.741,-8.979,-27.38,-21.768,-32.748h-.003l6.833,-17.739"
        fill={PAP_BLUE}
      />
      {/* Red lightning bolt */}
      <polygon
        fill={PAP_RED}
        points="49.833 89.75 32.083 89.75 53.333 0 82.333 0 58.333 68.75 80.083 68.75 27.333 158.75"
      />
    </svg>
  );
}
