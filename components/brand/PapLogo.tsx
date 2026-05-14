/**
 * @tier atom
 * @design-spec KG_BrandGuide_PAP.md §1 (PAP logo — blue broken ring + red bolt)
 * @consumes next/image
 * @used-by Sidebar, MobileFormShell, PublicLayout
 *
 * Renders the official PAP logo from /public/brand/pap-logo.png — the file
 * the customer supplied. Do not regenerate or re-vectorise; replace the PNG
 * if the brand updates.
 */
import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import logoSrc from "@/public/brand/pap-logo.png";

interface PapLogoProps {
  /** Pixel height. Width auto-scales from the PNG's natural aspect ratio. Default 32. */
  size?: number;
  className?: string;
  /** Accessible label. Pass null/"" to hide from screen readers (aria-hidden). */
  title?: string | null;
}

export function PapLogo({ size = 32, className, title = "PAP" }: PapLogoProps) {
  const ratio = logoSrc.width / logoSrc.height;
  const width = Math.round(size * ratio);
  return (
    <Image
      src={logoSrc}
      alt={title ?? ""}
      height={size}
      width={width}
      priority
      placeholder="empty"
      className={cn("shrink-0", className)}
      aria-hidden={title === null || title === "" ? true : undefined}
    />
  );
}
