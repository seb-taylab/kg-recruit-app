/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §7.6 (login page spec)
 * @brand-spec KG_BrandExecution_PAP.md §3.2 (page title), §3.1 (Sign in button)
 * @consumes ui/Button, ui/Input, ui/Label, ui/Alert
 * @used-by app/(public)/login/page.tsx
 */
"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signIn, type SignInState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm({ next, reason }: { next?: string; reason?: string }) {
  const [state, action] = useFormState<SignInState | undefined, FormData>(signIn, undefined);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {reason === "deactivated" && (
        <Alert variant="destructive">
          <AlertDescription>
            Your session ended because this account has been deactivated.
          </AlertDescription>
        </Alert>
      )}
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          hasError={Boolean(state?.fieldErrors?.email)}
          aria-describedby={state?.fieldErrors?.email ? "email-error" : undefined}
        />
        {state?.fieldErrors?.email && (
          <p id="email-error" className="text-sm text-state-error" aria-live="polite">
            {state.fieldErrors.email}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/auth/forgot-password"
            className="text-sm font-medium text-brand-blue hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          hasError={Boolean(state?.fieldErrors?.password)}
          aria-describedby={state?.fieldErrors?.password ? "password-error" : undefined}
        />
        {state?.fieldErrors?.password && (
          <p id="password-error" className="text-sm text-state-error" aria-live="polite">
            {state.fieldErrors.password}
          </p>
        )}
      </div>
      <SubmitButton />
    </form>
  );
}
