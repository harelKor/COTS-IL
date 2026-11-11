import { emailConfig, type Recipient } from "@/domain/notifications";
import type { RenderedEmail } from "./email-templates";

/**
 * Sending, apart from the database so tests can pass a fake transport. Resend's REST API
 * (https://resend.com/docs/api-reference/emails/send-email) through fetch: no SDK needed.
 */

export type OutgoingEmail = RenderedEmail & { to: string };
export type Transport = (email: OutgoingEmail) => Promise<{ id: string }>;
export type SendResult = { recipient: Recipient; subject: string; ok: boolean; providerId: string | null; error: string | null };

/** Resend, when RESEND_API_KEY and EMAIL_FROM are both set; otherwise null and nothing is sent. */
export function resendTransport(env: Record<string, string | undefined> = process.env): Transport | null {
  const config = emailConfig(env);
  if (!config) return null;
  return async (email) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: config.from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok || !body.id) throw new Error(`Resend ${response.status}: ${body.message ?? "no id"}`);
    return { id: body.id };
  };
}

/**
 * Sends one email per recipient, one at a time (Resend's free plan allows 2 a second).
 * A failure is reported, never thrown: an email that can't go out must not fail the action.
 */
export async function deliver(
  recipients: Recipient[],
  render: (r: Recipient) => RenderedEmail,
  transport: Transport,
): Promise<SendResult[]> {
  const results: SendResult[] = [];
  for (const recipient of recipients) {
    let subject = "";
    try {
      const email = render(recipient);
      subject = email.subject;
      const { id } = await transport({ ...email, to: recipient.email });
      results.push({ recipient, subject, ok: true, providerId: id, error: null });
    } catch (error) {
      results.push({ recipient, subject, ok: false, providerId: null, error: error instanceof Error ? error.message.slice(0, 300) : String(error) });
    }
  }
  return results;
}
