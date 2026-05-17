/**
 * Inbox — consolidates Awaiting referral + Ready to send + At HQ into one
 * action-oriented page. Each section keeps the verb-first CTA that used to
 * live on its own sub-page.
 *
 * Replaces the standalone /branch/awaiting-referral, /branch/ready-to-send
 * and /branch/at-hq pages (rolled up post-Step 18 to reduce sidebar noise).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/get-user";
import { isBranchAdminTeam } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateDDMMMYYYY } from "@/lib/format/date";
import { ConvertLeadButton } from "@/components/branch/ConvertLeadButton";
import { MarkLeadEngagedButton } from "@/components/branch/MarkLeadEngagedButton";

interface InboundLeadRow {
  id: string;
  full_name: string;
  mobile_number: string;
  postal_code: string | null;
  status: string;
  routed_at: string | null;
  event_id: string;
  events: { name: string } | { name: string }[] | null;
}

interface AppRow {
  id: string;
  applicant_name_at_invite: string | null;
  surname: string | null;
  given_names: string | null;
  applicant_signed_at: string | null;
  referral_signed_at: string | null;
  ready_to_send_at: string | null;
  sent_to_hq_at: string | null;
  chairman_name_on_form: string | null;
}

interface SectionDef {
  title: string;
  description: string;
  status: string;
  /** Property name used as the "since" timestamp on each row. */
  timeKey: keyof AppRow;
  timeLabel: string;
  ctaLabel: string;
  hrefBuilder: (id: string) => string;
  emptyTitle: string;
  emptyDescription: string;
}

const SECTIONS: SectionDef[] = [
  {
    title: "Awaiting referral",
    description: "Applicants who signed but still need someone to vouch for them.",
    status: "PENDING_REFERRAL_ASSIGNMENT",
    timeKey: "applicant_signed_at",
    timeLabel: "Signed",
    ctaLabel: "Assign referral",
    hrefBuilder: (id) => `/branch/applications/${id}`,
    emptyTitle: "Nothing to assign",
    emptyDescription: "Signed applications waiting for a referral will appear here.",
  },
  {
    title: "Pending your review",
    description: "Path B — referral signed, your turn to forward to the Chairman.",
    status: "PENDING_BRANCH_ADMIN_REVIEW",
    timeKey: "referral_signed_at",
    timeLabel: "Referral signed",
    ctaLabel: "Review",
    hrefBuilder: (id) => `/branch/applications/${id}`,
    emptyTitle: "Nothing to review",
    emptyDescription:
      "Path-B applications waiting for an admin to forward to the Chairman will appear here.",
  },
  {
    title: "Ready to send to HQ",
    description: "Chairman has signed — pick recipients and email the PDF.",
    status: "READY_TO_SEND",
    timeKey: "ready_to_send_at",
    timeLabel: "Chairman signed",
    ctaLabel: "Review and send",
    hrefBuilder: (id) => `/branch/ready-to-send/${id}`,
    emptyTitle: "Nothing ready to send",
    emptyDescription:
      "Applications appear here once the Branch Chairman has signed.",
  },
  {
    title: "At HQ — record outcome",
    description: "Sent to HQ. Capture the result once HQ replies.",
    status: "SENT_TO_HQ",
    timeKey: "sent_to_hq_at",
    timeLabel: "Sent to HQ",
    ctaLabel: "Record outcome",
    hrefBuilder: (id) => `/branch/applications/${id}`,
    emptyTitle: "Nothing at HQ",
    emptyDescription:
      "Applications appear here after you send the PDF to HQ. Record the outcome once HQ approves or rejects.",
  },
];

export default async function BranchInboxPage() {
  const auth = await requireAuth();
  if (!auth.branch || !isBranchAdminTeam(auth.profile.role)) {
    redirect("/branch");
  }

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("applications")
    .select(
      "id, status, applicant_name_at_invite, surname, given_names, applicant_signed_at, ready_to_send_at, sent_to_hq_at, chairman_name_on_form",
    )
    .in(
      "status",
      SECTIONS.map((s) => s.status),
    )
    .order("applicant_signed_at", { ascending: true });
  const all = (rows as (AppRow & { status: string })[] | null) ?? [];

  // Inbound leads — wing-routed contacts awaiting our follow-up. Separate
  // query because leads live in a different table from applications.
  // Admin client because RLS for leads is policy-heavy and we've already
  // gated this page on isBranchAdminTeam + auth.branch.id above.
  const adminClient = createAdminClient();
  const { data: leadRows } = await adminClient
    .from("leads" as never)
    .select(
      "id, full_name, mobile_number, postal_code, status, routed_at, event_id, events!inner(name)",
    )
    .eq("routed_to_branch_id", auth.branch.id)
    .in("status", ["ROUTED", "ENGAGED"])
    .order("routed_at", { ascending: true });
  const leads = (leadRows as InboundLeadRow[] | null) ?? [];

  // Group rows by section status. Pre-build a map so we render in the
  // declared SECTIONS order regardless of DB ordering.
  const byStatus = new Map<string, AppRow[]>();
  for (const s of SECTIONS) byStatus.set(s.status, []);
  for (const r of all) {
    byStatus.get(r.status)?.push(r);
  }
  const total = all.length;
  const totalAll = total + leads.length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">Inbox</h1>
        <p className="text-text-secondary">
          {totalAll === 0
            ? "Nothing waiting on you."
            : `${totalAll} item${totalAll === 1 ? "" : "s"} need an action.`}
        </p>
      </header>

      {leads.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">
              Inbound leads{" "}
              <span className="text-base font-normal text-text-muted">
                ({leads.length})
              </span>
            </h2>
            <p className="text-sm text-text-secondary">
              Wing routed these to your branch. Send a membership invite to convert
              the lead into an application.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {leads.map((lead) => {
              const eventName = Array.isArray(lead.events)
                ? lead.events[0]?.name ?? "Event"
                : lead.events?.name ?? "Event";
              const routedAgo = lead.routed_at
                ? formatDistanceToNow(new Date(lead.routed_at), { addSuffix: true })
                : "recently";
              const isEngaged = lead.status === "ENGAGED";
              return (
                <li key={lead.id}>
                  <Card>
                    <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-col gap-1">
                        <p className="text-base font-semibold text-text-primary">
                          {lead.full_name}
                        </p>
                        <p className="text-sm text-text-muted">
                          {eventName} · routed {routedAgo} ·{" "}
                          {lead.mobile_number}
                          {lead.postal_code ? ` · ${lead.postal_code}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <MarkLeadEngagedButton
                          leadId={lead.id}
                          applicantName={lead.full_name}
                          alreadyEngaged={isEngaged}
                        />
                        <ConvertLeadButton
                          leadId={lead.id}
                          applicantName={lead.full_name}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {totalAll === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Inbox zero</CardTitle>
            <CardDescription>
              Nothing waiting. Invite a new applicant to get something moving.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/branch/initiate">Invite a new applicant</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {SECTIONS.map((section) => {
        const items = byStatus.get(section.status) ?? [];
        if (items.length === 0) return null;
        return (
          <section key={section.status} className="flex flex-col gap-3">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">
                {section.title}{" "}
                <span className="text-base font-normal text-text-muted">
                  ({items.length})
                </span>
              </h2>
              <p className="text-sm text-text-secondary">{section.description}</p>
            </div>
            <ul className="flex flex-col gap-3">
              {items.map((a) => {
                const display =
                  (a.given_names && a.surname
                    ? `${a.given_names} ${a.surname}`
                    : a.applicant_name_at_invite) ?? "(no name on record)";
                const when = a[section.timeKey] as string | null;
                const sub =
                  section.status === "READY_TO_SEND" && a.chairman_name_on_form
                    ? `${section.timeLabel} ${formatDateDDMMMYYYY(when)} · ${a.chairman_name_on_form}`
                    : `${section.timeLabel} ${formatDateDDMMMYYYY(when)}`;
                return (
                  <li key={a.id}>
                    <Card>
                      <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col">
                          <p className="text-base font-semibold text-text-primary">
                            {display}
                          </p>
                          <p className="text-sm text-text-muted">{sub}</p>
                        </div>
                        <Button asChild>
                          <Link href={section.hrefBuilder(a.id)}>
                            {section.ctaLabel}
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
