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
  district: "Central" | "East Coast" | "North East" | "North West" | "West Coast" | null;
  verification_status: "seed" | "verified" | "manual";
}

const DISTRICTS = [
  "Central",
  "East Coast",
  "North East",
  "North West",
  "West Coast",
] as const;

const NULL_VALUE = "__null__";

export function DirectoryRow({
  constituency,
  constituency_type,
  district,
  verification_status,
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
          : (value as "Central" | "East Coast" | "North East" | "North West" | "West Coast"),
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

  return (
    <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-surface-card p-4 sm:grid-cols-[1fr_120px_220px_auto] sm:items-center">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-text-primary">{constituency}</span>
        <span className="text-xs text-text-muted">{constituency_type}</span>
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
