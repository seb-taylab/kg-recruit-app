/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (SettingsForm pattern)
 * @consumes ui/Button, ui/Input, ui/Label, ui/Select, ui/Alert, sonner
 * @used-by app/(dashboard)/branch/team/page.tsx
 *
 * Inline invite form. The role select hides options the caller can't
 * actually create (server-side check is still authoritative). Submits as
 * a server action and resets on success.
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
  inviteUserAction,
  type InvitableRole,
} from "@/app/(dashboard)/branch/team/actions";

const ROLE_LABELS: Record<InvitableRole, string> = {
  branch_admin: "Admin",
  branch_team_member: "Team member",
  branch_chairman: "Chairman",
};

interface InviteUserFormProps {
  /** Roles the caller may invite (server enforces too). */
  allowedRoles: InvitableRole[];
}

export function InviteUserForm({ allowedRoles }: InviteUserFormProps) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [role, setRole] = React.useState<InvitableRole>(allowedRoles[0]);
  const [position, setPosition] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await inviteUserAction({ email, fullName, role, position });
    setPending(false);
    if (result.ok) {
      toast.success(`Invite sent to ${email}`);
      setEmail("");
      setFullName("");
      setPosition("");
      setRole(allowedRoles[0]);
      router.refresh();
    } else {
      setError(result.error ?? "Couldn't send the invite — try again in a minute.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-name">Full name</Label>
          <Input
            id="invite-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-role">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as InvitableRole)}>
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedRoles.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-position">Position (optional)</Label>
          <Input
            id="invite-position"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="e.g. Secretary, Treasurer"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send invite"}
        </Button>
      </div>
    </form>
  );
}
