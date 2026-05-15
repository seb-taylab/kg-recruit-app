/**
 * Supabase auth callback handler. Exchanges the `code` (PKCE) for a session
 * cookie, then redirects to `next` (defaults to /branch via middleware).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/auth/safe-redirect";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Reject protocol-relative + cross-origin candidates before
  // concatenation. The `${origin}${next}` shape neutralises `//evil.com`
  // accidentally today (browser normalises to a same-host path), but
  // the guard is the explicit contract — see lib/auth/safe-redirect.ts.
  const next = safeInternalPath(searchParams.get("next"), "/");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/apply/invalid`);
}
