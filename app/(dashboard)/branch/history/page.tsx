/**
 * History — consolidates Completed + HQ rejected + Archived into one page
 * with tab filters. Replaces the three separate routes (rolled up to
 * declutter the sidebar). Each row links to the application detail page;
 * "Unarchive" remains a row action on archived items.
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
import { UnarchiveButton } from "@/components/branch/UnarchiveButton";
import { requireAuth } from "@/lib/auth/get-user";
import { isBranchAdminTeam } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { formatDateDDMMMYYYY } from "@/lib/format/date";
import { cn } from "@/lib/utils/cn";

type Tab = "all" | "completed" | "hq-rejected" | "archived";

interface AppRow {
  id: string;
  status: string;
  applicant_name_at_invite: string | null;
  surname: string | null;
  given_names: string | null;
  completed_at: string | null;
  hq_outcome_recorded_at: string | null;
  hq_approved_date: string | null;
  hq_approved_membership_no: string | null;
  hq_rejected_date: string | null;
  hq_rejected_reason: string | null;
  archived_at: string | null;
  archive_reason: string | null;
  pre_archive_status: string | null;
}

const TAB_TO_STATUSES: Record<Tab, string[]> = {
  all: ["COMPLETED", "HQ_REJECTED", "ARCHIVED"],
  completed: ["COMPLETED"],
  "hq-rejected": ["HQ_REJECTED"],
  archived: ["ARCHIVED"],
};

const TAB_LABEL: Record<Tab, string> = {
  all: "All",
  completed: "Completed",
  "hq-rejected": "HQ rejected",
  archived: "Archived",
};

function tabFor(status: string): Tab {
  if (status === "COMPLETED") return "completed";
  if (status === "HQ_REJECTED") return "hq-rejected";
  if (status === "ARCHIVED") return "archived";
  return "all";
}

function statusBadge(status: string): string {
  if (status === "COMPLETED") return "border-state-success text-state-success";
  if (status === "HQ_REJECTED") return "border-state-error text-state-error";
  return "border-border text-text-muted";
}

function statusLabel(status: string): string {
  if (status === "COMPLETED") return "Completed";
  if (status === "HQ_REJECTED") return "HQ rejected";
  if (status === "ARCHIVED") return "Archived";
  return status;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const auth = await requireAuth();
  if (!auth.branch || !isBranchAdminTeam(auth.profile.role)) {
    redirect("/branch");
  }
  const { tab: rawTab } = await searchParams;
  const tab: Tab = (rawTab as Tab) in TAB_TO_STATUSES ? (rawTab as Tab) : "all";

  // Hard ceiling on what's rendered in one shot. Closed/Archived rows
  // accumulate forever — without a limit, a branch with thousands of
  // historical applications pulls them all on every visit. PAGE_SIZE+1
  // is the "is there more?" probe (cheap pagination signal).
  const PAGE_SIZE = 200;
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("applications")
    .select(
      "id, status, applicant_name_at_invite, surname, given_names, completed_at, hq_outcome_recorded_at, hq_approved_date, hq_approved_membership_no, hq_rejected_date, hq_rejected_reason, archived_at, archive_reason, pre_archive_status",
    )
    .in("status", TAB_TO_STATUSES[tab])
    // Newest first — denormalised activity_at would be cleaner; for now
    // any of the per-status timestamps work as a proxy.
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(PAGE_SIZE + 1);
  const allRows = (rows as AppRow[] | null) ?? [];
  const hasMore = allRows.length > PAGE_SIZE;
  const apps = hasMore ? allRows.slice(0, PAGE_SIZE) : allRows;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">History</h1>
        <p className="text-text-secondary">
          Completed, HQ-rejected, and archived applications.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="History filter"
        className="inline-flex items-center gap-1 self-start rounded-md border border-border bg-surface-card p-1"
      >
        {(Object.keys(TAB_TO_STATUSES) as Tab[]).map((t) => {
          const active = t === tab;
          return (
            <Link
              key={t}
              role="tab"
              aria-selected={active}
              href={t === "all" ? "/branch/history" : `/branch/history?tab=${t}`}
              className={cn(
                "rounded-sm px-3 py-1 text-sm font-medium transition-colors duration-fast",
                active
                  ? "bg-surface-page text-text-primary"
                  : "text-text-secondary hover:bg-surface-page hover:text-text-primary",
              )}
            >
              {TAB_LABEL[t]}
            </Link>
          );
        })}
      </div>

      {apps.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing here yet</CardTitle>
            <CardDescription>
              Applications appear once they reach Completed, HQ rejected, or Archived.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {apps.map((a) => {
            const display =
              (a.given_names && a.surname
                ? `${a.given_names} ${a.surname}`
                : a.applicant_name_at_invite) ?? "(no name on record)";
            const ownTab = tabFor(a.status);
            const when =
              a.status === "COMPLETED"
                ? a.hq_approved_date ?? a.completed_at
                : a.status === "HQ_REJECTED"
                  ? a.hq_rejected_date ?? a.hq_outcome_recorded_at
                  : a.archived_at;
            const sub =
              a.status === "COMPLETED"
                ? `Approved ${formatDateDDMMMYYYY(when)}${a.hq_approved_membership_no ? ` · Membership #${a.hq_approved_membership_no}` : ""}`
                : a.status === "HQ_REJECTED"
                  ? `Rejected ${formatDateDDMMMYYYY(when)}${a.hq_rejected_reason ? ` · ${a.hq_rejected_reason}` : ""}`
                  : `Archived ${formatDateDDMMMYYYY(when)}${a.pre_archive_status ? ` · was ${a.pre_archive_status}` : ""}`;
            return (
              <li key={a.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-col">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-semibold text-text-primary">
                          {display}
                        </p>
                        {tab === "all" && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium",
                              statusBadge(a.status),
                            )}
                          >
                            {statusLabel(a.status)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-text-muted">{sub}</p>
                      {a.status === "ARCHIVED" && a.archive_reason && (
                        <p className="mt-1 text-sm text-text-secondary">
                          &ldquo;{a.archive_reason}&rdquo;
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button asChild variant="outline">
                        <Link href={`/branch/applications/${a.id}`}>View</Link>
                      </Button>
                      {ownTab === "archived" && (
                        <UnarchiveButton applicationId={a.id} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && (
        <p className="text-sm text-text-muted">
          Showing the most recent {PAGE_SIZE}. Older rows aren&rsquo;t loaded —
          ask Taylab for an export if you need the full archive.
        </p>
      )}
    </div>
  );
}
