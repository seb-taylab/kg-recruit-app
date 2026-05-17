/**
 * Branch dashboard root.
 *
 * Role-aware overview: branch admin team sees inbox / history counts and
 * an HQ-email-missing nag (only meaningful for them); the Chairman sees
 * the number of applications pending their signature.
 */
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { resolveBranchDistrict } from "@/lib/sg/district-resolve";

const INBOX_STATUSES = [
  "PENDING_REFERRAL_ASSIGNMENT",
  "PENDING_BRANCH_ADMIN_REVIEW",
  "READY_TO_SEND",
  "SENT_TO_HQ",
];

export default async function BranchOverviewPage() {
  const auth = await requireAuth();
  const supabase = await createClient();
  const isChairman = auth.profile.role === "branch_chairman";

  const [{ count: inboxCount }, { count: pendingMyCount }, { count: historyCount }] =
    await Promise.all([
      supabase
        .from("applications")
        .select("*", { count: "exact", head: true })
        .in("status", INBOX_STATUSES),
      supabase
        .from("applications")
        .select("*", { count: "exact", head: true })
        .eq("status", "PENDING_CHAIRMAN"),
      supabase
        .from("applications")
        .select("*", { count: "exact", head: true })
        .in("status", ["COMPLETED", "HQ_REJECTED", "ARCHIVED"]),
    ]);

  const branchName = auth.branch?.name ?? "(no branch)";

  // HQ-email-missing prompt removed from Overview + Initiate per
  // 2026-05-18 direction — both surfaces are pre-action and the warning
  // was noise. The prompt still appears on /branch/ready-to-send where
  // the missing email genuinely blocks the Send-to-HQ action.

  // Resolve constituency → district via the directory so the header shows
  // the hierarchical context: "Kampong Glam · Jalan Besar GRC · Central
  // Singapore District". For wing branches or unmatched constituencies,
  // returns null and the subtitle silently omits the chip.
  const districtCtx = auth.branch?.branch_type === "territorial"
    ? await resolveBranchDistrict(auth.branch.constituency)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          {branchName}
        </h1>
        {districtCtx && (
          <p className="text-sm text-text-muted">
            {districtCtx.constituency}
            {districtCtx.district ? ` · ${districtCtx.district} District` : ""}
          </p>
        )}
        <p className="mt-1 text-text-secondary">
          Welcome back, {auth.profile.full_name ?? auth.email}.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isChairman ? (
          <Card>
            <CardHeader>
              <CardDescription>Awaiting your signature</CardDescription>
              <CardTitle>Pending my signature</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-3xl font-bold text-text-primary">
                {pendingMyCount ?? 0}
              </p>
              <Button asChild>
                <Link href="/branch/sign">Open queue</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardDescription>Needs action</CardDescription>
              <CardTitle>Inbox</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-3xl font-bold text-text-primary">
                {inboxCount ?? 0}
              </p>
              <Button asChild>
                <Link href="/branch/inbox">Open inbox</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardDescription>Everything in pipeline</CardDescription>
            {/* Matches the sidebar label "Applications" — previously
                called "Journey" here which mismatched the nav item. */}
            <CardTitle>Applications</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-3xl font-bold text-text-primary">
              {(inboxCount ?? 0) + (pendingMyCount ?? 0) + (historyCount ?? 0)}
            </p>
            <Button asChild variant="outline">
              <Link href="/branch/journey">Browse all</Link>
            </Button>
          </CardContent>
        </Card>

        {!isChairman && (
          <Card>
            <CardHeader>
              <CardDescription>Closed</CardDescription>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-3xl font-bold text-text-primary">
                {historyCount ?? 0}
              </p>
              <Button asChild variant="outline">
                <Link href="/branch/history">View history</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
