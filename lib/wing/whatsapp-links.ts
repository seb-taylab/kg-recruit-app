/**
 * WhatsApp community link matching for the capture confirmation flow.
 *
 * Given a wing and a lead's postal code, returns the active links the lead
 * should see on the thank-you panel. Three tiers:
 *   1. Main links (district NULL AND constituency NULL) — always shown
 *   2. District-scoped — shown if the lead's postal resolves to that district
 *   3. Constituency-scoped — shown if the lead's postal resolves to that constituency
 *
 * All three tiers can co-exist for the same lead (e.g. main + district +
 * constituency-specific). Output is ordered by display_order ascending,
 * then by created_at — main usually first because admin sets display_order
 * = 0 or 1 for it.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { suggestBranchFromPostal } from "@/lib/wing/postal-suggest";
import type { WingWhatsAppLink } from "@/types/database";

export interface MatchedWhatsAppLink {
  id: string;
  label: string;
  invite_url: string;
  /** How this link matched the lead. UI labels chips accordingly. */
  match_tier: "main" | "district" | "constituency";
  display_order: number;
}

export async function matchWhatsAppLinksForLead(opts: {
  wingBranchId: string;
  postalCode: string | null;
}): Promise<MatchedWhatsAppLink[]> {
  const admin = createAdminClient();

  // 1. Pull all active links for this wing. Volume is small (a wing has ~5-10
  //    links max) — filter in-memory to avoid a 3-way OR query.
  const { data: rows } = await admin
    .from("wing_whatsapp_links" as never)
    .select("id, label, invite_url, district, constituency, display_order")
    .eq("wing_branch_id", opts.wingBranchId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  const links = (rows as Array<
    Pick<
      WingWhatsAppLink,
      "id" | "label" | "invite_url" | "district" | "constituency" | "display_order"
    >
  > | null) ?? [];
  if (links.length === 0) return [];

  // 2. Resolve postal → constituency → district. If postal is missing or
  //    doesn't resolve, only the "main" tier (no scope) is matched — the
  //    lead still gets the always-shown links.
  const suggestion = opts.postalCode
    ? await suggestBranchFromPostal(opts.postalCode)
    : null;
  const district = suggestion?.district ?? null;
  const constituency = suggestion?.constituency ?? null;

  // 3. Filter + tag each match. Order preserved from query (display_order ASC).
  const out: MatchedWhatsAppLink[] = [];
  for (const link of links) {
    if (link.district === null && link.constituency === null) {
      out.push({
        id: link.id,
        label: link.label,
        invite_url: link.invite_url,
        match_tier: "main",
        display_order: link.display_order,
      });
    } else if (link.constituency !== null && constituency !== null && link.constituency === constituency) {
      out.push({
        id: link.id,
        label: link.label,
        invite_url: link.invite_url,
        match_tier: "constituency",
        display_order: link.display_order,
      });
    } else if (link.district !== null && district !== null && link.district === district) {
      out.push({
        id: link.id,
        label: link.label,
        invite_url: link.invite_url,
        match_tier: "district",
        display_order: link.display_order,
      });
    }
  }
  return out;
}
