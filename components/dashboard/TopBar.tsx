/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §7.5 (Web app — top bar)
 * @consumes ui/Button, brand/PapLogo
 * @used-by components/layouts/DashboardLayout.tsx
 *
 * Mobile (<lg): shows PAP logo + branch name + role indicator. Sign-out
 * lives in MobileMoreSheet so it doesn't compete for the right-edge slot
 * with status badges later. Desktop (lg+): role-only on the left and
 * Sign-out on the right (matches the established sidebar pattern).
 */
import * as React from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PapLogo } from "@/components/brand/PapLogo";
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
  const isTaylab = role === "taylab_staff";
  const mobileBrandLine = isTaylab ? "Taylab platform" : branchName ?? "Branch";

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-surface-card px-4">
      {/* Left — mobile shows logo + branch + role; desktop shows role only
          because the sidebar already carries the brand. */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="lg:hidden">
          <PapLogo size={28} title={null} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary lg:hidden">
            {mobileBrandLine}
          </p>
          <p className="hidden truncate text-sm font-semibold text-text-primary lg:block">
            {ROLE_LABEL[role]}
          </p>
          <p className="truncate text-xs text-text-muted lg:hidden">{ROLE_LABEL[role]}</p>
        </div>
      </div>

      {/* Right — desktop only. Sign-out on mobile lives in MobileMoreSheet. */}
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-text-primary">
            {fullName ?? email ?? "Signed in"}
          </p>
          {fullName && email && <p className="text-xs text-text-muted">{email}</p>}
        </div>
        <form action="/auth/logout" method="post" className="hidden lg:block">
          <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
            <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
