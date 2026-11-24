import { describe, expect, it } from "vitest";
import { describeHistory } from "./order-history";

const d = (entity: string, action: string, after: unknown = null, before: unknown = null) => describeHistory({ entity, action, before, after });

describe("describeHistory", () => {
  it("describes the admin's corrections", () => {
    expect(d("team_order", "admin_cancel", { reason: "כפילות", surplus: [{ qty: 2 }, { qty: 1 }] })).toBe("ביטול ההזמנה: כפילות (3 יח׳ נשארו כעודף מלאי)");
    expect(d("team_order", "admin_cancel", { reason: "כפילות", surplus: [] })).toBe("ביטול ההזמנה: כפילות");
    expect(d("team_order", "reopen", { status: "approved" })).toBe("פתיחה מחדש, ההזמנה חזרה ל״אושרה, להזמין מהספק״");
    expect(d("team_order", "move", { team: "B" }, { team: "A" })).toBe("העברה מA אל B");
    expect(d("team_order", "mark_unavailable", { sku: "WCP-0749" })).toBe("סימון ״לא זמין״: WCP-0749");
    expect(d("team_order", "replace_item", { item: { supplierSku: "NEW" }, version: 3 }, { item: { supplierSku: "OLD" } })).toBe(
      "החלפת פריט: NEW במקום OLD, גרסה 3 נשלחה לאישור",
    );
    expect(d("team_order", "replace_item", { item: { supplierSku: "NEW" } }, { item: { supplierSku: "OLD" } })).toBe("החלפת פריט: NEW במקום OLD");
  });

  it("describes the team's moves and the quotes", () => {
    expect(d("team_order", "cancel")).toBe("ביטול ההזמנה מצד הקבוצה");
    expect(d("team_order", "reject", { reason: "אין מלאי" })).toBe("דחיית ההזמנה: אין מלאי");
    expect(d("quote", "send", { version: 2 })).toBe("שליחת הצעה, גרסה 2");
    expect(d("quote", "send", { version: 3, revision: true })).toBe("שליחת הצעה, גרסה 3, אחרי שחלק מהפריטים כבר הוזמנו");
    expect(d("quote", "approve", { version: 1, via: "link" })).toBe("אישור ההצעה, גרסה 1 (בקישור אישור)");
    expect(d("quote", "change_request", { version: 1, reason: "בלי הגלגלים" })).toBe("בקשת שינוי, גרסה 1: בלי הגלגלים");
    expect(d("quote", "undo", { status: "sent" }, { status: "approved" })).toBe("ביטול אישור ההצעה");
  });

  it("describes delivery notes", () => {
    expect(d("delivery", "create", { number: 9001 })).toBe("הפקת תעודת משלוח 9001");
    expect(d("delivery", "confirm", { recipientName: "דנה" })).toBe("אישור מסירה, קיבל/ה דנה");
    expect(d("delivery", "unconfirm", null, { number: 9001 })).toBe("ביטול אישור המסירה 9001");
  });

  it("describes emails, failed ones too", () => {
    expect(d("quote", "email:quote_ready", { to: "a@b.c", subject: "הצעה", ok: true })).toBe("דוא״ל אל a@b.c: הצעה");
    expect(d("quote", "email:quote_ready", { to: "a@b.c", ok: false })).toBe("דוא״ל אל a@b.c (נכשל)");
  });

  it("skips rows it doesn't know", () => {
    expect(d("team_order", "something_else")).toBeNull();
    expect(d("supplier_po", "create")).toBeNull();
  });
});

describe("payment history lines", () => {
  it("says a payment was recorded or voided, with the amount, method and reason", () => {
    expect(describeHistory({ entity: "payment", action: "record", before: null, after: { amountIls: 1250, method: "transfer" } })).toMatch(/^רישום תשלום .*1,250.*, העברה בנקאית$/);
    expect(describeHistory({ entity: "payment", action: "void", before: { amountIls: "99.50", method: "cash" }, after: { reason: "נרשם פעמיים" } })).toMatch(/^ביטול תשלום .*99\.50.*: נרשם פעמיים$/);
    expect(describeHistory({ entity: "payment", action: "other", before: null, after: null })).toBeNull();
  });
});
