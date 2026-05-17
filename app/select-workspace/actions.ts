/**
 * Workspace picker — sets active_profile_id cookie + redirects.
 *
 * Validates the profile actually belongs to the calling user before setting
 * the cookie. Reads the profile's role/branch_type to compute the right
 * landing route (taylab → /taylab, wing → /wing, branch → /branch).
 */
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth/get-user";
import { setActiveProfileCookie } from "@/lib/auth/active-profile";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const schema = z.object({ profileId: z.string().uuid() });

export async function selectWorkspaceAction(
  input: z.input<typeof schema>,
): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };

  const session = await getAuthSession();
  if (!session) return { ok: false, error: "Not authenticated." };

  // The profile must belong to the current user — defence in depth even
  // though RLS already enforces this via profiles_select_self.
  const target = session.profiles.find((p) => p.id === parsed.data.profileId);
  if (!target) {
    return { ok: false, error: "That workspace isn't available to you." };
  }

  await setActiveProfileCookie(target.id);

  // Resolve landing route. Wing branches have branch_type='wing' on the
  // branches row — we read it here so the redirect goes to the right shell.
  let landingPath = "/branch";
  if (target.role === "taylab_staff") {
    landingPath = "/taylab";
  } else if (target.role === "wing_admin" || target.role === "wing_chairman") {
    landingPath = "/wing";
  }

  redirect(landingPath);
}
