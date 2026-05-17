import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateDDMMMYYYY } from "@/lib/format/date";
import { CreateBranchDialog } from "@/components/taylab/CreateBranchDialog";
import { BranchActiveToggle } from "@/components/taylab/BranchActiveToggle";
import { resolveBranchDistrictsForMany } from "@/lib/sg/district-resolve";

interface BranchRow {
  id: string;
  name: string;
  constituency: string | null;
  branch_type: "territorial" | "wing";
  hq_email: string | null;
  is_active: boolean;
  created_at: string;
}

export default async function TaylabBranchesPage() {
  const auth = await requireAuth();
  if (auth.profile.role !== "taylab_staff") {
    redirect("/branch");
  }

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("branches" as never)
    .select("id, name, constituency, branch_type, hq_email, is_active, created_at")
    .order("created_at", { ascending: true });
  const branches = (rows as BranchRow[] | null) ?? [];

  // Application counts per branch (lifetime, all statuses). Tally in
  // memory — PostgREST doesn't expose group-by directly, and the tenant
  // count is small enough that one full scan is fine.
  const counts = new Map<string, number>();
  if (branches.length > 0) {
    const { data: raw } = await admin
      .from("applications" as never)
      .select("branch_id");
    for (const r of ((raw as Array<{ branch_id: string }> | null) ?? [])) {
      counts.set(r.branch_id, (counts.get(r.branch_id) ?? 0) + 1);
    }
  }

  // Resolve district per territorial branch in one round-trip. Wings don't
  // have a district context (they sit above constituencies).
  const districtMap = await resolveBranchDistrictsForMany(
    branches.filter((b) => b.branch_type === "territorial").map((b) => b.constituency),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold leading-tight text-text-primary">Branches</h1>
          <p className="text-text-secondary">
            {branches.length} tenant{branches.length === 1 ? "" : "s"}. Create new branches and
            invite the first Master Admin in one go.
          </p>
        </div>
        <CreateBranchDialog />
      </header>

      {branches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No branches yet</CardTitle>
            <CardDescription>Create the first branch to get started.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {branches.map((b) => {
            const ctx = b.constituency ? districtMap.get(b.constituency.trim()) : null;
            // Hierarchical context line. For territorial branches:
            //   {Constituency} · {District}
            // For wings: just "Wing" since they have no constituency/district.
            const contextLine =
              b.branch_type === "wing"
                ? "Wing"
                : ctx
                  ? `${ctx.constituency}${ctx.district ? ` · ${ctx.district} District` : ""}`
                  : (b.constituency ?? "—");
            return (
              <li key={b.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col">
                      <p className="text-base font-semibold text-text-primary">
                        {b.name}
                        {b.branch_type === "wing" && (
                          <span className="ml-2 rounded-full border border-state-info px-2 py-0.5 text-xs font-medium text-state-info">
                            Wing
                          </span>
                        )}
                        {!b.is_active && (
                          <span className="ml-2 text-xs font-normal uppercase tracking-wide text-text-muted">
                            Inactive
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-text-secondary">
                        {contextLine} · {b.hq_email ?? "no HQ email"} ·{" "}
                        {counts.get(b.id) ?? 0} application
                        {(counts.get(b.id) ?? 0) === 1 ? "" : "s"}
                      </p>
                      <p className="text-xs text-text-muted">
                        Created {formatDateDDMMMYYYY(b.created_at)}
                      </p>
                    </div>
                    <BranchActiveToggle branchId={b.id} active={b.is_active} />
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
