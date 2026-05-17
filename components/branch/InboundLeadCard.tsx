/**
 * @tier organism
 * @consumes ui/Card, lucide-react, ConvertLeadButton, MarkLeadEngagedButton
 * @used-by app/(dashboard)/branch/inbox/page.tsx
 *
 * Inbound lead card for /branch/inbox. Replaces the previous dense single-
 * line layout per the 2026-05-18 redesign:
 *
 *   Mobile (< sm):
 *     ┌────────────────────────────────────┐
 *     │ [Wing pill]  [Engaged pill?]       │
 *     │                                    │
 *     │ Applicant Name                     │
 *     │ Routed from "Event" · 1m ago       │
 *     │                                    │
 *     │ ☎  +65 9186 1273                   │
 *     │ ◷  540102                          │
 *     │    JALAN BESAR GRC · Central       │
 *     │    Singapore District              │
 *     │                                    │
 *     │ [ Mark engaged ] [ Send invite ]   │
 *     └────────────────────────────────────┘
 *
 *   Desktop (sm+):
 *     Pills + actions row across the top; identity + provenance left;
 *     contact rows on one line each.
 *
 * Multi-wing ready: the wing-source pill is on every card so future filter
 * chips can group/select by wing without further data plumbing.
 */
import { formatDistanceToNow } from "date-fns";
import { Building2, CheckCircle2, Phone, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ConvertLeadButton } from "@/components/branch/ConvertLeadButton";
import { MarkLeadEngagedButton } from "@/components/branch/MarkLeadEngagedButton";
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

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        {/* TOP ROW — pills (left) + actions (right on desktop, hidden here on mobile)
            Mobile: pills only on this row; actions move to the bottom. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
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
          {/* Actions: desktop-only at top-right. Hidden on mobile (rendered
              at bottom of card for thumb-reach). */}
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <MarkLeadEngagedButton
              leadId={leadId}
              applicantName={applicantName}
              alreadyEngaged={isEngaged}
            />
            <ConvertLeadButton leadId={leadId} applicantName={applicantName} />
          </div>
        </div>

        {/* IDENTITY + PROVENANCE */}
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold leading-tight text-text-primary">
            {applicantName}
          </p>
          <p className="text-xs text-text-muted">
            Routed from{" "}
            <span className="font-medium text-text-secondary">
              &ldquo;{eventName}&rdquo;
            </span>{" "}
            · {routedAgo}
          </p>
        </div>

        {/* CONTACT ROWS — phone + postal+geography */}
        <div className="flex flex-col gap-2 border-t border-border pt-3">
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
            <div className="flex min-w-0 flex-col">
              <span className="text-text-primary">
                {postalCode ?? "No postal code"}
              </span>
              {(constituency || district) && (
                <span className="text-xs text-text-muted">
                  {[constituency, district ? `${district} District` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* MOBILE ACTIONS — full-width row, 44px+ touch targets.
            Hidden on sm+ (actions render at top-right there).
            When ENGAGED, MarkLeadEngagedButton returns null and "Send
            invite" stretches to full width via flex-1. */}
        <div className="flex gap-2 sm:hidden">
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
      </CardContent>
    </Card>
  );
}
