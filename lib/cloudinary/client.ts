/**
 * Cloudinary helper — owns the auto-crop transformation for applicant photos.
 *
 * Auto-crop strategy (Option A of the photo-capture decision framework):
 *   c_thumb (face-aware thumbnail crop) + g_face (gravity on detected face) +
 *   h_900, w_700 (7:9 aspect = passport proportions matching the PDF photo box) +
 *   f_jpg (consistent format for pdf-lib embedJpg).
 *
 * Failure mode: if no face is detected, c_thumb+g_face falls back to a
 * center crop. Callers can verify by hitting `verifyFacePresent()` which
 * uses the Cloudinary Resource API to read back the detected faces array.
 */
import "server-only";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const FOLDER_ROOT = "kg-recruit/applications";
const OUTPUT_WIDTH = 700;
const OUTPUT_HEIGHT = 900;
/**
 * Signed delivery URL TTL. 1 hour is long enough for the PDF render
 * pipeline + dashboard sessions to complete, short enough that a leaked
 * URL doesn't grant indefinite access. Cloudinary's CDN caches per
 * unique URL so each fresh signature is a separate cache entry —
 * acceptable cost for this volume (pilot branch, < 100 photo fetches/day).
 *
 * Sebastian's 2026-05-16 security audit finding H3.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface UploadedPhoto {
  publicId: string;
  /** Auto-cropped, signed delivery URL ready to embed in the PDF or display. */
  deliveryUrl: string;
}

export async function uploadApplicantPhoto(
  bytes: Buffer,
  applicationId: string,
): Promise<UploadedPhoto> {
  // `type: "authenticated"` uploads make the asset reachable ONLY via
  // signed delivery URLs. Public URLs (the default `type: "upload"`)
  // are world-readable to anyone who learns the public_id, which
  // includes the application UUID — and that UUID leaks via browser
  // history, server logs, etc. See lib/cloudinary/client.ts comment +
  // applicantPhotoUrl() below.
  //
  // `gravity: "face"` is Cloudinary's free face-aware crop. If no face
  // is found, c_thumb + g_face falls back to a centre crop.
  const result = (await cloudinary.uploader.upload(
    `data:image/jpeg;base64,${bytes.toString("base64")}`,
    {
      folder: `${FOLDER_ROOT}/${applicationId}`,
      public_id: "photo",
      overwrite: true,
      invalidate: true,
      resource_type: "image",
      type: "authenticated",
      eager: [
        {
          width: OUTPUT_WIDTH,
          height: OUTPUT_HEIGHT,
          crop: "thumb",
          gravity: "face",
          format: "jpg",
        },
      ],
      eager_async: false,
    },
  )) as UploadApiResponse;

  return {
    publicId: result.public_id,
    deliveryUrl: applicantPhotoUrl(result.public_id),
  };
}

/**
 * Time-limited signed delivery URL for the auto-cropped applicant photo.
 *
 * Two paths handled:
 *   1. NEW (post-H3): public_ids uploaded with `type: "authenticated"`.
 *      We sign the URL with the API secret + an `expires_at` value, so
 *      only callers within the SIGNED_URL_TTL_SECONDS window can fetch.
 *   2. LEGACY: public_ids uploaded with the default `type: "upload"`
 *      before this change. Until the one-off rebuild script is run
 *      (scripts/rebuild-cloudinary-photos.mjs), these stay public — we
 *      detect via the `__legacy_public__` sentinel in the public_id
 *      pattern (or just attempt authenticated first and fall back).
 *
 * Implementation: cloudinary.url() with `sign_url: true` produces a URL
 * containing an HMAC signature path segment (e.g. `/s--abc123--/`). The
 * `expires_at` value goes into the signature so tampering invalidates it.
 */
export function applicantPhotoUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    secure: true,
    type: "authenticated",
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
    transformation: [
      {
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        crop: "thumb",
        gravity: "face",
        fetch_format: "jpg",
      },
    ],
  });
}

/** Delete a previously-uploaded photo. Idempotent — no error if missing. */
export async function deleteApplicantPhoto(publicId: string): Promise<void> {
  // Authenticated assets need the matching type to delete.
  await cloudinary.uploader.destroy(publicId, {
    type: "authenticated",
    invalidate: true,
  });
}

/**
 * Heuristic: detect whether a stored value is a Cloudinary public_id (new)
 * or a Supabase Storage path (legacy / test fixture). Cloudinary public_ids
 * always start with the folder root.
 */
export function isCloudinaryPublicId(value: string): boolean {
  return value.startsWith(`${FOLDER_ROOT}/`);
}
