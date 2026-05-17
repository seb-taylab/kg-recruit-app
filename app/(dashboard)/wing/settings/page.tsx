/**
 * Wing settings — wing details + observation thresholds editor.
 *
 * Sprint 5 shipped the wing_observation_preferences schema. This page is
 * the editor surface. Wing details stay read-only for now (rename action
 * would need a wing-admin RLS branch on branches.update — separate work).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CalendarDays, Users, Flame } from "lucide-react";
import { requireAuth } from "@/lib/auth/get-user";
import { isWingRole } from "@/types/database";
import { getWingObservationPrefs } from "@/lib/wing/observation-prefs";
import { ObservationPrefsForm } from "@/components/wing/ObservationPrefsForm";

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

  const prefs = await getWingObservationPrefs(auth.activeBranch.id);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">Settings</h1>
        <p className="text-text-secondary">
          Wing-level configuration for {auth.activeBranch.name}.
        </p>
      </header>

      {/* Quick links to the rest of the wing workspace. Useful because
          Settings is otherwise an island. */}
      <section className="grid gap-3 sm:grid-cols-3">
        <QuickLink
          href="/wing/triage"
          icon={Flame}
          label="Triage"
          hint="Hot leads, routing decisions"
        />
        <QuickLink
          href="/wing/events"
          icon={CalendarDays}
          label="Events"
          hint="Capture URLs + per-event counts"
        />
        <QuickLink
          href="/wing/team"
          icon={Users}
          label="Team"
          hint="Invite admins, manage access"
        />
      </section>

      {/* Wing details — read-only. Constituency is omitted for wings
          because the field is meaningful only for territorial branches. */}
      <Card>
        <CardHeader>
          <CardTitle>Wing details</CardTitle>
          <CardDescription>
            Renaming is handled by Taylab platform staff for now.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Name</span>
            <span className="font-medium text-text-primary">{auth.activeBranch.name}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Type</span>
            <span className="font-medium text-text-primary">wing</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">HQ email</span>
            <span className="font-medium text-text-primary">
              {auth.activeBranch.hq_email ?? "—"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Observation thresholds — real editor as of 2026-05-18. */}
      <Card>
        <CardHeader>
          <CardTitle>Observation thresholds</CardTitle>
          <CardDescription>
            Wing-level pulse. Day cutoffs drive the triage view&rsquo;s
            attention flags and the reroute / cold-path policy. Tighter
            numbers ⇒ more proactive wing intervention.
            {prefs.hasRow && prefs.updated_at && (
              <span className="ml-1 text-text-muted">
                Last updated{" "}
                {formatDistanceToNow(new Date(prefs.updated_at), { addSuffix: true })}.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ObservationPrefsForm
            defaults={{
              ack_attention_days: prefs.ack_attention_days,
              engagement_attention_days: prefs.engagement_attention_days,
              form_sent_attention_days: prefs.form_sent_attention_days,
              lead_aging_days: prefs.lead_aging_days,
              lead_cold_days: prefs.lead_cold_days,
              branch_saturation_threshold: prefs.branch_saturation_threshold,
            }}
            hasRow={prefs.hasRow}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-md border border-border bg-surface-card p-4 transition-colors hover:bg-surface-page"
    >
      <Icon className="h-5 w-5 shrink-0 text-text-secondary" strokeWidth={1.5} aria-hidden />
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-text-primary">{label}</span>
        <span className="text-xs text-text-muted">{hint}</span>
      </div>
    </Link>
  );
}
