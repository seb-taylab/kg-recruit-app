import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateDDMMMYYYY } from "@/lib/format/date";
import { ChairmanSignForm } from "@/components/branch/ChairmanSignForm";

export const dynamic = "force-dynamic";

interface ApplicationRow {
  id: string;
  branch_id: string;
  status: string;
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
  assigned_referral_name: string | null;
  assigned_referral_membership_no: string | null;
  assigned_referral_known_years: number | null;
  referral_signed_at: string | null;
  chairman_name_on_form: string | null;
}

interface SignatureRow {
  role: "applicant" | "referral" | "chairman";
  signer_name: string;
  signature_png_url: string;
  signed_at: string | null;
}

export default async function ChairmanSignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireAuth();
  if (!auth.branch || auth.profile.role !== "branch_chairman") {
    redirect("/branch");
  }
  const { id } = await params;

  const admin = createAdminClient();
  const { data: appRow } = await admin
    .from("applications" as never)
    .select(
      "id, branch_id, status, surname, given_names, applicant_name_at_invite, nric_no, date_of_birth, place_of_birth, occupation, organisation, applicant_signed_at, applicant_photo_url, assigned_referral_name, assigned_referral_membership_no, assigned_referral_known_years, referral_signed_at, chairman_name_on_form",
    )
    .eq("id", id)
    .single();
  const app = appRow as ApplicationRow | null;
  if (!app || app.branch_id !== auth.branch.id) notFound();

  // Hard-gate: only PENDING_CHAIRMAN can be signed here. Earlier states
  // would short-circuit the state machine.
  if (app.status !== "PENDING_CHAIRMAN") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-wide text-brand-blue">
            {auth.branch.name}
          </p>
          <h1 className="text-3xl font-bold leading-tight text-text-primary">
            Not ready for your signature
          </h1>
        </header>
        <Alert variant="warning">
          <AlertDescription>
            This application is in state <strong>{app.status}</strong>. It can only be signed when
            it&rsquo;s in PENDING_CHAIRMAN.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Signed URL for the applicant photo (1-hour TTL, same as referral side).
  let applicantPhotoSignedUrl: string | null = null;
  if (app.applicant_photo_url) {
    const { data: signed } = await admin.storage
      .from("applicant-photos")
      .createSignedUrl(app.applicant_photo_url, 60 * 60);
    applicantPhotoSignedUrl = signed?.signedUrl ?? null;
  }

  // Load both prior signatures + sign each with a 1-hour TTL.
  const { data: sigRows } = await admin
    .from("signatures" as never)
    .select("role, signer_name, signature_png_url, signed_at")
    .eq("application_id", id)
    .in("role", ["applicant", "referral"]);
  const signatures = (sigRows as SignatureRow[] | null) ?? [];
  const signedSignatures = await Promise.all(
    signatures.map(async (s) => {
      const { data } = await admin.storage
        .from("signatures")
        .createSignedUrl(s.signature_png_url, 60 * 60);
      return { ...s, signed_url: data?.signedUrl ?? null };
    }),
  );

  const applicantDisplay =
    (app.given_names && app.surname
      ? `${app.given_names} ${app.surname}`
      : app.applicant_name_at_invite) ?? "the applicant";
  const referralName = app.assigned_referral_name ?? "—";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-blue">
          {auth.branch.name}
        </p>
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          Sign for {applicantDisplay}
        </h1>
        <p className="text-text-secondary">
          Applicant signed {formatDateDDMMMYYYY(app.applicant_signed_at)} · Referral signed{" "}
          {formatDateDDMMMYYYY(app.referral_signed_at)}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Applicant summary</CardTitle>
          <CardDescription>Review before signing.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <SummaryRow label="Name" value={applicantDisplay} />
          <SummaryRow label="NRIC" value={app.nric_no} />
          <SummaryRow
            label="Date of birth"
            value={formatDateDDMMMYYYY(app.date_of_birth)}
          />
          <SummaryRow label="Place of birth" value={app.place_of_birth} />
          <SummaryRow label="Occupation" value={app.occupation} />
          <SummaryRow label="Organisation" value={app.organisation} />
          <SummaryRow label="Referral" value={referralName} />
          <SummaryRow
            label="Referral membership"
            value={app.assigned_referral_membership_no}
          />
          <SummaryRow
            label="Referral has known the applicant for"
            value={
              app.assigned_referral_known_years != null
                ? `${app.assigned_referral_known_years} year${app.assigned_referral_known_years === 1 ? "" : "s"}`
                : null
            }
          />
          {applicantPhotoSignedUrl && (
            <div className="flex flex-col gap-2">
              <span className="text-text-muted">Photo</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- presigned URL, not optimisable */}
              <img
                src={applicantPhotoSignedUrl}
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
          <CardTitle>Prior signatures</CardTitle>
          <CardDescription>Captured on the applicant&rsquo;s magic-link form.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {signedSignatures.map((s) => (
            <div key={s.role} className="flex flex-col gap-2">
              <span className="text-sm text-text-muted">
                {s.role === "applicant" ? "Applicant" : "Referral"}: {s.signer_name}{" "}
                {s.signed_at ? `· ${formatDateDDMMMYYYY(s.signed_at)}` : ""}
              </span>
              {s.signed_url && (
                /* eslint-disable-next-line @next/next/no-img-element -- presigned URL */
                <img
                  src={s.signed_url}
                  alt={`${s.role} signature`}
                  width={320}
                  height={80}
                  className="h-auto w-full max-w-md rounded-md border border-border bg-surface-card"
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <ChairmanSignForm
        applicationId={app.id}
        applicantDisplayName={applicantDisplay}
        defaultNameOnForm={app.chairman_name_on_form ?? auth.profile.full_name ?? ""}
      />
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
