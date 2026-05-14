/**
 * Next.js Proxy (formerly Middleware) — runs on every request matched by `config.matcher`.
 *
 * Responsibilities:
 *  1. Refresh the Supabase auth session cookie (so server components see fresh state).
 *  2. Gate /branch/* + /taylab/* behind auth.
 *  3. Block deactivated users (profiles.is_active = false) from reaching dashboards.
 *  4. Send signed-in users away from /login.
 *  5. **Hide `/taylab/*` from anyone who isn't Taylab Staff** — unauthenticated
 *     users and branch users get a 404 (rendered via rewrite to a fake route).
 *     This means branch users don't learn that the Taylab platform layer
 *     exists, and the `?next=/taylab` leak from the login redirect is gone.
 *
 * The applicant / referral magic-link flows (/apply/[token], /referral/[token])
 * are PUBLIC — token validity is checked inside the route handler.
 */
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const AUTHED_REDIRECTS_AWAY = ["/login"] as const;

/** Rewrites to a non-existent route so Next renders the styled 404. */
function notFoundResponse(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/__taylab_invisible_404__";
  return NextResponse.rewrite(url);
}

export async function proxy(request: NextRequest) {
  const { response, supabase, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isBranchPath = pathname === "/branch" || pathname.startsWith("/branch/");
  const isTaylabPath = pathname === "/taylab" || pathname.startsWith("/taylab/");
  const isAuthPage = AUTHED_REDIRECTS_AWAY.some((p) => pathname === p);

  if (isBranchPath || isTaylabPath) {
    if (!user) {
      // Unauthed: branch routes bounce to /login?next=…; Taylab routes 404
      // (no breadcrumbs left).
      if (isTaylabPath) return notFoundResponse(request);
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", user.id)
      .single();
    const profile = profileRow as { id: string; role: string; is_active: boolean } | null;

    if (!profile || !profile.is_active) {
      // Sign them out then bounce to login.
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("reason", "deactivated");
      return NextResponse.redirect(url);
    }

    const isTaylab = profile.role === "taylab_staff";

    // Taylab platform is invisible to non-Taylab users — 404 instead of
    // redirect, so the route's existence isn't leaked.
    if (isTaylabPath && !isTaylab) return notFoundResponse(request);

    // Branch routes accept only branch users. Taylab Staff hitting /branch
    // gets bounced to /taylab (visible to them; their own surface).
    if (isBranchPath && isTaylab) {
      const url = request.nextUrl.clone();
      url.pathname = "/taylab";
      return NextResponse.redirect(url);
    }
  }

  if (isAuthPage && user) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .single();
    const profile = profileRow as { role: string; is_active: boolean } | null;

    if (profile?.is_active) {
      const url = request.nextUrl.clone();
      url.pathname = profile.role === "taylab_staff" ? "/taylab" : "/branch";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Skip Next internals + static assets. Match everything else.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
