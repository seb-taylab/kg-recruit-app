/**
 * Sign-out endpoint. POSTed by the TopBar form so the session cookie is
 * cleared on the server (cookies cannot be unset from a client component).
 *
 * CSRF protection: cross-origin POSTs are rejected by checking the
 * `Origin` header against the request's host. Without this, an attacker
 * could trigger sign-out via an iframe form auto-submit on any page the
 * victim visits. Sebastian's 2026-05-16 audit, finding M2.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clearActiveProfileCookie } from "@/lib/auth/active-profile";

export async function POST(request: NextRequest) {
  const { origin, host } = new URL(request.url);

  // Same-origin enforcement. Browsers always send Origin on POST, so a
  // missing header is suspect. We accept null Origin only for the
  // `Sec-Fetch-Site: same-origin` case to be tolerant of unusual stacks
  // (some privacy modes strip Origin).
  const reqOrigin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const sameOrigin =
    (reqOrigin && new URL(reqOrigin).host === host) || fetchSite === "same-origin";
  if (!sameOrigin) {
    return NextResponse.json(
      { error: "Cross-origin sign-out is not allowed." },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  // Clear the active-profile cookie too — next signin should re-pick the
  // workspace, not inherit this session's selection.
  await clearActiveProfileCookie();
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
