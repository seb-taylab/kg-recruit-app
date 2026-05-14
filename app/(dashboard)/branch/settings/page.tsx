import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveSettings } from "@/lib/settings/resolve";
import { BranchSettingsForm } from "@/components/branch/BranchSettingsForm";
import { NudgeStagesForm } from "@/components/branch/NudgeStagesForm";
import { saveBranchNudgeStagesAction } from "@/app/(dashboard)/branch/settings/actions";
import { NUDGE_STAGES, type NudgeStage, type NudgeConfig } from "@/lib/nudges/stages";

interface BranchRow {
  hq_email: string | null;
  email_from_display_name: string | null;
  invite_ttl_hours: number | null;
  default_routing_mode: "direct_to_chairman" | "via_branch_admin_review" | null;
  nudge_config: NudgeConfig | null;
}

interface PlatformNudgeRow {
  value: NudgeConfig;
}

export default async function BranchSettingsPage() {
  const auth = await requireAuth();
  if (
    !auth.branch ||
    (auth.profile.role !== "branch_master_admin" && auth.profile.role !== "branch_admin")
  ) {
    redirect("/branch");
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("branches")
    .select("hq_email, email_from_display_name, invite_ttl_hours, default_routing_mode, nudge_config")
    .eq("id", auth.branch.id)
    .single();
  const branch = (row as BranchRow | null) ?? {
    hq_email: null,
    email_from_display_name: null,
    invite_ttl_hours: null,
    default_routing_mode: null,
    nudge_config: null,
  };

  const effective = await getEffectiveSettings(auth.branch.id);

  const { data: platformNudgeRow } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "nudge_config")
    .single();
  const platformNudgeConfig = (platformNudgeRow as PlatformNudgeRow | null)?.value;
  const resolvedConfig: NudgeConfig | null = branch.nudge_config ?? platformNudgeConfig ?? null;
  const enabledByStage = Object.fromEntries(
    NUDGE_STAGES.map((s) => [s, resolvedConfig?.[s]?.enabled ?? false]),
  ) as Record<NudgeStage, boolean>;
  const intervalByStage = Object.fromEntries(
    NUDGE_STAGES.map((s) => [s, resolvedConfig?.[s]?.intervals_hours?.[0] ?? 168]),
  ) as Record<NudgeStage, number>;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">Branch settings</h1>
        <p className="text-text-secondary">
          Per-branch overrides. Leave a field blank to inherit the platform default.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Overrides</CardTitle>
          <CardDescription>
            Changes apply immediately to new invites and outbound emails. They don&rsquo;t
            retroactively shorten existing magic links — use the per-application Extend
            control for that.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BranchSettingsForm
            current={{
              hqEmail: branch.hq_email,
              emailFromDisplayName: branch.email_from_display_name,
              inviteTtlHours: branch.invite_ttl_hours,
              defaultRoutingMode: branch.default_routing_mode,
            }}
            effective={{
              inviteTtlHours: effective.inviteTtlHours,
              inviteTtlMaxHours: effective.inviteTtlMaxHours,
              defaultRoutingMode: effective.defaultRoutingMode,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auto-nudges</CardTitle>
          <CardDescription>
            Toggle reminder emails per stage. Intervals + recipients are set by the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NudgeStagesForm
            scope="branch"
            initialEnabled={enabledByStage}
            intervalHours={intervalByStage}
            saveAction={saveBranchNudgeStagesAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}
