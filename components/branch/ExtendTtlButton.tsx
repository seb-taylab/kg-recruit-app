/**
 * @tier molecule
 * @design-spec KG_DesignSystem_v1.md §2 (Select-action pattern)
 * @consumes ui/Button, ui/Select, sonner
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx (Link summary aside)
 *
 * Lets a Branch Admin push out an active magic link's expiry without
 * re-minting. PRD §6 feature 17 — appears alongside Link summary, hidden
 * once the link is consumed.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { extendMagicLinkTtlAction } from "@/app/(dashboard)/branch/applications/[id]/archive-actions";

const OPTIONS = ["3", "7", "14"] as const;

export function ExtendTtlButton({ magicLinkId }: { magicLinkId: string }) {
  const router = useRouter();
  const [days, setDays] = React.useState<(typeof OPTIONS)[number]>("7");
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    const result = await extendMagicLinkTtlAction({
      magicLinkId,
      daysToAdd: Number(days) as 3 | 7 | 14,
    });
    setPending(false);
    if (result.ok) {
      toast.success(`Extended by ${days} days.`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Couldn't extend — try again in a minute.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-text-primary">Extend link</p>
      <div className="flex gap-2">
        <Select value={days} onValueChange={(v) => setDays(v as (typeof OPTIONS)[number])}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPTIONS.map((d) => (
              <SelectItem key={d} value={d}>
                {d} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={handleClick} disabled={pending}>
          {pending ? "Extending…" : "Extend"}
        </Button>
      </div>
    </div>
  );
}
