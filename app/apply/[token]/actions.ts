"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { verifyMagicLink } from "@/lib/auth/magic-link-verify";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  applicantPage1Schema,
  applicantPage2Schema,
  applicantFullSchema,
  nricRequired,
} from "@/lib/validation/applicant-form";
import { writeApplicationEvent, writeAuditLog } from "@/lib/audit/log";
import { uploadApplicantPhoto } from "@/lib/cloudinary/client";
import { buildLegacyOccupationString } from "@/lib/applications/occupation";
import type { OccupationCategory } from "@/lib/validation/occupation-organisation";
import {
  validateUpload,
  extensionFor,
  canonicalContentType,
  isPngBytes,
} from "@/lib/security/file-upload";

interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const tokenInput = z.object({ rawToken: z.string().min(20) });

async function authorise(rawToken: string) {
  const verify = await verifyMagicLink(rawToken, "applicant");
  if (!verify.ok) {
    if (verify.reason === "expired") return { ok: false as const, error: "Link expired." };
    if (verify.reason === "consumed") return { ok: false as const, error: "Link already used." };
    return { ok: false as const, error: "Link not valid." };
  }
  return { ok: true as const, verify };
}

/**
 * Persist Page 1 fields. Re-validates server-side. Doesn't change status.
 */
export async function saveDraftPage1Action(
  rawToken: string,
  values: unknown,
): Promise<ActionResult> {
  if (!tokenInput.safeParse({ rawToken }).success) return { ok: false, error: "Bad token." };
  const auth = await authorise(rawToken);
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = applicantPage1Schema.partial().safeParse(values);
  if (!parsed.success) {
    return mapFieldErrors(parsed.error);
  }

  const admin = createAdminClient();

  // Derive the legacy `home_address` flat string from the new structured
  // fields whenever any address column changes. This keeps the PDF renderer
  // (which reads home_address into its dedicated coordinate) + the
  // application-detail / sign pages (which display home_address) working
  // unchanged. We always overwrite home_address here so a manual-edit
  // applicant can't desync the two representations. Postal code goes into
  // its OWN dedicated PDF slot, so we deliberately omit it from this
  // string per Sebastian's Option B decision (2026-05-16).
  const addressChanged =
    parsed.data.block_number !== undefined ||
    parsed.data.street_name !== undefined ||
    parsed.data.building_name !== undefined ||
    parsed.data.unit_number !== undefined;
  const derivedHomeAddress = addressChanged
    ? buildHomeAddress({
        block_number: parsed.data.block_number ?? undefined,
        street_name: parsed.data.street_name ?? undefined,
        building_name: parsed.data.building_name ?? undefined,
        unit_number: parsed.data.unit_number ?? undefined,
      })
    : undefined;

  const update = {
    ...parsed.data,
    // Maintain the denormalised `name` column from surname + given_names.
    ...(parsed.data.surname && parsed.data.given_names
      ? { name: `${parsed.data.surname.toUpperCase()} ${parsed.data.given_names}` }
      : {}),
    // Only write home_address when one of its source fields actually
    // landed in this update — avoids stomping a previously-saved value
    // during partial autosaves that don't touch the address block.
    ...(derivedHomeAddress !== undefined ? { home_address: derivedHomeAddress } : {}),
  };
  const { error } = await admin
    .from("applications" as never)
    .update(update as never)
    .eq("id", auth.verify.application.id);
  if (error) return { ok: false, error: "Couldn't save — try again in a minute." };
  revalidatePath(`/apply/${rawToken}`);
  return { ok: true };
}

/**
 * Compose the legacy flat `home_address` string from the structured
 * address columns. Postal code is intentionally omitted — it occupies its
 * own dedicated slot on the PDF (formCoordinates.page1.postalCode).
 *
 *   "Blk 102, Rivervale Walk, Rivervale Pride, #08-123"
 *   "12 Sentosa Cove" (landed — no building, no unit)
 */
function buildHomeAddress(parts: {
  block_number?: string;
  street_name?: string;
  building_name?: string;
  unit_number?: string;
}): string {
  const block = parts.block_number?.trim();
  const street = parts.street_name?.trim();
  const building = parts.building_name?.trim();
  const unit = parts.unit_number?.trim();

  const segments: string[] = [];
  if (block && street) {
    // HDB convention: "Blk 102" if the block is purely numeric; otherwise
    // just the block as the applicant typed it (some landed houses use
    // a non-numeric house number).
    segments.push(/^\d+[A-Z]?$/.test(block) ? `Blk ${block} ${street}` : `${block} ${street}`);
  } else if (street) {
    segments.push(street);
  } else if (block) {
    segments.push(block);
  }
  if (building) segments.push(building);
  if (unit) segments.push(unit);
  return segments.join(", ");
}

export async function saveDraftPage2Action(
  rawToken: string,
  values: unknown,
): Promise<ActionResult> {
  if (!tokenInput.safeParse({ rawToken }).success) return { ok: false, error: "Bad token." };
  const auth = await authorise(rawToken);
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = applicantPage2Schema.partial().safeParse(values);
  if (!parsed.success) return mapFieldErrors(parsed.error);

  // Derive the legacy free-text occupation + organisation columns from
  // the new structured fields whenever any of the source fields changed.
  // Keeps the PDF renderer + Chairman sign page (both still read the
  // legacy columns) working without each one needing to know the new
  // shape. Skip when no source field is in this update — autosave of
  // other Page 2 fields (e.g. just hobbies) shouldn't stomp values
  // that already exist.
  const occupationChanged =
    parsed.data.occupation_category !== undefined ||
    parsed.data.occupation_detail !== undefined ||
    parsed.data.organisation_name !== undefined;
  const legacyOccupation = occupationChanged
    ? buildLegacyOccupationString({
        occupation_category:
          parsed.data.occupation_category ?? null,
        occupation_detail: parsed.data.occupation_detail ?? null,
        organisation_name: parsed.data.organisation_name ?? null,
      })
    : undefined;
  const legacyOrganisation =
    occupationChanged && parsed.data.occupation_category
      ? // Homemaker / other have no organisation; everyone else uses
        // the organisation_name input directly (which the helper already
        // emits via pdfOccupationLines, but for the legacy column we
        // just take the raw value — same semantics).
        legacyOrgFor(
          parsed.data.occupation_category,
          parsed.data.organisation_name ?? null,
        )
      : undefined;

  const admin = createAdminClient();
  const update = {
    ...parsed.data,
    ...(legacyOccupation !== undefined ? { occupation: legacyOccupation } : {}),
    ...(legacyOrganisation !== undefined ? { organisation: legacyOrganisation } : {}),
  };
  const { error } = await admin
    .from("applications" as never)
    .update(update as never)
    .eq("id", auth.verify.application.id);
  if (error) return { ok: false, error: "Couldn't save — try again in a minute." };
  revalidatePath(`/apply/${rawToken}`);
  return { ok: true };
}

/**
 * Pick the legacy organisation value to persist alongside the new
 * structured columns. Mirrors pdfOccupationLines's logic but produces
 * a single nullable string for the DB rather than a {occupation,
 * organisation} pair: homemaker + other have no organisation.
 */
function legacyOrgFor(
  category: OccupationCategory,
  orgName: string | null,
): string | null {
  const org = orgName?.trim() ?? "";
  if (!org) return null;
  if (category === "homemaker" || category === "other") return null;
  return org;
}

/**
 * Uploads a raw applicant photo to Cloudinary, which auto-crops it to the
 * passport-style 7:9 box using face-aware gravity (c_thumb + g_face).
 * Stores the resulting Cloudinary public_id in `applicant_photo_url`.
 *
 * Returns the auto-cropped delivery URL so the wizard can show the exact
 * image that will land on the PDF — the applicant verifies visually
 * instead of relying on a face-detection metadata flag (paid add-on).
 */
export async function uploadPhotoAction(
  rawToken: string,
  formData: FormData,
): Promise<ActionResult & { previewUrl?: string }> {
  if (!tokenInput.safeParse({ rawToken }).success) return { ok: false, error: "Bad token." };
  const auth = await authorise(rawToken);
  if (!auth.ok) return { ok: false, error: auth.error };

  // FormData carries the file as a multipart-encoded Blob. Bypasses the
  // React Flight (RSC) payload encoder that ArrayBuffer args would go
  // through — that encoder has a "Maximum array nesting depth" limit
  // around the few-MB mark which a phone-camera photo hits regularly.
  // FormData uses the standard multipart stream + Vercel's body-size
  // limit (10 MB via next.config.ts). 2026-05-15 fix.
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file provided." };
  }
  const fileBuffer = await file.arrayBuffer();

  // Defensive validation BEFORE forwarding to Cloudinary. 5 MB cap +
  // image/jpeg|png|webp allowlist + magic-byte check. Security audit
  // 2026-05-16 finding H2.
  const validated = validateUpload({
    buffer: fileBuffer,
    contentType: file.type,
    maxBytes: 5 * 1024 * 1024,
    allow: ["jpeg", "png", "webp"],
  });
  if (!validated.ok) return { ok: false, error: validated.error };

  const admin = createAdminClient();
  const appId = auth.verify.application.id;

  let uploaded;
  try {
    uploaded = await uploadApplicantPhoto(Buffer.from(validated.bytes), appId);
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't save the photo — ${err instanceof Error ? err.message : "try again in a minute"}.`,
    };
  }

  const { error: updateErr } = await admin
    .from("applications" as never)
    .update({
      applicant_photo_url: uploaded.publicId,
      applicant_photo_captured_method: "upload",
    } as never)
    .eq("id", appId);
  if (updateErr) return { ok: false, error: "Couldn't link the photo — try again in a minute." };

  await writeApplicationEvent({
    applicationId: appId,
    branchId: auth.verify.magicLink.branch_id,
    eventType: "PHOTO_UPLOADED",
  });
  revalidatePath(`/apply/${rawToken}`);
  return { ok: true, previewUrl: uploaded.deliveryUrl };
}

export async function uploadNricAction(
  rawToken: string,
  side: "front" | "back",
  formData: FormData,
): Promise<ActionResult> {
  if (!tokenInput.safeParse({ rawToken }).success) return { ok: false, error: "Bad token." };
  if (side !== "front" && side !== "back") return { ok: false, error: "Invalid side." };
  const auth = await authorise(rawToken);
  if (!auth.ok) return { ok: false, error: auth.error };

  // FormData (multipart) instead of ArrayBuffer arg — see uploadPhotoAction
  // for the same fix's rationale. NRIC photos from a phone routinely hit
  // 3-5 MB which RSC's flight encoder can't handle.
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file provided." };
  }
  const fileBuffer = await file.arrayBuffer();

  // Defensive validation: 8 MB cap, image/jpeg|png + application/pdf
  // allowlist, magic-byte check (so a client can't claim image/jpeg
  // and upload an HTML payload that a Branch Admin would later click).
  // Security audit 2026-05-16 finding H1.
  const validated = validateUpload({
    buffer: fileBuffer,
    contentType: file.type,
    maxBytes: 8 * 1024 * 1024,
    allow: ["jpeg", "png", "pdf"],
  });
  if (!validated.ok) return { ok: false, error: validated.error };

  const admin = createAdminClient();
  const appId = auth.verify.application.id;
  // Use the magic-byte-verified kind for the extension, not the
  // client-supplied content-type — defence against extension confusion.
  const ext = extensionFor(validated.kind);
  const path = `${appId}/${side}.${ext}`;
  const { error: uploadErr } = await admin.storage
    .from("nric-uploads")
    .upload(path, validated.bytes, {
      contentType: canonicalContentType(validated.kind),
      upsert: true,
    });
  if (uploadErr) return { ok: false, error: "Couldn't save the scan — try again in a minute." };

  // Upsert the nric_uploads row so the path is persisted to DB.
  const { data: existing } = await admin
    .from("nric_uploads" as never)
    .select("id, front_url, back_url")
    .eq("application_id", appId)
    .single();
  const row = existing as
    | { id: string; front_url: string | null; back_url: string | null }
    | null;

  const next = {
    front_url: side === "front" ? path : row?.front_url ?? "",
    back_url: side === "back" ? path : row?.back_url ?? "",
  };
  if (row) {
    await admin
      .from("nric_uploads" as never)
      .update(next as never)
      .eq("id", row.id);
  } else {
    await admin.from("nric_uploads" as never).insert({
      application_id: appId,
      branch_id: auth.verify.magicLink.branch_id,
      ...next,
    } as never);
  }

  await writeApplicationEvent({
    applicationId: appId,
    branchId: auth.verify.magicLink.branch_id,
    eventType: "NRIC_UPLOADED",
    metadata: { side },
  });
  revalidatePath(`/apply/${rawToken}`);
  return { ok: true };
}

function mapFieldErrors(error: z.ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, fieldErrors };
}

/**
 * Submit the applicant signature — terminal step of the applicant journey.
 *
 *   1. Re-verifies the token (one last check; race-condition safe).
 *   2. Re-runs `applicantFullSchema` against the saved row so we never
 *      accept a half-filled application.
 *   3. Enforces conditional NRIC: if `place_of_birth ≠ Singapore`, both
 *      scan rows must exist.
 *   4. Decodes the signature PNG data URL, uploads to the `signatures`
 *      bucket at `<applicationId>/applicant.png`.
 *   5. Inserts a `signatures` row with IP + UA.
 *   6. Marks the magic link `consumed_at`.
 *   7. Transitions status APPLICANT_FILLING → SIGNED_BY_APPLICANT, then
 *      → PENDING_REFERRAL_ASSIGNMENT (PRD §1D state machine).
 *   8. Emits SIGNED_BY_APPLICANT event + audit log row.
 *
 * On success: { ok: true } — caller redirects to /apply/[token]/done.
 */
export async function submitApplicantSignatureAction(
  rawToken: string,
  signatureDataUrl: string,
): Promise<ActionResult> {
  if (!tokenInput.safeParse({ rawToken }).success) return { ok: false, error: "Bad token." };
  const auth = await authorise(rawToken);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const appId = auth.verify.application.id;
  const branchId = auth.verify.magicLink.branch_id;

  // Re-load the saved row and validate the FULL applicant schema.
  // Structured-address columns + lat/lng need to come back so the
  // schema's unit-required-unless-Landed rule has the data to check,
  // and so constituency derivation has lat/lng to point-in-polygon
  // against. See migrations/20260516000001_structured_address.sql.
  const { data: row } = await admin
    .from("applications" as never)
    .select(
      "surname, given_names, nric_no, chinese_name, home_address, postal_code, block_number, street_name, building_name, unit_number, latitude, longitude, housing_type, hdb_rooms, date_of_birth, place_of_birth, race, gender, marital_status, tel_home, tel_office, tel_hp, highest_edu, written_languages, spoken_languages, facebook, linkedin, twitter, blog, email, occupation, organisation, monthly_income, hobbies, trade_unions, associations, clubs, ccc, ccmc, rnc, grassroots, applicant_photo_url, consent_pdpa",
    )
    .eq("id", appId)
    .single();
  const parsed = applicantFullSchema.safeParse(row);
  if (!parsed.success) {
    return mapFieldErrors(parsed.error);
  }
  const data = parsed.data;

  // Photo must be uploaded.
  const photoCheck = row as { applicant_photo_url: string | null } | null;
  if (!photoCheck?.applicant_photo_url) {
    return { ok: false, error: "Please add your photo before signing." };
  }

  // Conditional NRIC check.
  if (nricRequired(data.place_of_birth)) {
    const { data: nricRow } = await admin
      .from("nric_uploads" as never)
      .select("front_url, back_url")
      .eq("application_id", appId)
      .single();
    const nric = nricRow as { front_url: string | null; back_url: string | null } | null;
    if (!nric || !nric.front_url || !nric.back_url) {
      return { ok: false, error: "Please upload both sides of your NRIC before signing." };
    }
  }

  // Decode the signature PNG (data URL).
  const match = signatureDataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) return { ok: false, error: "Signature is not a valid PNG." };
  const sigBytes = Buffer.from(match[1], "base64");
  if (sigBytes.byteLength > 200_000) {
    return { ok: false, error: "Signature image is too large. Try again with a simpler drawing." };
  }
  // The regex only checked the data-URL prefix — confirm the decoded
  // bytes are actually a PNG (8-byte magic header). Audit finding L3.
  if (!isPngBytes(sigBytes)) {
    return { ok: false, error: "Signature isn't a valid PNG image." };
  }

  const sigPath = `${appId}/applicant.png`;
  const { error: sigUploadErr } = await admin.storage
    .from("signatures")
    .upload(sigPath, sigBytes, { contentType: "image/png", upsert: true });
  if (sigUploadErr) {
    return { ok: false, error: "Couldn't save the signature — try again in a minute." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;

  const signerName = `${data.surname.toUpperCase()} ${data.given_names}`.trim();

  // Insert signature row (or upsert if rerun — defensive against retries).
  const { error: sigInsertErr } = await admin.from("signatures" as never).insert({
    application_id: appId,
    branch_id: branchId,
    role: "applicant",
    signer_name: signerName,
    signature_png_url: sigPath,
    ip_address: ip,
    user_agent: ua,
  } as never);
  if (sigInsertErr) {
    return { ok: false, error: "Couldn't record the signature — try again in a minute." };
  }

  const now = new Date().toISOString();

  // Consume the magic link.
  await admin
    .from("magic_links" as never)
    .update({ consumed_at: now } as never)
    .eq("id", auth.verify.magicLink.id)
    .is("consumed_at", null);

  // Derive the electoral constituency (GRC / SMC) from the applicant's
  // lat/lng. Cache-first; on cache miss does a point-in-polygon test
  // against the vendored ELD GeoJSON. Submission_* are FROZEN at this
  // moment per Sebastian's 2026-05-16 decision card — current_* are
  // populated identically here and updated later by boundary-refresh
  // jobs. Failure to derive (missing lat/lng, off-the-map coords) does
  // NOT block the signature — the row just goes through with NULL
  // constituency, which the reporting query treats as "unknown".
  let submissionConstituency: string | null = null;
  let submissionConstituencyType: "GRC" | "SMC" | null = null;
  let constituencyBoundaryVersion: string | null = null;
  if (data.latitude != null && data.longitude != null && data.postal_code) {
    try {
      const { deriveConstituency, BOUNDARY_VERSION } = await import(
        "@/lib/sg/constituency"
      );
      const result = await deriveConstituency(
        data.postal_code,
        data.latitude,
        data.longitude,
      );
      if (result) {
        submissionConstituency = result.full_name;
        submissionConstituencyType = result.type;
        constituencyBoundaryVersion = BOUNDARY_VERSION;
      }
    } catch (err) {
      // Don't surface to the applicant — they shouldn't be blocked from
      // signing because our geo-tagging hit an issue. Log + move on.
      console.warn(
        "[constituency] derivation failed for application " + appId,
        err,
      );
    }
  }

  // Status transition: APPLICANT_FILLING → PENDING_REFERRAL_ASSIGNMENT.
  // We pass through SIGNED_BY_APPLICANT in the event log but the row
  // skips straight to the next admin-actionable state.
  await admin
    .from("applications" as never)
    .update({
      applicant_signed_at: now,
      status: "PENDING_REFERRAL_ASSIGNMENT",
      // Constituency stamping. submission_* + current_* land identically
      // here; only current_* mutates on future boundary refreshes.
      ...(submissionConstituency && submissionConstituencyType
        ? {
            submission_constituency: submissionConstituency,
            submission_constituency_type: submissionConstituencyType,
            current_constituency: submissionConstituency,
            current_constituency_type: submissionConstituencyType,
            constituency_boundary_version: constituencyBoundaryVersion,
          }
        : {}),
    } as never)
    .eq("id", appId);

  await writeApplicationEvent({
    applicationId: appId,
    branchId,
    eventType: "SIGNED_BY_APPLICANT",
    metadata: { ip },
  });
  await writeAuditLog({
    action: "SIGNED",
    applicationId: appId,
    branchId,
    actorRole: null,
    metadata: { role: "applicant" },
  });

  revalidatePath(`/apply/${rawToken}`);
  return { ok: true };
}
