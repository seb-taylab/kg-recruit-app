/**
 * WhatsApp share URL builder — zero integration.
 *
 * PRD §1D: opens `https://wa.me/{phone_no_plus}?text={encoded}` in a new
 * tab. No SDK, no API key, no backend code. Works on mobile (opens the app)
 * and desktop (WhatsApp Web).
 *
 * Brand Execution §5 owns the prefilled message copy.
 */
import { formatPhoneForWhatsApp } from "@/lib/format/phone";

export interface WhatsAppMessageVars {
  applicantName: string;
  adminName: string;
  link: string;
  ttlDays: number;
}

export function buildInviteMessage(vars: WhatsAppMessageVars): string {
  return [
    `Hi ${vars.applicantName}, this is ${vars.adminName} from PAP Kampong Glam Branch.`,
    ``,
    `Here's your link to complete your membership application:`,
    vars.link,
    ``,
    `The link expires in ${vars.ttlDays} days — let me know if you need more time.`,
  ].join("\n");
}

export function buildWhatsAppUrl(e164: string, message: string): string {
  const phone = formatPhoneForWhatsApp(e164);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
