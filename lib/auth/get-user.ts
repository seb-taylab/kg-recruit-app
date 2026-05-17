/**
 * Server-only helpers for loading the authenticated profile.
 * Use in server components / server actions / route handlers.
 *
 * `getAuthContext` is wrapped in React's request-scoped `cache()` so the
 * common pattern — dashboard layout calls `getAuthContext()`, the child
 * page then calls `requireAuth()` — only hits Supabase once per request
 * (2-3 queries: getUser + profile + optional branch), not twice.
 *
 * Cache scope is one server request: a fresh React render tree gets a
 * fresh cache, so this can't accidentally leak between users.
 */
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Branch, Profile } from "@/types/database";

export interface AuthContext {
  userId: string;
  email: string | null;
  profile: Profile;
  branch: Branch | null;
}

/** Returns the active profile or null when unauthenticated / deactivated. */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Explicit column list — was `select("*")` (audit finding L2). Keeping
  // the list in sync with the Profile type, but the explicit form means
  // any future column added to `profiles` requires a deliberate decision
  // to surface it via getAuthContext rather than auto-leaking.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select(
      "id, full_name, role, branch_id, position, position_other, membership_no, is_active, deactivated_at, deactivated_by_id, promoted_at, promoted_by_id, created_at, created_by_id",
    )
    .eq("id", user.id)
    .single();
  const profile = profileRow as Profile | null;

  if (!profile || !profile.is_active) return null;

  let branch: Branch | null = null;
  if (profile.branch_id) {
    // Same rationale as profiles above — explicit list matches the
    // Branch type so a future column addition needs a deliberate decision.
    const { data } = await supabase
      .from("branches")
      .select(
        // branch_type + parent_wing_id added in migration
        // 20260517000001_wing_events_primitive.sql — exposed here so
        // the wing workspace + routing logic can read them without a
        // second round-trip.
        "id, name, constituency, hq_email, email_from_display_name, invite_ttl_hours, default_routing_mode, nudge_config, is_active, created_at, branch_type, parent_wing_id",
      )
      .eq("id", profile.branch_id)
      .single();
    branch = (data as Branch | null) ?? null;
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    branch,
  };
});

/** Throws when there is no auth context. Convenience for server components. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Not authenticated");
  return ctx;
}
