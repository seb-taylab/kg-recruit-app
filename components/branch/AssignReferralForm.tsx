/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (SettingsForm pattern variant)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (Send invite), §3.3 (form labels)
 * @consumes ui/Button, ui/Input, ui/Label, ui/RadioGroup, ui/Alert
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx (when status = PENDING_REFERRAL_ASSIGNMENT)
 *
 * Custom composition justification: form for the Branch Admin to assign a
 * referral (PRD §4.1.5). Pre-fills nothing — admin types fresh. Picks
 * routing fork between PATH A (direct to Chairman) and PATH B (via admin
 * review). On submit, the server action mints a magic link and redirects
 * back to this page with the raw token so the DeliveryPanel renders.
 */
"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  assignReferralAction,
  type AssignReferralState,
} from "@/app/(dashboard)/branch/applications/[id]/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Send invite"}
    </Button>
  );
}

interface AssignReferralFormProps {
  applicationId: string;
  defaultRoutingMode: "direct_to_chairman" | "via_branch_admin_review";
}

export function AssignReferralForm({ applicationId, defaultRoutingMode }: AssignReferralFormProps) {
  const boundAction = assignReferralAction.bind(null, applicationId);
  const [state, action] = useFormState<AssignReferralState | undefined, FormData>(
    boundAction,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <Field
        id="assigned_referral_name"
        label="Referral name"
        error={state?.fieldErrors?.assigned_referral_name}
      >
        <Input
          id="assigned_referral_name"
          name="assigned_referral_name"
          autoComplete="off"
          required
          hasError={Boolean(state?.fieldErrors?.assigned_referral_name)}
        />
      </Field>

      <Field
        id="assigned_referral_phone"
        label="Referral mobile phone"
        helper="We'll use this to share the link via WhatsApp"
        error={state?.fieldErrors?.assigned_referral_phone}
      >
        <Input
          id="assigned_referral_phone"
          name="assigned_referral_phone"
          type="tel"
          autoComplete="off"
          inputMode="tel"
          placeholder="9123 4567"
          required
          hasError={Boolean(state?.fieldErrors?.assigned_referral_phone)}
        />
      </Field>

      <Field
        id="assigned_referral_email"
        label="Referral email (optional)"
        error={state?.fieldErrors?.assigned_referral_email}
      >
        <Input
          id="assigned_referral_email"
          name="assigned_referral_email"
          type="email"
          autoComplete="off"
          inputMode="email"
          hasError={Boolean(state?.fieldErrors?.assigned_referral_email)}
        />
      </Field>

      <Field
        id="assigned_referral_membership_no"
        label="Referral membership number"
        error={state?.fieldErrors?.assigned_referral_membership_no}
      >
        <Input
          id="assigned_referral_membership_no"
          name="assigned_referral_membership_no"
          autoComplete="off"
          required
          hasError={Boolean(state?.fieldErrors?.assigned_referral_membership_no)}
        />
      </Field>

      <Field
        id="assigned_referral_known_years"
        label="Years known"
        helper="How long the referral has known the applicant"
        error={state?.fieldErrors?.assigned_referral_known_years}
      >
        <Input
          id="assigned_referral_known_years"
          name="assigned_referral_known_years"
          type="number"
          min={0}
          max={99}
          inputMode="numeric"
          required
          hasError={Boolean(state?.fieldErrors?.assigned_referral_known_years)}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <Label>Routing</Label>
        <RadioGroup
          name="routing_choice"
          defaultValue={defaultRoutingMode}
          className="flex flex-col gap-3"
        >
          <label className="flex items-start gap-3 rounded-md border border-border bg-surface-page p-3">
            <RadioGroupItem value="direct_to_chairman" id="routing-direct" className="mt-1" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text-primary">Direct to Chairman</span>
              <span className="text-sm text-text-muted">
                After the referral signs, the Branch Chairman gets the application straight away.
              </span>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-md border border-border bg-surface-page p-3">
            <RadioGroupItem
              value="via_branch_admin_review"
              id="routing-review"
              className="mt-1"
            />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text-primary">
                Via branch admin review
              </span>
              <span className="text-sm text-text-muted">
                After the referral signs, a Branch Admin team member reviews before sending to the
                Chairman.
              </span>
            </div>
          </label>
        </RadioGroup>
        {state?.fieldErrors?.routing_choice && (
          <p className="text-sm text-state-error" aria-live="polite">
            {state.fieldErrors.routing_choice}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  helper,
  error,
  children,
}: {
  id: string;
  label: string;
  helper?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {helper && !error && <p className="text-sm text-text-muted">{helper}</p>}
      {error && (
        <p className="text-sm text-state-error" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}
