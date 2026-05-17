/**
 * Wing events — create + activate-toggle. Wing-admin scoped.
 *
 * Events are the source of leads. A wing admin creates an event (e.g. YP40)
 * with a unique slug; the slug becomes the capture URL the booth tablet
 * opens (/capture/<slug>). Activation flag lets the wing close capture
 * after the event ends.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { isWingRole } from "@/types/database";

export interface ActionResult {
  ok: boolean;
  error?: string;
  eventId?: string;
}

// Slug rules: lowercase letters, digits, single hyphens between segments.
// Same shape as constituency slugs elsewhere — keeps URLs predictable.
const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const createSchema = z.object({
  name: z.string().trim().min(2, "Event name is too short").max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Slug is too short")
    .max(50, "Slug is too long")
    .regex(SLUG_REGEX, "Use lowercase letters, digits, and hyphens only"),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date").optional().or(z.literal("")),
  location: z.string().trim().max(100).optional().or(z.literal("")),
});

export async function createEventAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }
  const { name, slug, eventDate, location } = parsed.data;

  const auth = await requireAuth();
  // Only wing_admin (operational) creates events. wing_chairman is oversight.
  if (auth.profile.role !== "wing_admin" && auth.profile.role !== "taylab_staff") {
    return { ok: false, error: "Wing Admin only." };
  }
  if (!auth.branch) {
    return { ok: false, error: "No branch context." };
  }
  // Defensive: the DB trigger also enforces this, but check here so we
  // return a friendlier error than the trigger's SQLSTATE bubble-up.
  if (auth.profile.role === "wing_admin" && auth.branch.branch_type !== "wing") {
    return { ok: false, error: "Events can only be created from a wing branch." };
  }

  const admin = createAdminClient();
  const { data: inserted, error: insErr } = await admin
    .from("events" as never)
    .insert({
      branch_id: auth.branch.id,
      name,
      slug,
      event_date: eventDate && eventDate.length > 0 ? eventDate : null,
      location: location && location.length > 0 ? location : null,
      is_active: true,
      created_by_id: auth.userId,
    } as never)
    .select("id")
    .single();
  const row = inserted as { id: string } | null;
  if (insErr || !row) {
    // Most likely cause: slug collision within the wing (unique constraint).
    if (insErr?.message?.toLowerCase().includes("duplicate")) {
      return { ok: false, error: "An event with this slug already exists in your wing." };
    }
    return { ok: false, error: insErr?.message ?? "Couldn't create the event." };
  }

  await writeAuditLog({
    action: "EVENT_CREATED",
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { event_id: row.id, name, slug, event_date: eventDate ?? null },
  });

  revalidatePath("/wing/events");
  return { ok: true, eventId: row.id };
}

const toggleSchema = z.object({ eventId: z.string().uuid(), active: z.boolean() });

export async function setEventActiveAction(
  input: z.input<typeof toggleSchema>,
): Promise<ActionResult> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };

  const auth = await requireAuth();
  if (auth.profile.role !== "wing_admin" && auth.profile.role !== "taylab_staff") {
    return { ok: false, error: "Wing Admin only." };
  }

  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from("events" as never)
    .update({ is_active: parsed.data.active } as never)
    .eq("id", parsed.data.eventId);
  if (updErr) return { ok: false, error: updErr.message };

  await writeAuditLog({
    action: "EVENT_TOGGLED",
    branchId: auth.branch?.id ?? null,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { event_id: parsed.data.eventId, new_active: parsed.data.active },
  });

  revalidatePath("/wing/events");
  return { ok: true };
}
