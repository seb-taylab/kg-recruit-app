"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyMagicLink } from "@/lib/auth/magic-link-verify";
import { chairmanSignSchema } from "@/lib/validation/chairman";
import { writeAuditLog, writeApplicationEvent } from "@/lib/audit/log";
import { isPngBytes } from "@/lib/security/file-upload";

interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Chairman terminal sign action — PASSWORDLESS variant.
 *
 * Same effect as submitChairmanSignatureAction, but authorization comes from
 * possession of a valid `chairman` magic-link token rather than a logged-in
 * branch_chairman session. Used by the public /branch-sign/[token] route so a
 * busy chairman can sign straight from a WhatsApp link.
 *
 *   1. Verify the token (type=chairman, not expired, not consumed).
 *   2. Status must be PENDING_CHAIRMAN.
 *   3. Re-validate name + years-known server-side.
 *   4. Upload signature PNG, insert signatures row (role=chairman).
 *   5. Stamp chairman_signed_at + ready_to_send_at, status → READY_TO_SEND.
 *   6. Consume the magic link (single-use).
 *   7. Emit events + audit with a NULL actor (anonymous, like the referral
 *      sign path) — the signer identity is the name printed on the form.
 */
export async function submitChairmanSignatureViaTokenAction(
  token: string,
  values: unknown,
  signatureDataUrl: string,
): Promise<ActionResult> {
  // 1. Verify token.
  const verify = await verifyMagicLink(token, "chairman");
  if (!verify.ok) {
    const message =
      verify.reason === "expired"
        ? "This signing link has expired. Ask your Branch Admin to send a fresh one."
        : verify.reason === "consumed"
          ? "This application has already been signed."
          : "This signing link is not valid.";
    return { ok: false, error: message };
  }
  const { magicLink, application } = verify;

  // 2. Status gate.
  if (application.status !== "PENDING_CHAIRMAN") {
    return {
      ok: false,
      error: `This application is in state ${application.status} and is not awaiting a Chairman signature.`,
    };
  }

  const applicationId = application.id;
  const branchId = magicLink.branch_id;
  const admin = createAdminClient();

  // 3. Validate fields.
  const parsed = chairmanSignSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path.join(".");
      if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  // 4. Decode + validate signature.
  const match = signatureDataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) return { ok: false, error: "Signature is not a valid PNG." };
  const sigBytes = Buffer.from(match[1], "base64");
  if (sigBytes.byteLength > 200_000) {
    return { ok: false, error: "Signature image is too large. Try again with a simpler drawing." };
  }
  if (!isPngBytes(sigBytes)) {
    return { ok: false, error: "Signature isn't a valid PNG image." };
  }

  // 5. Upload signature.
  const sigPath = `${applicationId}/chairman.png`;
  const { error: uploadErr } = await admin.storage
    .from("signatures")
    .upload(sigPath, sigBytes, { contentType: "image/png", upsert: true });
  if (uploadErr) {
    return { ok: false, error: "Couldn't save the signature — try again in a minute." };
  }

  // 6. Insert signatures row.
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;

  const { error: sigInsertErr } = await admin.from("signatures" as never).insert({
    application_id: applicationId,
    branch_id: branchId,
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

  // 8. Consume the magic link (single-use). Guard on consumed_at IS NULL so a
  //    double-submit can't re-consume.
  await admin
    .from("magic_links" as never)
    .update({ consumed_at: now } as never)
    .eq("id", magicLink.id)
    .is("consumed_at", null);

  // 9. Audit + events — NULL actor (anonymous token signer), mirroring the
  //    referral sign path. The signed name is the accountable identity.
  await writeApplicationEvent({
    applicationId,
    branchId,
    eventType: "SIGNED_BY_CHAIRMAN",
    actorRole: null,
    metadata: { via: "chairman_token" },
  });
  await writeApplicationEvent({
    applicationId,
    branchId,
    eventType: "READY_TO_SEND",
    actorRole: null,
    metadata: { via: "chairman_token" },
  });
  await writeAuditLog({
    action: "SIGNED",
    applicationId,
    branchId,
    actorRole: null,
    metadata: { role: "chairman", via: "chairman_token" },
  });
  await writeAuditLog({
    action: "READY_TO_SEND",
    applicationId,
    branchId,
    actorRole: null,
    metadata: { via: "chairman_token" },
  });

  revalidatePath(`/branch/applications/${applicationId}`);
  revalidatePath("/branch/inbox");
  revalidatePath("/branch/journey");
  revalidatePath("/branch/ready-to-send");
  return { ok: true };
}
