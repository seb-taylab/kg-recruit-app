/**
 * Server-side magic-link verification.
 *
 * Token comes from the URL (`/apply/[token]` / `/referral/[token]`). We
 * hash it and look up by `token_hash`, then check:
 *   - the link is for the expected role (applicant vs referral)
 *   - it has not been consumed
 *   - it has not expired
 *
 * Returns the magic_link + parent application on success. Returns a
 * specific failure reason otherwise so the route handler can pick the
 * right friendly page (/apply/expired vs /apply/invalid).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashMagicLinkToken } from "@/lib/auth/magic-link";

export type MagicLinkRole = "applicant" | "referral" | "chairman";

export interface VerifiedMagicLink {
  id: string;
  application_id: string;
  branch_id: string;
  intended_role: MagicLinkRole;
  expires_at: string;
  consumed_at: string | null;
  link_opened_at: string | null;
}

export interface VerifiedApplication {
  id: string;
  branch_id: string;
  status: string;
  applicant_name_at_invite: string | null;
  applicant_phone: string;
  applicant_email: string | null;
}

export type VerifyResult =
  | { ok: true; magicLink: VerifiedMagicLink; application: VerifiedApplication }
  | { ok: false; reason: "not_found" | "expired" | "consumed" | "wrong_role" };

export async function verifyMagicLink(
  rawToken: string,
  expectedRole: MagicLinkRole,
): Promise<VerifyResult> {
  if (!rawToken || rawToken.length < 20) return { ok: false, reason: "not_found" };
  const tokenHash = hashMagicLinkToken(rawToken);
  const admin = createAdminClient();

  const { data: linkRow } = await admin
    .from("magic_links" as never)
    .select(
      "id, application_id, branch_id, intended_role, expires_at, consumed_at, link_opened_at",
    )
    .eq("token_hash", tokenHash)
    .single();
  const link = linkRow as VerifiedMagicLink | null;
  if (!link) return { ok: false, reason: "not_found" };
  if (link.intended_role !== expectedRole) return { ok: false, reason: "wrong_role" };
  if (link.consumed_at) return { ok: false, reason: "consumed" };
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const { data: appRow } = await admin
    .from("applications" as never)
    .select(
      "id, branch_id, status, applicant_name_at_invite, applicant_phone, applicant_email",
    )
    .eq("id", link.application_id)
    .single();
  const application = appRow as VerifiedApplication | null;
  if (!application) return { ok: false, reason: "not_found" };

  return { ok: true, magicLink: link, application };
}

/** Stamps `magic_links.link_opened_at` and writes an anonymous LINK_OPENED event. */
export async function recordLinkOpened(magicLinkId: string, applicationId: string, branchId: string): Promise<void> {
  const admin = createAdminClient();
  // Defensive predicate: the UPDATE only fires when this magic_link
  // actually belongs to the claimed application_id. Not exploitable
  // today (every caller already verified the pairing) but if this
  // helper gets reused elsewhere, mismatched arguments no-op rather
  // than stamping the wrong row. Audit finding L4.
  await admin
    .from("magic_links" as never)
    .update({ link_opened_at: new Date().toISOString() } as never)
    .eq("id", magicLinkId)
    .eq("application_id", applicationId)
    .is("link_opened_at", null);

  await admin.from("application_events" as never).insert({
    application_id: applicationId,
    branch_id: branchId,
    event_type: "LINK_OPENED",
    metadata: { source: "applicant_route" },
  } as never);
}
