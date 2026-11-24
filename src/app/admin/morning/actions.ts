"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionState } from "@/components/action-form";
import { newClientBody, parseBilling, parseCheque } from "@/domain/morning";
import { morningStepsSchema } from "@/domain/settings";
import { requireAdmin } from "@/lib/auth";
import { createMorningClient, getMorningClient, morningConfig, testMorningConnection } from "@/lib/morning";
import { issueDocument, issueResultText, morningStepOn, prepareCredit, prepareQuoteDocument, prepareReceipt } from "@/lib/morning-documents";
import { currentSettings, writeSettings } from "@/lib/settings-write";

/**
 * The admin's Morning (חשבונית ירוקה) controls (P2/P3): the connection test and the steps on the
 * system page, issuing or retrying a document on the order card, credit notes, and linking a
 * team to its Morning client. Each refuses while Morning has no keys.
 */

const { auditLog, billingDocuments, payments, teams } = schema;

const OFF = { error: "חשבונית ירוקה לא מחוברת" };

function refreshOrder(orderId: string | null, teamId?: string | null) {
  revalidatePath("/admin");
  revalidatePath("/orders");
  if (orderId) revalidatePath(`/orders/${orderId}`);
  if (teamId) revalidatePath(`/admin/teams/${teamId}`);
}

/** "בדיקת חיבור". */
export async function testMorning(): Promise<ActionState> {
  await requireAdmin();
  if (!morningConfig()) return OFF;
  const r = await testMorningConnection();
  revalidatePath("/admin/settings/system");
  return r.ok ? { ok: `מחובר לעסק ״${r.business.name}״` } : { error: `החיבור נכשל: ${r.error}` };
}

/** Which documents the site issues by itself. */
export async function saveMorningSteps(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const steps = morningStepsSchema.parse({
    quote: formData.get("quote") === "on",
    deal: formData.get("deal") === "on",
    receipt: formData.get("receipt") === "on",
    credit: formData.get("credit") === "on",
  });
  const before = await currentSettings();
  await writeSettings(admin.id, "morning_steps", before, { ...before, morning: steps });
  revalidatePath("/admin/settings/system");
  return { ok: "נשמר" };
}

/** "הפקת הצעת מחיר" / "הפקת חשבון עסקה" for a quote version that has none. */
export async function issueQuoteDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!morningConfig()) return OFF;
  const parsed = z.object({ quoteId: z.uuid(), kind: z.enum(["quote", "deal"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "ההצעה לא נמצאה" };
  const id = await prepareQuoteDocument(parsed.data.quoteId, parsed.data.kind, admin.id);
  if (!id) return { error: parsed.data.kind === "deal" ? "אין הצעה מאושרת להפיק ממנה חשבון עסקה" : "אין מה להפיק (או שהמספר כבר הוקלד ידנית)" };
  const r = await issueDocument(id);
  const [row] = await db.select({ orderId: billingDocuments.orderId }).from(billingDocuments).where(eq(billingDocuments.id, id));
  refreshOrder(row?.orderId ?? null);
  return r.ok ? { ok: issueResultText(r) } : { error: issueResultText(r) };
}

/** "הפקת חשבונית" for a recorded payment that has no document yet. */
export async function issuePaymentDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!(await morningStepOn("invoice_receipt"))) return OFF;
  const paymentId = z.uuid().safeParse(formData.get("paymentId"));
  if (!paymentId.success) return { error: "התשלום לא נמצא" };
  const cheque = parseCheque({ bankName: formData.get("bankName"), bankBranch: formData.get("bankBranch"), bankAccount: formData.get("bankAccount") });

  const prepared = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId.data)).for("update");
    if (!p || p.voidedAt) return { ok: false as const, error: "התשלום לא נמצא או שבוטל" };
    if (p.morningDocNo && !p.documentId) return { ok: false as const, error: "לתשלום כבר הוקלד מספר חשבונית" };
    const [existing] = await tx
      .select({ id: billingDocuments.id, status: billingDocuments.status })
      .from(billingDocuments)
      .where(and(eq(billingDocuments.paymentId, p.id), eq(billingDocuments.kind, "invoice_receipt")));
    if (existing) return existing.status === "issued" ? { ok: false as const, error: "לתשלום כבר יש חשבונית" } : { ok: true as const, id: existing.id, orderId: p.orderId, teamId: p.teamId };
    const r = await prepareReceipt(tx, {
      paymentId: p.id,
      orderId: p.orderId,
      teamId: p.teamId,
      amount: Number(p.amountIls),
      paidAt: p.paidAt,
      method: p.method,
      reference: p.reference,
      cheque,
      actorId: admin.id,
    });
    return r.ok ? { ...r, orderId: p.orderId, teamId: p.teamId } : r;
  });
  if (!prepared.ok) return { error: prepared.error };
  const r = await issueDocument(prepared.id);
  refreshOrder(prepared.orderId, prepared.teamId);
  return r.ok ? { ok: issueResultText(r) } : { error: issueResultText(r) };
}

/** "ניסיון חוזר" on a failed (or stuck) document: the same row, looked up in Morning first. */
export async function retryDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  if (!morningConfig()) return OFF;
  const id = z.uuid().safeParse(formData.get("documentId"));
  if (!id.success) return { error: "המסמך לא נמצא" };
  const r = await issueDocument(id.data);
  const [row] = await db.select({ orderId: billingDocuments.orderId, teamId: billingDocuments.teamId }).from(billingDocuments).where(eq(billingDocuments.id, id.data));
  refreshOrder(row?.orderId ?? null, row?.teamId);
  return r.ok ? { ok: issueResultText(r) } : { error: issueResultText(r) };
}

/** "הפקת זיכוי": a חשבונית זיכוי for some or all of a חשבונית מס/קבלה. */
export async function issueCredit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!(await morningStepOn("credit"))) return OFF;
  const parsed = z
    .object({ documentId: z.uuid(), amount: z.string().trim().transform((s) => Number(s.replace(/[,\s₪]/g, ""))), reason: z.string().trim().max(300) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success || !Number.isFinite(parsed.data.amount)) return { error: "סכום לא תקין" };
  const prepared = await prepareCredit(parsed.data.documentId, parsed.data.amount, parsed.data.reason, admin.id);
  if (!prepared.ok) return { error: prepared.error };
  const r = await issueDocument(prepared.id);
  const [row] = await db.select({ orderId: billingDocuments.orderId, teamId: billingDocuments.teamId }).from(billingDocuments).where(eq(billingDocuments.id, prepared.id));
  refreshOrder(row?.orderId ?? null, row?.teamId);
  return r.ok ? { ok: issueResultText(r) } : { error: issueResultText(r) };
}

async function setClient(adminId: string, teamId: string, clientId: string | null, action: string) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ id: teams.morningClientId }).from(teams).where(eq(teams.id, teamId)).for("update");
    await tx.update(teams).set({ morningClientId: clientId }).where(eq(teams.id, teamId));
    await tx.insert(auditLog).values({ actorId: adminId, entity: "team", entityId: teamId, action, before: { morningClientId: before?.id ?? null }, after: { morningClientId: clientId } });
  });
  revalidatePath(`/admin/teams/${teamId}`);
}

/** D4: links a team to the Morning client the admin picked from the suggestions. */
export async function linkMorningClient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!morningConfig()) return OFF;
  const parsed = z.object({ teamId: z.uuid(), clientId: z.string().trim().min(1).max(64) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "הלקוח לא נמצא" };
  const client = await getMorningClient(parsed.data.clientId).catch(() => null);
  if (!client) return { error: "הלקוח לא נמצא בחשבונית ירוקה" };
  await setClient(admin.id, parsed.data.teamId, client.id, "morning_client_link");
  return { ok: `הקבוצה קושרה ללקוח ״${client.name}״` };
}

/** A new Morning client for the team, from its billing details (the admin's choice when no suggestion fits). */
export async function createTeamMorningClient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!morningConfig()) return OFF;
  const teamId = z.uuid().safeParse(formData.get("teamId"));
  if (!teamId.success) return { error: "הקבוצה לא נמצאה" };
  const [team] = await db.select().from(teams).where(and(eq(teams.id, teamId.data), isNull(teams.morningClientId)));
  if (!team) return { error: "הקבוצה כבר מקושרת ללקוח" };
  try {
    const id = await createMorningClient(newClientBody(team));
    await setClient(admin.id, team.id, id, "morning_client_create");
    return { ok: "נוצר לקוח חדש בחשבונית ירוקה" };
  } catch (error) {
    return { error: `יצירת הלקוח נכשלה: ${error instanceof Error ? error.message : "שגיאה"}` };
  }
}

export async function unlinkMorningClient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const teamId = z.uuid().safeParse(formData.get("teamId"));
  if (!teamId.success) return { error: "הקבוצה לא נמצאה" };
  await setClient(admin.id, teamId.data, null, "morning_client_unlink");
  return { ok: "הקישור הוסר" };
}

/** The admin edits a team's "פרטי חיוב". */
export async function saveTeamBilling(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const teamId = z.uuid().safeParse(formData.get("teamId"));
  if (!teamId.success) return { error: "הקבוצה לא נמצאה" };
  const parsed = parseBilling(Object.fromEntries(formData));
  if (!parsed.ok) return { error: parsed.error };
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(teams).where(eq(teams.id, teamId.data)).for("update");
    if (!before) return;
    await tx.update(teams).set(parsed.value).where(eq(teams.id, teamId.data));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "team",
      entityId: teamId.data,
      action: "update_billing",
      before: { billingName: before.billingName, billingTaxId: before.billingTaxId, billingEmail: before.billingEmail, billingAddress: before.billingAddress },
      after: parsed.value,
    });
  });
  revalidatePath(`/admin/teams/${teamId.data}`);
  return { ok: "פרטי החיוב נשמרו" };
}
