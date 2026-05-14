/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §7.6 (auth pages)
 * @brand-spec KG_BrandExecution_PAP.md §3.6 (success toast: "Reset link sent")
 * @consumes ui/Button, ui/Input, ui/Label, ui/Alert
 * @used-by app/(public)/auth/forgot-password/page.tsx
 */
"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requestReset, type ForgotState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Sending…" : "Send reset link"}
    </Button>
  );
}

export function ForgotForm() {
  const [state, action] = useFormState<ForgotState | undefined, FormData>(requestReset, undefined);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.ok && (
        <Alert variant="info">
          <AlertDescription>
            Reset link sent. Check your inbox — it expires in 1 hour.
          </AlertDescription>
        </Alert>
      )}
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          hasError={Boolean(state?.fieldError)}
          aria-describedby={state?.fieldError ? "email-error" : undefined}
        />
        {state?.fieldError && (
          <p id="email-error" className="text-sm text-state-error" aria-live="polite">
            {state.fieldError}
          </p>
        )}
      </div>
      <SubmitButton />
    </form>
  );
}
