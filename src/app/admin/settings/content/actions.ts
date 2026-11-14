"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { bannerSchema, contentSchema, homeSchema, type Content } from "@/domain/settings";
import { DEFAULT_HOME, DEFAULT_TAGLINE, HOME_TOKENS, unknownNames } from "@/domain/site-text";
import { INFO_PAGES, type InfoPageKey } from "@/domain/info-text";
import { requireAdmin } from "@/lib/auth";
import { currentSettings, writeSettings } from "@/lib/settings-write";

/**
 * תוכן האתר (S16d): search examples, the banner and the info pages' text, all in
 * site_settings.content. Each save writes audit_log, expires `settings` (every page reads
 * it from cache) and returns what it replaced, for the Undo toast.
 */

export type ContentResult = { ok: true; message: string; before: Partial<Content> } | { ok: false; error: string };

async function save(action: string, part: Partial<Content>, message: string): Promise<ContentResult> {
  const viewer = await requireAdmin();
  const settings = await currentSettings();
  const content = contentSchema.safeParse({ ...settings.content, ...part });
  if (!content.success) return { ok: false, error: "לא תקין" };
  const before = Object.fromEntries(Object.keys(part).map((k) => [k, settings.content[k as keyof Content]])) as Partial<Content>;
  await writeSettings(viewer.id, action, settings, { ...settings, content: content.data });
  revalidatePath("/", "layout");
  return { ok: true, message, before };
}

/** One example per line, up to 8. */
export async function saveExamples(formData: FormData): Promise<ContentResult> {
  const lines = String(formData.get("examples") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 8 || lines.some((l) => l.length > 40)) return { ok: false, error: "עד 8 דוגמאות, עד 40 תווים כל אחת" };
  return save("update_search_examples", { searchExamples: [...new Set(lines)] }, "הדוגמאות נשמרו");
}

export async function saveBanner(formData: FormData): Promise<ContentResult> {
  const blank = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const parsed = bannerSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    text: String(formData.get("text") ?? ""),
    href: blank("href"),
    endsOn: blank("endsOn"),
  });
  if (!parsed.success) return { ok: false, error: "לא תקין: טקסט עד 200 תווים, קישור שמתחיל ב-/ או ב-https://" };
  if (parsed.data.enabled && !parsed.data.text) return { ok: false, error: "כדי להציג הודעה צריך טקסט" };
  return save("update_banner", { banner: parsed.data }, parsed.data.enabled ? "ההודעה מוצגת" : "ההודעה נשמרה, כבויה");
}

const pageKey = z.enum(INFO_PAGES.map((p) => p.key) as [InfoPageKey, ...InfoPageKey[]]);

/** An info page's text; null brings the built-in text back. */
export async function savePage(key: InfoPageKey, text: string | null): Promise<ContentResult> {
  const k = pageKey.safeParse(key);
  if (!k.success) return { ok: false, error: "עמוד לא מוכר" };
  if (text !== null && text.length > 20000) return { ok: false, error: "הטקסט ארוך מדי" };
  const settings = await currentSettings();
  const title = INFO_PAGES.find((p) => p.key === k.data)!.title;
  return save(
    "update_page",
    { pages: { ...settings.content.pages, [k.data]: text === null || !text.trim() ? null : text.replace(/\r\n?/g, "\n") } },
    text === null ? `״${title}״ חזר לטקסט המקורי` : `״${title}״ נשמר`,
  );
}

/** The one-line description of the site; empty brings the built-in line back. */
export async function saveTagline(formData: FormData): Promise<ContentResult> {
  const tagline = String(formData.get("tagline") ?? "").replace(/\s+/g, " ").trim();
  if (tagline.length > 160) return { ok: false, error: "עד 160 תווים" };
  return save("update_tagline", { tagline: tagline || DEFAULT_TAGLINE }, tagline ? "התיאור נשמר" : "התיאור חזר לטקסט המקורי");
}

/** The home page's motto, sub-line and four cards; `reset` brings the built-in words back. */
export async function saveHome(formData: FormData, reset = false): Promise<ContentResult> {
  const field = (k: string) => String(formData.get(k) ?? "").replace(/\s+/g, " ").trim();
  const input = reset
    ? DEFAULT_HOME
    : {
        mottoLine: field("mottoLine"),
        mottoAccent: field("mottoAccent"),
        sub: field("sub"),
        whyHeading: field("whyHeading"),
        why: DEFAULT_HOME.why.map((_, i) => ({ title: field(`why${i}title`), text: field(`why${i}text`) })),
      };
  const parsed = homeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "כל שדה צריך טקסט: כותרות עד 60 תווים, טקסט בכרטיס עד 300, שורת הסיסמה עד 80" };
  const unknown = unknownNames(parsed.data.why.map((c) => c.text).join(" "), Object.keys(HOME_TOKENS));
  if (unknown.length > 0) return { ok: false, error: `לא מוכר: ${unknown.map((u) => `{${u}}`).join(", ")}` };
  return save("update_home", { home: parsed.data }, reset ? "דף הבית חזר לטקסט המקורי" : "טקסט דף הבית נשמר");
}

/** Undo: puts back what a save replaced. */
export async function restoreContent(part: Partial<Content>): Promise<ContentResult> {
  return save("restore_content", part, "בוטל");
}
