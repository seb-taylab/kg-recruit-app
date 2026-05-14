import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireAuth } from "@/lib/auth/get-user";
import { isBranchAdminTeam, isBranchRole } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { formatDateDDMMMYYYY } from "@/lib/format/date";
import { formatPhoneDisplay, maskPhone } from "@/lib/format/phone";
import { buildApplicantUrl, buildReferralUrl } from "@/lib/auth/magic-link";
import { buildInviteMessage, buildWhatsAppUrl } from "@/lib/invite/whatsapp";
import { DeliveryPanel } from "@/components/invite/DeliveryPanel";
import { ReferralDeliveryPanel } from "@/components/branch/ReferralDeliveryPanel";
import { AssignReferralForm } from "@/components/branch/AssignReferralForm";
import { ForwardToChairmanButton } from "@/components/branch/ForwardToChairmanButton";
import { DownloadStoredPdfButton, PreviewPdfButton } from "@/components/branch/PdfButtons";
import { HqOutcomeForm } from "@/components/branch/HqOutcomeForm";
import { ReverseHqOutcomeButton } from "@/components/branch/ReverseHqOutcomeButton";
import { NricScansCard } from "@/components/branch/NricScansCard";
import { nricRequired } from "@/lib/validation/applicant-form";
import { ArchiveButton } from "@/components/branch/ArchiveButton";
import { UnarchiveButton } from "@/components/branch/UnarchiveButton";
import { ExtendTtlButton } from "@/components/branch/ExtendTtlButton";
import { ReplacePhotoCard } from "@/components/branch/ReplacePhotoCard";
import { ChairmanReminderCard } from "@/components/branch/ChairmanReminderCard";
import { MarkSentWithoutEmailButton } from "@/components/branch/MarkSentWithoutEmailButton";
import { createAdminClient } from "@/lib/supabase/admin";
import { applicantPhotoUrl, isCloudinaryPublicId } from "@/lib/cloudinary/client";
import {
  LinkHistory,
  type LinkDeliveryRow,
} from "@/components/invite/LinkHistory";

function ttlDaysUntil(expiresAt: string): number {
  return Math.max(
    1,
    Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
}

interface ApplicationRow {
  id: string;
  branch_id: string;
  status: string;
  applicant_name_at_invite: string | null;
  applicant_phone: string;
  applicant_email: string | null;
  applicant_invited_at: string | null;
  invite_delivery_channels: string[] | null;
  assigned_referral_name: string | null;
  assigned_referral_phone: string | null;
  assigned_referral_email: string | null;
  routing_choice: string | null;
  hq_pdf_url: string | null;
  sent_to_hq_at: string | null;
  hq_outcome_recorded_at: string | null;
  hq_approved_date: string | null;
  hq_approved_membership_no: string | null;
  hq_approved_notes: string | null;
  hq_rejected_date: string | null;
  hq_rejected_reason: string | null;
  hq_rejected_reason_details: string | null;
  place_of_birth: string | null;
  nric_purged_at: string | null;
  archived_at: string | null;
  archive_reason: string | null;
  pre_archive_status: string | null;
  applicant_photo_url: string | null;
}

interface MagicLinkRow {
  id: string;
  expires_at: string;
  consumed_at: string | null;
  intended_role: "applicant" | "referral";
}

interface DeliveryQueryRow {
  id: string;
  channel: LinkDeliveryRow["channel"];
  delivered_at: string;
  profiles: { full_name: string | null } | null;
}

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const auth = await requireAuth();
  if (!auth.branch || !isBranchRole(auth.profile.role)) {
    redirect("/branch");
  }
  // Admin team gets actions (Archive / Replace photo / Forward to chairman /
  // HQ outcome / etc.). Chairman gets read-only — they review here before
  // signing on /branch/sign/[id].
  const isAdminTeam = isBranchAdminTeam(auth.profile.role);
  const { id } = await params;
  const { token: rawToken } = await searchParams;

  const supabase = await createClient();
  const { data: appRow } = await supabase
    .from("applications")
    .select(
      "id, branch_id, status, applicant_name_at_invite, applicant_phone, applicant_email, applicant_invited_at, invite_delivery_channels, assigned_referral_name, assigned_referral_phone, assigned_referral_email, routing_choice, hq_pdf_url, sent_to_hq_at, hq_outcome_recorded_at, hq_approved_date, hq_approved_membership_no, hq_approved_notes, hq_rejected_date, hq_rejected_reason, hq_rejected_reason_details, place_of_birth, nric_purged_at, archived_at, archive_reason, pre_archive_status, applicant_photo_url",
    )
    .eq("id", id)
    .single();
  const app = appRow as ApplicationRow | null;
  if (!app || app.branch_id !== auth.branch.id) notFound();

  // The "active" magic link is the latest one for the current journey role.
  // PENDING_REFERRAL_ASSIGNMENT has no active link until the admin submits
  // the form below. REFERRAL_INVITED + SIGNED_BY_REFERRAL keep showing the
  // referral link history.
  const activeRole: "applicant" | "referral" =
    app.status === "REFERRAL_INVITED" || app.status === "SIGNED_BY_REFERRAL"
      ? "referral"
      : "applicant";

  const { data: linkRow } = await supabase
    .from("magic_links")
    .select("id, expires_at, consumed_at, intended_role")
    .eq("application_id", id)
    .eq("intended_role", activeRole)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const link = linkRow as MagicLinkRow | null;

  const { data: deliveryRows } = await supabase
    .from("link_deliveries")
    .select("id, channel, delivered_at, profiles:delivered_by_id(full_name)")
    .eq("magic_link_id", link?.id ?? "00000000-0000-0000-0000-000000000000")
    .order("delivered_at", { ascending: false });
  const deliveries: LinkDeliveryRow[] = ((deliveryRows as DeliveryQueryRow[] | null) ?? []).map(
    (d) => ({
      id: d.id,
      channel: d.channel,
      delivered_at: d.delivered_at,
      delivered_by_name: d.profiles?.full_name ?? null,
    }),
  );

  const shareUrl = rawToken
    ? activeRole === "referral"
      ? buildReferralUrl(rawToken)
      : buildApplicantUrl(rawToken)
    : null;

  // Thumbnail for the Replace-photo card.
  //   - Cloudinary public_id → build the auto-cropped delivery URL (public,
  //     no signing needed; folder access control sits at the public_id
  //     namespace level).
  //   - Legacy Supabase Storage path → mint a 10-minute signed URL.
  let currentPhotoUrl: string | null = null;
  if (app.applicant_photo_url) {
    if (isCloudinaryPublicId(app.applicant_photo_url)) {
      currentPhotoUrl = applicantPhotoUrl(app.applicant_photo_url);
    } else {
      const adminSb = createAdminClient();
      const { data: signed } = await adminSb.storage
        .from("applicant-photos")
        .createSignedUrl(app.applicant_photo_url, 60 * 10);
      currentPhotoUrl = signed?.signedUrl ?? null;
    }
  }

  const recipientPhone =
    activeRole === "referral" ? app.assigned_referral_phone : app.applicant_phone;
  const recipientName =
    activeRole === "referral"
      ? app.assigned_referral_name ?? "there"
      : app.applicant_name_at_invite ?? "there";

  const whatsappUrl =
    rawToken && shareUrl && recipientPhone
      ? buildWhatsAppUrl(
          recipientPhone,
          buildInviteMessage({
            applicantName: recipientName,
            adminName: auth.profile.full_name ?? "your branch coordinator",
            link: shareUrl,
            ttlDays: link ? ttlDaysUntil(link.expires_at) : 7,
          }),
        )
      : null;

  const fullPhoneVisible =
    auth.profile.role === "branch_master_admin" || auth.profile.role === "branch_admin";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          {app.applicant_name_at_invite ?? "(no name on record)"}
        </h1>
        <p className="text-text-secondary">
          Invited {formatDateDDMMMYYYY(app.applicant_invited_at)} ·{" "}
          {fullPhoneVisible
            ? formatPhoneDisplay(app.applicant_phone)
            : maskPhone(app.applicant_phone)}{" "}
          · Status <span className="font-medium text-text-primary">{app.status}</span>
        </p>
      </header>

      {app.status === "ARCHIVED" && (
        <Card>
          <CardHeader>
            <CardTitle>Archived</CardTitle>
            <CardDescription>
              {app.archived_at
                ? `Archived ${formatDateDDMMMYYYY(app.archived_at)}`
                : "This application is archived."}
              {app.pre_archive_status ? ` · was ${app.pre_archive_status}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {app.archive_reason && (
              <p className="whitespace-pre-line text-sm text-text-secondary">
                &ldquo;{app.archive_reason}&rdquo;
              </p>
            )}
            {isAdminTeam && (
              <div className="flex justify-end">
                <UnarchiveButton applicationId={app.id} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(app.hq_pdf_url || app.status === "READY_TO_SEND") && (
        <Card>
          <CardHeader>
            <CardTitle>Signed PDF</CardTitle>
            <CardDescription>
              {app.hq_pdf_url
                ? "The PDF emailed to HQ. Re-download any time."
                : "Preview the PDF before sending. Doesn't change state."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            {app.hq_pdf_url && <DownloadStoredPdfButton applicationId={app.id} />}
            <PreviewPdfButton applicationId={app.id} />
          </CardContent>
        </Card>
      )}

      {/* Primary CTA when ready to send. Default path opens the full
          recipient picker (HQ / Self / Custom emails). The "Mark as sent"
          escape hatch is for cases where the PDF was delivered out-of-band
          and we only need to flip the state. */}
      {isAdminTeam && app.status === "READY_TO_SEND" && (
        <Card>
          <CardHeader>
            <CardTitle>Send to HQ</CardTitle>
            <CardDescription>
              The Chairman has signed. Review the PDF above, then send it to HQ —
              or, if you&rsquo;ve already forwarded it another way, just mark it
              sent.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/branch/ready-to-send/${app.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-red px-4 py-2 text-base font-semibold text-text-inverse transition-colors duration-fast hover:opacity-90"
            >
              Review &amp; send to HQ
            </Link>
            <MarkSentWithoutEmailButton applicationId={app.id} />
          </CardContent>
        </Card>
      )}

      {/* NRIC scans + admin override surfaces are Branch-Admin-only. The
          Chairman gets a thinner read-only view of the application — they
          come here to review before going to /branch/sign/[id] to sign. */}
      {isAdminTeam && nricRequired(app.place_of_birth) && (
        <NricScansCard applicationId={app.id} purgedAt={app.nric_purged_at} />
      )}

      {isAdminTeam && (
        <ReplacePhotoCard
          applicationId={app.id}
          currentPhotoUrl={currentPhotoUrl}
          status={app.status}
        />
      )}

      {!isAdminTeam && app.status === "PENDING_CHAIRMAN" && (
        <Card>
          <CardHeader>
            <CardTitle>Ready to sign</CardTitle>
            <CardDescription>
              When you&rsquo;re happy with what you&rsquo;ve reviewed above, head to the
              signing screen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`/branch/sign/${app.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-red px-4 py-2 text-base font-semibold text-text-inverse transition-colors duration-fast hover:opacity-90"
            >
              Sign this application
            </Link>
          </CardContent>
        </Card>
      )}

      {isAdminTeam && app.status === "PENDING_CHAIRMAN" && (
        <ChairmanReminderCard
          applicationId={app.id}
          appBaseUrl={process.env.NEXT_PUBLIC_APP_URL ?? "https://kg.taylab.com"}
        />
      )}

      {isAdminTeam && app.status === "SENT_TO_HQ" && (
        <Card>
          <CardHeader>
            <CardTitle>Record HQ outcome</CardTitle>
            <CardDescription>
              Sent to HQ {formatDateDDMMMYYYY(app.sent_to_hq_at)}. Once HQ replies, capture
              the result here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HqOutcomeForm applicationId={app.id} />
          </CardContent>
        </Card>
      )}

      {app.status === "COMPLETED" && (
        <Card>
          <CardHeader>
            <CardTitle>HQ outcome — Approved</CardTitle>
            <CardDescription>
              Recorded {formatDateDDMMMYYYY(app.hq_outcome_recorded_at)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-text-muted">Approval date</dt>
                <dd className="font-medium text-text-primary">
                  {formatDateDDMMMYYYY(app.hq_approved_date)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-text-muted">Membership number</dt>
                <dd className="font-medium text-text-primary">
                  {app.hq_approved_membership_no ?? "—"}
                </dd>
              </div>
              {app.hq_approved_notes && (
                <div className="sm:col-span-2">
                  <dt className="text-sm text-text-muted">Notes</dt>
                  <dd className="whitespace-pre-line text-text-primary">
                    {app.hq_approved_notes}
                  </dd>
                </div>
              )}
            </dl>
            {isAdminTeam && (
              <div className="flex justify-end">
                <ReverseHqOutcomeButton applicationId={app.id} fromStatus="COMPLETED" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {app.status === "HQ_REJECTED" && (
        <Card>
          <CardHeader>
            <CardTitle>HQ outcome — Rejected</CardTitle>
            <CardDescription>
              Recorded {formatDateDDMMMYYYY(app.hq_outcome_recorded_at)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-text-muted">Rejection date</dt>
                <dd className="font-medium text-text-primary">
                  {formatDateDDMMMYYYY(app.hq_rejected_date)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-text-muted">Reason</dt>
                <dd className="font-medium text-text-primary">
                  {app.hq_rejected_reason ?? "—"}
                </dd>
              </div>
              {app.hq_rejected_reason_details && (
                <div className="sm:col-span-2">
                  <dt className="text-sm text-text-muted">Details</dt>
                  <dd className="whitespace-pre-line text-text-primary">
                    {app.hq_rejected_reason_details}
                  </dd>
                </div>
              )}
            </dl>
            {isAdminTeam && (
              <div className="flex justify-end">
                <ReverseHqOutcomeButton applicationId={app.id} fromStatus="HQ_REJECTED" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isAdminTeam && (app.status === "PENDING_REFERRAL_ASSIGNMENT" ? (
        <Card>
          <CardHeader>
            <CardTitle>Assign a referral</CardTitle>
            <CardDescription>
              The applicant has signed. Pick someone to vouch for them and choose how the
              application gets to the Branch Chairman.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AssignReferralForm
              applicationId={app.id}
              defaultRoutingMode={
                (auth.branch.default_routing_mode ?? "direct_to_chairman") as
                  | "direct_to_chairman"
                  | "via_branch_admin_review"
              }
            />
          </CardContent>
        </Card>
      ) : app.status === "PENDING_BRANCH_ADMIN_REVIEW" ? (
        <Card>
          <CardHeader>
            <CardTitle>Forward to Chairman</CardTitle>
            <CardDescription>
              The referral has signed. Confirm everything looks right, then hand off to the
              Branch Chairman.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">
              Routing: <span className="font-medium text-text-primary">Via branch admin review</span>
              {" — "}you&rsquo;re the human gate before the Chairman gets it.
            </p>
            <ForwardToChairmanButton applicationId={app.id} />
          </CardContent>
        </Card>
      ) : rawToken && link && !link.consumed_at && shareUrl && whatsappUrl ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {activeRole === "referral" ? (
              <ReferralDeliveryPanel
                applicationId={app.id}
                magicLinkId={link.id}
                referralUrl={shareUrl}
                rawToken={rawToken}
                whatsappUrl={whatsappUrl}
                referralEmail={app.assigned_referral_email}
              />
            ) : (
              <DeliveryPanel
                applicationId={app.id}
                magicLinkId={link.id}
                applicantUrl={shareUrl}
                rawToken={rawToken}
                whatsappUrl={whatsappUrl}
                applicantEmail={app.applicant_email}
              />
            )}
          </div>
          <aside className="flex flex-col gap-4 lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Link summary</CardTitle>
                <CardDescription>
                  Role:{" "}
                  <span className="font-medium text-text-primary">
                    {activeRole === "referral" ? "Referral" : "Applicant"}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-text-secondary">
                <p>
                  <span className="text-text-muted">Expires</span>{" "}
                  <span className="font-medium text-text-primary">
                    {formatDateDDMMMYYYY(link.expires_at)}
                  </span>
                </p>
                <p className="mt-2 break-all rounded-md bg-surface-page p-3 text-xs">{shareUrl}</p>
                {app.routing_choice && (
                  <p className="mt-3">
                    <span className="text-text-muted">Routing</span>{" "}
                    <span className="font-medium text-text-primary">
                      {app.routing_choice === "via_branch_admin_review"
                        ? "Via branch admin review"
                        : "Direct to Chairman"}
                    </span>
                  </p>
                )}
                <div className="mt-4">
                  <ExtendTtlButton magicLinkId={link.id} />
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      ) : (
        <Alert variant={link?.consumed_at ? "info" : "warning"}>
          <AlertTitle>
            {link?.consumed_at
              ? `${activeRole === "referral" ? "Referral" : "Applicant"} link already used`
              : rawToken
                ? "Link is no longer valid"
                : "No active share token in this page URL"}
          </AlertTitle>
          <AlertDescription>
            {link?.consumed_at
              ? activeRole === "referral"
                ? "The referral has signed. The application will move to the next state automatically."
                : "The applicant has submitted their form. Assign a referral above to continue."
              : "Open this page right after creating the invite, or re-mint a link (Re-mint UI lands in a later step)."}
          </AlertDescription>
        </Alert>
      ))}

      {isAdminTeam && <LinkHistory deliveries={deliveries} />}

      {isAdminTeam && app.status !== "ARCHIVED" && (
        <div className="flex justify-end pt-4">
          <ArchiveButton applicationId={app.id} />
        </div>
      )}
    </div>
  );
}
