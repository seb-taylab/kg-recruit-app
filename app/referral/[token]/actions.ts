"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { verifyMagicLink } from "@/lib/auth/magic-link-verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { referralSignSchema } from "@/lib/validation/referral";
import { writeApplicationEvent, writeAuditLog } from "@/lib/audit/log";
import { isPngBytes } from "@/lib/security/file-upload";

interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const tokenInput = z.object({ rawToken: z.string().min(20) });

async function authorise(rawToken: string) {
  const verify = await verifyMagicLink(rawToken, "referral");
  if (!verify.ok) {
    if (verify.reason === "expired") return { ok: false as const, error: "Link expired." };
    if (verify.reason === "consumed") return { ok: false as const, error: "Link already used." };
    return { ok: false as const, error: "Link not valid." };
  }
  return { ok: true as const, verify };
}

/**
 * Submit the referral signature. Per the Form Ownership Map (Actor B), the
 * referral edits 3 fields then signs. On submit:
 *   1. Re-verifies the token
 *   2. Re-validates the 3 fields
 *   3. Uploads the signature PNG to the `signatures` bucket
 *   4. Inserts a `signatures` row (role=referral)
 *   5. Consumes the magic link
 *   6. **Routing fork**:
 *        applications.routing_choice === 'via_branch_admin_review'
 *          → status = PENDING_BRANCH_ADMIN_REVIEW
 *        otherwise
 *          → status = PENDING_CHAIRMAN
 *   7. Emits SIGNED_BY_REFERRAL event + audit row
 */
export async function submitReferralSignatureAction(
  rawToken: string,
  values: unknown,
  signatureDataUrl: string,
): Promise<ActionResult> {
  if (!tokenInput.safeParse({ rawToken }).success) return { ok: false, error: "Bad token." };
  const auth = await authorise(rawToken);
  if (!auth.ok) return { ok: false, error: auth.error };

  const parsed = referralSignSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path.join(".");
      if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const admin = createAdminClient();
  const appId = auth.verify.application.id;
  const branchId = auth.verify.magicLink.branch_id;

  // Decode signature
  const match = signatureDataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) return { ok: false, error: "Signature is not a valid PNG." };
  const sigBytes = Buffer.from(match[1], "base64");
  if (sigBytes.byteLength > 200_000) {
    return { ok: false, error: "Signature image is too large. Try again with a simpler drawing." };
  }
  // Magic-byte check — the regex only validates the data-URL prefix.
  // Audit finding L3.
  if (!isPngBytes(sigBytes)) {
    return { ok: false, error: "Signature isn't a valid PNG image." };
  }

  const sigPath = `${appId}/referral.png`;
  const { error: uploadErr } = await admin.storage
    .from("signatures")
    .upload(sigPath, sigBytes, { contentType: "image/png", upsert: true });
  if (uploadErr) {
    return { ok: false, error: "Couldn't save the signature — try again in a minute." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;

  // Insert signature row
  const { error: sigInsertErr } = await admin.from("signatures" as never).insert({
    application_id: appId,
    branch_id: branchId,
    role: "referral",
    signer_name: parsed.data.assigned_referral_name,
    signature_png_url: sigPath,
    ip_address: ip,
    user_agent: ua,
  } as never);
  if (sigInsertErr) {
    return { ok: false, error: "Couldn't record the signature — try again in a minute." };
  }

  const now = new Date().toISOString();

  // Determine routing — use the application's routing_choice; fall back
  // to the branch default if (somehow) NULL.
  const { data: appRow } = await admin
    .from("applications" as never)
    .select("routing_choice")
    .eq("id", appId)
    .single();
  const app = appRow as { routing_choice: string | null } | null;
  let routing = app?.routing_choice ?? null;
  if (!routing) {
    const { data: brRow } = await admin
      .from("branches" as never)
      .select("default_routing_mode")
      .eq("id", branchId)
      .single();
    const br = brRow as { default_routing_mode: string | null } | null;
    routing = br?.default_routing_mode ?? "direct_to_chairman";
  }

  const nextStatus =
    routing === "via_branch_admin_review" ? "PENDING_BRANCH_ADMIN_REVIEW" : "PENDING_CHAIRMAN";

  // Consume token
  await admin
    .from("magic_links" as never)
    .update({ consumed_at: now } as never)
    .eq("id", auth.verify.magicLink.id)
    .is("consumed_at", null);

  // Update application — persist any edits + signed_at + status fork
  await admin
    .from("applications" as never)
    .update({
      assigned_referral_name: parsed.data.assigned_referral_name,
      assigned_referral_membership_no: parsed.data.assigned_referral_membership_no,
      assigned_referral_known_years: parsed.data.assigned_referral_known_years,
      referral_signed_at: now,
      status: nextStatus,
    } as never)
    .eq("id", appId);

  await writeApplicationEvent({
    applicationId: appId,
    branchId,
    eventType: "SIGNED_BY_REFERRAL",
    metadata: { routing_choice: routing, next_status: nextStatus },
  });
  await writeAuditLog({
    action: "SIGNED",
    applicationId: appId,
    branchId,
    actorRole: null,
    metadata: { role: "referral", next_status: nextStatus },
  });

  revalidatePath(`/referral/${rawToken}`);
  return { ok: true };
}
