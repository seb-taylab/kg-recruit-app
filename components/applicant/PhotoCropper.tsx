/**
 * @tier molecule
 * @design-spec KG_DesignSystem_v1.md §3 (PhotoCropper) + Addendum v1.3 Gap 4 (7:9 strict)
 * @consumes ui/Button, react-easy-crop
 * @used-by components/applicant/PhotoStep.tsx
 *
 * Custom composition justification: shadcn doesn't ship a cropper. The
 * Addendum locks the aspect ratio at 7:9 (35mm × 45mm passport-style) so
 * the cropped result lines up with the PDF photo box without stretching.
 */
"use client";

import * as React from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";

interface PhotoCropperProps {
  /** Object URL of the loaded image. */
  src: string;
  onCancel: () => void;
  onConfirm: (croppedBlob: Blob) => void;
}

const ASPECT = 7 / 9;
const OUTPUT_WIDTH = 700;
const OUTPUT_HEIGHT = 900;

export function PhotoCropper({ src, onCancel, onConfirm }: PhotoCropperProps) {
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [cropPixels, setCropPixels] = React.useState<Area | null>(null);
  const [processing, setProcessing] = React.useState(false);

  const onCropComplete = React.useCallback((_: Area, areaPixels: Area) => {
    setCropPixels(areaPixels);
  }, []);

  async function handleConfirm() {
    if (!cropPixels) return;
    setProcessing(true);
    try {
      const blob = await renderCroppedJpg(src, cropPixels);
      onConfirm(blob);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-80 w-full overflow-hidden rounded-md bg-neutral-900">
        <Cropper
          image={src}
          aspect={ASPECT}
          crop={crop}
          zoom={zoom}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          showGrid
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="photo-zoom" className="text-sm font-medium text-text-primary">
          Zoom
        </label>
        <input
          id="photo-zoom"
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-brand-red"
        />
      </div>
      <p className="text-sm text-text-muted">
        Aspect ratio is fixed at 7:9 — passport size. Move and zoom to frame your face.
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={processing}>
          Retake
        </Button>
        <Button type="button" onClick={handleConfirm} disabled={processing || !cropPixels}>
          {processing ? "Processing…" : "Use this photo"}
        </Button>
      </div>
    </div>
  );
}

async function renderCroppedJpg(src: string, area: Area): Promise<Blob> {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Couldn't encode JPEG"));
        else resolve(blob);
      },
      "image/jpeg",
      0.9,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load image"));
    img.src = src;
  });
}
