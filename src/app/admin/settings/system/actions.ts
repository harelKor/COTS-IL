"use server";

import { renderTestEmail } from "@/lib/email-templates";
import { resendTransport } from "@/lib/email-transport";
import { requireAdmin } from "@/lib/auth";
import type { SettingsResult } from "../actions";

/** Sends the test email to the signed-in admin. */
export async function sendTestEmail(): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  const transport = resendTransport();
  if (!transport) return { ok: false, error: "המייל לא מוגדר: חסרים RESEND_API_KEY או EMAIL_FROM ב-Vercel" };
  try {
    await transport({ ...renderTestEmail(), to: viewer.email });
    return { ok: true, message: `נשלח אל ${viewer.email}` };
  } catch (error) {
    return { ok: false, error: `השליחה נכשלה: ${error instanceof Error ? error.message.slice(0, 200) : "שגיאה"}` };
  }
}
