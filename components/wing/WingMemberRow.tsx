/**
 * @tier organism
 * @consumes ui/Button, ui/Card, sonner
 * @used-by app/(dashboard)/wing/team/page.tsx
 *
 * One row per wing team member with a deactivate/reactivate button. Lighter
 * surface than the branch TeamMemberRow — no role-change, no email-change,
 * no password-reset trigger yet. Promote-to-master-equivalent doesn't
 * apply here (no master vs admin tier inside the wing).
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setWingMemberActiveAction } from "@/app/(dashboard)/wing/team/actions";

interface WingMemberRowProps {
  profileId: string;
  fullName: string;
  email: string;
  role: "wing_admin" | "wing_chairman";
  position: string | null;
  isActive: boolean;
  isSelf: boolean;
  canManage: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  wing_admin: "Wing Admin",
  wing_chairman: "Wing Chairman",
};

export function WingMemberRow({
  profileId,
  fullName,
  email,
  role,
  position,
  isActive,
  isSelf,
  canManage,
}: WingMemberRowProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function toggle() {
    setPending(true);
    const result = await setWingMemberActiveAction({
      profileId,
      active: !isActive,
    });
    setPending(false);
    if (result.ok) {
      toast.success(isActive ? `${fullName} deactivated.` : `${fullName} reactivated.`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Couldn't update.");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-page p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-text-primary">
          {fullName}
          {isSelf && (
            <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs font-normal text-text-muted">
              You
            </span>
          )}
          {!isActive && (
            <span className="ml-2 text-xs font-normal uppercase tracking-wide text-text-muted">
              Inactive
            </span>
          )}
        </p>
        <p className="text-xs text-text-secondary">
          {email} · {ROLE_LABEL[role] ?? role}
          {position ? ` · ${position}` : ""}
        </p>
      </div>
      {canManage && !isSelf && (
        <Button
          type="button"
          variant={isActive ? "outline" : "primary"}
          size="sm"
          disabled={pending}
          onClick={toggle}
        >
          {pending ? "Updating…" : isActive ? "Deactivate" : "Reactivate"}
        </Button>
      )}
    </div>
  );
}
