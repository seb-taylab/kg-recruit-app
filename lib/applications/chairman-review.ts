/**
 * Shared data-load for the Chairman review screen.
 *
 * Both the authenticated dashboard route (/branch/sign/[id]) and the
 * passwordless token route (/branch-sign/[token]) present the SAME
 * read-only review before the chairman signs. Loading it here (and
 * rendering it via components/branch/ChairmanReviewCards) guarantees the
 * two surfaces can't drift — critical, since this is the information a
 * legal signature attests to.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { applicantPhotoUrl, isCloudinaryPublicId } from "@/lib/cloudinary/client";

export interface ChairmanReviewRow {
  id: string;
  branch_id: string;
  status: string;

  // Identity / display
  surname: string | null;
  given_names: string | null;
  name: string | null;
  chinese_name: string | null;
  applicant_name_at_invite: string | null;
  nric_no: string | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  applicant_photo_url: string | null;

  // Demographics
  race: string | null;
  gender: string | null;
  marital_status: string | null;
  housing_type: string | null;
  hdb_rooms: number | null;
  highest_edu: string | null;
  written_languages: string[] | null;
  spoken_languages: string[] | null;

  // Contact / address
  home_address: string | null;
  postal_code: string | null;
  tel_home: string | null;
  tel_office: string | null;
  tel_hp: string | null;
  email: string | null;

  // Work
  occupation: string | null;
  organisation: string | null;
  occupation_category: string | null;
  occupation_detail: string | null;
  organisation_name: string | null;
  school_level: string | null;
  monthly_income: string | null;

  // Online presence
  facebook: string | null;
  linkedin: string | null;
  twitter: string | null;
  blog: string | null;

  // Community + hobbies
  hobbies: string[] | null;
  trade_unions: string | null;
  associations: string | null;
  clubs: string | null;
  ccc: string | null;
  ccmc: string | null;
  rnc: string | null;
  grassroots: string | null;

  // Workflow + signatures
  applicant_signed_at: string | null;
  assigned_referral_name: string | null;
  assigned_referral_membership_no: string | null;
  assigned_referral_known_years: number | null;
  referral_signed_at: string | null;
  chairman_name_on_form: string | null;
}

export interface ReviewSignatureRow {
  role: "applicant" | "referral" | "chairman";
  signer_name: string;
  signature_png_url: string;
  signed_at: string | null;
}

export interface SignedReviewSignature extends ReviewSignatureRow {
  signed_url: string | null;
}

const APP_COLUMNS = [
  "id, branch_id, status",
  "surname, given_names, name, chinese_name, applicant_name_at_invite",
  "nric_no, date_of_birth, place_of_birth, applicant_photo_url",
  "race, gender, marital_status, housing_type, hdb_rooms, highest_edu",
  "written_languages, spoken_languages",
  "home_address, postal_code, tel_home, tel_office, tel_hp, email",
  "occupation, organisation, occupation_category, occupation_detail, organisation_name, school_level, monthly_income",
  "facebook, linkedin, twitter, blog",
  "hobbies, trade_unions, associations, clubs, ccc, ccmc, rnc, grassroots",
  "applicant_signed_at, assigned_referral_name, assigned_referral_membership_no, assigned_referral_known_years, referral_signed_at, chairman_name_on_form",
].join(", ");

export interface ChairmanReviewData {
  app: ChairmanReviewRow;
  applicantPhotoSignedUrl: string | null;
  signedSignatures: SignedReviewSignature[];
}

/**
 * Load the application row + a display URL for the photo + short-lived
 * signed URLs for the prior applicant/referral signatures. Returns null if
 * the application does not exist. Callers still enforce their own access
 * rule (dashboard: same-branch; token route: verified magic link).
 */
export async function loadChairmanReview(
  applicationId: string,
): Promise<ChairmanReviewData | null> {
  const admin = createAdminClient();

  const { data: appRow } = await admin
    .from("applications" as never)
    .select(APP_COLUMNS)
    .eq("id", applicationId)
    .single();
  const app = appRow as ChairmanReviewRow | null;
  if (!app) return null;

  // Photo: modern uploads are Cloudinary public IDs; legacy rows are
  // Supabase Storage paths. Mirror lib/pdf/render-application.ts.
  let applicantPhotoSignedUrl: string | null = null;
  if (app.applicant_photo_url) {
    if (isCloudinaryPublicId(app.applicant_photo_url)) {
      applicantPhotoSignedUrl = applicantPhotoUrl(app.applicant_photo_url);
    } else {
      const { data: signed } = await admin.storage
        .from("applicant-photos")
        .createSignedUrl(app.applicant_photo_url, 60 * 60);
      applicantPhotoSignedUrl = signed?.signedUrl ?? null;
    }
  }

  const { data: sigRows } = await admin
    .from("signatures" as never)
    .select("role, signer_name, signature_png_url, signed_at")
    .eq("application_id", applicationId)
    .in("role", ["applicant", "referral"]);
  const signatures = (sigRows as ReviewSignatureRow[] | null) ?? [];
  const signedSignatures = await Promise.all(
    signatures.map(async (s) => {
      const { data } = await admin.storage
        .from("signatures")
        .createSignedUrl(s.signature_png_url, 60 * 60);
      return { ...s, signed_url: data?.signedUrl ?? null };
    }),
  );

  return { app, applicantPhotoSignedUrl, signedSignatures };
}

/** Display name derivation shared by both review surfaces. */
export function chairmanReviewDisplayName(app: ChairmanReviewRow): string {
  return (
    (app.given_names && app.surname
      ? `${app.given_names} ${app.surname}`
      : app.applicant_name_at_invite) ?? "the applicant"
  );
}
