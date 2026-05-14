/**
 * @tier molecule
 * @design-spec KG_DesignSystem_v1.md §2 (Button + toast pattern)
 * @consumes ui/Button, sonner
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx (status = ARCHIVED)
 *          app/(dashboard)/branch/history/page.tsx
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { unarchiveApplicationAction } from "@/app/(dashboard)/branch/applications/[id]/archive-actions";

export function UnarchiveButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    const result = await unarchiveApplicationAction({ applicationId });
    setPending(false);
    if (result.ok) {
      toast.success("Unarchived. Application restored to its prior state.");
      router.refresh();
    } else {
      toast.error(result.error ?? "Couldn't unarchive — try again in a minute.");
    }
  }

  return (
    <Button type="button" variant="outline" onClick={handleClick} disabled={pending}>
      {pending ? "Unarchiving…" : "Unarchive"}
    </Button>
  );
}
