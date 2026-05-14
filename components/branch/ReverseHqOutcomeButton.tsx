/**
 * @tier molecule
 * @design-spec KG_DesignSystem_v1.md §2 (Dialog confirmation pattern)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (destructive verb prefix)
 * @consumes ui/Button, ui/Dialog, ui/Textarea, ui/Label, ui/Alert, sonner
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx (status = COMPLETED or HQ_REJECTED)
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { reverseHqOutcomeAction } from "@/app/(dashboard)/branch/applications/[id]/hq-outcome-actions";

interface ReverseHqOutcomeButtonProps {
  applicationId: string;
  fromStatus: "COMPLETED" | "HQ_REJECTED";
}

export function ReverseHqOutcomeButton({
  applicationId,
  fromStatus,
}: ReverseHqOutcomeButtonProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setPending(true);
    const result = await reverseHqOutcomeAction({ applicationId, reason });
    setPending(false);
    if (result.ok) {
      toast.success("Outcome reversed. Application is back at HQ.");
      setOpen(false);
      setReason("");
      router.refresh();
    } else {
      setError(result.error ?? "Couldn't reverse — try again in a minute.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Reverse outcome
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse the recorded outcome</DialogTitle>
          <DialogDescription>
            {fromStatus === "COMPLETED"
              ? "This will move the application out of Completed and back to At HQ."
              : "This will move the application out of HQ rejected and back to At HQ."}{" "}
            Tell us why so the audit log captures it.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="reversal-reason">Reason</Label>
          <Textarea
            id="reversal-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Wrong membership number typed in, HQ later confirmed approval."
            required
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={pending || reason.trim().length < 3}
          >
            {pending ? "Reversing…" : "Reverse outcome"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
