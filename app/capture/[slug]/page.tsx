/**
 * Booth capture page — public route, auth-gated.
 *
 * Lives OUTSIDE the (dashboard) route group because the booth tablet wants
 * a clean form, no sidebar/topbar chrome. Auth check is in-page (server
 * component) — if the user is not a wing_admin / wing_chairman of the
 * event's wing (or taylab_staff), they bounce to /login?next=...
 *
 * On submit the page does NOT reload — the client form calls the server
 * action and resets in place. This keeps booth UX fast for sequential
 * captures.
 */
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { CaptureForm } from "@/components/wing/CaptureForm";
import { CAPTURE_CONSENT_VERSION, CAPTURE_CONSENT_TEXT } from "./consent";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CapturePage({ params }: PageProps) {
  const { slug } = await params;

  const auth = await getAuthContext();
  if (!auth) {
    // Booth admin needs to log in. Preserve the capture URL as `next`
    // so they land back here.
    const next = encodeURIComponent(`/capture/${slug}`);
    redirect(`/login?next=${next}`);
  }

  // Only wing roles + taylab can capture. Other roles bounce.
  if (
    auth.profile.role !== "wing_admin" &&
    auth.profile.role !== "wing_chairman" &&
    auth.profile.role !== "taylab_staff"
  ) {
    redirect("/branch");
  }

  if (!auth.branch) {
    // Wing admin without a wing — shouldn't happen, but defensive.
    redirect("/wing");
  }

  // Resolve the event. For wing roles we restrict to their own wing; taylab
  // can capture against any event (cross-tenant ops, e.g. seeding test data).
  const admin = createAdminClient();
  let query = admin
    .from("events" as never)
    .select("id, name, branch_id, is_active, branches!inner(name)")
    .eq("slug", slug);
  if (auth.profile.role !== "taylab_staff") {
    query = query.eq("branch_id", auth.branch.id);
  }
  const { data: eventRow } = await query.single();
  const event = eventRow as
    | { id: string; name: string; branch_id: string; is_active: boolean; branches: { name: string } | { name: string }[] | null }
    | null;
  if (!event) notFound();
  if (!event.is_active) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-10">
        <Card>
          <CardContent className="flex flex-col gap-2 p-6 text-center">
            <h1 className="text-xl font-bold text-text-primary">{event.name}</h1>
            <p className="text-text-secondary">This event is closed — capture is disabled.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const branchName = Array.isArray(event.branches)
    ? event.branches[0]?.name ?? "Wing"
    : event.branches?.name ?? "Wing";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-10">
      <Card>
        <CardContent className="p-6">
          <CaptureForm
            eventSlug={slug}
            eventName={event.name}
            branchName={branchName}
            consentText={CAPTURE_CONSENT_TEXT}
          />
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-text-muted">
        {/* Institutional attribution — the attendee sees the wing name,
            not the booth admin's personal name. The admin's user_id is
            still recorded in leads.captured_by_user_id for audit, just
            not surfaced to the attendee. */}
        <strong className="text-text-secondary">{branchName}</strong>{" "}
        · consent {CAPTURE_CONSENT_VERSION}
      </p>
    </main>
  );
}
