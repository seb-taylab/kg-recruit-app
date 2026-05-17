/**
 * @tier organism
 * @consumes ui/Card, lucide-react, ConvertLeadButton, MarkLeadEngagedButton, ReturnLeadToWingButton
 * @used-by app/(dashboard)/branch/inbox/page.tsx
 *
 * Inbound lead card — two distinct layouts:
 *
 *   Mobile (<sm) — readable stack
 *     ┌────────────────────────────────────┐
 *     │ [Wing pill]  [Engaged pill?]       │
 *     │                                    │
 *     │ Applicant Name                     │
 *     │ Routed from "Event" · 1m ago       │
 *     │ ────────────────                   │
 *     │ ☎  +65 9186 1273                   │
 *     │ ◷  540102                          │
 *     │    SENGKANG GRC · North East       │
 *     │                                    │
 *     │ [ Mark engaged ] [ Send invite ]   │
 *     │    Not a fit? Return to wing →     │
 *     └────────────────────────────────────┘
 *
 *   Desktop (sm+) — densified, 3 lines of content
 *     ┌────────────────────────────────────────────────────────────────────┐
 *     │ [Wing]  [Engaged?]   [Return] [Mark engaged] [Send invite]         │
 *     │ Applicant Name · Routed from "Event" 1m ago                        │
 *     │ ☎ +65 9186 1273    ◷ 540102 · SENGKANG GRC · North East District   │
 *     └────────────────────────────────────────────────────────────────────┘
 *
 * Desktop densification rationale (Sebastian's audit 2026-05-18): the
 * previous version had ~6 vertical bands of content and wasted whitespace
 * on wide viewports. New desktop layout collapses to 3 content lines while
 * mobile stays comfortable for narrow widths.
 */
import { formatDistanceToNow } from "date-fns";
import { Building2, CheckCircle2, Phone, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ConvertLeadButton } from "@/components/branch/ConvertLeadButton";
import { MarkLeadEngagedButton } from "@/components/branch/MarkLeadEngagedButton";
import { ReturnLeadToWingButton } from "@/components/branch/ReturnLeadToWingButton";
import { formatPhoneDisplay } from "@/lib/format/phone";

export interface InboundLeadCardProps {
  leadId: string;
  applicantName: string;
  mobileNumber: string;
  postalCode: string | null;
  /** Resolved via constituency_directory — null when postal didn't match. */
  constituency: string | null;
  district: string | null;
  eventName: string;
  /** Wing branch name (e.g. "Young PAP"). Always shown — multi-wing ready. */
  wingName: string;
  routedAt: string | null;
  status: string;
}

export function InboundLeadCard(props: InboundLeadCardProps) {
  const {
    leadId,
    applicantName,
    mobileNumber,
    postalCode,
    constituency,
    district,
    eventName,
    wingName,
    routedAt,
    status,
  } = props;

  const isEngaged = status === "ENGAGED";
  const routedAgo = routedAt
    ? formatDistanceToNow(new Date(routedAt), { addSuffix: true })
    : "recently";

  // formatPhoneDisplay handles E.164 → "+65 9123 4567"; for booth captures
  // the number may not be E.164 — fall back to as-typed.
  const phoneDisplay = formatPhoneDisplay(mobileNumber) || mobileNumber;

  // Composed geography line: postal · constituency · district. Each part
  // optional so we degrade gracefully when the directory has gaps.
  const geographyParts = [
    constituency,
    district ? `${district} District` : null,
  ].filter(Boolean);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-4">
        {/* TOP ROW — pills (left) + desktop actions (right).
            On mobile actions move to the bottom of the card for thumb-reach. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-state-info px-2 py-0.5 text-xs font-medium text-state-info">
              <Building2
                className="h-3.5 w-3.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              {wingName}
            </span>
            {isEngaged && (
              <span className="inline-flex items-center gap-1 rounded-full border border-state-success px-2 py-0.5 text-xs font-medium text-state-success">
                <CheckCircle2
                  className="h-3.5 w-3.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                Engaged
              </span>
            )}
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <ReturnLeadToWingButton
              leadId={leadId}
              applicantName={applicantName}
              wingName={wingName}
              variant="button"
            />
            <MarkLeadEngagedButton
              leadId={leadId}
              applicantName={applicantName}
              alreadyEngaged={isEngaged}
            />
            <ConvertLeadButton leadId={leadId} applicantName={applicantName} />
          </div>
        </div>

        {/* IDENTITY + PROVENANCE
            Mobile: two lines (name on its own, provenance below as a sub-line)
            Desktop: one line with provenance inline */}
        <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-2">
          <p className="text-base font-semibold leading-tight text-text-primary sm:text-base">
            {applicantName}
          </p>
          <p className="text-xs text-text-muted">
            <span className="sm:hidden">Routed from </span>
            <span className="hidden sm:inline">· Routed from </span>
            <span className="font-medium text-text-secondary">
              &ldquo;{eventName}&rdquo;
            </span>{" "}
            · {routedAgo}
          </p>
        </div>

        {/* CONTACT ROWS
            Mobile: stacked phone above postal (with divider above)
            Desktop: single line, phone left, postal+geography right */}
        <div className="flex flex-col gap-1.5 border-t border-border pt-2 sm:flex-row sm:gap-6 sm:border-t-0 sm:pt-0">
          <div className="flex items-start gap-2 text-sm">
            <Phone
              className="mt-0.5 h-4 w-4 shrink-0 text-text-muted"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="text-text-primary">{phoneDisplay}</span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <MapPin
              className="mt-0.5 h-4 w-4 shrink-0 text-text-muted"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col gap-0 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-1">
              <span className="text-text-primary">
                {postalCode ?? "No postal code"}
              </span>
              {geographyParts.length > 0 && (
                <span className="text-xs text-text-muted">
                  <span className="hidden sm:inline">· </span>
                  {geographyParts.join(" · ")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* MOBILE ACTIONS — primary pair full-width, Return as a quiet
            text link below. Hidden on sm+ (actions render at top-right). */}
        <div className="flex flex-col gap-2 sm:hidden">
          <div className="flex gap-2">
            <MarkLeadEngagedButton
              leadId={leadId}
              applicantName={applicantName}
              alreadyEngaged={isEngaged}
              className="h-11 flex-1"
            />
            <ConvertLeadButton
              leadId={leadId}
              applicantName={applicantName}
              className="h-11 flex-1"
            />
          </div>
          <div className="flex justify-center">
            <ReturnLeadToWingButton
              leadId={leadId}
              applicantName={applicantName}
              wingName={wingName}
              variant="link"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
