import { describe, expect, it } from "vitest";
import { contactChannels, goLiveChecklist, hasContactDetails, suppliersWithoutLeadTime } from "./go-live";
import { businessSchema } from "./settings";

const empty = businessSchema.parse({});
const full = businessSchema.parse({
  legalName: "קוטס ישראל בע״מ",
  email: "hello@example.com",
  paymentTerms: "העברה בנקאית",
  leadTimes: { andymark: { minDays: 10, maxDays: 20 }, wcp: { minDays: 10, maxDays: 20 } },
});
const codes = ["andymark", "wcp"];

describe("contactChannels", () => {
  it("lists only the ways to write or call", () => {
    expect(contactChannels(empty)).toEqual([]);
    expect(contactChannels({ ...empty, email: "a@b.co", whatsapp: "972501234567" })).toEqual(["email", "whatsapp"]);
  });
  it("counts a pickup address as contact details but not as a channel", () => {
    const withAddress = { ...empty, pickupAddress: "רחוב 1" };
    expect(contactChannels(withAddress)).toEqual([]);
    expect(hasContactDetails(withAddress)).toBe(true);
    expect(hasContactDetails(empty)).toBe(false);
  });
});

describe("suppliersWithoutLeadTime", () => {
  it("names the suppliers with no lead time", () => {
    expect(suppliersWithoutLeadTime(full, ["andymark", "ctre"])).toEqual(["ctre"]);
  });
});

describe("goLiveChecklist", () => {
  it("lists everything missing on an empty site, each with a settings link", () => {
    const items = goLiveChecklist({ business: empty, supplierCodes: codes, emailOn: false });
    expect(items.map((i) => i.key)).toEqual(["contact", "legalName", "leadTimes", "paymentTerms", "email"]);
    for (const i of items) expect(i.href).toMatch(/^\/admin\/settings\//);
  });
  it("is empty when everything is filled in", () => {
    expect(goLiveChecklist({ business: full, supplierCodes: codes, emailOn: true })).toEqual([]);
  });
  it("drops an item once it is filled in", () => {
    const items = goLiveChecklist({ business: { ...empty, phone: "03-1234567" }, supplierCodes: codes, emailOn: true });
    expect(items.map((i) => i.key)).not.toContain("contact");
  });
  it("counts the suppliers that lack a lead time", () => {
    const items = goLiveChecklist({ business: full, supplierCodes: [...codes, "ctre"], emailOn: true });
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain("1");
  });
});
