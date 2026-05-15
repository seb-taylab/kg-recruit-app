/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (Timeline pattern)
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx (Status history disclosure)
 *
 * Per-application event stream rendered as a vertical timeline. Replaces
 * the branch-wide JourneyTimeline view (which was killed per Sebastian's
 * 2026-05-15 directive) — relocated here so the history lives WITH the
 * application it belongs to, not as a separate top-level surface.
 *
 * Receives a pre-loaded events array (lib/journey/application-events.ts).
 * Server-rendered; no client interactivity needed.
 */
import { Card, CardContent } from "@/components/ui/card";
import type { ApplicationEventRow } from "@/lib/journey/application-events";

function eventLabel(eventType: string): string {
  const map: Record<string, string> = {
    CREATED: "Application created",
    INVITED: "Applicant invited",
    LINK_OPENED: "Link opened",
    SIGNED: "Signature captured",
    REFERRAL_ASSIGNED: "Referral assigned",
    ADMIN_REVIEWED: "Forwarded to Chairman",
    READY_TO_SEND: "Marked ready to send",
    SENT_TO_HQ: "Sent to HQ",
    HQ_OUTCOME_RECORDED_APPROVED: "HQ outcome — Approved",
    HQ_OUTCOME_RECORDED_REJECTED: "HQ outcome — Rejected",
    HQ_OUTCOME_REVERSED: "HQ outcome reversed",
    ARCHIVED: "Archived",
    UNARCHIVED: "Unarchived",
    NUDGE_SENT: "Nudge sent",
    // Falls through to the title-cased fallback below for forward
    // compatibility with future event types.
  };
  return (
    map[eventType] ??
    eventType
      .toLowerCase()
      .split("_")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ")
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ApplicationStatusHistory({
  events,
}: {
  events: ApplicationEventRow[];
}) {
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-text-muted">
          No events recorded yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ol className="flex flex-col">
          {events.map((e, i) => (
            <li
              key={e.id}
              className={
                i === events.length - 1
                  ? "flex gap-4 p-4"
                  : "flex gap-4 border-b border-border p-4"
              }
            >
              <div className="flex flex-col items-center pt-1">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-brand-blue"
                />
                {i !== events.length - 1 && (
                  <span aria-hidden="true" className="mt-1 w-px flex-1 bg-border" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-sm font-medium text-text-primary">
                  {eventLabel(e.eventType)}
                </p>
                {e.actorRole && (
                  <p className="text-sm text-text-secondary">
                    by {e.actorRole.replace(/_/g, " ")}
                  </p>
                )}
                <p className="text-xs text-text-muted">{formatTimestamp(e.occurredAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
