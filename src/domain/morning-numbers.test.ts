import { describe, expect, it } from "vitest";
import { documentsLine, morningQuoteNumbers, parseMorningNo } from "./morning-numbers";

describe("parseMorningNo", () => {
  it("keeps digits, trimmed", () => {
    expect(parseMorningNo(" 434 ")).toEqual({ ok: true, value: "434" });
    expect(parseMorningNo("40100")).toEqual({ ok: true, value: "40100" });
  });

  it("drops what people paste around the number", () => {
    expect(parseMorningNo("#1023")).toEqual({ ok: true, value: "1023" });
    expect(parseMorningNo("מס׳ 1023")).toEqual({ ok: true, value: "1023" });
    expect(parseMorningNo("40 100")).toEqual({ ok: true, value: "40100" });
    expect(parseMorningNo("40-100")).toEqual({ ok: true, value: "40100" });
  });

  it("clears on empty", () => {
    expect(parseMorningNo("")).toEqual({ ok: true, value: null });
    expect(parseMorningNo("   ")).toEqual({ ok: true, value: null });
    expect(parseMorningNo(null)).toEqual({ ok: true, value: null });
  });

  it("refuses letters, decimals and overlong numbers", () => {
    for (const bad of ["A434", "43.4", "abc", "1234567890123", "-5x"]) expect(parseMorningNo(bad).ok).toBe(false);
    expect(parseMorningNo("x")).toEqual({ ok: false, error: "מספר מסמך בחשבונית ירוקה הוא ספרות בלבד" });
  });
});

describe("documentsLine", () => {
  it("lists the documents in order", () => {
    expect(documentsLine({ quoteNo: "434", dealNo: "40100", receipts: ["1024", null, "1023", "1024"] })).toBe(
      "הצעת מחיר 434, חשבון עסקה 40100, חשבונית מס/קבלה 1023, 1024",
    );
    expect(documentsLine({ quoteNo: "434", dealNo: null, receipts: [] })).toBe("הצעת מחיר 434");
  });

  it("is null with nothing to show", () => {
    expect(documentsLine({ quoteNo: null, dealNo: null, receipts: [null] })).toBeNull();
  });
});

describe("morningQuoteNumbers", () => {
  it("takes each number from the newest version that has it", () => {
    expect(
      morningQuoteNumbers([
        { version: 1, morningQuoteNo: "430", morningDealNo: "40000" },
        { version: 2, morningQuoteNo: "434", morningDealNo: null },
        { version: 3, morningQuoteNo: null, morningDealNo: null },
      ]),
    ).toEqual({ quoteNo: "434", dealNo: "40000" });
  });
});
