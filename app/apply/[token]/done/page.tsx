import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { verifyMagicLink } from "@/lib/auth/magic-link-verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { MobileFormShell } from "@/components/applicant/MobileFormShell";

export const dynamic = "force-dynamic";

/**
 * Applicant confirmation screen — terminal state of the magic-link journey.
 *
 * The link is single-use, so by the time the applicant reaches `/done` it is
 * `consumed_at != null`. We accept the consumed token here as proof of "yes,
 * this applicant just submitted" so we can show them the success card with
 * their name. Refreshing or sharing the URL still returns the same friendly
 * page (no sensitive data on it).
 */
export default async function ApplicantDonePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;

  const verify = await verifyMagicLink(rawToken, "applicant");
  // We expect `consumed` — that's the success case here. Any other reason
  // (not_found, expired, wrong_role) → bounce to invalid.
  let applicationId: string | null = null;
  let branchId: string | null = null;
  if (verify.ok) {
    // The applicant arrived here BEFORE the submit completed. Send them back
    // to the wizard.
    redirect(`/apply/${rawToken}`);
  } else if (verify.reason !== "consumed") {
    redirect("/apply/invalid");
  } else {
    // Look up by hash again to get application + branch (verifyMagicLink
    // returns ok:false without details for the consumed case).
    const { hashMagicLinkToken } = await import("@/lib/auth/magic-link");
    const admin = createAdminClient();
    const { data } = await admin
      .from("magic_links" as never)
      .select("application_id, branch_id")
      .eq("token_hash", hashMagicLinkToken(rawToken))
      .single();
    const row = data as { application_id: string; branch_id: string } | null;
    if (!row) redirect("/apply/invalid");
    applicationId = row.application_id;
    branchId = row.branch_id;
  }

  const admin = createAdminClient();
  const { data: branchRow } = await admin
    .from("branches" as never)
    .select("name")
    .eq("id", branchId!)
    .single();
  const branchName = (branchRow as { name: string } | null)?.name ?? "Kampong Glam";

  const { data: appRow } = await admin
    .from("applications" as never)
    .select("applicant_name_at_invite, surname, given_names")
    .eq("id", applicationId!)
    .single();
  const app = appRow as
    | { applicant_name_at_invite: string | null; surname: string | null; given_names: string | null }
    | null;
  const displayName =
    (app?.given_names && app?.surname
      ? `${app.given_names} ${app.surname}`
      : app?.applicant_name_at_invite) ?? "there";

  return (
    <MobileFormShell branchName={branchName}>
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
        <Card>
          <CardHeader className="items-center text-center">
            <CheckCircle2
              className="h-12 w-12 text-state-success"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <CardTitle>Thanks, {displayName}.</CardTitle>
            <CardDescription>
              Your application is now with the branch for processing.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-text-secondary">
            <p>You don&rsquo;t need to do anything else right now.</p>
            <p className="mt-3">
              The branch admin team will assign a referral and route your application to the
              Branch Chairman for final signature. If they need anything from you, they&rsquo;ll
              reach out using the phone number you provided.
            </p>
          </CardContent>
        </Card>
      </section>
    </MobileFormShell>
  );
}
