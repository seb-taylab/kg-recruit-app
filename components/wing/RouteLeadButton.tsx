/**
 * @tier organism
 * @consumes ui/Button, ui/Dialog, ui/Select, sonner
 * @used-by app/(dashboard)/wing/triage/page.tsx
 *
 * Per-lead route dialog. Picks a territorial branch from a server-supplied
 * list and submits the routing action. Sprint 2 = first route only; the
 * fuller reroute UX (with auto-suggest by postal + capacity indicator)
 * lands in Sprint 3.
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
import { routeLeadAction } from "@/app/(dashboard)/wing/triage/actions";

interface TerritorialBranch {
  id: string;
  name: string;
  constituency: string | null;
}

interface RouteLeadButtonProps {
  leadId: string;
  applicantName: string;
  territorialBranches: TerritorialBranch[];
  /** Sprint 5: ELD-derived constituency from the lead's postal code. */
  suggestedConstituency?: string | null;
  /** Sprint 5: branch IDs that match the suggested constituency. */
  suggestedBranchIds?: string[];
  /** Sprint 6: PAP district resolved via constituency_directory. */
  suggestedDistrict?: string | null;
  /** Sprint 6: same-district fallback branch IDs (one tier weaker than
   * exact-constituency match — surfaced with a different marker). */
  sameDistrictBranchIds?: string[];
}

export function RouteLeadButton({
  leadId,
  applicantName,
  territorialBranches,
  suggestedConstituency = null,
  suggestedBranchIds = [],
  suggestedDistrict = null,
  sameDistrictBranchIds = [],
}: RouteLeadButtonProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [targetId, setTargetId] = React.useState<string>("");
  const [pending, setPending] = React.useState(false);

  // Pre-select the suggestion when there's exactly one EXACT match. Set on
  // dialog open via onOpenChange (not inside useEffect — react-hooks lint
  // forbids set-state-in-effect for derived defaults).
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && targetId === "" && suggestedBranchIds.length === 1) {
      setTargetId(suggestedBranchIds[0]);
    }
  }

  const exactSet = new Set(suggestedBranchIds);
  const districtSet = new Set(sameDistrictBranchIds);
  // Order: exact constituency match first (★), then same-district (◇),
  // then everything else alphabetical.
  const ordered = territorialBranches.slice().sort((a, b) => {
    const aRank = exactSet.has(a.id) ? 0 : districtSet.has(a.id) ? 1 : 2;
    const bRank = exactSet.has(b.id) ? 0 : districtSet.has(b.id) ? 1 : 2;
    if (aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name);
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId) return;
    setPending(true);
    const result = await routeLeadAction({ leadId, targetBranchId: targetId });
    setPending(false);
    if (result.ok) {
      const branchLabel =
        territorialBranches.find((b) => b.id === targetId)?.name ?? "branch";
      toast.success(`${applicantName} routed to ${branchLabel}.`);
      setOpen(false);
      setTargetId("");
      router.refresh();
    } else {
      toast.error(result.error ?? "Couldn't route.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" type="button">
          Route
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Route {applicantName}</DialogTitle>
            <DialogDescription>
              Pick the territorial branch that will follow up. The branch will see
              this lead in their inbox as inbound from your wing.
            </DialogDescription>
          </DialogHeader>

          {suggestedConstituency && (
            <div className="my-4 rounded-md border border-border bg-surface-page p-3 text-sm">
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
                  No territorial branch matches this constituency or district — pick the closest fit.
                </p>
              )}
              {suggestedBranchIds.length === 0 && sameDistrictBranchIds.length > 0 && (
                <p className="mt-1 text-xs text-text-muted">
                  No exact constituency match — ◇ rows are same-district fallbacks.
                </p>
              )}
            </div>
          )}

          <div className="my-4 flex flex-col gap-2">
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger>
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !targetId}>
              {pending ? "Routing…" : "Route"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
