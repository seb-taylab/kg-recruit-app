/**
 * Server-side loader for one application's event history. Used by the
 * "Status history" disclosure on the application detail page (the
 * relocated, narrowed version of what used to be the branch-wide
 * Journey Timeline).
 *
 * Returns events newest-first. The detail page reverses the visual to
 * top-to-bottom newest if that reads better in context.
 */
import "server-only";
import type { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export interface ApplicationEventRow {
  id: string;
  eventType: string;
  occurredAt: string;
  actorRole: string | null;
}

interface RawEventRow {
  id: string;
  event_type: string;
  occurred_at: string;
  actor_role: string | null;
}

export async function loadApplicationEvents(
  supabase: ServerSupabase,
  applicationId: string,
  limit = 100,
): Promise<ApplicationEventRow[]> {
  const { data: rows } = await supabase
    .from("application_events")
    .select("id, event_type, occurred_at, actor_role")
    .eq("application_id", applicationId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  const raw = (rows as RawEventRow[] | null) ?? [];
  return raw.map((e) => ({
    id: e.id,
    eventType: e.event_type,
    occurredAt: e.occurred_at,
    actorRole: e.actor_role,
  }));
}
