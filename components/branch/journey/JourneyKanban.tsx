/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (Kanban board pattern)
 * @consumes ui/Card, StatusBadge
 * @used-by app/(dashboard)/branch/journey/page.tsx
 *
 * Horizontal-scrolling Kanban board grouped by `columnFor(status)`. The
 * Closed column wraps REJECTED / HQ_REJECTED / EXPIRED so the board fits
 * on one screen without giving every dead state its own column.
 */
import Link from "next/link";
import { formatDateDDMMMYYYY } from "@/lib/format/date";
import { StatusBadge } from "@/components/branch/journey/StatusBadge";
import { JOURNEY_COLUMNS, columnFor, type JourneyColumn } from "@/lib/journey/status";
import type { JourneyRow } from "@/lib/journey/data";

export function JourneyKanban({ apps }: { apps: JourneyRow[] }) {
  const grouped = new Map<JourneyColumn, JourneyRow[]>(
    JOURNEY_COLUMNS.map((c) => [c, [] as JourneyRow[]]),
  );
  for (const a of apps) {
    const col = columnFor(a.status);
    if (col) grouped.get(col)!.push(a);
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4">
      <div className="flex gap-4">
        {JOURNEY_COLUMNS.map((col) => {
          const rows = grouped.get(col) ?? [];
          return (
            <div
              key={col}
              className="flex w-72 shrink-0 flex-col gap-3 rounded-md bg-surface-page p-3"
            >
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold text-text-primary">{col}</p>
                <span className="text-xs text-text-muted">{rows.length}</span>
              </div>
              {rows.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-3 text-xs text-text-muted">
                  Nothing here.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {rows.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/branch/applications/${a.id}`}
                        className="block rounded-md bg-surface-card p-3 shadow-sm transition-colors duration-fast hover:bg-surface-card-elevated"
                      >
                        <p className="font-medium text-text-primary">{a.displayName}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <StatusBadge status={a.status} />
                          <span className="text-xs text-text-muted">
                            {formatDateDDMMMYYYY(a.lastActivityAt)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

