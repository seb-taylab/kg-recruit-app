/**
 * Extracts every visible text item from the blank MF_V1.0 PDF with its
 * (x, y) position in pdf-lib coordinates (origin bottom-left). Used to
 * calibrate lib/pdf/form-coordinates.ts.
 */
import { readFileSync } from "node:fs";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
// Workerless mode for Node.
pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist/legacy/build/pdf.worker.mjs";

const data = new Uint8Array(readFileSync("public/forms/MF_V1.0_blank.pdf"));
const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;

for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  console.log(`\n=== Page ${pageNum} (${viewport.width.toFixed(0)} × ${viewport.height.toFixed(0)}) ===`);
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    // transform is [a, b, c, d, e, f] — e=x, f=y in pdfjs coords (origin top-left).
    // Convert to pdf-lib coords by flipping y.
    const pdfjsX = item.transform[4];
    const pdfjsY = item.transform[5];
    const pdfLibY = pdfjsY; // pdfjs's transform.f IS already in PDF coords (bottom-left origin)
    // (pdfjs reports the baseline; pdf-lib draws at the baseline too.)
    console.log(`  [${pdfjsX.toFixed(1).padStart(6)}, ${pdfLibY.toFixed(1).padStart(6)}]  "${item.str}"`);
  }
}
