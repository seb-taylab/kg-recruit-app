/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (FormWizard pattern, single-step variant)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (Sign application)
 * @consumes ui/Card, ui/Input, ui/Label, ui/Alert, applicant/SignaturePad
 * @used-by app/(dashboard)/branch/sign/[id]/page.tsx
 *
 * Form Ownership Map (Actor C — Chairman):
 *   - chairman_name_on_form (editable; pre-filled from profiles.full_name; Addendum Gap 5)
 *   - chairman_known_years
 *   - signature
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SignaturePad } from "@/components/applicant/SignaturePad";
import { submitChairmanSignatureAction } from "@/app/(dashboard)/branch/sign/[id]/actions";

interface ChairmanSignFormProps {
  applicationId: string;
  applicantDisplayName: string;
  defaultNameOnForm: string;
}

export function ChairmanSignForm({
  applicationId,
  applicantDisplayName,
  defaultNameOnForm,
}: ChairmanSignFormProps) {
  const router = useRouter();
  const [nameOnForm, setNameOnForm] = React.useState(defaultNameOnForm);
  const [yearsKnown, setYearsKnown] = React.useState<number | "">("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);

  async function handleSignatureSubmit(dataUrl: string) {
    setFieldErrors({});
    setServerError(null);
    const result = await submitChairmanSignatureAction(
      applicationId,
      {
        chairman_name_on_form: nameOnForm,
        chairman_known_years: yearsKnown === "" ? undefined : yearsKnown,
      },
      dataUrl,
    );
    if (!result.ok) {
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      setServerError(result.error ?? "Couldn't submit your signature.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    router.replace(`/branch/sign?just_signed=${encodeURIComponent(applicationId)}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your details on the form</CardTitle>
          <CardDescription>
            These appear on the signed PDF. Confirm before signing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field
            id="chairman_name_on_form"
            label="Name to print on form"
            helper="This appears on the signed PDF as your printed name. Edit if needed."
            error={fieldErrors.chairman_name_on_form}
          >
            <Input
              id="chairman_name_on_form"
              value={nameOnForm}
              onChange={(e) => setNameOnForm(e.target.value)}
              autoComplete="name"
              required
              hasError={Boolean(fieldErrors.chairman_name_on_form)}
            />
          </Field>
          <Field
            id="chairman_known_years"
            label={`Years you've known ${applicantDisplayName}`}
            error={fieldErrors.chairman_known_years}
          >
            <Input
              id="chairman_known_years"
              value={yearsKnown}
              onChange={(e) => {
                const v = e.target.value;
                setYearsKnown(v === "" ? "" : Number(v));
              }}
              type="number"
              min={0}
              max={99}
              inputMode="numeric"
              required
              hasError={Boolean(fieldErrors.chairman_known_years)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign application</CardTitle>
          <CardDescription>
            By signing, you confirm you&rsquo;ve reviewed {applicantDisplayName}&rsquo;s
            application and approve it for HQ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignaturePad
            confirmLabel={`I confirm I've reviewed the application and approve it for HQ.`}
            submitLabel="Sign application"
            onSubmit={handleSignatureSubmit}
          />
        </CardContent>
      </Card>
    </div>
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
