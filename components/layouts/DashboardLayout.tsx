/**
 * @tier template
 * @design-spec KG_DesignSystem_v1.md §7.5 (Web app layout — sidebar + top bar + mobile bottom nav)
 * @consumes dashboard/Sidebar, dashboard/TopBar, dashboard/MobileBottomNav, system/SkipToContent
 * @used-by app/(dashboard)/layout.tsx
 *
 * Responsive shell:
 *   - <lg: TopBar above; main content; MobileBottomNav fixed at the bottom.
 *           `pb-mobile-nav` on <main> ensures the last row of content clears
 *           the bottom bar + iOS safe-area inset.
 *   - lg+: Sidebar on the left; TopBar; main content. MobileBottomNav is
 *          hidden via its own `lg:hidden`, and main reverts to `lg:pb-6`.
 */
import * as React from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import { SkipToContent } from "@/components/system/SkipToContent";
import type { AuthContext } from "@/lib/auth/get-user";

interface DashboardLayoutProps {
  auth: AuthContext;
  children: React.ReactNode;
}

export function DashboardLayout({ auth, children }: DashboardLayoutProps) {
  const { activeProfile, activeBranch, email, profiles } = auth;
  return (
    <>
      <SkipToContent />
      <div className="flex min-h-screen bg-surface-page">
        <Sidebar
          role={activeProfile.role}
          branchName={activeBranch?.name}
          workspaceCount={profiles.length}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            fullName={activeProfile.full_name}
            email={email}
            role={activeProfile.role}
            branchName={activeBranch?.name}
          />
          <main
            id="main"
            className="flex-1 overflow-x-hidden px-4 py-6 pb-mobile-nav lg:px-8 lg:pb-6"
          >
            {children}
          </main>
        </div>
        <MobileBottomNav role={activeProfile.role} workspaceCount={profiles.length} />
      </div>
    </>
  );
}
