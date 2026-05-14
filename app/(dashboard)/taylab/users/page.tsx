import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";

interface ProfileRow {
  id: string;
  full_name: string | null;
  role: UserRole;
  branch_id: string | null;
  is_active: boolean;
}

interface BranchRow {
  id: string;
  name: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  branch_master_admin: "Master Admin",
  branch_admin: "Admin",
  branch_team_member: "Team member",
  branch_chairman: "Chairman",
  taylab_staff: "Taylab Staff",
};

const ROLE_FILTERS = [
  "all",
  "branch_master_admin",
  "branch_admin",
  "branch_team_member",
  "branch_chairman",
  "taylab_staff",
] as const;

export default async function TaylabUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; role?: string }>;
}) {
  const auth = await requireAuth();
  if (auth.profile.role !== "taylab_staff") {
    redirect("/branch");
  }

  const { branch: branchFilter, role: roleFilter } = await searchParams;
  const admin = createAdminClient();

  const [branchesRes, profilesRes, authRes] = await Promise.all([
    admin.from("branches" as never).select("id, name").order("name"),
    admin
      .from("profiles" as never)
      .select("id, full_name, role, branch_id, is_active")
      .order("full_name"),
    admin.auth.admin.listUsers({ page: 1, perPage: 500 }),
  ]);

  const branches = (branchesRes.data as BranchRow[] | null) ?? [];
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  const profiles = (profilesRes.data as ProfileRow[] | null) ?? [];
  const emailById = new Map<string, string>();
  for (const u of authRes.data?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email);
  }

  const filtered = profiles.filter((p) => {
    if (branchFilter && branchFilter !== "all" && p.branch_id !== branchFilter) return false;
    if (
      roleFilter &&
      roleFilter !== "all" &&
      (ROLE_FILTERS as readonly string[]).includes(roleFilter) &&
      p.role !== roleFilter
    ) {
      return false;
    }
    return true;
  });

  function buildHref(next: { branch?: string; role?: string }): string {
    const params = new URLSearchParams();
    const branch = next.branch ?? branchFilter;
    const role = next.role ?? roleFilter;
    if (branch && branch !== "all") params.set("branch", branch);
    if (role && role !== "all") params.set("role", role);
    const q = params.toString();
    return q ? `/taylab/users?${q}` : "/taylab/users";
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-blue">Taylab</p>
        <h1 className="text-3xl font-bold leading-tight text-text-primary">Users</h1>
        <p className="text-text-secondary">
          Cross-tenant directory — {filtered.length} of {profiles.length} shown. Tenant teams
          are managed by each branch&rsquo;s Master Admin.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Branch and role are applied via query params.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-text-primary">Branch</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant={branchFilter && branchFilter !== "all" ? "outline" : "primary"} size="sm">
                <Link href={buildHref({ branch: "all" })}>All</Link>
              </Button>
              {branches.map((b) => (
                <Button
                  key={b.id}
                  asChild
                  variant={branchFilter === b.id ? "primary" : "outline"}
                  size="sm"
                >
                  <Link href={buildHref({ branch: b.id })}>{b.name}</Link>
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-text-primary">Role</p>
            <div className="flex flex-wrap gap-2">
              {ROLE_FILTERS.map((r) => (
                <Button
                  key={r}
                  asChild
                  variant={
                    (roleFilter ?? "all") === r ? "primary" : "outline"
                  }
                  size="sm"
                >
                  <Link href={buildHref({ role: r })}>
                    {r === "all" ? "All" : ROLE_LABELS[r as UserRole]}
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{filtered.length} user{filtered.length === 1 ? "" : "s"}</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-text-muted">No users match these filters.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-1 rounded-md border border-border bg-surface-page p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col">
                    <p className="text-sm font-semibold text-text-primary">
                      {p.full_name ?? "(no name)"}
                      {!p.is_active && (
                        <span className="ml-2 text-xs font-normal uppercase tracking-wide text-text-muted">
                          Inactive
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {emailById.get(p.id) ?? "(no email)"} · {ROLE_LABELS[p.role]} ·{" "}
                      {p.branch_id ? (branchNameById.get(p.branch_id) ?? "(unknown)") : "—"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
