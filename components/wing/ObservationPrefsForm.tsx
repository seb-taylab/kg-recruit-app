/**
 * @tier organism
 * @consumes ui/Input, ui/Label, ui/Button, ui/Alert, sonner
 * @used-by app/(dashboard)/wing/settings/page.tsx
 *
 * Threshold editor. Six integer inputs, paired in pairs of two on
 * desktop. Cross-field rule (aging < cold) is enforced both client- and
 * server-side; client-side inline message lets the user see the issue
 * before hitting Save.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateWingObservationPrefsAction } from "@/app/(dashboard)/wing/settings/actions";

interface ObservationPrefsFormProps {
  defaults: {
    ack_attention_days: number;
    engagement_attention_days: number;
    form_sent_attention_days: number;
    lead_aging_days: number;
    lead_cold_days: number;
    branch_saturation_threshold: number;
  };
  hasRow: boolean;
}

export function ObservationPrefsForm({ defaults, hasRow }: ObservationPrefsFormProps) {
  const router = useRouter();
  const [values, setValues] = React.useState(defaults);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const crossFieldOk = values.lead_aging_days < values.lead_cold_days;

  function set<K extends keyof typeof defaults>(k: K, raw: string) {
    const n = Number.parseInt(raw, 10);
    setValues((cur) => ({ ...cur, [k]: Number.isFinite(n) ? n : 0 }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!crossFieldOk) {
      setError("Aging threshold must be less than cold threshold.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await updateWingObservationPrefsAction(values);
    setPending(false);
    if (result.ok) {
      toast.success("Thresholds saved.");
      router.refresh();
    } else {
      setError(result.error ?? "Couldn't save — try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {!hasRow && (
        <Alert variant="info">
          <AlertDescription>
            Showing the system defaults. Save to lock these for your wing — you can change
            them any time.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          Lead attention thresholds
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="ack"
            label="Routed → branch acknowledgment"
            hint="Days before the wing flags a routed lead the branch hasn't engaged."
            unit="days"
            min={1}
            max={60}
            value={values.ack_attention_days}
            onChange={(v) => set("ack_attention_days", v)}
          />
          <NumberField
            id="engage"
            label="Engaged → application invite"
            hint="Days after a branch marks engaged but hasn't sent the membership invite."
            unit="days"
            min={1}
            max={90}
            value={values.engagement_attention_days}
            onChange={(v) => set("engagement_attention_days", v)}
          />
          <NumberField
            id="form-sent"
            label="Invite sent → applicant fills"
            hint="Days the applicant has the magic link but hasn't started filling."
            unit="days"
            min={1}
            max={90}
            value={values.form_sent_attention_days}
            onChange={(v) => set("form_sent_attention_days", v)}
          />
          <NumberField
            id="aging"
            label="Aging cutoff"
            hint="Pre-conversion lead age before the wing strongly considers reroute."
            unit="days"
            min={3}
            max={180}
            value={values.lead_aging_days}
            onChange={(v) => set("lead_aging_days", v)}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          Lifecycle ceilings
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="cold"
            label="Cold path entry"
            hint="Total lifecycle age before the lead enters the cold path."
            unit="days"
            min={7}
            max={365}
            value={values.lead_cold_days}
            onChange={(v) => set("lead_cold_days", v)}
          />
          <NumberField
            id="saturation"
            label="Branch saturation"
            hint="Active leads aged > attention threshold before a branch is flagged saturated."
            unit="leads"
            min={1}
            max={100}
            value={values.branch_saturation_threshold}
            onChange={(v) => set("branch_saturation_threshold", v)}
          />
        </div>

        {!crossFieldOk && (
          <p className="text-sm text-state-error">
            Aging cutoff must be less than cold path entry — otherwise the lead would jump
            straight to cold without spending time as &ldquo;stalled&rdquo;.
          </p>
        )}
      </section>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setValues(defaults);
            setError(null);
          }}
        >
          Reset
        </Button>
        <Button type="submit" disabled={pending || !crossFieldOk}>
          {pending ? "Saving…" : hasRow ? "Save changes" : "Save thresholds"}
        </Button>
      </div>
    </form>
  );
}

function NumberField({
  id,
  label,
  hint,
  unit,
  min,
  max,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  unit: string;
  min: number;
  max: number;
  value: number;
  onChange: (raw: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`prefs-${id}`}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={`prefs-${id}`}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-24"
        />
        <span className="text-sm text-text-muted">{unit}</span>
      </div>
      <p className="text-xs text-text-muted">{hint}</p>
    </div>
  );
}
