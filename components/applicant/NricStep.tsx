/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (PhotoCapture pattern, NRIC variant)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (Take photo / Upload photo)
 * @consumes ui/Button, ui/Card, ui/Alert
 * @used-by components/applicant/ApplicantWizard.tsx
 *
 * Conditional capture (PRD §4.2 + Addendum Gap 10): only shown when
 * `place_of_birth.trim().toLowerCase() !== 'singapore'`. Front + back
 * required. Auto-purged 24h after SENT_TO_HQ (Step 10 cron).
 */
"use client";

import * as React from "react";
import { Upload, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface NricStepProps {
  initial: { frontUrl: string | null; backUrl: string | null };
  onUpload: (side: "front" | "back", file: File) => Promise<void>;
}

export function NricStep({ initial, onUpload }: NricStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>NRIC scans</CardTitle>
        <CardDescription>
          Because you were born outside Singapore, please upload both sides of your NRIC.
          We&rsquo;ll delete the scans 24 hours after sending your application to HQ.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <NricSide
          label="NRIC — front"
          initialUrl={initial.frontUrl}
          onUpload={(file) => onUpload("front", file)}
        />
        <NricSide
          label="NRIC — back"
          initialUrl={initial.backUrl}
          onUpload={(file) => onUpload("back", file)}
        />
      </CardContent>
    </Card>
  );
}

function NricSide({
  label,
  initialUrl,
  onUpload,
}: {
  label: string;
  initialUrl: string | null;
  onUpload: (file: File) => Promise<void>;
}) {
  const [preview, setPreview] = React.useState<string | null>(initialUrl);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Scan is too large (max 5 MB). Try a smaller image.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const url = URL.createObjectURL(file);
      setPreview(url);
      await onUpload(file);
    } catch {
      setError("Couldn't upload — try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-text-primary">{label}</p>
      {preview ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- preview is a blob URL */}
          <img
            src={preview}
            alt={`${label} preview`}
            width={160}
            height={100}
            className="h-auto w-16 rounded-md border border-border"
          />
          <Alert variant="info">
            <AlertDescription className="flex items-center gap-2">
              <CheckCircle2
                className="h-5 w-5 text-state-success"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              Uploaded
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <p className="text-sm text-text-muted">Not uploaded yet.</p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        variant={preview ? "outline" : "secondary"}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {preview ? (
          <>
            <RefreshCw className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            Replace
          </>
        ) : (
          <>
            <Upload className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            Upload
          </>
        )}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        className="sr-only"
        onChange={handleFile}
      />
    </div>
  );
}
