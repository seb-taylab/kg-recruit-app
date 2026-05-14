/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §7.5 (Web app — left sidebar nav)
 * @consumes none (Link + lucide-react)
 * @used-by components/layouts/DashboardLayout.tsx
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Inbox,
  UserPlus,
  PenLine,
  GitBranch,
  Users,
  Settings,
  Archive,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { UserRole } from "@/types/database";
import { PapLogo } from "@/components/brand/PapLogo";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
}

const BRANCH_ADMIN_TEAM = [
  "branch_master_admin",
  "branch_admin",
  "branch_team_member",
] as const satisfies readonly UserRole[];

const BRANCH_NAV: NavItem[] = [
  { href: "/branch",         label: "Overview",            icon: LayoutGrid, roles: ["branch_master_admin", "branch_admin", "branch_team_member", "branch_chairman"] },
  { href: "/branch/initiate", label: "Initiate",            icon: UserPlus,   roles: [...BRANCH_ADMIN_TEAM] },
  { href: "/branch/inbox",    label: "Inbox",               icon: Inbox,      roles: [...BRANCH_ADMIN_TEAM] },
  { href: "/branch/sign",     label: "Pending my signature", icon: PenLine,   roles: ["branch_chairman"] },
  { href: "/branch/journey",  label: "Applications",        icon: GitBranch,  roles: ["branch_master_admin", "branch_admin", "branch_team_member", "branch_chairman"] },
  { href: "/branch/history",  label: "History",             icon: Archive,    roles: [...BRANCH_ADMIN_TEAM] },
  { href: "/branch/team",     label: "Team",                icon: Users,      roles: ["branch_master_admin", "branch_admin"] },
  { href: "/branch/settings", label: "Settings",            icon: Settings,   roles: ["branch_master_admin", "branch_admin"] },
];

const TAYLAB_NAV: NavItem[] = [
  { href: "/taylab", label: "Overview", icon: LayoutGrid, roles: ["taylab_staff"] },
  { href: "/taylab/branches", label: "Branches", icon: GitBranch, roles: ["taylab_staff"] },
  { href: "/taylab/users", label: "Users", icon: Users, roles: ["taylab_staff"] },
  { href: "/taylab/settings", label: "Platform settings", icon: Settings, roles: ["taylab_staff"] },
  { href: "/taylab/audit", label: "Audit log", icon: FileText, roles: ["taylab_staff"] },
];

interface SidebarProps {
  role: UserRole;
  branchName?: string | null;
}

export function Sidebar({ role, branchName }: SidebarProps) {
  const pathname = usePathname();
  const isTaylab = role === "taylab_staff";
  const nav = isTaylab ? TAYLAB_NAV : BRANCH_NAV;
  const visible = nav.filter((item) => item.roles.includes(role));

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
            const active =
              pathname === item.href || (item.href !== "/branch" && item.href !== "/taylab" && pathname.startsWith(item.href + "/"));
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
