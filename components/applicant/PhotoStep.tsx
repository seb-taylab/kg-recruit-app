/**
 * @tier organism
 * @design-spec KG_DesignSystem_v1.md §3 (PhotoCapture pattern)
 * @brand-spec KG_BrandExecution_PAP.md §3.1 (Take photo / Upload photo / Use this photo)
 * @consumes ui/Button, ui/Card, applicant/PhotoCropper
 * @used-by components/applicant/ApplicantWizard.tsx
 */
"use client";

import * as React from "react";
import { Camera, Upload, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PhotoCropper } from "./PhotoCropper";

interface PhotoStepProps {
  initialUrl: string | null;
  onCroppedBlob: (blob: Blob) => Promise<void>;
}

type Mode = "idle" | "upload" | "camera" | "cropping" | "done";

export function PhotoStep({ initialUrl, onCroppedBlob }: PhotoStepProps) {
  const [mode, setMode] = React.useState<Mode>(initialUrl ? "done" : "idle");
  const [sourceUrl, setSourceUrl] = React.useState<string | null>(initialUrl);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(initialUrl);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setMode("camera");
    } catch {
      setCameraError(
        "Camera access denied or unavailable. Use Upload instead.",
      );
    }
  }

  function snapPhoto() {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const data = canvas.toDataURL("image/jpeg", 0.95);
    setSourceUrl(data);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setMode("cropping");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setCameraError("Photo is too large (max 5 MB). Try a smaller photo or retake.");
      return;
    }
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setMode("cropping");
  }

  async function handleConfirm(blob: Blob) {
    setUploading(true);
    try {
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      await onCroppedBlob(blob);
      setMode("done");
    } catch {
      setCameraError("Couldn't save the photo — try again in a minute.");
      setMode("idle");
    } finally {
      setUploading(false);
    }
  }

  function reset() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setSourceUrl(null);
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
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={reset}>
                Back
              </Button>
              <Button type="button" onClick={snapPhoto}>
                <Camera className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                Snap
              </Button>
            </div>
          </div>
        )}

        {mode === "cropping" && sourceUrl && (
          <PhotoCropper src={sourceUrl} onCancel={reset} onConfirm={handleConfirm} />
        )}

        {mode === "done" && previewUrl && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- preview is a blob URL, not optimisable by next/image */}
              <img
                src={previewUrl}
                alt="Your photo"
                width={168}
                height={216}
                className="h-auto w-24 rounded-md border border-border"
              />
            </div>
            <Alert variant="info">
              <AlertDescription className="flex items-center gap-2">
                <CheckCircle2
                  className="h-5 w-5 text-state-success"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                Photo saved.
              </AlertDescription>
            </Alert>
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
