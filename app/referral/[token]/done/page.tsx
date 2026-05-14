import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { verifyMagicLink } from "@/lib/auth/magic-link-verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashMagicLinkToken } from "@/lib/auth/magic-link";
import { MobileFormShell } from "@/components/applicant/MobileFormShell";

export const dynamic = "force-dynamic";

/**
 * Referral confirmation screen. Accepts only `consumed` tokens (success).
 * If the link is still valid → back to the wizard.
 */
export default async function ReferralDonePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;
  const verify = await verifyMagicLink(rawToken, "referral");

  if (verify.ok) redirect(`/referral/${rawToken}`);
  if (verify.reason !== "consumed") redirect("/apply/invalid");

  const admin = createAdminClient();
  const { data: linkRow } = await admin
    .from("magic_links" as never)
    .select("application_id, branch_id")
    .eq("token_hash", hashMagicLinkToken(rawToken))
    .single();
  const link = linkRow as { application_id: string; branch_id: string } | null;
  if (!link) redirect("/apply/invalid");

  const { data: branchRow } = await admin
    .from("branches" as never)
    .select("name")
    .eq("id", link.branch_id)
    .single();
  const branchName = (branchRow as { name: string } | null)?.name ?? "Kampong Glam";

  const { data: appRow } = await admin
    .from("applications" as never)
    .select("applicant_name_at_invite, surname, given_names, assigned_referral_name")
    .eq("id", link.application_id)
    .single();
  const app = appRow as
    | {
        applicant_name_at_invite: string | null;
        surname: string | null;
        given_names: string | null;
        assigned_referral_name: string | null;
      }
    | null;
  const applicantDisplay =
    (app?.given_names && app?.surname
      ? `${app.given_names} ${app.surname}`
      : app?.applicant_name_at_invite) ?? "the applicant";
  const referralName = app?.assigned_referral_name ?? "there";

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
            <CardTitle>Thanks, {referralName}.</CardTitle>
            <CardDescription>
              Your signature has been recorded for {applicantDisplay}&rsquo;s application.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-text-secondary">
            <p>You don&rsquo;t need to do anything else.</p>
            <p className="mt-3">
              The branch will route the application to the Chairman for final signature. Thanks
              for vouching.
            </p>
          </CardContent>
        </Card>
      </section>
    </MobileFormShell>
  );
}
