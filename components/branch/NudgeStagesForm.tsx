/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (SettingsForm — checkbox group)
 * @consumes ui/Button, ui/Checkbox, ui/Label, ui/Alert
 * @used-by app/(dashboard)/branch/settings/page.tsx
 *          app/(dashboard)/taylab/settings/page.tsx
 *
 * Per-stage enabled toggles. Intentionally does NOT expose interval_hours
 * or recipients — those stay in the platform default JSONB to keep the UI
 * tractable. Saving with all toggles matching the platform default writes
 * a null override (branch scope only) so subsequent platform changes still
 * propagate.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NUDGE_STAGES, STAGE_LABEL, type NudgeStage } from "@/lib/nudges/stages";

export interface NudgeStagesFormProps {
  scope: "branch" | "platform";
  /** Initial enabled state per stage (already resolved by the page). */
  initialEnabled: Record<NudgeStage, boolean>;
  /** Read-only: the interval_hours per stage, shown alongside each label. */
  intervalHours: Record<NudgeStage, number>;
  /** Action that persists `{ stage: enabled, ... }`. */
  saveAction: (
    enabled: Record<NudgeStage, boolean>,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function NudgeStagesForm({
  scope,
  initialEnabled,
  intervalHours,
  saveAction,
}: NudgeStagesFormProps) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await saveAction(enabled);
    setPending(false);
    if (result.ok) {
      toast.success(`${scope === "branch" ? "Branch" : "Platform"} nudges saved.`);
      router.refresh();
    } else {
      setError(result.error ?? "Couldn't save — try again in a minute.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ul className="flex flex-col gap-3">
        {NUDGE_STAGES.map((stage) => (
          <li
            key={stage}
            className="flex items-start gap-3 rounded-md border border-border bg-surface-page p-3"
          >
            <Checkbox
              id={`nudge-${stage}`}
              checked={enabled[stage]}
              onCheckedChange={(v) =>
                setEnabled((prev) => ({ ...prev, [stage]: v === true }))
              }
              className="mt-1"
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor={`nudge-${stage}`} className="cursor-pointer">
                {STAGE_LABEL[stage]}
              </Label>
              <span className="text-sm text-text-muted">
                Reminds every {intervalHours[stage]} hours after the stage starts, until
                the application moves on.
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save nudges"}
        </Button>
      </div>
    </form>
  );
}
