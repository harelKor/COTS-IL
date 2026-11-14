import { z } from "zod";
import { DEFAULT_CATEGORY_GROUPS } from "./category-groups";
import { DEFAULT_SEARCH_EXAMPLES } from "./content";
import { DEFAULT_PAGES, INFO_PAGES } from "./info-text";
import { REMINDER_AFTER_DAYS } from "./notifications";
import { DEFAULT_MARKUP } from "./pricing";
import { DEFAULT_HOME, DEFAULT_TAGLINE, WHY_CARD_COUNT } from "./site-text";
import { INVITE_DAYS } from "./teams";

/**
 * The admin's settings (S16), stored as one JSON row in `site_settings` and read
 * through getSettings() (src/lib/settings.ts). A value stays null until the
 * business supplies it, and the UI hides the sentence that needs it: never show
 * a placeholder instead.
 */

export type LeadTime = { minDays: number; maxDays: number };

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s ? s : null));

const leadTime = z
  .object({ minDays: z.number().int().min(0).max(365), maxDays: z.number().int().min(0).max(365) })
  .refine((l) => l.maxDays >= l.minDays, "המקסימום קטן מהמינימום");

export const businessSchema = z.object({
  /** Business days from a request to its quote, e.g. 2. Shown after sending: "הצעת מחיר תוך N ימי עסקים". */
  quoteLeadBusinessDays: z.number().int().min(1).max(60).nullable().default(null),
  /** Registered business name, e.g. "קוטס ישראל בע״מ". */
  legalName: text(120).default(null),
  /** ח.פ. or עוסק מורשה number. */
  companyNumber: text(20).default(null),
  email: z.email().nullable().default(null).catch(null),
  /** Shown as written, e.g. "03-1234567". */
  phone: text(30).default(null),
  /** International digits only, e.g. "972501234567" (used in https://wa.me/<number>). */
  whatsapp: z
    .string()
    .regex(/^\d{8,15}$/)
    .nullable()
    .default(null),
  pickupAddress: text(200).default(null),
  /** e.g. "א׳–ה׳ 16:00–19:00". */
  pickupHours: text(100).default(null),
  /** A sentence about the handling fee, e.g. "דמי טיפול של ₪ 30 להזמנה". */
  handlingFee: text(200).default(null),
  /** What the ₪ catalog price covers, as one short phrase, e.g. "משלוח מארה״ב ומכס". */
  priceIncludes: text(200).default(null),
  /** Typical days from an approved quote to delivery in Israel, per supplier code. */
  leadTimes: z.record(z.string(), leadTime.nullable()).default({}),
  /** A short summary of the return policy. */
  returnPolicy: text(1000).default(null),
  /** Days a sent quote holds, e.g. 14. Shown as "ההצעה בתוקף עד <date>" on the quote. */
  quoteValidDays: z.number().int().min(1).max(365).nullable().default(null),
  /** e.g. "העברה בנקאית או הזמנת רכש של בית הספר, תוך 30 יום". */
  paymentTerms: text(300).default(null),
  /** M4: whether a new team still waiting for approval may already send requests (read in saveBusiness, src/app/admin/settings/actions.ts). */
  pendingTeamsMaySend: z.boolean().default(true),
});
export type Business = z.infer<typeof businessSchema>;

/** Rounding steps the admin can pick: whole shekels, or the nearest 5 or 10. */
export const ROUND_STEPS = [1, 5, 10] as const;

export const pricingSettingsSchema = z.object({
  /** The global multiplier: ILS = USD × rate × markup (1.6 until the admin changes it). */
  markup: z.number().min(1).max(5).default(DEFAULT_MARKUP),
  /** A manual USD→ILS rate that replaces the Bank of Israel rate until cleared. */
  rateOverride: z
    .object({ rate: z.number().min(1).max(10), setAt: z.string() })
    .nullable()
    .default(null),
  roundTo: z.union(ROUND_STEPS.map((n) => z.literal(n))).default(1),
  /** No catalog price goes below this many shekels; null for none. */
  minIls: z.number().int().min(1).max(10000).nullable().default(null),
});
export type PricingSettings = z.infer<typeof pricingSettingsSchema>;


export const bannerSchema = z.object({
  enabled: z.boolean().default(false),
  text: z.string().trim().max(200).default(""),
  /** A site path ("/v/wcp") or an https link; null for none. */
  href: z
    .string()
    .trim()
    .max(300)
    .regex(/^(\/[^\s]*|https:\/\/[^\s]+)$/)
    .nullable()
    .default(null),
  /** The last day it shows (Israel time), YYYY-MM-DD; null for no end. */
  endsOn: z.iso.date().nullable().default(null),
});
export type Banner = z.infer<typeof bannerSchema>;

const pagesShape = Object.fromEntries(INFO_PAGES.map((p) => [p.key, z.string().max(20000).nullable().default(null)])) as Record<
  (typeof INFO_PAGES)[number]["key"],
  z.ZodDefault<z.ZodNullable<z.ZodString>>
>;

// M6: the site's own words (tagline, home page), and the emails (templates, timings, who gets them).
export const homeSchema = z.object({
  mottoLine: z.string().trim().min(1).max(80).default(DEFAULT_HOME.mottoLine),
  mottoAccent: z.string().trim().min(1).max(40).default(DEFAULT_HOME.mottoAccent),
  sub: z.string().trim().min(1).max(200).default(DEFAULT_HOME.sub),
  whyHeading: z.string().trim().min(1).max(80).default(DEFAULT_HOME.whyHeading),
  why: z
    .array(z.object({ title: z.string().trim().min(1).max(60), text: z.string().trim().min(1).max(300) }))
    .length(WHY_CARD_COUNT)
    .default(() => DEFAULT_HOME.why.map((c) => ({ ...c }))),
});

const emailTemplateSchema = z.object({ subject: text(200).default(null), body: text(3000).default(null) });

export const emailsSchema = z.object({
  /** Subject and body overrides per event and audience, keyed "<event>:<audience>" (templateKey); none means the built-in text. */
  templates: z.record(z.string(), emailTemplateSchema).default({}),
  /** Days a join link lasts. */
  inviteDays: z.number().int().min(1).max(90).default(INVITE_DAYS),
  /** Days a quote waits for the team before its one reminder. */
  reminderAfterDays: z.number().int().min(1).max(30).default(REMINDER_AFTER_DAYS),
  /** Admins (profile ids) who get no email from the site; every other admin gets everything. */
  adminsOff: z.array(z.string()).max(100).default([]),
});
export type EmailsSettings = z.infer<typeof emailsSchema>;

export const contentSchema = z.object({
  /** The catalog's groups in order; each category points at one by id (categories.group_id). */
  categoryGroups: z
    .array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,30}$/), name: z.string().trim().min(1).max(40) }))
    .min(1)
    .max(12)
    .default(() => DEFAULT_CATEGORY_GROUPS.map(({ id, name }) => ({ id, name }))),
  searchExamples: z.array(z.string().trim().min(1).max(40)).max(8).default(() => [...DEFAULT_SEARCH_EXAMPLES]),
  banner: bannerSchema.default(() => bannerSchema.parse({})),
  /** Each info page's text; null shows the built-in text (DEFAULT_PAGES). */
  pages: z.object(pagesShape).default(() => z.object(pagesShape).parse({})),
  /** One line about the site (page description, app manifest, share card, email footer). */
  tagline: z.string().trim().min(1).max(160).default(DEFAULT_TAGLINE),
  home: homeSchema.default(() => homeSchema.parse({})),
  emails: emailsSchema.default(() => emailsSchema.parse({})),
});
export type Content = z.infer<typeof contentSchema>;

export const settingsSchema = z.object({
  business: businessSchema.default(() => businessSchema.parse({})),
  pricing: pricingSettingsSchema.default(() => pricingSettingsSchema.parse({})),
  content: contentSchema.default(() => contentSchema.parse({})),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

/**
 * The stored row, checked. A section that fails the schema (a bad hand edit) falls
 * back to its defaults instead of breaking every page.
 */
export function parseSettings(data: unknown): Settings {
  const raw = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const business = businessSchema.safeParse(raw.business ?? {});
  const pricing = pricingSettingsSchema.safeParse(raw.pricing ?? {});
  const content = contentSchema.safeParse(raw.content ?? {});
  return {
    business: business.success ? business.data : DEFAULT_SETTINGS.business,
    pricing: pricing.success ? pricing.data : DEFAULT_SETTINGS.pricing,
    content: content.success ? content.data : DEFAULT_SETTINGS.content,
  };
}

/** The page text the site shows: the admin's, or the built-in one. */
export function pageText(content: Content, key: (typeof INFO_PAGES)[number]["key"]): string {
  return content.pages[key] ?? DEFAULT_PAGES[key];
}

/** The WhatsApp chat link, or null while there's no number. */
export function whatsappHref(whatsapp: string | null, text?: string) {
  if (!whatsapp) return null;
  return `https://wa.me/${whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

const blank = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
const int = (v: FormDataEntryValue | null) => {
  const s = blank(v);
  return s === null ? null : Number(s);
};

/** The פרטי העסק form to a Business, or the fields that failed. Lead times come as lead.<code>.min / .max. */
export function businessFromForm(form: FormData, supplierCodes: string[]): { ok: true; value: Business } | { ok: false; fields: string[] } {
  const leadTimes: Record<string, LeadTime | null> = {};
  for (const code of supplierCodes) {
    const min = int(form.get(`lead.${code}.min`));
    const max = int(form.get(`lead.${code}.max`));
    leadTimes[code] = min === null && max === null ? null : ({ minDays: min ?? max!, maxDays: max ?? min! } as LeadTime);
  }
  const phoneDigits = blank(form.get("whatsapp"))?.replace(/\D/g, "") ?? null;
  const parsed = businessSchema.safeParse({
    quoteLeadBusinessDays: int(form.get("quoteLeadBusinessDays")),
    legalName: blank(form.get("legalName")),
    companyNumber: blank(form.get("companyNumber")),
    email: blank(form.get("email")),
    phone: blank(form.get("phone")),
    whatsapp: phoneDigits ? phoneDigits.replace(/^0/, "972") : null,
    pickupAddress: blank(form.get("pickupAddress")),
    pickupHours: blank(form.get("pickupHours")),
    handlingFee: blank(form.get("handlingFee")),
    priceIncludes: blank(form.get("priceIncludes")),
    leadTimes,
    returnPolicy: blank(form.get("returnPolicy")),
    quoteValidDays: int(form.get("quoteValidDays")),
    paymentTerms: blank(form.get("paymentTerms")),
  });
  if (!parsed.success) return { ok: false, fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] };
  // .catch(null) on email would hide a typo: check it on its own.
  const email = blank(form.get("email"));
  if (email && parsed.data.email === null) return { ok: false, fields: ["email"] };
  return { ok: true, value: parsed.data };
}
