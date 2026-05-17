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
 */

export const CAPTURE_CONSENT_VERSION = "v1-2026-05-17";

export const CAPTURE_CONSENT_TEXT =
  "By providing my details, I consent to PAP contacting me about Party membership in the next 30 days. My details may be shared with the PAP branch in my constituency for direct follow-up. If I don't proceed with a full membership application within 30 days, my details will be deleted. I can withdraw consent any time by contacting the branch.";
