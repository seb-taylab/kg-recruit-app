/**
 * @tier molecule
 * @design-spec KG_DesignSystem_v1.md §2 (Button)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (verb-first labels)
 * @consumes ui/Button, sonner
 * @used-by /branch/ready-to-send/[id], /branch/applications/[id], later /at-hq/[id]
 *
 * Two related buttons:
 *  - PreviewPdfButton — renders a fresh PDF from current data, downloads it,
 *    no state change. Available from READY_TO_SEND onwards.
 *  - DownloadStoredPdfButton — signs a URL for the PDF previously generated
 *    by sendApplicationToHqAction. Available once status is SENT_TO_HQ.
 */
"use client";

import * as React from "react";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getStoredPdfUrlAction,
  previewPdfAction,
} from "@/app/(dashboard)/branch/ready-to-send/[id]/actions";

interface BaseProps {
  applicationId: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
}

export function PreviewPdfButton({ applicationId, variant = "outline" }: BaseProps) {
  const [busy, setBusy] = React.useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const result = await previewPdfAction({ applicationId });
      if (!result.ok || !result.pdfBase64) {
        toast.error(result.error ?? "Couldn't render the PDF preview.");
        return;
      }
      triggerDownload(result.pdfBase64, result.filename ?? "preview.pdf");
      toast.success("Preview downloaded");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant={variant} onClick={handleClick} disabled={busy}>
      <FileText className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      {busy ? "Rendering…" : "Preview PDF"}
    </Button>
  );
}

export function DownloadStoredPdfButton({ applicationId, variant = "outline" }: BaseProps) {
  const [busy, setBusy] = React.useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const result = await getStoredPdfUrlAction({ applicationId });
      if (!result.ok || !result.url) {
        toast.error(result.error ?? "Couldn't get the PDF.");
        return;
      }
      // Open in a new tab — the browser handles download via Content-Disposition.
      const a = document.createElement("a");
      a.href = result.url;
      a.download = result.filename ?? "membership.pdf";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant={variant} onClick={handleClick} disabled={busy}>
      <Download className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      {busy ? "Loading…" : "Download PDF"}
    </Button>
  );
}

function triggerDownload(base64: string, filename: string) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
