/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §7.6 (auth pages — set new password)
 * @brand-spec KG_BrandExecution_PAP.md §3.6 (toast pattern)
 * @consumes ui/Button, ui/Input, ui/Label, ui/Alert
 * @used-by app/(public)/auth/reset-password/page.tsx
 */
"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { setNewPassword, type ResetState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : "Set new password"}
    </Button>
  );
}

export function ResetForm() {
  const [state, action] = useFormState<ResetState | undefined, FormData>(setNewPassword, undefined);
  const [show, setShow] = React.useState(false);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="password">New password</Label>
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline"
            aria-pressed={show}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <Input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          hasError={Boolean(state?.fieldErrors?.password)}
        />
        {state?.fieldErrors?.password && (
          <p className="text-sm text-state-error" aria-live="polite">
            {state.fieldErrors.password}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          hasError={Boolean(state?.fieldErrors?.confirm)}
        />
        {state?.fieldErrors?.confirm && (
          <p className="text-sm text-state-error" aria-live="polite">
            {state.fieldErrors.confirm}
          </p>
        )}
      </div>
      <SubmitButton />
    </form>
  );
}
