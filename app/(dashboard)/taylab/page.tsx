/**
 * Taylab platform overview — cross-tenant stats and recent activity.
 * Counts come from the admin client (RLS bypass) so the page returns the
 * true totals even when policies tighten elsewhere.
 */
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateDDMMMYYYY } from "@/lib/format/date";

interface AuditRow {
  id: string;
  action: string;
  actor_email: string | null;
  branch_id: string | null;
  created_at: string;
}

const IN_FLIGHT_STATUSES = [
  "APPLICANT_INVITED",
  "APPLICANT_FILLING",
  "SIGNED_BY_APPLICANT",
  "PENDING_REFERRAL_ASSIGNMENT",
  "REFERRAL_INVITED",
  "SIGNED_BY_REFERRAL",
  "PENDING_BRANCH_ADMIN_REVIEW",
  "PENDING_CHAIRMAN",
  "SIGNED_BY_CHAIRMAN",
  "READY_TO_SEND",
  "SENT_TO_HQ",
];

export default async function TaylabOverviewPage() {
  const auth = await requireAuth();
  const admin = createAdminClient();

  const [
    { count: branchCount },
    { count: profileCount },
    { count: appCount },
    { count: inFlightCount },
    { count: completedCount },
    { data: recentAudit },
    { data: branchRows },
  ] = await Promise.all([
    admin.from("branches" as never).select("*", { count: "exact", head: true }),
    admin.from("profiles" as never).select("*", { count: "exact", head: true }),
    admin.from("applications" as never).select("*", { count: "exact", head: true }),
    admin
      .from("applications" as never)
      .select("*", { count: "exact", head: true })
      .in("status", IN_FLIGHT_STATUSES),
    admin
      .from("applications" as never)
      .select("*", { count: "exact", head: true })
      .eq("status", "COMPLETED"),
    admin
      .from("audit_log" as never)
      .select("id, action, actor_email, branch_id, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    admin.from("branches" as never).select("id, name"),
  ]);

  const branchNameById = new Map(
    ((branchRows as Array<{ id: string; name: string }> | null) ?? []).map((b) => [
      b.id,
      b.name,
    ]),
  );
  const audit = (recentAudit as AuditRow[] | null) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-blue">Taylab</p>
        <h1 className="text-3xl font-bold leading-tight text-text-primary">Platform overview</h1>
        <p className="text-text-secondary">Signed in as {auth.profile.full_name ?? auth.email}.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Across tenants" title="Branches" value={branchCount ?? 0} />
        <StatCard label="All roles" title="Users" value={profileCount ?? 0} />
        <StatCard label="Lifetime" title="Applications" value={appCount ?? 0} />
        <StatCard label="In flight" title="Open" value={inFlightCount ?? 0} />
        <StatCard label="HQ approved" title="Completed" value={completedCount ?? 0} />
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Last 10 audit events across all tenants.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/taylab/audit">Open full log</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-text-muted">No audit events yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {audit.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-1 rounded-md border border-border bg-surface-page p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col">
                    <p className="text-sm font-semibold text-text-primary">{a.action}</p>
                    <p className="text-xs text-text-secondary">
                      {a.actor_email ?? "system"} ·{" "}
                      {a.branch_id ? (branchNameById.get(a.branch_id) ?? "(unknown)") : "platform"}
                    </p>
                  </div>
                  <p className="text-xs text-text-muted">{formatDateDDMMMYYYY(a.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, title, value }: { label: string; title: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold text-text-primary">{value}</p>
      </CardContent>
    </Card>
  );
}
