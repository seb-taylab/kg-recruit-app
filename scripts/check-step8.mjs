import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const APP_ID = "c2218fdc-15d6-4ac9-a792-4c2b4630601f";

console.log("=== applications row ===");
const { data: app } = await sb.from("applications").select("id, status, sent_to_hq_at, sent_by_id, hq_pdf_url, pdf_recipients").eq("id", APP_ID).single();
console.log(JSON.stringify(app, null, 2));

console.log("\n=== generated_pdfs row ===");
const { data: pdfRow } = await sb.from("generated_pdfs").select("*").eq("application_id", APP_ID).single();
console.log(JSON.stringify(pdfRow, null, 2));

console.log("\n=== application_events (last 4) ===");
const { data: events } = await sb.from("application_events").select("event_type, occurred_at, metadata").eq("application_id", APP_ID).order("occurred_at", { ascending: false }).limit(4);
console.log(JSON.stringify(events, null, 2));

if (app?.hq_pdf_url) {
  console.log("\n=== PDF in storage ===");
  const { data: dl, error: dlErr } = await sb.storage.from("generated-pdfs").download(app.hq_pdf_url);
  if (dlErr) console.log("  ✗", dlErr.message);
  else {
    const buf = new Uint8Array(await dl.arrayBuffer());
    const magic = String.fromCharCode(...buf.slice(0, 5));
    console.log(`  ✓ ${buf.byteLength} bytes, magic '${magic}' (expect '%PDF-')`);
  }
}
