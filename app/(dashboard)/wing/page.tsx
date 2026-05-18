/**
 * Wing workspace — Overview.
 *
 * Real content (Sprint 4): live lead funnel + per-event breakdown +
 * per-branch conversion summary. All driven by the leads table; no
 * placeholder copy.
 *
 * 2026-05-18: added per-branch return-rate column (#3 of the post-YP40
 * audit). Sources from lead_route_history so reroutes-in count toward
 * "received" — gives the wing an honest picture of routing quality vs
 * each receiving branch ("KG: 5 received · 1 returned (20%) · 2 converted").
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Check, Undo2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWingRole, type LeadStatus } from "@/types/database";

interface LeadRow {
  id: string;
  status: LeadStatus;
  captured_at: string;
  routed_to_branch_id: string | null;
  event_id: string;
  full_name: string;
}

interface EventRow {
  id: string;
  name: string;
  is_active: boolean;
}

interface BranchRow {
  id: string;
  name: string;
}

interface RouteHistoryRow {
  lead_id: string;
  from_branch_id: string | null;
  to_branch_id: string;
  reason: string;
}

export default async function WingOverviewPage() {
  const auth = await requireAuth();

  if (!isWingRole(auth.activeProfile.role)) {
    if (auth.activeProfile.role === "taylab_staff") redirect("/taylab");
    redirect("/branch");
  }
  if (!auth.activeBranch || auth.activeBranch.branch_type !== "wing") {
    redirect("/select-workspace");
  }

  const admin = createAdminClient();

  // First fetch leads + events — the two queries that are meaningful even
  // for a brand-new wing with no captures. If leads is empty, short-circuit
  // before hitting the territorial-branch list and history (neither has
  // anything to show without leads).
  const [{ data: leadRows }, { data: eventRows }] = await Promise.all([
    admin
      .from("leads" as never)
      .select("id, status, captured_at, routed_to_branch_id, event_id, full_name")
      .eq("wing_branch_id", auth.activeBranch.id)
      .order("captured_at", { ascending: false }),
    admin
      .from("events" as never)
      .select("id, name, is_active")
      .eq("branch_id", auth.activeBranch.id),
  ]);
  const leads = (leadRows as LeadRow[] | null) ?? [];
  const events = (eventRows as EventRow[] | null) ?? [];

  // Branches + history are only needed when we have at least one lead.
  // Skip both round-trips on first-run / empty-state wings.
  const [{ data: branchRows }, { data: historyRows }] =
    leads.length > 0
      ? await Promise.all([
          admin
            .from("branches" as never)
            .select("id, name")
            .eq("branch_type", "territorial"),
          admin
            .from("lead_route_history" as never)
            .select("lead_id, from_branch_id, to_branch_id, reason")
            .eq("wing_branch_id", auth.activeBranch.id),
        ])
      : [{ data: [] as BranchRow[] }, { data: [] as RouteHistoryRow[] }];

  const branches = (branchRows as BranchRow[] | null) ?? [];
  const history = (historyRows as RouteHistoryRow[] | null) ?? [];
  const branchById = new Map(branches.map((b) => [b.id, b.name]));
  const eventById = new Map(events.map((e) => [e.id, e]));

  // Funnel counts. Order intentional — left-to-right pipeline.
  const counts = {
    captured: leads.filter((l) => l.status === "CAPTURED").length,
    routed: leads.filter((l) => l.status === "ROUTED").length,
    engaged: leads.filter((l) => l.status === "ENGAGED").length,
    converted: leads.filter((l) => l.status === "CONVERTED").length,
    stalled: leads.filter((l) => l.status === "STALLED").length,
    cold: leads.filter((l) => l.status === "COLD").length,
    archived: leads.filter((l) => l.status === "ARCHIVED").length,
  };
  const total = leads.length;
  const conversionRate = total > 0 ? Math.round((counts.converted / total) * 100) : 0;

  // Per-event breakdown (count by status). Limit to events with ≥1 lead so
  // empty events don't clutter the overview.
  const perEvent = events
    .map((ev) => {
      const evLeads = leads.filter((l) => l.event_id === ev.id);
      return {
        event: ev,
        total: evLeads.length,
        converted: evLeads.filter((l) => l.status === "CONVERTED").length,
        routed: evLeads.filter((l) =>
          ["ROUTED", "ENGAGED"].includes(l.status),
        ).length,
        captured: evLeads.filter((l) => l.status === "CAPTURED").length,
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);

  // Per-branch summary (only branches that have ever received a lead from us).
  //
  // Counting model:
  //   received  = times this branch was the to_branch_id in route history
  //               (covers initial routes AND reroutes-into-this-branch — both
  //               are "we handed them a lead").
  //   returned  = times this branch was the from_branch_id with reason
  //               'branch_declined' (the branch pushed the lead back).
  //   converted = leads currently at this branch with status=CONVERTED.
  //
  // received is from history, not leads.routed_to_branch_id, so the count
  // is stable after returns/reroutes (where the current pointer is gone).
  interface BranchBucket {
    branchId: string;
    branchName: string;
    received: number;
    returned: number;
    converted: number;
  }
  const perBranch = new Map<string, BranchBucket>();
  const ensureBucket = (branchId: string): BranchBucket => {
    const existing = perBranch.get(branchId);
    if (existing) return existing;
    const fresh: BranchBucket = {
      branchId,
      branchName: branchById.get(branchId) ?? "(unknown)",
      received: 0,
      returned: 0,
      converted: 0,
    };
    perBranch.set(branchId, fresh);
    return fresh;
  };

  for (const row of history) {
    ensureBucket(row.to_branch_id).received += 1;
    if (row.reason === "branch_declined" && row.from_branch_id) {
      ensureBucket(row.from_branch_id).returned += 1;
    }
  }
  for (const lead of leads) {
    if (!lead.routed_to_branch_id) continue;
    if (lead.status !== "CONVERTED") continue;
    ensureBucket(lead.routed_to_branch_id).converted += 1;
  }
  const branchSummary = Array.from(perBranch.values()).sort(
    (a, b) => b.received - a.received,
  );

  // Most recent 5 leads — a tiny activity feed.
  const recent = leads.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          {auth.activeBranch.name} — Overview
        </h1>
        <p className="text-text-secondary">
          {total === 0
            ? "No leads captured yet. Create an event and start capturing."
            : `${total} total leads · ${conversionRate}% converted to applications.`}
        </p>
      </header>

      {total === 0 && (
        <Alert variant="info">
          <AlertDescription>
            Head to <Link href="/wing/events" className="font-medium underline">Events</Link> to set up
            your first capture flow. Once leads arrive, this page comes alive.
          </AlertDescription>
        </Alert>
      )}

      {/* Funnel */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-3">Funnel</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FunnelStat label="Captured" value={counts.captured} tone="neutral" />
          <FunnelStat label="Routed" value={counts.routed} tone="info" />
          <FunnelStat label="Engaged" value={counts.engaged} tone="info" />
          <FunnelStat label="Converted" value={counts.converted} tone="success" />
        </div>
        {(counts.stalled > 0 || counts.cold > 0 || counts.archived > 0) && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <FunnelStat label="Stalled" value={counts.stalled} tone="warning" />
            <FunnelStat label="Cold" value={counts.cold} tone="warning" />
            <FunnelStat label="Archived" value={counts.archived} tone="neutral" />
          </div>
        )}
      </section>

      {/* Per-event */}
      {perEvent.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-3">By event</h2>
          <div className="flex flex-col gap-2">
            {perEvent.map((row) => (
              <Card key={row.event.id}>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium text-text-primary">
                      {row.event.name}
                    </span>
                    <span className="text-xs text-text-muted">
                      {row.event.is_active ? "Active" : "Closed"} · {row.total} captured ·{" "}
                      {row.captured} new · {row.routed} in flight · {row.converted} converted
                    </span>
                  </div>
                  <span className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary">
                    {row.total > 0 ? Math.round((row.converted / row.total) * 100) : 0}%
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Per-branch */}
      {branchSummary.length > 0 && (
        <section>
          <div className="mb-3 flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-text-primary">By receiving branch</h2>
            <p className="text-xs text-text-muted">
              Return rate is the share of leads the branch pushed back to us
              (wrong fit / not residing here / etc.). High = re-think routing
              criteria or branch readiness.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {branchSummary.map((row) => {
              const returnRate =
                row.received > 0 ? Math.round((row.returned / row.received) * 100) : 0;
              const conversionRate =
                row.received > 0 ? Math.round((row.converted / row.received) * 100) : 0;

              // Return-rate tone is INVERTED from conversion: 0% is good,
              // ≥40% is alarming. Calibration is rough on small samples —
              // for KG demo the bands are mostly cosmetic until we have
              // more data.
              const returnTone =
                returnRate === 0
                  ? "border-state-success text-state-success"
                  : returnRate < 25
                    ? "border-state-warning text-state-warning"
                    : "border-state-error text-state-error";
              const conversionTone =
                conversionRate >= 50
                  ? "border-state-success text-state-success"
                  : conversionRate >= 20
                    ? "border-state-warning text-state-warning"
                    : "border-border text-text-muted";

              return (
                <Card key={row.branchId}>
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-medium text-text-primary">
                        {row.branchName}
                      </span>
                      <span className="text-xs text-text-muted">
                        {row.received} received · {row.returned} returned ·{" "}
                        {row.converted} converted
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${returnTone}`}
                        title="Return rate — share of leads this branch pushed back to us"
                      >
                        <Undo2
                          className="h-3 w-3"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                        {returnRate}%
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${conversionTone}`}
                        title="Conversion rate — share of leads that became members"
                      >
                        <Check
                          className="h-3 w-3"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                        {conversionRate}%
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent activity */}
      {recent.length > 0 && (
        <section>
          <div className="flex items-end justify-between mb-3">
            <h2 className="text-lg font-semibold text-text-primary">Recent captures</h2>
            <Button asChild variant="outline" size="sm">
              <Link href="/wing/triage">View triage</Link>
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {recent.map((lead) => {
              const event = eventById.get(lead.event_id);
              return (
                <Card key={lead.id}>
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-medium text-text-primary">
                        {lead.full_name}
                      </span>
                      <span className="text-xs text-text-muted">
                        {event?.name ?? "Unknown event"} ·{" "}
                        {formatDistanceToNow(new Date(lead.captured_at), { addSuffix: true })}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {lead.status}
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function FunnelStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "info" | "warning" | "success";
}) {
  const toneClass = {
    neutral: "border-border text-text-primary",
    info: "border-state-info text-state-info",
    warning: "border-state-warning text-state-warning",
    success: "border-state-success text-state-success",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`mb-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass}`}>
          {label}
        </div>
        <p className="text-3xl font-bold text-text-primary">{value}</p>
      </CardContent>
    </Card>
  );
}
