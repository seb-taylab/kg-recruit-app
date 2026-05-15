/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §7.5 (Web app — mobile bottom nav)
 * @consumes lib/dashboard/nav, components/dashboard/MobileMoreSheet
 * @used-by components/layouts/DashboardLayout.tsx
 *
 * Fixed bottom navigation visible below `lg`. 4 primary tabs + More overflow
 * sheet. Safe-area-inset-bottom respected via the `pb-safe` utility so the
 * iOS home-indicator doesn't overlap the bar.
 *
 * z-drawer (40) keeps the bar below modal Dialogs (z-dialog = 50) so any
 * open dialog covers the bar via its own overlay.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { UserRole } from "@/types/database";
import { splitNavForMobile, isNavItemActive } from "@/lib/dashboard/nav";
import { MobileMoreSheet } from "./MobileMoreSheet";

interface MobileBottomNavProps {
  role: UserRole;
}

export function MobileBottomNav({ role }: MobileBottomNavProps) {
  const pathname = usePathname();
  const { primary, overflow } = splitNavForMobile(role, 4);
  const [moreOpen, setMoreOpen] = React.useState(false);

  // If the current route is in the overflow set, highlight More so the
  // user can see "you're in a less-common surface" rather than no tab lit.
  const moreActive = overflow.some((item) => isNavItemActive(item.href, pathname));

  // Total cells = primary tabs + (More button if there's any overflow).
  const cellCount = primary.length + (overflow.length > 0 ? 1 : 0);

  return (
    <>
      <nav
        aria-label="Mobile primary"
        className={cn(
          "fixed inset-x-0 bottom-0 z-drawer border-t border-border bg-surface-card lg:hidden",
          "pb-safe",
        )}
      >
        <ul
          className="grid h-16"
          style={{ gridTemplateColumns: `repeat(${cellCount}, minmax(0, 1fr))` }}
        >
          {primary.map((item) => {
            const active = isNavItemActive(item.href, pathname);
            const Icon = item.icon;
            const label = item.shortLabel ?? item.label;
            return (
              <li key={item.href} className="flex">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium leading-tight transition-colors duration-fast",
                    active ? "text-brand-red" : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  <Icon
                    className="h-5 w-5 shrink-0"
                    strokeWidth={active ? 2 : 1.5}
                    aria-hidden="true"
                  />
                  <span className="max-w-full truncate">{label}</span>
                </Link>
              </li>
            );
          })}

          {overflow.length > 0 && (
            <li className="flex">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                aria-label="More navigation"
                className={cn(
                  "flex min-h-12 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium leading-tight transition-colors duration-fast",
                  moreActive ? "text-brand-red" : "text-text-secondary hover:text-text-primary",
                )}
              >
                <MoreHorizontal
                  className="h-5 w-5 shrink-0"
                  strokeWidth={moreActive ? 2 : 1.5}
                  aria-hidden="true"
                />
                <span>More</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      <MobileMoreSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        overflow={overflow}
      />
    </>
  );
}
