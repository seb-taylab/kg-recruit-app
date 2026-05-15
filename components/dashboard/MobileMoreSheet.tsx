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
import { LogOut } from "lucide-react";
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
}

export function MobileMoreSheet({ open, onOpenChange, overflow }: MobileMoreSheetProps) {
  const pathname = usePathname();

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

        {/* Sign-out separator only renders when there's a nav list above
            it to divide. Chairmen (no overflow items) see Sign out as the
            sole content of the sheet — a stray top border there would
            look broken. */}
        <div
          className={cn(
            overflow.length > 0 && "border-t border-border pt-4",
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
