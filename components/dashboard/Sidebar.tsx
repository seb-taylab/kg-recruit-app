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
import { cn } from "@/lib/utils/cn";
import type { UserRole } from "@/types/database";
import { PapLogo } from "@/components/brand/PapLogo";
import { getNavForRole, isNavItemActive } from "@/lib/dashboard/nav";

interface SidebarProps {
  role: UserRole;
  branchName?: string | null;
}

export function Sidebar({ role, branchName }: SidebarProps) {
  const pathname = usePathname();
  const isTaylab = role === "taylab_staff";
  const visible = getNavForRole(role);

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
          <span className="text-xs text-text-muted">
            {isTaylab ? "Cross-tenant ops" : "PAP Kampong Glam"}
          </span>
        </div>
      </div>
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
