/**
 * Audit log writer.
 *
 * PRD §6 feature 22 enumerates 28+ action strings. We accept any string at
 * the type level (so future actions don't need a code change) but expose
 * a few constants for the actions used in early build steps.
 */
import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";

export type AuditAction =
  | "CREATED"
  | "INVITED"
  | "LINK_GENERATED"
  | "LINK_DELIVERED"
  | "LINK_OPENED"
  | "NRIC_UPLOADED"
  | "PHOTO_UPLOADED"
  | "PHOTO_REPLACED"
  | "SIGNED"
  | "REFERRAL_ASSIGNED"
  | "ADMIN_REVIEWED"
  | "READY_TO_SEND"
  | "SENT_TO_HQ"
  | "HQ_OUTCOME_RECORDED_APPROVED"
  | "HQ_OUTCOME_RECORDED_REJECTED"
  | "HQ_OUTCOME_REVERSED"
  | "REJECTED"
  | "EXPIRED"
  | "ARCHIVED"
  | "UNARCHIVED"
  | "TTL_EXTENDED"
  | "NRIC_PURGED"
  | "USER_INVITED"
  | "USER_DEACTIVATED"
  | "USER_REACTIVATED"
  | "USER_PROMOTED"
  | "USER_DEMOTED"
  | "PASSWORD_RESET_TRIGGERED"
  | "SETTINGS_CHANGED"
  | "NUDGE_SENT"
  | "TAYLAB_VIEW";

export interface AuditEntry {
  action: AuditAction;
  applicationId?: string | null;
  branchId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: UserRole | null;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  const supabase = createAdminClient();
  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = headerStore.get("user-agent") ?? null;

  await supabase.from("audit_log" as never).insert({
    application_id: entry.applicationId ?? null,
    branch_id: entry.branchId ?? null,
    actor_id: entry.actorId ?? null,
    actor_email: entry.actorEmail ?? null,
    actor_role: entry.actorRole ?? null,
    action: entry.action,
    metadata: entry.metadata ?? null,
    ip_address: ip,
    user_agent: ua,
  } as never);
}

/** Convenience writer for the parallel `application_events` table. */
export async function writeApplicationEvent(opts: {
  applicationId: string;
  branchId: string;
  eventType: string;
  actorId?: string | null;
  actorRole?: UserRole | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createAdminClient();
  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = headerStore.get("user-agent") ?? null;

  await supabase.from("application_events" as never).insert({
    application_id: opts.applicationId,
    branch_id: opts.branchId,
    event_type: opts.eventType,
    actor_id: opts.actorId ?? null,
    actor_role: opts.actorRole ?? null,
    metadata: opts.metadata ?? null,
    ip_address: ip,
    user_agent: ua,
  } as never);
}
