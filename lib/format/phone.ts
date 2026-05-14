/**
 * Phone number helpers.
 *
 * Storage: E.164 (`+6591234567`).
 * Display: `+65 9123 4567` (PRD §7.9, Design System §7.9).
 *
 * SG numbers default. Inputs without a `+` prefix are assumed SG (8 digits
 * starting with 6/8/9). libphonenumber-js handles the rest.
 */
import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Parse a free-text phone into canonical E.164. Returns null if invalid. */
export function toE164(input: string, defaultCountry: "SG" = "SG"): string | null {
  if (!input) return null;
  const cleaned = input.trim();
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/** Format E.164 for display: `+6591234567` → `+65 9123 4567`. */
export function formatPhoneDisplay(e164: string | null | undefined): string {
  if (!e164) return "";
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.formatInternational();
}

/** WhatsApp URL needs the country code + number with no `+` or spaces. */
export function formatPhoneForWhatsApp(e164: string): string {
  return e164.replace(/^\+/, "");
}

/** Mask the middle digits for non-admin display: `+65 ****1234`. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const last4 = e164.slice(-4);
  // Try to preserve the country-code prefix when present.
  const parsed = parsePhoneNumberFromString(e164);
  if (parsed) return `+${parsed.countryCallingCode} ****${last4}`;
  return `****${last4}`;
}
