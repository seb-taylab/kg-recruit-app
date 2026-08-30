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
 *
 * Visual treatment: each card carries a brand-red left accent and an
 * explicit "Step N — …" title so the action items stand out against the
 * read-only review cards above. The whole block is wrapped in an anchor
 * target (#chairman-actions) so the "Jump to actions" CTA at the top of
 * the page scrolls straight here.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import dynamic from "next/dynamic";
import { submitChairmanSignatureAction } from "@/app/(dashboard)/branch/sign/[id]/actions";
import { submitChairmanSignatureViaTokenAction } from "@/app/branch-sign/[token]/actions";

// SignaturePad → react-signature-canvas (~30KB). Chairman sees the
// application detail before reaching the signing step; keeping this off
// the initial bundle shaves bytes from the review screen too.
const SignaturePad = dynamic(
  () =>
    import("@/components/applicant/SignaturePad").then((m) => ({
      default: m.SignaturePad,
    })),
  { ssr: false },
);

interface ChairmanSignFormProps {
  applicationId: string;
  applicantDisplayName: string;
  defaultNameOnForm: string;
  /**
   * When present, the chairman arrived via a passwordless magic-link
   * (/branch-sign/[token]) — submit through the token action and land on
   * the token "done" page instead of the authenticated dashboard.
   */
  token?: string;
}

export function ChairmanSignForm({
  applicationId,
  applicantDisplayName,
  defaultNameOnForm,
  token,
}: ChairmanSignFormProps) {
  const router = useRouter();
  const [nameOnForm, setNameOnForm] = React.useState(defaultNameOnForm);
  const [yearsKnown, setYearsKnown] = React.useState<number | "">("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);

  async function handleSignatureSubmit(dataUrl: string) {
    setFieldErrors({});
    setServerError(null);
    const values = {
      chairman_name_on_form: nameOnForm,
      chairman_known_years: yearsKnown === "" ? undefined : yearsKnown,
    };
    const result = token
      ? await submitChairmanSignatureViaTokenAction(token, values, dataUrl)
      : await submitChairmanSignatureAction(applicationId, values, dataUrl);
    if (!result.ok) {
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      setServerError(result.error ?? "Couldn't submit your signature.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    router.replace(
      token
        ? `/branch-sign/${token}/done`
        : `/branch/sign?just_signed=${encodeURIComponent(applicationId)}`,
    );
  }

  return (
    // scroll-mt-4 nudges the anchor jump down a little so the first
    // card title isn't pinned to the very top edge.
    <div id="chairman-actions" className="flex scroll-mt-4 flex-col gap-4">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      {/* STEP 1 — Confirm the two fields that print on the PDF.
          Years known comes FIRST: it's the only field the Chairman
          must type from scratch. Name pre-fills from the profile and
          almost always stays as-is. */}
      <Card className="border-l-4 border-l-brand-red">
        <CardHeader>
          <CardTitle>
            <span className="text-brand-red">Step 1</span> &middot; Confirm your details
          </CardTitle>
          <CardDescription>
            These two fields print on the signed PDF.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field
            id="chairman_known_years"
            label={`How long have you known ${applicantDisplayName}?`}
            helper="In years. Whole numbers only."
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
              autoFocus
              hasError={Boolean(fieldErrors.chairman_known_years)}
            />
          </Field>
          <Field
            id="chairman_name_on_form"
            label="Name to print on form"
            helper="Pre-filled from your profile. Edit only if the PDF should show a different name."
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
        </CardContent>
      </Card>

      {/* STEP 2 — Capture the signature. */}
      <Card className="border-l-4 border-l-brand-red">
        <CardHeader>
          <CardTitle>
            <span className="text-brand-red">Step 2</span> &middot; Sign application
          </CardTitle>
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
