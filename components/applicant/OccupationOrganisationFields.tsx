/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (FormWizard, conditional reveal sub-step)
 * @consumes ui/Label, ui/Input, ui/Select, ui/RadioGroup
 * @used-by components/applicant/ApplicantWizard.tsx (Page 2)
 *
 * Category-first occupation + organisation capture. Applicant picks one
 * of 8 categories; the conditional detail / org-name fields then reveal
 * with category-appropriate labels. No "Nil" option — applicants who
 * don't have a job pick Homemaker / Retired / Unemployed explicitly,
 * which is honest and pre-empts HQ bouncing the application back.
 *
 * State + validation live in the parent's react-hook-form via the
 * `form` prop — same pattern as AddressFields. No FormProvider needed.
 */
"use client";

import * as React from "react";
import type { UseFormReturn } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ApplicantPage2 } from "@/lib/validation/applicant-form";
import {
  OCCUPATION_CATEGORIES,
  SCHOOL_LEVELS,
  type OccupationCategory,
} from "@/lib/validation/occupation-organisation";

interface OccupationOrganisationFieldsProps {
  form: UseFormReturn<ApplicantPage2>;
}

const CATEGORY_OPTIONS: { value: OccupationCategory; label: string; description: string }[] = [
  { value: "employed",         label: "Employed",         description: "Working for a company / employer" },
  { value: "self_employed",    label: "Self-employed",    description: "Own business or freelance" },
  { value: "student",          label: "Student",          description: "Currently studying full-time" },
  { value: "national_service", label: "National Service", description: "Currently serving NS" },
  { value: "unemployed",       label: "Unemployed",       description: "Between jobs or actively looking" },
  { value: "homemaker",        label: "Homemaker",        description: "Managing the home and family" },
  { value: "retired",          label: "Retired",          description: "No longer working" },
  { value: "other",            label: "Other",            description: "Doesn't fit above" },
];

const SCHOOL_LEVEL_OPTIONS: { value: (typeof SCHOOL_LEVELS)[number]; label: string }[] = [
  { value: "primary",       label: "Primary" },
  { value: "secondary",     label: "Secondary" },
  { value: "ite",           label: "ITE" },
  { value: "polytechnic",   label: "Polytechnic" },
  { value: "jc",            label: "Junior College / Pre-U" },
  { value: "undergraduate", label: "Undergraduate" },
  { value: "postgraduate",  label: "Postgraduate" },
  { value: "other",         label: "Other" },
];

void OCCUPATION_CATEGORIES; // satisfies — exported for downstream

export function OccupationOrganisationFields({
  form,
}: OccupationOrganisationFieldsProps) {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const category = watch("occupation_category");

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-sm font-semibold text-text-primary">
        Occupation &amp; organisation
      </legend>

      {/* ─── Category picker — RadioGroup, 2-col on sm+ ──────────────── */}
      <div className="flex flex-col gap-2">
        <Label required>What best describes you?</Label>
        <RadioGroup
          value={category ?? ""}
          onValueChange={(v) =>
            setValue("occupation_category", v as OccupationCategory, {
              shouldValidate: true,
            })
          }
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              htmlFor={`occ-cat-${opt.value}`}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface-card p-3 hover:border-text-secondary"
            >
              <RadioGroupItem
                id={`occ-cat-${opt.value}`}
                value={opt.value}
                className="mt-1 shrink-0"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-text-primary">{opt.label}</span>
                <span className="text-xs text-text-muted">{opt.description}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
        {errors.occupation_category?.message && (
          <p className="text-sm text-state-error">
            {String(errors.occupation_category.message)}
          </p>
        )}
      </div>

      {/* ─── Conditional detail fields per category ─────────────────── */}
      {category === "employed" && (
        <DetailFields
          form={form}
          detail={{
            label: "Job title",
            placeholder: "e.g. Software Engineer",
            required: true,
          }}
          org={{
            label: "Company name",
            placeholder: "e.g. Google",
            required: true,
          }}
        />
      )}

      {category === "self_employed" && (
        <DetailFields
          form={form}
          detail={{
            label: "Nature of business",
            placeholder: "e.g. Plumbing services",
            required: true,
          }}
          org={{
            label: "Business name",
            placeholder: "e.g. Plumb Co Pte Ltd",
            required: true,
          }}
        />
      )}

      {category === "student" && (
        <>
          <SingleOrgField
            form={form}
            label="School / institution name"
            placeholder="e.g. National University of Singapore"
            required
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="school_level">Level of study (optional)</Label>
            <Select
              value={watch("school_level") ?? ""}
              onValueChange={(v) =>
                setValue("school_level", v as ApplicantPage2["school_level"], {
                  shouldValidate: false,
                })
              }
            >
              <SelectTrigger id="school_level">
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                {SCHOOL_LEVEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {category === "national_service" && (
        <SingleDetailField
          form={form}
          label="Service / unit"
          placeholder="e.g. 1st Commando Battalion"
          required
        />
      )}

      {category === "unemployed" && (
        <DetailFields
          form={form}
          detail={{ label: "Last occupation (optional)", placeholder: "e.g. Marketing Manager" }}
          org={{ label: "Last employer (optional)", placeholder: "e.g. Acme Pte Ltd" }}
        />
      )}

      {category === "homemaker" && (
        <p className="rounded-md border border-border bg-surface-page p-3 text-sm text-text-secondary">
          No additional details needed. Thanks for filling this in.
        </p>
      )}

      {category === "retired" && (
        <DetailFields
          form={form}
          detail={{
            label: "Former occupation",
            placeholder: "e.g. Doctor",
            required: true,
          }}
          org={{
            label: "Former employer (optional)",
            placeholder: "e.g. Singapore General Hospital",
          }}
        />
      )}

      {category === "other" && (
        <SingleDetailField
          form={form}
          label="Describe"
          placeholder="e.g. Reservist trainer"
          required
        />
      )}
    </fieldset>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Small reusable sub-components — kept inside this file because they
// only make sense in this context (the labels/placeholders are
// category-specific).
// ─────────────────────────────────────────────────────────────────────

interface FieldSpec {
  label: string;
  placeholder?: string;
  required?: boolean;
}

function DetailFields({
  form,
  detail,
  org,
}: {
  form: UseFormReturn<ApplicantPage2>;
  detail: FieldSpec;
  org: FieldSpec;
}) {
  const {
    register,
    formState: { errors },
  } = form;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="occupation_detail" required={detail.required}>
          {detail.label}
        </Label>
        <Input
          id="occupation_detail"
          placeholder={detail.placeholder}
          hasError={Boolean(errors.occupation_detail)}
          {...register("occupation_detail")}
        />
        {errors.occupation_detail?.message && (
          <p className="text-sm text-state-error">
            {String(errors.occupation_detail.message)}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="organisation_name" required={org.required}>
          {org.label}
        </Label>
        <Input
          id="organisation_name"
          placeholder={org.placeholder}
          hasError={Boolean(errors.organisation_name)}
          {...register("organisation_name")}
        />
        {errors.organisation_name?.message && (
          <p className="text-sm text-state-error">
            {String(errors.organisation_name.message)}
          </p>
        )}
      </div>
    </div>
  );
}

function SingleDetailField({
  form,
  label,
  placeholder,
  required,
}: {
  form: UseFormReturn<ApplicantPage2>;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  const {
    register,
    formState: { errors },
  } = form;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="occupation_detail" required={required}>
        {label}
      </Label>
      <Input
        id="occupation_detail"
        placeholder={placeholder}
        hasError={Boolean(errors.occupation_detail)}
        {...register("occupation_detail")}
      />
      {errors.occupation_detail?.message && (
        <p className="text-sm text-state-error">
          {String(errors.occupation_detail.message)}
        </p>
      )}
    </div>
  );
}

function SingleOrgField({
  form,
  label,
  placeholder,
  required,
}: {
  form: UseFormReturn<ApplicantPage2>;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  const {
    register,
    formState: { errors },
  } = form;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="organisation_name" required={required}>
        {label}
      </Label>
      <Input
        id="organisation_name"
        placeholder={placeholder}
        hasError={Boolean(errors.organisation_name)}
        {...register("organisation_name")}
      />
      {errors.organisation_name?.message && (
        <p className="text-sm text-state-error">
          {String(errors.organisation_name.message)}
        </p>
      )}
    </div>
  );
}
