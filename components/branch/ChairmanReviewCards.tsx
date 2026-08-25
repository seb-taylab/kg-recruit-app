/**
 * @tier organism
 * @consumes ui/Card, ui/Alert
 * @used-by app/(dashboard)/branch/sign/[id]/page.tsx (dashboard, login),
 *          app/branch-sign/[token]/page.tsx (passwordless token link)
 *
 * The read-only review the Branch Chairman sees before signing. Shared by
 * both signing surfaces so the information a legal signature attests to is
 * IDENTICAL whether the chairman came in via the dashboard or a WhatsApp
 * token link. The signing form (which differs per surface — session vs
 * token) is rendered by the caller AFTER this block.
 */
import { ArrowDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateDDMMMYYYY } from "@/lib/format/date";
import { formatPhoneDisplay } from "@/lib/format/phone";
import { categoryDisplay } from "@/lib/applications/occupation";
import type { OccupationCategory } from "@/lib/validation/occupation-organisation";
import type {
  ChairmanReviewRow,
  SignedReviewSignature,
} from "@/lib/applications/chairman-review";

interface ChairmanReviewCardsProps {
  app: ChairmanReviewRow;
  applicantPhotoSignedUrl: string | null;
  signedSignatures: SignedReviewSignature[];
  applicantDisplay: string;
}

export function ChairmanReviewCards({
  app,
  applicantPhotoSignedUrl,
  signedSignatures,
  applicantDisplay,
}: ChairmanReviewCardsProps) {
  const referralName = app.assigned_referral_name ?? "—";
  const ageYears = ageFromDob(app.date_of_birth);
  const housingSummary = formatHousing(app.housing_type, app.hdb_rooms);
  const incomeSummary = app.monthly_income ?? null;
  const writtenLangs = (app.written_languages ?? []).join(", ") || null;
  const spokenLangs = (app.spoken_languages ?? []).join(", ") || null;

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
    <>
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
          before scrolling. The Jump anchor scrolls to #chairman-actions
          inside ChairmanSignForm. */}
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

      {/* HERO: big photo + identity quick-read. */}
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
              decoding="async"
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

      {/* PERSONAL PARTICULARS */}
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

      {/* CONTACT + ADDRESS */}
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

      {/* WORK */}
      {(() => {
        const display = categoryDisplay({
          occupation_category: (app.occupation_category as OccupationCategory | null) ?? null,
          occupation_detail: app.occupation_detail ?? app.occupation,
          organisation_name: app.organisation_name ?? app.organisation,
          school_level: app.school_level,
        });
        return (
          <Card>
            <CardHeader>
              <CardTitle>Work</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <SummaryRow label="Occupation" value={display.occupationLine} wholeRow />
              {display.secondaryLabel && (
                <SummaryRow
                  label={display.secondaryLabel}
                  value={display.secondaryValue}
                  wholeRow
                />
              )}
              <SummaryRow label="Monthly income" value={incomeSummary} />
            </CardContent>
          </Card>
        );
      })()}

      {/* REFERRAL */}
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

      {/* EXPAND-ONLY SECTIONS */}
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
                  loading="lazy"
                  decoding="async"
                  className="h-auto w-full max-w-md rounded-md border border-border bg-surface-card"
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function SummaryRow({
  label,
  value,
  wholeRow,
}: {
  label: string;
  value: string | null | undefined;
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
