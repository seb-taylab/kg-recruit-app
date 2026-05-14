/**
 * NRIC scan download (Step 10) — short-lived signed URLs for the Branch
 * Admin Team. Scans are silently auto-purged 24h after SENT_TO_HQ, so this
 * surface is only useful in that window. Chairman role is intentionally
 * excluded (PRD: NRIC masked except admin detail).
 */
"use server";

import { z } from "zod";
import { requireAuth, PermissionError } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBranchAdminTeam } from "@/types/database";

const idSchema = z.object({ applicationId: z.string().uuid() });

export interface NricDownloadResult {
  ok: boolean;
  frontUrl?: string;
  backUrl?: string;
  error?: string;
}

/**
 * Returns 10-minute signed URLs for the front + back NRIC scans, or
 * `ok:false` with a reason if there's nothing to download (no scans, or
 * purged). Caller renders the URLs as <a download> links.
 */
export async function getNricDownloadUrlsAction(
  input: z.input<typeof idSchema>,
): Promise<NricDownloadResult> {
  const parsed = idSchema.safeParse(input);
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

  const admin = createAdminClient();

  const { data: appRow } = await admin
    .from("applications" as never)
    .select("id, branch_id, nric_purged_at")
    .eq("id", parsed.data.applicationId)
    .single();
  const app = appRow as
    | { id: string; branch_id: string; nric_purged_at: string | null }
    | null;
  if (!app || app.branch_id !== auth.branch.id) {
    return { ok: false, error: "Application not found." };
  }
  if (app.nric_purged_at) {
    return { ok: false, error: "NRIC scans were purged after the 24h window." };
  }

  const { data: scanRow } = await admin
    .from("nric_uploads" as never)
    .select("front_url, back_url")
    .eq("application_id", parsed.data.applicationId)
    .single();
  const scan = scanRow as { front_url: string | null; back_url: string | null } | null;
  if (!scan || !scan.front_url || !scan.back_url) {
    return { ok: false, error: "No NRIC scans on file." };
  }

  const ttlSeconds = 60 * 10;
  const [frontRes, backRes] = await Promise.all([
    admin.storage.from("nric-uploads").createSignedUrl(scan.front_url, ttlSeconds),
    admin.storage.from("nric-uploads").createSignedUrl(scan.back_url, ttlSeconds),
  ]);
  if (frontRes.error || backRes.error || !frontRes.data || !backRes.data) {
    return { ok: false, error: "Couldn't create download URLs — try again in a minute." };
  }

  return {
    ok: true,
    frontUrl: frontRes.data.signedUrl,
    backUrl: backRes.data.signedUrl,
  };
}
