import { describe, expect, it } from "vitest";
import { CONTACT_US, CONTACT_US_IN_ORDER, DEFAULT_PAGES, INFO_PAGES, inlineFacts, parseInfoText, parseInline, resolveInfo, unknownTokens, writeUsHref } from "./info-text";

describe("info text", () => {
  it("parses bold, links and facts", () => {
    expect(parseInline("a **b** [c](/contact) {מכפיל}.")).toEqual([
      { t: "text", v: "a " },
      { t: "bold", v: "b" },
      { t: "text", v: " " },
      { t: "link", v: "c", href: "/contact" },
      { t: "text", v: " " },
      { t: "fact", name: "מכפיל", v: "" },
      { t: "text", v: "." },
    ]);
    // Only site paths and https links become links.
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ t: "text", v: "[x](javascript:alert(1))" }]);
  });

  it("splits intro, sections, paragraphs, lists and blocks", () => {
    const doc = parseInfoText("hi\n\n## A\none\ntwo\n\n- x\n- y\n{{איסוף}}\n## B\n");
    expect(doc.intro).toEqual([{ t: "p", inline: [{ t: "text", v: "hi" }] }]);
    expect(doc.sections[0].blocks.map((b) => b.t)).toEqual(["p", "list", "auto"]);
    expect(doc.sections[0].blocks[0]).toEqual({ t: "p", inline: [{ t: "text", v: "one two" }] });
    expect(doc.sections[1]).toEqual({ title: "B", blocks: [] });
  });

  it("hides what an empty fact leaves empty", () => {
    const doc = parseInfoText("## תשלום\n{תנאי תשלום}\n## משלוח\n{דמי טיפול}.\n\nטקסט{כולל}.\n{{איסוף}}");
    const r = resolveInfo(doc, { כולל: "" }, new Set());
    expect(r.sections.map((s) => s.title)).toEqual(["משלוח"]);
    expect(r.sections[0].blocks).toHaveLength(1);
    const full = resolveInfo(doc, { "תנאי תשלום": "העברה", "דמי טיפול": "₪30" }, new Set(["איסוף"]));
    expect(full.sections[0].blocks).toEqual([{ t: "p", inline: [{ t: "fact", name: "תנאי תשלום", v: "העברה" }] }]);
    expect(full.sections[1].blocks.map((b) => b.t)).toEqual(["p", "p", "auto"]);
  });

  it("flags unknown tokens and none in the built-in pages", () => {
    expect(unknownTokens("{מכפיל} {x} {{y}} {{איסוף}}")).toEqual(["x", "y"]);
    for (const p of INFO_PAGES) expect(unknownTokens(DEFAULT_PAGES[p.key])).toEqual([]);
  });
});

describe("banner", () => {
  it("shows while on, with text, until its last day", async () => {
    const { bannerShows } = await import("./content");
    const b = { enabled: true, text: "חג שמח", endsOn: "2026-11-20" };
    expect(bannerShows(b, "2026-11-20")).toBe(true);
    expect(bannerShows(b, "2026-11-21")).toBe(false);
    expect(bannerShows({ ...b, endsOn: null }, "2030-01-01")).toBe(true);
    expect(bannerShows({ ...b, enabled: false }, "2026-11-01")).toBe(false);
    expect(bannerShows({ ...b, text: "" }, "2026-11-01")).toBe(false);
  });
});

describe("vendor and contact tokens", () => {
  const business = { priceIncludes: null, quoteLeadBusinessDays: null, handlingFee: null, paymentTerms: null, returnPolicy: null };
  const names = ["AndyMark", "WCP", "goBILDA", "REV", "CTRE", "The Thrifty Bot", "Other"];

  it("lists every vendor from the DB in the default pages", () => {
    const facts = inlineFacts(business, "1.6", { vendorNames: names, hasContact: false });
    for (const key of ["faq", "about"] as const) {
      const doc = resolveInfo(parseInfoText(DEFAULT_PAGES[key]), facts, new Set());
      const text = JSON.stringify(doc);
      for (const n of names) expect(text).toContain(n);
    }
  });

  it("only says \"write to us\" with a /contact page behind it when there is a way to write", () => {
    const withChannel = inlineFacts(business, "1.6", { vendorNames: names, hasContact: true });
    const without = inlineFacts(business, "1.6", { vendorNames: names, hasContact: false });
    expect(writeUsHref(withChannel["כתבו לנו"])).toBe("/contact");
    expect(writeUsHref(without["כתבו לנו"])).toBe("/orders");
  });

  it("has no hard-coded vendor names or contact links left in the default pages", () => {
    for (const key of INFO_PAGES.map((p) => p.key)) {
      expect(DEFAULT_PAGES[key]).not.toMatch(/AndyMark|WCP|CTRE|Thrifty|\(\/contact\)/);
    }
  });
});

describe("steps and the pages that moved here (M6)", () => {
  const base = { priceIncludes: null, quoteLeadBusinessDays: null, handlingFee: null, paymentTerms: null, returnPolicy: null };

  it("reads numbered bold-title lines as one steps block", () => {
    const doc = parseInfoText("intro\n\n1. **אחד** טקסט א\n2. **שניים** טקסט **ב**\n\n## כותרת\ntext");
    expect(doc.intro.map((b) => b.t)).toEqual(["p", "steps"]);
    const steps = doc.intro[1];
    expect(steps.t === "steps" && steps.items.map((s) => s.title)).toEqual(["אחד", "שניים"]);
    expect(doc.sections[0].blocks.map((b) => b.t)).toEqual(["p"]);
  });

  it("keeps how-it-works as four steps and the sections it had", () => {
    const doc = parseInfoText(DEFAULT_PAGES.how);
    const steps = doc.intro.find((b) => b.t === "steps");
    expect(steps?.t === "steps" && steps.items.map((s) => s.title)).toEqual(["בונים סל", "שולחים בקשה", "מאשרים הצעה", "מקבלים"]);
    expect(doc.sections.map((s) => s.title)).toEqual(["מה הקבוצה עושה", "מה הספק הישראלי עושה", "איפה רואים מה קורה"]);
  });

  it("shows the business days only when they are set", () => {
    const site = { vendorNames: ["A"], hasContact: true };
    expect(inlineFacts(base, "1.6", site)["תוך ימי עסקים"]).toBe("");
    expect(inlineFacts({ ...base, quoteLeadBusinessDays: 2 }, "1.6", site)["תוך ימי עסקים"]).toBe(" תוך 2 ימי עסקים");
  });

  it("says where to write when there is no way to reach the business", () => {
    expect(inlineFacts(base, "1.6", { vendorNames: [], hasContact: true })["צרו קשר"]).toBe(CONTACT_US);
    expect(inlineFacts(base, "1.6", { vendorNames: [], hasContact: false })["צרו קשר"]).toBe(CONTACT_US_IN_ORDER);
  });

  it("drops the terms page's payment section until payment terms are set", () => {
    const doc = parseInfoText(DEFAULT_PAGES.terms);
    expect(resolveInfo(doc, { "תנאי תשלום": "" }, new Set()).sections.map((s) => s.title)).toEqual(["מחירים והצעות", "חשבון הקבוצה", "זמינות ואספקה"]);
    expect(resolveInfo(doc, { "תנאי תשלום": "העברה" }, new Set()).sections.at(-1)?.title).toBe("תשלום");
  });
});
