/**
 * @tier organism
 * @consumes ui/Button, sonner
 * @used-by app/(dashboard)/branch/inbox/page.tsx
 *
 * Branch-admin button: "we're talking to this person but not ready to send
 * the membership invite yet." Status goes ROUTED → ENGAGED, which signals
 * the wing's triage view to give the branch more time before considering
 * reroute.
 *
 * Idempotent: re-pressing on an ENGAGED lead is a no-op.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markLeadEngagedAction } from "@/app/(dashboard)/branch/inbox/lead-actions";

interface MarkLeadEngagedButtonProps {
  leadId: string;
  applicantName: string;
  alreadyEngaged: boolean;
}

export function MarkLeadEngagedButton({
  leadId,
  applicantName,
  alreadyEngaged,
}: MarkLeadEngagedButtonProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    const result = await markLeadEngagedAction({ leadId });
    setPending(false);
    if (result.ok) {
      toast.success(`${applicantName} marked as engaged.`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Couldn't update.");
    }
  }

  if (alreadyEngaged) {
    return (
      <span className="rounded-full border border-state-info px-3 py-1 text-xs font-medium text-state-info">
        Engaged
      </span>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleClick}>
      {pending ? "Marking…" : "Mark engaged"}
    </Button>
  );
}
