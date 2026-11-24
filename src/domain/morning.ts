import { formatIls, toAgorot } from "./pricing";
import type { PaymentMethod } from "./payments";

/**
 * Morning (חשבונית ירוקה) documents, P2/P3 of docs/PAYMENTS-MORNING-PLAN.md: the configuration
 * read from the environment, and every document's payload, built from the quote snapshot and
 * the payment as recorded (never from today's catalog). Pure; src/lib/morning.ts sends them.
 *
 * Confirmed against the sandbox on Nov 24, 2026 (and Morning's OpenAPI file,
 * https://developers.morning.co/docs/openapi.bundled.json):
 *  - prices include VAT (D1): each income row has vatType 1 ("VAT included in price") and the
 *    document vatType 0 (by the business type), so Morning splits out the 18% itself;
 *  - a חשבונית מס/קבלה (320) names the חשבון עסקה (300) in linkedDocumentIds, which closes it;
 *  - a חשבונית זיכוי (330) names the document it credits, linkType "cancel" when it credits all of it;
 *  - Morning has no external-reference field, so the row's reference goes into `remarks`, where a
 *    retry finds it (documents/search, then matching remarks).
 */

export const MORNING_KINDS = ["quote", "deal", "invoice_receipt", "credit"] as const;
export type MorningKind = (typeof MORNING_KINDS)[number];

/** Morning's document type codes (GET /documents/types). */
export const DOC_TYPE: Record<MorningKind, number> = { quote: 10, deal: 300, invoice_receipt: 320, credit: 330 };

export const KIND_LABEL: Record<MorningKind, string> = {
  quote: "הצעת מחיר",
  deal: "חשבון עסקה",
  invoice_receipt: "חשבונית מס/קבלה",
  credit: "חשבונית זיכוי",
};

export type MorningEnv = "sandbox" | "production";

/**
 * Where each Morning account lives. The token comes from Morning's identity host, the API from
 * the greeninvoice host (calls to api.sandbox.d.greeninvoice.co.il/api/v1 answer with an AWS
 * signature error). The production token host is the one the OpenAPI file names; it answers
 * "invalid_client" without keys (checked Nov 24, 2026), and gets its first real call when the
 * owner adds a production key.
 */
export const MORNING_HOSTS: Record<MorningEnv, { token: string; api: string; app: string }> = {
  sandbox: {
    token: "https://api.sandbox.morning.dev/idp/v1/oauth/token",
    api: "https://sandbox.d.greeninvoice.co.il/api/v1",
    app: "https://app.sandbox.d.greeninvoice.co.il",
  },
  production: {
    token: "https://api.morning.co/idp/v1/oauth/token",
    api: "https://api.greeninvoice.co.il/api/v1",
    app: "https://app.greeninvoice.co.il",
  },
};

export type MorningConfig = { id: string; secret: string; env: MorningEnv; tokenUrl: string; apiBase: string };

export type MorningSetup = { state: "off" } | { state: "invalid"; reason: string } | { state: "on"; config: MorningConfig };

/**
 * MORNING_API_ID, MORNING_API_SECRET and MORNING_ENV (sandbox | production). With no keys at
 * all Morning is off and every Morning control is hidden; half a setup is "invalid" and says why.
 */
export function morningSetup(env: Record<string, string | undefined>): MorningSetup {
  const id = env.MORNING_API_ID?.trim();
  const secret = env.MORNING_API_SECRET?.trim();
  if (!id && !secret) return { state: "off" };
  if (!id || !secret) return { state: "invalid", reason: `חסר ${id ? "MORNING_API_SECRET" : "MORNING_API_ID"}` };
  const which = env.MORNING_ENV?.trim();
  if (which !== "sandbox" && which !== "production") return { state: "invalid", reason: "MORNING_ENV צריך להיות sandbox או production" };
  return { state: "on", config: { id, secret, env: which, tokenUrl: MORNING_HOSTS[which].token, apiBase: MORNING_HOSTS[which].api } };
}

/** The steps the admin can turn off (the "חשבונית ירוקה" card); each issues one kind. */
export type MorningSteps = { quote: boolean; deal: boolean; receipt: boolean; credit: boolean };

export const STEP_OF: Record<MorningKind, keyof MorningSteps> = { quote: "quote", deal: "deal", invoice_receipt: "receipt", credit: "credit" };

/**
 * The reference a document carries in its remarks, from its billing_documents row id:
 * "BH-" and the first 12 hex digits, enough to be unique in one business.
 */
export function docRef(rowId: string): string {
  return `BH-${rowId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

/** "BLUEHUB, הזמנה 1042. סימוכין BH-…": every document traceable to its order and row. */
export function remarksFor(orderNumber: number | null, ref: string, reference?: string | null): string {
  return `BLUEHUB${orderNumber ? `, הזמנה ${orderNumber}` : ""}${reference ? `, אסמכתא ${reference}` : ""}. סימוכין ${ref}`;
}

/** The document a retry looks for: the one whose remarks carry the row's reference. */
export function findByRef<T extends { remarks?: string | null }>(items: T[], ref: string): T | null {
  return items.find((d) => (d.remarks ?? "").includes(ref)) ?? null;
}

export type IncomeRow = {
  catalogNum?: string;
  description: string;
  quantity: number;
  price: number;
  currency: "ILS";
  /** 1: the price includes VAT (D1). */
  vatType: 1;
};

export type PaymentRow = {
  date: string;
  type: number;
  price: number;
  currency: "ILS";
  transactionId?: string;
  chequeNum?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccount?: string;
};

export type DocumentPayload = {
  type: number;
  lang: "he";
  currency: "ILS";
  /** 0: by the business type (an עוסק מורשה adds VAT; rows say it is already in the price). */
  vatType: 0;
  description: string;
  remarks: string;
  income: IncomeRow[];
  payment?: PaymentRow[];
  linkedDocumentIds?: string[];
  linkType?: "link" | "cancel";
};

/** The client part, added at each attempt: the linked client, or the details for a new one. */
export type DocumentClient = { id: string } | { name: string; emails: string[]; taxId?: string; address?: string; add: boolean };

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export type QuoteLineSnapshot = {
  title: string;
  options: { name: string; value: string }[];
  supplierSku: string | null;
  qty: number;
  unitPriceIls: number;
};

/** The quote's lines as income rows (lines with no quantity left out), then shipping. */
export function quoteIncome(lines: QuoteLineSnapshot[], shippingIls: number): IncomeRow[] {
  const rows: IncomeRow[] = lines
    .filter((l) => l.qty > 0)
    .map((l) => {
      const opts = l.options.map((o) => `${o.name}: ${o.value}`).join(", ");
      return {
        ...(l.supplierSku ? { catalogNum: clip(l.supplierSku, 60) } : {}),
        description: clip(opts ? `${l.title} (${opts})` : l.title, 250),
        quantity: l.qty,
        price: l.unitPriceIls,
        currency: "ILS",
        vatType: 1,
      };
    });
  if (shippingIls > 0) rows.push({ description: "משלוח", quantity: 1, price: shippingIls, currency: "ILS", vatType: 1 });
  return rows;
}

/** What the income rows add up to, in shekels (VAT included), to the agora. */
export function incomeTotal(rows: Pick<IncomeRow, "quantity" | "price">[]): number {
  return rows.reduce((sum, r) => sum + toAgorot(r.quantity * r.price), 0) / 100;
}

const base = (kind: MorningKind, orderNumber: number | null, ref: string, description: string) => ({
  type: DOC_TYPE[kind],
  lang: "he" as const,
  currency: "ILS" as const,
  vatType: 0 as const,
  description,
  remarks: remarksFor(orderNumber, ref),
});

/** A הצעת מחיר (on send) or a חשבון עסקה (on approval) from one quote version. */
export function quotePayload(input: { kind: "quote" | "deal"; orderNumber: number; ref: string; lines: QuoteLineSnapshot[]; shippingIls: number }): {
  payload: DocumentPayload;
  amount: number;
} {
  const income = quoteIncome(input.lines, input.shippingIls);
  return { payload: { ...base(input.kind, input.orderNumber, input.ref, `הזמנה ${input.orderNumber}`), income }, amount: incomeTotal(income) };
}

/** Morning's payment method codes; "other" has no fitting Morning kind and is issued by hand. */
const PAYMENT_TYPE: Record<Exclude<PaymentMethod, "other">, number> = { cash: 1, cheque: 2, card: 3, transfer: 4 };

export type ChequeDetails = { bankName: string; bankBranch: string; bankAccount: string };

/** A cheque's bank, branch and account (Morning refuses a cheque without them), from the payment sheet. */
export function parseCheque(form: { bankName?: unknown; bankBranch?: unknown; bankAccount?: unknown }): ChequeDetails | null {
  const v = (x: unknown) => (typeof x === "string" ? x.trim().slice(0, 40) : "");
  const c = { bankName: v(form.bankName), bankBranch: v(form.bankBranch), bankAccount: v(form.bankAccount) };
  return c.bankName && c.bankBranch && c.bankAccount ? c : null;
}

/** Why a payment can't get its document automatically, or null. */
export function receiptBlocker(method: PaymentMethod, cheque: ChequeDetails | null): string | null {
  if (method === "other") return "לתשלום ״אחר״ אין סוג מתאים בחשבונית ירוקה: מפיקים אותו שם ומקלידים את מספרו";
  if (method === "cheque" && !cheque) return "לחשבונית על צ׳ק צריך בנק, סניף וחשבון";
  return null;
}

/**
 * A חשבונית מס/קבלה for a recorded payment, linked to the order's חשבון עסקה when there is one
 * (that closes it). A payment of exactly the deal's total repeats its lines; any other amount is
 * one line, "תשלום עבור הזמנה N" (or on account).
 */
export function receiptPayload(input: {
  orderNumber: number | null;
  ref: string;
  amount: number;
  paidAt: string;
  method: PaymentMethod;
  reference: string | null;
  cheque: ChequeDetails | null;
  deal: { morningId: string; income: IncomeRow[] } | null;
}): { ok: true; payload: DocumentPayload; amount: number } | { ok: false; error: string } {
  const blocked = receiptBlocker(input.method, input.cheque);
  if (blocked) return { ok: false, error: blocked };
  if (!(input.amount > 0)) return { ok: false, error: "סכום התשלום חייב להיות חיובי" };
  const whole = input.deal && toAgorot(incomeTotal(input.deal.income)) === toAgorot(input.amount);
  const income: IncomeRow[] = whole
    ? input.deal!.income
    : [
        {
          description: input.orderNumber ? `תשלום עבור הזמנה ${input.orderNumber}` : "תשלום על חשבון",
          quantity: 1,
          price: Math.round(input.amount * 100) / 100,
          currency: "ILS",
          vatType: 1,
        },
      ];
  const method = input.method as Exclude<PaymentMethod, "other">;
  const payment: PaymentRow = {
    date: input.paidAt,
    type: PAYMENT_TYPE[method],
    price: Math.round(input.amount * 100) / 100,
    currency: "ILS",
    ...(input.method === "cheque" && input.cheque ? { ...input.cheque, ...(input.reference ? { chequeNum: clip(input.reference, 30) } : {}) } : {}),
    ...(input.method !== "cheque" && input.reference ? { transactionId: clip(input.reference, 60) } : {}),
  };
  const description = input.orderNumber ? `תשלום עבור הזמנה ${input.orderNumber}` : "תשלום על חשבון";
  return {
    ok: true,
    amount: incomeTotal(income),
    payload: {
      ...base("invoice_receipt", input.orderNumber, input.ref, description),
      // Morning keeps no transactionId on a bank transfer (checked on the sandbox): the bank reference rides in the remarks.
      remarks: remarksFor(input.orderNumber, input.ref, input.method === "cheque" ? null : input.reference && clip(input.reference, 60)),
      income,
      payment: [payment],
      ...(input.deal ? { linkedDocumentIds: [input.deal.morningId], linkType: "link" as const } : {}),
    },
  };
}

export type IssuedDoc = { id: string; kind: MorningKind; status: "pending" | "issued" | "failed"; amount: number; number: string | null; morningId: string | null; creditsId: string | null };

/** What is left to credit on a tax document: its amount less the credit notes issued or pending against it. */
export function creditRemaining(doc: Pick<IssuedDoc, "id" | "amount">, all: IssuedDoc[]): number {
  const credited = all.filter((d) => d.kind === "credit" && d.creditsId === doc.id && d.status !== "failed").reduce((s, d) => s + toAgorot(d.amount), 0);
  return Math.max(0, toAgorot(doc.amount) - credited) / 100;
}

/** "הפקת זיכוי": a חשבונית זיכוי for some or all of what is left on a חשבונית מס/קבלה. */
export function creditPayload(input: {
  original: { kind: MorningKind; number: string; morningId: string; amount: number };
  remaining: number;
  amount: number;
  reason: string;
  orderNumber: number | null;
  ref: string;
}): { ok: true; payload: DocumentPayload; amount: number } | { ok: false; error: string } {
  if (input.original.kind !== "invoice_receipt") return { ok: false, error: "זיכוי מופק רק על חשבונית מס/קבלה" };
  const amount = Math.round(input.amount * 100) / 100;
  if (!(amount > 0)) return { ok: false, error: "סכום הזיכוי חייב להיות חיובי" };
  if (toAgorot(amount) > toAgorot(input.remaining)) return { ok: false, error: `אפשר לזכות עד ${formatIls(input.remaining, { agorot: true })}` };
  const reason = input.reason.trim();
  if (reason.length < 2) return { ok: false, error: "צריך לכתוב סיבה לזיכוי" };
  const full = toAgorot(amount) === toAgorot(input.original.amount);
  const description = `זיכוי ל${KIND_LABEL.invoice_receipt} ${input.original.number}`;
  return {
    ok: true,
    amount,
    payload: {
      ...base("credit", input.orderNumber, input.ref, description),
      income: [{ description: clip(`${description}: ${reason}`, 250), quantity: 1, price: amount, currency: "ILS", vatType: 1 }],
      linkedDocumentIds: [input.original.morningId],
      linkType: full ? "cancel" : "link",
    },
  };
}

/**
 * P3: an order is deleted only when nothing it issued is still owed a credit note: no document
 * on its way, and every חשבונית מס/קבלה credited in full. A הצעת מחיר or חשבון עסקה is not a tax
 * document and doesn't block (its row stays, without the order).
 */
export function deleteBlockedByDocuments(docs: IssuedDoc[]): string | null {
  if (docs.some((d) => d.status === "pending")) return "מסמך בחשבונית ירוקה עוד בהפקה. אפשר למחוק אחרי שיסתיים.";
  const open = docs.filter((d) => d.kind === "invoice_receipt" && d.status === "issued" && creditRemaining(d, docs) > 0);
  if (open.length === 0) return null;
  const numbers = open.map((d) => d.number).join(", ");
  return `על ההזמנה הופקה ${KIND_LABEL.invoice_receipt} ${numbers}. כדי למחוק אותה צריך קודם להפיק זיכוי מלא בחלק ״מסמכים״.`;
}

/** An order with documents stays with the team they were issued to. */
export function moveBlockedByDocuments(docs: Pick<IssuedDoc, "status">[]): string | null {
  return docs.some((d) => d.status !== "failed") ? "להזמנה יש מסמכים בחשבונית ירוקה על שם הקבוצה, ולכן היא לא עוברת לקבוצה אחרת" : null;
}

export type TeamBilling = {
  name: string;
  program: string;
  number: number;
  contactEmail: string | null;
  address: string | null;
  billingName: string | null;
  billingTaxId: string | null;
  billingEmail: string | null;
  billingAddress: string | null;
};

/** Who the documents are made out to: the billing details, or the team's own name, email and address. */
export function billingParty(team: TeamBilling): { name: string; taxId: string | null; email: string | null; address: string | null } {
  return {
    name: team.billingName?.trim() || team.name,
    taxId: team.billingTaxId?.trim() || null,
    email: team.billingEmail?.trim() || team.contactEmail?.trim() || null,
    address: team.billingAddress?.trim() || team.address?.trim() || null,
  };
}

/** POST /clients for a team that has no Morning client yet (D4: a new team gets a new client). */
export function newClientBody(team: TeamBilling) {
  const p = billingParty(team);
  return {
    name: clip(p.name, 100),
    ...(p.taxId ? { taxId: p.taxId } : {}),
    ...(p.email ? { emails: [p.email] } : {}),
    ...(p.address ? { address: clip(p.address, 200) } : {}),
    remarks: `BLUEHUB ${team.program} ${team.number}`,
  };
}

const STOP_WORDS = new Set(["קבוצת", "קבוצה", "רובוטיקה", "רובוטיקת", "צוות", "team", "frc", "ftc", "robotics", "the"]);

/** Words of a name for matching: no quotes, punctuation, "קבוצת"/"FRC"/…; lower case. */
export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/["'״׳`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export type MorningClientLite = { id: string; name: string; taxId?: string | null; emails?: string[] | null };

/**
 * Morning clients that may be this team (D4: the admin confirms): the same tax id or email first,
 * then names sharing most of their words ("סטימפאנק רעננה" ~ "קבוצת סטימפאנק רעננה FRC").
 */
export function clientSuggestions(team: TeamBilling, clients: MorningClientLite[], limit = 5): (MorningClientLite & { why: "taxId" | "email" | "name" })[] {
  const party = billingParty(team);
  const names = [...new Set([party.name, team.name].map(nameWords).filter((w) => w.length))];
  type Scored = { c: MorningClientLite; score: number; why: "taxId" | "email" | "name" };
  const scored = clients.flatMap((c): Scored[] => {
    if (party.taxId && c.taxId && c.taxId.replace(/\D/g, "") === party.taxId.replace(/\D/g, "")) return [{ c, score: 3, why: "taxId" }];
    if (party.email && c.emails?.some((e) => e.toLowerCase() === party.email!.toLowerCase())) return [{ c, score: 2, why: "email" }];
    const words = nameWords(c.name);
    if (!words.length) return [];
    const best = Math.max(0, ...names.map((n) => n.filter((w) => words.includes(w)).length / Math.min(n.length, words.length)));
    return best >= 0.5 ? [{ c, score: best, why: "name" }] : [];
  });
  return scored
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name, "he"))
    .slice(0, limit)
    .map(({ c, why }) => ({ ...c, why }));
}

/** A Morning error body ({errorCode, errorMessage}) as one line for the admin. */
export function morningErrorText(status: number, body: unknown): string {
  const b = (body && typeof body === "object" ? body : {}) as { errorCode?: number; errorMessage?: string; error_description?: string; message?: string };
  const msg = b.errorMessage || b.error_description || b.message || "";
  return msg ? `${msg} (${status}${b.errorCode ? `/${b.errorCode}` : ""})` : `חשבונית ירוקה החזירה ${status}`;
}

/**
 * Israel's check digit for a 9-digit ID, עוסק or ח.פ. / עמותה number (Morning refuses a wrong one,
 * error 1111). Shorter numbers (a school's סמל מוסד) have none and pass.
 */
export function validIsraeliTaxId(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  if (digits.length !== 9) return true;
  const sum = [...digits].reduce((acc, ch, i) => {
    const n = Number(ch) * ((i % 2) + 1);
    return acc + (n > 9 ? n - 9 : n);
  }, 0);
  return sum % 10 === 0;
}

export type BillingDetails = { billingName: string | null; billingTaxId: string | null; billingEmail: string | null; billingAddress: string | null };

/**
 * The "פרטי חיוב" form (the team on /team, the admin on the team's page). Every field may stay
 * empty (the team's own details are used); the tax id is 5–12 digits (ח.פ., עמותה, סמל מוסד).
 */
export function parseBilling(form: { billingName?: unknown; billingTaxId?: unknown; billingEmail?: unknown; billingAddress?: unknown }): { ok: true; value: BillingDetails } | { ok: false; error: string } {
  const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
  const name = text(form.billingName);
  const taxRaw = text(form.billingTaxId);
  const email = text(form.billingEmail).toLowerCase();
  const address = text(form.billingAddress);
  if (name.length > 120) return { ok: false, error: "השם לחשבונית ארוך מדי" };
  const tax = taxRaw.replace(/[\s-]/g, "");
  if (tax && !/^\d{5,12}$/.test(tax)) return { ok: false, error: "מספר עוסק, עמותה או מוסד הוא 5 עד 12 ספרות" };
  if (tax && !validIsraeliTaxId(tax)) return { ok: false, error: "המספר לא תקין: ספרת הביקורת לא מתאימה" };
  if (email && (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { ok: false, error: "כתובת המייל לחשבוניות לא תקינה" };
  if (address.length > 200) return { ok: false, error: "הכתובת ארוכה מדי" };
  return { ok: true, value: { billingName: name || null, billingTaxId: tax || null, billingEmail: email || null, billingAddress: address || null } };
}

/** Morning's document statuses (GET /documents/{id}): 0 open, 1 closed by Morning, 2 closed by hand, 3 cancelling, 4 cancelled. */
export const DOC_STATUS = { open: 0, closed: 1, closedByHand: 2, cancelling: 3, cancelled: 4 } as const;

/**
 * What a חשבון עסקה needs when its order stops or comes back: a cancelled or rejected order
 * closes an open one (a credit note can reopen it, so this runs after a credit too); a reopened
 * order opens again one that was closed by hand. Morning closes it by itself when it's paid
 * (status 1), and that is left alone.
 */
export function dealAction(orderStatus: string, morningStatus: number): "close" | "open" | null {
  const stopped = orderStatus === "cancelled" || orderStatus === "rejected";
  if (stopped && morningStatus === DOC_STATUS.open) return "close";
  if (!stopped && morningStatus === DOC_STATUS.closedByHand) return "open";
  return null;
}
