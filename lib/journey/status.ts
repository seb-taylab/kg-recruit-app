/**
 * Status → presentation mapping for the Journey dashboard.
 *
 * `column` groups the 17-state enum into 7 logical Kanban columns. The
 * order here is the order columns render left-to-right.
 */

export const APPLICATION_STATUSES = [
  "DRAFT",
  "APPLICANT_INVITED",
  "APPLICANT_FILLING",
  "SIGNED_BY_APPLICANT",
  "PENDING_REFERRAL_ASSIGNMENT",
  "REFERRAL_INVITED",
  "SIGNED_BY_REFERRAL",
  "PENDING_BRANCH_ADMIN_REVIEW",
  "PENDING_CHAIRMAN",
  "SIGNED_BY_CHAIRMAN",
  "READY_TO_SEND",
  "SENT_TO_HQ",
  "COMPLETED",
  "HQ_REJECTED",
  "REJECTED",
  "EXPIRED",
  "ARCHIVED",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const JOURNEY_COLUMNS = [
  "Applicant",
  "Referral",
  "Chairman",
  "Ready to send",
  "At HQ",
  "Completed",
  "Closed",
] as const;
export type JourneyColumn = (typeof JOURNEY_COLUMNS)[number];

/** Statuses we INTENTIONALLY exclude from the Journey board. */
export const JOURNEY_HIDDEN: ApplicationStatus[] = ["ARCHIVED"];

const STATUS_TO_COLUMN: Record<ApplicationStatus, JourneyColumn | null> = {
  DRAFT: "Applicant",
  APPLICANT_INVITED: "Applicant",
  APPLICANT_FILLING: "Applicant",
  SIGNED_BY_APPLICANT: "Referral",
  PENDING_REFERRAL_ASSIGNMENT: "Referral",
  REFERRAL_INVITED: "Referral",
  SIGNED_BY_REFERRAL: "Chairman",
  PENDING_BRANCH_ADMIN_REVIEW: "Chairman",
  PENDING_CHAIRMAN: "Chairman",
  SIGNED_BY_CHAIRMAN: "Ready to send",
  READY_TO_SEND: "Ready to send",
  SENT_TO_HQ: "At HQ",
  COMPLETED: "Completed",
  HQ_REJECTED: "Closed",
  REJECTED: "Closed",
  EXPIRED: "Closed",
  ARCHIVED: null,
};

export function columnFor(status: ApplicationStatus): JourneyColumn | null {
  return STATUS_TO_COLUMN[status];
}

/**
 * Outline-pill class for status badges. We don't have `-soft` background
 * tokens, so each badge is a thin border + coloured text on the card
 * background — same approach as the Alert primitive.
 */
export const STATUS_BADGE_CLASS: Record<ApplicationStatus, string> = {
  DRAFT: "border-border text-text-muted",
  APPLICANT_INVITED: "border-state-info text-state-info",
  APPLICANT_FILLING: "border-state-info text-state-info",
  SIGNED_BY_APPLICANT: "border-state-info text-state-info",
  PENDING_REFERRAL_ASSIGNMENT: "border-state-warning text-state-warning",
  REFERRAL_INVITED: "border-state-info text-state-info",
  SIGNED_BY_REFERRAL: "border-state-info text-state-info",
  PENDING_BRANCH_ADMIN_REVIEW: "border-state-warning text-state-warning",
  PENDING_CHAIRMAN: "border-state-warning text-state-warning",
  SIGNED_BY_CHAIRMAN: "border-state-info text-state-info",
  READY_TO_SEND: "border-state-warning text-state-warning",
  SENT_TO_HQ: "border-state-info text-state-info",
  COMPLETED: "border-state-success text-state-success",
  HQ_REJECTED: "border-state-error text-state-error",
  REJECTED: "border-state-error text-state-error",
  EXPIRED: "border-state-error text-state-error",
  ARCHIVED: "border-border text-text-muted",
};

/** Short, plain-English label for the table column / pill. */
export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  DRAFT: "Draft",
  APPLICANT_INVITED: "Invited",
  APPLICANT_FILLING: "Filling",
  SIGNED_BY_APPLICANT: "Applicant signed",
  PENDING_REFERRAL_ASSIGNMENT: "Awaiting referral",
  REFERRAL_INVITED: "Referral invited",
  SIGNED_BY_REFERRAL: "Referral signed",
  PENDING_BRANCH_ADMIN_REVIEW: "Admin review",
  PENDING_CHAIRMAN: "Chairman",
  SIGNED_BY_CHAIRMAN: "Chairman signed",
  READY_TO_SEND: "Ready to send",
  SENT_TO_HQ: "At HQ",
  COMPLETED: "Completed",
  HQ_REJECTED: "HQ rejected",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  ARCHIVED: "Archived",
};
