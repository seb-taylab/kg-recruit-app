/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (SettingsForm)
 * @consumes ui/Button, ui/Input, ui/Label, ui/Alert, ui/Select
 * @used-by app/(dashboard)/taylab/settings/page.tsx
 *
 * Edits the global platform_settings rows. All branches inherit these
 * unless they override on their own settings page.
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
import { savePlatformSettingsAction } from "@/app/(dashboard)/taylab/settings/actions";

export interface PlatformSettingsFormProps {
  current: {
    inviteTtlHours: number;
    inviteTtlMaxHours: number;
    defaultRoutingMode: "direct_to_chairman" | "via_branch_admin_review";
    pdfPresignedUrlTtlDays: number;
  };
}

export function PlatformSettingsForm({ current }: PlatformSettingsFormProps) {
  const router = useRouter();
  const [inviteTtl, setInviteTtl] = React.useState(String(current.inviteTtlHours));
  const [inviteTtlMax, setInviteTtlMax] = React.useState(String(current.inviteTtlMaxHours));
  const [routing, setRouting] = React.useState<"direct_to_chairman" | "via_branch_admin_review">(
    current.defaultRoutingMode,
  );
  const [pdfTtl, setPdfTtl] = React.useState(String(current.pdfPresignedUrlTtlDays));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await savePlatformSettingsAction({
      inviteTtlHours: Number(inviteTtl),
      inviteTtlMaxHours: Number(inviteTtlMax),
      defaultRoutingMode: routing,
      pdfPresignedUrlTtlDays: Number(pdfTtl),
    });
    setPending(false);
    if (result.ok) {
      toast.success("Platform settings saved.");
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

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ttl">Default invite TTL (hours)</Label>
          <Input
            id="ttl"
            type="number"
            inputMode="numeric"
            min={1}
            max={720}
            value={inviteTtl}
            onChange={(e) => setInviteTtl(e.target.value)}
            required
          />
          <p className="text-sm text-text-muted">Default magic-link expiry.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ttl-max">Max invite TTL (hours)</Label>
          <Input
            id="ttl-max"
            type="number"
            inputMode="numeric"
            min={1}
            max={8760}
            value={inviteTtlMax}
            onChange={(e) => setInviteTtlMax(e.target.value)}
            required
          />
          <p className="text-sm text-text-muted">Hard cap branches can&rsquo;t exceed.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="routing">Default routing</Label>
          <Select
            value={routing}
            onValueChange={(v) =>
              setRouting(v as "direct_to_chairman" | "via_branch_admin_review")
            }
          >
            <SelectTrigger id="routing">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct_to_chairman">Direct to Chairman</SelectItem>
              <SelectItem value="via_branch_admin_review">Via branch admin review</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-text-muted">Used when a branch hasn&rsquo;t overridden.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pdf-ttl">PDF download URL TTL (days)</Label>
          <Input
            id="pdf-ttl"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={pdfTtl}
            onChange={(e) => setPdfTtl(e.target.value)}
            required
          />
          <p className="text-sm text-text-muted">How long the signed PDF URL stays valid.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save platform settings"}
        </Button>
      </div>
    </form>
  );
}
