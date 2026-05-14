/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (PhotoCapture pattern)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (Take photo / Upload photo / Use this photo)
 * @consumes ui/Button, ui/Card
 * @used-by components/applicant/ApplicantWizard.tsx
 *
 * Photo flow: capture or upload → server uploads to Cloudinary which
 * auto-crops to the passport-style 7:9 box using face detection. The
 * returned preview URL is the exact image embedded in the PDF.
 *
 * Manual cropping was removed when we adopted Cloudinary's face-aware
 * auto-crop (decision framework Option A). If the auto-crop fails
 * (no face detected) we surface a warning + a Retake button.
 */
"use client";

import * as React from "react";
import { Camera, Upload, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PhotoStepProps {
  initialUrl: string | null;
  /**
   * Upload + auto-crop handler. Returns the auto-cropped preview URL plus
   * whether Cloudinary's face detector found a face in the photo.
   */
  onCroppedBlob: (
    blob: Blob,
  ) => Promise<{ ok: boolean; previewUrl?: string; faceDetected?: boolean; error?: string }>;
}

type Mode = "idle" | "upload" | "camera" | "done";

export function PhotoStep({ initialUrl, onCroppedBlob }: PhotoStepProps) {
  const [mode, setMode] = React.useState<Mode>(initialUrl ? "done" : "idle");
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(initialUrl);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  // True when Cloudinary couldn't find a face — surfaces a retake hint.
  const [noFaceWarning, setNoFaceWarning] = React.useState(false);
  // True once the live preview has decoded its first frame — gates Snap so
  // it never captures a 0×0 or pre-render-empty frame.
  const [cameraReady, setCameraReady] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Camera mount: attach the stream AFTER React has rendered the <video>
  // element. Without this two-step, videoRef.current is null when we try
  // to set srcObject inside startCamera() — the user sees a black box and
  // the snapshot captures nothing (videoWidth/Height are 0).
  //
  // ALSO: Snap is gated on `cameraReady` to avoid the canvas drawing a
  // not-yet-decoded frame (the bug behind "Photo saved" landing on a
  // black thumbnail). We flip cameraReady from the `playing` event so it
  // matches what the browser actually has on screen.
  React.useEffect(() => {
    if (mode !== "camera") return;
    const stream = streamRef.current;
    const video = videoRef.current;
    if (!stream || !video) return;

    setCameraReady(false);
    const onPlaying = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) setCameraReady(true);
    };
    video.addEventListener("playing", onPlaying);
    video.addEventListener("loadeddata", onPlaying);

    video.srcObject = stream;
    video.play().catch(() => {
      setCameraError("Couldn't start the camera preview. Use Upload instead.");
    });
    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("loadeddata", onPlaying);
    };
  }, [mode]);

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      // Switching mode renders the <video>; the useEffect above then
      // attaches the stream on the next commit.
      setMode("camera");
    } catch {
      setCameraError(
        "Camera access denied or unavailable. Use Upload instead.",
      );
    }
  }

  async function uploadBlob(blob: Blob) {
    setUploading(true);
    setCameraError(null);
    setNoFaceWarning(false);
    try {
      const result = await onCroppedBlob(blob);
      if (!result.ok) {
        setCameraError(result.error ?? "Couldn't save the photo — try again in a minute.");
        return;
      }
      setPreviewUrl(result.previewUrl ?? null);
      setNoFaceWarning(result.faceDetected === false);
      setMode("done");
    } finally {
      setUploading(false);
    }
  }

  async function snapPhoto() {
    if (!videoRef.current) return;
    const v = videoRef.current;
    // Belt-and-braces: button is already disabled when !cameraReady, but
    // verify the frame buffer is real before drawing it.
    if (!cameraReady || !v.videoWidth || !v.videoHeight || v.readyState < 2) {
      setCameraError("Camera isn't ready yet — wait a moment and try Snap again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95),
    );
    if (!blob) {
      setCameraError("Couldn't capture the frame — try again.");
      setMode("idle");
      return;
    }
    await uploadBlob(blob);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setCameraError("Photo is too large (max 5 MB). Try a smaller photo or retake.");
      return;
    }
    await uploadBlob(file);
  }

  function reset() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setNoFaceWarning(false);
    setMode("idle");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Take a photo for your application</CardTitle>
        <CardDescription>
          Used as your membership photo. Take a fresh one or upload from your device.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {cameraError && (
          <Alert variant="destructive">
            <AlertDescription>{cameraError}</AlertDescription>
          </Alert>
        )}

        {mode === "idle" && (
          <div className="flex flex-col gap-3">
            <Button type="button" onClick={startCamera}>
              <Camera className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              Take photo
            </Button>
            <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              Upload photo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="sr-only"
              onChange={handleFile}
            />
          </div>
        )}

        {mode === "camera" && (
          <div className="flex flex-col gap-3">
            <video
              ref={videoRef}
              className="w-full rounded-md bg-neutral-900"
              autoPlay
              playsInline
              muted
            />
            {!cameraReady && (
              <p className="text-sm text-text-muted">Starting camera…</p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={reset}>
                Back
              </Button>
              <Button type="button" onClick={snapPhoto} disabled={!cameraReady}>
                <Camera className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                {cameraReady ? "Snap" : "Starting…"}
              </Button>
            </div>
          </div>
        )}

        {uploading && mode !== "done" && (
          <p className="text-sm text-text-muted">Uploading + auto-cropping…</p>
        )}

        {mode === "done" && previewUrl && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- preview comes from Cloudinary, not the public/ folder */}
              <img
                src={previewUrl}
                alt="Your photo"
                width={168}
                height={216}
                className="h-auto w-32 rounded-md border border-border"
              />
            </div>
            {noFaceWarning ? (
              <Alert variant="warning">
                <AlertDescription>
                  We couldn&rsquo;t find a face in this photo. If the cropped result
                  above doesn&rsquo;t show your face clearly, retake with better lighting
                  and your face centred.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="info">
                <AlertDescription className="flex items-center gap-2">
                  <CheckCircle2
                    className="h-5 w-5 text-state-success"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  Photo saved + auto-cropped.
                </AlertDescription>
              </Alert>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={reset}
              disabled={uploading}
            >
              <RefreshCw className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              Retake
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
