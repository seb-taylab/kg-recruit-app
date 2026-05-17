/**
 * @tier organism
 * @consumes ui/Button, ui/Dialog, ui/Select, ui/Textarea, sonner
 * @used-by components/branch/InboundLeadCard.tsx
 *
 * Branch-admin action: push a lead back to the wing when it isn't the
 * right fit. Reason required (dropdown); note encouraged for context. The
 * lead returns to the wing's "New" queue with full audit trail in
 * lead_route_history.
 *
 * Visually quieter than Mark engaged / Send invite — this is the less-
 * frequent path. On mobile renders as a small text-link affordance below
 * the primary action row.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
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
import { returnLeadToWingAction } from "@/app/(dashboard)/branch/inbox/lead-actions";

interface ReturnLeadToWingButtonProps {
  leadId: string;
  applicantName: string;
  wingName: string;
  /** "button" = solid affordance for desktop; "link" = text-link for mobile. */
  variant?: "button" | "link";
}

const REASON_LABELS = {
  wrong_constituency:
    "Wrong constituency — they live elsewhere",
  already_member: "Already a member of another branch",
  not_residing_here: "Not residing in this constituency",
  applicant_request: "Applicant asked for a different branch",
  quality_concern: "Quality concern — not a fit for our branch",
  other: "Other",
} as const;

type ReturnReason = keyof typeof REASON_LABELS;

export function ReturnLeadToWingButton({
  leadId,
  applicantName,
  wingName,
  variant = "button",
}: ReturnLeadToWingButtonProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<ReturnReason>("wrong_constituency");
  const [reasonNote, setReasonNote] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await returnLeadToWingAction({ leadId, reason, reasonNote });
    setPending(false);
    if (result.ok) {
      toast.success(`${applicantName} returned to ${wingName}.`);
      setOpen(false);
      setReasonNote("");
      router.refresh();
    } else {
      toast.error(result.error ?? "Couldn't return the lead.");
    }
  }

  const trigger =
    variant === "link" ? (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-text-muted underline hover:text-text-primary"
      >
        <Undo2 className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
        Not a fit? Return to {wingName}
      </button>
    ) : (
      <Button type="button" size="sm" variant="outline">
        <Undo2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        Return
      </Button>
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Return {applicantName} to {wingName}</DialogTitle>
            <DialogDescription>
              The lead goes back to {wingName}&rsquo;s triage queue. They&rsquo;ll
              decide whether to re-route to a different branch, archive, or
              follow up directly. Your audit trail records the reason.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <label
              className="text-sm font-medium text-text-primary"
              htmlFor="ret-reason"
            >
              Reason
            </label>
            <Select value={reason} onValueChange={(v) => setReason(v as ReturnReason)}>
              <SelectTrigger id="ret-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(REASON_LABELS) as [ReturnReason, string][]).map(
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
            <label
              className="text-sm font-medium text-text-primary"
              htmlFor="ret-note"
            >
              Note (optional)
            </label>
            <Textarea
              id="ret-note"
              rows={2}
              maxLength={500}
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="Context for the wing admin reviewing this return…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Returning…" : "Return to wing"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
