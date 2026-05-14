/**
 * @tier atom
 * @design-spec KG_DesignSystem_v1.md §2 (Badge primitive)
 * @consumes none
 * @used-by Journey table / kanban / timeline
 *
 * Status pill — colour-coded outline by application status. Outline-only
 * (no `-soft` background tokens in the design system).
 */
import { cn } from "@/lib/utils/cn";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  type ApplicationStatus,
} from "@/lib/journey/status";

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const label = STATUS_LABEL[status] ?? status;
  const colour = STATUS_BADGE_CLASS[status] ?? "border-border text-text-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium",
        colour,
      )}
    >
      {label}
    </span>
  );
}
