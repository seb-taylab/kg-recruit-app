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

/**
 * PII keys we NEVER want in audit metadata, even when a future refactor
 * accidentally passes them through. Comparison is lowercased + matched
 * exactly — so "nric", "NRIC", "Nric_No" all hit. Sub-objects are
 * recursively scrubbed.
 *
 * Sebastian's 2026-05-16 audit, finding M3.
 */
const PII_KEYS = new Set([
  "nric",
  "nric_no",
  "password",
  "passcode",
  "token",
  "token_hash",
  "raw_token",
  "share_token",
  "session_token",
  "access_token",
  "refresh_token",
  "secret",
  "api_key",
]);

function scrubMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (PII_KEYS.has(key.toLowerCase())) {
      out[key] = "[REDACTED]";
    } else if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      // Recurse into nested objects so a future caller that wraps
      // metadata in a sub-object still gets scrubbed.
      out[key] = scrubMetadata(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

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
  | "TAYLAB_VIEW"
  // Wing / events / leads (v4.1 lead routing, Sprint 2+)
  | "EVENT_CREATED"
  | "EVENT_TOGGLED"
  | "LEAD_CAPTURED"
  | "LEAD_ROUTED"
  | "LEAD_ENGAGED"
  | "LEAD_CONVERTED"
  | "LEAD_ARCHIVED";

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
    metadata: entry.metadata ? scrubMetadata(entry.metadata) : null,
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
    metadata: opts.metadata ? scrubMetadata(opts.metadata) : null,
    ip_address: ip,
    user_agent: ua,
  } as never);
}
