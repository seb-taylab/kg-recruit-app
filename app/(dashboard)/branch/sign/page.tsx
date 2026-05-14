import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { formatDateDDMMMYYYY } from "@/lib/format/date";

interface AppRow {
  id: string;
  applicant_name_at_invite: string | null;
  surname: string | null;
  given_names: string | null;
  referral_signed_at: string | null;
  branch_admin_review_at: string | null;
}

interface SearchParams {
  just_signed?: string;
}

export default async function ChairmanSignListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requireAuth();
  if (!auth.branch || auth.profile.role !== "branch_chairman") {
    redirect("/branch");
  }
  const { just_signed: justSigned } = await searchParams;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("applications")
    .select(
      "id, applicant_name_at_invite, surname, given_names, referral_signed_at, branch_admin_review_at",
    )
    .eq("status", "PENDING_CHAIRMAN")
    .order("referral_signed_at", { ascending: true });
  const apps = (rows as AppRow[] | null) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-blue">
          {auth.branch.name}
        </p>
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          Pending my signature
        </h1>
        <p className="text-text-secondary">
          {apps.length === 0
            ? "Nothing waiting on you right now."
            : `${apps.length} application${apps.length === 1 ? "" : "s"} ready for your signature.`}
        </p>
      </header>

      {justSigned && (
        <Alert variant="info">
          <AlertDescription>Application signed. Branch admin will pick PDF recipients next.</AlertDescription>
        </Alert>
      )}

      {apps.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing pending</CardTitle>
            <CardDescription>
              Applications waiting for your signature appear here once the referral has signed.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {apps.map((a) => {
            const display =
              (a.given_names && a.surname
                ? `${a.given_names} ${a.surname}`
                : a.applicant_name_at_invite) ?? "(no name on record)";
            const arrived = a.branch_admin_review_at ?? a.referral_signed_at;
            return (
              <li key={a.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col">
                      <p className="text-base font-semibold text-text-primary">{display}</p>
                      <p className="text-sm text-text-muted">
                        Ready since {formatDateDDMMMYYYY(arrived)}
                      </p>
                    </div>
                    <Button asChild>
                      <Link href={`/branch/sign/${a.id}`}>Open and sign</Link>
                    </Button>
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
