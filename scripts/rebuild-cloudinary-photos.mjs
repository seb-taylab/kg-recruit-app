/**
 * One-off migration: re-upload every existing applicant photo from
 * Cloudinary's default `type: "upload"` (publicly readable) to
 * `type: "authenticated"` (signed URLs only). Closes security audit
 * finding H3 for the photos that pre-date the lib/cloudinary/client.ts
 * change.
 *
 *   node scripts/rebuild-cloudinary-photos.mjs
 *
 * Idempotent: re-uploading with the same public_id + overwrite:true
 * replaces the asset in place. The "old" public copy is removed via
 * the explicit destroy call.
 *
 * Dry-run: pass --dry to preview without writing anything.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const DRY = process.argv.includes("--dry");

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(DRY ? "DRY RUN — no writes will be made.\n" : "");

// Pull every application whose photo lives in Cloudinary. The folder-root
// prefix is the same sentinel `isCloudinaryPublicId()` uses to distinguish
// from legacy Supabase Storage paths.
const FOLDER_ROOT = "kg-recruit/applications";
const { data: rows, error } = await sb
  .from("applications")
  .select("id, applicant_photo_url")
  .like("applicant_photo_url", `${FOLDER_ROOT}/%`);
if (error) {
  console.error("Couldn't list applications:", error.message);
  process.exit(1);
}

console.log(`Found ${rows.length} application(s) with Cloudinary photos.`);

let migrated = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  const publicId = row.applicant_photo_url;

  // Probe: does this asset already exist as `type: "authenticated"`?
  // If yes, skip — earlier runs may have migrated it.
  try {
    await cloudinary.api.resource(publicId, { type: "authenticated" });
    console.log(`  ✓ ${publicId} — already authenticated, skipping`);
    skipped++;
    continue;
  } catch {
    // Not found as authenticated. Continue with migration.
  }

  // Fetch the existing public upload bytes.
  let bytes;
  try {
    const url = cloudinary.url(publicId, { secure: true });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error(`  ✗ ${publicId} — couldn't fetch existing asset: ${err.message}`);
    failed++;
    continue;
  }

  if (DRY) {
    console.log(`  • ${publicId} — would re-upload (${(bytes.byteLength / 1024).toFixed(0)} KB)`);
    migrated++;
    continue;
  }

  // Re-upload with type: "authenticated". Same public_id so the row's
  // applicant_photo_url stays valid.
  try {
    await cloudinary.uploader.upload(
      `data:image/jpeg;base64,${bytes.toString("base64")}`,
      {
        public_id: publicId,
        overwrite: true,
        invalidate: true,
        resource_type: "image",
        type: "authenticated",
        eager: [
          {
            width: 700,
            height: 900,
            crop: "thumb",
            gravity: "face",
            format: "jpg",
          },
        ],
        eager_async: false,
      },
    );
    // Delete the old public copy so it's no longer reachable.
    await cloudinary.uploader.destroy(publicId, {
      type: "upload",
      invalidate: true,
    });
    console.log(`  ✓ ${publicId} — migrated`);
    migrated++;
  } catch (err) {
    console.error(`  ✗ ${publicId} — migration failed: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone. Migrated: ${migrated}, Skipped: ${skipped}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
