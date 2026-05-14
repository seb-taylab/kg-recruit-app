/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (Card with secondary actions)
 * @consumes ui/Card, ui/Button, ui/Alert
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx
 *
 * Renders the NRIC scan thumbnails + download links for the Branch Admin
 * Team during the 24h window after SENT_TO_HQ. Calls the server action on
 * mount to mint signed URLs (10-minute TTL) and shows a warning if the
 * scans have already been purged.
 */
"use client";

import * as React from "react";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getNricDownloadUrlsAction } from "@/app/(dashboard)/branch/applications/[id]/nric-actions";

interface NricScansCardProps {
  applicationId: string;
  /** Optional — present after the purge job has run. Hides scan thumbnails. */
  purgedAt: string | null;
}

export function NricScansCard({ applicationId, purgedAt }: NricScansCardProps) {
  const purged = purgedAt !== null;
  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "ok"; frontUrl: string; backUrl: string }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  React.useEffect(() => {
    if (purged) return;
    let cancelled = false;
    (async () => {
      const result = await getNricDownloadUrlsAction({ applicationId });
      if (cancelled) return;
      if (result.ok && result.frontUrl && result.backUrl) {
        setState({ kind: "ok", frontUrl: result.frontUrl, backUrl: result.backUrl });
      } else {
        setState({ kind: "error", message: result.error ?? "Couldn't load NRIC scans." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applicationId, purged]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>NRIC scans</CardTitle>
        <CardDescription>
          Foreign-born applicant — front + back uploaded for HQ verification. Auto-deleted 24h
          after Sent to HQ.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {purged ? (
          <Alert variant="info">
            <AlertDescription>NRIC scans were purged after the 24h window.</AlertDescription>
          </Alert>
        ) : state.kind === "loading" ? (
          <p className="text-sm text-text-muted">Loading scans…</p>
        ) : state.kind === "error" ? (
          <Alert variant="info">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <NricSide label="Front" url={state.frontUrl} applicationId={applicationId} side="front" />
            <NricSide label="Back" url={state.backUrl} applicationId={applicationId} side="back" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NricSide({
  label,
  url,
  applicationId,
  side,
}: {
  label: string;
  url: string;
  applicationId: string;
  side: "front" | "back";
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-text-primary">{label}</p>
      <div className="relative aspect-video overflow-hidden rounded-md border border-border bg-surface-page">
        <Image
          src={url}
          alt={`NRIC ${label.toLowerCase()}`}
          fill
          sizes="(min-width: 640px) 320px, 100vw"
          className="object-contain"
          unoptimized
        />
      </div>
      <Button asChild variant="outline" size="sm">
        <a href={url} download={`nric-${side}-${applicationId.slice(0, 8)}`}>
          Download {label.toLowerCase()}
        </a>
      </Button>
    </div>
  );
}
