/**
 * @tier organism
 * @consumes ui/Select, ui/Button, sonner
 * @used-by app/(dashboard)/taylab/directory/page.tsx
 *
 * One row per constituency. District is a select; saving flips
 * verification_status from 'seed' → 'verified' so unverified rows are
 * visually distinct.
 */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateConstituencyDirectoryAction } from "@/app/(dashboard)/taylab/directory/actions";

interface DirectoryRowProps {
  constituency: string;
  constituency_type: "GRC" | "SMC";
  district:
    | "Central Singapore"
    | "North East"
    | "North West"
    | "South East"
    | "South West"
    | null;
  verification_status: "seed" | "verified" | "manual";
  /** Names of territorial branches operating in this constituency (if any).
   * Surfaces the branch ↔ constituency relationship so taylab can see "JALAN
   * BESAR GRC has 1 branch: Kampong Glam" at a glance — and notice gaps
   * (constituencies with no branch coverage). */
  branchNames: string[];
}

const DISTRICTS = [
  "Central Singapore",
  "North East",
  "North West",
  "South East",
  "South West",
] as const;

const NULL_VALUE = "__null__";

export function DirectoryRow({
  constituency,
  constituency_type,
  district,
  verification_status,
  branchNames,
}: DirectoryRowProps) {
  const router = useRouter();
  const [value, setValue] = React.useState<string>(district ?? NULL_VALUE);
  const [pending, setPending] = React.useState(false);
  const dirty = (district ?? NULL_VALUE) !== value;

  async function handleSave() {
    setPending(true);
    const result = await updateConstituencyDirectoryAction({
      constituency,
      district:
        value === NULL_VALUE
          ? null
          : (value as
              | "Central Singapore"
              | "North East"
              | "North West"
              | "South East"
              | "South West"),
    });
    setPending(false);
    if (result.ok) {
      toast.success(`${constituency} updated.`);
      router.refresh();
    } else {
      toast.error(result.error ?? "Couldn't save.");
    }
  }

  const statusLabel =
    verification_status === "seed" && district !== null
      ? "Unverified guess"
      : verification_status === "verified"
        ? "Verified"
        : verification_status === "manual"
          ? "Added manually"
          : "No district yet";
  const statusTone =
    verification_status === "verified"
      ? "border-state-success text-state-success"
      : district === null
        ? "border-state-error text-state-error"
        : "border-state-warning text-state-warning";

  // Pixel-precise column widths for the constituency directory row — opt out of the token allowlist.
  const rowGridClass = "grid grid-cols-1 gap-3 rounded-md border border-border bg-surface-card p-4 sm:grid-cols-[1fr_120px_220px_auto] sm:items-center"; // tokens-ok

  return (
    <div className={rowGridClass}>
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-text-primary">{constituency}</span>
        <span className="text-xs text-text-muted">
          {constituency_type}
          {branchNames.length > 0
            ? ` · ${branchNames.length} branch${branchNames.length === 1 ? "" : "es"}: ${branchNames.join(", ")}`
            : ""}
        </span>
      </div>

      <span
        className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone}`}
      >
        {statusLabel}
      </span>

      <Select value={value} onValueChange={setValue}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NULL_VALUE}>— No district —</SelectItem>
          {DISTRICTS.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        size="sm"
        variant={dirty ? "primary" : "outline"}
        disabled={!dirty || pending}
        onClick={handleSave}
      >
        {pending ? "Saving…" : dirty ? "Save" : "Saved"}
      </Button>
    </div>
  );
}
