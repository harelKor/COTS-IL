"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { templateKey, type EmailTemplate } from "@/domain/email-overrides";
import { emailAudiences, type Audience, type NotifyEvent } from "@/domain/notifications";
import { requireAdmin } from "@/lib/auth";
import { renderEmail, renderOptions } from "@/lib/email-templates";
import { resendTransport } from "@/lib/email-transport";
import { sampleFor } from "@/lib/email-samples";
import { getSettings } from "@/lib/settings";
import { currentSettings, updateContent } from "@/lib/settings-write";
import type { ContentResult } from "../content/actions";
import type { SettingsResult } from "../actions";

/**
 * מיילים (M6): the admin's subject and body for each email, how long a join link lasts, when the
 * reminder goes, and which admins get email. Each save checks the admin, writes audit_log through
 * updateContent and expires the `settings` cache.
 */

/** The (event, audience) pair a template key names, or null: only emails the site really sends. */
function parseKey(key: string): { event: NotifyEvent; audience: Audience } | null {
  for (const { event, audiences } of emailAudiences()) for (const audience of audiences) if (templateKey(event, audience) === key) return { event, audience };
  return null;
}

const blank = (v: string) => (v.trim() === "" ? null : v.replace(/\r\n?/g, "\n").trim());
const draft = z.object({ subject: z.string().max(200), body: z.string().max(3000) });

/** Saves one email's subject and body; both empty brings the built-in text back. */
export async function saveTemplate(key: string, subject: string, body: string): Promise<ContentResult> {
  const viewer = await requireAdmin();
  const target = parseKey(key);
  const parsed = draft.safeParse({ subject, body });
  if (!target || !parsed.success) return { ok: false, error: "לא תקין: נושא עד 200 תווים, גוף עד 3,000" };
  const template: EmailTemplate = { subject: blank(parsed.data.subject), body: blank(parsed.data.body) };
  const reset = !template.subject && !template.body;
  const r = await updateContent(viewer.id, "update_email_template", (content) => {
    const templates = { ...content.emails.templates };
    if (reset) delete templates[key];
    else templates[key] = template;
    return { emails: { ...content.emails, templates } };
  });
  if (!r.ok) return { ok: false, error: "לא תקין" };
  revalidatePath("/admin/settings/emails");
  return { ok: true, message: reset ? "המייל חזר לטקסט המקורי" : "המייל נשמר", before: r.before };
}

async function renderDraft(key: string, subject: string, body: string) {
  const target = parseKey(key);
  const parsed = draft.safeParse({ subject, body });
  const sample = target && sampleFor(target.event);
  if (!target || !parsed.success) return { ok: false as const, error: "לא תקין" };
  if (!sample) return { ok: false as const, error: "אין דוגמה למייל הזה, אז אי אפשר להציג אותו" };
  const settings = await getSettings();
  const options = { ...renderOptions(settings, target.event, target.audience), template: { subject: blank(parsed.data.subject), body: blank(parsed.data.body) } };
  return { ok: true as const, email: renderEmail(target.event, target.audience, sample as never, options) };
}

/** The email as it would look, filled with a sample order, for the editor's preview. */
export async function previewTemplate(key: string, subject: string, body: string): Promise<{ ok: true; subject: string; html: string } | { ok: false; error: string }> {
  await requireAdmin();
  const r = await renderDraft(key, subject, body);
  return r.ok ? { ok: true, subject: r.email.subject, html: r.email.html } : r;
}

/** Sends the draft, with a sample order's details, to the signed-in admin only. */
export async function sendTemplateTest(key: string, subject: string, body: string): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  const transport = resendTransport();
  if (!transport) return { ok: false, error: "המייל לא מוגדר: חסרים RESEND_API_KEY או EMAIL_FROM ב-Vercel" };
  const r = await renderDraft(key, subject, body);
  if (!r.ok) return r;
  try {
    await transport({ ...r.email, subject: `[בדיקה] ${r.email.subject}`, to: viewer.email });
    return { ok: true, message: `נשלח אל ${viewer.email}` };
  } catch (error) {
    return { ok: false, error: `השליחה נכשלה: ${error instanceof Error ? error.message.slice(0, 200) : "שגיאה"}` };
  }
}

const timings = z.object({ inviteDays: z.coerce.number().int().min(1).max(90), reminderAfterDays: z.coerce.number().int().min(1).max(30) });

/** How long a join link lasts and after how many days a quote gets its reminder. */
export async function saveTimings(_: SettingsResult | null, formData: FormData): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  const parsed = timings.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "תוקף הקישור: 1 עד 90 ימים. תזכורת: 1 עד 30 ימים" };
  const r = await updateContent(viewer.id, "update_email_timings", (content) => ({ emails: { ...content.emails, ...parsed.data } }));
  if (!r.ok) return { ok: false, error: "לא תקין" };
  revalidatePath("/", "layout");
  return { ok: true, message: "נשמר. קישורים שכבר נשלחו לא משתנים" };
}

/** Whether one admin gets the site's emails (new requests, decisions, the daily list). */
export async function setAdminEmails(userId: string, on: boolean): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  const [admin] = await db.select({ id: schema.profiles.id }).from(schema.profiles).where(eq(schema.profiles.id, userId));
  if (!admin) return { ok: false, error: "המנהל לא נמצא" };
  const r = await updateContent(viewer.id, "update_admin_emails", (content) => {
    const off = new Set(content.emails.adminsOff);
    if (on) off.delete(userId);
    else off.add(userId);
    return { emails: { ...content.emails, adminsOff: [...off] } };
  });
  if (!r.ok) return { ok: false, error: "לא תקין" };
  const admins = await db.select({ id: schema.profiles.id }).from(schema.profiles).where(eq(schema.profiles.isAdmin, true));
  const off = new Set((await currentSettings()).content.emails.adminsOff);
  const everyoneOff = admins.length > 0 && admins.every((a) => off.has(a.id));
  revalidatePath("/admin/settings/admins");
  return { ok: true, message: everyoneOff ? "נשמר. שימו לב: אף מנהל לא יקבל מיילים על בקשות חדשות" : on ? "המנהל יקבל מיילים" : "המנהל לא יקבל מיילים" };
}
