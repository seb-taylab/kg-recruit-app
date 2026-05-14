import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireAuth } from "@/lib/auth/get-user";
import { isBranchAdminTeam } from "@/types/database";
import { InviteForm } from "@/components/invite/InviteForm";

export default async function InitiatePage() {
  const auth = await requireAuth();
  if (!auth.branch || !isBranchAdminTeam(auth.profile.role)) {
    redirect("/branch");
  }
  const hqEmailMissing = !auth.branch.hq_email;

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

      {hqEmailMissing && (
        <Alert variant="warning">
          <AlertTitle>Set HQ email in Branch Settings</AlertTitle>
          <AlertDescription>
            You can still invite applicants now, but the HQ email is required before you can send
            the final PDF.
          </AlertDescription>
        </Alert>
      )}

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
