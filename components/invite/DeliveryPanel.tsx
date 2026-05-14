/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (DeliveryPanel pattern — Email / Copy Link / Share to WhatsApp)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 + §5 (WhatsApp prefilled message)
 * @consumes ui/Button, ui/Card, sonner toast
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx
 *
 * Custom composition justification: combines a server action (Email) with
 * two client-side share actions (Copy, WhatsApp) that *also* report to the
 * server via logDeliveryAction. shadcn does not ship a "3-channel share"
 * primitive; this composes Button + Card + cn-styled grid to match the
 * spec.
 */
"use client";

import * as React from "react";
import { Copy, Mail, MessageCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  logDeliveryAction,
  sendInviteEmailAction,
} from "@/app/(dashboard)/branch/applications/[id]/actions";

interface DeliveryPanelProps {
  applicationId: string;
  magicLinkId: string;
  applicantUrl: string;
  rawToken: string;
  whatsappUrl: string;
  applicantEmail: string | null;
}

export function DeliveryPanel(props: DeliveryPanelProps) {
  const { applicationId, magicLinkId, applicantUrl, rawToken, whatsappUrl, applicantEmail } = props;
  const [emailing, setEmailing] = React.useState(false);
  const [copying, setCopying] = React.useState(false);

  async function handleSendEmail() {
    if (!applicantEmail) {
      toast.error("No applicant email on file. Use Copy link or Share to WhatsApp instead.");
      return;
    }
    setEmailing(true);
    const result = await sendInviteEmailAction({ applicationId, magicLinkId, rawToken });
    setEmailing(false);
    if (result.ok) toast.success("Invite sent");
    else toast.error(result.error ?? "Couldn't send the email");
  }

  async function handleCopy() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(applicantUrl);
      const result = await logDeliveryAction({
        applicationId,
        magicLinkId,
        channel: "copy_link",
      });
      if (result.ok) toast.success("Link copied");
      else toast.error(result.error ?? "Couldn't log the copy");
    } catch {
      toast.error("Couldn't copy — check clipboard permission and try again");
    } finally {
      setCopying(false);
    }
  }

  async function handleWhatsApp() {
    const result = await logDeliveryAction({
      applicationId,
      magicLinkId,
      channel: "whatsapp",
    });
    if (!result.ok) {
      toast.error(result.error ?? "Couldn't log the share");
      return;
    }
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share the link</CardTitle>
        <CardDescription>
          Pick one or more ways to send the link. Each share is logged.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          type="button"
          variant="primary"
          onClick={handleSendEmail}
          disabled={emailing || !applicantEmail}
          aria-disabled={!applicantEmail}
        >
          <Mail className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          {emailing ? "Sending…" : "Send invite"}
        </Button>
        {!applicantEmail && (
          <p className="-mt-1 text-sm text-text-muted">
            Add an email on the applicant&rsquo;s record to enable email sending.
          </p>
        )}
        <Button type="button" variant="secondary" onClick={handleCopy} disabled={copying}>
          <Copy className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          Copy link
        </Button>
        <Button type="button" variant="outline" onClick={handleWhatsApp}>
          <MessageCircle className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          Share to WhatsApp
          <ExternalLink className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  );
}
