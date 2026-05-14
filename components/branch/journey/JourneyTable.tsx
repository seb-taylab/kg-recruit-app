/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (Data table)
 * @consumes ui/Card, StatusBadge
 * @used-by app/(dashboard)/branch/journey/page.tsx
 *
 * Sortable-by-default-on-server table. View is read-only — clicking a row
 * navigates to the application detail page where the actions live.
 */
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateDDMMMYYYY } from "@/lib/format/date";
import { StatusBadge } from "@/components/branch/journey/StatusBadge";
import type { JourneyRow } from "@/lib/journey/data";

export function JourneyTable({ apps }: { apps: JourneyRow[] }) {
  if (apps.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-text-muted">
          No applications match the current filters.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-page text-left text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Applicant</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
                <th className="px-4 py-3 font-medium">Invited</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-text-primary">{a.displayName}</p>
                    {a.referralName && (
                      <p className="text-xs text-text-muted">
                        Referred by {a.referralName}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3 align-top text-text-secondary">
                    {formatDateDDMMMYYYY(a.lastActivityAt)}
                  </td>
                  <td className="px-4 py-3 align-top text-text-secondary">
                    {formatDateDDMMMYYYY(a.invitedAt)}
                  </td>
                  <td className="px-4 py-3 text-right align-top">
                    <Link
                      href={`/branch/applications/${a.id}`}
                      className="text-sm font-medium text-brand-blue hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
