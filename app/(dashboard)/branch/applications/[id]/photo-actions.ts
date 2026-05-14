/**
 * Photo override — Branch Admin Team replaces the applicant's photo
 * after a manual eyeball review. Reuses the same 7:9 cropper applicants
 * use, so the embedded image stays consistent on the PDF.
 *
 * Allowed states: anything except COMPLETED (PDF already at HQ) and
 * ARCHIVED (archive must be reversed first).
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, PermissionError } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBranchAdminTeam } from "@/types/database";
import { writeAuditLog, writeApplicationEvent } from "@/lib/audit/log";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const MAX_BYTES = 5 * 1024 * 1024;

const schema = z.object({
  applicationId: z.string().uuid(),
  /** Cropped JPEG, base64-encoded (no data:URL prefix). */
  photoBase64: z.string().min(100),
});

export async function replacePhotoAction(
  input: z.input<typeof schema>,
): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };

  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message };
    throw err;
  }
  if (!auth.branch || !isBranchAdminTeam(auth.profile.role)) {
    return { ok: false, error: "Branch admin team only." };
  }

  const bytes = Buffer.from(parsed.data.photoBase64, "base64");
  if (bytes.byteLength > MAX_BYTES) {
    return { ok: false, error: "Photo too large (max 5 MB after crop)." };
  }
  if (bytes.byteLength < 1024) {
    return { ok: false, error: "Photo looks empty — try again." };
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("applications" as never)
    .select("id, branch_id, status, applicant_photo_url")
    .eq("id", parsed.data.applicationId)
    .single();
  const app = row as
    | { id: string; branch_id: string; status: string; applicant_photo_url: string | null }
    | null;
  if (!app || app.branch_id !== auth.branch.id) {
    return { ok: false, error: "Application not found." };
  }
  if (app.status === "COMPLETED") {
    return {
      ok: false,
      error: "Application is already Completed — the PDF at HQ won't change.",
    };
  }
  if (app.status === "ARCHIVED") {
    return { ok: false, error: "Unarchive the application first." };
  }

  const path = app.applicant_photo_url ?? `${app.id}/photo.jpg`;
  const { error: uploadErr } = await admin.storage
    .from("applicant-photos")
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (uploadErr) {
    return { ok: false, error: "Couldn't save the photo — try again in a minute." };
  }

  // Persist the path if it wasn't set yet (legacy rows).
  if (!app.applicant_photo_url) {
    await admin
      .from("applications" as never)
      .update({ applicant_photo_url: path } as never)
      .eq("id", app.id);
  }

  await writeAuditLog({
    action: "PHOTO_REPLACED",
    applicationId: app.id,
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { path, bytes: bytes.byteLength, prior_status: app.status },
  });
  await writeApplicationEvent({
    applicationId: app.id,
    branchId: auth.branch.id,
    eventType: "PHOTO_REPLACED",
    actorId: auth.userId,
    actorRole: auth.profile.role,
    metadata: { bytes: bytes.byteLength },
  });

  revalidatePath(`/branch/applications/${app.id}`);
  return { ok: true };
}
