/**
 * PDF multi-line text helper.
 *
 * Addendum v1.3 Gap 8: pdf-lib's drawText does not wrap. home_address can
 * be up to 200 chars and renders as 2 lines on the form; all other fields
 * are single-line with zod-enforced max lengths and truncate-with-ellipsis
 * if they still exceed the column width.
 */
import type { PDFFont, PDFPage } from "pdf-lib";

export interface DrawWrappedTextOptions {
  x: number;
  y: number;
  maxWidth: number;
  lineHeight: number;
  /** Default 1; use 2 for home_address. */
  maxLines?: number;
  font: PDFFont;
  size: number;
}

export interface DrawWrappedTextResult {
  linesDrawn: number;
  truncated: boolean;
}

export function drawWrappedText(
  page: PDFPage,
  text: string,
  opts: DrawWrappedTextOptions,
): DrawWrappedTextResult {
  const { x, y, maxWidth, lineHeight, maxLines = 1, font, size } = opts;
  if (!text) return { linesDrawn: 0, truncated: false };

  // WinAnsi safety — see lib/pdf/generate.ts text() helper.
  const safeText = text.replace(/[^\x00-\xff]/g, "");
  if (!safeText) return { linesDrawn: 0, truncated: false };

  const words = safeText.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let truncated = false;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    // candidate would overflow — flush current line first
    if (current) {
      lines.push(current);
      current = "";
    }
    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }
    // Try the word on its own
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
    } else {
      // Word itself exceeds maxWidth — hard-truncate
      lines.push(truncateToWidth(word, maxWidth, font, size));
      truncated = true;
      break;
    }
  }
  // If we filled lines exactly and emptied the word queue, push the
  // remaining current and zero it so the truncation check below doesn't
  // false-positive.
  if (current && lines.length < maxLines) {
    lines.push(current);
    current = "";
  }
  if (current && words.length > 0) {
    // We're genuinely truncating: still have unpushed content with maxLines
    // already filled.
    truncated = true;
  }

  // If we truncated mid-stream, add ellipsis to the last line (if room).
  if (truncated && lines.length > 0) {
    const lastIdx = lines.length - 1;
    lines[lastIdx] = appendEllipsis(lines[lastIdx], maxWidth, font, size);
  }

  lines.forEach((line, i) => {
    page.drawText(line, { x, y: y - i * lineHeight, font, size });
  });

  return { linesDrawn: lines.length, truncated };
}

function truncateToWidth(word: string, maxWidth: number, font: PDFFont, size: number): string {
  let chars = word.length;
  while (chars > 0 && font.widthOfTextAtSize(word.slice(0, chars) + "…", size) > maxWidth) {
    chars--;
  }
  return chars > 0 ? word.slice(0, chars) + "…" : "…";
}

function appendEllipsis(line: string, maxWidth: number, font: PDFFont, size: number): string {
  const ellipsised = line + "…";
  if (font.widthOfTextAtSize(ellipsised, size) <= maxWidth) return ellipsised;
  let chars = line.length;
  while (chars > 0 && font.widthOfTextAtSize(line.slice(0, chars) + "…", size) > maxWidth) {
    chars--;
  }
  return chars > 0 ? line.slice(0, chars) + "…" : "…";
}
