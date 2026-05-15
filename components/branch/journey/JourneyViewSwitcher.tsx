/**
 * @tier molecule
 * @design-spec KG_DesignSystem_v1.md §2 (Segmented control via Link group)
 * @used-by app/(dashboard)/branch/journey/page.tsx
 *
 * Two-tab switcher: Table / Kanban. The branch-wide Timeline view was
 * removed on 2026-05-16 — per-application history now lives on the
 * application detail page (see ApplicationStatusHistory). Map view is
 * not currently planned as a top-level tab; if branch reporting by
 * constituency ships, it'll live on the overview page, not here.
 *
 * Server component — each variant is a plain <Link> preserving any other
 * query params. Keeps the route bookmarkable / shareable.
 */
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export type JourneyView = "table" | "kanban";

const VIEWS: { value: JourneyView; label: string }[] = [
  { value: "table", label: "Table" },
  { value: "kanban", label: "Kanban" },
];

interface JourneyViewSwitcherProps {
  current: JourneyView;
}

export function JourneyViewSwitcher({ current }: JourneyViewSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Journey view"
      className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-card p-1"
    >
      {VIEWS.map((v) => {
        const active = v.value === current;
        return (
          <Link
            key={v.value}
            href={`/branch/journey?view=${v.value}`}
            role="tab"
            aria-selected={active}
            className={cn(
              "rounded-sm px-3 py-1 text-sm font-medium transition-colors duration-fast",
              active
                ? "bg-surface-page text-text-primary"
                : "text-text-secondary hover:bg-surface-page hover:text-text-primary",
            )}
          >
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}
