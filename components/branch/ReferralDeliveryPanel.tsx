/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (DeliveryPanel pattern, referral variant)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (Send invite / Copy link / Share to WhatsApp)
 * @consumes ui/Button, ui/Card, sonner
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx (when status = REFERRAL_INVITED)
 *
 * Mirrors invite/DeliveryPanel but uses the referral email + referral-side
 * email action. Distinct file to keep both call sites simple — the
 * differences (template, recipient, audit metadata) are non-trivial enough
 * that a single parametrised panel obscured the intent.
 */
"use client";

import * as React from "react";
import { Copy, Mail, MessageCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  logDeliveryAction,
  sendReferralInviteEmailAction,
} from "@/app/(dashboard)/branch/applications/[id]/actions";

interface ReferralDeliveryPanelProps {
  applicationId: string;
  magicLinkId: string;
  referralUrl: string;
  rawToken: string;
  whatsappUrl: string;
  referralEmail: string | null;
}

export function ReferralDeliveryPanel(props: ReferralDeliveryPanelProps) {
  const { applicationId, magicLinkId, referralUrl, rawToken, whatsappUrl, referralEmail } = props;
  const [emailing, setEmailing] = React.useState(false);
  const [copying, setCopying] = React.useState(false);

  async function handleSendEmail() {
    if (!referralEmail) {
      toast.error("No referral email on file. Use Copy link or Share to WhatsApp instead.");
      return;
    }
    setEmailing(true);
    const result = await sendReferralInviteEmailAction({ applicationId, magicLinkId, rawToken });
    setEmailing(false);
    if (result.ok) toast.success("Invite sent");
    else toast.error(result.error ?? "Couldn't send the email");
  }

  async function handleCopy() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(referralUrl);
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
        <CardTitle>Share the referral link</CardTitle>
        <CardDescription>
          Send this to the referral so they can sign. Each share is logged.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          type="button"
          variant="primary"
          onClick={handleSendEmail}
          disabled={emailing || !referralEmail}
          aria-disabled={!referralEmail}
        >
          <Mail className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          {emailing ? "Sending…" : "Send invite"}
        </Button>
        {!referralEmail && (
          <p className="-mt-1 text-sm text-text-muted">
            Add an email on the referral record to enable email sending.
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
