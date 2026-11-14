import { describe, expect, it } from "vitest";
import { contactButtons, FOOTER_COLUMNS, INFO_LINKS, mapHref } from "./site-nav";

const empty = { email: null, phone: null, whatsapp: null, pickupAddress: null };

describe("site nav", () => {
  it("lists every info page once", () => {
    const hrefs = INFO_LINKS.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toContain("/contact");
    expect(hrefs).toContain("/terms");
  });

  it("points the footer only at pages that exist", () => {
    const known = new Set<string>(["/catalog", "/#vendors", ...INFO_LINKS.map((l) => l.href)]);
    for (const c of FOOTER_COLUMNS) for (const l of c.links) expect(known.has(l.href)).toBe(true);
    expect(FOOTER_COLUMNS.map((c) => c.title)).toEqual(["קנייה", "עזרה", "העסק"]);
  });

  it("makes no contact button for an empty field", () => {
    expect(contactButtons(empty)).toEqual([]);
    expect(contactButtons({ ...empty, pickupAddress: "הרצל 1, חיפה" }).map((b) => b.key)).toEqual(["address"]);
  });

  it("builds the buttons in order with real links", () => {
    const b = contactButtons({ email: "a@b.co", phone: "04-123 4567", whatsapp: "972501234567", pickupAddress: "הרצל 1, חיפה" });
    expect(b.map((x) => x.key)).toEqual(["whatsapp", "email", "phone", "address"]);
    expect(b[0].href).toBe("https://wa.me/972501234567");
    expect(b[1].href).toBe("mailto:a@b.co");
    expect(b[2].href).toBe("tel:041234567");
    expect(b[3].href).toBe(mapHref("הרצל 1, חיפה"));
    expect(b[3].href.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
  });
});
