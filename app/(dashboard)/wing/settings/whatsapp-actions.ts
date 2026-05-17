/**
 * Wing WhatsApp community links — create / update / delete / toggle.
 *
 * Wing-admin scoped. Granularity: each link is "main" (no scope), district-
 * scoped, or constituency-scoped. The schema CHECK constraint enforces
 * at most one scope per row.
 *
 * Constituency, when set, must match constituency_directory (FK) — the
 * editor picks from a dropdown sourced from that directory.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";

export interface ActionResult {
  ok: boolean;
  error?: string;
  linkId?: string;
}

const DISTRICTS = [
  "Central Singapore",
  "North East",
  "North West",
  "South East",
  "South West",
] as const;

const WA_URL_REGEX = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/;

const upsertSchema = z
  .object({
    id: z.string().uuid().optional(),
    label: z.string().trim().min(2, "Label is too short").max(100, "Label is too long"),
    invite_url: z
      .string()
      .trim()
      .regex(WA_URL_REGEX, "Must be a https://chat.whatsapp.com/... invite link"),
    scope: z.enum(["main", "district", "constituency"]),
    district: z.enum(DISTRICTS).optional(),
    constituency: z.string().trim().min(1).max(100).optional(),
    display_order: z.coerce.number().int().min(0).max(9999).default(100),
    notes: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine(
    (v) => v.scope !== "district" || v.district !== undefined,
    { message: "Pick a district for district-scoped links", path: ["district"] },
  )
  .refine(
    (v) => v.scope !== "constituency" || v.constituency !== undefined,
    { message: "Pick a constituency for constituency-scoped links", path: ["constituency"] },
  );

export async function upsertWhatsAppLinkAction(
  input: z.input<typeof upsertSchema>,
): Promise<ActionResult> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }
  const { id, label, invite_url, scope, district, constituency, display_order, notes } =
    parsed.data;

  const auth = await requireAuth();
  if (auth.activeProfile.role !== "wing_admin" && auth.activeProfile.role !== "taylab_staff") {
    return { ok: false, error: "Wing Admin only." };
  }
  if (!auth.activeBranch || auth.activeBranch.branch_type !== "wing") {
    return { ok: false, error: "Wing workspace only." };
  }

  const admin = createAdminClient();
  const payload = {
    wing_branch_id: auth.activeBranch.id,
    label,
    invite_url,
    // Schema CHECK enforces at most one scope. Normalise here.
    district: scope === "district" ? district : null,
    constituency: scope === "constituency" ? constituency : null,
    display_order,
    notes: notes && notes.length > 0 ? notes : null,
    is_active: true,
    updated_by_user_id: auth.userId,
  };

  if (id) {
    const { error: updErr } = await admin
      .from("wing_whatsapp_links" as never)
      .update(payload as never)
      .eq("id", id)
      .eq("wing_branch_id", auth.activeBranch.id);
    if (updErr) return { ok: false, error: updErr.message };
  } else {
    const { data: ins, error: insErr } = await admin
      .from("wing_whatsapp_links" as never)
      .insert({ ...payload, created_by_user_id: auth.userId } as never)
      .select("id")
      .single();
    if (insErr || !ins) return { ok: false, error: insErr?.message ?? "Couldn't save." };
    const row = ins as { id: string };
    await writeAuditLog({
      action: "SETTINGS_CHANGED",
      branchId: auth.activeBranch.id,
      actorId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.activeProfile.role,
      metadata: {
        scope: "wing_whatsapp_links_create",
        link_id: row.id,
        match_scope: scope,
        label,
      },
    });
    revalidatePath("/wing/settings");
    return { ok: true, linkId: row.id };
  }

  await writeAuditLog({
    action: "SETTINGS_CHANGED",
    branchId: auth.activeBranch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.activeProfile.role,
    metadata: {
      scope: "wing_whatsapp_links_update",
      link_id: id,
      match_scope: scope,
      label,
    },
  });

  revalidatePath("/wing/settings");
  return { ok: true, linkId: id };
}

const toggleSchema = z.object({ id: z.string().uuid(), active: z.boolean() });

export async function toggleWhatsAppLinkAction(
  input: z.input<typeof toggleSchema>,
): Promise<ActionResult> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };

  const auth = await requireAuth();
  if (auth.activeProfile.role !== "wing_admin" && auth.activeProfile.role !== "taylab_staff") {
    return { ok: false, error: "Wing Admin only." };
  }
  if (!auth.activeBranch || auth.activeBranch.branch_type !== "wing") {
    return { ok: false, error: "Wing workspace only." };
  }

  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from("wing_whatsapp_links" as never)
    .update({ is_active: parsed.data.active, updated_by_user_id: auth.userId } as never)
    .eq("id", parsed.data.id)
    .eq("wing_branch_id", auth.activeBranch.id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/wing/settings");
  return { ok: true };
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteWhatsAppLinkAction(
  input: z.input<typeof deleteSchema>,
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };

  const auth = await requireAuth();
  if (auth.activeProfile.role !== "wing_admin" && auth.activeProfile.role !== "taylab_staff") {
    return { ok: false, error: "Wing Admin only." };
  }
  if (!auth.activeBranch || auth.activeBranch.branch_type !== "wing") {
    return { ok: false, error: "Wing workspace only." };
  }

  const admin = createAdminClient();
  const { error: delErr } = await admin
    .from("wing_whatsapp_links" as never)
    .delete()
    .eq("id", parsed.data.id)
    .eq("wing_branch_id", auth.activeBranch.id);
  if (delErr) return { ok: false, error: delErr.message };

  await writeAuditLog({
    action: "SETTINGS_CHANGED",
    branchId: auth.activeBranch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.activeProfile.role,
    metadata: { scope: "wing_whatsapp_links_delete", link_id: parsed.data.id },
  });

  revalidatePath("/wing/settings");
  return { ok: true };
}
