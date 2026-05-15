/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (FormWizard, address sub-step)
 * @consumes ui/Input, ui/Label, /api/address/lookup
 * @used-by components/applicant/ApplicantWizard.tsx (Page 1)
 *
 * Postal-code-first address capture. The applicant types a 6-digit SG
 * postal code → after a short debounce we call OneMap via /api/address/
 * lookup → block / street / building auto-fill into read-only chips. The
 * applicant then types the unit number. Manual fallback (editable
 * block/street/building inputs) appears if the lookup fails.
 *
 * State is held in the parent's react-hook-form via the `form` prop —
 * keeps the rest of ApplicantWizard's draft autosave / validation
 * lifecycle unchanged. No FormProvider needed.
 */
"use client";

import * as React from "react";
import { Loader2, MapPin, Pencil, AlertCircle, CheckCircle2 } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import type { ApplicantPage1 } from "@/lib/validation/applicant-form";
import type { AddressLookup } from "@/app/api/address/lookup/route";

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; data: AddressLookup }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };

interface AddressFieldsProps {
  form: UseFormReturn<ApplicantPage1>;
  /** True when housing_type === "Landed" — hides the unit field. */
  isLanded: boolean;
}

export function AddressFields({ form, isLanded }: AddressFieldsProps) {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form;
  const [lookup, setLookup] = React.useState<LookupState>({ status: "idle" });
  const [manualMode, setManualMode] = React.useState(false);

  const postal = watch("postal_code");
  const blockNumber = watch("block_number");
  const streetName = watch("street_name");

  // If the user is returning to a partly-filled draft (saved with structured
  // fields but no recent lookup), don't strand them in idle — we treat the
  // "block_number present without an in-flight lookup" case as "already
  // filled" so the auto-fill block stays expanded. The presence of
  // block_number is a good signal because draft-autosave writes it.
  const hasStructuredData = Boolean(blockNumber && streetName);

  // Debounced lookup. All setLookup() calls live inside the setTimeout
  // callback (i.e. async) so React 19's react-hooks/set-state-in-effect
  // rule is satisfied — synchronous setState at the top of an effect
  // body is now disallowed.
  //
  // Side effect: when the applicant backspaces from a valid 6-digit code
  // to a partial one, the "Address found" message clears 300ms later
  // rather than instantly. Acceptable in exchange for a clean state
  // machine + no flicker between transitions.
  React.useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      if (!/^\d{6}$/.test(postal ?? "")) {
        setLookup({ status: "idle" });
        return;
      }
      setLookup({ status: "loading" });
      try {
        const res = await fetch(`/api/address/lookup?postal=${postal}`);
        const json = (await res.json()) as
          | { found: true; address: AddressLookup }
          | { found: false; error: string };
        if (cancelled) return;
        if (json.found) {
          setLookup({ status: "found", data: json.address });
          // Hydrate the form's structured fields. shouldValidate=false so
          // we don't trigger a flash of red errors on each keystroke.
          setValue("block_number", json.address.block_number ?? "", { shouldValidate: false });
          setValue("street_name", json.address.street_name ?? "", { shouldValidate: false });
          setValue("building_name", json.address.building_name ?? "", { shouldValidate: false });
          setValue("latitude", json.address.latitude, { shouldValidate: false });
          setValue("longitude", json.address.longitude, { shouldValidate: false });
          setManualMode(false);
        } else {
          setLookup({
            status: res.status >= 500 ? "error" : "not_found",
            message: json.error ?? "Address lookup failed.",
          });
        }
      } catch {
        if (!cancelled) {
          setLookup({
            status: "error",
            message: "Network error while looking up the address.",
          });
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [postal, setValue]);

  // Show the auto-fill block whenever there's something to show — either a
  // fresh lookup, the applicant opted into manual mode, or the draft was
  // restored with structured data already in it.
  const showStructuredBlock =
    lookup.status === "found" || manualMode || hasStructuredData;

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-sm font-semibold text-text-primary">Residential address</legend>

      {/* ─── Postal code (the entry point) ─────────────────────────── */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="postal_code">Postal code</Label>
        <div className="relative">
          <Input
            id="postal_code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoComplete="postal-code"
            placeholder="540102"
            hasError={Boolean(errors.postal_code)}
            {...register("postal_code", {
              onChange: (e) => {
                // Strip non-digits live, cap at 6. Pasting "Singapore 540102"
                // becomes "540102" automatically.
                e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
              },
            })}
            aria-describedby="postal-helper postal-status"
          />
          {lookup.status === "loading" && (
            <Loader2
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-muted"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          )}
        </div>
        <p id="postal-helper" className="text-sm text-text-muted">
          We&rsquo;ll look up your address automatically.
        </p>
        {errors.postal_code?.message && (
          <p className="text-sm text-state-error">{String(errors.postal_code.message)}</p>
        )}

        {/* Status row — empty in idle, populated on lookup result */}
        <div id="postal-status" aria-live="polite" className="min-h-6">
          {(lookup.status === "not_found" || lookup.status === "error") && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-state-error">
              <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span>{lookup.message}</span>
              {!manualMode && (
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className="font-medium underline underline-offset-2 hover:opacity-80"
                >
                  Enter manually
                </button>
              )}
            </div>
          )}
          {lookup.status === "found" && (
            <p className="flex items-center gap-2 text-sm text-state-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span>Address found.</span>
            </p>
          )}
        </div>
      </div>

      {/* ─── Auto-filled (or manual) address block ─────────────────── */}
      {showStructuredBlock && (
        <div className="flex flex-col gap-4 rounded-md border border-border bg-surface-page p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <MapPin className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              <span>{manualMode ? "Manual address" : "Auto-filled address"}</span>
            </div>
            {!manualMode && (
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
              >
                <Pencil className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                <span>Edit</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="block_number">Block / house number</Label>
              <Input
                id="block_number"
                readOnly={!manualMode}
                hasError={Boolean(errors.block_number)}
                className={cn(!manualMode && "bg-surface-input-disabled")}
                {...register("block_number")}
              />
              {errors.block_number?.message && (
                <p className="text-sm text-state-error">
                  {String(errors.block_number.message)}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="building_name">Building (if any)</Label>
              <Input
                id="building_name"
                readOnly={!manualMode}
                className={cn(!manualMode && "bg-surface-input-disabled")}
                {...register("building_name")}
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="street_name">Street</Label>
              <Input
                id="street_name"
                readOnly={!manualMode}
                hasError={Boolean(errors.street_name)}
                className={cn(!manualMode && "bg-surface-input-disabled")}
                {...register("street_name")}
              />
              {errors.street_name?.message && (
                <p className="text-sm text-state-error">{String(errors.street_name.message)}</p>
              )}
            </div>
          </div>

          {/* Unit — hidden when the applicant has selected Landed below. */}
          {!isLanded && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="unit_number">Unit number</Label>
              <Input
                id="unit_number"
                placeholder="#08-123"
                hasError={Boolean(errors.unit_number)}
                {...register("unit_number")}
              />
              <p className="text-sm text-text-muted">
                Format: <code>#FLOOR-UNIT</code>. Examples:{" "}
                <code>#08-123</code>, <code>#15-04A</code>.
              </p>
              {errors.unit_number?.message && (
                <p className="text-sm text-state-error">
                  {String(errors.unit_number.message)}
                </p>
              )}
            </div>
          )}

          {/* Hidden lat/lng — populated by the lookup, read by the submit
              handler so it can derive constituency on PR-2. The user
              never sees these. */}
          <input type="hidden" {...register("latitude", { valueAsNumber: true })} />
          <input type="hidden" {...register("longitude", { valueAsNumber: true })} />
        </div>
      )}
    </fieldset>
  );
}
