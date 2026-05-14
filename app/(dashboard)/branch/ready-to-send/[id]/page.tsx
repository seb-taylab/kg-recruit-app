import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAuth } from "@/lib/auth/get-user";
import { isBranchAdminTeam } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateDDMMMYYYY } from "@/lib/format/date";
import { RecipientPicker } from "@/components/branch/RecipientPicker";
import { PreviewPdfButton } from "@/components/branch/PdfButtons";

export const dynamic = "force-dynamic";

interface AppRow {
  id: string;
  branch_id: string;
  status: string;
  applicant_name_at_invite: string | null;
  surname: string | null;
  given_names: string | null;
  nric_no: string | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  occupation: string | null;
  organisation: string | null;
  ready_to_send_at: string | null;
  chairman_name_on_form: string | null;
  chairman_signed_at: string | null;
  assigned_referral_name: string | null;
  referral_signed_at: string | null;
  applicant_signed_at: string | null;
  applicant_photo_url: string | null;
}

export default async function ReadyToSendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireAuth();
  if (!auth.branch || !isBranchAdminTeam(auth.profile.role)) {
    redirect("/branch");
  }
  const { id } = await params;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("applications" as never)
    .select(
      "id, branch_id, status, applicant_name_at_invite, surname, given_names, nric_no, date_of_birth, place_of_birth, occupation, organisation, ready_to_send_at, chairman_name_on_form, chairman_signed_at, assigned_referral_name, referral_signed_at, applicant_signed_at, applicant_photo_url",
    )
    .eq("id", id)
    .single();
  const app = row as AppRow | null;
  if (!app || app.branch_id !== auth.branch.id) notFound();

  if (app.status !== "READY_TO_SEND") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold leading-tight text-text-primary">
            Not ready to send
          </h1>
        </header>
        <Alert variant="warning">
          <AlertDescription>
            This application is in state <strong>{app.status}</strong>. Only applications signed by
            the Chairman can be sent to HQ.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Signed URL for the applicant photo preview.
  let photoSignedUrl: string | null = null;
  if (app.applicant_photo_url) {
    const { data: signed } = await admin.storage
      .from("applicant-photos")
      .createSignedUrl(app.applicant_photo_url, 60 * 60);
    photoSignedUrl = signed?.signedUrl ?? null;
  }

  const applicantDisplay =
    (app.given_names && app.surname
      ? `${app.given_names} ${app.surname}`
      : app.applicant_name_at_invite) ?? "(no name on record)";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          {applicantDisplay}
        </h1>
        <p className="text-text-secondary">
          Chairman signed {formatDateDDMMMYYYY(app.chairman_signed_at)}
          {app.chairman_name_on_form ? ` · ${app.chairman_name_on_form}` : ""}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Final review</CardTitle>
          <CardDescription>
            One last look before HQ gets the PDF. The PDF will not include HQ-only fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <SummaryRow label="NRIC" value={app.nric_no} />
          <SummaryRow label="Date of birth" value={formatDateDDMMMYYYY(app.date_of_birth)} />
          <SummaryRow label="Place of birth" value={app.place_of_birth} />
          <SummaryRow label="Occupation" value={app.occupation} />
          <SummaryRow label="Organisation" value={app.organisation} />
          <SummaryRow
            label="Applicant signed"
            value={formatDateDDMMMYYYY(app.applicant_signed_at)}
          />
          <SummaryRow
            label="Referral"
            value={`${app.assigned_referral_name ?? "—"} (${formatDateDDMMMYYYY(app.referral_signed_at)})`}
          />
          {photoSignedUrl && (
            <div className="flex flex-col gap-2">
              <span className="text-text-muted">Photo</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- presigned URL, not optimisable */}
              <img
                src={photoSignedUrl}
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
          <CardTitle>Preview PDF</CardTitle>
          <CardDescription>
            Render the form as HQ will see it. Downloading here doesn&rsquo;t send anything.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PreviewPdfButton applicationId={app.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
          <CardDescription>
            Pick where the signed PDF goes. Each recipient gets a presigned URL.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecipientPicker
            applicationId={app.id}
            hqEmail={auth.branch.hq_email}
            selfEmail={auth.email}
          />
        </CardContent>
      </Card>
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
