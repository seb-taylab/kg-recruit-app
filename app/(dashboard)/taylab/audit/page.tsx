import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateDDMMMYYYY } from "@/lib/format/date";

interface AuditRow {
  id: string;
  branch_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface BranchRow {
  id: string;
  name: string;
}

const PAGE_SIZE = 100;

const COMMON_ACTIONS = [
  "all",
  "CREATED",
  "INVITED",
  "SIGNED",
  "SENT_TO_HQ",
  "HQ_OUTCOME_RECORDED_APPROVED",
  "HQ_OUTCOME_RECORDED_REJECTED",
  "HQ_OUTCOME_REVERSED",
  "ARCHIVED",
  "UNARCHIVED",
  "NUDGE_SENT",
  "NRIC_PURGED",
  "SETTINGS_CHANGED",
  "USER_INVITED",
  "USER_DEACTIVATED",
  "USER_REACTIVATED",
  "USER_PROMOTED",
  "USER_DEMOTED",
] as const;

export default async function TaylabAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; action?: string }>;
}) {
  const auth = await requireAuth();
  if (auth.profile.role !== "taylab_staff") {
    redirect("/branch");
  }

  const { branch: branchFilter, action: actionFilter } = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("audit_log" as never)
    .select("id, branch_id, actor_email, actor_role, action, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (branchFilter && branchFilter !== "all") {
    query = query.eq("branch_id", branchFilter);
  }
  if (actionFilter && actionFilter !== "all") {
    query = query.eq("action", actionFilter);
  }
  const [rowsRes, branchesRes] = await Promise.all([
    query,
    admin.from("branches" as never).select("id, name").order("name"),
  ]);
  const rows = (rowsRes.data as AuditRow[] | null) ?? [];
  const branches = (branchesRes.data as BranchRow[] | null) ?? [];
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

  function buildHref(next: { branch?: string; action?: string }): string {
    const params = new URLSearchParams();
    const branch = next.branch ?? branchFilter;
    const action = next.action ?? actionFilter;
    if (branch && branch !== "all") params.set("branch", branch);
    if (action && action !== "all") params.set("action", action);
    const q = params.toString();
    return q ? `/taylab/audit?${q}` : "/taylab/audit";
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-blue">Taylab</p>
        <h1 className="text-3xl font-bold leading-tight text-text-primary">Audit log</h1>
        <p className="text-text-secondary">
          Most recent {PAGE_SIZE} events. Filter by branch and action.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filters compose — pick one of each.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-text-primary">Branch</p>
            <div className="flex flex-wrap gap-2">
              <Button
                asChild
                size="sm"
                variant={!branchFilter || branchFilter === "all" ? "primary" : "outline"}
              >
                <Link href={buildHref({ branch: "all" })}>All</Link>
              </Button>
              {branches.map((b) => (
                <Button
                  key={b.id}
                  asChild
                  size="sm"
                  variant={branchFilter === b.id ? "primary" : "outline"}
                >
                  <Link href={buildHref({ branch: b.id })}>{b.name}</Link>
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-text-primary">Action</p>
            <div className="flex flex-wrap gap-2">
              {COMMON_ACTIONS.map((a) => (
                <Button
                  key={a}
                  asChild
                  size="sm"
                  variant={(actionFilter ?? "all") === a ? "primary" : "outline"}
                >
                  <Link href={buildHref({ action: a })}>{a === "all" ? "All" : a}</Link>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {rows.length} event{rows.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing matches these filters.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-1 rounded-md border border-border bg-surface-page p-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-text-primary">{r.action}</p>
                    <p className="text-xs text-text-muted">
                      {formatDateDDMMMYYYY(r.created_at)}
                    </p>
                  </div>
                  <p className="text-xs text-text-secondary">
                    {r.actor_email ?? "system"} · {r.actor_role ?? "—"} ·{" "}
                    {r.branch_id ? (branchNameById.get(r.branch_id) ?? "(unknown branch)") : "platform"}
                  </p>
                  {r.metadata && (
                    <pre className="overflow-x-auto rounded bg-surface-card p-2 text-xs text-text-secondary">
                      {JSON.stringify(r.metadata, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
