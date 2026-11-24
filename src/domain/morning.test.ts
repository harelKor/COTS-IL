import { describe, expect, it } from "vitest";
import {
  billingParty,
  clientSuggestions,
  creditPayload,
  creditRemaining,
  deleteBlockedByDocuments,
  docRef,
  findByRef,
  incomeTotal,
  moveBlockedByDocuments,
  morningErrorText,
  morningSetup,
  nameWords,
  newClientBody,
  parseBilling,
  validIsraeliTaxId,
  parseCheque,
  quoteIncome,
  quotePayload,
  receiptPayload,
  remarksFor,
  type IssuedDoc,
  type TeamBilling,
} from "./morning";

const ID = "1a2b3c4d-5e6f-7a8b-9c0d-112233445566";

describe("morningSetup", () => {
  it("is off with no keys, so every Morning control stays hidden", () => {
    expect(morningSetup({})).toEqual({ state: "off" });
    expect(morningSetup({ MORNING_ENV: "production" })).toEqual({ state: "off" });
  });
  it("says what is missing when half set up", () => {
    expect(morningSetup({ MORNING_API_ID: "a" })).toEqual({ state: "invalid", reason: "חסר MORNING_API_SECRET" });
    expect(morningSetup({ MORNING_API_ID: "a", MORNING_API_SECRET: "b" }).state).toBe("invalid");
    expect(morningSetup({ MORNING_API_ID: "a", MORNING_API_SECRET: "b", MORNING_ENV: "live" }).state).toBe("invalid");
  });
  it("points the sandbox and production at their own hosts", () => {
    const s = morningSetup({ MORNING_API_ID: "a", MORNING_API_SECRET: "b", MORNING_ENV: "sandbox" });
    expect(s).toMatchObject({ state: "on", config: { env: "sandbox", apiBase: "https://sandbox.d.greeninvoice.co.il/api/v1", tokenUrl: "https://api.sandbox.morning.dev/idp/v1/oauth/token" } });
    const p = morningSetup({ MORNING_API_ID: "a", MORNING_API_SECRET: "b", MORNING_ENV: "production" });
    expect(p).toMatchObject({ state: "on", config: { env: "production", apiBase: "https://api.greeninvoice.co.il/api/v1", tokenUrl: "https://api.morning.co/idp/v1/oauth/token" } });
  });
});

describe("references", () => {
  it("makes a short reference from the row id and finds it in remarks", () => {
    expect(docRef(ID)).toBe("BH-1A2B3C4D5E6F");
    const remarks = remarksFor(1042, docRef(ID));
    expect(remarks).toBe("BLUEHUB, הזמנה 1042. סימוכין BH-1A2B3C4D5E6F");
    expect(remarksFor(null, "BH-X")).toBe("BLUEHUB. סימוכין BH-X");
    expect(findByRef([{ remarks: remarksFor(7, "BH-X", "TX 1") }], "BH-X")).not.toBeNull();
    expect(findByRef([{ id: "1", remarks: "other" }, { id: "2", remarks }], docRef(ID))?.id).toBe("2");
    expect(findByRef([{ id: "1", remarks: null }], docRef(ID))).toBeNull();
  });
});

const lines = [
  { title: "20T Gear", options: [{ name: "Bore", value: '1/2" Hex' }], supplierSku: "am-1234", qty: 2, unitPriceIls: 118 },
  { title: "Dropped line", options: [], supplierSku: null, qty: 0, unitPriceIls: 50 },
  { title: "Bearing", options: [], supplierSku: null, qty: 3, unitPriceIls: 12.5 },
];

describe("quote documents", () => {
  it("copies the quote snapshot's lines, VAT included, then shipping", () => {
    const rows = quoteIncome(lines, 59);
    expect(rows).toEqual([
      { catalogNum: "am-1234", description: '20T Gear (Bore: 1/2" Hex)', quantity: 2, price: 118, currency: "ILS", vatType: 1 },
      { description: "Bearing", quantity: 3, price: 12.5, currency: "ILS", vatType: 1 },
      { description: "משלוח", quantity: 1, price: 59, currency: "ILS", vatType: 1 },
    ]);
    expect(incomeTotal(rows)).toBe(332.5);
    expect(quoteIncome(lines, 0)).toHaveLength(2);
  });
  it("builds a הצעת מחיר and a חשבון עסקה with the order and reference", () => {
    const q = quotePayload({ kind: "quote", orderNumber: 1042, ref: "BH-1", lines, shippingIls: 59 });
    expect(q.amount).toBe(332.5);
    expect(q.payload).toMatchObject({ type: 10, lang: "he", currency: "ILS", vatType: 0, description: "הזמנה 1042", remarks: "BLUEHUB, הזמנה 1042. סימוכין BH-1" });
    expect(q.payload.payment).toBeUndefined();
    expect(quotePayload({ kind: "deal", orderNumber: 1042, ref: "BH-1", lines, shippingIls: 0 }).payload.type).toBe(300);
  });
  it("clips long titles", () => {
    const [row] = quoteIncome([{ title: "x".repeat(400), options: [], supplierSku: null, qty: 1, unitPriceIls: 1 }], 0);
    expect(row.description).toHaveLength(250);
  });
});

describe("receipts", () => {
  const deal = { morningId: "deal-1", income: quoteIncome(lines, 59) };
  const base = { orderNumber: 1042, ref: "BH-2", paidAt: "2026-11-24", reference: "TX-9", cheque: null, deal };

  it("repeats the deal's lines for a payment of its total, linked so the deal closes", () => {
    const r = receiptPayload({ ...base, amount: 332.5, method: "transfer" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.amount).toBe(332.5);
    expect(r.payload).toMatchObject({ type: 320, linkedDocumentIds: ["deal-1"], linkType: "link", income: deal.income, remarks: "BLUEHUB, הזמנה 1042, אסמכתא TX-9. סימוכין BH-2" });
    expect(r.payload.payment).toEqual([{ date: "2026-11-24", type: 4, price: 332.5, currency: "ILS", transactionId: "TX-9" }]);
  });
  it("is one line for a part payment, or for a payment on account", () => {
    const r = receiptPayload({ ...base, amount: 100, method: "cash", reference: null });
    expect(r.ok && r.payload.income).toEqual([{ description: "תשלום עבור הזמנה 1042", quantity: 1, price: 100, currency: "ILS", vatType: 1 }]);
    expect(r.ok && r.payload.payment?.[0]).toEqual({ date: "2026-11-24", type: 1, price: 100, currency: "ILS" });
    const onAccount = receiptPayload({ ...base, orderNumber: null, deal: null, amount: 50, method: "card" });
    expect(onAccount.ok && onAccount.payload).toMatchObject({ description: "תשלום על חשבון", remarks: "BLUEHUB, אסמכתא TX-9. סימוכין BH-2" });
    expect(onAccount.ok && onAccount.payload.linkedDocumentIds).toBeUndefined();
  });
  it("needs a cheque's bank details, and leaves 'other' to the admin", () => {
    expect(receiptPayload({ ...base, amount: 100, method: "cheque" })).toEqual({ ok: false, error: "לחשבונית על צ׳ק צריך בנק, סניף וחשבון" });
    const cheque = parseCheque({ bankName: " 12 ", bankBranch: "600", bankAccount: "11111" });
    expect(cheque).toEqual({ bankName: "12", bankBranch: "600", bankAccount: "11111" });
    expect(parseCheque({ bankName: "12" })).toBeNull();
    const r = receiptPayload({ ...base, amount: 100, method: "cheque", cheque, reference: "5001" });
    expect(r.ok && r.payload.payment?.[0]).toEqual({ date: "2026-11-24", type: 2, price: 100, currency: "ILS", bankName: "12", bankBranch: "600", bankAccount: "11111", chequeNum: "5001" });
    expect(receiptPayload({ ...base, amount: 100, method: "other" }).ok).toBe(false);
  });
});

const doc = (d: Partial<IssuedDoc>): IssuedDoc => ({ id: "r1", kind: "invoice_receipt", status: "issued", amount: 300, number: "1001", morningId: "m1", creditsId: null, ...d });

describe("credit notes", () => {
  it("counts what is left after credits issued or on their way", () => {
    const all = [doc({}), doc({ id: "c1", kind: "credit", amount: 100, creditsId: "r1" }), doc({ id: "c2", kind: "credit", amount: 50, creditsId: "r1", status: "failed" })];
    expect(creditRemaining(all[0], all)).toBe(200);
  });
  it("credits all of a document as a cancel, part of it as a link", () => {
    const original = { kind: "invoice_receipt" as const, number: "1001", morningId: "m1", amount: 300 };
    const full = creditPayload({ original, remaining: 300, amount: 300, reason: "ההזמנה בוטלה", orderNumber: 1042, ref: "BH-3" });
    expect(full.ok && full.payload).toMatchObject({ type: 330, linkedDocumentIds: ["m1"], linkType: "cancel", description: "זיכוי לחשבונית מס/קבלה 1001" });
    expect(full.ok && full.payload.income[0]).toMatchObject({ description: "זיכוי לחשבונית מס/קבלה 1001: ההזמנה בוטלה", price: 300, vatType: 1 });
    const part = creditPayload({ original, remaining: 300, amount: 120, reason: "פריט חסר", orderNumber: 1042, ref: "BH-3" });
    expect(part.ok && part.payload.linkType).toBe("link");
  });
  it("refuses more than is left, no reason, or a document that isn't a tax invoice", () => {
    const original = { kind: "invoice_receipt" as const, number: "1001", morningId: "m1", amount: 300 };
    expect(creditPayload({ original, remaining: 100, amount: 150, reason: "x y", orderNumber: 1, ref: "r" }).ok).toBe(false);
    expect(creditPayload({ original, remaining: 100, amount: 50, reason: " ", orderNumber: 1, ref: "r" }).ok).toBe(false);
    expect(creditPayload({ original: { ...original, kind: "deal" }, remaining: 300, amount: 50, reason: "xx", orderNumber: 1, ref: "r" }).ok).toBe(false);
  });
});

describe("guards", () => {
  it("blocks deleting an order while a tax document has no full credit", () => {
    expect(deleteBlockedByDocuments([])).toBeNull();
    expect(deleteBlockedByDocuments([doc({ kind: "quote" }), doc({ kind: "deal" })])).toBeNull();
    expect(deleteBlockedByDocuments([doc({})])).toContain("1001");
    expect(deleteBlockedByDocuments([doc({}), doc({ id: "c", kind: "credit", creditsId: "r1", amount: 300 })])).toBeNull();
    expect(deleteBlockedByDocuments([doc({ kind: "quote", status: "pending" })])).toContain("בהפקה");
    expect(deleteBlockedByDocuments([doc({ status: "failed" })])).toBeNull();
  });
  it("keeps an order with documents on its team", () => {
    expect(moveBlockedByDocuments([{ status: "failed" }])).toBeNull();
    expect(moveBlockedByDocuments([{ status: "issued" }])).not.toBeNull();
  });
});

const team: TeamBilling = {
  name: "סטימפאנק",
  program: "FRC",
  number: 1577,
  contactEmail: "team@example.com",
  address: "רעננה",
  billingName: null,
  billingTaxId: null,
  billingEmail: null,
  billingAddress: null,
};

describe("clients", () => {
  it("falls back to the team's own details", () => {
    expect(billingParty(team)).toEqual({ name: "סטימפאנק", taxId: null, email: "team@example.com", address: "רעננה" });
    expect(billingParty({ ...team, billingName: "עמותת סטימפאנק רעננה", billingEmail: "pay@example.com", billingTaxId: "580000000" })).toMatchObject({
      name: "עמותת סטימפאנק רעננה",
      email: "pay@example.com",
      taxId: "580000000",
    });
    expect(newClientBody(team)).toEqual({ name: "סטימפאנק", emails: ["team@example.com"], address: "רעננה", remarks: "BLUEHUB FRC 1577" });
  });
  it("reads names without quotes and filler words", () => {
    expect(nameWords('קבוצת "סטימפאנק" רעננה FRC')).toEqual(["סטימפאנק", "רעננה"]);
    expect(nameWords("DRC דבורה")).toEqual(["drc", "דבורה"]);
  });
  it("suggests the existing Morning client: tax id, then email, then name", () => {
    const clients = [
      { id: "a", name: "סטימפאנק רעננה" },
      { id: "b", name: "צעירים בירוחם" },
      { id: "c", name: "DRC דבורה", emails: ["team@example.com"] },
      { id: "d", name: "משהו אחר", taxId: "58-0000000" },
    ];
    expect(clientSuggestions(team, clients).map((c) => [c.id, c.why])).toEqual([
      ["c", "email"],
      ["a", "name"],
    ]);
    expect(clientSuggestions({ ...team, billingTaxId: "580000000" }, clients)[0]).toMatchObject({ id: "d", why: "taxId" });
    expect(clientSuggestions({ ...team, name: "בית ספר", contactEmail: null }, clients)).toEqual([]);
  });
});

describe("morningErrorText", () => {
  it("keeps Morning's own message", () => {
    expect(morningErrorText(400, { errorCode: 2403, errorMessage: "סוג מסמך לא נתמך" })).toBe("סוג מסמך לא נתמך (400/2403)");
    expect(morningErrorText(401, { error: "invalid_client", error_description: "Invalid client credentials" })).toBe("Invalid client credentials (401)");
    expect(morningErrorText(502, null)).toBe("חשבונית ירוקה החזירה 502");
  });
});

describe("parseBilling", () => {
  it("keeps what was typed, empty as null", () => {
    expect(parseBilling({ billingName: "  עמותת  סטימפאנק ", billingTaxId: "58-123-4564", billingEmail: "Pay@Example.com", billingAddress: "" })).toEqual({
      ok: true,
      value: { billingName: "עמותת סטימפאנק", billingTaxId: "581234564", billingEmail: "pay@example.com", billingAddress: null },
    });
    expect(parseBilling({})).toEqual({ ok: true, value: { billingName: null, billingTaxId: null, billingEmail: null, billingAddress: null } });
  });
  it("refuses a bad tax id or email", () => {
    expect(parseBilling({ billingTaxId: "12a" }).ok).toBe(false);
    expect(parseBilling({ billingTaxId: "1234" }).ok).toBe(false);
    expect(parseBilling({ billingEmail: "nope" }).ok).toBe(false);
    expect(parseBilling({ billingTaxId: "580000001" }).ok).toBe(false);
    expect(parseBilling({ billingTaxId: "123456" }).ok).toBe(true);
  });
  it("checks Israel's 9-digit check digit", () => {
    expect(validIsraeliTaxId("000000018")).toBe(true);
    expect(validIsraeliTaxId("580000001")).toBe(false);
    expect(validIsraeliTaxId("12345")).toBe(true);
  });
});
