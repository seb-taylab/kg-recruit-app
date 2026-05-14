/**
 * Server-only helpers for loading the authenticated profile.
 * Use in server components / server actions / route handlers.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Branch, Profile } from "@/types/database";

export interface AuthContext {
  userId: string;
  email: string | null;
  profile: Profile;
  branch: Branch | null;
}

/** Returns the active profile or null when unauthenticated / deactivated. */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  const profile = profileRow as Profile | null;

  if (!profile || !profile.is_active) return null;

  let branch: Branch | null = null;
  if (profile.branch_id) {
    const { data } = await supabase
      .from("branches")
      .select("*")
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
}

/** Throws when there is no auth context. Convenience for server components. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Not authenticated");
  return ctx;
}
