/**
 * Constituency directory — taylab editor actions.
 *
 * Lets taylab_staff update the district + verification status of each
 * constituency. Used to correct seed-data guesses + add new constituencies
 * after boundary changes.
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
}

const updateSchema = z.object({
  constituency: z.string().trim().min(2).max(100),
  district: z
    .enum(["Central", "East Coast", "North East", "North West", "West Coast"])
    .nullable(),
  verificationStatus: z.enum(["seed", "verified", "manual"]).optional(),
});

export async function updateConstituencyDirectoryAction(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }

  const auth = await requireAuth();
  if (auth.activeProfile.role !== "taylab_staff") {
    return { ok: false, error: "Taylab staff only." };
  }

  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from("constituency_directory" as never)
    .update({
      district: parsed.data.district,
      // Default to 'verified' on any taylab edit unless explicitly set.
      verification_status: parsed.data.verificationStatus ?? "verified",
      updated_at: new Date().toISOString(),
      updated_by_user_id: auth.userId,
    } as never)
    .eq("constituency", parsed.data.constituency);
  if (updErr) return { ok: false, error: updErr.message };

  await writeAuditLog({
    action: "SETTINGS_CHANGED",
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.activeProfile.role,
    metadata: {
      scope: "constituency_directory",
      constituency: parsed.data.constituency,
      district: parsed.data.district,
      verification_status: parsed.data.verificationStatus ?? "verified",
    },
  });

  revalidatePath("/taylab/directory");
  return { ok: true };
}

const createSchema = z.object({
  constituency: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(100)
    .regex(/^[A-Z0-9 \-,'.]+$/, "Use uppercase letters, digits, hyphens, commas, periods"),
  constituency_type: z.enum(["GRC", "SMC"]),
  district: z
    .enum(["Central", "East Coast", "North East", "North West", "West Coast"])
    .nullable(),
});

export async function addConstituencyAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }

  const auth = await requireAuth();
  if (auth.activeProfile.role !== "taylab_staff") {
    return { ok: false, error: "Taylab staff only." };
  }

  const admin = createAdminClient();
  const { error: insErr } = await admin
    .from("constituency_directory" as never)
    .insert({
      constituency: parsed.data.constituency,
      constituency_type: parsed.data.constituency_type,
      district: parsed.data.district,
      verification_status: "manual",
      updated_by_user_id: auth.userId,
    } as never);
  if (insErr) {
    if (insErr.message.toLowerCase().includes("duplicate")) {
      return { ok: false, error: "That constituency already exists in the directory." };
    }
    return { ok: false, error: insErr.message };
  }

  await writeAuditLog({
    action: "SETTINGS_CHANGED",
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.activeProfile.role,
    metadata: {
      scope: "constituency_directory_add",
      constituency: parsed.data.constituency,
      type: parsed.data.constituency_type,
      district: parsed.data.district,
    },
  });

  revalidatePath("/taylab/directory");
  return { ok: true };
}
