/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (Card with embedded PhotoStep)
 * @consumes ui/Card, ui/Button, ui/Alert, applicant/PhotoStep
 * @used-by app/(dashboard)/branch/applications/[id]/page.tsx
 *
 * Admin override surface. Stays collapsed by default (Show/Hide toggle) so
 * it doesn't add noise to the detail page during the normal review flow.
 * The cropper inside is identical to the applicant's so the embedded PDF
 * image stays consistent.
 */
"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PhotoStep } from "@/components/applicant/PhotoStep";
import { replacePhotoAction } from "@/app/(dashboard)/branch/applications/[id]/photo-actions";

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  // Browser-safe base64 of binary bytes.
  let bin = "";
  const arr = new Uint8Array(buf);
  for (let i = 0; i < arr.byteLength; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export interface ReplacePhotoCardProps {
  applicationId: string;
  /** Signed URL of the current photo, or null if none. */
  currentPhotoUrl: string | null;
  status: string;
}

export function ReplacePhotoCard({
  applicationId,
  currentPhotoUrl,
  status,
}: ReplacePhotoCardProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const disabled = status === "COMPLETED" || status === "ARCHIVED";

  async function handleCroppedBlob(blob: Blob) {
    setError(null);
    const photoBase64 = await blobToBase64(blob);
    const result = await replacePhotoAction({ applicationId, photoBase64 });
    if (result.ok) {
      toast.success("Photo replaced.");
      setOpen(false);
      router.refresh();
    } else {
      setError(result.error ?? "Couldn't save the photo — try again in a minute.");
      throw new Error(result.error ?? "save failed");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Applicant photo</CardTitle>
        <CardDescription>
          {disabled
            ? status === "COMPLETED"
              ? "Photo can't be replaced — the application is Completed and the PDF is at HQ."
              : "Unarchive the application before replacing the photo."
            : "Replace the photo if the applicant uploaded an unusable one. The PDF re-renders with the new photo on next Send."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          {currentPhotoUrl ? (
            <Image
              src={currentPhotoUrl}
              alt="Current applicant photo"
              width={96}
              height={123}
              className="rounded-md border border-border"
              unoptimized
            />
          ) : (
            <div className="flex h-32 w-24 items-center justify-center rounded-md border border-dashed border-border text-xs text-text-muted">
              No photo
            </div>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-sm text-text-secondary">
              {currentPhotoUrl
                ? "This is the photo the applicant submitted."
                : "No photo on file yet."}
            </p>
            {!disabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen((v) => !v)}
              >
                {open ? "Cancel" : currentPhotoUrl ? "Replace photo" : "Upload photo"}
              </Button>
            )}
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {open && !disabled && (
          <PhotoStep initialUrl={null} onCroppedBlob={handleCroppedBlob} />
        )}
      </CardContent>
    </Card>
  );
}
