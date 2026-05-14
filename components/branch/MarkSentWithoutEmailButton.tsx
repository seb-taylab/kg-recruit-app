/**
 * @tier molecule
 * @design-spec KG_DesignSystem_v1.md §2 (Dialog confirmation pattern)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (verb-first secondary action)
 * @consumes ui/Button, ui/Dialog, ui/Textarea, ui/Label, ui/Alert, sonner
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx (status = READY_TO_SEND)
 *
 * Escape hatch for the "I already sent the PDF some other way" case.
 * Forces the admin to type a short reason so the audit log captures why
 * the system didn't fire the completion email itself.
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
import { markSentWithoutEmailAction } from "@/app/(dashboard)/branch/applications/[id]/send-to-hq-actions";

export function MarkSentWithoutEmailButton({
  applicationId,
}: {
  applicationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setPending(true);
    const result = await markSentWithoutEmailAction({ applicationId, reason });
    setPending(false);
    if (result.ok) {
      toast.success("Marked as sent to HQ.");
      setOpen(false);
      setReason("");
      router.refresh();
    } else {
      setError(result.error ?? "Couldn't update — try again in a minute.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Mark as sent (no email)
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as sent without emailing</DialogTitle>
          <DialogDescription>
            Use this if you already forwarded the PDF to HQ another way (printed,
            Telegram, hand-delivered). The system will move this application to{" "}
            <span className="font-medium text-text-primary">Sent to HQ</span> and
            keep a downloadable copy of the PDF — but won&rsquo;t send any email.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="skip-email-reason">How did you send it?</Label>
          <Textarea
            id="skip-email-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Printed and dropped off at HQ on 14 May."
            required
          />
          <p className="text-xs text-text-muted">
            Saved in the audit log so the team can see why no email went out.
          </p>
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
            {pending ? "Marking…" : "Mark as sent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
