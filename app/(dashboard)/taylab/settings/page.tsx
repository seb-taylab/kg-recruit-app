import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveSettings } from "@/lib/settings/resolve";
import { PlatformSettingsForm } from "@/components/taylab/PlatformSettingsForm";
import { NudgeStagesForm } from "@/components/branch/NudgeStagesForm";
import { savePlatformNudgeStagesAction } from "@/app/(dashboard)/taylab/settings/actions";
import { NUDGE_STAGES, type NudgeStage, type NudgeConfig } from "@/lib/nudges/stages";

export default async function PlatformSettingsPage() {
  const auth = await requireAuth();
  if (auth.profile.role !== "taylab_staff") {
    redirect("/branch");
  }

  // Reuse the resolver — for taylab_staff (no branch) it returns pure
  // platform defaults with no branch override layered on top.
  const effective = await getEffectiveSettings(null);

  const admin = createAdminClient();
  const { data: nudgeRow } = await admin
    .from("platform_settings" as never)
    .select("value")
    .eq("key", "nudge_config")
    .single();
  const nudgeConfig =
    (nudgeRow as { value: NudgeConfig } | null)?.value ?? null;
  const enabledByStage = Object.fromEntries(
    NUDGE_STAGES.map((s) => [s, nudgeConfig?.[s]?.enabled ?? false]),
  ) as Record<NudgeStage, boolean>;
  const intervalByStage = Object.fromEntries(
    NUDGE_STAGES.map((s) => [s, nudgeConfig?.[s]?.intervals_hours?.[0] ?? 168]),
  ) as Record<NudgeStage, number>;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          Platform settings
        </h1>
        <p className="text-text-secondary">
          Global defaults that every branch inherits unless they override on their own
          settings page.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Defaults</CardTitle>
          <CardDescription>
            Changes apply immediately. Branches keep any override they&rsquo;ve already set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlatformSettingsForm
            current={{
              inviteTtlHours: effective.inviteTtlHours,
              inviteTtlMaxHours: effective.inviteTtlMaxHours,
              defaultRoutingMode: effective.defaultRoutingMode,
              pdfPresignedUrlTtlDays: effective.pdfPresignedUrlTtlDays,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auto-nudge defaults</CardTitle>
          <CardDescription>
            Default stage toggles. Branches can override on their own settings page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NudgeStagesForm
            scope="platform"
            initialEnabled={enabledByStage}
            intervalHours={intervalByStage}
            saveAction={savePlatformNudgeStagesAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}
