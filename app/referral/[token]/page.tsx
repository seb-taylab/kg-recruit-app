import { redirect } from "next/navigation";
import { recordLinkOpened, verifyMagicLink } from "@/lib/auth/magic-link-verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { applicantPhotoUrl, isCloudinaryPublicId } from "@/lib/cloudinary/client";
import {
  ReferralSignWizard,
  type ReferralWizardApplication,
  type ReferralWizardDefaults,
} from "@/components/referral/ReferralSignWizard";

export const dynamic = "force-dynamic";

export default async function ReferralTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;
  const verify = await verifyMagicLink(rawToken, "referral");
  if (!verify.ok) {
    if (verify.reason === "expired") redirect("/apply/expired");
    redirect("/apply/invalid");
  }

  const admin = createAdminClient();

  if (!verify.magicLink.link_opened_at) {
    await recordLinkOpened(
      verify.magicLink.id,
      verify.application.id,
      verify.magicLink.branch_id,
    );
  }

  const { data: branchRow } = await admin
    .from("branches" as never)
    .select("name")
    .eq("id", verify.magicLink.branch_id)
    .single();
  const branchName = (branchRow as { name: string } | null)?.name ?? "Kampong Glam";

  const { data: appRow } = await admin
    .from("applications" as never)
    .select(
      "id, surname, given_names, applicant_name_at_invite, nric_no, date_of_birth, place_of_birth, occupation, organisation, applicant_signed_at, applicant_photo_url, assigned_referral_name, assigned_referral_membership_no, assigned_referral_known_years",
    )
    .eq("id", verify.application.id)
    .single();
  const row = appRow as
    | (Omit<ReferralWizardApplication, "applicant_photo_signed_url"> & {
        id: string;
        assigned_referral_name: string | null;
        assigned_referral_membership_no: string | null;
        assigned_referral_known_years: number | null;
      })
    | null;
  if (!row) redirect("/apply/invalid");

  // Generate a short-lived signed URL for the applicant photo so the
  // referral can see it during their review. 1-hour TTL is enough for the
  // sign session.
  //
  // applicant_photo_url is either a Cloudinary public_id (new path, starts
  // with `kg-recruit/applications/…`) or a legacy Supabase Storage path.
  // Without the Cloudinary branch the photo silently fails to load and the
  // referral is asked to vouch for a face they can't see. Mirror
  // lib/pdf/render-application.ts.
  let applicantPhotoSignedUrl: string | null = null;
  if (row.applicant_photo_url) {
    if (isCloudinaryPublicId(row.applicant_photo_url)) {
      applicantPhotoSignedUrl = applicantPhotoUrl(row.applicant_photo_url);
    } else {
      const { data: signed } = await admin.storage
        .from("applicant-photos")
        .createSignedUrl(row.applicant_photo_url, 60 * 60);
      applicantPhotoSignedUrl = signed?.signedUrl ?? null;
    }
  }

  const application: ReferralWizardApplication = {
    surname: row.surname,
    given_names: row.given_names,
    applicant_name_at_invite: row.applicant_name_at_invite,
    nric_no: row.nric_no,
    date_of_birth: row.date_of_birth,
    place_of_birth: row.place_of_birth,
    occupation: row.occupation,
    organisation: row.organisation,
    applicant_signed_at: row.applicant_signed_at,
    applicant_photo_url: row.applicant_photo_url,
    applicant_photo_signed_url: applicantPhotoSignedUrl,
  };

  const defaults: ReferralWizardDefaults = {
    assigned_referral_name: row.assigned_referral_name,
    assigned_referral_membership_no: row.assigned_referral_membership_no,
    assigned_referral_known_years: row.assigned_referral_known_years,
  };

  return (
    <ReferralSignWizard
      rawToken={rawToken}
      branchName={branchName}
      application={application}
      defaults={defaults}
    />
  );
}
