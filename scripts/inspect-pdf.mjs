import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

const bytes = readFileSync("public/forms/MF_V1.0_blank.pdf");
const doc = await PDFDocument.load(bytes);
const pages = doc.getPages();
console.log(`Pages: ${pages.length}`);
pages.forEach((p, i) => {
  const { width, height } = p.getSize();
  console.log(`  Page ${i + 1}: ${width.toFixed(2)} × ${height.toFixed(2)} pts`);
});
