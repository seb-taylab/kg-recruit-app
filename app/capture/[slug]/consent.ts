/**
 * Constants for the booth capture flow.
 *
 * Lives in its own file (not actions.ts) because Next.js Turbopack rejects
 * non-async exports from "use server" files at build time. Type interfaces
 * are erased at runtime so they're fine in actions.ts; value exports are
 * not.
 *
 * IMPORTANT: any change to CAPTURE_CONSENT_TEXT MUST bump
 * CAPTURE_CONSENT_VERSION so the audit row recorded in leads
 * .consent_text_version reflects exactly which copy the applicant saw.
 *
 * v2 (2026-05-18): dropped the "next 30 days" / "deleted within 30 days"
 * framing per Sebastian's direction. Consent is now indefinite-until-
 * withdrawal. Existing v1 leads keep their original consent_text_version
 * reference — no retroactive change of legal basis.
 */

export const CAPTURE_CONSENT_VERSION = "v2-2026-05-18";

export const CAPTURE_CONSENT_TEXT =
  "By providing my details, I consent to PAP contacting me about Party membership. My details may be shared with the PAP branch in my constituency for direct follow-up. I can withdraw consent at any time by contacting the branch — my details will be deleted on request.";
