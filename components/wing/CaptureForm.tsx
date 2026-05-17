/**
 * @tier organism
 * @consumes ui/Input, ui/Label, ui/Button, ui/Checkbox, ui/Alert, sonner
 * @used-by app/capture/[slug]/page.tsx
 *
 * Booth capture form. Tuned for tablet UX:
 *   - Large input fields (h-12 / text-base)
 *   - Inline field errors
 *   - Consent gate (submit disabled until checked)
 *   - On success → resets to a fresh form so the admin can capture the
 *     next attendee without navigating
 *   - Optimistic transitions guarded by useTransition
 */
"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  captureLeadAction,
  type CaptureResult,
} from "@/app/capture/[slug]/actions";
import { CaptureConfirmation } from "@/components/wing/CaptureConfirmation";
import type { MatchedWhatsAppLink } from "@/lib/wing/whatsapp-links";

interface CaptureFormProps {
  eventSlug: string;
  eventName: string;
  branchName: string;
  consentText: string;
}

const INITIAL = {
  full_name: "",
  mobile_number: "",
  postal_code: "",
  nric_last_4: "",
  email: "",
  consent_pdpa: false,
};

interface ConfirmationState {
  applicantFirstName: string;
  links: MatchedWhatsAppLink[];
}

export function CaptureForm({ eventSlug, eventName, branchName, consentText }: CaptureFormProps) {
  const [values, setValues] = React.useState(INITIAL);
  const [errors, setErrors] = React.useState<CaptureResult["fieldErrors"]>({});
  const [topError, setTopError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  // On success, the form is replaced by the inline confirmation panel.
  // null while the form is in capture mode.
  const [confirmation, setConfirmation] = React.useState<ConfirmationState | null>(null);

  function set<K extends keyof typeof INITIAL>(k: K, v: (typeof INITIAL)[K]) {
    setValues((cur) => ({ ...cur, [k]: v }));
    // Clear that field's error on change — encourages re-validation on next
    // submit instead of stale red text.
    if (errors && errors[k as keyof typeof errors]) {
      setErrors({ ...errors, [k]: undefined });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setTopError(null);
    setErrors({});

    const result = await captureLeadAction({
      eventSlug,
      full_name: values.full_name,
      mobile_number: values.mobile_number,
      postal_code: values.postal_code,
      nric_last_4: values.nric_last_4,
      email: values.email,
      consent_pdpa: values.consent_pdpa,
    });

    setPending(false);

    if (result.ok) {
      toast.success(`Captured ${values.full_name}.`);
      // Swap to the confirmation panel. The form values stay in state so
      // they're not lost if the admin wants to retry — but they'll be
      // cleared when "Capture next" is pressed.
      setConfirmation({
        applicantFirstName: result.applicantFirstName ?? values.full_name,
        links: result.whatsappLinks ?? [],
      });
      setErrors({});
    } else if (result.fieldErrors) {
      setErrors(result.fieldErrors);
    } else {
      setTopError(result.error ?? "Couldn't save — try again.");
    }
  }

  function handleCaptureNext() {
    setConfirmation(null);
    setValues(INITIAL);
    setErrors({});
    setTopError(null);
    // Focus the first field for fast next-capture flow.
    requestAnimationFrame(() => {
      document.getElementById("cap-name")?.focus();
    });
  }

  // Confirmation mode — replaces the form on submit success. Single URL,
  // single component swap; no modal stack, no extra route.
  if (confirmation) {
    return (
      <CaptureConfirmation
        applicantFirstName={confirmation.applicantFirstName}
        links={confirmation.links}
        onCaptureNext={handleCaptureNext}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1 text-center">
        <p className="text-sm font-medium text-text-muted">{branchName}</p>
        <h1 className="text-2xl font-bold leading-tight text-text-primary">
          {eventName}
        </h1>
        <p className="text-sm text-text-muted">Express your interest in joining the Party.</p>
      </div>

      {topError && (
        <Alert variant="destructive">
          <AlertDescription>{topError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="cap-name">Full name</Label>
        <Input
          id="cap-name"
          className="h-12 text-base"
          value={values.full_name}
          onChange={(e) => set("full_name", e.target.value)}
          autoComplete="name"
          autoFocus
          required
        />
        {errors?.full_name && (
          <p className="text-sm text-state-error">{errors.full_name}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="cap-mobile">Mobile number</Label>
        <Input
          id="cap-mobile"
          className="h-12 text-base"
          type="tel"
          inputMode="tel"
          value={values.mobile_number}
          onChange={(e) => set("mobile_number", e.target.value)}
          autoComplete="tel"
          required
          placeholder="e.g. 81234567"
        />
        {errors?.mobile_number && (
          <p className="text-sm text-state-error">{errors.mobile_number}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cap-postal">Residential postal code</Label>
          <Input
            id="cap-postal"
            className="h-12 text-base"
            type="text"
            inputMode="numeric"
            value={values.postal_code}
            onChange={(e) => set("postal_code", e.target.value)}
            maxLength={6}
            placeholder="123456"
            required
          />
          <p className="text-xs text-text-muted">
            Where you live — not your work address.
          </p>
          {errors?.postal_code && (
            <p className="text-sm text-state-error">{errors.postal_code}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cap-nric">Last 4 of NRIC</Label>
          <Input
            id="cap-nric"
            className="h-12 text-base uppercase"
            type="text"
            value={values.nric_last_4}
            onChange={(e) => set("nric_last_4", e.target.value.toUpperCase())}
            maxLength={4}
            placeholder="123A"
            required
          />
          {errors?.nric_last_4 && (
            <p className="text-sm text-state-error">{errors.nric_last_4}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="cap-email">Email</Label>
        <Input
          id="cap-email"
          className="h-12 text-base"
          type="email"
          inputMode="email"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          autoComplete="email"
          required
        />
        {errors?.email && (
          <p className="text-sm text-state-error">{errors.email}</p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-page p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox
            id="cap-consent"
            checked={values.consent_pdpa}
            onCheckedChange={(c) => set("consent_pdpa", c === true)}
            className="mt-1"
          />
          <span className="text-sm text-text-secondary">{consentText}</span>
        </label>
        {errors?.consent && (
          <p className="text-sm text-state-error">{errors.consent}</p>
        )}
      </div>

      <Button
        type="submit"
        className="h-14 text-base"
        disabled={pending || !values.consent_pdpa}
      >
        {pending ? "Submitting…" : "Submit"}
      </Button>
    </form>
  );
}
