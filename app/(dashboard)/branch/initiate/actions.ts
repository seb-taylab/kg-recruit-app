"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth, PermissionError } from "@/lib/auth/permissions";
import { isBranchAdminTeam } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/format/phone";
import {
  generateMagicLinkToken,
  hashMagicLinkToken,
  ttlToExpiry,
} from "@/lib/auth/magic-link";
import { getEffectiveSettings } from "@/lib/settings/resolve";
import { writeAuditLog, writeApplicationEvent } from "@/lib/audit/log";
import { inviteFormSchema } from "@/lib/validation/invite";

export interface CreateInviteState {
  error?: string;
  fieldErrors?: Partial<Record<"applicantName" | "applicantPhone" | "applicantEmail", string>>;
}

export async function createInviteAction(
  _prev: CreateInviteState | undefined,
  formData: FormData,
): Promise<CreateInviteState> {
  // 1. Validate input
  const parsed = inviteFormSchema.safeParse({
    applicantName: formData.get("applicantName"),
    applicantPhone: formData.get("applicantPhone"),
    applicantEmail: formData.get("applicantEmail"),
  });
  if (!parsed.success) {
    const fieldErrors: CreateInviteState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0];
      if (k === "applicantName" || k === "applicantPhone" || k === "applicantEmail") {
        fieldErrors[k] = issue.message;
      }
    }
    return { fieldErrors };
  }

  // 2. Convert phone to E.164 (canonical storage)
  const e164 = toE164(parsed.data.applicantPhone, "SG");
  if (!e164) {
    return { fieldErrors: { applicantPhone: "Phone should be 8 digits, starting with 8 or 9" } };
  }

  // 3. Authorise: must be on the Branch Admin Team for the actor's own
  // branch. No client-supplied branch id — we always use the actor's.
  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { error: err.message };
    throw err;
  }
  if (!auth.branch || !isBranchAdminTeam(auth.profile.role)) {
    return { error: "Branch admin team only." };
  }
  const branchId = auth.branch.id;
  const settings = await getEffectiveSettings(branchId);

  // 4. Mint token + hash
  const rawToken = generateMagicLinkToken();
  const tokenHash = hashMagicLinkToken(rawToken);
  const expiresAt = ttlToExpiry(settings.inviteTtlHours);
  const now = new Date().toISOString();

  // 5. Create application + magic_links row using the admin client.
  // We use service role so the row inserts can satisfy RLS, then re-check
  // ownership on every subsequent read via the user client.
  const admin = createAdminClient();
  const { data: inserted, error: insertErr } = await admin
    .from("applications" as never)
    .insert({
      status: "APPLICANT_INVITED",
      branch_id: branchId,
      invited_by_admin_id: auth.userId,
      applicant_name_at_invite: parsed.data.applicantName,
      applicant_phone: e164,
      applicant_email: parsed.data.applicantEmail ?? null,
      applicant_invited_at: now,
      invite_delivery_channels: [],
    } as never)
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return { error: "Couldn't create the application — try again in a minute." };
  }
  const applicationId = (inserted as { id: string }).id;

  const { error: linkErr } = await admin.from("magic_links" as never).insert({
    application_id: applicationId,
    branch_id: branchId,
    token_hash: tokenHash,
    intended_role: "applicant",
    expires_at: expiresAt,
    generated_by_id: auth.userId,
  } as never);
  if (linkErr) {
    return { error: "Couldn't generate the link — try again in a minute." };
  }

  await writeAuditLog({
    action: "INVITED",
    applicationId,
    branchId,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { ttl_hours: settings.inviteTtlHours },
  });
  await writeApplicationEvent({
    applicationId,
    branchId,
    eventType: "INVITED",
    actorId: auth.userId,
    actorRole: auth.profile.role,
    metadata: { delivery_channels: [] },
  });

  // 6. Hand off to the application detail page, which renders the
  // DeliveryPanel. Raw token is passed via short-lived URL param so the
  // Branch Admin can copy/email/WhatsApp-share it from one screen — it is
  // never persisted in plaintext.
  revalidatePath("/branch");
  redirect(`/branch/applications/${applicationId}?token=${encodeURIComponent(rawToken)}`);
}
