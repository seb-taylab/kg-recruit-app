/**
 * Workspace picker — fires when a user has multiple active profiles and no
 * active_profile_id cookie. Lists profiles with branch name + role, click
 * sets the cookie and redirects to the right shell (/branch, /wing, /taylab).
 *
 * Single-profile users never reach this page — getAuthContext picks their
 * one profile implicitly. The login action also auto-resolves single-profile
 * users by setting the cookie eagerly before redirect.
 */
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthSession } from "@/lib/auth/get-user";
import { setActiveProfileCookie } from "@/lib/auth/active-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { WorkspacePicker } from "@/components/auth/WorkspacePicker";
import { resolveBranchDistrictsForMany } from "@/lib/sg/district-resolve";

interface BranchRow {
  id: string;
  name: string;
  constituency: string | null;
  branch_type: "territorial" | "wing";
}

export default async function SelectWorkspacePage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  // Edge case: a user landed here with exactly 1 profile (e.g. they manually
  // typed /select-workspace). Resolve and redirect — no picker UI needed.
  if (session.profiles.length === 1) {
    const only = session.profiles[0];
    await setActiveProfileCookie(only.id);
    const dest =
      only.role === "taylab_staff"
        ? "/taylab"
        : only.role === "wing_admin" || only.role === "wing_chairman"
          ? "/wing"
          : "/branch";
    redirect(dest);
  }

  // Bulk-load the branches for all profiles. Admin client because RLS would
  // require active workspace; we're explicitly running before that gate.
  const branchIds = session.profiles
    .map((p) => p.branch_id)
    .filter((v): v is string => v !== null);

  const admin = createAdminClient();
  let branchesById = new Map<string, BranchRow>();
  if (branchIds.length > 0) {
    const { data } = await admin
      .from("branches" as never)
      .select("id, name, constituency, branch_type")
      .in("id", branchIds);
    const rows = (data as BranchRow[] | null) ?? [];
    branchesById = new Map(rows.map((b) => [b.id, b]));
  }

  // Resolve districts for territorial branches in one round-trip.
  const districtMap = await resolveBranchDistrictsForMany(
    Array.from(branchesById.values())
      .filter((b) => b.branch_type === "territorial")
      .map((b) => b.constituency),
  );

  const workspaces = session.profiles.map((p) => {
    const branch = p.branch_id ? branchesById.get(p.branch_id) : null;
    const ctx =
      branch && branch.branch_type === "territorial" && branch.constituency
        ? districtMap.get(branch.constituency.trim()) ?? null
        : null;
    return {
      profileId: p.id,
      role: p.role,
      branchName:
        p.role === "taylab_staff"
          ? "Taylab platform"
          : branch?.name ?? "(branch unknown)",
      branchType: branch?.branch_type ?? null,
      constituency: branch?.constituency ?? null,
      district: ctx?.district ?? null,
    };
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Pick a workspace</CardTitle>
          <CardDescription>
            Your account has access to multiple branches and wings. Choose
            which one to open. You can switch later from the menu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspacePicker workspaces={workspaces} />
        </CardContent>
      </Card>
    </main>
  );
}
