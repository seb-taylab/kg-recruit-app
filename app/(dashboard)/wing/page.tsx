/**
 * Wing workspace — Overview (placeholder).
 *
 * Sprint 1 of v4.1 ships ONLY the route + role gating. The actual Triage
 * view (Hot/Warm/Cool/Cold lead lists, reroute mechanics) lands in
 * Sprint 2 once the leads table exists. Events list lands in Sprint 3.
 *
 * For now: confirms a wing_admin / wing_chairman can log in, lands here,
 * sees nav items pointing to /wing/triage + /wing/events, and gets a
 * clear "next step" message.
 */
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireAuth } from "@/lib/auth/get-user";
import { isWingRole } from "@/types/database";

export default async function WingOverviewPage() {
  const auth = await requireAuth();

  // Only wing roles land here. taylab_staff bounces to /taylab; everyone
  // else bounces to /branch. This mirrors the gating pattern in the
  // existing taylab/* and branch/* pages.
  if (!isWingRole(auth.profile.role)) {
    if (auth.profile.role === "taylab_staff") redirect("/taylab");
    redirect("/branch");
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          {auth.branch?.name ?? "Wing"} — Overview
        </h1>
        <p className="text-text-secondary">
          Your wing workspace. Triage is where you&rsquo;ll act on inbound leads
          from events; Events is where you set up new capture flows.
        </p>
      </header>

      <Alert variant="info">
        <AlertTitle>Wing workspace — Sprint 1 of 3</AlertTitle>
        <AlertDescription>
          The wing branch primitive is live. Triage view (lead routing,
          reroute mechanics) and Events list ship in the next two sprints
          ahead of YP40. Sidebar nav points at the routes so you can verify
          your role + branch are correctly provisioned.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Triage</CardTitle>
            <CardDescription>
              Hot / Warm / Cool / Cold lead lists with one-click reroute. Ships in
              Sprint 2 (target: end of next week).
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-text-muted">
            Not yet available.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Events</CardTitle>
            <CardDescription>
              Set up capture flows for each event (YP40, future events). Each
              event gets a public booth-form URL.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-text-muted">
            Not yet available.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provisioning check</CardTitle>
          <CardDescription>
            What the system thinks your account is.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Role</span>
            <span className="font-medium text-text-primary">{auth.profile.role}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Branch</span>
            <span className="font-medium text-text-primary">
              {auth.branch?.name ?? "—"}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Branch type</span>
            <span className="font-medium text-text-primary">
              {auth.branch?.branch_type ?? "—"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
