/**
 * Server-only helpers for loading the authenticated profile.
 * Use in server components / server actions / route handlers.
 *
 * Two entry points:
 *   - getAuthSession()  — enumerates ALL active profiles for the user.
 *                         Use in the workspace picker / login flow.
 *                         Never redirects; returns null when not authed.
 *   - getAuthContext()  — resolves the ACTIVE profile from the cookie.
 *                         Redirects to /select-workspace when the user has
 *                         multiple profiles and no valid cookie. Returns
 *                         null only when truly unauthenticated.
 *
 * Both are wrapped in React's request-scoped `cache()` so the common pattern
 * (dashboard layout calls getAuthContext, child page calls requireAuth) only
 * hits Supabase once per request.
 *
 * Multi-profile model: a user can hold N profiles across N branches (e.g.
 * wing_admin at Young PAP + branch_admin at KG). The active-profile cookie
 * selects which workspace the UI is currently in. RLS is permissive — the
 * cookie is UX, not a security boundary.
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Branch, Profile } from "@/types/database";
import { readActiveProfileCookie } from "@/lib/auth/active-profile";

export interface AuthSession {
  userId: string;
  email: string | null;
  /** Every active profile the user has, ordered by created_at asc. */
  profiles: Profile[];
}

export interface AuthContext extends AuthSession {
  /** The profile selected via active_profile_id cookie (or the only one). */
  activeProfile: Profile;
  /** Branch corresponding to activeProfile.branch_id (null for taylab_staff). */
  activeBranch: Branch | null;
  /**
   * Legacy alias for activeProfile — preserved so existing callers don't
   * have to rename. New code should prefer activeProfile.
   */
  profile: Profile;
  /** Legacy alias for activeBranch. */
  branch: Branch | null;
}

const PROFILE_COLUMNS =
  "id, user_id, full_name, role, branch_id, position, position_other, membership_no, is_active, deactivated_at, deactivated_by_id, promoted_at, promoted_by_id, created_at, created_by_id";

const BRANCH_COLUMNS =
  "id, name, constituency, hq_email, email_from_display_name, invite_ttl_hours, default_routing_mode, nudge_config, is_active, created_at, branch_type, parent_wing_id";

/**
 * Enumerate all active profiles for the authenticated user. Never redirects.
 * Use this in the workspace picker + the login post-action.
 */
export const getAuthSession = cache(async (): Promise<AuthSession | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Match on user_id (multi-profile model). Old code matched on id, which
  // worked under 1:1 — under the new model that's incorrect because new
  // profile rows have id = gen_random_uuid() != user_id.
  const { data: profileRows } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  const profiles = (profileRows as Profile[] | null) ?? [];
  if (profiles.length === 0) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    profiles,
  };
});

/**
 * Resolve the user's active profile from the cookie. Loads the branch row
 * for it. If the user has multiple profiles and no valid cookie, this
 * redirects to /select-workspace (the call never returns).
 *
 * Returns null only when truly unauthenticated.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const session = await getAuthSession();
  if (!session) return null;

  const { profiles } = session;

  let activeProfile: Profile | null = null;

  if (profiles.length === 1) {
    // Single-profile user — no picker needed. Implicit activation.
    activeProfile = profiles[0];
  } else {
    const cookieId = await readActiveProfileCookie();
    if (cookieId) {
      activeProfile = profiles.find((p) => p.id === cookieId) ?? null;
    }
  }

  if (!activeProfile) {
    // Multi-profile user without a (valid) cookie → must pick a workspace.
    // The picker lives OUTSIDE the (dashboard) group, so it uses
    // getAuthSession (not getAuthContext) and is not affected by this
    // redirect. The redirect throws — execution stops here.
    redirect("/select-workspace");
  }

  // Load the active branch (if any).
  const supabase = await createClient();
  let activeBranch: Branch | null = null;
  if (activeProfile.branch_id) {
    const { data } = await supabase
      .from("branches")
      .select(BRANCH_COLUMNS)
      .eq("id", activeProfile.branch_id)
      .single();
    activeBranch = (data as Branch | null) ?? null;
  }

  return {
    ...session,
    activeProfile,
    activeBranch,
    // Legacy aliases — existing callers using auth.profile / auth.branch
    // keep working without modification.
    profile: activeProfile,
    branch: activeBranch,
  };
});

/** Throws when there is no auth context. Convenience for server components. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Not authenticated");
  return ctx;
}
