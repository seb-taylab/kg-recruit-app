/**
 * Branded completion email — sent when an admin clicks "Send Now" in the
 * Recipient Picker. Recipients: HQ (branches.hq_email) + self + custom.
 *
 * Brand Execution §4 — Completion email template, verbatim.
 */
import { formatDateDDMMMYYYY } from "@/lib/format/date";

export interface CompletionEmailVars {
  applicantName: string;
  branchName: string;
  chairmanName: string;
  submittedAt: Date | string;
  pdfUrl: string;
  pdfTtlDays: number;
}

export function completionEmailSubject(applicantName: string): string {
  return `New PAP membership application — ${applicantName}`;
}

export function completionEmailText(vars: CompletionEmailVars): string {
  const submitted = formatDateDDMMMYYYY(vars.submittedAt);
  return [
    `Attached: signed membership application for ${vars.applicantName}.`,
    ``,
    `Submitted by ${vars.branchName} on ${submitted}.`,
    `Branch Chairman: ${vars.chairmanName}.`,
    ``,
    `View signed PDF: ${vars.pdfUrl}`,
    `(Link valid ${vars.pdfTtlDays} days.)`,
    ``,
    `— ${vars.branchName} Team`,
  ].join("\n");
}

export function completionEmailHtml(vars: CompletionEmailVars): string {
  const submitted = formatDateDDMMMYYYY(vars.submittedAt);
  const safeApplicant = escapeHtml(vars.applicantName);
  const safeBranch = escapeHtml(vars.branchName);
  const safeChairman = escapeHtml(vars.chairmanName);
  const safeSubmitted = escapeHtml(submitted);
  const safeUrl = escapeAttr(vars.pdfUrl);
  const ttlDays = vars.pdfTtlDays;

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
                    <td style="padding-left:12px;vertical-align:middle;font-weight:600;font-size:16px;color:#18181B;">${safeBranch}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
                  Attached: signed membership application for <strong>${safeApplicant}</strong>.
                </p>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#3F3F46;">
                  Submitted by ${safeBranch} on <strong>${safeSubmitted}</strong>.
                </p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#3F3F46;">
                  Branch Chairman: ${safeChairman}.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${safeUrl}" style="display:inline-block;background-color:#EF3340;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:16px;padding:14px 24px;border-radius:8px;">View signed PDF</a>
                </p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#71717A;">Link valid ${ttlDays} days.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #E4E4E7;font-size:12px;color:#71717A;">— ${safeBranch} Team</td>
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
  return escapeHtml(s);
}
