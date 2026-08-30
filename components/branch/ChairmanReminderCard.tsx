/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (Card with primary + secondary CTA)
 * @consumes ui/Card, ui/Button, sonner
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx
 *
 * Surfaces ONLY when the application is in PENDING_CHAIRMAN. Gives the Branch
 * Admin three ways to get a busy chairman to sign — all using a PASSWORDLESS
 * sign link (no login needed for the chairman), mirroring the referral share:
 *   1. Share to WhatsApp (pick the chairman from your contacts)
 *   2. Copy the sign link (paste into WhatsApp / SMS)
 *   3. Email a reminder (in addition to the auto-nudge engine)
 * Each link is minted fresh on demand and every share is logged.
 */
"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Mail, MessageCircle, ExternalLink } from "lucide-react";
import {
  mintChairmanSignLinkAction,
  sendChairmanReminderAction,
} from "@/app/(dashboard)/branch/applications/[id]/chairman-reminder-actions";

interface ChairmanReminderCardProps {
  applicationId: string;
}

export function ChairmanReminderCard({ applicationId }: ChairmanReminderCardProps) {
  const [sending, setSending] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);

  async function handleWhatsApp() {
    setSharing(true);
    const result = await mintChairmanSignLinkAction({ applicationId, channel: "whatsapp" });
    setSharing(false);
    if (!result.ok || !result.waUrl) {
      toast.error(result.error ?? "Couldn't create the sign link.");
      return;
    }
    window.open(result.waUrl, "_blank", "noopener,noreferrer");
  }

  async function handleCopy() {
    setCopying(true);
    try {
      const result = await mintChairmanSignLinkAction({ applicationId, channel: "copy_link" });
      if (!result.ok || !result.url) {
        toast.error(result.error ?? "Couldn't create the sign link.");
        return;
      }
      await navigator.clipboard.writeText(result.url);
      toast.success("Sign link copied — paste it to your Chairman in WhatsApp / SMS.");
    } catch {
      toast.error("Couldn't copy automatically. Try again.");
    } finally {
      setCopying(false);
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
          Send the Chairman a link they can sign from without logging in. Auto-reminders
          also fire on a schedule. Each share is logged.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="primary" onClick={handleWhatsApp} disabled={sharing}>
          <MessageCircle className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          {sharing ? "Preparing…" : "Share to WhatsApp"}
          <ExternalLink className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </Button>
        <Button type="button" variant="secondary" onClick={handleCopy} disabled={copying}>
          <Copy className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          {copying ? "Preparing…" : "Copy link"}
        </Button>
        <Button type="button" variant="outline" onClick={handleSendReminder} disabled={sending}>
          <Mail className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          {sending ? "Sending…" : "Email reminder"}
        </Button>
      </CardContent>
    </Card>
  );
}
