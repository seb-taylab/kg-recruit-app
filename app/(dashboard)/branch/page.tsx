/**
 * Branch dashboard root — Step 2 shell. Verifies RLS scoping by querying
 * profiles + applications and showing the counts the user can actually see.
 *
 * Acceptance: this page should render zero leaks across branches in Test 2
 * once a second branch is seeded.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireAuth } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

export default async function BranchOverviewPage() {
  const auth = await requireAuth();
  const supabase = await createClient();

  const [{ count: teamCount }, { count: appCount }] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("applications").select("*", { count: "exact", head: true }),
  ]);

  const branchName = auth.branch?.name ?? "(no branch)";
  const hqEmailMissing = auth.branch && !auth.branch.hq_email;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          {branchName}
        </h1>
        <p className="text-text-secondary">Welcome back, {auth.profile.full_name ?? auth.email}.</p>
      </header>

      {hqEmailMissing && (
        <Alert variant="warning">
          <AlertTitle>Set HQ email in Branch Settings</AlertTitle>
          <AlertDescription>
            Branch HQ email is required before any application can be sent to HQ.
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>RLS verification</CardDescription>
            <CardTitle>Branch team members</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-text-primary">{teamCount ?? 0}</p>
            <p className="mt-1 text-sm text-text-muted">
              Only same-branch profiles are visible to you.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>RLS verification</CardDescription>
            <CardTitle>Applications visible</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-text-primary">{appCount ?? 0}</p>
            <p className="mt-1 text-sm text-text-muted">
              Step 3+ will populate this. Today it should be 0 across branches.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>You are</CardDescription>
            <CardTitle>{roleLabel(auth.profile.role)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-secondary">
              Position: <span className="font-medium">{auth.profile.position ?? "—"}</span>
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Step 2 status</CardTitle>
            <CardDescription>Auth shell + RLS scaffolding</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-text-secondary">
            <p>
              You are signed in with branch-scoped RLS. The invite flow, applicant form, signatures,
              and dashboard tabs go live from Step 3 onwards.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function roleLabel(role: string) {
  switch (role) {
    case "branch_master_admin":
      return "Branch Master Admin";
    case "branch_admin":
      return "Branch Admin";
    case "branch_team_member":
      return "Branch Team Member";
    case "branch_chairman":
      return "Branch Chairman";
    case "taylab_staff":
      return "Taylab Staff";
    default:
      return role;
  }
}
