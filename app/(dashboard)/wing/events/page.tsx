/**
 * Wing events — list view + create dialog.
 *
 * Lists all events owned by the current wing. Each row exposes the
 * capture URL (copyable to the booth tablet) and a per-event lead
 * count (Sprint 2.5 will add deeper drill-down — for now we just show
 * a count so the wing can see capture is happening).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateEventDialog } from "@/components/wing/CreateEventDialog";
import { formatDateDDMMMYYYY } from "@/lib/format/date";
import { isWingRole } from "@/types/database";

interface EventRow {
  id: string;
  name: string;
  slug: string;
  event_date: string | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
}

export default async function WingEventsPage() {
  const auth = await requireAuth();

  if (!isWingRole(auth.profile.role)) {
    if (auth.profile.role === "taylab_staff") redirect("/taylab");
    redirect("/branch");
  }
  if (!auth.branch || auth.branch.branch_type !== "wing") {
    redirect("/wing");
  }

  const admin = createAdminClient();

  // Events + leads (for per-event counts) are independent — both wing-scoped
  // and small in volume. Parallelize.
  const [{ data: rows }, { data: leadRows }] = await Promise.all([
    admin
      .from("events" as never)
      .select("id, name, slug, event_date, location, is_active, created_at")
      .eq("branch_id", auth.branch.id)
      .order("created_at", { ascending: false }),
    admin
      .from("leads" as never)
      .select("event_id")
      .eq("wing_branch_id", auth.branch.id),
  ]);
  const events = (rows as EventRow[] | null) ?? [];

  // Per-event lead counts. Cheap because event count is small per wing.
  const counts = new Map<string, number>();
  for (const r of (leadRows as Array<{ event_id: string }> | null) ?? []) {
    counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold leading-tight text-text-primary">Events</h1>
          <p className="text-text-secondary">
            {events.length} event{events.length === 1 ? "" : "s"}. Each event has its own
            booth capture URL.
          </p>
        </div>
        {auth.profile.role === "wing_admin" && <CreateEventDialog />}
      </header>

      {events.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No events yet</CardTitle>
            <CardDescription>
              Create one to generate a booth capture URL.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((ev) => {
            const leadCount = counts.get(ev.id) ?? 0;
            const captureHref = `/capture/${ev.slug}`;
            return (
              <Card key={ev.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <CardTitle>{ev.name}</CardTitle>
                      <CardDescription>
                        {ev.event_date
                          ? formatDateDDMMMYYYY(new Date(ev.event_date))
                          : "No date set"}
                        {ev.location ? ` · ${ev.location}` : ""}
                        {" · "}
                        {ev.is_active ? "Active" : "Closed"}
                      </CardDescription>
                    </div>
                    <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary">
                      {leadCount} lead{leadCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="text-sm text-text-muted">Capture URL</div>
                  <Link
                    href={captureHref}
                    className="block rounded-md border border-border bg-surface-page px-3 py-2 font-mono text-sm text-text-primary hover:bg-surface-card"
                  >
                    {captureHref}
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Alert variant="info">
        <AlertDescription>
          Tip: open <code>/capture/&lt;slug&gt;</code> in a new tab on the booth tablet.
          You stay logged in as wing admin — each capture is attributed to you.
        </AlertDescription>
      </Alert>
    </div>
  );
}
