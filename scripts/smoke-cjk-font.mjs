/**
 * Render a tiny PDF with the converted CJK subset font to confirm:
 *   - pdf-lib accepts the TTF
 *   - 郑家翔 (the exact name the user reported missing) actually shows
 *   - Mixed Latin+CJK strings render correctly through the same font
 *   - subset:true keeps the output PDF small
 *
 * Run: node scripts/smoke-cjk-font.mjs
 * Output: scripts/_cjk-smoke.pdf — open it to eyeball the characters.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const FONT_PATH = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NotoSansSC-Subset.ttf",
);

const fontBytes = await readFile(FONT_PATH);
console.log(`Font: ${(fontBytes.byteLength / 1024).toFixed(0)} KB`);

const pdfDoc = await PDFDocument.create();
pdfDoc.registerFontkit(fontkit);

const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
const cjk = await pdfDoc.embedFont(fontBytes, { subset: true });

const page = pdfDoc.addPage([500, 300]);
page.drawText("Helvetica only:", { x: 30, y: 250, size: 12, font: helv });
page.drawText("郑家翔", { x: 180, y: 250, size: 18, font: cjk });

page.drawText("Mixed via CJK font (Latin glyph test):", {
  x: 30,
  y: 200,
  size: 12,
  font: helv,
});
page.drawText("TAY 郑家翔 sebastian", {
  x: 30,
  y: 175,
  size: 14,
  font: cjk,
});

page.drawText("Pure CJK sample:", { x: 30, y: 130, size: 12, font: helv });
page.drawText("人民行动党 - 新加坡", { x: 30, y: 105, size: 18, font: cjk });

page.drawText("Pure Latin via CJK font:", { x: 30, y: 60, size: 12, font: helv });
page.drawText("The quick brown fox", { x: 30, y: 35, size: 14, font: cjk });

const bytes = await pdfDoc.save();
const out = path.join(process.cwd(), "scripts", "_cjk-smoke.pdf");
await writeFile(out, bytes);
console.log(`PDF: ${(bytes.byteLength / 1024).toFixed(1)} KB → ${out}`);

// Probe: does the CJK font cover basic Latin? If not, we'd need to
// chunk strings by script and use Helvetica for ASCII runs.
const widthOfA = cjk.widthOfTextAtSize("A", 12);
const widthOfChinese = cjk.widthOfTextAtSize("郑", 12);
console.log(`Width of "A" in CJK font:    ${widthOfA.toFixed(2)} (0 = glyph missing)`);
console.log(`Width of "郑" in CJK font:   ${widthOfChinese.toFixed(2)}`);
if (widthOfA === 0) {
  console.warn("⚠ CJK font has NO Latin glyphs — mixed strings will need chunked rendering.");
} else {
  console.log("✓ CJK font covers basic Latin — single-font rendering is safe.");
}
