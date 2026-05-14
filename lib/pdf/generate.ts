/**
 * Membership form PDF generator.
 *
 * Strategy per Addendum v1.3 Gap 6: **template overlay** — load the blank
 * MF_V1.0 PDF, stamp the applicant/referral/chairman data + photo +
 * signatures at calibrated coordinates, leave HQ regions blank.
 *
 * Numeric coordinates in lib/pdf/form-coordinates.ts are STUBBED. Visual
 * calibration against the real blank PDF is a manual follow-up — for now
 * the output is dimensionally correct (page 1 + page 2, photo embedded,
 * signatures embedded) but field positions need a calibration pass.
 *
 * Form Ownership Map invariant: this function **renders nothing in HQ
 * regions** (page 1 right column, page 2 bottom HQ block).
 */
import "server-only";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import { formCoordinates, type Coord } from "@/lib/pdf/form-coordinates";
import { FORM_TICK_VALUES, type TickGroupKeys } from "@/lib/pdf/form-coordinates-keys";
import { formatDateDDMMYYYY } from "@/lib/format/date";
import { drawWrappedText } from "@/lib/pdf/text-wrap";

export interface ApplicationData {
  branch_name: string;
  nric_no: string | null;
  surname: string | null;
  given_names: string | null;
  chinese_name: string | null;
  home_address: string | null;
  postal_code: string | null;
  housing_type: string | null;
  hdb_rooms: number | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  race: string | null;
  gender: string | null;
  marital_status: string | null;
  tel_home: string | null;
  tel_office: string | null;
  tel_hp: string | null;
  highest_edu: string | null;
  written_languages: string[] | null;
  spoken_languages: string[] | null;
  facebook: string | null;
  linkedin: string | null;
  twitter: string | null;
  blog: string | null;
  email: string | null;
  occupation: string | null;
  organisation: string | null;
  monthly_income: string | null;
  hobbies: string[] | null;
  trade_unions: string | null;
  associations: string | null;
  clubs: string | null;
  ccc: string | null;
  ccmc: string | null;
  rnc: string | null;
  grassroots: string | null;
  applicant_signed_at: string | null;
  referral_signed_at: string | null;
  chairman_signed_at: string | null;
  assigned_referral_name: string | null;
  assigned_referral_membership_no: string | null;
  assigned_referral_known_years: number | null;
  chairman_name_on_form: string | null;
  chairman_known_years: number | null;
}

export interface SignatureAsset {
  pngBytes: Uint8Array;
}

export interface PdfGenerateInput {
  application: ApplicationData;
  photoBytes: Uint8Array;
  /** PNG signatures keyed by role. Missing roles are skipped. */
  signatures: {
    applicant?: SignatureAsset;
    referral?: SignatureAsset;
    chairman?: SignatureAsset;
  };
}

const FIELD_SIZE = 11;
/** Floor for auto-shrink. Below this Helvetica gets hard to read. */
const MIN_FIELD_SIZE = 8;
const TICK_STROKE_WIDTH = 1.5;

/**
 * Build the filled MF_V1.0 PDF as bytes. Caller is responsible for
 * persisting to storage + emailing the URL.
 */
export async function generateFilledMembershipPDF(input: PdfGenerateInput): Promise<Uint8Array> {
  const templatePath = path.join(process.cwd(), "public", "forms", "MF_V1.0_blank.pdf");
  const templateBytes = await fs.readFile(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const pages = pdfDoc.getPages();
  if (pages.length < 2) {
    throw new Error(
      `MF_V1.0_blank.pdf has ${pages.length} page(s); expected 2 (page 1 + page 2).`,
    );
  }
  const [page1, page2] = pages;
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const app = input.application;

  // ─── Page 1 ────────────────────────────────────────────────────────
  text(page1, font, app.branch_name, formCoordinates.page1.branch);
  text(page1, font, app.nric_no, formCoordinates.page1.nricNo);
  text(page1, font, app.chinese_name, formCoordinates.page1.chineseName);

  drawNameWithUnderlinedSurname(page1, font, app, formCoordinates.page1.name);

  // home_address wraps to up to 2 lines.
  if (app.home_address) {
    drawWrappedText(page1, app.home_address, {
      x: formCoordinates.page1.homeAddress.x,
      y: formCoordinates.page1.homeAddress.y,
      maxWidth: formCoordinates.page1.homeAddress.maxWidth,
      lineHeight: formCoordinates.page1.homeAddress.lineHeight,
      maxLines: 2,
      font,
      size: FIELD_SIZE,
    });
  }
  text(page1, font, app.postal_code, formCoordinates.page1.postalCode);

  // Housing: tick at the matched coordinate + write rooms count if HDB.
  if (app.housing_type) {
    const coord =
      formCoordinates.page1.housing[
        app.housing_type as TickGroupKeys["housing"]
      ];
    if (coord) drawTick(page1, coord);
    if (app.housing_type === "HDB" && app.hdb_rooms != null) {
      text(page1, font, String(app.hdb_rooms), formCoordinates.page1.hdbRooms);
    }
  }

  text(page1, font, formatDateDDMMYYYY(app.date_of_birth), formCoordinates.page1.dateOfBirth);
  text(page1, font, app.place_of_birth, formCoordinates.page1.placeOfBirth);

  drawTickFromMap(page1, formCoordinates.page1.race, app.race);
  drawTickFromMap(page1, formCoordinates.page1.gender, app.gender);
  drawTickFromMap(page1, formCoordinates.page1.maritalStatus, app.marital_status);

  text(page1, font, app.tel_home, formCoordinates.page1.tel.home);
  text(page1, font, app.tel_office, formCoordinates.page1.tel.office);
  text(page1, font, app.tel_hp, formCoordinates.page1.tel.hp);

  drawTickFromMap(page1, formCoordinates.page1.education, app.highest_edu);

  // Multi-tick groups.
  for (const lang of app.written_languages ?? []) {
    drawTickFromMap(page1, formCoordinates.page1.languages.written, lang);
  }
  for (const lang of app.spoken_languages ?? []) {
    drawTickFromMap(page1, formCoordinates.page1.languages.spoken, lang);
  }

  text(page1, font, app.facebook, formCoordinates.page1.social.facebook);
  text(page1, font, app.linkedin, formCoordinates.page1.social.linkedin);
  text(page1, font, app.twitter, formCoordinates.page1.social.twitter);
  text(page1, font, app.blog, formCoordinates.page1.social.blog);
  text(page1, font, app.email, formCoordinates.page1.social.email);

  // Photo (top-right). Embed as JPEG; fall back gracefully on bad bytes.
  try {
    const jpg = await pdfDoc.embedJpg(input.photoBytes);
    page1.drawImage(jpg, formCoordinates.page1.photo);
  } catch {
    try {
      const png = await pdfDoc.embedPng(input.photoBytes);
      page1.drawImage(png, formCoordinates.page1.photo);
    } catch {
      // Photo not embeddable — leave the slot empty. Logged by caller.
    }
  }

  // ─── Page 2 ────────────────────────────────────────────────────────
  text(page2, font, app.occupation, formCoordinates.page2.occupation);
  text(page2, font, app.organisation, formCoordinates.page2.organisation);
  drawTickFromMap(page2, formCoordinates.page2.monthlyIncome, app.monthly_income);

  for (let i = 0; i < Math.min((app.hobbies ?? []).length, 3); i++) {
    text(page2, font, app.hobbies![i], formCoordinates.page2.hobbies[i]);
  }

  text(page2, font, app.trade_unions, formCoordinates.page2.tradeUnions);
  text(page2, font, app.associations, formCoordinates.page2.associations);
  text(page2, font, app.clubs, formCoordinates.page2.clubs);
  text(page2, font, app.ccc, formCoordinates.page2.ccc);
  text(page2, font, app.ccmc, formCoordinates.page2.ccmc);
  text(page2, font, app.rnc, formCoordinates.page2.rnc);
  text(page2, font, app.grassroots, formCoordinates.page2.grassroots);

  // Applicant signature + date.
  text(
    page2,
    font,
    formatDateDDMMYYYY(app.applicant_signed_at),
    formCoordinates.page2.applicantDate,
  );
  if (input.signatures.applicant) {
    await embedSignature(
      pdfDoc,
      page2,
      input.signatures.applicant.pngBytes,
      formCoordinates.page2.applicantSignature,
    );
  }

  // Referral block.
  text(page2, font, app.assigned_referral_name, formCoordinates.page2.referralName);
  text(
    page2,
    font,
    app.assigned_referral_membership_no,
    formCoordinates.page2.referralMembershipNo,
  );
  if (app.assigned_referral_known_years != null) {
    text(
      page2,
      font,
      String(app.assigned_referral_known_years),
      formCoordinates.page2.referralYearsKnown,
    );
  }
  text(
    page2,
    font,
    formatDateDDMMYYYY(app.referral_signed_at),
    formCoordinates.page2.referralDate,
  );
  if (input.signatures.referral) {
    await embedSignature(
      pdfDoc,
      page2,
      input.signatures.referral.pngBytes,
      formCoordinates.page2.referralSignature,
    );
  }

  // Chairman block.
  text(page2, font, app.chairman_name_on_form, formCoordinates.page2.chairmanName);
  if (app.chairman_known_years != null) {
    text(
      page2,
      font,
      String(app.chairman_known_years),
      formCoordinates.page2.chairmanYearsKnown,
    );
  }
  text(
    page2,
    font,
    formatDateDDMMYYYY(app.chairman_signed_at),
    formCoordinates.page2.chairmanDate,
  );
  if (input.signatures.chairman) {
    await embedSignature(
      pdfDoc,
      page2,
      input.signatures.chairman.pngBytes,
      formCoordinates.page2.chairmanSignature,
    );
  }

  // HQ Comments / Approved by / Date approved — INTENTIONALLY UNSET.
  void boldFont; // reserved for future calibrated bold accents

  return pdfDoc.save();
}

// ───────── helpers ─────────

function text(page: PDFPage, font: PDFFont, value: string | null | undefined, coord: Coord) {
  if (!value) return;
  // pdf-lib's StandardFonts (Helvetica) use WinAnsi encoding, which can't
  // represent CJK / many non-Latin code points. Strip unencodable chars
  // rather than crashing the whole render. Embedding a CJK-capable TTF
  // (e.g. Noto Sans CJK) is a follow-up — currently affects `chinese_name`
  // only. See Step 8 report.
  const safe = String(value).replace(/[^\x00-\xff]/g, "");
  if (!safe) return;

  // No width constraint configured for this field — render as-is (back-compat
  // for short fixed-format fields like postal code, NRIC, dates).
  if (!coord.maxWidth) {
    page.drawText(safe, { x: coord.x, y: coord.y, size: FIELD_SIZE, font });
    return;
  }

  const minSize = coord.minSize ?? MIN_FIELD_SIZE;
  const fittedSize = fitFontSize(font, safe, coord.maxWidth, FIELD_SIZE, minSize);

  if (font.widthOfTextAtSize(safe, fittedSize) <= coord.maxWidth) {
    page.drawText(safe, { x: coord.x, y: coord.y, size: fittedSize, font });
    return;
  }

  // Doesn't fit even at minSize. Wrap if vertical room is allowed, otherwise
  // truncate with an ellipsis.
  if ((coord.maxLines ?? 1) > 1) {
    drawWrappedText(page, safe, {
      x: coord.x,
      y: coord.y,
      maxWidth: coord.maxWidth,
      lineHeight: coord.lineHeight ?? minSize + 1,
      maxLines: coord.maxLines!,
      font,
      size: minSize,
    });
    return;
  }

  let truncated = safe;
  while (
    truncated.length > 0 &&
    font.widthOfTextAtSize(truncated + "…", minSize) > coord.maxWidth
  ) {
    truncated = truncated.slice(0, -1);
  }
  page.drawText(truncated + (truncated.length < safe.length ? "…" : ""), {
    x: coord.x,
    y: coord.y,
    size: minSize,
    font,
  });
}

/**
 * Binary-step-free shrink loop. Tries FIELD_SIZE first, then drops 0.5pt at
 * a time. Fine for short strings (<60 chars) where we're never doing more
 * than ~6 iterations. Returns minSize if nothing in range fits.
 */
function fitFontSize(
  font: PDFFont,
  value: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
): number {
  let size = startSize;
  while (size > minSize && font.widthOfTextAtSize(value, size) > maxWidth) {
    size -= 0.5;
  }
  return Math.max(size, minSize);
}

function drawTick(page: PDFPage, coord: Coord) {
  // Small centered checkmark using two line segments. drawLine uses PDF
  // coordinates (Y-up), unlike drawSvgPath which applies SVG semantics
  // (Y-down) and flips the mark upside down.
  const x = coord.x;
  const y = coord.y;
  const color = rgb(0, 0, 0);
  // Down-stroke: upper-left → bottom of V.
  page.drawLine({
    start: { x: x - 3, y: y + 2 },
    end: { x: x - 1, y: y - 2 },
    thickness: TICK_STROKE_WIDTH,
    color,
  });
  // Up-stroke: bottom of V → upper-right (longer).
  page.drawLine({
    start: { x: x - 1, y: y - 2 },
    end: { x: x + 4, y: y + 4 },
    thickness: TICK_STROKE_WIDTH,
    color,
  });
}

function drawTickFromMap(page: PDFPage, map: Record<string, Coord>, value: string | null | undefined) {
  if (!value) return;
  const coord = map[value];
  if (coord) drawTick(page, coord);
}

function drawNameWithUnderlinedSurname(
  page: PDFPage,
  font: PDFFont,
  app: ApplicationData,
  coord: Coord,
) {
  const stripUnicode = (s: string) => s.replace(/[^\x00-\xff]/g, "");
  const surname = stripUnicode((app.surname ?? "").toUpperCase().trim());
  const given = stripUnicode((app.given_names ?? "").trim());
  if (!surname && !given) return;
  let full = [surname, given].filter(Boolean).join(" ");
  // Shrink to fit if a maxWidth is configured. The underline tracks the
  // surname at the same fitted size so the line stays under the right text.
  const minSize = coord.minSize ?? MIN_FIELD_SIZE;
  const size = coord.maxWidth
    ? fitFontSize(font, full, coord.maxWidth, FIELD_SIZE, minSize)
    : FIELD_SIZE;

  // If shrinking hit the floor and the text STILL overflows the cell,
  // truncate the given-names tail with an ellipsis. We never touch the
  // surname (legal identifier — losing chars there would be worse than
  // losing them from given names).
  if (coord.maxWidth && font.widthOfTextAtSize(full, size) > coord.maxWidth) {
    let truncated = full;
    const surnameOnlyWidth = font.widthOfTextAtSize(surname, size);
    while (
      truncated.length > surname.length &&
      font.widthOfTextAtSize(truncated + "…", size) > coord.maxWidth
    ) {
      truncated = truncated.slice(0, -1);
    }
    // Guard: if the surname itself is wider than the cell, give up and let
    // it spill — it's the legal name, we don't truncate it.
    full = surnameOnlyWidth > coord.maxWidth ? full : truncated + "…";
  }

  page.drawText(full, { x: coord.x, y: coord.y, size, font });
  if (surname) {
    const surnameWidth = font.widthOfTextAtSize(surname, size);
    page.drawLine({
      start: { x: coord.x, y: coord.y - 1 },
      end: { x: coord.x + surnameWidth, y: coord.y - 1 },
      thickness: 0.6,
      color: rgb(0, 0, 0),
    });
  }
}

async function embedSignature(
  pdfDoc: PDFDocument,
  page: PDFPage,
  pngBytes: Uint8Array,
  box: { x: number; y: number; width: number; height: number },
) {
  try {
    const png = await pdfDoc.embedPng(pngBytes);
    // Fit signature inside the box preserving aspect ratio.
    const ratio = Math.min(box.width / png.width, box.height / png.height);
    const w = png.width * ratio;
    const h = png.height * ratio;
    page.drawImage(png, {
      x: box.x + (box.width - w) / 2,
      y: box.y + (box.height - h) / 2,
      width: w,
      height: h,
    });
  } catch {
    // Bad signature bytes — skip rather than fail the whole PDF.
  }
}

// Helper used by tests / scripts to confirm the tick map covers every CHECK value.
export function _internalAssertCoverage() {
  for (const v of FORM_TICK_VALUES.race) if (!formCoordinates.page1.race[v]) throw new Error(`race[${v}]`);
  for (const v of FORM_TICK_VALUES.gender) if (!formCoordinates.page1.gender[v]) throw new Error(`gender[${v}]`);
  for (const v of FORM_TICK_VALUES.maritalStatus)
    if (!formCoordinates.page1.maritalStatus[v]) throw new Error(`marital[${v}]`);
  for (const v of FORM_TICK_VALUES.housing) if (!formCoordinates.page1.housing[v]) throw new Error(`housing[${v}]`);
  for (const v of FORM_TICK_VALUES.education)
    if (!formCoordinates.page1.education[v]) throw new Error(`education[${v}]`);
  for (const v of FORM_TICK_VALUES.monthlyIncome)
    if (!formCoordinates.page2.monthlyIncome[v]) throw new Error(`income[${v}]`);
}
