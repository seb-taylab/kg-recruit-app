/**
 * Nudge stage definitions — purely declarative so both the engine and the
 * settings UI can iterate them.
 */

export const NUDGE_STAGES = [
  "applicant_link_unopened",
  "applicant_form_in_draft",
  "referral_unsigned",
  "chairman_unsigned",
  "ready_to_send_unactioned",
  "at_hq_stalled",
] as const;
export type NudgeStage = (typeof NUDGE_STAGES)[number];

export const NUDGE_RECIPIENT_KINDS = [
  "applicant",
  "referral",
  "chairman",
  "admin",
  "all_admins",
] as const;
export type NudgeRecipientKind = (typeof NUDGE_RECIPIENT_KINDS)[number];

export interface StageConfig {
  enabled: boolean;
  intervals_hours: number[];
  recipients: NudgeRecipientKind[];
}

export type NudgeConfig = Record<NudgeStage, StageConfig>;

export const STAGE_LABEL: Record<NudgeStage, string> = {
  applicant_link_unopened: "Applicant hasn't opened the link",
  applicant_form_in_draft: "Applicant form in draft",
  referral_unsigned: "Referral hasn't signed",
  chairman_unsigned: "Chairman hasn't signed",
  ready_to_send_unactioned: "Ready-to-send sitting too long",
  at_hq_stalled: "At HQ — no outcome recorded",
};

/**
 * Returns the application status this stage applies to. Used by the engine
 * to filter the candidate pool with a single index hit.
 */
export const STAGE_STATUS: Record<NudgeStage, string> = {
  applicant_link_unopened: "APPLICANT_INVITED",
  applicant_form_in_draft: "APPLICANT_FILLING",
  referral_unsigned: "REFERRAL_INVITED",
  chairman_unsigned: "PENDING_CHAIRMAN",
  ready_to_send_unactioned: "READY_TO_SEND",
  at_hq_stalled: "SENT_TO_HQ",
};
