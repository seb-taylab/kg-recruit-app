/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (Card with primary + secondary CTA)
 * @consumes ui/Card, ui/Button, sonner
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx
 *
 * Surfaces ONLY when the application is in PENDING_CHAIRMAN. Gives the
 * Branch Admin two ways to nudge a busy chairman:
 *   1. Copy direct sign link (paste into WhatsApp / SMS)
 *   2. Send a manual reminder email (in addition to the auto-nudge engine)
 */
"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Mail } from "lucide-react";
import { sendChairmanReminderAction } from "@/app/(dashboard)/branch/applications/[id]/chairman-reminder-actions";

interface ChairmanReminderCardProps {
  applicationId: string;
  /** Public app URL; comes from NEXT_PUBLIC_APP_URL on the server. */
  appBaseUrl: string;
}

export function ChairmanReminderCard({
  applicationId,
  appBaseUrl,
}: ChairmanReminderCardProps) {
  const [sending, setSending] = React.useState(false);
  const signLink = `${appBaseUrl}/branch/sign/${applicationId}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(signLink);
      toast.success("Link copied — paste it in WhatsApp / SMS to your Chairman.");
    } catch {
      toast.error("Couldn't copy automatically. Long-press the URL to copy.");
    }
  }

  async function handleSendReminder() {
    setSending(true);
    const result = await sendChairmanReminderAction({ applicationId });
    setSending(false);
    if (result.ok) {
      toast.success("Reminder emailed to the Chairman.");
    } else {
      toast.error(result.error ?? "Couldn't send the reminder.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nudge the Chairman</CardTitle>
        <CardDescription>
          Auto-reminders fire on a schedule, but for a busy Chairman you can also
          forward the direct sign link or email a manual reminder right now.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="break-all rounded-md bg-surface-page p-3 text-xs text-text-secondary">
            {signLink}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={handleCopy}>
            <Copy className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            Copy link
          </Button>
          <Button type="button" onClick={handleSendReminder} disabled={sending}>
            <Mail className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            {sending ? "Sending…" : "Email reminder to Chairman"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
