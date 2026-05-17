/**
 * Wing team — invite wing_admin / wing_chairman + list members + toggle
 * activation. wing_admin only; wing_chairman gets bounced to /wing.
 */
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { WingInviteForm } from "@/components/wing/WingInviteForm";
import { WingMemberRow } from "@/components/wing/WingMemberRow";
import { isWingRole } from "@/types/database";

interface WingMember {
  id: string;
  user_id: string;
  full_name: string | null;
  role: "wing_admin" | "wing_chairman";
  position: string | null;
  is_active: boolean;
  created_at: string;
}

export default async function WingTeamPage() {
  const auth = await requireAuth();

  if (!isWingRole(auth.activeProfile.role)) {
    if (auth.activeProfile.role === "taylab_staff") redirect("/taylab");
    redirect("/branch");
  }
  if (!auth.activeBranch || auth.activeBranch.branch_type !== "wing") {
    redirect("/select-workspace");
  }
  // wing_chairman is oversight — not a Team-managing role.
  if (auth.activeProfile.role !== "wing_admin") {
    redirect("/wing");
  }

  const admin = createAdminClient();
  const [{ data: rows }, { data: authList }] = await Promise.all([
    admin
      .from("profiles" as never)
      .select("id, user_id, full_name, role, position, is_active, created_at")
      .eq("branch_id", auth.activeBranch.id)
      .in("role", ["wing_admin", "wing_chairman"])
      .order("created_at", { ascending: true }),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
  ]);
  const members = (rows as WingMember[] | null) ?? [];
  const emailById = new Map<string, string>();
  for (const u of authList?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">Wing team</h1>
        <p className="text-text-secondary">
          Invite wing admins (operational) and a wing chairman (oversight). Multi-profile
          accounts welcome — someone already in a territorial branch can hold a wing role
          too.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
          <CardDescription>
            They get an email with a sign-in link. If they already have an account on the
            platform, no new email is sent — they just see this wing in their workspace
            picker next time they log in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WingInviteForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current team</CardTitle>
          <CardDescription>
            {members.length} member{members.length === 1 ? "" : "s"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {members.length === 0 ? (
            <p className="text-sm text-text-muted">No members yet.</p>
          ) : (
            members.map((m) => (
              <WingMemberRow
                key={m.id}
                profileId={m.id}
                fullName={m.full_name ?? "(no name)"}
                email={emailById.get(m.user_id) ?? "(no email on auth record)"}
                role={m.role}
                position={m.position}
                isActive={m.is_active}
                isSelf={m.user_id === auth.userId}
                canManage={true}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
