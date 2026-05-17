/**
 * @tier organism
 * @consumes ui/Button, ui/Dialog, ui/Select, ui/Textarea, sonner
 * @used-by app/(dashboard)/wing/triage/page.tsx
 *
 * Reroute a lead from its currently-routed branch to a different territorial
 * branch. Requires a reason — wing audit trail. Shows the postal-derived
 * constituency hint and pre-highlights suggested branches.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { rerouteLeadAction } from "@/app/(dashboard)/wing/triage/actions";

interface TerritorialBranch {
  id: string;
  name: string;
  constituency: string | null;
}

interface RerouteLeadButtonProps {
  leadId: string;
  applicantName: string;
  currentBranchId: string;
  currentBranchName: string;
  territorialBranches: TerritorialBranch[];
  /** ELD-derived constituency for the lead's postal code (display hint). */
  suggestedConstituency: string | null;
  /** Branch IDs to pre-highlight as exact-constituency matches (★). */
  suggestedBranchIds: string[];
  /** Sprint 6: PAP district resolved via constituency_directory. */
  suggestedDistrict?: string | null;
  /** Sprint 6: same-district fallback branches (◇). */
  sameDistrictBranchIds?: string[];
  /** Existing reroute count — shown to underscore "this is reroute N+1". */
  rerouteCount: number;
}

const REASON_LABELS = {
  no_engagement: "No engagement from the branch",
  branch_declined: "Branch declined / passed",
  applicant_request: "Applicant asked for a different branch",
  wing_judgment: "Wing-side judgment call",
  other: "Other",
} as const;

type RerouteReason = keyof typeof REASON_LABELS;

export function RerouteLeadButton({
  leadId,
  applicantName,
  currentBranchId,
  currentBranchName,
  territorialBranches,
  suggestedConstituency,
  suggestedBranchIds,
  suggestedDistrict = null,
  sameDistrictBranchIds = [],
  rerouteCount,
}: RerouteLeadButtonProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [targetId, setTargetId] = React.useState<string>("");
  const [reason, setReason] = React.useState<RerouteReason>("no_engagement");
  const [reasonNote, setReasonNote] = React.useState("");
  const [pending, setPending] = React.useState(false);

  // Available branches = all territorial branches except the current one.
  const available = territorialBranches.filter((b) => b.id !== currentBranchId);
  const exactSet = new Set(suggestedBranchIds);
  const districtSet = new Set(sameDistrictBranchIds);
  // Order: exact match (★), then same-district (◇), then alphabetical.
  const ordered = available.slice().sort((a, b) => {
    const aRank = exactSet.has(a.id) ? 0 : districtSet.has(a.id) ? 1 : 2;
    const bRank = exactSet.has(b.id) ? 0 : districtSet.has(b.id) ? 1 : 2;
    if (aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name);
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId) return;
    setPending(true);
    const result = await rerouteLeadAction({
      leadId,
      targetBranchId: targetId,
      reason,
      reasonNote,
    });
    setPending(false);
    if (result.ok) {
      const branchLabel =
        territorialBranches.find((b) => b.id === targetId)?.name ?? "branch";
      toast.success(`${applicantName} rerouted from ${currentBranchName} to ${branchLabel}.`);
      setOpen(false);
      setTargetId("");
      setReasonNote("");
      router.refresh();
    } else {
      toast.error(result.error ?? "Couldn't reroute.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          Reroute
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Reroute {applicantName}</DialogTitle>
            <DialogDescription>
              Currently at <strong>{currentBranchName}</strong>
              {rerouteCount > 0 ? ` · already rerouted ${rerouteCount} time(s)` : ""}. Routing
              this lead elsewhere removes it from {currentBranchName}&rsquo;s inbox.
            </DialogDescription>
          </DialogHeader>

          {suggestedConstituency && (
            <div className="rounded-md border border-border bg-surface-page p-3 text-sm">
              <p className="text-text-muted">From postal code</p>
              <p className="font-medium text-text-primary">
                {suggestedConstituency}
                {suggestedDistrict ? (
                  <span className="font-normal text-text-secondary">
                    {" · "}
                    {suggestedDistrict} District
                  </span>
                ) : null}
              </p>
              {suggestedBranchIds.length === 0 && sameDistrictBranchIds.length === 0 && (
                <p className="mt-1 text-xs text-text-muted">
                  No branch matches this constituency or district — pick the closest fit.
                </p>
              )}
              {suggestedBranchIds.length === 0 && sameDistrictBranchIds.length > 0 && (
                <p className="mt-1 text-xs text-text-muted">
                  No exact constituency match — ◇ rows are same-district fallbacks.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="reroute-target">
              New branch
            </label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger id="reroute-target">
                <SelectValue placeholder="Pick a branch…" />
              </SelectTrigger>
              <SelectContent>
                {ordered.map((b) => {
                  const marker = exactSet.has(b.id)
                    ? "★ "
                    : districtSet.has(b.id)
                      ? "◇ "
                      : "";
                  return (
                    <SelectItem key={b.id} value={b.id}>
                      {marker}
                      {b.name}
                      {b.constituency ? ` · ${b.constituency}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="reroute-reason">
              Reason
            </label>
            <Select value={reason} onValueChange={(v) => setReason(v as RerouteReason)}>
              <SelectTrigger id="reroute-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(REASON_LABELS) as [RerouteReason, string][]).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="reroute-note">
              Note (optional)
            </label>
            <Textarea
              id="reroute-note"
              rows={2}
              maxLength={500}
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="Context for the audit trail…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !targetId}>
              {pending ? "Rerouting…" : "Reroute"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
