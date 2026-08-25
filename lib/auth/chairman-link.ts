/**
 * Mint a passwordless Chairman sign link for an application.
 *
 * Shared by every surface that hands the chairman a sign link — the
 * "Nudge the Chairman" card (Copy / Share to WhatsApp) and the manual
 * email reminder — so they all issue the same kind of token and the same
 * URL shape.
 *
 * The raw token is returned to the caller (an authenticated branch admin)
 * so it can be shared; only its SHA-256 hash is stored. Any earlier
 * un-consumed chairman link for the same application is expired first, so
 * at most one chairman link is ever live per application.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateMagicLinkToken,
  hashMagicLinkToken,
  ttlToExpiry,
  buildChairmanUrl,
} from "@/lib/auth/magic-link";
import { getEffectiveSettings } from "@/lib/settings/resolve";

export interface MintedChairmanLink {
  rawToken: string;
  url: string;
  magicLinkId: string;
}

/**
 * Create a fresh chairman magic link for `applicationId` on `branchId`.
 * Caller must have already authorized the actor and confirmed the
 * application is in PENDING_CHAIRMAN on that branch.
 */
export async function mintChairmanSignToken(
  applicationId: string,
  branchId: string,
  generatedById: string | null,
): Promise<MintedChairmanLink | null> {
  const admin = createAdminClient();

  // Retire any earlier un-consumed chairman link so only the latest works.
  const nowIso = new Date().toISOString();
  await admin
    .from("magic_links" as never)
    .update({ expires_at: nowIso } as never)
    .eq("application_id", applicationId)
    .eq("intended_role", "chairman")
    .is("consumed_at", null);

  const settings = await getEffectiveSettings(branchId);
  const rawToken = generateMagicLinkToken();
  const tokenHash = hashMagicLinkToken(rawToken);
  const expiresAt = ttlToExpiry(settings.inviteTtlHours);

  const { data: inserted, error } = await admin
    .from("magic_links" as never)
    .insert({
      application_id: applicationId,
      branch_id: branchId,
      token_hash: tokenHash,
      intended_role: "chairman",
      expires_at: expiresAt,
      generated_by_id: generatedById,
    } as never)
    .select("id")
    .single();
  const row = inserted as { id: string } | null;
  if (error || !row) return null;

  return {
    rawToken,
    url: buildChairmanUrl(rawToken),
    magicLinkId: row.id,
  };
}
