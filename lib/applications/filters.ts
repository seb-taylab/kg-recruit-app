/**
 * @tier data
 * @used-by components/applications/FilterChips, future PR-B Table wiring
 *
 * Quick-filter chip definitions for the Applications surface. Each chip
 * has a predicate the Table runs over the visible rows. Predicates are
 * deliberately small + pure so the active set can be persisted to the
 * URL (?filters=aging_gt_7,at_hq) without serialising functions.
 *
 * NOTE: the "My apps" chip from Sebastian's 2026-05-15 directive is
 * intentionally NOT included here. We don't have a unified
 * `current_owner_id` column — ownership is phase-specific. Sebastian
 * flagged that one needs more thinking (2026-05-16). Add the chip in
 * the same PR that wires up filters to the Table once the definition
 * is locked.
 */
import type { ApplicationStatus } from "@/lib/journey/status";
import { STATUS_GROUP_MAP, type StateGroup } from "./stateGroups";
import { computeAging, getStatusTimestamp, type RowTimestamps } from "./aging";

export type FilterChipKey =
  | "aging_gt_7"
  | "awaiting_referral"
  | "awaiting_chairman"
  | "at_hq"
  | "this_week";

/**
 * Minimum row shape a chip predicate can rely on. Real rows (JourneyRow
 * etc.) extend this so they can pass directly without adapters.
 */
export interface FilterableRow extends RowTimestamps {
  status: ApplicationStatus;
  invitedAt: string | null;
}

export interface FilterChip {
  key: FilterChipKey;
  label: string;
  match: (row: FilterableRow) => boolean;
}

/** Helper for the group-membership chips. */
const inGroup = (status: ApplicationStatus, group: StateGroup) =>
  STATUS_GROUP_MAP[status] === group;

export const FILTER_CHIPS: FilterChip[] = [
  {
    key: "aging_gt_7",
    label: "Aging > 7d",
    match: (r) => computeAging(getStatusTimestamp(r.status, r)).days > 7,
  },
  {
    key: "awaiting_referral",
    label: "Awaiting referral",
    match: (r) => inGroup(r.status, "awaiting_referral"),
  },
  {
    key: "awaiting_chairman",
    label: "Awaiting chairman",
    match: (r) => inGroup(r.status, "awaiting_chairman"),
  },
  {
    key: "at_hq",
    label: "At HQ",
    match: (r) => inGroup(r.status, "at_hq") || inGroup(r.status, "ready_to_send"),
  },
  {
    key: "this_week",
    label: "Invited this week",
    match: (r) => {
      if (!r.invitedAt) return false;
      const invited = new Date(r.invitedAt).getTime();
      if (Number.isNaN(invited)) return false;
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return invited >= sevenDaysAgo;
    },
  },
];

/** Multi-chip = AND. Empty = unfiltered. */
export function applyFilterChips<T extends FilterableRow>(
  rows: T[],
  active: FilterChipKey[],
): T[] {
  if (active.length === 0) return rows;
  const chips = FILTER_CHIPS.filter((c) => active.includes(c.key));
  return rows.filter((r) => chips.every((c) => c.match(r)));
}

/** Serialise the active set for the URL query (?filters=a,b,c). */
export function serializeFilters(active: FilterChipKey[]): string {
  return active.join(",");
}

/** Parse `?filters=a,b,c` back into a typed array, discarding unknowns. */
export function parseFilters(value: string | null | undefined): FilterChipKey[] {
  if (!value) return [];
  const known = new Set<FilterChipKey>(FILTER_CHIPS.map((c) => c.key));
  return value
    .split(",")
    .map((s) => s.trim() as FilterChipKey)
    .filter((s) => known.has(s));
}
