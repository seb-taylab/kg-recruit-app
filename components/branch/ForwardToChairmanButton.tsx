/**
 * @tier molecule
 * @design-spec KG_DesignSystem_v1.md §2 (Button) + §3 (action panel)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (Forward to Chairman verb-first)
 * @consumes ui/Button, sonner
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx (PATH B review surface)
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { forwardToChairmanAction } from "@/app/(dashboard)/branch/applications/[id]/actions";

export function ForwardToChairmanButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    const result = await forwardToChairmanAction(applicationId);
    setPending(false);
    if (result.ok) {
      toast.success("Forwarded to Chairman");
      router.refresh();
    } else {
      toast.error(result.error ?? "Couldn't forward — try again in a minute");
    }
  }

  return (
    <Button type="button" onClick={handleClick} disabled={pending}>
      {pending ? "Forwarding…" : "Forward to Chairman"}
    </Button>
  );
}
