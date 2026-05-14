"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAuth, PermissionError } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { chairmanSignSchema } from "@/lib/validation/chairman";
import { writeAuditLog, writeApplicationEvent } from "@/lib/audit/log";

interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Chairman terminal sign action.
 *
 *   1. Auth: caller must be `branch_chairman` on the application's branch.
 *   2. Status must be PENDING_CHAIRMAN.
 *   3. Re-validates `chairman_name_on_form` + `chairman_known_years` server-side.
 *   4. Uploads signature PNG to the `signatures` bucket.
 *   5. Inserts a `signatures` row (role=chairman, signer_name = name on form).
 *   6. Stamps `chairman_signed_at`, `ready_to_send_at`, status = READY_TO_SEND.
 *   7. Emits SIGNED_BY_CHAIRMAN + READY_TO_SEND events + SIGNED audit row.
 *
 * Per PRD §1D the state machine collapses SIGNED_BY_CHAIRMAN → READY_TO_SEND
 * in one transition — the chairman's signed_at marks the chairman milestone
 * while the application's status moves directly to READY_TO_SEND so the
 * admin team can pick recipients (Step 8).
 */
export async function submitChairmanSignatureAction(
  applicationId: string,
  values: unknown,
  signatureDataUrl: string,
): Promise<ActionResult> {
  // 1. Auth
  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message };
    throw err;
  }
  if (!auth.branch || auth.profile.role !== "branch_chairman") {
    return { ok: false, error: "Branch Chairman only." };
  }

  // 2. Confirm application is in the right state + same branch.
  const admin = createAdminClient();
  const { data: appRow } = await admin
    .from("applications" as never)
    .select("id, branch_id, status")
    .eq("id", applicationId)
    .single();
  const app = appRow as { id: string; branch_id: string; status: string } | null;
  if (!app || app.branch_id !== auth.branch.id) {
    return { ok: false, error: "Application not found." };
  }
  if (app.status !== "PENDING_CHAIRMAN") {
    return {
      ok: false,
      error: `Application is in state ${app.status}. Chairman sign requires PENDING_CHAIRMAN.`,
    };
  }

  // 3. Validate fields
  const parsed = chairmanSignSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path.join(".");
      if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  // 4. Decode signature
  const match = signatureDataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) return { ok: false, error: "Signature is not a valid PNG." };
  const sigBytes = Buffer.from(match[1], "base64");
  if (sigBytes.byteLength > 200_000) {
    return { ok: false, error: "Signature image is too large. Try again with a simpler drawing." };
  }

  // 5. Upload signature
  const sigPath = `${applicationId}/chairman.png`;
  const { error: uploadErr } = await admin.storage
    .from("signatures")
    .upload(sigPath, sigBytes, { contentType: "image/png", upsert: true });
  if (uploadErr) {
    return { ok: false, error: "Couldn't save the signature — try again in a minute." };
  }

  // 6. Insert signatures row
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;

  const { error: sigInsertErr } = await admin.from("signatures" as never).insert({
    application_id: applicationId,
    branch_id: auth.branch.id,
    role: "chairman",
    signer_name: parsed.data.chairman_name_on_form,
    signature_png_url: sigPath,
    ip_address: ip,
    user_agent: ua,
  } as never);
  if (sigInsertErr) {
    return { ok: false, error: "Couldn't record the signature — try again in a minute." };
  }

  // 7. Transition state — straight to READY_TO_SEND.
  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("applications" as never)
    .update({
      chairman_name_on_form: parsed.data.chairman_name_on_form,
      chairman_known_years: parsed.data.chairman_known_years,
      chairman_signed_at: now,
      ready_to_send_at: now,
      status: "READY_TO_SEND",
    } as never)
    .eq("id", applicationId);
  if (updateErr) {
    return { ok: false, error: "Couldn't transition the application — try again in a minute." };
  }

  // 8. Audit + events
  await writeApplicationEvent({
    applicationId,
    branchId: auth.branch.id,
    eventType: "SIGNED_BY_CHAIRMAN",
    actorId: auth.userId,
    actorRole: auth.profile.role,
  });
  await writeApplicationEvent({
    applicationId,
    branchId: auth.branch.id,
    eventType: "READY_TO_SEND",
    actorId: auth.userId,
    actorRole: auth.profile.role,
  });
  await writeAuditLog({
    action: "SIGNED",
    applicationId,
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { role: "chairman" },
  });
  await writeAuditLog({
    action: "READY_TO_SEND",
    applicationId,
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
  });

  revalidatePath(`/branch/sign`);
  revalidatePath(`/branch/sign/${applicationId}`);
  revalidatePath(`/branch/applications/${applicationId}`);
  return { ok: true };
}
