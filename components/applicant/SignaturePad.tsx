/**
 * @tier molecule
 * @design-spec KG_DesignSystem_v1.md §3 (SignaturePad pattern)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (Sign and submit / Sign application)
 * @consumes ui/Button, ui/Checkbox, react-signature-canvas
 * @used-by components/applicant/ApplicantWizard.tsx (and the Step 6/7 referral + chairman flows)
 *
 * Custom composition justification: shadcn does not ship a signature canvas.
 * PRD §6 feature 4 names react-signature-canvas. We wrap it so the canvas
 * fills the parent width (mobile-friendly), enforces the "I confirm this is
 * my signature" gate before allowing submit, and exposes a Clear button.
 */
"use client";

import * as React from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ColorTextPrimary } from "@/lib/design/tokens";

export interface SignaturePadProps {
  /** Label for the confirm checkbox above the submit button. */
  confirmLabel?: string;
  /** Called with the PNG data URL + dimensions on submit. */
  onSubmit: (dataUrl: string) => Promise<void> | void;
  /** Disable the submit even if signed + confirmed (e.g. waiting on another step). */
  disabled?: boolean;
  /** CTA text. */
  submitLabel?: string;
}

export function SignaturePad({
  confirmLabel = "I confirm this is my signature",
  onSubmit,
  disabled,
  submitLabel = "Sign and submit",
}: SignaturePadProps) {
  const ref = React.useRef<SignatureCanvas | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [hasInk, setHasInk] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [width, setWidth] = React.useState<number>(0);

  // Measure parent width so the canvas fills it crisply.
  React.useEffect(() => {
    if (!wrapRef.current) return;
    const update = () => {
      if (wrapRef.current) setWidth(wrapRef.current.clientWidth);
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  function handleClear() {
    ref.current?.clear();
    setHasInk(false);
  }

  async function handleSubmit() {
    if (!ref.current || !hasInk || !confirmed || disabled) return;
    setSubmitting(true);
    try {
      const dataUrl = ref.current.getCanvas().toDataURL("image/png");
      await onSubmit(dataUrl);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-md border border-border bg-surface-card"
      >
        {width > 0 && (
          <SignatureCanvas
            ref={ref}
            canvasProps={{
              width,
              height: 200,
              className: "block",
              "aria-label": "Signature canvas — draw your signature inside this box",
            }}
            onEnd={() => setHasInk(true)}
            penColor={ColorTextPrimary}
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-text-muted">
          Draw your signature in the box above.
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={handleClear} disabled={!hasInk}>
          Clear
        </Button>
      </div>
      <div className="flex items-start gap-3 rounded-md border border-border bg-surface-page p-4">
        <Checkbox
          id="signature-confirm"
          checked={confirmed}
          onCheckedChange={(v) => setConfirmed(v === true)}
        />
        <Label htmlFor="signature-confirm" className="text-sm font-normal leading-snug">
          {confirmLabel}
        </Label>
      </div>
      <Button
        type="button"
        onClick={handleSubmit}
        disabled={!hasInk || !confirmed || disabled || submitting}
      >
        {submitting ? "Submitting…" : submitLabel}
      </Button>
    </div>
  );
}
