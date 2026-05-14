"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email("That doesn't look like a valid email — check the @ and the domain"),
});

export interface ForgotState {
  ok?: boolean;
  error?: string;
  fieldError?: string;
}

export async function requestReset(
  _prev: ForgotState | undefined,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldError: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const headerStore = await headers();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `https://${headerStore.get("host") ?? "kg.taylab.com"}`;

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
  });

  if (error) {
    return { error: "Couldn't send the email — check the address and try again." };
  }
  return { ok: true };
}
