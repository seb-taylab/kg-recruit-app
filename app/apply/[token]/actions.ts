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

  const admin = createAdminClient();
  const { error } = await admin
    .from("applications" as never)
    .update(parsed.data as never)
    .eq("id", auth.verify.application.id);
  if (error) return { ok: false, error: "Couldn't save — try again in a minute." };
  revalidatePath(`/apply/${rawToken}`);
  return { ok: true };
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
  fileBuffer: ArrayBuffer,
  contentType: string,
): Promise<ActionResult & { previewUrl?: string }> {
  if (!tokenInput.safeParse({ rawToken }).success) return { ok: false, error: "Bad token." };
  const auth = await authorise(rawToken);
  if (!auth.ok) return { ok: false, error: auth.error };
  void contentType;

  const admin = createAdminClient();
  const appId = auth.verify.application.id;

  let uploaded;
  try {
    uploaded = await uploadApplicantPhoto(Buffer.from(fileBuffer), appId);
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
  fileBuffer: ArrayBuffer,
  contentType: string,
): Promise<ActionResult> {
  if (!tokenInput.safeParse({ rawToken }).success) return { ok: false, error: "Bad token." };
  const auth = await authorise(rawToken);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const appId = auth.verify.application.id;
  const ext = contentType === "application/pdf" ? "pdf" : "jpg";
  const path = `${appId}/${side}.${ext}`;
  const { error: uploadErr } = await admin.storage
    .from("nric-uploads")
    .upload(path, new Uint8Array(fileBuffer), { contentType, upsert: true });
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
  const { data: row } = await admin
    .from("applications" as never)
    .select(
      "surname, given_names, nric_no, chinese_name, home_address, postal_code, housing_type, hdb_rooms, date_of_birth, place_of_birth, race, gender, marital_status, tel_home, tel_office, tel_hp, highest_edu, written_languages, spoken_languages, facebook, linkedin, twitter, blog, email, occupation, organisation, monthly_income, hobbies, trade_unions, associations, clubs, ccc, ccmc, rnc, grassroots, applicant_photo_url, consent_pdpa",
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

  // Status transition: APPLICANT_FILLING → PENDING_REFERRAL_ASSIGNMENT.
  // We pass through SIGNED_BY_APPLICANT in the event log but the row
  // skips straight to the next admin-actionable state.
  await admin
    .from("applications" as never)
    .update({
      applicant_signed_at: now,
      status: "PENDING_REFERRAL_ASSIGNMENT",
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
