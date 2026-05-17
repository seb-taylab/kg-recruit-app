"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/auth/safe-redirect";
import { setActiveProfileCookie, clearActiveProfileCookie } from "@/lib/auth/active-profile";

const schema = z.object({
  email: z.string().email("That doesn't look like a valid email — check the @ and the domain"),
  password: z.string().min(1, "Password is required"),
  next: z.string().optional(),
});

export interface SignInState {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
}

export async function signIn(_prev: SignInState | undefined, formData: FormData): Promise<SignInState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: SignInState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "email" || key === "password") fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { error: "Couldn't sign in — check your email and password and try again." };
  }

  // Load ALL active profiles for this user (multi-profile model). Match on
  // user_id, not id — under the new model id is a per-profile identity.
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, role, is_active, branch_id")
    .eq("user_id", data.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  const profiles =
    (profileRows as Array<{ id: string; role: string; is_active: boolean; branch_id: string | null }> | null) ??
    [];

  if (profiles.length === 0) {
    await supabase.auth.signOut();
    return {
      error: "This account has been deactivated. Contact your branch coordinator.",
    };
  }

  // Clear any stale cookie from a previous session — a fresh signin should
  // re-resolve the active workspace, not inherit the last one.
  await clearActiveProfileCookie();

  // Multi-profile users → workspace picker. The picker will set the cookie
  // and redirect to the right shell.
  if (profiles.length > 1) {
    redirect("/select-workspace");
  }

  // Single-profile user — set the cookie eagerly and route directly to the
  // role's home. Three landing zones:
  //   taylab_staff             → /taylab (cross-tenant ops)
  //   wing_admin/wing_chairman → /wing   (wing dispatcher workspace)
  //   everything else          → /branch (the existing default)
  const only = profiles[0];
  await setActiveProfileCookie(only.id);

  const fallback =
    only.role === "taylab_staff"
      ? "/taylab"
      : only.role === "wing_admin" || only.role === "wing_chairman"
        ? "/wing"
        : "/branch";
  // safeInternalPath rejects `//evil.com` (protocol-relative) and any
  // other shape that could escape the origin via redirect(). See
  // lib/auth/safe-redirect.ts.
  redirect(safeInternalPath(parsed.data.next, fallback));
}
