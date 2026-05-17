/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §7.4 (Drawer on mobile) + §7.5 (Mobile More overflow)
 * @consumes ui/sheet, lib/dashboard/nav
 * @used-by components/dashboard/MobileBottomNav.tsx
 *
 * Bottom-slide drawer that surfaces the nav items that didn't fit in the
 * bottom-tab row + the Sign-out action. Tapping any row navigates and
 * auto-closes the drawer (via onOpenChange(false)).
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { NavItem } from "@/lib/dashboard/nav";
import { isNavItemActive } from "@/lib/dashboard/nav";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface MobileMoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overflow: NavItem[];
  /** Number of active workspaces for the current user. When > 1, the sheet
   *  surfaces a "Switch workspace" affordance — desktop has the chip in
   *  the sidebar; mobile reaches it via this sheet. */
  workspaceCount?: number;
}

export function MobileMoreSheet({ open, onOpenChange, overflow, workspaceCount = 1 }: MobileMoreSheetProps) {
  const pathname = usePathname();
  const showWorkspaceSwitcher = workspaceCount > 1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="overflow-y-auto"
        // 80vh cap so the drawer never covers the whole screen — the
        // overlay-tap-to-dismiss affordance has to stay visible at the top.
        style={{ maxHeight: "80vh" }}
      >
        <SheetHeader className="mb-4">
          <SheetTitle>More</SheetTitle>
          <SheetDescription>Additional navigation and account actions</SheetDescription>
        </SheetHeader>

        {overflow.length > 0 && (
          <ul className="mb-4 flex flex-col gap-1">
            {overflow.map((item) => {
              const active = isNavItemActive(item.href, pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => onOpenChange(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors duration-fast",
                      active
                        ? "bg-surface-page text-text-primary"
                        : "text-text-secondary hover:bg-surface-page hover:text-text-primary",
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {/* Workspace switcher — only when the user has multiple profiles.
            Mobile equivalent of the sidebar chip; without this, users
            previously had to sign out to switch (per Sebastian's audit). */}
        {showWorkspaceSwitcher && (
          <div
            className={cn(
              "mb-4",
              overflow.length > 0 && "border-t border-border pt-4",
            )}
          >
            <Link
              href="/select-workspace"
              onClick={() => onOpenChange(false)}
              className="flex min-h-12 items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-page hover:text-text-primary"
            >
              <ArrowLeftRight
                className="h-5 w-5 shrink-0"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className="truncate">
                Switch workspace ({workspaceCount} available)
              </span>
            </Link>
          </div>
        )}

        {/* Sign-out separator only renders when there's content above
            to divide. Chairmen with no overflow + no workspace switcher
            see Sign out as the sole content of the sheet — a stray top
            border there would look broken. */}
        <div
          className={cn(
            (overflow.length > 0 || showWorkspaceSwitcher) && "border-t border-border pt-4",
          )}
        >
          <form action="/auth/logout" method="post">
            <Button type="submit" variant="outline" className="w-full justify-center">
              <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              <span>Sign out</span>
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
