import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/get-user";
import { isBranchAdminTeam } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { formatDateDDMMMYYYY } from "@/lib/format/date";

interface AppRow {
  id: string;
  applicant_name_at_invite: string | null;
  surname: string | null;
  given_names: string | null;
  ready_to_send_at: string | null;
  chairman_name_on_form: string | null;
}

interface SearchParams {
  just_sent?: string;
}

export default async function ReadyToSendPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const auth = await requireAuth();
  if (!auth.branch || !isBranchAdminTeam(auth.profile.role)) {
    redirect("/branch");
  }
  const { just_sent: justSent } = await searchParams;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("applications")
    .select(
      "id, applicant_name_at_invite, surname, given_names, ready_to_send_at, chairman_name_on_form",
    )
    .eq("status", "READY_TO_SEND")
    .order("ready_to_send_at", { ascending: true });
  const apps = (rows as AppRow[] | null) ?? [];

  const hqEmailMissing = !auth.branch.hq_email;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-blue">
          {auth.branch.name}
        </p>
        <h1 className="text-3xl font-bold leading-tight text-text-primary">Ready to send to HQ</h1>
        <p className="text-text-secondary">
          {apps.length === 0
            ? "Nothing waiting to send."
            : `${apps.length} application${apps.length === 1 ? "" : "s"} signed by the Chairman, ready for PDF and HQ send.`}
        </p>
      </header>

      {justSent && (
        <Alert variant="info">
          <AlertDescription>Application sent.</AlertDescription>
        </Alert>
      )}

      {hqEmailMissing && (
        <Alert variant="warning">
          <AlertDescription>
            HQ email not set. You can still send to yourself or custom recipients, but the &ldquo;Send to HQ&rdquo;
            option is disabled. Set it in <Link href="/branch/settings" className="font-medium text-brand-blue hover:underline">Branch settings</Link>.
          </AlertDescription>
        </Alert>
      )}

      {apps.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing ready to send</CardTitle>
            <CardDescription>
              Applications appear here once the Branch Chairman signs.
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
            return (
              <li key={a.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col">
                      <p className="text-base font-semibold text-text-primary">{display}</p>
                      <p className="text-sm text-text-muted">
                        Chairman signed {formatDateDDMMMYYYY(a.ready_to_send_at)}
                        {a.chairman_name_on_form ? ` · ${a.chairman_name_on_form}` : ""}
                      </p>
                    </div>
                    <Button asChild>
                      <Link href={`/branch/ready-to-send/${a.id}`}>Review and send</Link>
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
