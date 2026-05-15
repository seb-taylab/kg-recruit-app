/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (Data table — sortable, filterable)
 * @consumes ui/Card, StatusBadge, applications/FilterChips, applications/AgingDot
 * @used-by app/(dashboard)/branch/journey/page.tsx
 *
 * View is read-only — clicking a row navigates to the application detail
 * page where the actions live. Sort + filter state lives in the URL
 * (`?sort=name&dir=asc&filters=aging_gt_7,at_hq`) so refresh + share
 * preserve the view.
 *
 * Filtering / sorting runs client-side over the already-loaded row set
 * (one branch's apps, typically ≤200 rows). No round-trips on chip
 * toggle or column-header click — instant feedback.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateDDMMMYYYY } from "@/lib/format/date";
import { StatusBadge } from "@/components/branch/journey/StatusBadge";
import { AgingDot } from "@/components/applications/AgingDot";
import { FilterChips } from "@/components/applications/FilterChips";
import {
  FILTER_CHIPS,
  applyFilterChips,
  parseFilters,
  serializeFilters,
  type FilterChipKey,
} from "@/lib/applications/filters";
import { computeAging } from "@/lib/applications/aging";
import { STATE_GROUPS, STATUS_GROUP_MAP } from "@/lib/applications/stateGroups";
import type { JourneyRow } from "@/lib/journey/data";
import { cn } from "@/lib/utils/cn";

type SortKey =
  | "displayName"
  | "status"
  | "aging"
  | "constituency"
  | "invitedAt"
  | "lastActivityAt";

type SortDir = "asc" | "desc";

const SORTABLE_COLUMNS: { key: SortKey; label: string; align?: "left" | "right" }[] = [
  { key: "displayName",     label: "Applicant" },
  { key: "status",          label: "Status" },
  { key: "aging",           label: "Days in state" },
  { key: "constituency",    label: "Constituency" },
  { key: "invitedAt",       label: "Invited" },
  { key: "lastActivityAt",  label: "Last activity" },
];

const VALID_SORT_KEYS = new Set<SortKey>(SORTABLE_COLUMNS.map((c) => c.key));
const DEFAULT_SORT: SortKey = "invitedAt";
const DEFAULT_DIR: SortDir = "desc";

export function JourneyTable({ apps }: { apps: JourneyRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // ─── State derived from URL ────────────────────────────────────────
  const sortParam = params.get("sort") as SortKey | null;
  const dirParam = params.get("dir") as SortDir | null;
  const sort: SortKey = sortParam && VALID_SORT_KEYS.has(sortParam) ? sortParam : DEFAULT_SORT;
  const dir: SortDir = dirParam === "asc" || dirParam === "desc" ? dirParam : DEFAULT_DIR;
  const activeFilters = React.useMemo(
    () => parseFilters(params.get("filters")),
    [params],
  );

  // ─── Apply filters then sort ───────────────────────────────────────
  const visible = React.useMemo(() => {
    const filtered = applyFilterChips(apps, activeFilters);
    const sorted = [...filtered].sort(compareRows(sort, dir));
    return sorted;
  }, [apps, activeFilters, sort, dir]);

  // ─── URL writers ───────────────────────────────────────────────────
  function pushParams(next: URLSearchParams) {
    // Preserve any other query params (?view=table etc).
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function handleSortClick(key: SortKey) {
    const next = new URLSearchParams(params);
    if (sort === key) {
      // Toggle direction; no third "off" state — sorted-by-something is
      // always the truth, the default-sort key just changes.
      next.set("dir", dir === "asc" ? "desc" : "asc");
    } else {
      next.set("sort", key);
      // Sensible per-column default direction. Strings A→Z; numbers
      // and dates: smallest/oldest first.
      next.set("dir", defaultDirFor(key));
    }
    pushParams(next);
  }

  function handleFiltersChange(nextFilters: FilterChipKey[]) {
    const next = new URLSearchParams(params);
    const serialised = serializeFilters(nextFilters);
    if (serialised) next.set("filters", serialised);
    else next.delete("filters");
    pushParams(next);
  }

  function clearFilters() {
    handleFiltersChange([]);
  }

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <FilterChips active={activeFilters} onChange={handleFiltersChange} />

      {visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6 text-sm text-text-muted">
            {activeFilters.length > 0 ? (
              <>
                <span>No applications match these filters.</span>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm font-medium text-brand-blue hover:underline"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <span>No applications yet.</span>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-surface-page text-left text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    {SORTABLE_COLUMNS.map((col) => {
                      const active = sort === col.key;
                      return (
                        <th
                          key={col.key}
                          className="px-4 py-3 font-medium"
                          aria-sort={
                            active
                              ? dir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <button
                            type="button"
                            onClick={() => handleSortClick(col.key)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-sm text-xs font-medium uppercase tracking-wide transition-colors duration-fast hover:text-text-primary",
                              active ? "text-text-primary" : "text-text-muted",
                            )}
                          >
                            <span>{col.label}</span>
                            {active && (
                              dir === "asc" ? (
                                <ChevronUp className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                              ) : (
                                <ChevronDown className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                              )
                            )}
                          </button>
                        </th>
                      );
                    })}
                    {/* Action column — not sortable */}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-text-primary">{a.displayName}</p>
                        {a.referralName && (
                          <p className="text-xs text-text-muted">
                            Referred by {a.referralName}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <AgingDot stateChangedAt={a.stateChangedAt} />
                      </td>
                      <td className="px-4 py-3 align-top text-text-secondary">
                        {a.currentConstituency ? (
                          <span title={a.currentConstituency}>
                            {shortConstituency(a.currentConstituency)}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-text-secondary">
                        {formatDateDDMMMYYYY(a.invitedAt)}
                      </td>
                      <td className="px-4 py-3 align-top text-text-secondary">
                        {formatDateDDMMMYYYY(a.lastActivityAt)}
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <Link
                          href={`/branch/applications/${a.id}`}
                          className="text-sm font-medium text-brand-blue hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border bg-surface-page px-4 py-2 text-xs text-text-muted">
              {visible.length} of {apps.length}
              {activeFilters.length > 0
                ? ` matching ${activeFilters.length} filter${activeFilters.length === 1 ? "" : "s"}`
                : ""}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Sorting helpers ───────────────────────────────────────────────────

function defaultDirFor(key: SortKey): SortDir {
  switch (key) {
    case "displayName":
    case "status":
    case "constituency":
      return "asc"; // A→Z
    case "aging":
    case "invitedAt":
    case "lastActivityAt":
      return "desc"; // newest/longest first
  }
}

function compareRows(
  key: SortKey,
  dir: SortDir,
): (a: JourneyRow, b: JourneyRow) => number {
  const mult = dir === "asc" ? 1 : -1;
  return (a, b) => {
    let cmp = 0;
    switch (key) {
      case "displayName":
        cmp = a.displayName.localeCompare(b.displayName, "en");
        break;
      case "status":
        // Sort by group order first (matches the Kanban left-to-right
        // flow), then by raw status name within the group.
        cmp =
          orderForStatus(a.status) - orderForStatus(b.status) ||
          a.status.localeCompare(b.status, "en");
        break;
      case "aging":
        cmp = computeAging(a.stateChangedAt).days - computeAging(b.stateChangedAt).days;
        break;
      case "constituency":
        cmp = nullsLast(a.currentConstituency, b.currentConstituency);
        break;
      case "invitedAt":
      case "lastActivityAt": {
        const av = a[key];
        const bv = b[key];
        cmp = nullsLast(av, bv);
        break;
      }
    }
    return cmp * mult;
  };
}

/**
 * Status sorts by KANBAN COLUMN ORDER (left-to-right flow), not raw
 * string. Status → group key → order field on StateGroupConfig.
 */
function orderForStatus(status: JourneyRow["status"]): number {
  const groupKey = STATUS_GROUP_MAP[status];
  return STATE_GROUPS.find((g) => g.key === groupKey)?.order ?? 99;
}

/** null/empty values sort to the END regardless of asc/desc. */
function nullsLast(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, "en");
}

/**
 * Trim "GRC" / "SMC" suffix and uppercase-first the rest so the table
 * column stays readable on narrow screens. Full name surfaces on hover
 * via title="…".
 */
function shortConstituency(full: string): string {
  return full.replace(/ (GRC|SMC)$/, "");
}
