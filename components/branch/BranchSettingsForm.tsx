/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (SettingsForm)
 * @consumes ui/Button, ui/Input, ui/Label, ui/Alert, ui/Select
 * @used-by app/(dashboard)/branch/settings/page.tsx
 *
 * Branch override form. Each field shows the effective value (with "Using
 * platform default" placeholder when the branch column is null) so the
 * admin sees what they'd be overriding.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveBranchSettingsAction,
  type BranchSettingsInput,
} from "@/app/(dashboard)/branch/settings/actions";

export interface BranchSettingsFormProps {
  current: {
    hqEmail: string | null;
    emailFromDisplayName: string | null;
    inviteTtlHours: number | null;
    defaultRoutingMode: "direct_to_chairman" | "via_branch_admin_review" | null;
  };
  effective: {
    inviteTtlHours: number;
    inviteTtlMaxHours: number;
    defaultRoutingMode: "direct_to_chairman" | "via_branch_admin_review";
  };
}

type RoutingValue = "" | "direct_to_chairman" | "via_branch_admin_review";

export function BranchSettingsForm({ current, effective }: BranchSettingsFormProps) {
  const router = useRouter();
  const [hqEmail, setHqEmail] = React.useState(current.hqEmail ?? "");
  const [emailFromDisplayName, setEmailFromDisplayName] = React.useState(
    current.emailFromDisplayName ?? "",
  );
  const [inviteTtlHours, setInviteTtlHours] = React.useState<string>(
    current.inviteTtlHours != null ? String(current.inviteTtlHours) : "",
  );
  const [defaultRoutingMode, setDefaultRoutingMode] = React.useState<RoutingValue>(
    current.defaultRoutingMode ?? "",
  );
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const ttl = inviteTtlHours.trim();
    const payload: BranchSettingsInput = {
      hqEmail,
      emailFromDisplayName,
      inviteTtlHours: ttl === "" ? "" : Number(ttl),
      defaultRoutingMode,
    };
    const result = await saveBranchSettingsAction(payload);
    setPending(false);
    if (result.ok) {
      toast.success("Branch settings saved.");
      router.refresh();
    } else {
      setError(result.error ?? "Couldn't save — try again in a minute.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="hq-email">HQ email</Label>
        <Input
          id="hq-email"
          type="email"
          value={hqEmail}
          onChange={(e) => setHqEmail(e.target.value)}
          placeholder="e.g. hq@pap.org.sg"
        />
        <p className="text-sm text-text-muted">
          Where Send to HQ delivers the signed PDF. Required to use the &ldquo;Send to HQ&rdquo; option.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email-from">Email &ldquo;from&rdquo; display name</Label>
        <Input
          id="email-from"
          value={emailFromDisplayName}
          onChange={(e) => setEmailFromDisplayName(e.target.value)}
          placeholder="e.g. PAP Kampong Glam"
          maxLength={60}
        />
        <p className="text-sm text-text-muted">
          Sender label on outbound emails. Recipient still sees the Resend address as the
          envelope sender.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-ttl">Invite TTL (hours)</Label>
        <Input
          id="invite-ttl"
          type="number"
          inputMode="numeric"
          min={1}
          max={effective.inviteTtlMaxHours}
          value={inviteTtlHours}
          onChange={(e) => setInviteTtlHours(e.target.value)}
          placeholder={`Using platform default (${effective.inviteTtlHours} hours)`}
        />
        <p className="text-sm text-text-muted">
          How long each magic link stays valid. Leave blank to inherit the platform default.
          Platform max: {effective.inviteTtlMaxHours} hours.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="routing">Default routing</Label>
        <Select
          value={defaultRoutingMode}
          onValueChange={(v) => setDefaultRoutingMode(v as RoutingValue)}
        >
          <SelectTrigger id="routing">
            <SelectValue
              placeholder={`Using platform default (${effective.defaultRoutingMode === "direct_to_chairman" ? "Direct to Chairman" : "Via branch admin review"})`}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="direct_to_chairman">Direct to Chairman</SelectItem>
            <SelectItem value="via_branch_admin_review">Via branch admin review</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-text-muted">
          Pre-selected option on the &ldquo;Assign referral&rdquo; form. Branch admins can still
          override per-application.
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
