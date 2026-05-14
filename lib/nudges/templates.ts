/**
 * Nudge email templates — one per stage. Each follows the same shape as
 * the existing invite/completion templates: subject + plain text + simple
 * HTML. Recipients are addressed in the second person so a single template
 * works for whoever the stage targets.
 */
import type { NudgeStage } from "@/lib/nudges/stages";

export interface NudgeEmailVars {
  applicantName: string;
  branchName: string;
  link?: string;
}

interface Template {
  subject(vars: NudgeEmailVars): string;
  text(vars: NudgeEmailVars): string;
  html(vars: NudgeEmailVars): string;
}

const wrap = (body: string): string =>
  `<!doctype html><html><body style="font-family: system-ui, sans-serif; color: #1f2937;">${body}</body></html>`;

const cta = (link?: string): string =>
  link
    ? `<p style="margin: 24px 0;"><a href="${link}" style="background:#EF3340;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Open</a></p>`
    : "";

export const NUDGE_TEMPLATES: Record<NudgeStage, Template> = {
  applicant_link_unopened: {
    subject: (v) => `Reminder — your PAP ${v.branchName} invite is waiting`,
    text: (v) =>
      `Hi ${v.applicantName},\n\nYou were invited to join PAP ${v.branchName} but haven't opened your application link yet. Tap it any time before it expires.\n\n${v.link ?? ""}\n\nKampong Glam Branch`,
    html: (v) =>
      wrap(
        `<p>Hi ${v.applicantName},</p><p>You were invited to join PAP ${v.branchName} but haven't opened your application link yet. Tap it any time before it expires.</p>${cta(v.link)}<p>PAP ${v.branchName}</p>`,
      ),
  },
  applicant_form_in_draft: {
    subject: (v) => `Pick up where you left off — your PAP ${v.branchName} application`,
    text: (v) =>
      `Hi ${v.applicantName},\n\nYou've started your application but haven't submitted it yet. Open your link to finish.\n\n${v.link ?? ""}\n\nPAP ${v.branchName}`,
    html: (v) =>
      wrap(
        `<p>Hi ${v.applicantName},</p><p>You've started your application but haven't submitted it yet. Open your link to finish.</p>${cta(v.link)}<p>PAP ${v.branchName}</p>`,
      ),
  },
  referral_unsigned: {
    subject: (v) => `Reminder — please sign for ${v.applicantName}`,
    text: (v) =>
      `Hi,\n\nYou agreed to refer ${v.applicantName} for PAP ${v.branchName} membership. Your signature is the last thing standing between them and the Branch Chairman.\n\n${v.link ?? ""}\n\nPAP ${v.branchName}`,
    html: (v) =>
      wrap(
        `<p>Hi,</p><p>You agreed to refer <strong>${v.applicantName}</strong> for PAP ${v.branchName} membership. Your signature is the last thing standing between them and the Branch Chairman.</p>${cta(v.link)}<p>PAP ${v.branchName}</p>`,
      ),
  },
  chairman_unsigned: {
    subject: (v) => `Application pending your signature — ${v.applicantName}`,
    text: (v) =>
      `Hi,\n\nAn application for ${v.applicantName} is waiting for your signature on the PAP ${v.branchName} dashboard.\n\nPAP ${v.branchName}`,
    html: (v) =>
      wrap(
        `<p>Hi,</p><p>An application for <strong>${v.applicantName}</strong> is waiting for your signature on the PAP ${v.branchName} dashboard.</p><p>PAP ${v.branchName}</p>`,
      ),
  },
  ready_to_send_unactioned: {
    subject: (v) => `Ready to send to HQ — ${v.applicantName}`,
    text: (v) =>
      `Hi,\n\n${v.applicantName}'s application has been signed off by the Chairman and is sitting in Ready to Send. Pick recipients and send when you're ready.\n\nPAP ${v.branchName}`,
    html: (v) =>
      wrap(
        `<p>Hi,</p><p><strong>${v.applicantName}</strong>'s application has been signed off by the Chairman and is sitting in Ready to Send. Pick recipients and send when you're ready.</p><p>PAP ${v.branchName}</p>`,
      ),
  },
  at_hq_stalled: {
    subject: (v) => `Still waiting on HQ — ${v.applicantName}`,
    text: (v) =>
      `Hi,\n\nIt's been a while since ${v.applicantName}'s application was sent to HQ. Once they reply, record the outcome on the application page.\n\nPAP ${v.branchName}`,
    html: (v) =>
      wrap(
        `<p>Hi,</p><p>It's been a while since <strong>${v.applicantName}</strong>'s application was sent to HQ. Once they reply, record the outcome on the application page.</p><p>PAP ${v.branchName}</p>`,
      ),
  },
};
