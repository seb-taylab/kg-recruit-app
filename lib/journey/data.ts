/**
 * Server-side data shaping for the Journey dashboard. Keeps the
 * tenant-scoped query + display-name derivation in one place so the
 * table / kanban / timeline don't drift.
 */
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { JOURNEY_HIDDEN, type ApplicationStatus } from "@/lib/journey/status";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export interface JourneyRow {
  id: string;
  status: ApplicationStatus;
  displayName: string;
  referralName: string | null;
  invitedAt: string | null;
  lastActivityAt: string | null;
}

interface RawAppRow {
  id: string;
  status: ApplicationStatus;
  applicant_name_at_invite: string | null;
  surname: string | null;
  given_names: string | null;
  assigned_referral_name: string | null;
  applicant_invited_at: string | null;
  applicant_filling_started_at: string | null;
  applicant_signed_at: string | null;
  referral_assigned_at: string | null;
  referral_signed_at: string | null;
  branch_admin_review_at: string | null;
  chairman_signed_at: string | null;
  ready_to_send_at: string | null;
  sent_to_hq_at: string | null;
  hq_outcome_recorded_at: string | null;
  archived_at: string | null;
  completed_at: string | null;
}

function lastActivity(r: RawAppRow): string | null {
  const candidates = [
    r.archived_at,
    r.completed_at,
    r.hq_outcome_recorded_at,
    r.sent_to_hq_at,
    r.ready_to_send_at,
    r.chairman_signed_at,
    r.branch_admin_review_at,
    r.referral_signed_at,
    r.referral_assigned_at,
    r.applicant_signed_at,
    r.applicant_filling_started_at,
    r.applicant_invited_at,
  ].filter((v): v is string => Boolean(v));
  if (candidates.length === 0) return null;
  // Returned timestamps may be ISO strings; pick the latest.
  return candidates.reduce((a, b) => (a > b ? a : b));
}

export async function loadJourneyApplications(
  supabase: ServerSupabase,
  branchId: string,
): Promise<JourneyRow[]> {
  const { data: rows } = await supabase
    .from("applications")
    .select(
      "id, status, applicant_name_at_invite, surname, given_names, assigned_referral_name, applicant_invited_at, applicant_filling_started_at, applicant_signed_at, referral_assigned_at, referral_signed_at, branch_admin_review_at, chairman_signed_at, ready_to_send_at, sent_to_hq_at, hq_outcome_recorded_at, archived_at, completed_at",
    )
    .eq("branch_id", branchId)
    .order("applicant_invited_at", { ascending: false });

  const raw = (rows as RawAppRow[] | null) ?? [];
  return raw
    .filter((r) => !JOURNEY_HIDDEN.includes(r.status))
    .map((r) => ({
      id: r.id,
      status: r.status,
      displayName:
        (r.given_names && r.surname
          ? `${r.given_names} ${r.surname}`
          : r.applicant_name_at_invite) ?? "(no name on record)",
      referralName: r.assigned_referral_name,
      invitedAt: r.applicant_invited_at,
      lastActivityAt: lastActivity(r),
    }));
}

export interface TimelineEventRow {
  id: string;
  applicationId: string;
  applicantName: string;
  eventType: string;
  occurredAt: string;
  actorRole: string | null;
}

interface RawEventRow {
  id: string;
  application_id: string;
  event_type: string;
  occurred_at: string;
  actor_role: string | null;
  applications: { surname: string | null; given_names: string | null; applicant_name_at_invite: string | null } | null;
}

export async function loadJourneyEvents(
  supabase: ServerSupabase,
  branchId: string,
  limit = 100,
): Promise<TimelineEventRow[]> {
  const { data: rows } = await supabase
    .from("application_events")
    .select(
      "id, application_id, event_type, occurred_at, actor_role, applications!inner(surname, given_names, applicant_name_at_invite)",
    )
    .eq("branch_id", branchId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  const raw = (rows as unknown as RawEventRow[] | null) ?? [];
  return raw.map((e) => ({
    id: e.id,
    applicationId: e.application_id,
    applicantName:
      (e.applications?.given_names && e.applications?.surname
        ? `${e.applications.given_names} ${e.applications.surname}`
        : e.applications?.applicant_name_at_invite) ?? "(no name on record)",
    eventType: e.event_type,
    occurredAt: e.occurred_at,
    actorRole: e.actor_role,
  }));
}
