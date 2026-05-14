/**
 * Branded invite email — verbatim copy from Brand Execution §4.
 *
 * Layout: PAP lightning-bolt mark, headline, body, single CTA in PAP red,
 * footer signature. Plain-text version mirrors the HTML for inboxes that
 * strip styles.
 */
import { formatDateDDMMMYYYY } from "@/lib/format/date";

export interface InviteEmailVars {
  applicantName: string;
  adminName: string;
  link: string;
  expiresAt: Date | string;
}

export function inviteEmailSubject(): string {
  return "You've been invited to join PAP Kampong Glam Branch";
}

export function inviteEmailText(vars: InviteEmailVars): string {
  const expires = formatDateDDMMMYYYY(vars.expiresAt);
  return [
    `Hi ${vars.applicantName},`,
    ``,
    `${vars.adminName} from PAP Kampong Glam Branch has invited you to apply for membership.`,
    ``,
    `Start your application: ${vars.link}`,
    ``,
    `Takes about 10 minutes — a short 2-page form, a photo, and your signature.`,
    `The link is open until ${expires}.`,
    ``,
    `If you didn't expect this email, you can safely ignore it.`,
    ``,
    `— Kampong Glam Branch Team`,
  ].join("\n");
}

export function inviteEmailHtml(vars: InviteEmailVars): string {
  const expires = formatDateDDMMMYYYY(vars.expiresAt);
  const safeName = escapeHtml(vars.applicantName);
  const safeAdmin = escapeHtml(vars.adminName);
  const safeLink = escapeAttr(vars.link);
  const safeExpires = escapeHtml(expires);

  // Inline styles only — Resend strips <style> tags in some clients.
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#18181B;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FAFAFA;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background-color:#FFFFFF;border:1px solid #E4E4E7;border-radius:12px;">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid #E4E4E7;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <div style="width:40px;height:40px;background-color:#0052A1;border-radius:9999px;text-align:center;line-height:40px;color:#FFFFFF;font-weight:700;font-size:20px;">⚡</div>
                    </td>
                    <td style="padding-left:12px;vertical-align:middle;font-weight:600;font-size:16px;color:#18181B;">PAP Kampong Glam Branch</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hi ${safeName},</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">${safeAdmin} from PAP Kampong Glam Branch has invited you to apply for membership.</p>
                <p style="margin:0 0 24px;">
                  <a href="${safeLink}" style="display:inline-block;background-color:#EF3340;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:16px;padding:14px 24px;border-radius:8px;">Start your application</a>
                </p>
                <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#3F3F46;">Takes about 10 minutes — a short 2-page form, a photo, and your signature.</p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#3F3F46;">The link is open until <strong>${safeExpires}</strong>.</p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#71717A;">If you didn't expect this email, you can safely ignore it.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #E4E4E7;font-size:12px;color:#71717A;">— Kampong Glam Branch Team</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  // URL-safe enough: drop control chars and quote-encode.
  return escapeHtml(s);
}
