/**
 * Manual chairman-sign reminder email.
 *
 * Triggered by the Branch Admin from the application detail page when
 * the auto-nudge cadence isn't fast enough (busy chairman buried in
 * inbox). Mirrors the layout of the invite/completion templates so the
 * Chairman sees a consistent brand.
 */
export interface ChairmanReminderVars {
  applicantName: string;
  branchName: string;
  adminName: string;
  link: string;
}

export function chairmanReminderSubject(vars: ChairmanReminderVars): string {
  return `Reminder — please sign for ${vars.applicantName}`;
}

export function chairmanReminderText(vars: ChairmanReminderVars): string {
  return [
    `Hi,`,
    ``,
    `This is a manual reminder from ${vars.adminName} at PAP ${vars.branchName}.`,
    ``,
    `${vars.applicantName}'s membership application is waiting for your signature.`,
    ``,
    `Open it here: ${vars.link}`,
    ``,
    `PAP ${vars.branchName}`,
  ].join("\n");
}

export function chairmanReminderHtml(vars: ChairmanReminderVars): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;font-family:system-ui,sans-serif;background:#F5F5F5;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F5F5F5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="background:#FFFFFF;border-radius:12px;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 12px 0;font-size:22px;color:#1F2937;">Application pending your signature</h1>
          <p style="margin:0 0 12px 0;color:#374151;">Hi,</p>
          <p style="margin:0 0 12px 0;color:#374151;">This is a manual reminder from <strong>${vars.adminName}</strong> at PAP ${vars.branchName}.</p>
          <p style="margin:0 0 24px 0;color:#374151;"><strong>${vars.applicantName}</strong>'s membership application is waiting for your signature.</p>
          <p style="margin:24px 0;">
            <a href="${vars.link}" style="display:inline-block;background-color:#EF3340;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:16px;padding:14px 24px;border-radius:8px;">Open and sign</a>
          </p>
          <p style="margin:0 0 12px 0;color:#6B7280;font-size:14px;">If the button doesn't work, paste this link into your browser:<br>${vars.link}</p>
          <p style="margin:24px 0 0 0;color:#6B7280;font-size:14px;">— PAP ${vars.branchName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
