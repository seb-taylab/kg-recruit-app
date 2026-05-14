/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (RecipientPicker pattern)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (Send now)
 * @consumes ui/Button, ui/Checkbox, ui/Input, ui/Label, ui/Alert, sonner
 * @used-by app/(dashboard)/branch/ready-to-send/[id]/page.tsx
 *
 * PRD §4.5: three options — HQ (editable), Self, Custom (comma-sep).
 * "Send Now" stays enabled as long as ≥ 1 recipient resolves.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { sendApplicationToHqAction } from "@/app/(dashboard)/branch/ready-to-send/[id]/actions";

interface RecipientPickerProps {
  applicationId: string;
  hqEmail: string | null;
  selfEmail: string | null;
  defaultsFromBranch?: {
    hq: boolean;
    self: boolean;
    custom: string[];
  };
}

export function RecipientPicker({
  applicationId,
  hqEmail,
  selfEmail,
  defaultsFromBranch,
}: RecipientPickerProps) {
  const router = useRouter();
  const [sendToHq, setSendToHq] = React.useState<boolean>(
    (defaultsFromBranch?.hq ?? true) && Boolean(hqEmail),
  );
  const [sendToSelf, setSendToSelf] = React.useState<boolean>(
    defaultsFromBranch?.self ?? true,
  );
  const [customRaw, setCustomRaw] = React.useState<string>(
    (defaultsFromBranch?.custom ?? []).join(", "),
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const customRecipients = parseEmails(customRaw);
  const customInvalid = customRecipients.invalid;
  const totalRecipients =
    (sendToHq && hqEmail ? 1 : 0) +
    (sendToSelf && selfEmail ? 1 : 0) +
    customRecipients.valid.length;
  const canSend = totalRecipients > 0 && customInvalid.length === 0 && !submitting;

  async function handleSubmit() {
    setError(null);
    if (!canSend) return;
    setSubmitting(true);
    const result = await sendApplicationToHqAction({
      applicationId,
      sendToHq: sendToHq && Boolean(hqEmail),
      sendToSelf: sendToSelf && Boolean(selfEmail),
      customRecipients: customRecipients.valid,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Couldn't send.");
      return;
    }
    toast.success("Application sent");
    router.replace("/branch/ready-to-send?just_sent=" + encodeURIComponent(applicationId));
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-start gap-3 rounded-md border border-border bg-surface-page p-4">
        <Checkbox
          id="send-hq"
          checked={sendToHq && Boolean(hqEmail)}
          disabled={!hqEmail}
          onCheckedChange={(v) => setSendToHq(v === true)}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor="send-hq" className="text-sm font-medium">
            Send to HQ
          </Label>
          {hqEmail ? (
            <p className="text-sm text-text-muted">{hqEmail}</p>
          ) : (
            <p className="text-sm text-state-warning">
              HQ email not configured — set in Branch Settings to enable Send to HQ.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-md border border-border bg-surface-page p-4">
        <Checkbox
          id="send-self"
          checked={sendToSelf && Boolean(selfEmail)}
          disabled={!selfEmail}
          onCheckedChange={(v) => setSendToSelf(v === true)}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor="send-self" className="text-sm font-medium">
            Send to me
          </Label>
          <p className="text-sm text-text-muted">{selfEmail ?? "—"}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="send-custom">Custom recipients (comma-separated, optional)</Label>
        <Input
          id="send-custom"
          value={customRaw}
          onChange={(e) => setCustomRaw(e.target.value)}
          placeholder="someone@example.com, another@example.com"
          inputMode="email"
        />
        {customInvalid.length > 0 && (
          <p className="text-sm text-state-error" aria-live="polite">
            Not valid email{customInvalid.length === 1 ? "" : "s"}: {customInvalid.join(", ")}
          </p>
        )}
        {customRecipients.valid.length > 0 && customInvalid.length === 0 && (
          <p className="text-sm text-text-muted">
            Will send to {customRecipients.valid.length} custom recipient
            {customRecipients.valid.length === 1 ? "" : "s"}.
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-text-muted">
          {totalRecipients > 0
            ? `${totalRecipients} recipient${totalRecipients === 1 ? "" : "s"} ready.`
            : "Pick at least one recipient."}
        </p>
        <Button type="button" onClick={handleSubmit} disabled={!canSend}>
          {submitting ? "Sending…" : "Send now"}
        </Button>
      </div>
    </div>
  );
}

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

function parseEmails(raw: string): { valid: string[]; invalid: string[] } {
  const tokens = raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const t of tokens) {
    if (EMAIL_RE.test(t)) valid.push(t);
    else invalid.push(t);
  }
  return { valid, invalid };
}
