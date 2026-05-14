/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (FormWizard pattern, mobile-first)
 * @brand-spec KG_BrandExecution_PAP.md §3.2 (page titles), §3.3 (form labels), §3.5 (errors)
 * @consumes ui/Card, ui/Button, ui/Progress, ui/Input, ui/Label, ui/RadioGroup, ui/Checkbox, ui/Textarea, ui/Select, ui/Alert, applicant/PhotoStep, applicant/NricStep, applicant/MobileFormShell
 * @used-by app/apply/[token]/page.tsx
 *
 * Custom composition justification: shadcn ships primitives but no
 * multi-page form wizard. PRD §4.2 specifies a 2-page wizard + photo +
 * conditional NRIC + signature steps with sticky bottom CTAs on mobile.
 * react-hook-form drives state; each step is rendered inline below.
 */
"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FORM_TICK_VALUES } from "@/lib/pdf/form-coordinates-keys";
import {
  applicantPage1Schema,
  applicantPage2Schema,
  type ApplicantPage1,
  type ApplicantPage2,
  nricRequired,
} from "@/lib/validation/applicant-form";
import {
  saveDraftPage1Action,
  saveDraftPage2Action,
  uploadPhotoAction,
  uploadNricAction,
  submitApplicantSignatureAction,
} from "@/app/apply/[token]/actions";
import { useRouter } from "next/navigation";
import { MobileFormShell } from "./MobileFormShell";
import { PhotoStep } from "./PhotoStep";
import { NricStep } from "./NricStep";
import { SignaturePad } from "./SignaturePad";

type WizardStep = "page1" | "page2" | "photo" | "nric" | "sign";

/**
 * Loose shape — DB columns come back as plain strings (CHECK constraints
 * live in Postgres, not the row type). The wizard narrows them when seeding
 * react-hook-form.
 */
export interface ApplicantDraft {
  nric_no: string | null;
  surname: string | null;
  given_names: string | null;
  chinese_name: string | null;
  home_address: string | null;
  postal_code: string | null;
  housing_type: string | null;
  hdb_rooms: number | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  race: string | null;
  gender: string | null;
  marital_status: string | null;
  tel_home: string | null;
  tel_office: string | null;
  tel_hp: string | null;
  highest_edu: string | null;
  written_languages: string[] | null;
  spoken_languages: string[] | null;
  facebook: string | null;
  linkedin: string | null;
  twitter: string | null;
  blog: string | null;
  email: string | null;
  occupation: string | null;
  organisation: string | null;
  monthly_income: string | null;
  hobbies: string[] | null;
  trade_unions: string | null;
  associations: string | null;
  clubs: string | null;
  ccc: string | null;
  ccmc: string | null;
  rnc: string | null;
  grassroots: string | null;
  applicant_photo_url: string | null;
  consent_pdpa: boolean | null;
}

interface ApplicantWizardProps {
  applicationId: string;
  rawToken: string;
  branchName: string;
  defaultValues: ApplicantDraft;
  applicantNameHint: string | null;
  applicantEmailHint: string | null;
}

export function ApplicantWizard(props: ApplicantWizardProps) {
  const { rawToken, branchName, defaultValues, applicantEmailHint } = props;
  const router = useRouter();
  const [step, setStep] = React.useState<WizardStep>("page1");
  const [photoSaved, setPhotoSaved] = React.useState(Boolean(defaultValues.applicant_photo_url));
  const [nricFrontSaved, setNricFrontSaved] = React.useState(false);
  const [nricBackSaved, setNricBackSaved] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const page1Form = useForm<ApplicantPage1>({
    resolver: zodResolver(applicantPage1Schema),
    defaultValues: {
      nric_no: defaultValues.nric_no ?? "",
      surname: defaultValues.surname ?? "",
      given_names: defaultValues.given_names ?? "",
      chinese_name: defaultValues.chinese_name ?? undefined,
      home_address: defaultValues.home_address ?? "",
      postal_code: defaultValues.postal_code ?? "",
      housing_type: (defaultValues.housing_type as ApplicantPage1["housing_type"]) ?? undefined,
      hdb_rooms: defaultValues.hdb_rooms ?? undefined,
      date_of_birth: defaultValues.date_of_birth ?? "",
      place_of_birth: defaultValues.place_of_birth ?? "",
      race: (defaultValues.race as ApplicantPage1["race"]) ?? undefined,
      gender: (defaultValues.gender as ApplicantPage1["gender"]) ?? undefined,
      marital_status:
        (defaultValues.marital_status as ApplicantPage1["marital_status"]) ?? undefined,
      tel_home: defaultValues.tel_home ?? undefined,
      tel_office: defaultValues.tel_office ?? undefined,
      tel_hp: defaultValues.tel_hp ?? "",
      highest_edu: (defaultValues.highest_edu as ApplicantPage1["highest_edu"]) ?? undefined,
      written_languages:
        (defaultValues.written_languages as ApplicantPage1["written_languages"]) ?? [],
      spoken_languages:
        (defaultValues.spoken_languages as ApplicantPage1["spoken_languages"]) ?? [],
      facebook: defaultValues.facebook ?? undefined,
      linkedin: defaultValues.linkedin ?? undefined,
      twitter: defaultValues.twitter ?? undefined,
      blog: defaultValues.blog ?? undefined,
      email: defaultValues.email ?? applicantEmailHint ?? "",
    },
  });

  const page2Form = useForm<ApplicantPage2>({
    resolver: zodResolver(applicantPage2Schema),
    defaultValues: {
      occupation: defaultValues.occupation ?? "",
      organisation: defaultValues.organisation ?? "",
      monthly_income:
        (defaultValues.monthly_income as ApplicantPage2["monthly_income"]) ?? undefined,
      hobbies: defaultValues.hobbies ?? [],
      trade_unions: defaultValues.trade_unions ?? undefined,
      associations: defaultValues.associations ?? undefined,
      clubs: defaultValues.clubs ?? undefined,
      ccc: defaultValues.ccc ?? undefined,
      ccmc: defaultValues.ccmc ?? undefined,
      rnc: defaultValues.rnc ?? undefined,
      grassroots: defaultValues.grassroots ?? undefined,
      consent_pdpa: defaultValues.consent_pdpa ?? false,
    },
  });

  // react-hook-form's watch() uses a Proxy that React Compiler can't memoize
  // safely. We only read the watched value here for conditional rendering;
  // re-renders happen via react-hook-form's own subscriptions.
  // eslint-disable-next-line react-hooks/incompatible-library
  const placeOfBirth = page1Form.watch("place_of_birth");
  const housingType = page1Form.watch("housing_type");
  const needsNric = nricRequired(placeOfBirth);

  const totalSteps = needsNric ? 5 : 4;
  const stepIndex: Record<WizardStep, number> = {
    page1: 1,
    page2: 2,
    photo: 3,
    nric: 4,
    sign: needsNric ? 5 : 4,
  };

  const progressValue = Math.round((stepIndex[step] / totalSteps) * 100);

  async function handlePage1Next(values: ApplicantPage1) {
    setServerError(null);
    const result = await saveDraftPage1Action(rawToken, values);
    if (!result.ok) {
      setServerError(result.error ?? "Couldn't save — try again");
      return;
    }
    setStep("page2");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handlePage2Next(values: ApplicantPage2) {
    setServerError(null);
    const result = await saveDraftPage2Action(rawToken, values);
    if (!result.ok) {
      setServerError(result.error ?? "Couldn't save — try again");
      return;
    }
    setStep("photo");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handlePhotoUpload(blob: Blob) {
    const buf = await blob.arrayBuffer();
    const result = await uploadPhotoAction(rawToken, buf, "image/jpeg");
    if (!result.ok) {
      toast.error(result.error ?? "Couldn't save the photo");
      throw new Error(result.error);
    }
    setPhotoSaved(true);
    toast.success("Photo saved");
  }

  async function handleNricUpload(side: "front" | "back", file: File) {
    const buf = await file.arrayBuffer();
    const result = await uploadNricAction(rawToken, side, buf, file.type);
    if (!result.ok) {
      toast.error(result.error ?? "Couldn't save the scan");
      throw new Error(result.error);
    }
    if (side === "front") setNricFrontSaved(true);
    else setNricBackSaved(true);
    toast.success(`NRIC ${side} saved`);
  }

  async function handleSignatureSubmit(dataUrl: string) {
    const result = await submitApplicantSignatureAction(rawToken, dataUrl);
    if (!result.ok) {
      // Surface server-side field errors at the top of the wizard.
      if (result.fieldErrors) {
        const firstField = Object.keys(result.fieldErrors)[0];
        setServerError(
          `Couldn't submit: ${result.fieldErrors[firstField]}. Go back and check the form fields.`,
        );
      } else {
        setServerError(result.error ?? "Couldn't submit the signature.");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    router.replace(`/apply/${rawToken}/done`);
  }

  return (
    <MobileFormShell branchName={branchName}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-muted">
            Step {stepIndex[step]} of {totalSteps}
          </p>
          <Progress value={progressValue} aria-label={`Progress: ${progressValue}%`} />
        </div>

        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        {step === "page1" && (
          <form onSubmit={page1Form.handleSubmit(handlePage1Next)} className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>About you</CardTitle>
                <CardDescription>Tell us a bit about yourself. Takes about 5 minutes.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Branch</Label>
                  <Input value={branchName} readOnly aria-readonly className="bg-surface-input-disabled" />
                </div>
                <Field
                  id="nric_no"
                  label="NRIC number"
                  helper="Used for membership verification"
                  error={page1Form.formState.errors.nric_no?.message}
                >
                  <Input id="nric_no" placeholder="S1234567A" {...page1Form.register("nric_no")} />
                </Field>
                <Field
                  id="surname"
                  label="Surname (as in NRIC)"
                  helper="We&rsquo;ll underline this part on the printed form."
                  error={page1Form.formState.errors.surname?.message}
                >
                  <Input id="surname" {...page1Form.register("surname")} />
                </Field>
                <Field
                  id="given_names"
                  label="Given names (as in NRIC)"
                  error={page1Form.formState.errors.given_names?.message}
                >
                  <Input id="given_names" {...page1Form.register("given_names")} />
                </Field>
                <Field
                  id="chinese_name"
                  label="Chinese name (if any)"
                  error={page1Form.formState.errors.chinese_name?.message}
                >
                  <Input id="chinese_name" {...page1Form.register("chinese_name")} />
                </Field>
                <Field
                  id="home_address"
                  label="Home address"
                  error={page1Form.formState.errors.home_address?.message}
                >
                  <Textarea id="home_address" rows={2} {...page1Form.register("home_address")} />
                </Field>
                <Field
                  id="postal_code"
                  label="Postal code"
                  helper="6-digit Singapore postal code"
                  error={page1Form.formState.errors.postal_code?.message}
                >
                  <Input
                    id="postal_code"
                    inputMode="numeric"
                    {...page1Form.register("postal_code")}
                  />
                </Field>
                <Field
                  id="housing_type"
                  label="Housing type"
                  error={page1Form.formState.errors.housing_type?.message}
                >
                  <RadioGroup
                    value={page1Form.watch("housing_type")}
                    onValueChange={(v) =>
                      page1Form.setValue("housing_type", v as ApplicantPage1["housing_type"], {
                        shouldValidate: true,
                      })
                    }
                    className="flex flex-col gap-2 sm:flex-row sm:gap-6"
                  >
                    {FORM_TICK_VALUES.housing.map((opt) => (
                      <label key={opt} className="flex items-center gap-2 text-sm text-text-primary">
                        <RadioGroupItem value={opt} id={`housing-${opt}`} />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </Field>
                {housingType === "HDB" && (
                  <Field
                    id="hdb_rooms"
                    label="Number of rooms"
                    error={page1Form.formState.errors.hdb_rooms?.message}
                  >
                    <Input
                      id="hdb_rooms"
                      type="number"
                      min={1}
                      max={9}
                      inputMode="numeric"
                      {...page1Form.register("hdb_rooms", { valueAsNumber: true })}
                    />
                  </Field>
                )}
                <Field
                  id="date_of_birth"
                  label="Date of birth"
                  error={page1Form.formState.errors.date_of_birth?.message}
                >
                  <Input
                    id="date_of_birth"
                    type="date"
                    {...page1Form.register("date_of_birth")}
                  />
                </Field>
                <Field
                  id="place_of_birth"
                  label="Place of birth"
                  helper="If outside Singapore, we&rsquo;ll ask for an NRIC scan later."
                  error={page1Form.formState.errors.place_of_birth?.message}
                >
                  <Input id="place_of_birth" {...page1Form.register("place_of_birth")} />
                </Field>
                <TickRow
                  label="Race"
                  options={FORM_TICK_VALUES.race}
                  value={page1Form.watch("race")}
                  onChange={(v) =>
                    page1Form.setValue("race", v as ApplicantPage1["race"], {
                      shouldValidate: true,
                    })
                  }
                  error={page1Form.formState.errors.race?.message}
                />
                <TickRow
                  label="Gender"
                  options={FORM_TICK_VALUES.gender}
                  value={page1Form.watch("gender")}
                  onChange={(v) =>
                    page1Form.setValue("gender", v as ApplicantPage1["gender"], {
                      shouldValidate: true,
                    })
                  }
                  error={page1Form.formState.errors.gender?.message}
                />
                <TickRow
                  label="Marital status"
                  options={FORM_TICK_VALUES.maritalStatus}
                  value={page1Form.watch("marital_status")}
                  onChange={(v) =>
                    page1Form.setValue(
                      "marital_status",
                      v as ApplicantPage1["marital_status"],
                      { shouldValidate: true },
                    )
                  }
                  error={page1Form.formState.errors.marital_status?.message}
                />
                <Field
                  id="tel_home"
                  label="Home phone"
                  error={page1Form.formState.errors.tel_home?.message}
                >
                  <Input id="tel_home" inputMode="tel" {...page1Form.register("tel_home")} />
                </Field>
                <Field
                  id="tel_office"
                  label="Office phone"
                  error={page1Form.formState.errors.tel_office?.message}
                >
                  <Input id="tel_office" inputMode="tel" {...page1Form.register("tel_office")} />
                </Field>
                <Field
                  id="tel_hp"
                  label="Mobile phone"
                  error={page1Form.formState.errors.tel_hp?.message}
                >
                  <Input id="tel_hp" inputMode="tel" {...page1Form.register("tel_hp")} />
                </Field>
                <Field
                  id="highest_edu"
                  label="Highest education level"
                  error={page1Form.formState.errors.highest_edu?.message}
                >
                  <Select
                    value={page1Form.watch("highest_edu")}
                    onValueChange={(v) =>
                      page1Form.setValue("highest_edu", v as ApplicantPage1["highest_edu"], {
                        shouldValidate: true,
                      })
                    }
                  >
                    <SelectTrigger id="highest_edu">
                      <SelectValue placeholder="Pick one" />
                    </SelectTrigger>
                    <SelectContent>
                      {FORM_TICK_VALUES.education.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <MultiCheckboxRow
                  label="Written languages"
                  options={FORM_TICK_VALUES.language}
                  value={page1Form.watch("written_languages")}
                  onChange={(v) =>
                    page1Form.setValue(
                      "written_languages",
                      v as ApplicantPage1["written_languages"],
                      { shouldValidate: true },
                    )
                  }
                  error={page1Form.formState.errors.written_languages?.message}
                />
                <MultiCheckboxRow
                  label="Spoken languages"
                  options={FORM_TICK_VALUES.language}
                  value={page1Form.watch("spoken_languages")}
                  onChange={(v) =>
                    page1Form.setValue(
                      "spoken_languages",
                      v as ApplicantPage1["spoken_languages"],
                      { shouldValidate: true },
                    )
                  }
                  error={page1Form.formState.errors.spoken_languages?.message}
                />
                <Field id="email" label="Email address" error={page1Form.formState.errors.email?.message}>
                  <Input id="email" type="email" inputMode="email" {...page1Form.register("email")} />
                </Field>
                <details className="rounded-md border border-border bg-surface-page p-3">
                  <summary className="cursor-pointer text-sm font-medium text-text-primary">
                    Social media (optional)
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <Field id="facebook" label="Facebook" error={page1Form.formState.errors.facebook?.message}>
                      <Input id="facebook" {...page1Form.register("facebook")} />
                    </Field>
                    <Field id="linkedin" label="LinkedIn" error={page1Form.formState.errors.linkedin?.message}>
                      <Input id="linkedin" {...page1Form.register("linkedin")} />
                    </Field>
                    <Field id="twitter" label="Twitter" error={page1Form.formState.errors.twitter?.message}>
                      <Input id="twitter" {...page1Form.register("twitter")} />
                    </Field>
                    <Field id="blog" label="Blog" error={page1Form.formState.errors.blog?.message}>
                      <Input id="blog" {...page1Form.register("blog")} />
                    </Field>
                  </div>
                </details>
              </CardContent>
            </Card>
            <StickyFooter>
              <Button type="submit" disabled={page1Form.formState.isSubmitting}>
                {page1Form.formState.isSubmitting ? "Saving…" : "Continue"}
              </Button>
            </StickyFooter>
          </form>
        )}

        {step === "page2" && (
          <form onSubmit={page2Form.handleSubmit(handlePage2Next)} className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Your background</CardTitle>
                <CardDescription>Employment and any memberships you hold.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Field
                  id="occupation"
                  label="Occupation"
                  error={page2Form.formState.errors.occupation?.message}
                >
                  <Input id="occupation" {...page2Form.register("occupation")} />
                </Field>
                <Field
                  id="organisation"
                  label="Employer / organisation"
                  error={page2Form.formState.errors.organisation?.message}
                >
                  <Input id="organisation" {...page2Form.register("organisation")} />
                </Field>
                <TickRow
                  label="Monthly income"
                  options={FORM_TICK_VALUES.monthlyIncome}
                  value={page2Form.watch("monthly_income")}
                  onChange={(v) =>
                    page2Form.setValue("monthly_income", v as ApplicantPage2["monthly_income"], {
                      shouldValidate: true,
                    })
                  }
                  error={page2Form.formState.errors.monthly_income?.message}
                />
                <Field
                  id="hobbies"
                  label="Hobbies (up to 3, optional)"
                  error={page2Form.formState.errors.hobbies?.message as string | undefined}
                >
                  <HobbiesInput
                    value={page2Form.watch("hobbies") ?? []}
                    onChange={(v) =>
                      page2Form.setValue("hobbies", v, { shouldValidate: true })
                    }
                  />
                </Field>
                <details className="rounded-md border border-border bg-surface-page p-3">
                  <summary className="cursor-pointer text-sm font-medium text-text-primary">
                    Current memberships (optional)
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    {[
                      { id: "trade_unions", label: "Trade unions" },
                      { id: "associations", label: "Associations" },
                      { id: "clubs", label: "Clubs" },
                      { id: "ccc", label: "C.C.C." },
                      { id: "ccmc", label: "C.C.M.C." },
                      { id: "rnc", label: "Residents' / Neighbourhood Committee" },
                      { id: "grassroots", label: "Grassroots organisations" },
                    ].map((f) => (
                      <Field
                        key={f.id}
                        id={f.id}
                        label={f.label}
                        error={
                          page2Form.formState.errors[
                            f.id as keyof ApplicantPage2
                          ]?.message as string | undefined
                        }
                      >
                        <Input id={f.id} {...page2Form.register(f.id as keyof ApplicantPage2)} />
                      </Field>
                    ))}
                  </div>
                </details>
                <div className="flex items-start gap-3 rounded-md border border-border bg-surface-page p-4">
                  <Checkbox
                    id="consent_pdpa"
                    checked={page2Form.watch("consent_pdpa")}
                    onCheckedChange={(v) =>
                      page2Form.setValue("consent_pdpa", v === true, { shouldValidate: true })
                    }
                  />
                  <Label htmlFor="consent_pdpa" className="text-sm font-normal leading-snug">
                    I agree to the{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-blue underline"
                    >
                      Constitution and Rules of the Party
                    </a>{" "}
                    and to the{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-blue underline"
                    >
                      Privacy Policy
                    </a>
                    .
                  </Label>
                </div>
                {page2Form.formState.errors.consent_pdpa && (
                  <p className="text-sm text-state-error" aria-live="polite">
                    {page2Form.formState.errors.consent_pdpa.message}
                  </p>
                )}
              </CardContent>
            </Card>
            <StickyFooter>
              <Button type="button" variant="outline" onClick={() => setStep("page1")}>
                Back
              </Button>
              <Button type="submit" disabled={page2Form.formState.isSubmitting}>
                {page2Form.formState.isSubmitting ? "Saving…" : "Continue"}
              </Button>
            </StickyFooter>
          </form>
        )}

        {step === "photo" && (
          <div className="flex flex-col gap-4">
            <PhotoStep
              initialUrl={null}
              onCroppedBlob={handlePhotoUpload}
            />
            <StickyFooter>
              <Button type="button" variant="outline" onClick={() => setStep("page2")}>
                Back
              </Button>
              <Button
                type="button"
                disabled={!photoSaved}
                onClick={() => setStep(needsNric ? "nric" : "sign")}
              >
                Continue
              </Button>
            </StickyFooter>
          </div>
        )}

        {step === "nric" && (
          <div className="flex flex-col gap-4">
            <NricStep
              initial={{ frontUrl: null, backUrl: null }}
              onUpload={handleNricUpload}
            />
            <StickyFooter>
              <Button type="button" variant="outline" onClick={() => setStep("photo")}>
                Back
              </Button>
              <Button
                type="button"
                disabled={!nricFrontSaved || !nricBackSaved}
                onClick={() => setStep("sign")}
              >
                Continue
              </Button>
            </StickyFooter>
          </div>
        )}

        {step === "sign" && (
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Sign your application</CardTitle>
                <CardDescription>
                  One last step — draw your signature. By signing, you confirm everything you&rsquo;ve
                  entered is accurate.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SignaturePad
                  confirmLabel="I confirm this is my signature and the information I provided is accurate."
                  submitLabel="Sign and submit"
                  onSubmit={handleSignatureSubmit}
                />
              </CardContent>
            </Card>
            <StickyFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(needsNric ? "nric" : "photo")}
              >
                Back
              </Button>
            </StickyFooter>
          </div>
        )}
      </div>
    </MobileFormShell>
  );
}

function StickyFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-4 flex justify-end gap-2 border-t border-border bg-surface-card px-4 py-3">
      {children}
    </div>
  );
}

function Field({
  id,
  label,
  helper,
  error,
  children,
}: {
  id: string;
  label: string;
  helper?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {helper && !error && <p className="text-sm text-text-muted">{helper}</p>}
      {error && (
        <p className="text-sm text-state-error" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}

function TickRow<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: readonly T[];
  value: T | undefined;
  onChange: (v: T) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as T)}
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6"
      >
        {options.map((opt) => (
          <label
            key={opt}
            className="flex items-center gap-2 text-sm text-text-primary"
          >
            <RadioGroupItem value={opt} id={`${label}-${opt}`} />
            <span>{opt}</span>
          </label>
        ))}
      </RadioGroup>
      {error && (
        <p className="text-sm text-state-error" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}

function MultiCheckboxRow<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: readonly T[];
  value: T[] | undefined;
  onChange: (v: T[]) => void;
  error?: string;
}) {
  const selected = value ?? [];
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6">
        {options.map((opt) => {
          const checked = selected.includes(opt);
          return (
            <label key={opt} className="flex items-center gap-2 text-sm text-text-primary">
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => {
                  if (v === true) onChange([...selected, opt]);
                  else onChange(selected.filter((s) => s !== opt));
                }}
              />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>
      {error && (
        <p className="text-sm text-state-error" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}

function HobbiesInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const padded = [value[0] ?? "", value[1] ?? "", value[2] ?? ""];
  return (
    <div className="flex flex-col gap-2">
      {padded.map((v, i) => (
        <Input
          key={i}
          value={v}
          placeholder={`Hobby ${i + 1}`}
          onChange={(e) => {
            const next = [...padded];
            next[i] = e.target.value;
            onChange(next.filter((s) => s.trim().length > 0));
          }}
        />
      ))}
    </div>
  );
}
