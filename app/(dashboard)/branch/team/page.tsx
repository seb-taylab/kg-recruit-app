import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/get-user";
import type { UserRole } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteUserForm } from "@/components/branch/InviteUserForm";
import { TeamMemberRow } from "@/components/branch/TeamMemberRow";
import type { InvitableRole } from "@/app/(dashboard)/branch/team/actions";

interface TeamProfile {
  id: string;
  full_name: string | null;
  role: UserRole;
  position: string | null;
  is_active: boolean;
  created_at: string;
}

interface AuthUserMin {
  id: string;
  email?: string | null;
}

export default async function TeamPage() {
  const auth = await requireAuth();
  if (
    !auth.branch ||
    (auth.profile.role !== "branch_master_admin" && auth.profile.role !== "branch_admin")
  ) {
    redirect("/branch");
  }

  // Admin client so the team page can list emails (auth.users) — RLS on
  // profiles would only give us names + roles. Tenant scope is enforced by
  // filtering on branch_id below.
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("profiles" as never)
    .select("id, full_name, role, position, is_active, created_at")
    .eq("branch_id", auth.branch.id)
    .order("created_at", { ascending: true });
  const profiles = (rows as TeamProfile[] | null) ?? [];

  const { data: authList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const emailById = new Map<string, string>();
  for (const u of (authList?.users ?? []) as AuthUserMin[]) {
    if (u.email) emailById.set(u.id, u.email);
  }

  const isMaster = auth.profile.role === "branch_master_admin";
  const allowedInviteRoles: InvitableRole[] = isMaster
    ? ["branch_admin", "branch_team_member", "branch_chairman"]
    : ["branch_team_member"];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">Team</h1>
        <p className="text-text-secondary">
          {isMaster
            ? "Manage admins, team members, and the Chairman for this branch."
            : "Invite team members and manage their access for this branch."}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Invite someone new</CardTitle>
          <CardDescription>
            They&rsquo;ll get an email with a link to set up their password. The invite never expires.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteUserForm allowedRoles={allowedInviteRoles} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current team</CardTitle>
          <CardDescription>
            {profiles.length} member{profiles.length === 1 ? "" : "s"} across all roles.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {profiles.map((p) => {
            const canManageThis =
              auth.profile.role === "branch_master_admin" ||
              (auth.profile.role === "branch_admin" &&
                p.role !== "branch_master_admin" &&
                p.role !== "branch_admin");
            return (
              <TeamMemberRow
                key={p.id}
                profileId={p.id}
                fullName={p.full_name ?? "(no name)"}
                email={emailById.get(p.id) ?? "(no email on auth record)"}
                role={p.role}
                position={p.position}
                isActive={p.is_active}
                isSelf={p.id === auth.userId}
                canChangeRole={isMaster}
                canChangeEmail={isMaster}
                canManage={canManageThis}
              />
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
