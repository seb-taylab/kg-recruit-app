/**
 * @tier data
 * @design-spec KG_DesignSystem_v1.md §7.5 (Web app — left sidebar nav + mobile bottom nav)
 * @used-by components/dashboard/Sidebar.tsx, components/dashboard/MobileBottomNav.tsx, components/dashboard/MobileMoreSheet.tsx
 *
 * Single source of truth for primary nav. `primary: true` items become bottom-tab
 * candidates on mobile; `primary: false` items live in the More sheet.
 */
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
  CalendarDays,
  Flame,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/types/database";

export interface NavItem {
  href: string;
  label: string;
  /** Optional mobile-bottom-bar label (≤ 12 chars recommended). Falls back to `label`. */
  shortLabel?: string;
  icon: LucideIcon;
  roles: UserRole[];
  /** true = bottom-tab candidate on mobile; false = More-sheet overflow */
  primary: boolean;
}

const BRANCH_ADMIN_TEAM = [
  "branch_master_admin",
  "branch_admin",
  "branch_team_member",
] as const satisfies readonly UserRole[];

export const BRANCH_NAV: NavItem[] = [
  { href: "/branch",          label: "Overview",             icon: LayoutGrid, roles: ["branch_master_admin", "branch_admin", "branch_team_member", "branch_chairman"], primary: true },
  { href: "/branch/initiate", label: "Initiate",             icon: UserPlus,   roles: [...BRANCH_ADMIN_TEAM],                                                          primary: true },
  { href: "/branch/inbox",    label: "Inbox",                icon: Inbox,      roles: [...BRANCH_ADMIN_TEAM],                                                          primary: true },
  { href: "/branch/sign",     label: "Pending my signature", shortLabel: "Sign", icon: PenLine, roles: ["branch_chairman"],                                            primary: true },
  { href: "/branch/journey",  label: "Applications",         icon: GitBranch,  roles: ["branch_master_admin", "branch_admin", "branch_team_member", "branch_chairman"], primary: true },
  { href: "/branch/history",  label: "History",              icon: Archive,    roles: [...BRANCH_ADMIN_TEAM],                                                          primary: false },
  { href: "/branch/team",     label: "Team",                 icon: Users,      roles: ["branch_master_admin", "branch_admin"],                                         primary: false },
  { href: "/branch/settings", label: "Settings",             icon: Settings,   roles: ["branch_master_admin", "branch_admin"],                                         primary: false },
];

export const TAYLAB_NAV: NavItem[] = [
  { href: "/taylab",          label: "Overview",          icon: LayoutGrid, roles: ["taylab_staff"], primary: true },
  { href: "/taylab/branches", label: "Branches",          icon: GitBranch,  roles: ["taylab_staff"], primary: true },
  { href: "/taylab/users",    label: "Users",             icon: Users,      roles: ["taylab_staff"], primary: true },
  { href: "/taylab/directory",label: "Directory",         shortLabel: "Dir.", icon: MapPin, roles: ["taylab_staff"], primary: false },
  { href: "/taylab/audit",    label: "Audit log",         shortLabel: "Audit", icon: FileText, roles: ["taylab_staff"], primary: true },
  { href: "/taylab/settings", label: "Platform settings", shortLabel: "Platform", icon: Settings, roles: ["taylab_staff"], primary: false },
];

/**
 * Wing workspace nav (added 2026-05-17 with the v4.1 lead-routing build).
 * Sprint 1 ships ONLY the Overview placeholder — Triage (lead routing) +
 * Events lists land in Sprint 2 and Sprint 3 respectively. The nav items
 * are declared now so the Sidebar + MobileBottomNav can render them
 * consistently as each page comes online.
 */
export const WING_NAV: NavItem[] = [
  { href: "/wing",         label: "Overview", icon: LayoutGrid,   roles: ["wing_admin", "wing_chairman"], primary: true },
  { href: "/wing/triage",  label: "Triage",   icon: Flame,        roles: ["wing_admin", "wing_chairman"], primary: true },
  { href: "/wing/events",  label: "Events",   icon: CalendarDays, roles: ["wing_admin", "wing_chairman"], primary: true },
  { href: "/wing/team",    label: "Team",     icon: Users,        roles: ["wing_admin"],                  primary: false },
  { href: "/wing/settings",label: "Settings", icon: Settings,     roles: ["wing_admin"],                  primary: false },
];

export function getNavForRole(role: UserRole): NavItem[] {
  const source =
    role === "taylab_staff"
      ? TAYLAB_NAV
      : role === "wing_admin" || role === "wing_chairman"
        ? WING_NAV
        : BRANCH_NAV;
  return source.filter((item) => item.roles.includes(role));
}

/**
 * Split a role's nav into (bottom tabs, overflow).
 * Caps bottom tabs at `maxPrimary` (default 4) so the More button fits as the 5th slot.
 */
export function splitNavForMobile(
  role: UserRole,
  maxPrimary = 4,
): {
  primary: NavItem[];
  overflow: NavItem[];
} {
  const nav = getNavForRole(role);
  const primary = nav.filter((i) => i.primary).slice(0, maxPrimary);
  const primaryHrefs = new Set(primary.map((i) => i.href));
  const overflow = nav.filter((i) => !primaryHrefs.has(i.href));
  return { primary, overflow };
}

/**
 * Active-state matcher — same logic as the original Sidebar.
 * Root routes (/branch, /taylab, /wing) only highlight on exact match;
 * nested routes get the prefix-match treatment.
 */
export function isNavItemActive(itemHref: string, pathname: string): boolean {
  if (pathname === itemHref) return true;
  if (itemHref === "/branch" || itemHref === "/taylab" || itemHref === "/wing") return false;
  return pathname.startsWith(itemHref + "/");
}
