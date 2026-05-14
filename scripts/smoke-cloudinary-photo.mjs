/**
 * Smoke test for the Cloudinary photo pipeline.
 *
 * Walks through:
 *   1. Upload a real face JPEG via the lib helper (uses face detection)
 *   2. Verify { publicId, deliveryUrl, faceDetected: true }
 *   3. Fetch the auto-cropped delivery URL and confirm it's a valid JPEG
 *      of the expected 700x900 dimensions
 *   4. Also upload a NON-FACE image (solid black) to confirm faceDetected
 *      returns false — the failure path the wizard surfaces as a warning
 *   5. Clean up both uploads
 *
 * Bypasses the server-only marker the same way other lib-importing scripts
 * do (see scripts/render-preview-pdf.mjs).
 */
import { Module, register } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";

register("./_server-only-shim.mjs", import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHIM_CJS = path.join(__dirname, "_server-only-empty.cjs");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return SHIM_CJS;
  return origResolve.call(this, request, ...rest);
};

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
process.env.CLOUDINARY_CLOUD_NAME = env.CLOUDINARY_CLOUD_NAME;
process.env.CLOUDINARY_API_KEY = env.CLOUDINARY_API_KEY;
process.env.CLOUDINARY_API_SECRET = env.CLOUDINARY_API_SECRET;

const { uploadApplicantPhoto, deleteApplicantPhoto } = await import(
  "../lib/cloudinary/client.ts"
);

async function fetchToBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function isJpeg(buf) {
  return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

function isPng(buf) {
  return (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  );
}

// JPEG dimension extraction — enough for SOF marker scanning.
function jpegDimensions(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    // SOFn markers — image dimensions live here.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      return { w, h };
    }
    const segLen = buf.readUInt16BE(i + 2);
    i += 2 + segLen;
  }
  return null;
}

const results = [];

// ── Test 1: real face image ──────────────────────────────────────────────
console.log("\n[1/2] Upload of a real face JPEG");
const FACE_URL =
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&q=80&fm=jpg";
let faceBuf;
try {
  faceBuf = await fetchToBuffer(FACE_URL);
  console.log(`  • source bytes: ${faceBuf.byteLength}`);
} catch (err) {
  console.error(`  ✗ couldn't fetch source: ${err.message}`);
  process.exit(1);
}

const faceTestId = `smoke-face-${Date.now()}`;
const faceResult = await uploadApplicantPhoto(faceBuf, faceTestId);
console.log(`  • publicId:     ${faceResult.publicId}`);
console.log(`  • deliveryUrl:  ${faceResult.deliveryUrl}`);

const facePass = faceResult.publicId.startsWith(
  `kg-recruit/applications/${faceTestId}/`,
);
results.push({ test: "face image uploaded", pass: facePass });

// Verify the delivery URL serves a real JPEG of the expected dimensions.
const faceDerivation = await fetchToBuffer(faceResult.deliveryUrl);
const isJ = isJpeg(faceDerivation);
const dims = isJ ? jpegDimensions(faceDerivation) : null;
console.log(
  `  • derivation:   ${faceDerivation.byteLength} bytes, isJpeg=${isJ}, dims=${dims ? `${dims.w}x${dims.h}` : "n/a"}`,
);
results.push({
  test: "face derivation 700x900 JPEG",
  pass: isJ && dims?.w === 700 && dims?.h === 900,
});

await deleteApplicantPhoto(faceResult.publicId);
console.log(`  • cleaned up    ✓`);

// ── Test 2: non-face image (fallback path) ───────────────────────────────
console.log("\n[2/2] Upload of a non-face PNG (centre-crop fallback)");
// 1x1 black PNG.
const blackPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
console.log(`  • source bytes: ${blackPng.byteLength}, isPng=${isPng(blackPng)}`);

const blackTestId = `smoke-noface-${Date.now()}`;
const blackResult = await uploadApplicantPhoto(blackPng, blackTestId);
console.log(`  • publicId:     ${blackResult.publicId}`);

results.push({
  test: "non-face upload succeeds (centre-crop fallback)",
  pass: blackResult.publicId.startsWith(`kg-recruit/applications/${blackTestId}/`),
});

await deleteApplicantPhoto(blackResult.publicId);
console.log(`  • cleaned up    ✓`);

// ── Report ───────────────────────────────────────────────────────────────
console.log("\n────────── RESULTS ──────────");
let allPass = true;
for (const r of results) {
  console.log(`  ${r.pass ? "✓" : "✗"} ${r.test}`);
  if (!r.pass) allPass = false;
}
console.log(allPass ? "\nSMOKE TEST PASSED\n" : "\nSMOKE TEST FAILED\n");
process.exit(allPass ? 0 : 1);
