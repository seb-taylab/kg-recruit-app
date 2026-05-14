/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §7.5 (Web app — top bar)
 * @consumes ui/Button
 * @used-by components/layouts/DashboardLayout.tsx
 */
import * as React from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/types/database";

const ROLE_LABEL: Record<UserRole, string> = {
  branch_master_admin: "Master Admin",
  branch_admin: "Admin",
  branch_team_member: "Team Member",
  branch_chairman: "Chairman",
  taylab_staff: "Taylab Staff",
};

interface TopBarProps {
  fullName: string | null;
  email: string | null;
  role: UserRole;
  branchName?: string | null;
}

export function TopBar({ fullName, email, role, branchName }: TopBarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-surface-card px-4">
      <div className="min-w-0">
        {/* Branch name lives in the sidebar. TopBar shows just the role so
            the same identifier doesn't appear three times on one screen. */}
        <p className="truncate text-sm font-semibold text-text-primary">
          {ROLE_LABEL[role]}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-text-primary">{fullName ?? email ?? "Signed in"}</p>
          {fullName && email && <p className="text-xs text-text-muted">{email}</p>}
        </div>
        <form action="/auth/logout" method="post">
          <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
            <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
