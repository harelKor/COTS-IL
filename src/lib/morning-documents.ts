import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db, schema } from "@/db";
import {
  DOC_TYPE,
  KIND_LABEL,
  STEP_OF,
  billingParty,
  clientSuggestions,
  creditPayload,
  creditRemaining,
  docRef,
  findByRef,
  nameWords,
  newClientBody,
  quotePayload,
  receiptPayload,
  type ChequeDetails,
  type DocumentPayload,
  type IncomeRow,
  type IssuedDoc,
  type MorningKind,
} from "@/domain/morning";
import { israelToday, type PaymentMethod } from "@/domain/payments";
import { formatIls } from "@/domain/pricing";
import { UNDO_SECONDS } from "@/domain/quote-view";
import { getSettings } from "@/lib/settings";
import {
  MorningError,
  createMorningClient,
  createMorningDocument,
  findMorningClients,
  morningConfig,
  recordMorning,
  searchMorningDocuments,
  type CreatedDocument,
} from "./morning";

/**
 * Issuing Morning documents exactly once (P3, docs/PAYMENTS-MORNING-PLAN.md):
 *  1. a billing_documents row is written pending, with the payload fixed from the quote snapshot
 *     or the payment as recorded;
 *  2. an attempt claims the row (attempt_at), resolves the team's Morning client, and, when an
 *     earlier attempt may have reached Morning, first looks the row's reference up there;
 *  3. only then POST /documents; a timeout is answered by looking again, never by sending again.
 * An issued document fills the numbers typed by hand before (quotes.morning_quote_no /
 * morning_deal_no, payments.morning_doc_no), so both paths show the same numbers.
 */

const { auditLog, billingDocuments, payments, quoteLines, quotes, teamOrderItems, teamOrders, teams } = schema;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DocumentRow = typeof billingDocuments.$inferSelect;

/** A second attempt waits this long after the first started, so two never run at once. */
const CLAIM_SECONDS = 120;

/** Whether this step issues by itself now: Morning has keys and the admin left the step on. */
export async function morningStepOn(kind: MorningKind): Promise<boolean> {
  if (!morningConfig()) return false;
  return (await getSettings()).morning[STEP_OF[kind]];
}

const asIssued = (d: DocumentRow): IssuedDoc => ({
  id: d.id,
  kind: d.kind,
  status: d.status,
  amount: Number(d.amountIls),
  number: d.number,
  morningId: d.morningId,
  creditsId: d.creditsId,
});

/** The order's documents, oldest first. */
export async function orderDocuments(orderId: string, reader: Pick<typeof db, "select"> = db): Promise<DocumentRow[]> {
  return reader.select().from(billingDocuments).where(eq(billingDocuments.orderId, orderId)).orderBy(asc(billingDocuments.createdAt));
}

export const toIssuedDocs = (rows: DocumentRow[]) => rows.map(asIssued);

/** Pending rows whose attempt is over (the function that ran it closed): "ניסיון חוזר" looks them up first. */
export async function stuckDocumentIds(orderId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: billingDocuments.id })
    .from(billingDocuments)
    .where(
      and(
        eq(billingDocuments.orderId, orderId),
        eq(billingDocuments.status, "pending"),
        sql`(${billingDocuments.attemptAt} IS NULL OR ${billingDocuments.attemptAt} < now() - make_interval(secs => ${CLAIM_SECONDS}))`,
      ),
    );
  return new Set(rows.map((r) => r.id));
}

// ---------------------------------------------------------------- rows

/** A pending הצעת מחיר or חשבון עסקה row for a quote version, or the one already there. Null when nothing is to issue. */
export async function prepareQuoteDocument(quoteId: string, kind: "quote" | "deal", actorId: string | null): Promise<string | null> {
  const cfg = morningConfig();
  if (!cfg) return null;
  const [q] = await db
    .select({ id: quotes.id, orderId: quotes.orderId, status: quotes.status, shippingIls: quotes.shippingIls, quoteNo: quotes.morningQuoteNo, dealNo: quotes.morningDealNo, number: teamOrders.number, teamId: teamOrders.teamId })
    .from(quotes)
    .innerJoin(teamOrders, eq(teamOrders.id, quotes.orderId))
    .where(eq(quotes.id, quoteId));
  if (!q) return null;
  const [existing] = await db.select({ id: billingDocuments.id }).from(billingDocuments).where(and(eq(billingDocuments.quoteId, quoteId), eq(billingDocuments.kind, kind)));
  if (existing) return existing.id;
  // Issued by hand already (its number typed in): nothing to add.
  if ((kind === "quote" && q.quoteNo) || (kind === "deal" && q.dealNo)) return null;
  if (kind === "deal" && q.status !== "approved") return null;

  const lines = await db
    .select({ qty: quoteLines.qty, unitPriceIls: quoteLines.unitPriceIls, title: teamOrderItems.title, options: teamOrderItems.options, supplierSku: teamOrderItems.supplierSku })
    .from(quoteLines)
    .innerJoin(teamOrderItems, eq(teamOrderItems.id, quoteLines.itemId))
    .where(eq(quoteLines.quoteId, quoteId))
    .orderBy(asc(teamOrderItems.supplierCode), asc(teamOrderItems.title));
  const id = randomUUID();
  const { payload, amount } = quotePayload({ kind, orderNumber: q.number, ref: docRef(id), lines, shippingIls: q.shippingIls });
  if (!(amount > 0)) return null;
  const [row] = await db
    .insert(billingDocuments)
    .values({ id, orderId: q.orderId, orderNumber: q.number, teamId: q.teamId, quoteId, kind, env: cfg.env, payload, amountIls: amount.toFixed(2), createdBy: actorId })
    .onConflictDoNothing()
    .returning({ id: billingDocuments.id });
  if (row) return row.id;
  const [raced] = await db.select({ id: billingDocuments.id }).from(billingDocuments).where(and(eq(billingDocuments.quoteId, quoteId), eq(billingDocuments.kind, kind)));
  return raced?.id ?? null;
}

/**
 * The pending חשבונית מס/קבלה row for a payment, written in the payment's own transaction, linked
 * to the order's issued חשבון עסקה when there is one.
 */
export async function prepareReceipt(
  tx: Tx,
  p: { paymentId: string; orderId: string | null; teamId: string; amount: number; paidAt: string; method: PaymentMethod; reference: string | null; cheque: ChequeDetails | null; actorId: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const cfg = morningConfig();
  if (!cfg) return { ok: false, error: "חשבונית ירוקה לא מחוברת" };
  let orderNumber: number | null = null;
  let deal: { morningId: string; income: IncomeRow[] } | null = null;
  if (p.orderId) {
    const [order] = await tx.select({ number: teamOrders.number }).from(teamOrders).where(eq(teamOrders.id, p.orderId));
    orderNumber = order?.number ?? null;
    const [d] = await tx
      .select({ morningId: billingDocuments.morningId, payload: billingDocuments.payload })
      .from(billingDocuments)
      .where(and(eq(billingDocuments.orderId, p.orderId), eq(billingDocuments.kind, "deal"), eq(billingDocuments.status, "issued"), eq(billingDocuments.env, cfg.env)))
      .orderBy(desc(billingDocuments.createdAt))
      .limit(1);
    if (d?.morningId) deal = { morningId: d.morningId, income: (d.payload as DocumentPayload).income };
  }
  const id = randomUUID();
  const built = receiptPayload({ orderNumber, ref: docRef(id), amount: p.amount, paidAt: p.paidAt, method: p.method, reference: p.reference, cheque: p.cheque, deal });
  if (!built.ok) return built;
  await tx.insert(billingDocuments).values({
    id,
    orderId: p.orderId,
    orderNumber,
    teamId: p.teamId,
    paymentId: p.paymentId,
    kind: "invoice_receipt",
    env: cfg.env,
    payload: built.payload,
    amountIls: built.amount.toFixed(2),
    createdBy: p.actorId,
  });
  return { ok: true, id };
}

/** A pending חשבונית זיכוי row against an issued חשבונית מס/קבלה. */
export async function prepareCredit(originalId: string, amount: number, reason: string, actorId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const cfg = morningConfig();
  if (!cfg) return { ok: false, error: "חשבונית ירוקה לא מחוברת" };
  return db.transaction(async (tx) => {
    const [original] = await tx.select().from(billingDocuments).where(eq(billingDocuments.id, originalId)).for("update");
    if (!original || original.status !== "issued" || !original.number || !original.morningId) return { ok: false as const, error: "המסמך לא נמצא או שעוד לא הופק" };
    if (original.env !== cfg.env) return { ok: false as const, error: "המסמך הופק בחשבון חשבונית ירוקה אחר" };
    const credits = await tx.select().from(billingDocuments).where(eq(billingDocuments.creditsId, original.id));
    const remaining = creditRemaining(asIssued(original), [asIssued(original), ...credits.map(asIssued)]);
    const id = randomUUID();
    const built = creditPayload({
      original: { kind: original.kind, number: original.number, morningId: original.morningId, amount: Number(original.amountIls) },
      remaining,
      amount,
      reason,
      orderNumber: original.orderNumber,
      ref: docRef(id),
    });
    if (!built.ok) return built;
    await tx.insert(billingDocuments).values({
      id,
      orderId: original.orderId,
      orderNumber: original.orderNumber,
      teamId: original.teamId,
      paymentId: original.paymentId,
      creditsId: original.id,
      kind: "credit",
      env: cfg.env,
      payload: built.payload,
      amountIls: built.amount.toFixed(2),
      createdBy: actorId,
    });
    return { ok: true as const, id };
  });
}

// ---------------------------------------------------------------- the team's client

/**
 * The team's Morning client: the linked one; else, when Morning has clients that may be this
 * team, a refusal that asks the admin to link (D4); else a new client, linked from now on.
 */
async function resolveClient(teamId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return { ok: false, error: "הקבוצה לא נמצאה" };
  if (team.morningClientId) return { ok: true, id: team.morningClientId };
  const party = billingParty(team);
  const words = [...new Set([...nameWords(party.name), ...nameWords(team.name)])];
  const candidates = clientSuggestions(team, await findMorningClients(words, party.email));
  if (candidates.length) {
    const names = candidates.map((c) => c.name).join(", ");
    return { ok: false, error: `בחשבונית ירוקה יש לקוחות שאולי הם הקבוצה (${names}). מקשרים את הקבוצה ללקוח בדף הקבוצה, ואז ״ניסיון חוזר״.` };
  }
  const id = await createMorningClient(newClientBody(team));
  const [linked] = await db
    .update(teams)
    .set({ morningClientId: id })
    .where(and(eq(teams.id, teamId), isNull(teams.morningClientId)))
    .returning({ id: teams.morningClientId });
  await db.insert(auditLog).values({ actorId: null, entity: "team", entityId: teamId, action: "morning_client_create", after: { morningClientId: id } });
  if (linked?.id) return { ok: true, id: linked.id };
  const [again] = await db.select({ id: teams.morningClientId }).from(teams).where(eq(teams.id, teamId));
  return again?.id ? { ok: true, id: again.id } : { ok: false, error: "קישור הלקוח נכשל" };
}

// ---------------------------------------------------------------- issuing

/** The document a row's reference is on, if Morning has one (after a timeout or a crash). */
async function lookUp(row: DocumentRow): Promise<CreatedDocument | null> {
  const from = israelToday(new Date(row.createdAt.getTime() - 24 * 3600 * 1000));
  const found = findByRef(await searchMorningDocuments(DOC_TYPE[row.kind], from), docRef(row.id));
  return found ? { id: found.id, number: found.number } : null;
}

export type IssueResult = { ok: true; kind: MorningKind; number: string } | { ok: false; error: string };

async function markIssued(row: DocumentRow, doc: CreatedDocument): Promise<IssueResult> {
  const number = String(doc.number);
  const [done] = await db
    .update(billingDocuments)
    .set({
      status: "issued",
      morningId: doc.id,
      number,
      issuedAt: new Date(),
      pdfUrlHe: doc.url?.he ?? doc.url?.origin ?? null,
      pdfUrlEn: doc.url?.en ?? null,
      error: null,
    })
    .where(and(eq(billingDocuments.id, row.id), inArray(billingDocuments.status, ["pending", "failed"])))
    .returning();
  if (!done) return { ok: true, kind: row.kind, number };
  // The numbers the admin used to type: filled once, the same on both paths.
  if (row.kind === "quote" && row.quoteId) await db.update(quotes).set({ morningQuoteNo: number }).where(and(eq(quotes.id, row.quoteId), isNull(quotes.morningQuoteNo)));
  if (row.kind === "deal" && row.quoteId) await db.update(quotes).set({ morningDealNo: number }).where(and(eq(quotes.id, row.quoteId), isNull(quotes.morningDealNo)));
  if (row.kind === "invoice_receipt" && row.paymentId)
    await db
      .update(payments)
      .set({ documentId: row.id, morningDocNo: sql`coalesce(${payments.morningDocNo}, ${number})` })
      .where(eq(payments.id, row.paymentId));
  await db.insert(auditLog).values({
    actorId: row.createdBy,
    entity: "billing_document",
    entityId: row.id,
    action: "issue",
    after: { orderId: row.orderId, kind: row.kind, number, amountIls: Number(row.amountIls), env: row.env },
  });
  await recordMorning(true, { action: "issue", kind: row.kind, number });
  return { ok: true, kind: row.kind, number };
}

async function markFailed(row: DocumentRow, error: string): Promise<IssueResult> {
  await db.update(billingDocuments).set({ status: "failed", error: error.slice(0, 500) }).where(and(eq(billingDocuments.id, row.id), eq(billingDocuments.status, "pending")));
  await db.insert(auditLog).values({ actorId: row.createdBy, entity: "billing_document", entityId: row.id, action: "fail", after: { orderId: row.orderId, kind: row.kind, error: error.slice(0, 300) } });
  await recordMorning(false, { action: "issue", kind: row.kind, error: error.slice(0, 300) });
  return { ok: false, error };
}

/** One attempt at a row: claim, look up (if an attempt came before), resolve the client, issue. */
export async function issueDocument(rowId: string): Promise<IssueResult> {
  const cfg = morningConfig();
  if (!cfg) return { ok: false, error: "חשבונית ירוקה לא מחוברת" };
  const [row] = await db
    .update(billingDocuments)
    .set({ status: "pending", attempts: sql`${billingDocuments.attempts} + 1`, attemptAt: new Date(), error: null })
    .where(
      and(
        eq(billingDocuments.id, rowId),
        inArray(billingDocuments.status, ["pending", "failed"]),
        sql`(${billingDocuments.attemptAt} IS NULL OR ${billingDocuments.attemptAt} < now() - make_interval(secs => ${CLAIM_SECONDS}))`,
      ),
    )
    .returning();
  if (!row) {
    const [now] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, rowId));
    if (now?.status === "issued") return { ok: true, kind: now.kind, number: now.number! };
    return { ok: false, error: now ? "המסמך כבר בהפקה. נסו שוב בעוד שתי דקות." : "המסמך לא נמצא" };
  }
  if (row.env !== cfg.env) return markFailed(row, `המסמך נוצר לחשבון ה-${row.env}, והאתר מחובר עכשיו ל-${cfg.env}`);

  try {
    // An earlier attempt may have reached Morning: look before sending again.
    if (row.attempts > 1) {
      const found = await lookUp(row);
      if (found) return markIssued(row, found);
    }
    const client = await resolveClient(row.teamId);
    if (!client.ok) return markFailed(row, client.error);
    try {
      return await markIssued(row, await createMorningDocument({ ...(row.payload as DocumentPayload), client: { id: client.id } }));
    } catch (error) {
      if (!(error instanceof MorningError) || !error.uncertain) throw error;
      // No answer: it may have been issued. Look, once, before calling it failed.
      await new Promise((r) => setTimeout(r, 2000));
      const found = await lookUp(row).catch(() => null);
      if (found) return markIssued(row, found);
      throw error;
    }
  } catch (error) {
    return markFailed(row, error instanceof Error ? error.message : "שגיאה");
  }
}

/** "רישום תשלום" and "הפקת זיכוי" wait for their document; the toast says how it went. */
export function issueResultText(r: IssueResult): string {
  return r.ok ? `הופקה ${KIND_LABEL[r.kind]} ${r.number} בחשבונית ירוקה` : `המסמך בחשבונית ירוקה לא הופק: ${r.error}`;
}

// ---------------------------------------------------------------- after the response

function refresh(orderId: string | null) {
  try {
    revalidatePath("/admin");
    revalidatePath("/orders");
    if (orderId) revalidatePath(`/orders/${orderId}`);
  } catch {
    // Outside a request (a test or a script): nothing to refresh.
  }
}

/** Runs a Morning step after the response, so a slow Morning never slows the page. Never throws. */
export function morningLater(task: () => Promise<unknown>) {
  if (!morningConfig()) return;
  after(async () => {
    try {
      await task();
    } catch (error) {
      console.error("[morning] failed", error);
    }
  });
}

/** Quote sent: its הצעת מחיר, when the step is on. */
export function quoteDocumentLater(quoteId: string, actorId: string) {
  morningLater(async () => {
    if (!(await morningStepOn("quote"))) return;
    const id = await prepareQuoteDocument(quoteId, "quote", actorId);
    if (!id) return;
    await issueDocument(id);
    refresh(null);
  });
}

/** Quote approved: its חשבון עסקה, once the team's undo window has closed and the approval stands. */
export function dealDocumentLater(quoteId: string, actorId: string) {
  morningLater(async () => {
    await new Promise((r) => setTimeout(r, (UNDO_SECONDS + 2) * 1000));
    const [q] = await db.select({ status: quotes.status, orderId: quotes.orderId }).from(quotes).where(eq(quotes.id, quoteId));
    if (q?.status !== "approved" || !(await morningStepOn("deal"))) return;
    const id = await prepareQuoteDocument(quoteId, "deal", actorId);
    if (id) await issueDocument(id);
    refresh(q.orderId);
  });
}

/** The team's documents on /orders/<id>: the issued ones, oldest first. */
export async function teamDocuments(orderId: string) {
  const rows = await db
    .select({ id: billingDocuments.id, kind: billingDocuments.kind, number: billingDocuments.number, issuedAt: billingDocuments.issuedAt, amountIls: billingDocuments.amountIls, pdfUrlHe: billingDocuments.pdfUrlHe, pdfUrlEn: billingDocuments.pdfUrlEn, env: billingDocuments.env })
    .from(billingDocuments)
    .where(and(eq(billingDocuments.orderId, orderId), eq(billingDocuments.status, "issued")))
    .orderBy(asc(billingDocuments.issuedAt));
  return rows.map((r) => ({ ...r, amount: Number(r.amountIls), label: `${KIND_LABEL[r.kind]} ${r.number}`, money: formatIls(Number(r.amountIls), { agorot: true }) }));
}
