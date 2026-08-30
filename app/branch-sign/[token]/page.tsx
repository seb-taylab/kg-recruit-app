import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { verifyMagicLink, recordLinkOpened } from "@/lib/auth/magic-link-verify";
import { ChairmanSignForm } from "@/components/branch/ChairmanSignForm";
import { ChairmanReviewCards } from "@/components/branch/ChairmanReviewCards";
import {
  loadChairmanReview,
  chairmanReviewDisplayName,
} from "@/lib/applications/chairman-review";

export const dynamic = "force-dynamic";

/**
 * Passwordless Chairman signing route. The chairman opens this from a
 * WhatsApp / email link — no login required. Authorization is possession of
 * a valid `chairman` magic-link token; the same review the dashboard shows
 * is rendered here, then a token-mode sign form.
 */
export default async function ChairmanTokenSignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;
  const verify = await verifyMagicLink(rawToken, "chairman");

  if (!verify.ok) {
    if (verify.reason === "expired") redirect("/apply/expired");
    // A consumed link means the application was already signed — show a
    // reassuring message rather than a scary "invalid".
    if (verify.reason === "consumed") {
      return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
          <h1 className="text-3xl font-bold leading-tight text-text-primary">
            Already signed
          </h1>
          <Alert variant="info">
            <AlertDescription>
              This application has already been signed. There&rsquo;s nothing more to
              do — thank you.
            </AlertDescription>
          </Alert>
        </div>
      );
    }
    redirect("/apply/invalid");
  }

  const { magicLink, application } = verify;

  if (!magicLink.link_opened_at) {
    await recordLinkOpened(magicLink.id, application.id, magicLink.branch_id);
  }

  const review = await loadChairmanReview(application.id);
  if (!review) redirect("/apply/invalid");
  const { app, applicantPhotoSignedUrl, signedSignatures } = review;

  // Status gate — the link is only actionable while awaiting the chairman.
  if (app.status !== "PENDING_CHAIRMAN") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          Nothing to sign right now
        </h1>
        <Alert variant="warning">
          <AlertDescription>
            This application is in state <strong>{app.status}</strong> and isn&rsquo;t
            waiting for a Chairman signature. If you think this is a mistake, contact
            your Branch Admin.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const applicantDisplay = chairmanReviewDisplayName(app);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <ChairmanReviewCards
        app={app}
        applicantPhotoSignedUrl={applicantPhotoSignedUrl}
        signedSignatures={signedSignatures}
        applicantDisplay={applicantDisplay}
      />
      <ChairmanSignForm
        applicationId={app.id}
        applicantDisplayName={applicantDisplay}
        defaultNameOnForm={app.chairman_name_on_form ?? ""}
        token={rawToken}
      />
    </div>
  );
}
