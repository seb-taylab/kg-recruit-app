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
}

export function RouteLeadButton({
  leadId,
  applicantName,
  territorialBranches,
}: RouteLeadButtonProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [targetId, setTargetId] = React.useState<string>("");
  const [pending, setPending] = React.useState(false);

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
    <Dialog open={open} onOpenChange={setOpen}>
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

          <div className="my-4 flex flex-col gap-2">
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a branch…" />
              </SelectTrigger>
              <SelectContent>
                {territorialBranches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
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
