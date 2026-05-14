/**
 * Service-role Supabase client. Bypasses RLS. Use ONLY in route handlers /
 * server actions that need cross-tenant privileged operations (Taylab Staff
 * bootstrap, NRIC purge job, magic-link consumption). Never import in a
 * client component or in code shipped to the browser.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    },
  );
}
