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
import { formatDateDDMMMYYYY } from "@/lib/format/date";

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

  // Group rows by section status. Pre-build a map so we render in the
  // declared SECTIONS order regardless of DB ordering.
  const byStatus = new Map<string, AppRow[]>();
  for (const s of SECTIONS) byStatus.set(s.status, []);
  for (const r of all) {
    byStatus.get(r.status)?.push(r);
  }
  const total = all.length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">Inbox</h1>
        <p className="text-text-secondary">
          {total === 0
            ? "Nothing waiting on you."
            : `${total} application${total === 1 ? "" : "s"} need an action.`}
        </p>
      </header>

      {total === 0 && (
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
