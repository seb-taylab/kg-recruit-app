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

/**
 * History row joined with the FROM-branch name. Used to surface "Returned
 * by {branch}" hints on leads that have come back to the wing's queue.
 */
interface HistoryRow {
  lead_id: string;
  from_branch_id: string | null;
  to_branch_id: string;
  reason: string;
  reason_note: string | null;
  routed_at: string;
  from_branch: { name: string } | { name: string }[] | null;
}

/** Compact attribution shown on a CAPTURED lead that was previously returned
 *  by a branch. Drives the "↶ Returned by KG · Wrong constituency" pill. */
interface ReturnedAttribution {
  fromBranchName: string;
  reasonLabel: string;
  reasonNote: string | null;
  routedAt: string;
}

// Mirrors the reason values used by returnLeadToWingAction; pretty for UI.
const RETURN_REASON_PRETTY: Record<string, string> = {
  wrong_constituency: "Wrong constituency",
  already_member: "Already a member elsewhere",
  not_residing_here: "Not residing here",
  applicant_request: "Applicant request",
  quality_concern: "Quality concern",
  other: "Other",
};

/** Best-effort: branch return action composes reason_note as
 *  "Reason: wrong_constituency — {free text}". Extract the structured
 *  reason label if the prefix is present; otherwise fall back to a generic
 *  "Returned" label. */
function parseReturnedReasonNote(note: string | null): {
  label: string;
  freeText: string | null;
} {
  if (!note) return { label: "Returned", freeText: null };
  const match = note.match(/^Reason:\s*([a-z_]+)(?:\s*—\s*(.*))?$/i);
  if (!match) return { label: "Returned", freeText: note };
  const key = match[1].toLowerCase();
  return {
    label: RETURN_REASON_PRETTY[key] ?? "Returned",
    freeText: match[2]?.trim() || null,
  };
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

  // Leads + territorial branches are independent — parallelize. History +
  // postal suggestions depend on leadIds, so they stay sequential below.
  //
  // Territorial branches for the route picker. Wing admins need to see ALL
  // territorial branches (not just those affiliated to their wing) — routing
  // is the wing's call, not enforced by affiliation.
  const [{ data: rows }, { data: branchRows }] = await Promise.all([
    admin
      .from("leads" as never)
      .select(
        `id, full_name, mobile_number, postal_code, status, captured_at,
         routed_at, routed_to_branch_id, reroute_count, event_id,
         events!inner(name),
         routed_to:branches!leads_routed_to_branch_id_fkey(id, name)`,
      )
      .eq("wing_branch_id", auth.branch.id)
      .order("captured_at", { ascending: false })
      .limit(200),
    admin
      .from("branches" as never)
      .select("id, name, constituency")
      .eq("branch_type", "territorial")
      .eq("is_active", true)
      .order("name"),
  ]);
  const leads = (rows as LeadRow[] | null) ?? [];
  const territorialBranches = (branchRows as TerritorialBranch[] | null) ?? [];

  // Sprint 6 polish — Returned-from-branch attribution. For every visible
  // lead, pull the latest history rows so the UI can surface
  // "↶ Returned by KG · Wrong constituency" on leads that came back to
  // the wing's queue after a branch declined them. One round-trip; we
  // group + pick latest per lead in-memory because the volume is small.
  const leadIds = leads.map((l) => l.id);
  const returnedByLead = new Map<string, ReturnedAttribution>();
  if (leadIds.length > 0) {
    const { data: historyRows } = await admin
      .from("lead_route_history" as never)
      .select(
        `lead_id, from_branch_id, to_branch_id, reason, reason_note, routed_at,
         from_branch:branches!lead_route_history_from_branch_id_fkey(name)`,
      )
      .in("lead_id", leadIds)
      .eq("reason", "branch_declined")
      .order("routed_at", { ascending: false });
    const history = (historyRows as HistoryRow[] | null) ?? [];
    for (const row of history) {
      // Only register the LATEST branch-declined event per lead — the loop
      // is ordered DESC, so the first hit per lead wins.
      if (returnedByLead.has(row.lead_id)) continue;
      const fromBranch = Array.isArray(row.from_branch)
        ? row.from_branch[0]
        : row.from_branch;
      if (!fromBranch) continue;
      const parsed = parseReturnedReasonNote(row.reason_note);
      returnedByLead.set(row.lead_id, {
        fromBranchName: fromBranch.name,
        reasonLabel: parsed.label,
        reasonNote: parsed.freeText,
        routedAt: row.routed_at,
      });
    }
  }

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
                  returned={returnedByLead.get(lead.id) ?? null}
                  renderAction={
                    auth.profile.role === "wing_admin" ? (
                      <RouteLeadButton
                        leadId={lead.id}
                        applicantName={lead.full_name}
                        territorialBranches={territorialBranches}
                        suggestedConstituency={suggestion?.constituency ?? null}
                        suggestedBranchIds={suggestion?.suggestedBranchIds ?? []}
                        suggestedDistrict={suggestion?.district ?? null}
                        sameDistrictBranchIds={suggestion?.sameDistrictBranchIds ?? []}
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
                  returned={null}
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
                        suggestedDistrict={suggestion?.district ?? null}
                        sameDistrictBranchIds={suggestion?.sameDistrictBranchIds ?? []}
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
              <LeadCard
                key={lead.id}
                lead={lead}
                returned={null}
                renderAction={null}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function LeadCard({
  lead,
  returned,
  renderAction,
}: {
  lead: LeadRow;
  /** Set only for CAPTURED leads that were previously returned by a
   *  branch — surfaces a "↶ Returned by KG · Wrong constituency" pill. */
  returned: ReturnedAttribution | null;
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
  const returnedAgo = returned
    ? formatDistanceToNow(new Date(returned.routedAt), { addSuffix: true })
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{lead.full_name}</CardTitle>
              {/* Returned attribution pill — only shown on CAPTURED leads
                  that have a branch-declined history entry. Makes it
                  visually obvious that this isn't a fresh capture. */}
              {returned && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-state-warning px-2 py-0.5 text-xs font-medium text-state-warning"
                  title={returned.reasonNote ?? undefined}
                >
                  ↶ Returned by {returned.fromBranchName} · {returned.reasonLabel}
                </span>
              )}
            </div>
            <CardDescription>
              {eventName} · captured {capturedAgo}
              {lead.postal_code ? ` · ${lead.postal_code}` : ""}
              {routedBranch ? ` · routed to ${routedBranch.name}` : ""}
              {lead.reroute_count > 0
                ? ` · rerouted ${lead.reroute_count}×`
                : ""}
            </CardDescription>
            {/* Optional free-text the branch admin left when returning.
                Surfaced as a one-line note so wing can read it without
                hovering for tooltips. */}
            {returned?.reasonNote && (
              <p className="text-xs italic text-text-muted">
                &ldquo;{returned.reasonNote}&rdquo; — returned {returnedAgo}
              </p>
            )}
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
