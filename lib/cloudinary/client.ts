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

export interface UploadedPhoto {
  publicId: string;
  /** Auto-cropped delivery URL ready to embed in the PDF. */
  deliveryUrl: string;
  /** True when Cloudinary detected at least one face during analysis. */
  faceDetected: boolean;
}

export async function uploadApplicantPhoto(
  bytes: Buffer,
  applicationId: string,
): Promise<UploadedPhoto> {
  const result = (await cloudinary.uploader.upload(
    `data:image/jpeg;base64,${bytes.toString("base64")}`,
    {
      folder: `${FOLDER_ROOT}/${applicationId}`,
      public_id: "photo",
      overwrite: true,
      invalidate: true,
      resource_type: "image",
      // detection=adv_face returns a `faces` array in the response so we can
      // tell the applicant up-front if the photo wasn't usable.
      detection: "adv_face",
      // Eager-transform so the first PDF embed doesn't pay a JIT cost.
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
    faceDetected: Array.isArray(result.faces) && result.faces.length > 0,
  };
}

/**
 * Stable delivery URL for the embedded PDF photo. Same transformation as
 * the eager build above so we re-use the cached derivation.
 */
export function applicantPhotoUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    secure: true,
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
  await cloudinary.uploader.destroy(publicId, { invalidate: true });
}

/**
 * Heuristic: detect whether a stored value is a Cloudinary public_id (new)
 * or a Supabase Storage path (legacy / test fixture). Cloudinary public_ids
 * always start with the folder root.
 */
export function isCloudinaryPublicId(value: string): boolean {
  return value.startsWith(`${FOLDER_ROOT}/`);
}
