/**
 * @tier template
 * @design-spec KG_DesignSystem_v1.md §7.5 (Web app layout — sidebar + top bar)
 * @consumes dashboard/Sidebar, dashboard/TopBar, system/SkipToContent
 * @used-by app/(dashboard)/layout.tsx
 */
import * as React from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { SkipToContent } from "@/components/system/SkipToContent";
import type { AuthContext } from "@/lib/auth/get-user";

interface DashboardLayoutProps {
  auth: AuthContext;
  children: React.ReactNode;
}

export function DashboardLayout({ auth, children }: DashboardLayoutProps) {
  const { profile, branch, email } = auth;
  return (
    <>
      <SkipToContent />
      <div className="flex min-h-screen bg-surface-page">
        <Sidebar role={profile.role} branchName={branch?.name} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            fullName={profile.full_name}
            email={email}
            role={profile.role}
            branchName={branch?.name}
          />
          <main id="main" className="flex-1 overflow-x-hidden px-4 py-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
