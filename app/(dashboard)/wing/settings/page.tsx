/**
 * Wing settings — minimal Sprint 4 surface.
 *
 * Reads branch name + constituency for display; observation thresholds
 * (Hot/Warm/Cold day cutoffs from the v4.1 design) land in Sprint 5
 * with the wing_observation_preferences table.
 */
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
import { isWingRole } from "@/types/database";

export default async function WingSettingsPage() {
  const auth = await requireAuth();

  if (!isWingRole(auth.activeProfile.role)) {
    if (auth.activeProfile.role === "taylab_staff") redirect("/taylab");
    redirect("/branch");
  }
  if (!auth.activeBranch || auth.activeBranch.branch_type !== "wing") {
    redirect("/select-workspace");
  }
  if (auth.activeProfile.role !== "wing_admin") {
    redirect("/wing");
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">Settings</h1>
        <p className="text-text-secondary">Wing-level configuration.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Wing details</CardTitle>
          <CardDescription>Read-only for now.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Name</span>
            <span className="font-medium text-text-primary">{auth.activeBranch.name}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Constituency</span>
            <span className="font-medium text-text-primary">
              {auth.activeBranch.constituency ?? "—"}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Branch type</span>
            <span className="font-medium text-text-primary">{auth.activeBranch.branch_type}</span>
          </div>
        </CardContent>
      </Card>

      <Alert variant="info">
        <AlertDescription>
          Observation thresholds (Hot/Warm/Cold day cutoffs), reroute policy, and per-event
          consent versioning are coming in Sprint 5 — they need a separate{" "}
          <code>wing_observation_preferences</code> table that&rsquo;s not built yet. For
          now the system uses sensible defaults (14d → stalled, 30d → cold).
        </AlertDescription>
      </Alert>
    </div>
  );
}
