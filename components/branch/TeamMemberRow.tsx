/**
 * @tier molecule
 * @design-spec KG_DesignSystem_v1.md §3 (List row with action group)
 * @consumes ui/Card, ui/Button, ui/Select, ui/Dialog, sonner
 * @used-by app/(dashboard)/branch/team/page.tsx
 *
 * Single team member row with inline actions. Action visibility is
 * decided by the caller (server enforces all of these too). Role change
 * is only available to the Master Admin via the canChangeRole prop.
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
import {
  deactivateUserAction,
  reactivateUserAction,
  changeUserRoleAction,
  triggerPasswordResetAction,
  changeUserEmailAction,
} from "@/app/(dashboard)/branch/team/actions";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { UserRole } from "@/types/database";

const ROLE_LABELS: Record<UserRole, string> = {
  branch_master_admin: "Master Admin",
  branch_admin: "Admin",
  branch_team_member: "Team member",
  branch_chairman: "Chairman",
  wing_admin: "Wing Admin",
  wing_chairman: "Wing Chairman",
  taylab_staff: "Taylab Staff",
};

const ROLE_OPTIONS = [
  "branch_master_admin",
  "branch_admin",
  "branch_team_member",
  "branch_chairman",
] as const;
type BranchRole = (typeof ROLE_OPTIONS)[number];

export interface TeamMemberRowProps {
  profileId: string;
  fullName: string;
  email: string;
  role: UserRole;
  position: string | null;
  isActive: boolean;
  isSelf: boolean;
  canChangeRole: boolean;
  canManage: boolean;
  /** True when the caller is the Master Admin and may edit emails. */
  canChangeEmail: boolean;
}

export function TeamMemberRow({
  profileId,
  fullName,
  email,
  role,
  position,
  isActive,
  isSelf,
  canChangeRole,
  canManage,
  canChangeEmail,
}: TeamMemberRowProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  // Role selection only ever holds branch roles. Cast at the boundary
  // because the row may receive a UserRole value from server data.
  const [roleSelect, setRoleSelect] = React.useState<BranchRole>(role as BranchRole);
  const [emailDialogOpen, setEmailDialogOpen] = React.useState(false);
  const [emailDraft, setEmailDraft] = React.useState(email);
  const [emailError, setEmailError] = React.useState<string | null>(null);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (result.ok) {
      toast.success(label);
      router.refresh();
    } else {
      toast.error(result.error ?? "Couldn't complete the action.");
    }
  }

  async function handleEmailChange() {
    setEmailError(null);
    const result = await changeUserEmailAction({ profileId, newEmail: emailDraft });
    if (result.ok) {
      toast.success(`Email updated to ${emailDraft}.`);
      setEmailDialogOpen(false);
      router.refresh();
    } else {
      setEmailError(result.error ?? "Couldn't update.");
    }
  }

  function handleRoleChange(newRole: BranchRole) {
    if (newRole === role) return;
    const wasMasterHandover = newRole === "branch_master_admin";
    setRoleSelect(newRole);
    void run(
      wasMasterHandover
        ? `Promoted to Master Admin — your role flipped to Admin.`
        : `Role updated to ${ROLE_LABELS[newRole]}.`,
      () => changeUserRoleAction({ profileId, newRole }),
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-text-primary">
          {fullName}
          {isSelf && (
            <span className="ml-2 text-xs font-normal text-text-muted">(you)</span>
          )}
        </p>
        <p className="text-sm text-text-secondary">
          {email}
          {position ? ` · ${position}` : ""}
        </p>
        <p className="text-xs uppercase tracking-wide text-text-muted">
          {ROLE_LABELS[role]} {!isActive && " · inactive"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canChangeRole && !isSelf && (
          <Select value={roleSelect} onValueChange={(v) => handleRoleChange(v as BranchRole)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {canChangeEmail && !isSelf && (
          <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEmailDraft(email);
                  setEmailError(null);
                }}
              >
                Change email
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change email for {fullName}</DialogTitle>
                <DialogDescription>
                  Updates the auth record immediately — no confirmation email is sent
                  to the user. They&rsquo;ll use the new address to sign in next time.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`email-${profileId}`}>New email</Label>
                <Input
                  id={`email-${profileId}`}
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  autoComplete="off"
                  required
                />
                {emailError && (
                  <p className="text-sm text-state-error" aria-live="polite">
                    {emailError}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEmailDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleEmailChange}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {canManage && !isSelf && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                run("Password reset email sent.", () =>
                  triggerPasswordResetAction({ profileId }),
                )
              }
            >
              Reset password
            </Button>
            {isActive ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run("Deactivated.", () => deactivateUserAction({ profileId }))}
              >
                Deactivate
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run("Reactivated.", () => reactivateUserAction({ profileId }))}
              >
                Reactivate
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
