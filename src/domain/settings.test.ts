import { describe, expect, it } from "vitest";
import { businessFromForm, DEFAULT_SETTINGS, parseSettings, whatsappHref } from "./settings";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("parseSettings", () => {
  it("starts with nothing known and the 1.6 multiplier", () => {
    expect(DEFAULT_SETTINGS.business.legalName).toBeNull();
    expect(DEFAULT_SETTINGS.business.leadTimes).toEqual({});
    expect(DEFAULT_SETTINGS.pricing).toEqual({ markup: 1.6, rateOverride: null, roundTo: 1, minIls: null, vatRate: 0.18 });
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values and fills the rest", () => {
    const s = parseSettings({ business: { phone: "03-1234567" }, pricing: { markup: 1.45 } });
    expect(s.business.phone).toBe("03-1234567");
    expect(s.business.email).toBeNull();
    expect(s.pricing.markup).toBe(1.45);
    expect(s.pricing.roundTo).toBe(1);
  });

  it("falls back per section when a stored value is broken", () => {
    const s = parseSettings({ business: { phone: "03-1234567" }, pricing: { markup: 0 } });
    expect(s.pricing).toEqual(DEFAULT_SETTINGS.pricing);
    expect(s.business.phone).toBe("03-1234567");
  });

  it("has every Morning step on until the admin turns one off", () => {
    expect(DEFAULT_SETTINGS.morning).toEqual({ quote: true, deal: true, receipt: true, credit: true });
    expect(parseSettings({ morning: { deal: false } }).morning).toEqual({ quote: true, deal: false, receipt: true, credit: true });
    expect(parseSettings({ morning: { deal: "no" } }).morning).toEqual(DEFAULT_SETTINGS.morning);
  });

  it("turns empty text into null so the sentence stays hidden", () => {
    expect(parseSettings({ business: { legalName: "  " } }).business.legalName).toBeNull();
  });
});

describe("businessFromForm", () => {
  it("reads every field, blanks as null", () => {
    const r = businessFromForm(
      form({ legalName: "קוטס ישראל", email: "a@b.co", whatsapp: "050-123-4567", quoteLeadBusinessDays: "2", "lead.wcp.min": "10", "lead.wcp.max": "14", "lead.ctre.min": "" }),
      ["wcp", "ctre"],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.legalName).toBe("קוטס ישראל");
    expect(r.value.whatsapp).toBe("972501234567");
    expect(r.value.quoteLeadBusinessDays).toBe(2);
    expect(r.value.leadTimes).toEqual({ wcp: { minDays: 10, maxDays: 14 }, ctre: null });
    expect(r.value.phone).toBeNull();
  });

  it("names the fields that are wrong", () => {
    expect(businessFromForm(form({ email: "not-an-email" }), [])).toEqual({ ok: false, fields: ["email"] });
    expect(businessFromForm(form({ quoteValidDays: "abc" }), [])).toEqual({ ok: false, fields: ["quoteValidDays"] });
    expect(businessFromForm(form({ "lead.wcp.min": "20", "lead.wcp.max": "5" }), ["wcp"])).toEqual({ ok: false, fields: ["leadTimes"] });
  });
});

describe("whatsappHref", () => {
  it("is null without a number", () => {
    expect(whatsappHref(null)).toBeNull();
    expect(whatsappHref("972501234567", "שלום")).toBe("https://wa.me/972501234567?text=%D7%A9%D7%9C%D7%95%D7%9D");
  });
});

describe("content settings added in M6", () => {
  it("default to the text the site had, 14-day links and a 3-day reminder, and every admin getting email", () => {
    const c = DEFAULT_SETTINGS.content;
    expect(c.tagline).toBe("ציוד FRC ו-FTC מכל הספקים בהזמנה אחת, במחירים בשקלים לפי שער בנק ישראל");
    expect(c.home.mottoAccent).toBe("בהזמנה אחת");
    expect(c.home.why).toHaveLength(4);
    expect(c.emails).toEqual({ templates: {}, inviteDays: 14, reminderAfterDays: 3, adminsOff: [] });
    expect(c.pages.how).toBeNull();
    expect(c.pages.privacy).toBeNull();
    expect(c.pages.terms).toBeNull();
  });

  it("reads a settings row saved before they existed", () => {
    const s = parseSettings({ content: { searchExamples: ["a"], tagline: "אחר" } });
    expect(s.content.searchExamples).toEqual(["a"]);
    expect(s.content.tagline).toBe("אחר");
    expect(s.content.emails.inviteDays).toBe(14);
  });

  it("keeps a template and who is off, and refuses a join link of zero days", () => {
    const s = parseSettings({ content: { emails: { templates: { "quote_ready:team": { subject: "x", body: "" } }, adminsOff: ["u1"], inviteDays: 7 } } });
    expect(s.content.emails.templates["quote_ready:team"]).toEqual({ subject: "x", body: null });
    expect(s.content.emails.adminsOff).toEqual(["u1"]);
    expect(s.content.emails.inviteDays).toBe(7);
    expect(parseSettings({ content: { emails: { inviteDays: 0 } } }).content).toEqual(DEFAULT_SETTINGS.content);
  });
});
