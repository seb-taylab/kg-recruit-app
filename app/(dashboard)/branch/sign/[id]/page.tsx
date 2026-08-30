import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAuth } from "@/lib/auth/get-user";
import { ChairmanSignForm } from "@/components/branch/ChairmanSignForm";
import { ChairmanReviewCards } from "@/components/branch/ChairmanReviewCards";
import {
  loadChairmanReview,
  chairmanReviewDisplayName,
} from "@/lib/applications/chairman-review";

export const dynamic = "force-dynamic";

export default async function ChairmanSignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireAuth();
  const { id } = await params;
  if (!auth.branch) {
    redirect("/branch");
  }
  // Chairman-only signing surface. Admin team members who hit this link
  // (e.g. they were testing the "Copy link" share button) see a clear
  // explanation instead of a silent redirect to the dashboard.
  if (auth.profile.role !== "branch_chairman") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold leading-tight text-text-primary">
            This link is for the Branch Chairman
          </h1>
          <p className="text-text-secondary">
            You&rsquo;re signed in as{" "}
            <span className="font-medium text-text-primary">
              {auth.profile.full_name ?? auth.email}
            </span>
            . Only the Branch Chairman can open the signing page.
          </p>
        </header>
        <Alert variant="info">
          <AlertDescription>
            To send the Chairman a link they can sign from without logging in, open
            the application&rsquo;s detail page and use{" "}
            <span className="font-medium">Nudge the Chairman → Share to WhatsApp</span>.
          </AlertDescription>
        </Alert>
        <Card>
          <CardHeader>
            <CardTitle>Open this application</CardTitle>
            <CardDescription>View it from the detail page.</CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href={`/branch/applications/${id}`}
              className="font-medium text-brand-blue hover:underline"
            >
              Go to application detail
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const review = await loadChairmanReview(id);
  if (!review || review.app.branch_id !== auth.branch.id) notFound();
  const { app, applicantPhotoSignedUrl, signedSignatures } = review;

  // Hard-gate: only PENDING_CHAIRMAN can be signed here. Earlier states
  // would short-circuit the state machine.
  if (app.status !== "PENDING_CHAIRMAN") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold leading-tight text-text-primary">
            Not ready for your signature
          </h1>
        </header>
        <Alert variant="warning">
          <AlertDescription>
            This application is in state <strong>{app.status}</strong>. It can only be signed when
            it&rsquo;s in PENDING_CHAIRMAN.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const applicantDisplay = chairmanReviewDisplayName(app);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <ChairmanReviewCards
        app={app}
        applicantPhotoSignedUrl={applicantPhotoSignedUrl}
        signedSignatures={signedSignatures}
        applicantDisplay={applicantDisplay}
      />
      <ChairmanSignForm
        applicationId={app.id}
        applicantDisplayName={applicantDisplay}
        defaultNameOnForm={app.chairman_name_on_form ?? auth.profile.full_name ?? ""}
      />
    </div>
  );
}
