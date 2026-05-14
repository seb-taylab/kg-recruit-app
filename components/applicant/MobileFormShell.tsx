/**
 * @tier template
 * @design-spec KG_DesignSystem_v1.md §7.4 (mobile-first — sticky bottom CTA, single-column)
 * @brand-spec KG_BrandGuide_PAP.md §3.2 (logo top-centre on public surfaces)
 * @used-by app/apply/[token]/page.tsx
 */
import * as React from "react";
import { SkipToContent } from "@/components/system/SkipToContent";
import { PapLogo } from "@/components/brand/PapLogo";

export function MobileFormShell({
  children,
  branchName,
}: {
  children: React.ReactNode;
  branchName: string;
}) {
  return (
    <>
      <SkipToContent />
      <div className="flex min-h-screen flex-col bg-surface-page">
        <header className="border-b border-border bg-surface-card">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-4">
            <PapLogo size={40} title={null} />
            <div className="flex min-w-0 flex-col">
              <p className="truncate text-sm font-semibold text-text-primary">PAP {branchName}</p>
              <p className="text-xs text-text-muted">Membership Application</p>
            </div>
          </div>
        </header>
        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>
      </div>
    </>
  );
}
