import { redirect } from "next/navigation";
import {
  recordLinkOpened,
  verifyMagicLink,
} from "@/lib/auth/magic-link-verify";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ApplicantWizard,
  type ApplicantDraft,
} from "@/components/applicant/ApplicantWizard";

export const dynamic = "force-dynamic";

export default async function ApplicantTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;
  const verify = await verifyMagicLink(rawToken, "applicant");
  if (!verify.ok) {
    if (verify.reason === "expired") redirect("/apply/expired");
    redirect("/apply/invalid");
  }

  // First visit: stamp link_opened_at + emit LINK_OPENED + flip status to APPLICANT_FILLING.
  const admin = createAdminClient();
  if (!verify.magicLink.link_opened_at) {
    await recordLinkOpened(
      verify.magicLink.id,
      verify.application.id,
      verify.magicLink.branch_id,
    );
  }
  if (verify.application.status === "APPLICANT_INVITED") {
    await admin
      .from("applications" as never)
      .update({
        status: "APPLICANT_FILLING",
        applicant_filling_started_at: new Date().toISOString(),
      } as never)
      .eq("id", verify.application.id);
    await admin.from("application_events" as never).insert({
      application_id: verify.application.id,
      branch_id: verify.magicLink.branch_id,
      event_type: "APPLICANT_FILLING",
    } as never);
  }

  // Load existing draft + branch name for the locked Branch field.
  const { data: branchRow } = await admin
    .from("branches" as never)
    .select("name")
    .eq("id", verify.magicLink.branch_id)
    .single();
  const branchName = (branchRow as { name: string } | null)?.name ?? "Kampong Glam";

  const { data: appRow } = await admin
    .from("applications" as never)
    .select(
      // Structured address columns (PR-1 postal-code-first redesign) need
      // to be selected so the draft restores correctly when the applicant
      // returns to a half-filled form. home_address is kept too — it's
      // the server-derived flat string used by PDF render / detail pages.
      // Structured occupation + organisation (PR for free-text cleanup)
      // joins the address fields here. Legacy occupation/organisation
      // columns kept in the SELECT for back-compat draft restore on
      // any pre-redesign in-flight rows.
      "nric_no, surname, given_names, chinese_name, home_address, postal_code, block_number, street_name, building_name, unit_number, latitude, longitude, housing_type, hdb_rooms, date_of_birth, place_of_birth, race, gender, marital_status, tel_home, tel_office, tel_hp, highest_edu, written_languages, spoken_languages, facebook, linkedin, twitter, blog, email, occupation, organisation, occupation_category, occupation_detail, organisation_name, school_level, monthly_income, hobbies, trade_unions, associations, clubs, ccc, ccmc, rnc, grassroots, applicant_photo_url, consent_pdpa",
    )
    .eq("id", verify.application.id)
    .single();
  const app = appRow as ApplicantDraft | null;
  if (!app) redirect("/apply/invalid");

  return (
    <ApplicantWizard
      applicationId={verify.application.id}
      rawToken={rawToken}
      branchName={branchName}
      defaultValues={app}
      applicantNameHint={verify.application.applicant_name_at_invite}
      applicantEmailHint={verify.application.applicant_email}
    />
  );
}
