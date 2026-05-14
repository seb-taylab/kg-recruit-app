/**
 * Uploads realistic-looking signature PNGs for all three roles on the most-
 * recent app, then re-renders the PDF so the embedded signatures are
 * visible. Proves the storage → PDF embed loop works with a real PNG.
 *
 * Uses Sharp to render an SVG cursive squiggle to PNG (no canvas library
 * needed, no network round-trip — pure server-side).
 *
 * Run order:
 *   node scripts/seed-real-signatures.mjs
 *   npx tsx scripts/test-pdf-overflow.mjs preview-with-sigs.pdf
 *   open preview-with-sigs.pdf
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: rows } = await sb
  .from("applications")
  .select("id, status")
  .order("created_at", { ascending: false })
  .limit(1);
const target = rows[0];
console.log(`Target app: ${target.id} (${target.status})`);

/**
 * Build a wavy cursive-ish path as SVG, render to PNG via sharp.
 *
 * @param seed integer that shifts the wave so each role's signature looks
 *             distinct. Real signatures aren't identical across people.
 */
function makeSignatureSvg(seed) {
  const w = 600;
  const h = 200;
  const offsetY = h / 2;
  const points = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const x = 30 + t * (w - 60);
    const y =
      offsetY +
      Math.sin(t * Math.PI * (3 + seed * 0.7) + seed) * 30 +
      Math.cos(t * Math.PI * (6 + seed)) * 10;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const path = `M${points[0]} L${points.slice(1).join(" L")}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <path d="${path}" stroke="#1f2937" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

for (const [seed, role] of [
  [1, "applicant"],
  [2, "referral"],
  [3, "chairman"],
]) {
  const svg = makeSignatureSvg(seed);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const path = `${target.id}/${role}.png`;
  const { error } = await sb.storage
    .from("signatures")
    .upload(path, png, { contentType: "image/png", upsert: true });
  console.log(
    `${role.padEnd(10)} ${error ? `✗ ${error.message}` : `✓ ${png.byteLength} bytes`}`,
  );
}

console.log(`\nNow re-render the PDF to see them embedded:`);
console.log(`  npx tsx scripts/test-pdf-overflow.mjs preview-with-sigs.pdf`);
