import { describe, expect, it } from "vitest";
import {
  ageingBucket,
  daysSince,
  defaultAmount,
  deleteBlockedByPayments,
  isUnpaid,
  moneyState,
  orderMoney,
  owedFor,
  owingFirst,
  paidTotal,
  parsePayment,
  paymentsCsv,
  teamBalance,
  teamMoneyLabel,
  voidInput,
} from "./payments";

const pay = (amountIls: string | number, voided = false) => ({ amountIls, voidedAt: voided ? new Date("2026-11-20") : null });
const now = new Date("2026-11-24T10:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("paidTotal", () => {
  it("sums what isn't voided, to the agora", () => {
    expect(paidTotal([pay("0.10"), pay("0.20"), pay(100, true)])).toBe(0.3);
    expect(paidTotal([])).toBe(0);
  });
});

describe("owedFor", () => {
  it("is the approved total, nothing before approval, nothing once stopped", () => {
    expect(owedFor("approved", 1250)).toBe(1250);
    expect(owedFor("quote_sent", 1250)).toBe(1250); // a re-quote after approval keeps the approved version owing
    expect(owedFor("submitted", null)).toBe(0);
    expect(owedFor("cancelled", 1250)).toBe(0);
    expect(owedFor("rejected", 1250)).toBe(0);
  });
});

describe("moneyState", () => {
  it("is none when nothing is owed or paid", () => {
    expect(moneyState(0, 0).state).toBe("none");
  });
  it("is unpaid with nothing paid", () => {
    expect(moneyState(1250, 0)).toEqual({ owed: 1250, paid: 0, left: 1250, over: 0, state: "unpaid" });
  });
  it("is partial with some paid, and says what is left", () => {
    expect(moneyState(1250, 1000.5)).toEqual({ owed: 1250, paid: 1000.5, left: 249.5, over: 0, state: "partial" });
  });
  it("is paid when it adds up exactly, even in agorot", () => {
    expect(moneyState(0.3, 0.1 + 0.2).state).toBe("paid");
  });
  it("is overpaid beyond the total, or for a stopped order that was paid", () => {
    expect(moneyState(100, 150)).toMatchObject({ over: 50, left: 0, state: "overpaid" });
    expect(orderMoney({ status: "cancelled", approvedTotalIls: 100, payments: [pay(100)] }).state).toBe("overpaid");
  });
  it("ignores voided payments", () => {
    expect(orderMoney({ status: "approved", approvedTotalIls: 100, payments: [pay(100, true)] }).state).toBe("unpaid");
  });
});

describe("isUnpaid", () => {
  it("is the states with money still to collect", () => {
    expect(isUnpaid({ state: "unpaid" })).toBe(true);
    expect(isUnpaid({ state: "partial" })).toBe(true);
    expect(isUnpaid({ state: "paid" })).toBe(false);
    expect(isUnpaid({ state: "overpaid" })).toBe(false);
    expect(isUnpaid({ state: "none" })).toBe(false);
  });
});

describe("teamMoneyLabel", () => {
  it("says the team's three words", () => {
    expect(teamMoneyLabel(moneyState(1250, 0))?.label).toBe("ממתין לתשלום");
    expect(teamMoneyLabel(moneyState(1250, 1250))?.label).toBe("שולם");
    expect(teamMoneyLabel(moneyState(100, 150))?.label).toBe("שולם");
    const partial = teamMoneyLabel(moneyState(1250, 1000))!.label;
    expect(partial).toMatch(/^שולם חלקית \(.*250.* נותרו\)$/);
  });
  it("says nothing while nothing is owed", () => {
    expect(teamMoneyLabel(moneyState(0, 0))).toBeNull();
  });
});

describe("daysSince and ageingBucket", () => {
  it("counts whole days, never below 0", () => {
    expect(daysSince(daysAgo(30), now)).toBe(30);
    expect(daysSince(new Date(now.getTime() + 5000), now)).toBe(0);
    expect(daysSince(null, now)).toBe(0);
  });
  it("puts the edges in the right bucket", () => {
    expect(ageingBucket(0)).toBe("0-30");
    expect(ageingBucket(30)).toBe("0-30");
    expect(ageingBucket(31)).toBe("31-60");
    expect(ageingBucket(60)).toBe("31-60");
    expect(ageingBucket(61)).toBe("60+");
  });
});

describe("teamBalance", () => {
  const o = (number: number, owed: number, paid: number, days: number) => ({ orderId: `o${number}`, number, owed, paid, approvedAt: daysAgo(days) });

  it("is empty for a team with nothing", () => {
    const b = teamBalance([], 0, now);
    expect(b).toMatchObject({ owed: 0, paid: 0, balance: 0, open: [], oldestDays: null });
    expect(b.ageing).toEqual({ "0-30": 0, "31-60": 0, "60+": 0 });
  });

  it("buckets what each order still owes by days since approval", () => {
    const b = teamBalance([o(1001, 1000, 0, 10), o(1002, 500, 200, 45), o(1003, 300, 0, 90)], 0, now);
    expect(b.balance).toBe(1600);
    expect(b.ageing).toEqual({ "0-30": 1000, "31-60": 300, "60+": 300 });
    expect(b.open.map((x) => x.number)).toEqual([1003, 1002, 1001]);
    expect(b.oldestDays).toBe(90);
  });

  it("leaves paid orders out", () => {
    const b = teamBalance([o(1001, 1000, 1000, 70)], 0, now);
    expect(b).toMatchObject({ balance: 0, open: [], oldestDays: null });
  });

  it("uses a payment on account on the oldest order first", () => {
    const b = teamBalance([o(1001, 1000, 0, 10), o(1002, 500, 0, 70)], 700, now);
    expect(b.balance).toBe(800);
    expect(b.ageing).toEqual({ "0-30": 800, "31-60": 0, "60+": 0 });
    expect(b.open).toEqual([{ orderId: "o1001", number: 1001, left: 800, days: 10 }]);
  });

  it("uses an overpayment on one order against another", () => {
    const b = teamBalance([o(1001, 100, 300, 5), o(1002, 500, 0, 40)], 0, now);
    expect(b.balance).toBe(300);
    expect(b.ageing["31-60"]).toBe(300);
  });

  it("is negative when the team has credit, with nothing open", () => {
    const b = teamBalance([o(1001, 100, 0, 5)], 250, now);
    expect(b).toMatchObject({ balance: -150, open: [], oldestDays: null });
  });

  it("keeps agorot exact", () => {
    const b = teamBalance([o(1001, 0.3, 0.1, 1)], 0.2, now);
    expect(b.balance).toBe(0);
  });
});

describe("owingFirst", () => {
  it("lists teams that owe, oldest debt first, then the larger one", () => {
    const now2 = now;
    const t = (id: string, orders: Parameters<typeof teamBalance>[0], onAccount = 0) => ({ id, balance: teamBalance(orders, onAccount, now2) });
    const list = owingFirst([
      t("credit", [{ orderId: "a", number: 1, owed: 100, paid: 0, approvedAt: daysAgo(80) }], 500),
      t("young", [{ orderId: "b", number: 2, owed: 900, paid: 0, approvedAt: daysAgo(3) }]),
      t("old", [{ orderId: "c", number: 3, owed: 100, paid: 0, approvedAt: daysAgo(50) }]),
      t("same-age-bigger", [{ orderId: "d", number: 4, owed: 400, paid: 0, approvedAt: daysAgo(50) }]),
      t("paid", [{ orderId: "e", number: 5, owed: 100, paid: 100, approvedAt: daysAgo(90) }]),
    ]);
    expect(list.map((x) => x.id)).toEqual(["same-age-bigger", "old", "young"]);
  });
});

describe("parsePayment", () => {
  const base = { teamId: "6f1c2a64-1b2c-4d1e-9f00-000000000001", orderId: "", amount: "1,250.50", paidAt: "2026-11-24", method: "transfer", reference: " 12345 ", note: "" };

  it("reads the sheet: a payment on account, a comma in the amount, trimmed text", () => {
    const r = parsePayment(base, now);
    expect(r).toEqual({ ok: true, value: { teamId: base.teamId, orderId: null, amount: 1250.5, paidAt: "2026-11-24", method: "transfer", reference: "12345", note: null, morningDocNo: null } });
  });

  it("refuses a zero, negative or too precise amount", () => {
    expect(parsePayment({ ...base, amount: "0" }, now)).toEqual({ ok: false, error: "הסכום צריך להיות גדול מ-0" });
    expect(parsePayment({ ...base, amount: "-5" }, now).ok).toBe(false);
    expect(parsePayment({ ...base, amount: "1.234" }, now).ok).toBe(false);
    expect(parsePayment({ ...base, amount: "" }, now).ok).toBe(false);
  });

  it("refuses a date in the future and an unknown method", () => {
    expect(parsePayment({ ...base, paidAt: "2026-12-30" }, now)).toEqual({ ok: false, error: "תאריך התשלום עוד לא הגיע" });
    expect(parsePayment({ ...base, method: "bitcoin" }, now)).toEqual({ ok: false, error: "בחרו אמצעי תשלום" });
    expect(parsePayment({ ...base, paidAt: "24/11/2026" }, now)).toEqual({ ok: false, error: "תאריך לא תקין" });
  });

  it("takes the Morning receipt number, digits only", () => {
    const r = parsePayment({ ...base, morningDocNo: " 1023 " }, now);
    expect(r.ok && r.value.morningDocNo).toBe("1023");
    expect(parsePayment({ ...base, morningDocNo: "10a3" }, now)).toEqual({ ok: false, error: "מספר מסמך בחשבונית ירוקה הוא ספרות בלבד" });
  });

  it("takes an order id", () => {
    const r = parsePayment({ ...base, orderId: "6f1c2a64-1b2c-4d1e-9f00-000000000002" }, now);
    expect(r.ok && r.value.orderId).toBe("6f1c2a64-1b2c-4d1e-9f00-000000000002");
  });
});

describe("voidInput", () => {
  it("needs a reason", () => {
    expect(voidInput.safeParse({ paymentId: "6f1c2a64-1b2c-4d1e-9f00-000000000001", reason: " " }).success).toBe(false);
    expect(voidInput.safeParse({ paymentId: "6f1c2a64-1b2c-4d1e-9f00-000000000001", reason: "נרשם פעמיים" }).success).toBe(true);
  });
});

describe("defaultAmount", () => {
  it("is what's left, or empty", () => {
    expect(defaultAmount(249.5)).toBe("249.5");
    expect(defaultAmount(0)).toBe("");
  });
});

describe("paymentsCsv", () => {
  it("has the bookkeeper's columns, a BOM, quoted cells and voided rows marked", () => {
    const csv = paymentsCsv([
      { paidAt: "2026-11-20", team: 'אורביט, "1690"', orderNumber: 1071, amountIls: "1250.5", method: "transfer", reference: "A1", documentNumber: "1023", morningQuoteNo: "434", morningDealNo: "40100", note: null, voidedAt: null, voidReason: null },
      { paidAt: "2026-11-21", team: "צעירים", orderNumber: null, amountIls: 100, method: "cheque", reference: null, documentNumber: null, morningQuoteNo: null, morningDealNo: null, note: "מקדמה", voidedAt: new Date(), voidReason: "נרשם פעמיים" },
    ]);
    expect(csv.startsWith("﻿תאריך,קבוצה,הזמנה,סכום ₪,אמצעי תשלום,אסמכתא,מס׳ חשבונית מס/קבלה,מס׳ הצעת מחיר,מס׳ חשבון עסקה,הערה,בוטל,סיבת ביטול\r\n")).toBe(true);
    expect(csv).toContain('2026-11-20,"אורביט, ""1690""",1071,1250.50,העברה בנקאית,A1,1023,434,40100,,,\r\n');
    expect(csv).toContain("2026-11-21,צעירים,,100.00,צ׳ק,,,,,מקדמה,כן,נרשם פעמיים\r\n");
  });

});

describe("deleteBlockedByPayments", () => {
  it("allows the delete when every payment is voided, or there are none", () => {
    expect(deleteBlockedByPayments([])).toBeNull();
    expect(deleteBlockedByPayments([pay(100, true)])).toBeNull();
  });
  it("says what to void first", () => {
    expect(deleteBlockedByPayments([pay(100)])).toMatch(/רשום תשלום של .*100.*לבטל אותו/);
    expect(deleteBlockedByPayments([pay(100), pay(50), pay(10, true)])).toMatch(/רשומים 2 תשלומים, .*150.*לבטל אותם/);
  });
});
