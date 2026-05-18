/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (FormWizard pattern, single-step variant)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (Sign and continue), §3.3 (form labels)
 * @consumes ui/Card, ui/Button, ui/Input, ui/Label, ui/Alert, applicant/SignaturePad, applicant/MobileFormShell
 * @used-by app/referral/[token]/page.tsx
 *
 * Form Ownership Map (Actor B): the referral confirms 3 fields (name,
 * membership no, years known — pre-filled from the Branch Admin assignment)
 * then signs. They see a *read-only* preview of the applicant's data and
 * photo, but NOT the NRIC scans (PRD §4.3).
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import dynamic from "next/dynamic";
import { MobileFormShell } from "@/components/applicant/MobileFormShell";
import { formatDateDDMMMYYYY } from "@/lib/format/date";
import { submitReferralSignatureAction } from "@/app/referral/[token]/actions";

// SignaturePad → react-signature-canvas (~30KB) only renders on the final
// sign step. Lazy + client-only — canvas APIs aren't SSR-safe.
const SignaturePad = dynamic(
  () =>
    import("@/components/applicant/SignaturePad").then((m) => ({
      default: m.SignaturePad,
    })),
  { ssr: false },
);

export interface ReferralWizardApplication {
  surname: string | null;
  given_names: string | null;
  applicant_name_at_invite: string | null;
  nric_no: string | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  occupation: string | null;
  organisation: string | null;
  applicant_signed_at: string | null;
  applicant_photo_url: string | null;
  applicant_photo_signed_url: string | null;
}

export interface ReferralWizardDefaults {
  assigned_referral_name: string | null;
  assigned_referral_membership_no: string | null;
  assigned_referral_known_years: number | null;
}

interface ReferralSignWizardProps {
  rawToken: string;
  branchName: string;
  application: ReferralWizardApplication;
  defaults: ReferralWizardDefaults;
}

export function ReferralSignWizard({
  rawToken,
  branchName,
  application,
  defaults,
}: ReferralSignWizardProps) {
  const router = useRouter();
  const [name, setName] = React.useState(defaults.assigned_referral_name ?? "");
  const [membershipNo, setMembershipNo] = React.useState(
    defaults.assigned_referral_membership_no ?? "",
  );
  const [yearsKnown, setYearsKnown] = React.useState<number | "">(
    defaults.assigned_referral_known_years ?? "",
  );
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);

  const applicantDisplay =
    (application.given_names && application.surname
      ? `${application.given_names} ${application.surname}`
      : application.applicant_name_at_invite) ?? "the applicant";

  async function handleSignatureSubmit(dataUrl: string) {
    setFieldErrors({});
    setServerError(null);
    const result = await submitReferralSignatureAction(
      rawToken,
      {
        assigned_referral_name: name,
        assigned_referral_membership_no: membershipNo,
        assigned_referral_known_years: yearsKnown === "" ? undefined : yearsKnown,
      },
      dataUrl,
    );
    if (!result.ok) {
      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
      setServerError(result.error ?? "Couldn't submit your signature.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    router.replace(`/referral/${rawToken}/done`);
  }

  return (
    <MobileFormShell branchName={branchName}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Vouch for {applicantDisplay}</CardTitle>
            <CardDescription>
              You&rsquo;ve been asked to sign as the referral for this PAP Kampong Glam Branch
              application. Confirm the details below, then draw your signature.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field
              id="referral-name"
              label="Your name (as on your membership record)"
              error={fieldErrors.assigned_referral_name}
            >
              <Input
                id="referral-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                hasError={Boolean(fieldErrors.assigned_referral_name)}
              />
            </Field>
            <Field
              id="referral-membership"
              label="Your PAP membership number"
              error={fieldErrors.assigned_referral_membership_no}
            >
              <Input
                id="referral-membership"
                value={membershipNo}
                onChange={(e) => setMembershipNo(e.target.value)}
                autoComplete="off"
                required
                hasError={Boolean(fieldErrors.assigned_referral_membership_no)}
              />
            </Field>
            <Field
              id="referral-years"
              label={`Years you've known ${applicantDisplay}`}
              error={fieldErrors.assigned_referral_known_years}
            >
              <Input
                id="referral-years"
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
                hasError={Boolean(fieldErrors.assigned_referral_known_years)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Applicant summary</CardTitle>
            <CardDescription>Read-only — provided so you can confirm before signing.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <SummaryRow label="Name" value={applicantDisplay} />
            <SummaryRow label="NRIC" value={maskNric(application.nric_no)} />
            <SummaryRow
              label="Date of birth"
              value={formatDateDDMMMYYYY(application.date_of_birth)}
            />
            <SummaryRow label="Place of birth" value={application.place_of_birth} />
            <SummaryRow label="Occupation" value={application.occupation} />
            <SummaryRow label="Organisation" value={application.organisation} />
            <SummaryRow
              label="Applicant signed"
              value={formatDateDDMMMYYYY(application.applicant_signed_at)}
            />
            {application.applicant_photo_signed_url && (
              <div className="flex flex-col gap-2">
                <span className="text-text-muted">Photo</span>
                {/* eslint-disable-next-line @next/next/no-img-element -- presigned URL, not optimisable */}
                <img
                  src={application.applicant_photo_signed_url}
                  alt="Applicant photo"
                  width={168}
                  height={216}
                  className="h-auto w-24 rounded-md border border-border"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sign and continue</CardTitle>
            <CardDescription>
              By signing, you vouch for the applicant&rsquo;s suitability for PAP membership.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignaturePad
              confirmLabel={`I confirm I know ${applicantDisplay} and vouch for them.`}
              submitLabel="Sign and continue"
              onSubmit={handleSignatureSubmit}
            />
          </CardContent>
        </Card>
      </div>
    </MobileFormShell>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p className="text-sm text-state-error" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium text-text-primary">{value || "—"}</span>
    </div>
  );
}

function maskNric(nric: string | null | undefined): string {
  if (!nric || nric.length < 5) return "—";
  return `${nric[0]}****${nric.slice(-3)}`;
}
