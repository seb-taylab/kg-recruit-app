/**
 * @tier template
 * @design-spec KG_DesignSystem_v1.md §7.6 (Website rules)
 * @brand-spec KG_BrandGuide_PAP.md §3.2 (logo placement — top-centre, 64×64px)
 * @consumes system/SkipToContent
 * @used-by app/(public)/layout.tsx
 */
import * as React from "react";
import Link from "next/link";
import { SkipToContent } from "@/components/system/SkipToContent";
import { PapLogo } from "@/components/brand/PapLogo";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SkipToContent />
      <div className="flex min-h-screen flex-col bg-surface-page text-text-primary">
        <header className="border-b border-border bg-surface-card">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
            <Link
              href="/"
              className="flex items-center gap-3 text-sm font-semibold text-text-primary"
              aria-label="PAP Kampong Glam Branch — home"
            >
              <PapLogo size={36} title={null} />
              <span>PAP Kampong Glam Branch</span>
            </Link>
            <Link
              href="/login"
              className="text-sm font-semibold text-brand-blue hover:underline"
            >
              Sign in
            </Link>
          </div>
        </header>
        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>
        <footer className="border-t border-border bg-surface-card">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>&copy; PAP Kampong Glam Branch</p>
            <nav aria-label="Legal" className="flex gap-4">
              <Link href="/contact" className="hover:text-text-primary">
                Contact
              </Link>
              <Link href="/terms" className="hover:text-text-primary">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-text-primary">
                Privacy
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}
