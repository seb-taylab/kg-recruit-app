/**
 * @tier molecule
 * @design-spec KG_DesignSystem_v1.md §3 (DashboardTable mobile-first card list)
 * @brand-spec KG_BrandExecution_PAP.md §3.7 (empty state copy)
 * @consumes ui/Card
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx
 */
import { Mail, Copy, MessageCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateDDMMMYYYY } from "@/lib/format/date";

export interface LinkDeliveryRow {
  id: string;
  channel: "email" | "copy_link" | "whatsapp";
  delivered_at: string;
  delivered_by_name: string | null;
}

const CHANNEL_META: Record<LinkDeliveryRow["channel"], { label: string; Icon: typeof Mail }> = {
  email: { label: "Email", Icon: Mail },
  copy_link: { label: "Copy link", Icon: Copy },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle },
};

export function LinkHistory({ deliveries }: { deliveries: LinkDeliveryRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Share history</CardTitle>
        <CardDescription>Every time the link was sent or copied.</CardDescription>
      </CardHeader>
      <CardContent>
        {deliveries.length === 0 ? (
          <p className="text-sm text-text-muted">
            No shares yet. Use the panel above to send the invite.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {deliveries.map((d) => {
              const meta = CHANNEL_META[d.channel];
              const Icon = meta.Icon;
              return (
                <li key={d.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">{meta.label}</p>
                      <p className="text-xs text-text-muted">
                        {d.delivered_by_name ?? "—"}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-text-muted">
                    {formatDateDDMMMYYYY(d.delivered_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
