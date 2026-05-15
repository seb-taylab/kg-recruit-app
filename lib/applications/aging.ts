/**
 * @tier data
 * @used-by components/applications/AgingDot, lib/journey/data (status timestamp picker)
 *
 * "How long has this application been sitting in its current state?"
 *
 * Per Sebastian's 2026-05-16 decision (option B), we derive the
 * status-entered-at timestamp from the per-phase denormalised columns
 * on `applications` rather than joining `application_events`. Cheaper +
 * matches the business intent of "time since this row went stale".
 *
 * Some statuses don't have a dedicated timestamp column (the row enters
 * them implicitly — e.g. PENDING_REFERRAL_ASSIGNMENT happens the moment
 * the applicant signs, no separate event marks the transition). For
 * those, we fall back to the closest meaningful timestamp; documented
 * inline in STATUS_TIMESTAMP_KEY below.
 */
import type { ApplicationStatus } from "@/lib/journey/status";

export interface AgingInfo {
  /** Whole days since the status was entered (clamped ≥ 0). */
  days: number;
  /** Traffic-light bucket. green < 3d, amber 3-6d, red ≥ 7d. */
  level: "green" | "amber" | "red";
  /** Compact display label e.g. "3d", "—" when no timestamp. */
  label: string;
}

export function computeAging(stateChangedAt: string | Date | null): AgingInfo {
  if (!stateChangedAt) return { days: 0, level: "green", label: "—" };
  const then = new Date(stateChangedAt).getTime();
  if (Number.isNaN(then)) return { days: 0, level: "green", label: "—" };
  const days = Math.max(0, Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24)));
  let level: AgingInfo["level"] = "green";
  if (days >= 7) level = "red";
  else if (days >= 3) level = "amber";
  return { days, level, label: `${days}d` };
}

/** Token-mapped colour class per aging level. */
export const AGING_DOT_CLASS: Record<AgingInfo["level"], string> = {
  green: "bg-state-success",
  amber: "bg-state-warning",
  red: "bg-state-error",
};

/**
 * Subset of the raw applications-row shape that aging needs. The journey
 * loader (lib/journey/data.ts) projects from this so we don't have to
 * pull a 40-column row everywhere we ask "when did this state start?".
 */
export interface RowTimestamps {
  created_at?: string | null;
  applicant_invited_at?: string | null;
  applicant_filling_started_at?: string | null;
  applicant_signed_at?: string | null;
  referral_assigned_at?: string | null;
  referral_signed_at?: string | null;
  branch_admin_review_at?: string | null;
  chairman_signed_at?: string | null;
  ready_to_send_at?: string | null;
  sent_to_hq_at?: string | null;
  hq_outcome_recorded_at?: string | null;
  completed_at?: string | null;
  rejected_at?: string | null;
  archived_at?: string | null;
}

type TimestampKey = keyof RowTimestamps;

/**
 * Pick the column whose value represents "the moment this row entered
 * its current status". For statuses without a dedicated col, falls
 * back to the previous meaningful timestamp — comment alongside each
 * entry explains the fallback choice.
 */
const STATUS_TIMESTAMP_KEY: Record<ApplicationStatus, TimestampKey> = {
  // Pre-applicant states
  DRAFT: "created_at",
  APPLICANT_INVITED: "applicant_invited_at",
  APPLICANT_FILLING: "applicant_filling_started_at",

  // Applicant side
  SIGNED_BY_APPLICANT: "applicant_signed_at",
  // No dedicated column — row enters PRA the moment the applicant signs.
  PENDING_REFERRAL_ASSIGNMENT: "applicant_signed_at",
  REFERRAL_INVITED: "referral_assigned_at",
  SIGNED_BY_REFERRAL: "referral_signed_at",
  // No dedicated column — row enters PBAR the moment the referral signs
  // (only on routing_choice = via_branch_admin_review).
  PENDING_BRANCH_ADMIN_REVIEW: "referral_signed_at",

  // Chairman side
  PENDING_CHAIRMAN: "branch_admin_review_at",
  SIGNED_BY_CHAIRMAN: "chairman_signed_at",

  // HQ pipeline
  READY_TO_SEND: "ready_to_send_at",
  SENT_TO_HQ: "sent_to_hq_at",

  // Terminal
  COMPLETED: "completed_at",
  HQ_REJECTED: "hq_outcome_recorded_at",
  REJECTED: "rejected_at",
  // EXPIRED has no dedicated timestamp. Fall back to the invited
  // timestamp — closest signal to "when did this row start aging
  // toward expiry". Acceptable approximation.
  EXPIRED: "applicant_invited_at",
  ARCHIVED: "archived_at",
};

/**
 * Return the timestamp that should drive aging for a row in `status`,
 * with sensible fallbacks for statuses that share a column with the
 * previous state. Returns null when even the fallback isn't populated
 * (very early DRAFT rows etc.).
 *
 * Fallback chain:
 *   1. Status-specific column from STATUS_TIMESTAMP_KEY
 *   2. PENDING_CHAIRMAN extra fallback: referral_signed_at if there was
 *      no branch_admin_review_at (Path A, direct-to-chairman flow)
 */
export function getStatusTimestamp(
  status: ApplicationStatus,
  row: RowTimestamps,
): string | null {
  const key = STATUS_TIMESTAMP_KEY[status];
  const primary = row[key];
  if (primary) return primary;

  // PENDING_CHAIRMAN on the direct-to-chairman path skips
  // branch_admin_review_at entirely. Fall back to referral_signed_at.
  if (status === "PENDING_CHAIRMAN" && row.referral_signed_at) {
    return row.referral_signed_at;
  }
  return null;
}
