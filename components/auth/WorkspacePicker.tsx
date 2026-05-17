/**
 * @tier organism
 * @consumes ui/Button, ui/Card, sonner
 * @used-by app/select-workspace/page.tsx
 *
 * Client picker — one card per workspace. Click → server action sets the
 * cookie + redirects. Optimistic loading state per card so repeated clicks
 * don't stack.
 */
"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { selectWorkspaceAction } from "@/app/select-workspace/actions";
import { GitBranch, Users, LayoutGrid, Building2 } from "lucide-react";

interface Workspace {
  profileId: string;
  role: string;
  branchName: string;
  branchType: "territorial" | "wing" | null;
  constituency: string | null;
}

interface WorkspacePickerProps {
  workspaces: Workspace[];
}

const ROLE_LABEL: Record<string, string> = {
  branch_master_admin: "Master Admin",
  branch_admin: "Admin",
  branch_team_member: "Team Member",
  branch_chairman: "Chairman",
  wing_admin: "Wing Admin",
  wing_chairman: "Wing Chairman",
  taylab_staff: "Taylab Staff",
};

export function WorkspacePicker({ workspaces }: WorkspacePickerProps) {
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function handlePick(profileId: string) {
    if (pendingId) return;
    setPendingId(profileId);
    try {
      const result = await selectWorkspaceAction({ profileId });
      // Action redirects on success — only here on error.
      if (result && !result.ok) {
        toast.error(result.error ?? "Couldn't open that workspace.");
        setPendingId(null);
      }
    } catch (err) {
      // Next.js redirect() throws — expected on success. Let it propagate.
      throw err;
    }
  }

  return (
    <ul className="flex flex-col gap-3">
      {workspaces.map((w) => {
        const Icon = pickIcon(w.role, w.branchType);
        const pending = pendingId === w.profileId;
        return (
          <li key={w.profileId}>
            <Button
              variant="outline"
              className="h-auto w-full justify-start gap-4 p-4 text-left"
              disabled={pending}
              onClick={() => handlePick(w.profileId)}
            >
              <Icon
                className="h-6 w-6 shrink-0 text-text-secondary"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium text-text-primary">
                  {w.branchName}
                </span>
                <span className="text-xs text-text-muted">
                  {ROLE_LABEL[w.role] ?? w.role}
                  {w.constituency ? ` · ${w.constituency}` : ""}
                  {w.branchType ? ` · ${w.branchType}` : ""}
                </span>
              </div>
              {pending && (
                <span className="shrink-0 text-xs text-text-muted">
                  Opening…
                </span>
              )}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function pickIcon(role: string, branchType: "territorial" | "wing" | null) {
  if (role === "taylab_staff") return LayoutGrid;
  if (branchType === "wing") return Users;
  if (branchType === "territorial") return Building2;
  return GitBranch;
}
