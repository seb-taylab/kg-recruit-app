/**
 * Shared "load + render" pipeline used by:
 *   - sendApplicationToHqAction (Step 8) — renders, persists, transitions state
 *   - previewPdfAction — renders only, returns bytes
 *
 * Extracted so both callers run the same data-load and render logic and any
 * future fix (e.g., CJK font, calibrated coordinates) lands in one place.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateFilledMembershipPDF,
  type ApplicationData,
  type SignatureAsset,
} from "@/lib/pdf/generate";
import {
  applicantPhotoUrl,
  isCloudinaryPublicId,
} from "@/lib/cloudinary/client";

export interface RenderResult {
  ok: true;
  pdfBytes: Uint8Array;
  applicantDisplayName: string;
}

export interface RenderError {
  ok: false;
  error: string;
}

export type LoadedApp = ApplicationData & {
  id: string;
  branch_id: string;
  status: string;
  applicant_photo_url: string | null;
  applicant_name_at_invite: string | null;
};

/**
 * Load the application row, fetch photo + 3 signature blobs from storage,
 * render the PDF, return the bytes. Does NOT touch state.
 */
export async function renderApplicationPdf(
  applicationId: string,
  branchId: string,
  branchName: string,
): Promise<RenderResult | RenderError> {
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("applications" as never)
    .select(
      "id, branch_id, status, surname, given_names, name, applicant_name_at_invite, nric_no, chinese_name, home_address, postal_code, housing_type, hdb_rooms, date_of_birth, place_of_birth, race, gender, marital_status, tel_home, tel_office, tel_hp, highest_edu, written_languages, spoken_languages, facebook, linkedin, twitter, blog, email, occupation, organisation, monthly_income, hobbies, trade_unions, associations, clubs, ccc, ccmc, rnc, grassroots, applicant_signed_at, applicant_photo_url, assigned_referral_name, assigned_referral_membership_no, assigned_referral_known_years, referral_signed_at, chairman_name_on_form, chairman_known_years, chairman_signed_at",
    )
    .eq("id", applicationId)
    .single();
  const app = row as LoadedApp | null;
  if (!app || app.branch_id !== branchId) {
    return { ok: false, error: "Application not found." };
  }
  if (!app.applicant_photo_url) {
    return { ok: false, error: "Applicant photo missing — cannot render PDF." };
  }

  // applicant_photo_url either:
  //  - starts with `kg-recruit/applications/…` → Cloudinary public_id (new path)
  //  - else a Supabase Storage path (legacy / test fixtures)
  let photoBytes: Uint8Array;
  if (isCloudinaryPublicId(app.applicant_photo_url)) {
    const url = applicantPhotoUrl(app.applicant_photo_url);
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, error: "Couldn't load the applicant photo from Cloudinary." };
    }
    photoBytes = new Uint8Array(await res.arrayBuffer());
  } else {
    const { data: photoBlob, error: photoErr } = await admin.storage
      .from("applicant-photos")
      .download(app.applicant_photo_url);
    if (photoErr || !photoBlob) {
      return { ok: false, error: "Couldn't load the applicant photo." };
    }
    photoBytes = new Uint8Array(await photoBlob.arrayBuffer());
  }

  const sigAssets: { applicant?: SignatureAsset; referral?: SignatureAsset; chairman?: SignatureAsset } = {};
  for (const role of ["applicant", "referral", "chairman"] as const) {
    const { data } = await admin.storage
      .from("signatures")
      .download(`${app.id}/${role}.png`);
    if (data) {
      sigAssets[role] = { pngBytes: new Uint8Array(await data.arrayBuffer()) };
    }
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateFilledMembershipPDF({
      application: { ...app, branch_name: branchName },
      photoBytes,
      signatures: sigAssets,
    });
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't render the PDF — ${err instanceof Error ? err.message : "unknown error"}.`,
    };
  }

  const applicantDisplayName =
    (app.given_names && app.surname
      ? `${app.given_names} ${app.surname}`
      : app.applicant_name_at_invite) ?? "applicant";

  return { ok: true, pdfBytes, applicantDisplayName };
}
