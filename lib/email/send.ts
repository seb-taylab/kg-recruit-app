/**
 * Resend wrapper. All system emails go through here so we can swap ESPs
 * later without touching callers.
 *
 * PRD §1B: domain `kg.taylab.com`, sender `noreply@kg.taylab.com`,
 * verified SPF/DKIM/DMARC. From-display name resolves from branch override
 * if set, else the platform default in `.env.local`.
 */
import "server-only";
import { Resend } from "resend";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  fromDisplayName?: string | null;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

let cachedClient: Resend | null = null;
function client(): Resend {
  if (cachedClient) return cachedClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set.");
  cachedClient = new Resend(key);
  return cachedClient;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "noreply@kg.taylab.com";
  const fromName = params.fromDisplayName?.trim()
    || process.env.EMAIL_FROM_NAME
    || "PAP Kampong Glam Branch";
  const from = `${fromName} <${fromAddress}>`;

  try {
    const { data, error } = await client().emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown send error" };
  }
}
