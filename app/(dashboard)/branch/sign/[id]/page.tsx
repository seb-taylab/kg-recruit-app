import { notFound, redirect } from "next/navigation";
import { ArrowDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateDDMMMYYYY } from "@/lib/format/date";
import { formatPhoneDisplay } from "@/lib/format/phone";
import { ChairmanSignForm } from "@/components/branch/ChairmanSignForm";
import { applicantPhotoUrl, isCloudinaryPublicId } from "@/lib/cloudinary/client";

export const dynamic = "force-dynamic";

// All fields used to populate the form ownership: applicant + referral
// blocks. We also pull a few that are NULL-checked for "are there any
// memberships / hobbies / social links?" expand-only sections so the
// Chairman doesn't open empty disclosures.
interface ApplicationRow {
  id: string;
  branch_id: string;
  status: string;

  // Identity / display
  surname: string | null;
  given_names: string | null;
  name: string | null;
  chinese_name: string | null;
  applicant_name_at_invite: string | null;
  nric_no: string | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  applicant_photo_url: string | null;

  // Demographics
  race: string | null;
  gender: string | null;
  marital_status: string | null;
  housing_type: string | null;
  hdb_rooms: number | null;
  highest_edu: string | null;
  written_languages: string[] | null;
  spoken_languages: string[] | null;

  // Contact / address
  home_address: string | null;
  postal_code: string | null;
  tel_home: string | null;
  tel_office: string | null;
  tel_hp: string | null;
  email: string | null;

  // Work
  occupation: string | null;
  organisation: string | null;
  monthly_income: string | null;

  // Online presence (almost always empty — expand-only)
  facebook: string | null;
  linkedin: string | null;
  twitter: string | null;
  blog: string | null;

  // Community + hobbies (expand-only)
  hobbies: string[] | null;
  trade_unions: string | null;
  associations: string | null;
  clubs: string | null;
  ccc: string | null;
  ccmc: string | null;
  rnc: string | null;
  grassroots: string | null;

  // Workflow + signatures
  applicant_signed_at: string | null;
  assigned_referral_name: string | null;
  assigned_referral_membership_no: string | null;
  assigned_referral_known_years: number | null;
  referral_signed_at: string | null;
  chairman_name_on_form: string | null;
}

interface SignatureRow {
  role: "applicant" | "referral" | "chairman";
  signer_name: string;
  signature_png_url: string;
  signed_at: string | null;
}

const APP_COLUMNS = [
  "id, branch_id, status",
  "surname, given_names, name, chinese_name, applicant_name_at_invite",
  "nric_no, date_of_birth, place_of_birth, applicant_photo_url",
  "race, gender, marital_status, housing_type, hdb_rooms, highest_edu",
  "written_languages, spoken_languages",
  "home_address, postal_code, tel_home, tel_office, tel_hp, email",
  "occupation, organisation, monthly_income",
  "facebook, linkedin, twitter, blog",
  "hobbies, trade_unions, associations, clubs, ccc, ccmc, rnc, grassroots",
  "applicant_signed_at, assigned_referral_name, assigned_referral_membership_no, assigned_referral_known_years, referral_signed_at, chairman_name_on_form",
].join(", ");

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
            Forward this link to the Chairman (WhatsApp / SMS / email). They&rsquo;ll be
            asked to sign in, then dropped straight on the signing page.
          </AlertDescription>
        </Alert>
        <Card>
          <CardHeader>
            <CardTitle>Application link</CardTitle>
            <CardDescription>Copy this and send it to the Chairman.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="break-all rounded-md bg-surface-page p-3 text-xs text-text-secondary">
              {process.env.NEXT_PUBLIC_APP_URL ?? "https://kg.taylab.com"}/branch/sign/{id}
            </p>
            <p className="text-sm text-text-muted">
              To view this application yourself, open it from the{" "}
              <a
                href={`/branch/applications/${id}`}
                className="font-medium text-brand-blue hover:underline"
              >
                application detail page
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: appRow } = await admin
    .from("applications" as never)
    .select(APP_COLUMNS)
    .eq("id", id)
    .single();
  const app = appRow as ApplicationRow | null;
  if (!app || app.branch_id !== auth.branch.id) notFound();

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

  // Resolve the photo URL — modern uploads are Cloudinary public IDs, but
  // older applications still store a Supabase Storage path. Mirror the
  // logic in app/(dashboard)/branch/applications/[id]/page.tsx so the
  // photo never silently 404s here.
  let applicantPhotoSignedUrl: string | null = null;
  if (app.applicant_photo_url) {
    if (isCloudinaryPublicId(app.applicant_photo_url)) {
      applicantPhotoSignedUrl = applicantPhotoUrl(app.applicant_photo_url);
    } else {
      const { data: signed } = await admin.storage
        .from("applicant-photos")
        .createSignedUrl(app.applicant_photo_url, 60 * 60);
      applicantPhotoSignedUrl = signed?.signedUrl ?? null;
    }
  }

  // Load both prior signatures + sign each with a 1-hour TTL.
  const { data: sigRows } = await admin
    .from("signatures" as never)
    .select("role, signer_name, signature_png_url, signed_at")
    .eq("application_id", id)
    .in("role", ["applicant", "referral"]);
  const signatures = (sigRows as SignatureRow[] | null) ?? [];
  const signedSignatures = await Promise.all(
    signatures.map(async (s) => {
      const { data } = await admin.storage
        .from("signatures")
        .createSignedUrl(s.signature_png_url, 60 * 60);
      return { ...s, signed_url: data?.signedUrl ?? null };
    }),
  );

  const applicantDisplay =
    (app.given_names && app.surname
      ? `${app.given_names} ${app.surname}`
      : app.applicant_name_at_invite) ?? "the applicant";
  const referralName = app.assigned_referral_name ?? "—";

  // Age in years from DOB — useful for face/photo cross-check.
  const ageYears = ageFromDob(app.date_of_birth);

  // Housing summary collapses HDB + rooms into one human-readable string.
  const housingSummary = formatHousing(app.housing_type, app.hdb_rooms);
  const incomeSummary = app.monthly_income ?? null;
  const writtenLangs = (app.written_languages ?? []).join(", ") || null;
  const spokenLangs = (app.spoken_languages ?? []).join(", ") || null;

  // Three potentially-empty sections — we hide the disclosure entirely if
  // there's nothing inside, rather than showing an "expand → see nothing"
  // dead end.
  const hasHobbies = (app.hobbies ?? []).some((h) => h && h.trim().length > 0);
  const memberships = [
    { label: "Trade unions", value: app.trade_unions },
    { label: "Associations", value: app.associations },
    { label: "Clubs / societies", value: app.clubs },
    { label: "Citizens' Consultative Committee", value: app.ccc },
    { label: "CCMC", value: app.ccmc },
    { label: "RNC", value: app.rnc },
    { label: "Grassroots", value: app.grassroots },
  ].filter((m) => m.value && m.value.trim().length > 0);
  const hasMemberships = memberships.length > 0;
  const socials = [
    { label: "Facebook", value: app.facebook },
    { label: "LinkedIn", value: app.linkedin },
    { label: "Twitter", value: app.twitter },
    { label: "Blog", value: app.blog },
  ].filter((s) => s.value && s.value.trim().length > 0);
  const hasSocials = socials.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          Sign for {applicantDisplay}
        </h1>
        <p className="text-text-secondary">
          Applicant signed {formatDateDDMMMYYYY(app.applicant_signed_at)} · Referral signed{" "}
          {formatDateDDMMMYYYY(app.referral_signed_at)}
        </p>
      </header>

      {/* ACTION CALLOUT — sits between the page header and all the read-
          only review cards so the Chairman sees what's expected of them
          before scrolling. Brand-red top accent makes it pop visually
          against the (otherwise grey-and-white) information cards. The
          Jump anchor scrolls to #chairman-actions inside ChairmanSignForm. */}
      <Card className="border-t-4 border-t-brand-red">
        <CardHeader>
          <CardTitle>Your actions</CardTitle>
          <CardDescription>
            Two things to do at the bottom of this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-text-primary marker:font-semibold marker:text-brand-red">
            <li>
              <span className="font-medium">Confirm how long you&rsquo;ve known {applicantDisplay}</span>
            </li>
            <li>
              <span className="font-medium">Sign the application</span>
            </li>
          </ol>
          <a
            href="#chairman-actions"
            className="inline-flex w-fit items-center gap-2 rounded-md bg-brand-red px-4 py-2 text-sm font-semibold text-text-inverse transition-colors duration-fast hover:opacity-90"
          >
            <span>Jump to actions</span>
            <ArrowDown className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </a>
        </CardContent>
      </Card>

      {/* HERO: big photo + identity quick-read so the Chairman can match
          the face to the name at a glance before scrolling. Stacks on
          mobile, side-by-side from sm: up. */}
      <Card>
        <CardHeader>
          <CardTitle>Applicant</CardTitle>
          <CardDescription>Confirm you recognise this person before signing.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {applicantPhotoSignedUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- presigned / CDN URL */
            <img
              src={applicantPhotoSignedUrl}
              alt={`Photo of ${applicantDisplay}`}
              width={160}
              height={206}
              className="h-auto w-40 shrink-0 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="flex h-52 w-40 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-xs text-text-muted">
              No photo on file
            </div>
          )}
          <div className="flex flex-1 flex-col gap-3 text-sm">
            <div>
              <p className="text-xs text-text-muted">Full name (as in NRIC)</p>
              <p className="text-lg font-semibold text-text-primary">{applicantDisplay}</p>
              {app.chinese_name && (
                <p className="text-base font-medium text-text-secondary">{app.chinese_name}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SummaryRow label="NRIC" value={app.nric_no} />
              <SummaryRow
                label="Date of birth"
                value={
                  app.date_of_birth
                    ? `${formatDateDDMMMYYYY(app.date_of_birth)}${ageYears != null ? ` · ${ageYears} y/o` : ""}`
                    : null
                }
              />
              <SummaryRow label="Place of birth" value={app.place_of_birth} />
              <SummaryRow label="Mobile" value={formatPhoneDisplay(app.tel_hp)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PERSONAL PARTICULARS — always visible. Two-column grid on sm+. */}
      <Card>
        <CardHeader>
          <CardTitle>Personal particulars</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <SummaryRow label="Race" value={app.race} />
          <SummaryRow label="Gender" value={app.gender} />
          <SummaryRow label="Marital status" value={app.marital_status} />
          <SummaryRow label="Housing" value={housingSummary} />
          <SummaryRow label="Highest education" value={app.highest_edu} />
          <SummaryRow label="Written languages" value={writtenLangs} />
          <SummaryRow label="Spoken languages" value={spokenLangs} />
        </CardContent>
      </Card>

      {/* CONTACT + ADDRESS — always visible. */}
      <Card>
        <CardHeader>
          <CardTitle>Contact &amp; address</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <SummaryRow
            label="Home address"
            value={
              app.home_address && app.postal_code
                ? `${app.home_address}\nSingapore ${app.postal_code}`
                : app.home_address ?? null
            }
            wholeRow
          />
          <SummaryRow label="Mobile" value={formatPhoneDisplay(app.tel_hp)} />
          <SummaryRow label="Email" value={app.email} />
          <SummaryRow label="Home phone" value={formatPhoneDisplay(app.tel_home)} />
          <SummaryRow label="Office phone" value={formatPhoneDisplay(app.tel_office)} />
        </CardContent>
      </Card>

      {/* WORK — always visible. */}
      <Card>
        <CardHeader>
          <CardTitle>Work</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <SummaryRow label="Occupation" value={app.occupation} wholeRow />
          <SummaryRow label="Organisation" value={app.organisation} wholeRow />
          <SummaryRow label="Monthly income" value={incomeSummary} />
        </CardContent>
      </Card>

      {/* REFERRAL — always visible. The Chairman is signing on the
          referral's vouching, so this needs to be unmissable. */}
      <Card>
        <CardHeader>
          <CardTitle>Referred by</CardTitle>
          <CardDescription>Who is vouching for this applicant.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <SummaryRow label="Name" value={referralName} />
          <SummaryRow
            label="Membership no."
            value={app.assigned_referral_membership_no}
          />
          <SummaryRow
            label="Has known the applicant for"
            value={
              app.assigned_referral_known_years != null
                ? `${app.assigned_referral_known_years} year${app.assigned_referral_known_years === 1 ? "" : "s"}`
                : null
            }
          />
        </CardContent>
      </Card>

      {/* EXPAND-ONLY SECTIONS — for fields the Chairman rarely needs but
          may want to spot-check. Hidden entirely if empty so the
          accordion doesn't lead to a dead end. <details> is the lowest-
          cost accessible disclosure — no JS, no Radix dep. */}
      {(hasHobbies || hasMemberships || hasSocials) && (
        <Card>
          <CardHeader>
            <CardTitle>More details</CardTitle>
            <CardDescription>Tap a section to expand.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {hasHobbies && (
              <details className="group rounded-md border border-border bg-surface-card open:bg-surface-page">
                <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-text-primary marker:hidden [&::-webkit-details-marker]:hidden">
                  <span>Hobbies &amp; interests</span>
                  <span className="text-xs text-text-muted group-open:hidden">Show</span>
                  <span className="hidden text-xs text-text-muted group-open:inline">Hide</span>
                </summary>
                <div className="border-t border-border px-4 py-3 text-sm text-text-primary">
                  <ul className="list-disc pl-5">
                    {(app.hobbies ?? [])
                      .filter((h) => h && h.trim().length > 0)
                      .map((h, i) => (
                        <li key={`${h}-${i}`}>{h}</li>
                      ))}
                  </ul>
                </div>
              </details>
            )}

            {hasMemberships && (
              <details className="group rounded-md border border-border bg-surface-card open:bg-surface-page">
                <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-text-primary marker:hidden [&::-webkit-details-marker]:hidden">
                  <span>Memberships &amp; community ({memberships.length})</span>
                  <span className="text-xs text-text-muted group-open:hidden">Show</span>
                  <span className="hidden text-xs text-text-muted group-open:inline">Hide</span>
                </summary>
                <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm">
                  {memberships.map((m) => (
                    <SummaryRow key={m.label} label={m.label} value={m.value} />
                  ))}
                </div>
              </details>
            )}

            {hasSocials && (
              <details className="group rounded-md border border-border bg-surface-card open:bg-surface-page">
                <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-text-primary marker:hidden [&::-webkit-details-marker]:hidden">
                  <span>Online presence ({socials.length})</span>
                  <span className="text-xs text-text-muted group-open:hidden">Show</span>
                  <span className="hidden text-xs text-text-muted group-open:inline">Hide</span>
                </summary>
                <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm">
                  {socials.map((s) => (
                    <SummaryRow key={s.label} label={s.label} value={s.value} />
                  ))}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Prior signatures</CardTitle>
          <CardDescription>Captured on the applicant&rsquo;s magic-link form.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {signedSignatures.map((s) => (
            <div key={s.role} className="flex flex-col gap-2">
              <span className="text-sm text-text-muted">
                {s.role === "applicant" ? "Applicant" : "Referral"}: {s.signer_name}{" "}
                {s.signed_at ? `· ${formatDateDDMMMYYYY(s.signed_at)}` : ""}
              </span>
              {s.signed_url && (
                /* eslint-disable-next-line @next/next/no-img-element -- presigned URL */
                <img
                  src={s.signed_url}
                  alt={`${s.role} signature`}
                  width={320}
                  height={80}
                  className="h-auto w-full max-w-md rounded-md border border-border bg-surface-card"
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <ChairmanSignForm
        applicationId={app.id}
        applicantDisplayName={applicantDisplay}
        defaultNameOnForm={app.chairman_name_on_form ?? auth.profile.full_name ?? ""}
      />
    </div>
  );
}

function SummaryRow({
  label,
  value,
  wholeRow,
}: {
  label: string;
  value: string | null | undefined;
  /** Span both columns of the grid (full-width on sm+). */
  wholeRow?: boolean;
}) {
  return (
    <div className={`flex flex-col ${wholeRow ? "sm:col-span-2" : ""}`}>
      <span className="text-xs text-text-muted">{label}</span>
      <span className="whitespace-pre-line font-medium text-text-primary">
        {value || "—"}
      </span>
    </div>
  );
}

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}

function formatHousing(type: string | null, rooms: number | null): string | null {
  if (!type) return null;
  if (type === "HDB" && rooms != null) return `HDB · ${rooms} rooms`;
  return type;
}
