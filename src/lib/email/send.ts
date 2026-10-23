import "server-only";
import { log } from "@/lib/log";

// Outgoing email through Resend's HTTP API (no SDK). Off until RESEND_API_KEY
// and EMAIL_FROM are set; every caller checks emailConfigured() and degrades
// gracefully. Addresses and contents are never logged.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** One-click unsubscribe URL (RFC 8058) for non-essential mail. */
  unsubscribeUrl?: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(msg: EmailMessage, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!emailConfigured()) return false;
  const headers: Record<string, string> = {};
  if (msg.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${msg.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        headers,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) log.error("email.send_rejected", { status: response.status });
    return response.ok;
  } catch (error) {
    log.error("email.send_failed", { err: error });
    return false;
  }
}
