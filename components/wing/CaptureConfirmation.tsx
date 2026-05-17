/**
 * @tier organism
 * @consumes ui/Button, ui/Card, react-qr-code
 * @used-by components/wing/CaptureForm.tsx
 *
 * Inline confirmation panel that replaces the capture form after a
 * successful submit. Shows:
 *   • Personalised thank-you to the applicant
 *   • Matched WhatsApp community links (main / district / constituency
 *     tier — labelled accordingly) with a QR code per link so the
 *     applicant can scan with their phone
 *   • "Capture next" button to revert to the form
 *
 * Booth UX: admin turns the tablet to face the applicant. Applicant scans
 * the QR with their phone — opens WhatsApp directly. Admin taps "Capture
 * next" when done.
 */
"use client";

import * as React from "react";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";
import type { MatchedWhatsAppLink } from "@/lib/wing/whatsapp-links";

interface CaptureConfirmationProps {
  applicantFirstName: string;
  links: MatchedWhatsAppLink[];
  onCaptureNext: () => void;
}

const TIER_LABELS: Record<MatchedWhatsAppLink["match_tier"], string> = {
  main: "Main community",
  district: "Your district",
  constituency: "Your constituency",
};

export function CaptureConfirmation({
  applicantFirstName,
  links,
  onCaptureNext,
}: CaptureConfirmationProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1 text-center">
        <p className="text-3xl">🎉</p>
        <h1 className="text-2xl font-bold leading-tight text-text-primary">
          Thank you, {applicantFirstName}!
        </h1>
        <p className="text-sm text-text-secondary">
          Your details are in. We&rsquo;ll be in touch shortly.
        </p>
      </div>

      {links.length > 0 ? (
        <>
          <div className="rounded-md border border-border bg-surface-page p-4 text-sm">
            <p className="text-text-secondary">
              While you&rsquo;re here — request to join our WhatsApp community.
              Scan the QR code with your phone (or tap the link if you&rsquo;re
              reading this on your phone):
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {links.map((link) => (
              <div
                key={link.id}
                className="flex items-center gap-4 rounded-md border border-border bg-surface-card p-4"
              >
                <div className="flex shrink-0 items-center justify-center rounded-md bg-white p-2">
                  <QRCode
                    value={link.invite_url}
                    size={96}
                    style={{ height: 96, width: 96 }}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-state-info px-2 py-0.5 text-xs font-medium text-state-info">
                      {TIER_LABELS[link.match_tier]}
                    </span>
                  </div>
                  <p className="font-medium text-text-primary">{link.label}</p>
                  <a
                    href={link.invite_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-xs text-text-muted underline"
                  >
                    {link.invite_url}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-center text-sm text-text-muted">
          The wing hasn&rsquo;t added any WhatsApp community links yet.
        </p>
      )}

      <Button type="button" className="h-12 text-base" onClick={onCaptureNext}>
        Capture next attendee
      </Button>
    </div>
  );
}
