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

/**
 * Phone-less WhatsApp share — opens WhatsApp with the message pre-filled and
 * lets the sender pick the recipient from their own contacts. Used for the
 * Chairman sign link, where we don't store the chairman's number: the admin
 * taps "Share to WhatsApp" and chooses the chairman from their chat list.
 */
export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export interface ChairmanSignMessageVars {
  applicantName: string;
  branchName: string;
  adminName: string;
  link: string;
}

/** Prefilled WhatsApp copy for nudging the Chairman to sign. */
export function buildChairmanSignMessage(vars: ChairmanSignMessageVars): string {
  return [
    `Hi, this is ${vars.adminName} from PAP ${vars.branchName} Branch.`,
    ``,
    `${vars.applicantName}'s membership application is ready for your signature as Branch Chairman. You can review and sign it here — no login needed:`,
    vars.link,
    ``,
    `Thank you!`,
  ].join("\n");
}
