/**
 * @tier organism
 * @consumes ui/Button, sonner
 * @used-by app/(dashboard)/branch/inbox/page.tsx
 *
 * Sends the membership invite for a wing-routed lead — converts it to an
 * application and redirects to the detail page where the admin picks
 * delivery channel.
 */
"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { convertLeadToApplicationAction } from "@/app/(dashboard)/branch/inbox/lead-actions";

interface ConvertLeadButtonProps {
  leadId: string;
  applicantName: string;
  /** Optional className forwarded to Button — used for w-full on mobile. */
  className?: string;
}

export function ConvertLeadButton({ leadId, applicantName, className }: ConvertLeadButtonProps) {
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    if (
      !window.confirm(
        `Send a membership application invite to ${applicantName}? This converts the lead and creates the application.`,
      )
    ) {
      return;
    }
    setPending(true);
    try {
      // The server action redirects on success — so under normal flow this
      // call doesn't return. If it does return (e.g. error path), we surface
      // the error here.
      const result = await convertLeadToApplicationAction({ leadId });
      if (result && !result.ok) {
        toast.error(result.error ?? "Couldn't convert the lead.");
        setPending(false);
      }
      // On success, the server action redirects — no further action.
    } catch (err) {
      // Next.js redirect() throws — that's expected on success, not an error.
      // Let it propagate; the framework handles the navigation.
      throw err;
    }
  }

  return (
    <Button
      size="sm"
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={className}
    >
      {pending ? "Sending…" : "Send invite"}
    </Button>
  );
}
