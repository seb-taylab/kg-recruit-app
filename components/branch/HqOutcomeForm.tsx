/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (SettingsForm pattern variant)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (action verbs)
 * @consumes ui/Button, ui/Input, ui/Label, ui/RadioGroup, ui/Select, ui/Textarea, ui/Alert
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx (status = SENT_TO_HQ)
 *
 * Custom composition justification: the HQ reply form is bi-modal (approval
 * vs rejection) and each mode owns different fields — easier to write as
 * one component with a conditional than to maintain two parallel forms.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { recordHqOutcomeAction } from "@/app/(dashboard)/branch/applications/[id]/hq-outcome-actions";
import { HQ_REJECTION_REASONS, type HqRejectionReason } from "@/lib/validation/hq-outcome";

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function HqOutcomeForm({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = React.useState<"approved" | "rejected">("approved");
  const [approvedDate, setApprovedDate] = React.useState(todayIso());
  const [membershipNo, setMembershipNo] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [rejectedDate, setRejectedDate] = React.useState(todayIso());
  const [reason, setReason] = React.useState<HqRejectionReason>(HQ_REJECTION_REASONS[0]);
  const [reasonDetails, setReasonDetails] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result =
      outcome === "approved"
        ? await recordHqOutcomeAction({
            applicationId,
            outcome: "approved",
            approvedDate,
            membershipNo,
            notes,
          })
        : await recordHqOutcomeAction({
            applicationId,
            outcome: "rejected",
            rejectedDate,
            reason,
            reasonDetails,
          });
    setPending(false);
    if (result.ok) {
      toast.success(
        outcome === "approved" ? "Approval recorded" : "Rejection recorded",
      );
      router.refresh();
    } else {
      setError(result.error ?? "Couldn't save — try again in a minute.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label>HQ reply</Label>
        <RadioGroup
          value={outcome}
          onValueChange={(v) => setOutcome(v as "approved" | "rejected")}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <label className="flex flex-1 items-start gap-3 rounded-md border border-border bg-surface-page p-3">
            <RadioGroupItem value="approved" id="outcome-approved" className="mt-1" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text-primary">Approved</span>
              <span className="text-sm text-text-muted">
                HQ accepted the application and issued a membership number.
              </span>
            </div>
          </label>
          <label className="flex flex-1 items-start gap-3 rounded-md border border-border bg-surface-page p-3">
            <RadioGroupItem value="rejected" id="outcome-rejected" className="mt-1" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text-primary">Rejected</span>
              <span className="text-sm text-text-muted">
                HQ declined the application — capture the reason for the record.
              </span>
            </div>
          </label>
        </RadioGroup>
      </div>

      {outcome === "approved" ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="approved-date">Approval date</Label>
            <Input
              id="approved-date"
              type="date"
              value={approvedDate}
              onChange={(e) => setApprovedDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="membership-no">Membership number</Label>
            <Input
              id="membership-no"
              value={membershipNo}
              onChange={(e) => setMembershipNo(e.target.value)}
              autoComplete="off"
              placeholder="e.g. PAP-2026-12345"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="approved-notes">Notes (optional)</Label>
            <Textarea
              id="approved-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Anything you want to remember about this approval."
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rejected-date">Rejection date</Label>
            <Input
              id="rejected-date"
              type="date"
              value={rejectedDate}
              onChange={(e) => setRejectedDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reason">Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as HqRejectionReason)}>
              <SelectTrigger id="reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HQ_REJECTION_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reason-details">Details (optional)</Label>
            <Textarea
              id="reason-details"
              value={reasonDetails}
              onChange={(e) => setReasonDetails(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="HQ's note, follow-up actions, etc."
            />
          </div>
        </>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Record outcome"}
        </Button>
      </div>
    </form>
  );
}
