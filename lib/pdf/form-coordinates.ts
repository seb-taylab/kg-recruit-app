/**
 * MF_V1.0 PDF form coordinate map.
 *
 * Calibrated against the blank template at /public/forms/MF_V1.0_blank.pdf
 * (A4, 595.28 × 841.89 pts, PDF origin at bottom-left). Label positions
 * sourced via /scripts/extract-pdf-labels.mjs.
 *
 * Tick-group KEYS are LOCKED to the CHECK constraint strings on the
 * `applications` table (Addendum v1.3 Gap 9) — validate-form-coordinates.ts
 * enforces parity. Numeric values may iterate during visual diff.
 */
import type { TickGroupKeys } from "./form-coordinates-keys";

export interface Coord {
  x: number;
  y: number;
  /**
   * If set, the renderer measures the value at FIELD_SIZE and shrinks the
   * font (in 0.5pt steps, floor `minSize`) until it fits. Catches edge-case
   * long inputs without overlapping the next column.
   */
  maxWidth?: number;
  /**
   * 1 (default) = shrink + truncate-with-ellipsis fallback.
   * 2+ = if the value still doesn't fit at `minSize`, wrap onto extra lines
   * spaced `lineHeight` apart. Only set this for fields with vertical
   * headroom (occupation, memberships) — single-row fields like NRIC or
   * phones would collide with the field below.
   */
  maxLines?: number;
  /** Required when `maxLines > 1`. */
  lineHeight?: number;
  /** Minimum font size before truncation kicks in. Default 8pt. */
  minSize?: number;
}

export interface BoxCoord extends Coord {
  width: number;
  height: number;
}

export interface WrappedTextCoord extends Coord {
  maxWidth: number;
  lineHeight: number;
}

export interface FormCoordinates {
  page1: {
    branch: Coord;
    nricNo: Coord;
    /** Surname (rendered uppercase + underlined) then given names. */
    name: Coord;
    chineseName: Coord;
    homeAddress: WrappedTextCoord;
    postalCode: Coord;

    housing: Record<TickGroupKeys["housing"], Coord>;
    hdbRooms: Coord;

    dateOfBirth: Coord;
    placeOfBirth: Coord;

    race: Record<TickGroupKeys["race"], Coord>;
    gender: Record<TickGroupKeys["gender"], Coord>;
    maritalStatus: Record<TickGroupKeys["maritalStatus"], Coord>;

    tel: { home: Coord; office: Coord; hp: Coord };

    education: Record<TickGroupKeys["education"], Coord>;

    languages: {
      written: Record<TickGroupKeys["language"], Coord>;
      spoken: Record<TickGroupKeys["language"], Coord>;
    };

    social: {
      facebook: Coord;
      linkedin: Coord;
      twitter: Coord;
      blog: Coord;
      email: Coord;
    };

    photo: BoxCoord;
  };

  page2: {
    occupation: Coord;
    organisation: Coord;
    monthlyIncome: Record<TickGroupKeys["monthlyIncome"], Coord>;
    hobbies: [Coord, Coord, Coord];

    tradeUnions: Coord;
    associations: Coord;
    clubs: Coord;
    ccc: Coord;
    ccmc: Coord;
    rnc: Coord;
    grassroots: Coord;

    applicantDate: Coord;
    applicantSignature: BoxCoord;

    referralName: Coord;
    referralMembershipNo: Coord;
    referralYearsKnown: Coord;
    referralDate: Coord;
    referralSignature: BoxCoord;

    chairmanName: Coord;
    chairmanYearsKnown: Coord;
    chairmanDate: Coord;
    chairmanSignature: BoxCoord;
  };
}

// All values are in PDF points (1pt = 1/72 in). Origin bottom-left.
// HQ Official Use column runs x ≈ 435–570 on both pages — DO NOT render anything in this range.
export const formCoordinates: FormCoordinates = {
  page1: {
    // "Branch" label at (65, 670). Field is the line below or to the right.
    branch: { x: 130, y: 670, maxWidth: 290 },
    // "NRIC No" label at (65, 641).
    nricNo: { x: 130, y: 641, maxWidth: 200 },
    // "Name (As in NRIC, Underline Surname)" label block at (65, 617).
    name: { x: 130, y: 617, maxWidth: 290 },
    // "Chinese Characters (if applicable)" label at (65, 589).
    chineseName: { x: 170, y: 589, maxWidth: 250 },
    // "Home Address" label at (65, 555). Wrap to 2 lines.
    homeAddress: { x: 130, y: 555, maxWidth: 290, lineHeight: 12 },
    // "Postal Code" label at (273, 499). Data goes right of label.
    postalCode: { x: 335, y: 499 },

    // "Type of Housing" / "HDB ___ rooms" / "Condominium" / "Landed" at y=470.
    // Each option label sits at: HDB 158, Condominium 271, Landed 374.
    // Tick coord lands inside the checkbox just left of each option label.
    housing: {
      HDB: { x: 147, y: 472 },
      Condominium: { x: 260, y: 472 },
      Landed: { x: 363, y: 472 },
    },
    hdbRooms: { x: 184, y: 470 },

    // "Date of Birth (DD/MM/YYYY)" at (65, 415). "Place of Birth" at (239, 411).
    dateOfBirth: { x: 130, y: 415 },
    placeOfBirth: { x: 310, y: 411, maxWidth: 120 },

    // Race at y=383: Chinese 158, Malay 229, Indian 301, Others 374.
    race: {
      Chinese: { x: 147, y: 385 },
      Malay: { x: 218, y: 385 },
      Indian: { x: 290, y: 385 },
      Others: { x: 363, y: 385 },
    },
    // Gender at y=355: Male 158, Female 229.
    gender: {
      Male: { x: 147, y: 357 },
      Female: { x: 218, y: 357 },
    },
    // Marital status at y=326: Single 157, Married 229, Divorced 301.
    maritalStatus: {
      Single: { x: 147, y: 328 },
      Married: { x: 218, y: 328 },
      Divorced: { x: 290, y: 328 },
    },

    // Phones at y=298. Labels: Tel Home 65, Office 198, HP 318.
    // Cells run value-x to next-label-x. -3pt for visual padding before the
    // next column starts.
    tel: {
      home:   { x: 110, y: 298, maxWidth: 85 }, // 110 → 195
      office: { x: 230, y: 298, maxWidth: 85 }, // 230 → 315
      hp:     { x: 345, y: 298, maxWidth: 85 }, // 345 → 430
    },

    // Education y=242 (top row) + y=225 (bottom row). Labels:
    //   Primary 156, Lower Sec/N/O Level 229, Nitec 300, Post Sec/A Level 373
    //   Diploma 156, Degree 229, Post Grad 300
    education: {
      Primary: { x: 145, y: 244 },
      "Lower Sec / N / O Level": { x: 217, y: 244 },
      Nitec: { x: 289, y: 244 },
      "Post Sec / A Level": { x: 362, y: 244 },
      Diploma: { x: 145, y: 226 },
      Degree: { x: 217, y: 226 },
      "Post Grad": { x: 289, y: 226 },
    },

    // Language headers at (137 English, 209 Chinese, 281 Malay, 355 Tamil) y=198.
    // Written row at y=177, Spoken row at y=160.
    languages: {
      written: {
        English: { x: 141, y: 179 },
        Chinese: { x: 213, y: 179 },
        Malay: { x: 285, y: 179 },
        Tamil: { x: 359, y: 179 },
      },
      spoken: {
        English: { x: 141, y: 161 },
        Chinese: { x: 213, y: 161 },
        Malay: { x: 285, y: 161 },
        Tamil: { x: 359, y: 161 },
      },
    },

    // Social media at y=101 (Facebook, Linkedin), y=71 (Twitter, Blog), y=44 (Email).
    // Left-column values (Facebook, Twitter) end where the right-column
    // label starts (~x=275). Right-column values (Linkedin, Blog) end at
    // the HQ column (~x=430).
    social: {
      facebook: { x: 115, y: 101, maxWidth: 155 },
      linkedin: { x: 320, y: 101, maxWidth: 110 },
      twitter:  { x: 115, y: 71,  maxWidth: 155 },
      blog:     { x: 320, y: 71,  maxWidth: 110 },
      email:    { x: 115, y: 44,  maxWidth: 315 },
    },

    // Photo box top-right corner above HQ block. Measured against the
    // MF_V1.0 template: the printed box is ~74×85pt at (463, 723). The
    // applicant photo is captured at 7:9 (700×900, via Cloudinary
    // c_thumb,g_face), so drawing at 74×85 would stretch it horizontally.
    // Fit by height and centre horizontally instead: width 66 (= 85 × 7/9),
    // x offset +4 so the drawn image sits centred within the printed box.
    photo: { x: 467, y: 723, width: 66, height: 85 },
  },

  page2: {
    // "Occupation / Designation" at (66, 768). Each label row is ~28pt tall,
    // so a 2nd line at lineHeight 11 still clears the next label comfortably.
    occupation: { x: 200, y: 768, maxWidth: 235, maxLines: 2, lineHeight: 11 },
    organisation: { x: 200, y: 739, maxWidth: 235, maxLines: 2, lineHeight: 11 },

    // Monthly Income y=710 row. Brackets at 158, 228, 302, 378.
    monthlyIncome: {
      "Below $1,500": { x: 147, y: 712 },
      "$1,501 - $5,000": { x: 217, y: 712 },
      "$5,001 - $10,000": { x: 290, y: 712 },
      "Above $10,000": { x: 367, y: 712 },
    },
    // Hobbies (1), (2), (3) at (107, 212, 322), y=683. Each value cell ends
    // where the next `(N)` label starts.
    hobbies: [
      { x: 125, y: 683, maxWidth: 85 }, // 125 → 212-(2)
      { x: 230, y: 683, maxWidth: 90 }, // 230 → 322-(3)
      { x: 340, y: 683, maxWidth: 90 }, // 340 → 430-HQ
    ],

    // Membership rows — full-width single line, but with 2-line wrap as
    // fallback (each row has ~28pt of vertical room before the next label).
    tradeUnions:  { x: 200, y: 621, maxWidth: 235, maxLines: 2, lineHeight: 11 },
    associations: { x: 200, y: 593, maxWidth: 235, maxLines: 2, lineHeight: 11 },
    clubs:        { x: 200, y: 565, maxWidth: 235, maxLines: 2, lineHeight: 11 },
    ccc:          { x: 200, y: 531, maxWidth: 235, maxLines: 2, lineHeight: 11 },
    ccmc:         { x: 200, y: 503, maxWidth: 235, maxLines: 2, lineHeight: 11 },
    rnc:          { x: 270, y: 474, maxWidth: 165, maxLines: 2, lineHeight: 11 },
    grassroots:   { x: 220, y: 446, maxWidth: 215, maxLines: 2, lineHeight: 11 },

    // Applicant signature block: "Date" label at (66, 344), "Signature of Applicant" at (256, 344).
    // Values render on the line ABOVE the labels (label sits below the line).
    // Extra +3pt clearance keeps descenders (g, p, q, y) above the line.
    applicantDate: { x: 70, y: 359 },
    applicantSignature: { x: 250, y: 355, width: 280, height: 22 },

    // Referral: name (66, 306), membership (66, 286), years (66, 266), date+sig labels at y=220.
    referralName: { x: 160, y: 309, maxWidth: 270 },
    referralMembershipNo: { x: 160, y: 289, maxWidth: 270 },
    referralYearsKnown: { x: 215, y: 269, maxWidth: 60 },
    referralDate: { x: 70, y: 235 },
    referralSignature: { x: 250, y: 231, width: 280, height: 22 },

    // Chairman: name (66, 182), years (66, 163), date+sig labels at y=115.
    chairmanName: { x: 200, y: 185, maxWidth: 235 },
    chairmanYearsKnown: { x: 215, y: 166, maxWidth: 60 },
    chairmanDate: { x: 70, y: 131 },
    chairmanSignature: { x: 250, y: 127, width: 280, height: 22 },
  },
};
