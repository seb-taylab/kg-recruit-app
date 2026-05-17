/**
 * Wing triage — three sections, simple list.
 *
 *   New      — status CAPTURED, no route yet (wing's action queue)
 *   Routed   — status ROUTED or ENGAGED, awaiting conversion
 *   Closed   — status CONVERTED / ARCHIVED / STALLED / COLD (recent only)
 *
 * Sprint 2 = first-route + archive. Reroute, Hot/Warm/Cool/Cold scoring,
 * branch capacity indicator → Sprint 3.
 */
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { RouteLeadButton } from "@/components/wing/RouteLeadButton";
import { RerouteLeadButton } from "@/components/wing/RerouteLeadButton";
import { isWingRole } from "@/types/database";
import { suggestBranchesForPostals } from "@/lib/wing/postal-suggest";

interface LeadRow {
  id: string;
  full_name: string;
  mobile_number: string;
  postal_code: string | null;
  status: string;
  captured_at: string;
  routed_at: string | null;
  routed_to_branch_id: string | null;
  reroute_count: number;
  event_id: string;
  events: { name: string } | { name: string }[] | null;
  routed_to: { id: string; name: string } | { id: string; name: string }[] | null;
}

interface TerritorialBranch {
  id: string;
  name: string;
  constituency: string | null;
}

export default async function WingTriagePage() {
  const auth = await requireAuth();

  if (!isWingRole(auth.profile.role)) {
    if (auth.profile.role === "taylab_staff") redirect("/taylab");
    redirect("/branch");
  }
  if (!auth.branch || auth.branch.branch_type !== "wing") {
    redirect("/wing");
  }

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("leads" as never)
    .select(
      `id, full_name, mobile_number, postal_code, status, captured_at,
       routed_at, routed_to_branch_id, reroute_count, event_id,
       events!inner(name),
       routed_to:branches!leads_routed_to_branch_id_fkey(id, name)`,
    )
    .eq("wing_branch_id", auth.branch.id)
    .order("captured_at", { ascending: false })
    .limit(200);
  const leads = (rows as LeadRow[] | null) ?? [];

  // Territorial branches for the route picker. Wing admins need to see ALL
  // territorial branches (not just those affiliated to their wing) — routing
  // is the wing's call, not enforced by affiliation.
  const { data: branchRows } = await admin
    .from("branches" as never)
    .select("id, name, constituency")
    .eq("branch_type", "territorial")
    .eq("is_active", true)
    .order("name");
  const territorialBranches = (branchRows as TerritorialBranch[] | null) ?? [];

  // Sprint 5: postal-code → constituency → suggested-branch lookup. One
  // round-trip for all visible leads. Lets the Route + Reroute dialogs
  // pre-highlight the right branch instead of forcing the admin to scan
  // a flat list of every territorial branch.
  const postalSuggestions = await suggestBranchesForPostals(leads.map((l) => l.postal_code));

  const newLeads = leads.filter((l) => l.status === "CAPTURED");
  const routedLeads = leads.filter((l) => l.status === "ROUTED" || l.status === "ENGAGED");
  const closedLeads = leads.filter((l) =>
    ["CONVERTED", "ARCHIVED", "STALLED", "COLD"].includes(l.status),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">Triage</h1>
        <p className="text-text-secondary">
          {newLeads.length} new · {routedLeads.length} routed · {closedLeads.length} closed
        </p>
      </header>

      {leads.length === 0 && (
        <Alert variant="info">
          <AlertDescription>
            No leads captured yet. Open <code>/wing/events</code>, create an event, and use
            its capture URL on the booth tablet.
          </AlertDescription>
        </Alert>
      )}

      {newLeads.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-text-primary">
            New — needs routing
          </h2>
          <div className="flex flex-col gap-2">
            {newLeads.map((lead) => {
              const suggestion = lead.postal_code
                ? postalSuggestions.get(lead.postal_code)
                : null;
              return (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  renderAction={
                    auth.profile.role === "wing_admin" ? (
                      <RouteLeadButton
                        leadId={lead.id}
                        applicantName={lead.full_name}
                        territorialBranches={territorialBranches}
                        suggestedConstituency={suggestion?.constituency ?? null}
                        suggestedBranchIds={suggestion?.suggestedBranchIds ?? []}
                      />
                    ) : null
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {routedLeads.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-text-primary">
            Routed — awaiting branch follow-up
          </h2>
          <div className="flex flex-col gap-2">
            {routedLeads.map((lead) => {
              const suggestion = lead.postal_code
                ? postalSuggestions.get(lead.postal_code)
                : null;
              const currentBranch = Array.isArray(lead.routed_to)
                ? lead.routed_to[0]
                : lead.routed_to;
              return (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  renderAction={
                    auth.profile.role === "wing_admin" &&
                    lead.routed_to_branch_id &&
                    currentBranch ? (
                      <RerouteLeadButton
                        leadId={lead.id}
                        applicantName={lead.full_name}
                        currentBranchId={lead.routed_to_branch_id}
                        currentBranchName={currentBranch.name}
                        territorialBranches={territorialBranches}
                        suggestedConstituency={suggestion?.constituency ?? null}
                        suggestedBranchIds={suggestion?.suggestedBranchIds ?? []}
                        rerouteCount={lead.reroute_count}
                      />
                    ) : null
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {closedLeads.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-text-primary">
            Closed — recent
          </h2>
          <div className="flex flex-col gap-2">
            {closedLeads.slice(0, 20).map((lead) => (
              <LeadCard key={lead.id} lead={lead} renderAction={null} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function LeadCard({
  lead,
  renderAction,
}: {
  lead: LeadRow;
  renderAction: React.ReactNode;
}) {
  const eventName = Array.isArray(lead.events)
    ? lead.events[0]?.name
    : lead.events?.name ?? "Event";
  const routedBranch = Array.isArray(lead.routed_to)
    ? lead.routed_to[0]
    : lead.routed_to;
  const capturedAgo = formatDistanceToNow(new Date(lead.captured_at), {
    addSuffix: true,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">{lead.full_name}</CardTitle>
            <CardDescription>
              {eventName} · captured {capturedAgo}
              {lead.postal_code ? ` · ${lead.postal_code}` : ""}
              {routedBranch ? ` · routed to ${routedBranch.name}` : ""}
              {lead.reroute_count > 0
                ? ` · rerouted ${lead.reroute_count}×`
                : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-text-secondary">
              {lead.status}
            </span>
            {renderAction}
          </div>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-text-muted">
        {lead.mobile_number}
      </CardContent>
    </Card>
  );
}
