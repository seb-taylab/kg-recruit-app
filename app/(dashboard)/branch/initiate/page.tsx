import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/get-user";
import { isBranchAdminTeam } from "@/types/database";
import { InviteForm } from "@/components/invite/InviteForm";

export default async function InitiatePage() {
  const auth = await requireAuth();
  if (!auth.branch || !isBranchAdminTeam(auth.profile.role)) {
    redirect("/branch");
  }

  // HQ-email-missing prompt removed from this surface per 2026-05-18
  // direction — inviting an applicant doesn't depend on the HQ email,
  // and the warning was noise at the action moment. The prompt still
  // appears on /branch/ready-to-send where the missing email genuinely
  // blocks the next action.

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          Invite a new applicant
        </h1>
        <p className="text-text-secondary">
          Capture their details. We&rsquo;ll generate a single-use link you can share by email,
          copy, or WhatsApp.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Applicant details</CardTitle>
          <CardDescription>Name and mobile are required. Email is optional.</CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm />
        </CardContent>
      </Card>
    </div>
  );
}
