/**
 * One-time conversion script.
 *
 * Takes the @fontsource/noto-sans-sc "chinese-simplified" subset WOFF2
 * (~1.1MB) and decompresses it to a plain TTF that pdf-lib can embed.
 * Output → public/fonts/NotoSansSC-Subset.ttf so it ships with the
 * serverless function.
 *
 * Run: node scripts/convert-cjk-font.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import wawoff from "wawoff2";

const SRC = path.join(
  process.cwd(),
  "node_modules",
  "@fontsource",
  "noto-sans-sc",
  "files",
  "noto-sans-sc-chinese-simplified-400-normal.woff2",
);
const OUT = path.join(process.cwd(), "public", "fonts", "NotoSansSC-Subset.ttf");

const woff2Bytes = await readFile(SRC);
console.log(`Source WOFF2: ${(woff2Bytes.byteLength / 1024).toFixed(0)} KB`);

const ttfBytes = await wawoff.decompress(woff2Bytes);
await writeFile(OUT, ttfBytes);
console.log(`Output TTF:   ${(ttfBytes.byteLength / 1024).toFixed(0)} KB → ${OUT}`);
