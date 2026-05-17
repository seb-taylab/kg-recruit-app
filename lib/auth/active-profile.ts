/**
 * Active-profile cookie helpers (multi-profile model — Sprint 3.2).
 *
 * Tells the server which of a user's N profiles is the currently-selected
 * one. The cookie is httpOnly + lax + 30-day; it survives normal browsing
 * but a user with no cookie OR an invalidated cookie falls back to the
 * workspace picker.
 *
 * IMPORTANT: this is a UX affordance, not a security boundary. RLS allows
 * access to anything the user has ANY active profile for, regardless of the
 * cookie. The cookie just tells the UI which workspace to show.
 */
import "server-only";
import { cookies } from "next/headers";

export const ACTIVE_PROFILE_COOKIE = "active_profile_id";
const COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export async function setActiveProfileCookie(profileId: string): Promise<void> {
  const c = await cookies();
  c.set({
    name: ACTIVE_PROFILE_COOKIE,
    value: profileId,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_TTL_SECONDS,
  });
}

export async function readActiveProfileCookie(): Promise<string | null> {
  const c = await cookies();
  return c.get(ACTIVE_PROFILE_COOKIE)?.value ?? null;
}

export async function clearActiveProfileCookie(): Promise<void> {
  const c = await cookies();
  c.delete(ACTIVE_PROFILE_COOKIE);
}
