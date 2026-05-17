/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §7.5 (Web app — left sidebar nav)
 * @consumes lib/dashboard/nav
 * @used-by components/layouts/DashboardLayout.tsx
 *
 * Desktop-only left sidebar. Below `lg`, this collapses entirely
 * (hidden lg:flex) and MobileBottomNav takes over.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { UserRole } from "@/types/database";
import { PapLogo } from "@/components/brand/PapLogo";
import { getNavForRole, isNavItemActive } from "@/lib/dashboard/nav";

interface SidebarProps {
  role: UserRole;
  branchName?: string | null;
  /** Number of active workspaces this user has — if >1, render the switcher. */
  workspaceCount?: number;
}

export function Sidebar({ role, branchName, workspaceCount = 1 }: SidebarProps) {
  const pathname = usePathname();
  const isTaylab = role === "taylab_staff";
  const isWing = role === "wing_admin" || role === "wing_chairman";
  const visible = getNavForRole(role);

  // Subtle subtitle. Drops the hardcoded "PAP Kampong Glam" — instead just
  // names the role context (Cross-tenant / Wing / Branch). Branch-specific
  // copy moves to the branchName line above.
  const subtitle = isTaylab
    ? "Cross-tenant ops"
    : isWing
      ? "Wing workspace"
      : "Branch workspace";

  return (
    <aside
      aria-label="Primary"
      className="hidden w-64 shrink-0 border-r border-border bg-surface-card lg:flex lg:flex-col"
    >
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <PapLogo size={32} title={null} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-text-primary">
            {isTaylab ? "Taylab platform" : branchName ?? "Branch"}
          </span>
          <span className="text-xs text-text-muted">{subtitle}</span>
        </div>
      </div>
      {workspaceCount > 1 && (
        <Link
          href="/select-workspace"
          className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-text-secondary hover:bg-surface-page hover:text-text-primary"
        >
          <ArrowLeftRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          <span>Switch workspace ({workspaceCount} available)</span>
        </Link>
      )}
      <nav aria-label="Main" className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-1">
          {visible.map((item) => {
            const active = isNavItemActive(item.href, pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-fast",
                    active
                      ? "bg-surface-page text-text-primary"
                      : "text-text-secondary hover:bg-surface-page hover:text-text-primary",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
