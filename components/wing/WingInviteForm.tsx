/**
 * @tier organism
 * @consumes ui/Button, ui/Input, ui/Label, ui/Select, ui/Alert, sonner
 * @used-by app/(dashboard)/wing/team/page.tsx
 *
 * Invite a wing_admin or wing_chairman. Server action handles multi-profile
 * cases (existing user → new profile row, no auth invite re-sent).
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
  inviteWingMemberAction,
  type WingInvitableRole,
} from "@/app/(dashboard)/wing/team/actions";

const ROLE_LABELS: Record<WingInvitableRole, string> = {
  wing_admin: "Wing Admin",
  wing_chairman: "Wing Chairman",
};

export function WingInviteForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [role, setRole] = React.useState<WingInvitableRole>("wing_admin");
  const [position, setPosition] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await inviteWingMemberAction({ email, fullName, role, position });
    setPending(false);
    if (result.ok) {
      toast.success(`${fullName} invited as ${ROLE_LABELS[role]}.`);
      setEmail("");
      setFullName("");
      setPosition("");
      setRole("wing_admin");
      router.refresh();
    } else {
      setError(result.error ?? "Couldn't send the invite.");
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
          <Label htmlFor="winv-name">Full name</Label>
          <Input
            id="winv-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="winv-email">Email</Label>
          <Input
            id="winv-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="winv-role">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as WingInvitableRole)}>
            <SelectTrigger id="winv-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wing_admin">Wing Admin</SelectItem>
              <SelectItem value="wing_chairman">Wing Chairman</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="winv-position">Position (optional)</Label>
          <Input
            id="winv-position"
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
