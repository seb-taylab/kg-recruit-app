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
}

export function RouteLeadButton({
  leadId,
  applicantName,
  territorialBranches,
  suggestedConstituency = null,
  suggestedBranchIds = [],
}: RouteLeadButtonProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [targetId, setTargetId] = React.useState<string>("");
  const [pending, setPending] = React.useState(false);

  // Pre-select the suggestion when there's exactly one match. Set on dialog
  // open via onOpenChange (not inside useEffect — react-hooks lint forbids
  // set-state-in-effect for derived defaults).
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && targetId === "" && suggestedBranchIds.length === 1) {
      setTargetId(suggestedBranchIds[0]);
    }
  }

  const suggestedSet = new Set(suggestedBranchIds);
  // Order suggestions first.
  const ordered = territorialBranches
    .slice()
    .sort((a, b) =>
      suggestedSet.has(a.id) === suggestedSet.has(b.id)
        ? a.name.localeCompare(b.name)
        : suggestedSet.has(a.id)
          ? -1
          : 1,
    );

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
              <p className="text-text-muted">Suggested constituency (from postal code)</p>
              <p className="font-medium text-text-primary">{suggestedConstituency}</p>
              {suggestedBranchIds.length === 0 && (
                <p className="mt-1 text-xs text-text-muted">
                  No territorial branch matches this constituency — pick the closest fit.
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
                {ordered.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {suggestedSet.has(b.id) ? "★ " : ""}
                    {b.name}
                    {b.constituency ? ` · ${b.constituency}` : ""}
                  </SelectItem>
                ))}
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
