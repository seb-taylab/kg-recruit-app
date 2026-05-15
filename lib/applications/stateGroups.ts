/**
 * @tier data
 * @used-by lib/applications/aging, lib/applications/filters, components/applications/*
 *
 * Single source of truth for collapsing the 17 ApplicationStatus values
 * into 7 operational groups used by the Kanban + filter chips. The
 * groups are calibrated to Sebastian's 2026-05-16 decision: Ready-to-
 * send stays SEPARATE from At-HQ so the branch-side bottleneck
 * (PDF rendered, button not yet clicked) stays visible.
 *
 * Coverage is enforced at compile time — every ApplicationStatus must
 * appear in STATUS_GROUP_MAP. Adding a new status without mapping it
 * here fails typecheck.
 */
import type { ApplicationStatus } from "@/lib/journey/status";

export type StateGroup =
  | "invited"
  | "in_progress"
  | "awaiting_referral"
  | "awaiting_chairman"
  | "ready_to_send"
  | "at_hq"
  | "closed";

export interface StateGroupConfig {
  key: StateGroup;
  /** Human-readable label for Kanban column header + filter-chip text. */
  label: string;
  /** Left-to-right rendering order (1 = leftmost). */
  order: number;
  /** All statuses that roll up into this group. */
  statuses: readonly ApplicationStatus[];
}

/**
 * 17 → 7 mapping. Compile-time exhaustiveness via the Record<…>
 * constraint on STATUS_GROUP_MAP below.
 *
 * Group rationale:
 *   - invited            → applicant exists but hasn't started filling
 *   - in_progress        → applicant is working on the form
 *   - awaiting_referral  → applicant done, branch is sourcing/chasing referral
 *   - awaiting_chairman  → referral done, queued for chairman signature
 *   - ready_to_send      → chairman done, branch hasn't clicked Send to HQ
 *                          (kept separate from at_hq to expose branch-side
 *                           bottleneck — see Sebastian's 2026-05-16 call)
 *   - at_hq              → email landed at HQ, awaiting outcome
 *   - closed             → terminal states (success, rejection, expiry)
 */
export const STATUS_GROUP_MAP: Record<ApplicationStatus, StateGroup> = {
  DRAFT: "invited",
  APPLICANT_INVITED: "invited",
  APPLICANT_FILLING: "in_progress",
  SIGNED_BY_APPLICANT: "in_progress",
  PENDING_REFERRAL_ASSIGNMENT: "awaiting_referral",
  REFERRAL_INVITED: "awaiting_referral",
  SIGNED_BY_REFERRAL: "awaiting_referral",
  PENDING_BRANCH_ADMIN_REVIEW: "awaiting_referral",
  PENDING_CHAIRMAN: "awaiting_chairman",
  SIGNED_BY_CHAIRMAN: "ready_to_send",
  READY_TO_SEND: "ready_to_send",
  SENT_TO_HQ: "at_hq",
  COMPLETED: "closed",
  HQ_REJECTED: "closed",
  REJECTED: "closed",
  EXPIRED: "closed",
  ARCHIVED: "closed",
};

export const STATE_GROUPS: StateGroupConfig[] = [
  { key: "invited",            label: "Invited",            order: 1, statuses: statusesFor("invited") },
  { key: "in_progress",        label: "In progress",        order: 2, statuses: statusesFor("in_progress") },
  { key: "awaiting_referral",  label: "Awaiting referral",  order: 3, statuses: statusesFor("awaiting_referral") },
  { key: "awaiting_chairman",  label: "Awaiting chairman",  order: 4, statuses: statusesFor("awaiting_chairman") },
  { key: "ready_to_send",      label: "Ready to send",      order: 5, statuses: statusesFor("ready_to_send") },
  { key: "at_hq",              label: "At HQ",              order: 6, statuses: statusesFor("at_hq") },
  { key: "closed",             label: "Closed",             order: 7, statuses: statusesFor("closed") },
];

function statusesFor(group: StateGroup): readonly ApplicationStatus[] {
  return (Object.entries(STATUS_GROUP_MAP) as [ApplicationStatus, StateGroup][])
    .filter(([, g]) => g === group)
    .map(([status]) => status);
}

/** Get the group config for a status. Never null — every status is mapped. */
export function getStateGroup(status: ApplicationStatus): StateGroupConfig {
  const key = STATUS_GROUP_MAP[status];
  const config = STATE_GROUPS.find((g) => g.key === key);
  if (!config) {
    // Should never happen given the compile-time exhaustiveness check on
    // STATUS_GROUP_MAP, but defensive in case the const arrays drift.
    throw new Error(`No StateGroup configured for status ${status}`);
  }
  return config;
}

/** Bucket a flat list of rows into the 7 groups, preserving input order within each. */
export function groupApplicationsByStatus<T extends { status: ApplicationStatus }>(
  rows: T[],
): Record<StateGroup, T[]> {
  const result = Object.fromEntries(
    STATE_GROUPS.map((g) => [g.key, [] as T[]]),
  ) as Record<StateGroup, T[]>;
  for (const row of rows) {
    const groupKey = STATUS_GROUP_MAP[row.status];
    result[groupKey].push(row);
  }
  return result;
}
