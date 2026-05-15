/**
 * Token-hash based email confirmation endpoint.
 *
 * Replaces the Supabase-hosted /auth/v1/verify redirect for transactional
 * emails (password reset, signup confirm, email change). The Supabase-hosted
 * URL is pre-executed by Gmail / Outlook / Google Workspace link scanners,
 * which consumes the one-time OTP before the user clicks it — the user then
 * sees "Email link is invalid or has expired".
 *
 * With token_hash + this route, verification happens on OUR server with the
 * user's own session cookies. Scanners that HEAD/GET the link can't consume
 * the OTP because they don't carry the user's cookies and Supabase rejects
 * the verifyOtp call without them.
 *
 * Pattern source: https://supabase.com/docs/guides/auth/server-side/email-based-auth-with-pkce
 */
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/auth/safe-redirect";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Reject protocol-relative + cross-origin destinations before
  // concatenation — see lib/auth/safe-redirect.ts.
  const next = safeInternalPath(searchParams.get("next"), "/");

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/apply/invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) {
    // Pass the error along on a generic landing so the user knows the link
    // didn't work without leaking implementation detail in the URL.
    return NextResponse.redirect(`${origin}/apply/invalid`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
