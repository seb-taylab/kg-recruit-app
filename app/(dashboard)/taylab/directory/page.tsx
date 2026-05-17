/**
 * Constituency directory — taylab editor.
 *
 * Lists every GE2025 constituency with its district + verification status.
 * taylab_staff can correct seed-guesses (flips to 'verified') and add new
 * entries if boundaries change.
 *
 * Groups: "Needs review" (seed-status entries) bubble to the top so the
 * verification work is obvious. Verified + manual entries collapse into a
 * "Verified" section below.
 */
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { DirectoryRow } from "@/components/taylab/DirectoryRow";
import type { ConstituencyDirectoryEntry } from "@/types/database";

export default async function TaylabDirectoryPage() {
  const auth = await requireAuth();
  if (auth.activeProfile.role !== "taylab_staff") {
    redirect("/branch");
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("constituency_directory" as never)
    .select(
      "constituency, constituency_type, district, verification_status, updated_at, boundary_version, updated_by_user_id",
    )
    .order("verification_status", { ascending: true }) // seed before verified
    .order("constituency", { ascending: true });
  const rows = (data as ConstituencyDirectoryEntry[] | null) ?? [];

  const needsReview = rows.filter((r) => r.verification_status === "seed");
  const verified = rows.filter((r) => r.verification_status !== "seed");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold leading-tight text-text-primary">
          Constituency directory
        </h1>
        <p className="text-text-secondary">
          Maps each GE2025 constituency to its PAP district. Drives the wing
          routing dialog&rsquo;s same-district fallback suggestions.
        </p>
      </header>

      <Alert variant="info">
        <AlertDescription>
          {rows.length} constituencies · {needsReview.length} still flagged for review.
          Saving a row marks it as <strong>verified</strong>.
        </AlertDescription>
      </Alert>

      {needsReview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Needs review</CardTitle>
            <CardDescription>
              Seed-data guesses — confirm or correct the district.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {needsReview.map((r) => (
              <DirectoryRow
                key={r.constituency}
                constituency={r.constituency}
                constituency_type={r.constituency_type}
                district={r.district}
                verification_status={r.verification_status}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {verified.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Verified</CardTitle>
            <CardDescription>
              {verified.length} entries you&rsquo;ve confirmed or added manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {verified.map((r) => (
              <DirectoryRow
                key={r.constituency}
                constituency={r.constituency}
                constituency_type={r.constituency_type}
                district={r.district}
                verification_status={r.verification_status}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
