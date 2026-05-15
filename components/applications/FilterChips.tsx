/**
 * @tier molecule
 * @design-spec KG_DesignSystem_v1.md §2 (Chip / pill)
 * @consumes lib/applications/filters
 * @used-by PR-B: Applications Table (above the table, between heading and rows)
 *
 * Multi-select pill row. AND semantics across active chips. Active state
 * uses brand-red fill + inverse text; inactive is outline. A "Clear"
 * link reappears once at least one chip is on. Designed to be a
 * controlled component so the Table can persist the active set to the
 * URL query (?filters=aging_gt_7,at_hq).
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { FILTER_CHIPS, type FilterChipKey } from "@/lib/applications/filters";

interface FilterChipsProps {
  active: FilterChipKey[];
  onChange: (next: FilterChipKey[]) => void;
}

export function FilterChips({ active, onChange }: FilterChipsProps) {
  function toggle(key: FilterChipKey) {
    onChange(active.includes(key) ? active.filter((k) => k !== key) : [...active, key]);
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick filters">
      {FILTER_CHIPS.map((chip) => {
        const on = active.includes(chip.key);
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => toggle(chip.key)}
            aria-pressed={on}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors duration-fast",
              on
                ? "border-brand-red bg-brand-red text-text-inverse"
                : "border-border bg-surface-card text-text-secondary hover:border-text-secondary hover:text-text-primary",
            )}
          >
            {chip.label}
          </button>
        );
      })}
      {active.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs text-text-muted underline underline-offset-2 hover:text-text-primary"
        >
          Clear
        </button>
      )}
    </div>
  );
}
