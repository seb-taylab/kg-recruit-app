"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email("That doesn't look like a valid email — check the @ and the domain"),
  password: z.string().min(1, "Password is required"),
  next: z.string().optional(),
});

export interface SignInState {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
}

export async function signIn(_prev: SignInState | undefined, formData: FormData): Promise<SignInState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: SignInState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "email" || key === "password") fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { error: "Couldn't sign in — check your email and password and try again." };
  }

  // Look up the role to pick the right destination.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .single();
  const profile = profileRow as { role: string; is_active: boolean } | null;

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: "This account has been deactivated. Contact your branch coordinator." };
  }

  const fallback = profile.role === "taylab_staff" ? "/taylab" : "/branch";
  const next = parsed.data.next?.startsWith("/") ? parsed.data.next : fallback;
  redirect(next);
}
