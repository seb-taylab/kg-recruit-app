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
  const { pathname } = request.nextUrl;

  // Truly public routes — no session to gate, no role to check. Skipping
  // `updateSession` here means we don't pay the auth.getUser() + cookie
  // refresh round-trip on the applicant magic-link flow, the referral
  // sign flow, or the auth callbacks (which manage cookies themselves).
  // Trims ~20-30ms off these flows.
  if (
    pathname.startsWith("/apply/") ||
    pathname.startsWith("/referral/") ||
    pathname.startsWith("/auth/")
  ) {
    return NextResponse.next();
  }

  const { response, supabase, user } = await updateSession(request);

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

    // Multi-profile model: a user can hold N profiles across N branches
    // (e.g. wing_admin at Young PAP + branch_admin at KG, or taylab_staff
    // + branch profiles). Match on user_id, not id — profiles.id is an
    // independent UUID (gen_random_uuid()) per profile under the new
    // model, so .eq("id", user.id) returns null for any user created
    // after the 2026-05-17 multi-profile migration. lib/auth/get-user.ts
    // already does this correctly; proxy.ts was the regression.
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true);
    const profiles =
      (profileRows as Array<{ id: string; role: string; is_active: boolean }> | null) ?? [];

    if (profiles.length === 0) {
      // No active profile rows = deactivated. Sign them out then bounce.
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("reason", "deactivated");
      return NextResponse.redirect(url);
    }

    const hasTaylab = profiles.some((p) => p.role === "taylab_staff");
    const hasBranch = profiles.some((p) => p.role !== "taylab_staff");

    // Taylab platform is invisible to non-Taylab users — 404 instead of
    // redirect, so the route's existence isn't leaked.
    if (isTaylabPath && !hasTaylab) return notFoundResponse(request);

    // Branch routes accept only branch users. A pure Taylab-only user
    // hitting /branch gets bounced to /taylab (their own surface). Mixed
    // users (taylab + branch) stay — their active-profile cookie expresses
    // which workspace they're "in", and that resolves inside the dashboard.
    if (isBranchPath && hasTaylab && !hasBranch) {
      const url = request.nextUrl.clone();
      url.pathname = "/taylab";
      return NextResponse.redirect(url);
    }
  }

  if (isAuthPage && user) {
    // Same multi-profile fix — match on user_id, not id.
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true);
    const profiles =
      (profileRows as Array<{ role: string; is_active: boolean }> | null) ?? [];

    if (profiles.length > 0) {
      const url = request.nextUrl.clone();
      // Multi-profile users → workspace picker. Pure-taylab → /taylab.
      // Pure-branch (or wing) → /branch (or /wing handled downstream).
      if (profiles.length > 1) {
        url.pathname = "/select-workspace";
      } else {
        const only = profiles[0];
        url.pathname = only.role === "taylab_staff" ? "/taylab" : "/branch";
      }
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
