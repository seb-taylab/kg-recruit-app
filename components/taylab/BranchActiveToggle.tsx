/**
 * @tier molecule
 * @design-spec KG_DesignSystem_v1.md §2 (Button + toast)
 * @consumes ui/Button, sonner
 * @used-by app/(dashboard)/taylab/branches/page.tsx
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setBranchActiveAction } from "@/app/(dashboard)/taylab/branches/actions";

export function BranchActiveToggle({
  branchId,
  active,
}: {
  branchId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    const result = await setBranchActiveAction({ branchId, active: !active });
    setPending(false);
    if (result.ok) {
      toast.success(active ? "Branch deactivated." : "Branch reactivated.");
      router.refresh();
    } else {
      toast.error(result.error ?? "Couldn't update.");
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={pending}>
      {pending ? "Updating…" : active ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
