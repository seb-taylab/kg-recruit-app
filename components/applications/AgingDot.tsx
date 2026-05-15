/**
 * @tier atom
 * @design-spec KG_DesignSystem_v1.md §2 (Status dot + numeric label)
 * @used-by Applications Table (Days in state column), Kanban card
 *
 * Traffic-light dot + day count. Green < 3d, amber 3-6d, red ≥ 7d.
 * Computation lives in lib/applications/aging.ts so the same thresholds
 * power filter chips ("Aging > 7d") and the visual.
 */
import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { AGING_DOT_CLASS, computeAging } from "@/lib/applications/aging";

interface AgingDotProps {
  /** ISO timestamp when the row entered its current status. Null = render "—". */
  stateChangedAt: string | null;
  /** When false, only the dot renders (handy on cramped Kanban cards). */
  showLabel?: boolean;
  className?: string;
}

export function AgingDot({
  stateChangedAt,
  showLabel = true,
  className,
}: AgingDotProps) {
  const info = computeAging(stateChangedAt);
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn("h-2 w-2 shrink-0 rounded-full", AGING_DOT_CLASS[info.level])}
        aria-label={`Aging ${info.label}, ${info.level}`}
      />
      {showLabel && (
        <span className="text-xs tabular-nums text-text-secondary">{info.label}</span>
      )}
    </span>
  );
}
