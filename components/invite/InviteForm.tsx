/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (FormWizard pattern — single-step variant)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (Send invite) + §3.3 (form labels)
 * @consumes ui/Button, ui/Input, ui/Label, ui/Alert
 * @used-by app/(dashboard)/branch/initiate/page.tsx
 */
"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  createInviteAction,
  type CreateInviteState,
} from "@/app/(dashboard)/branch/initiate/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Sending…" : "Send invite"}
    </Button>
  );
}

export function InviteForm() {
  const [state, action] = useFormState<CreateInviteState | undefined, FormData>(
    createInviteAction,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="applicantName">Applicant name</Label>
        <Input
          id="applicantName"
          name="applicantName"
          autoComplete="name"
          required
          hasError={Boolean(state?.fieldErrors?.applicantName)}
          aria-describedby={state?.fieldErrors?.applicantName ? "applicantName-error" : undefined}
        />
        {state?.fieldErrors?.applicantName && (
          <p id="applicantName-error" className="text-sm text-state-error" aria-live="polite">
            {state.fieldErrors.applicantName}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="applicantPhone">Mobile phone</Label>
        <Input
          id="applicantPhone"
          name="applicantPhone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="9123 4567"
          required
          hasError={Boolean(state?.fieldErrors?.applicantPhone)}
          aria-describedby="applicantPhone-help"
        />
        <p id="applicantPhone-help" className="text-sm text-text-muted">
          We&rsquo;ll use this to send your link
        </p>
        {state?.fieldErrors?.applicantPhone && (
          <p className="text-sm text-state-error" aria-live="polite">
            {state.fieldErrors.applicantPhone}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="applicantEmail">Email address (optional)</Label>
        <Input
          id="applicantEmail"
          name="applicantEmail"
          type="email"
          autoComplete="email"
          inputMode="email"
          hasError={Boolean(state?.fieldErrors?.applicantEmail)}
          aria-describedby="applicantEmail-help"
        />
        <p id="applicantEmail-help" className="text-sm text-text-muted">
          If provided, we can also send the link by email
        </p>
        {state?.fieldErrors?.applicantEmail && (
          <p className="text-sm text-state-error" aria-live="polite">
            {state.fieldErrors.applicantEmail}
          </p>
        )}
      </div>
      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
