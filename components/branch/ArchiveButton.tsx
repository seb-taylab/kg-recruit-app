/**
 * @tier molecule
 * @design-spec KG_DesignSystem_v1.md §2 (Dialog confirmation)
 * @consumes ui/Button, ui/Dialog, ui/Textarea, ui/Label, ui/Alert, sonner
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx
 *
 * Confirms archive with a reason. Reason is mandatory because PRD §6
 * feature 22 audits every archive — without a reason the audit row is
 * useless. Min 3 chars to match the server-side schema.
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
import { archiveApplicationAction } from "@/app/(dashboard)/branch/applications/[id]/archive-actions";

export function ArchiveButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setPending(true);
    const result = await archiveApplicationAction({ applicationId, reason });
    setPending(false);
    if (result.ok) {
      toast.success("Archived.");
      setOpen(false);
      setReason("");
      router.refresh();
    } else {
      setError(result.error ?? "Couldn't archive — try again in a minute.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Archive
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive this application</DialogTitle>
          <DialogDescription>
            It disappears from the active queues. You can unarchive any time — the previous
            status is restored.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="archive-reason">Reason</Label>
          <Textarea
            id="archive-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Applicant withdrew · Duplicate · Stalled past 6 months"
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
            {pending ? "Archiving…" : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
